import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
async function operation(namespace: "preview" | "production", payload: Record<string, unknown>) {
  await db.query("select set_config('classstatus.notification_worker', $1, false)", [namespace]);
  return (await db.query<{ result: unknown }>("select classstatus_private.notification_store($1, $2::jsonb) as result", [namespace, JSON.stringify(payload)])).rows[0].result;
}
const now = "2026-09-06T00:00:00Z";
async function pending(namespace: "preview" | "production", suffix: string) {
  const subscriptionId = randomUUID(); const eventId = randomUUID(); const deliveryId = randomUUID();
  await db.query("insert into public.classstatus_push_subscriptions(subscription_id,deployment_namespace,endpoint,p256dh,auth,lgu_ids) values($1,$2,$3,$4,$5,array['manila'])", [subscriptionId, namespace, `https://fcm.googleapis.com/fcm/send/${suffix}`, "a".repeat(32), "b".repeat(16)]);
  await db.query("insert into public.classstatus_notification_events(event_id,deployment_namespace,fingerprint,family_fingerprint,kind,record) values($1,$2,$3,$4,'initial','{}')", [eventId, namespace, `v1:${suffix.padStart(64, "0")}`, `v1f:${suffix.padStart(64, "0")}`]);
  await db.query("insert into public.classstatus_notification_deliveries(delivery_id,event_id,subscription_id,state,next_attempt_at) values($1,$2,$3,'pending',$4)", [deliveryId, eventId, subscriptionId, namespace === "preview" ? "2026-09-05T00:00:00Z" : now]);
  return { deliveryId, subscriptionId };
}

describe("notification namespace security in executable SQL", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec("create schema classstatus_private; create role anon; create role authenticated; create role service_role;");
    for (const file of ["20260905100000_add_web_push_notifications.sql", "20260905101500_add_manual_admin_broadcasts.sql", "20260905110000_add_manual_notification_pending_event_fields.sql"]) {
      await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8"));
    }
    await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260905161120_harden_notification_namespace.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260914090000_rate_limit_push_registration.sql"), "utf8"));
  }, 30_000);
  beforeEach(async () => { await db.exec("truncate public.classstatus_push_subscriptions, public.classstatus_notification_events, public.classstatus_notification_deliveries, public.classstatus_push_registration_limits cascade;"); });
  afterAll(async () => { await db?.close(); });

  it("selects a production batch before applying the limit to preview backlog", async () => {
    await pending("preview", "1"); const production = await pending("production", "2");
    const deliveries = await operation("production", { operation: "list-pending", now, limit: 1 });
    expect(deliveries).toEqual([expect.objectContaining({ delivery: expect.objectContaining({ id: production.deliveryId }) })]);
  });

  it("cannot mark a production delivery complete with a preview capability", async () => {
    const production = await pending("production", "2");
    await operation("preview", { operation: "record-delivery", id: production.deliveryId, update: { state: "delivered", attempts: 1, nextAttemptAt: now, deliveredAt: now } });
    const state = (await db.query<{ state: string }>("select state from public.classstatus_notification_deliveries where delivery_id=$1", [production.deliveryId])).rows[0].state;
    expect(state).toBe("pending");
  });

  it("excludes inactive subscription backlog before the batch limit", async () => {
    const inactive = await pending("production", "1"); const active = await pending("production", "2");
    await db.query("update public.classstatus_notification_deliveries set next_attempt_at='2026-09-05' where delivery_id=$1", [inactive.deliveryId]);
    await db.query("update public.classstatus_push_subscriptions set active=false where subscription_id=$1", [inactive.subscriptionId]);
    expect(await operation("production", { operation: "list-pending", now, limit: 1 })).toEqual([expect.objectContaining({ delivery: expect.objectContaining({ id: active.deliveryId }) })]);
  });

  it("still records authorized delivery completion within its namespace", async () => {
    const production = await pending("production", "2");
    await operation("production", { operation: "record-delivery", id: production.deliveryId, update: { state: "delivered", attempts: 1, nextAttemptAt: now, deliveredAt: now } });
    expect(await operation("production", { operation: "list-pending", now, limit: 1 })).toEqual([]);
  });

  it("rejects absent worker context instead of treating SQL NULL as authorization", async () => {
    await db.query("select set_config('classstatus.notification_worker', '', false)");
    await expect(db.query("select classstatus_private.notification_store('production', '{}'::jsonb)")).rejects.toThrow("notification-proof-invalid");
    await expect(db.query("select classstatus_private.notification_store(NULL, '{}'::jsonb)")).rejects.toThrow("notification-proof-invalid");
  });

  it("enforces subscription destination, key, and LGU shape at the database storage boundary", async () => {
    const valid = { operation: "save-subscription", endpoint: "https://fcm.googleapis.com/fcm/send/database-fixture", p256dh: "A".repeat(87), auth: "B".repeat(22), lguIds: ["manila"], now };
    await expect(operation("production", valid)).resolves.toMatchObject({ id: expect.any(String) });
    for (const invalid of [
      { ...valid, endpoint: "https://attacker.example/receive" },
      { ...valid, p256dh: "A".repeat(86) },
      { ...valid, auth: "B".repeat(23) },
      { ...valid, lguIds: ["not-an-ncr-lgu"] },
      { ...valid, unexpected: true },
    ]) {
      await expect(operation("production", invalid)).rejects.toThrow("notification-payload-invalid");
    }
  });

  it("does not grant anonymous access to the private notification function or tables", async () => {
    const result = await db.query<{ function_execute: boolean; table_select: boolean; table_insert: boolean }>("select has_function_privilege('anon', 'classstatus_private.notification_store(text,jsonb)', 'execute') as function_execute, has_table_privilege('anon', 'public.classstatus_push_subscriptions', 'select') as table_select, has_table_privilege('anon', 'public.classstatus_push_subscriptions', 'insert') as table_insert");
    expect(result.rows[0]).toEqual({ function_execute: false, table_select: false, table_insert: false });
  });

  it("atomically limits distinct registrations while allowing ordinary duplicates", async () => {
    await db.query("select set_config('classstatus.notification_registration_worker', 'production', false)");
    const base = { p256dh: "A".repeat(87), auth: "B".repeat(22), lguIds: ["manila"], identityHash: "c".repeat(64) };
    for (let index = 0; index < 30; index += 1) {
      const result = (await db.query<{ result: { rateLimited: boolean } }>(
        "select classstatus_private.register_push_subscription('production', $1::jsonb) as result",
        [JSON.stringify({ ...base, endpoint: `https://fcm.googleapis.com/fcm/send/rate-${index}` })]
      )).rows[0].result;
      expect(result.rateLimited).toBe(false);
    }
    for (let retry = 0; retry < 2; retry += 1) {
      const result = (await db.query<{ result: { rateLimited: boolean; retryAfter: number } }>(
        "select classstatus_private.register_push_subscription('production', $1::jsonb) as result",
        [JSON.stringify({ ...base, endpoint: "https://fcm.googleapis.com/fcm/send/rate-blocked" })]
      )).rows[0].result;
      expect(result).toMatchObject({ rateLimited: true, retryAfter: expect.any(Number) });
    }
    const duplicate = (await db.query<{ result: { rateLimited: boolean } }>(
      "select classstatus_private.register_push_subscription('production', $1::jsonb) as result",
      [JSON.stringify({ ...base, endpoint: "https://fcm.googleapis.com/fcm/send/rate-0" })]
    )).rows[0].result;
    expect(duplicate.rateLimited).toBe(false);
  });

  it("cannot bypass a burst limit with concurrent distinct registrations", async () => {
    await db.query("select set_config('classstatus.notification_registration_worker', 'production', false)");
    const base = { p256dh: "A".repeat(87), auth: "B".repeat(22), lguIds: ["manila"], identityHash: "d".repeat(64) };
    const results = await Promise.all(Array.from({ length: 40 }, async (_, index) => (
      await db.query<{ result: { rateLimited: boolean } }>(
        "select classstatus_private.register_push_subscription('production', $1::jsonb) as result",
        [JSON.stringify({ ...base, endpoint: `https://fcm.googleapis.com/fcm/send/concurrent-${index}` })]
      )
    ).rows[0].result));
    expect(results.filter((result) => !result.rateLimited)).toHaveLength(30);
    expect(results.filter((result) => result.rateLimited)).toHaveLength(10);
  });

  it("rejects malformed limiter payloads and the wrong namespace context", async () => {
    const valid = { endpoint: "https://fcm.googleapis.com/fcm/send/strict", p256dh: "A".repeat(87), auth: "B".repeat(22), lguIds: ["manila"], identityHash: "e".repeat(64) };
    await db.query("select set_config('classstatus.notification_registration_worker', '', false)");
    await expect(db.query("select classstatus_private.register_push_subscription('production', $1::jsonb)", [JSON.stringify(valid)]))
      .rejects.toThrow("notification-proof-invalid");
    await db.query("select set_config('classstatus.notification_registration_worker', 'preview', false)");
    await expect(db.query("select classstatus_private.register_push_subscription('production', $1::jsonb)", [JSON.stringify(valid)]))
      .rejects.toThrow("notification-proof-invalid");
    await expect(db.query("select classstatus_private.register_push_subscription('preview', $1::jsonb)", [JSON.stringify({ ...valid, unexpected: true })]))
      .rejects.toThrow("notification-payload-invalid");
  });

  it("keeps limiter state namespace-scoped and inaccessible to anonymous SQL", async () => {
    const result = (await db.query<{ function_execute: boolean; table_select: boolean }>(
      "select has_function_privilege('anon', 'classstatus_private.register_push_subscription(text,jsonb)', 'execute') as function_execute, has_table_privilege('anon', 'public.classstatus_push_registration_limits', 'select') as table_select"
    )).rows[0];
    expect(result).toEqual({ function_execute: false, table_select: false });
  });
});
