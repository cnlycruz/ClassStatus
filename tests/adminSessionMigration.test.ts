import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

const migrations = path.join(process.cwd(), "supabase", "migrations");
const baseSql = fs.readFileSync(path.join(migrations, "20260823065312_classstatus_durable_state.sql"), "utf8");
const runtimeSql = fs.readFileSync(path.join(migrations, "20260825203903_add_production_runtime_security_support.sql"), "utf8");
const adminId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const otherSessionId = "33333333-3333-4333-8333-333333333333";
const csrfDigest = "a".repeat(64);
const loginDigest = "b".repeat(64);
const remediationSql = fs.readFileSync(path.join(migrations, "20260905161059_prevent_admin_session_reactivation.sql"), "utf8");
const databases: PGlite[] = [];

function extractFunction(sql: string, name: string): string {
  const escaped = name.replaceAll(".", "\\.");
  const match = sql.match(new RegExp(`create (?:or replace )?function ${escaped}\\([\\s\\S]*?\\n\\$\\$;`, "i"));
  if (!match) throw new Error(`Missing migration function: ${name}`);
  return match[0];
}

async function fixture(): Promise<PGlite> {
  const db = new PGlite();
  databases.push(db);
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key, user_id uuid not null, created_at timestamptz not null default clock_timestamp(), not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    insert into auth.users values ('${adminId}');
    insert into auth.sessions(id,user_id) values ('${sessionId}','${adminId}');
  `);
  await db.exec(baseSql);
  await db.exec(fs.readFileSync(path.join(migrations, "20260823065639_harden_function_privileges.sql"), "utf8"));
  await db.exec(extractFunction(runtimeSql, "classstatus_private.resolve_admin_actor"));
  await db.exec(extractFunction(runtimeSql, "public.classstatus_production_admin_snapshot"));
  // The later Production runtime migration explicitly exposes these exact
  // existing signatures to authenticated callers; use its current grants.
  for (const operation of ["start_admin_session", "touch_admin_session", "revoke_admin_session"]) {
    const grant = runtimeSql.match(new RegExp(`grant execute on function public.classstatus_production_${operation}\\([^;]+;`));
    if (!grant) throw new Error("Missing production session grant");
    await db.exec(grant[0]);
  }
  await db.exec("revoke execute on function public.classstatus_production_admin_snapshot() from public, anon, authenticated, service_role; grant execute on function public.classstatus_production_admin_snapshot() to authenticated;");
  await db.exec(`insert into public.classstatus_admin_principals(deployment_namespace,user_id) values ('preview','${adminId}'),('production','${adminId}');`);
  return db;
}

async function rpc(db: PGlite, operation: string, args: string = "", currentSessionId = sessionId, namespace = "production") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: adminId, session_id: currentSessionId, role: "authenticated" })]);
  await db.exec("set role authenticated");
  try { return await db.query(`select public.classstatus_${namespace}_${operation}(${args}) as result`); }
  finally { await db.exec("reset role"); }
}

const startArgs = `'${csrfDigest}','${loginDigest}'`;

afterEach(async () => { await Promise.all(databases.splice(0).map((db) => db.close())); });

describe("admin session database replay boundary", () => {
  it("demonstrates the historical direct-RPC logout bypass with an existing admin JWT", async () => {
    const db = await fixture();
    await rpc(db, "start_admin_session", startArgs);
    await rpc(db, "revoke_admin_session");
    await db.exec(`delete from auth.sessions where id='${sessionId}'`);
    await expect(rpc(db, "touch_admin_session", "false")).rejects.toThrow("classstatus:session-invalid");
    await rpc(db, "start_admin_session", startArgs);
    const result = await rpc(db, "touch_admin_session", "false");
    expect(result.rows[0]).toMatchObject({ result: { sessionId } });
  });

  it("rejects the same JWT at every session boundary after successful Auth sign-out", async () => {
    const db = await fixture();
    await db.exec(remediationSql);
    await rpc(db, "start_admin_session", startArgs);
    await rpc(db, "revoke_admin_session");
    await db.exec(`delete from auth.sessions where id='${sessionId}'`);
    for (const [operation, args] of [["start_admin_session", startArgs], ["touch_admin_session", "true"], ["revoke_admin_session", ""]]) {
      await expect(rpc(db, operation, args)).rejects.toThrow("classstatus:session-invalid");
    }
    await expect(rpc(db, "admin_snapshot")).rejects.toThrow("classstatus:session-invalid");
    // Application logout also closes its guard if the external sign-out failed.
    await db.exec(`insert into auth.sessions(id,user_id) values ('${sessionId}','${adminId}')`);
    await expect(rpc(db, "start_admin_session", startArgs)).rejects.toThrow("classstatus:session-invalid");
  });

  it.each(["preview", "production"])("keeps a valid %s start retry idempotent and prevents expiry/CSRF reset", async (namespace) => {
    const db = await fixture();
    await db.exec(remediationSql);
    const initial = await rpc(db, "start_admin_session", startArgs, sessionId, namespace);
    const repeated = await rpc(db, "start_admin_session", startArgs, sessionId, namespace);
    expect(repeated.rows).toEqual(initial.rows);
    await expect(rpc(db, "start_admin_session", `'${"c".repeat(64)}','${loginDigest}'`, sessionId, namespace)).rejects.toThrow("classstatus:session-invalid");
    await db.query("update public.classstatus_admin_session_guards set last_seen_at=clock_timestamp()-interval '31 minutes' where deployment_namespace=$1", [namespace]);
    await expect(rpc(db, "start_admin_session", startArgs, sessionId, namespace)).rejects.toThrow("classstatus:session-invalid");
  });

  it("rejects absolute expiry and permits a newly authenticated replacement without reviving the older session", async () => {
    const db = await fixture();
    await db.exec(remediationSql);
    await rpc(db, "start_admin_session", startArgs);
    await db.exec("update public.classstatus_admin_session_guards set created_at=clock_timestamp()-interval '9 hours', absolute_expires_at=clock_timestamp()-interval '1 hour'");
    await expect(rpc(db, "start_admin_session", startArgs)).rejects.toThrow("classstatus:session-invalid");
    await db.exec(`insert into auth.sessions(id,user_id) values ('${otherSessionId}','${adminId}')`);
    await expect(rpc(db, "start_admin_session", startArgs, otherSessionId)).resolves.toBeDefined();
    await expect(rpc(db, "start_admin_session", startArgs)).rejects.toThrow("classstatus:session-invalid");
    await expect(rpc(db, "touch_admin_session", "false")).rejects.toThrow("classstatus:session-invalid");
    await expect(rpc(db, "touch_admin_session", "false", otherSessionId)).resolves.toBeDefined();
  });

  it("serializes competing starts so an older session cannot win a replay race", async () => {
    const db = await fixture();
    await db.exec(remediationSql);
    await rpc(db, "start_admin_session", startArgs);
    await db.exec(`insert into auth.sessions(id,user_id,created_at) values ('${otherSessionId}','${adminId}',clock_timestamp()+interval '1 second')`);
    const attempts = await Promise.allSettled([
      rpc(db, "start_admin_session", startArgs),
      rpc(db, "start_admin_session", startArgs, otherSessionId),
    ]);
    expect(attempts.some((attempt) => attempt.status === "fulfilled")).toBe(true);
    await expect(rpc(db, "touch_admin_session", "false", otherSessionId)).resolves.toBeDefined();
    await expect(rpc(db, "start_admin_session", startArgs)).rejects.toThrow("classstatus:session-invalid");
  });

  it("rejects missing, wrong-owner, expired Auth sessions and disabled principals", async () => {
    const db = await fixture();
    await db.exec(remediationSql);
    await expect(rpc(db, "start_admin_session", startArgs, otherSessionId)).rejects.toThrow("classstatus:session-invalid");
    await db.exec(`update auth.sessions set user_id='${otherSessionId}'`);
    await expect(rpc(db, "start_admin_session", startArgs)).rejects.toThrow("classstatus:session-invalid");
    await db.exec(`update auth.sessions set user_id='${adminId}',not_after=clock_timestamp()-interval '1 second'`);
    await expect(rpc(db, "start_admin_session", startArgs)).rejects.toThrow("classstatus:session-invalid");
    await db.exec("update auth.sessions set not_after=null; update public.classstatus_admin_principals set enabled=false");
    await expect(rpc(db, "start_admin_session", startArgs)).rejects.toThrow("classstatus:forbidden");
  });

  it("preserves deny-by-default table/private-function access and anonymous session RPC denial", async () => {
    const db = await fixture();
    await db.exec(remediationSql);
    const result = await db.query(`select
      has_table_privilege('authenticated','public.classstatus_admin_session_guards','select') as table_read,
      has_function_privilege('authenticated','classstatus_private.start_admin_session(text,text,text)','execute') as private_start,
      has_function_privilege('anon','public.classstatus_production_start_admin_session(text,text)','execute') as anon_start`);
    expect(result.rows[0]).toEqual({ table_read: false, private_start: false, anon_start: false });
  });
});
