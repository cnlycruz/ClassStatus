import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCollectorCapabilityMessage,
  signCollectorCapability,
  type CollectorCapabilityAction,
} from "@/lib/cron/collectorCapability";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260825162450_add_preview_collector_schedule_and_lease.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");
const payload = '{"ownerToken":"11111111-1111-4111-8111-111111111111"}';
const issuedAt = 1_787_702_400;
const nonce = "22222222-2222-4222-8222-222222222222";
const secret = "test-preview-capability-secret-abcdefghijklmnopqrstuvwxyz0123456789";

describe("Preview collector signed capability", () => {
  it("matches the deterministic protocol vector and hashes the exact payload text", () => {
    expect(buildCollectorCapabilityMessage({
      namespace: "preview",
      action: "lease.acquire",
      payload,
      issuedAt,
      nonce,
    })).toBe([
      "classstatus-collector-v1",
      "preview",
      "lease.acquire",
      String(issuedAt),
      nonce,
      "08782872d3cb15c701415fc6f6981dc8557460a9dbf3a874d4dec77c86a0e38e",
    ].join("\n"));

    expect(signCollectorCapability({
      namespace: "preview",
      action: "lease.acquire",
      payload,
      issuedAt,
      nonce,
      secret,
    })).toEqual({
      p_payload: payload,
      p_issued_at: issuedAt,
      p_nonce: nonce,
      p_signature: "a266d66eabdf5d726eb03af5495cab76a81862be1fe29274ac8953646864b105",
    });
  });

  it("binds signatures to the action and rejects a Production namespace", () => {
    const signatures = (["lease.acquire", "lease.release", "record.upsert", "logs.append"] as CollectorCapabilityAction[])
      .map((action) => signCollectorCapability({ namespace: "preview", action, payload, issuedAt, nonce, secret }).p_signature);
    expect(new Set(signatures).size).toBe(4);
    expect(() => signCollectorCapability({
      namespace: "production" as "preview",
      action: "lease.acquire",
      payload,
      issuedAt,
      nonce,
      secret,
    })).toThrow("COLLECTOR_CAPABILITY_UNAVAILABLE");
  });

  it("keeps all proof failures secret-free", () => {
    for (const invalid of [
      { namespace: "preview" as const, action: "lease.acquire" as const, payload, issuedAt: 0, nonce, secret },
      { namespace: "preview" as const, action: "lease.acquire" as const, payload, issuedAt, nonce: nonce.toUpperCase(), secret },
      { namespace: "preview" as const, action: "lease.acquire" as const, payload, issuedAt, nonce, secret: "short" },
    ]) {
      try {
        signCollectorCapability(invalid);
        throw new Error("expected signing to fail");
      } catch (error) {
        expect(String(error)).not.toContain(invalid.secret);
      }
    }
  });
});

describe("signed worker migration boundary", () => {
  it("validates HMAC format, freshness, namespace/action binding, and fixed-time digest comparison", () => {
    expect(sql).toContain("'classstatus-collector-v1' || pg_catalog.chr(10)");
    expect(sql).toContain("|| 'preview' || pg_catalog.chr(10)");
    expect(sql).toContain("extensions.digest(pg_catalog.convert_to(p_payload, 'UTF8'), 'sha256')");
    expect(sql).toContain("extensions.hmac(");
    expect(sql).toContain("p_signature !~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("p_issued_at < now_epoch - 90");
    expect(sql).toContain("p_issued_at > now_epoch + 30");
    expect(sql).toContain("for byte_index in 0..31 loop");
    expect(sql).toContain("classstatus:collector-proof-invalid");
  });

  it("atomically rejects replay, expires nonce state, and isolates the namespace", () => {
    expect(sql).toMatch(/primary key \(deployment_namespace, nonce\)/i);
    expect(sql).toContain("delete from public.classstatus_collector_capability_nonces");
    expect(sql).toContain("clock_timestamp() + interval '5 minutes'");
    expect(sql).toContain("exception when unique_violation");
    expect(sql).toContain("classstatus:collector-proof-replayed");
    expect(sql).toMatch(/insert into public\.classstatus_collector_capability_nonces[\s\S]*?'preview',[\s\S]*?p_nonce/i);
    expect(sql).not.toContain("classstatus_production_worker_");

    const hmacIndex = sql.indexOf("extensions.hmac(");
    const cleanupIndex = sql.indexOf("delete from public.classstatus_collector_capability_nonces");
    expect(hmacIndex).toBeGreaterThan(-1);
    expect(cleanupIndex).toBeGreaterThan(hmacIndex);
  });

  it("models first-use, concurrent replay rejection, expiry recovery, and namespace isolation", () => {
    const used = new Map<string, number>();
    const consume = (namespace: "preview" | "production", candidateNonce: string, now: number) => {
      for (const [key, expiresAt] of used) if (expiresAt <= now) used.delete(key);
      const key = `${namespace}:${candidateNonce}`;
      if (used.has(key)) return false;
      used.set(key, now + 300);
      return true;
    };

    expect(consume("preview", nonce, 1_000)).toBe(true);
    expect(consume("preview", nonce, 1_000)).toBe(false);
    expect(consume("production", nonce, 1_000)).toBe(true);
    expect(consume("preview", nonce, 1_301)).toBe(true);
  });

  it("grants only the four proof wrappers to anon and no direct table DML", () => {
    const wrappers = [
      "acquire_collector_lease",
      "release_collector_lease",
      "upsert_collected",
      "append_collector_logs",
    ];
    for (const wrapper of wrappers) {
      const signature = `public.classstatus_preview_worker_${wrapper}(text, bigint, uuid, text)`;
      expect(sql).toContain(`revoke execute on function ${signature}`);
      expect(sql).toContain("from public, authenticated, service_role;");
      expect(sql).toContain(`grant execute on function ${signature} to anon;`);
    }
    expect(sql).toContain("revoke all on table public.classstatus_collector_leases from public, anon, authenticated, service_role;");
    expect(sql).toContain("revoke all on table public.classstatus_collector_capability_nonces from public, anon, authenticated, service_role;");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+(table\s+)?public\.classstatus_/i);
    expect(sql).toContain("revoke execute on all functions in schema classstatus_private");
  });

  it("keeps manual Preview and Production lease roles separate and reuses private invariants", () => {
    expect(sql).toContain("grant execute on function public.classstatus_preview_acquire_collector_lease(uuid) to authenticated;");
    expect(sql).toContain("grant execute on function public.classstatus_preview_release_collector_lease(uuid) to authenticated;");
    expect(sql).toContain("grant execute on function public.classstatus_production_acquire_collector_lease(uuid) to service_role;");
    expect(sql).toContain("grant execute on function public.classstatus_production_release_collector_lease(uuid) to service_role;");
    expect(sql).toContain("return classstatus_private.upsert_collected(");
    expect(sql).toContain("return classstatus_private.append_collector_logs('preview', payload -> 'logs');");
    expect(sql).toContain("current_setting('classstatus.collector_worker', true) = 'preview'");
  });

  it("reads the same Preview secret from Vault without hardcoding it into the schedule", () => {
    expect(sql).toContain("from vault.decrypted_secrets secret");
    expect(sql).toContain("classstatus-preview-cron-secret");
    expect(sql).toContain("classstatus-preview-collector-every-minute");
    expect(sql).toContain("'* * * * *'");
    expect(sql).not.toMatch(/Authorization',\s*'Bearer [^']/);
  });
});
