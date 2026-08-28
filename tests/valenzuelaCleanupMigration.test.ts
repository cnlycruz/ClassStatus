import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

const filename = "20260828194729_cleanup_20260829_valenzuela_legacy_duplicate.sql";
const migrationId = "20260828194729_cleanup_20260829_valenzuela_legacy_duplicate";
const sql = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", filename), "utf8");

const survivorId = "tier3-0b1f828ae71173486914";
const retiredId = "tier3-f9ba019468aaa43100b0";
const survivorLegacyEvent = "16768343438a0f84861abe2dde7b8fff44f20ae232e614969cec2b53531386c8";
const retiredLegacyEvent = "c3df8df42f435317a420bfe8db534654cbb721fe0a0a5e81f4335f9718cc7e81";
const legacyConflict = "valenzuela|lgu|2026-08-29|all-levels|all|all-day";
const sourceUrl = "https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-29-2026/";
const survivorFingerprint = "b7fa71de7a1f21c39c9d4e1893b06989ff4b1161496dd9144af26c5c44850712";
const retiredFingerprint = "8796c33d1bc6a28003c5e20082b30b6faa2c9a12d220cf4849da97323cc47636";
const survivorExcerpt = [
  "MANILA, Philippines – Some areas suspended classes for Saturday, August 29, due to the effects of the enhanced southwest monsoon or habagat.",
  "Metro Manila",
  "Valenzuela City – face-to-face classes in all levels (public and private)",
].join("\n");
const retiredExcerpt = [
  "MANILA, Philippines – Some areas suspended classes for Saturday, August 29, due to the effects of the enhanced southwest monsoon or habagat.",
  "Metro Manila",
  "Valenzuela City – all levels (public and private)",
].join("\n");

const openDatabases: PGlite[] = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((db) => db.close()));
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function familyKey(lguId: string, effectiveDate = "2026-08-29"): string {
  const material = ["classstatus-notice-family-v2", "production", `lgu:${lguId}`, effectiveDate].join("\n");
  return `v2f:${sha256(material)}`;
}

function eventKey(lguId: string, window = "all-day:2026-08-29", effectiveDate = "2026-08-29"): string {
  const material = ["classstatus-notice-event-v2", familyKey(lguId, effectiveDate), window].join("\n");
  return `v2e:${sha256(material)}`;
}

const canonicalFamily = familyKey("valenzuela");
const canonicalEvent = eventKey("valenzuela");

function citation(input: {
  fingerprint: string;
  excerpt: string;
  updatedAt: string;
}) {
  return {
    id: "rappler-walang-pasok",
    url: sourceUrl,
    name: "Rappler #WalangPasok Class Suspension Tracker",
    type: "news-reputable",
    verified: false,
    updatedAt: input.updatedAt,
    publishedAt: "2026-08-28T10:54:13.000Z",
    articleTitle: "[Walang Pasok] Class suspensions, Saturday, August 29, 2026",
    organization: "Rappler Philippines",
    evidenceExcerpt: input.excerpt,
    reliabilityTier: 3,
    evidenceFingerprint: input.fingerprint,
  };
}

function legacyRecord(input: {
  id: string;
  revision: number;
  eventKey: string;
  status: "classes-suspended" | "partial-suspension";
  source: ReturnType<typeof citation>;
  lguId?: string;
  effectiveDate?: string;
  schoolId?: string;
}) {
  return {
    id: input.id,
    lguId: input.lguId ?? "valenzuela",
    ...(input.schoolId ? { schoolId: input.schoolId } : {}),
    status: input.status,
    affectedLevels: ["all-levels"],
    schoolSector: "all",
    effectiveDate: input.effectiveDate ?? "2026-08-29",
    isAllDay: true,
    reason: "Class suspension announcement",
    announcementSummary: "Valenzuela class suspension",
    source: input.source,
    additionalSources: [],
    confidence: "medium",
    discoveredAt: "2026-08-28T12:02:05.457Z",
    publishedAt: "2026-08-28T10:54:13.000Z",
    lifecycleState: "active",
    isUpcoming: false,
    isActive: true,
    isExpired: false,
    isDemo: false,
    eventKey: input.eventKey,
    parserOutcome: "accepted:tier3-explicit-lgu-suspension",
    collectorProvenance: {
      pipeline: "tier3-media",
      runId: `legacy-${input.id}`,
      collectedAt: "2026-08-28T12:02:05.457Z",
    },
    publicationProvenance: {
      type: "automatic-collector",
      publicLabel: "Published from approved Tier 3 media evidence",
    },
    administrativeState: "active",
    revision: input.revision,
  };
}

const survivorRecord = () => legacyRecord({
  id: survivorId,
  revision: 73,
  eventKey: survivorLegacyEvent,
  status: "partial-suspension",
  source: citation({ fingerprint: survivorFingerprint, excerpt: survivorExcerpt, updatedAt: "2026-08-28T12:00:28.000Z" }),
});

const retiredRecord = () => legacyRecord({
  id: retiredId,
  revision: 51,
  eventKey: retiredLegacyEvent,
  status: "classes-suspended",
  source: citation({ fingerprint: retiredFingerprint, excerpt: retiredExcerpt, updatedAt: "2026-08-28T11:07:07.000Z" }),
});

const fixtureSchema = `
  create schema cron;
  create schema classstatus_private;
  create table cron.job (
    jobid bigint generated always as identity primary key,
    jobname text,
    active boolean
  );
  create table public.classstatus_collector_leases (
    deployment_namespace text primary key check (deployment_namespace in ('preview', 'production')),
    owner_token uuid not null,
    acquired_at timestamptz not null default clock_timestamp(),
    lease_expires_at timestamptz not null,
    updated_at timestamptz not null default clock_timestamp(),
    check (lease_expires_at > acquired_at)
  );
  create table public.classstatus_suspensions (
    deployment_namespace text not null check (deployment_namespace in ('preview', 'production')),
    record_id text not null,
    record jsonb not null check (jsonb_typeof(record) = 'object' and record ->> 'id' = record_id),
    event_key text not null check (event_key ~ '^([0-9a-f]{64}|v2e:[0-9a-f]{64})$'),
    conflict_key text not null,
    provenance_type text not null check (provenance_type in ('automatic-collector', 'manual-admin')),
    administrative_state text not null check (administrative_state in ('active', 'pending_removal', 'removed')),
    revision bigint not null check (revision > 0),
    published_at timestamptz not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    undo_deadline timestamptz,
    removal_finalized_at timestamptz,
    primary key (deployment_namespace, record_id)
  );
  create unique index classstatus_suspensions_active_event_key_idx
    on public.classstatus_suspensions (deployment_namespace, event_key)
    where administrative_state in ('active', 'pending_removal');
  create table public.classstatus_audit_entries (
    audit_id bigint generated always as identity primary key,
    deployment_namespace text not null,
    action text not null,
    outcome text not null,
    record_id text,
    target_summary text,
    correlation_id text,
    reason_code text,
    effective_at timestamptz not null
  );
  create table classstatus_private.test_notice_keys (
    lgu_id text not null,
    effective_date text not null,
    window_key text not null,
    family_key text not null,
    event_key text not null,
    primary key (lgu_id, effective_date, window_key)
  );
  create function classstatus_private.notice_family_key(p_namespace text, p_record jsonb)
  returns text language sql stable as $$
    select keys.family_key
    from classstatus_private.test_notice_keys keys
    where p_namespace = 'production'
      and keys.lgu_id = p_record ->> 'lguId'
      and keys.effective_date = p_record ->> 'effectiveDate'
    order by keys.window_key
    limit 1
  $$;
  create function classstatus_private.notice_window_key(p_record jsonb)
  returns text language sql stable as $$
    select case
      when coalesce((p_record ->> 'untilFurtherNotice')::boolean, false) then 'until-further-notice'
      when coalesce((p_record ->> 'isAllDay')::boolean, false)
        then 'all-day:' || coalesce(p_record ->> 'endDate', p_record ->> 'effectiveDate')
      else 'time:' || coalesce(p_record ->> 'startTime', '') || '-'
        || coalesce(p_record ->> 'endTime', '') || ':'
        || coalesce(p_record ->> 'endDate', p_record ->> 'effectiveDate')
    end
  $$;
  create function classstatus_private.notice_event_key(p_namespace text, p_record jsonb)
  returns text language sql stable as $$
    select keys.event_key
    from classstatus_private.test_notice_keys keys
    where p_namespace = 'production'
      and keys.lgu_id = p_record ->> 'lguId'
      and keys.effective_date = p_record ->> 'effectiveDate'
      and keys.window_key = classstatus_private.notice_window_key(p_record)
  $$;
`;

async function insertSuspension(db: PGlite, input: {
  namespace: "preview" | "production";
  id: string;
  record: Record<string, unknown>;
  event: string;
  conflict: string;
  provenance?: "automatic-collector" | "manual-admin";
  revision?: number;
}) {
  await db.query(`insert into public.classstatus_suspensions (
    deployment_namespace, record_id, record, event_key, conflict_key, provenance_type,
    administrative_state, revision, published_at, created_at, updated_at
  ) values ($1, $2, $3::jsonb, $4, $5, $6, 'active', $7,
    '2026-08-28T10:54:13Z', '2026-08-28T12:02:05Z', '2026-08-28T13:16:04Z')`, [
    input.namespace,
    input.id,
    JSON.stringify(input.record),
    input.event,
    input.conflict,
    input.provenance ?? "automatic-collector",
    input.revision ?? 1,
  ]);
}

async function createFixture(): Promise<PGlite> {
  const db = new PGlite();
  openDatabases.push(db);
  await db.exec(fixtureSchema);
  await db.exec("insert into cron.job (jobname, active) values ('classstatus-production-collector-every-minute', false)");
  await db.query("insert into classstatus_private.test_notice_keys values ($1, $2, $3, $4, $5)",
    ["valenzuela", "2026-08-29", "all-day:2026-08-29", canonicalFamily, canonicalEvent]);
  await db.query("insert into classstatus_private.test_notice_keys values ($1, $2, $3, $4, $5)",
    ["pasig", "2026-08-29", "all-day:2026-08-29", familyKey("pasig"), eventKey("pasig")]);

  await insertSuspension(db, {
    namespace: "production", id: survivorId, record: survivorRecord(), event: survivorLegacyEvent,
    conflict: legacyConflict, revision: 73,
  });
  await insertSuspension(db, {
    namespace: "production", id: retiredId, record: retiredRecord(), event: retiredLegacyEvent,
    conflict: legacyConflict, revision: 51,
  });

  const previewRecord = legacyRecord({
    id: "unaffected-preview", revision: 1, eventKey: sha256("unaffected-preview"),
    status: "classes-suspended", source: citation({ fingerprint: sha256("preview-source"), excerpt: "Preview evidence", updatedAt: "2026-08-28T12:00:28.000Z" }),
  });
  await insertSuspension(db, {
    namespace: "preview", id: "unaffected-preview", record: previewRecord,
    event: previewRecord.eventKey, conflict: "preview-unaffected",
  });

  const manualRecord = legacyRecord({
    id: "unaffected-manual", revision: 1, eventKey: sha256("unaffected-manual"),
    status: "classes-suspended", source: citation({ fingerprint: sha256("manual-source"), excerpt: "Manual evidence", updatedAt: "2026-08-28T12:00:28.000Z" }),
  });
  manualRecord.publicationProvenance = { type: "manual-admin", publicLabel: "Published by administrator" };
  await insertSuspension(db, {
    namespace: "production", id: "unaffected-manual", record: manualRecord,
    event: manualRecord.eventKey, conflict: "manual-unaffected", provenance: "manual-admin",
  });

  const aug28Record = legacyRecord({
    id: "unaffected-aug28", revision: 1, eventKey: sha256("unaffected-aug28"),
    status: "classes-suspended", effectiveDate: "2026-08-28", lguId: "caloocan",
    source: citation({ fingerprint: sha256("aug28-source"), excerpt: "August 28 evidence", updatedAt: "2026-08-27T12:00:28.000Z" }),
  });
  await insertSuspension(db, {
    namespace: "production", id: "unaffected-aug28", record: aug28Record,
    event: aug28Record.eventKey, conflict: "aug28-unaffected",
  });

  const otherLguRecord = legacyRecord({
    id: "unaffected-other-lgu", revision: 1, eventKey: sha256("unaffected-other-lgu"),
    status: "classes-suspended", lguId: "pasig",
    source: citation({ fingerprint: sha256("other-lgu-source"), excerpt: "Other LGU evidence", updatedAt: "2026-08-28T12:00:28.000Z" }),
  });
  await insertSuspension(db, {
    namespace: "production", id: "unaffected-other-lgu", record: otherLguRecord,
    event: otherLguRecord.eventKey, conflict: "other-lgu-unaffected",
  });

  const schoolRecord = legacyRecord({
    id: "unaffected-school", revision: 1, eventKey: sha256("unaffected-school"),
    status: "classes-suspended", schoolId: "valenzuela-school",
    source: citation({ fingerprint: sha256("school-source"), excerpt: "School evidence", updatedAt: "2026-08-28T12:00:28.000Z" }),
  });
  await insertSuspension(db, {
    namespace: "production", id: "unaffected-school", record: schoolRecord,
    event: schoolRecord.eventKey, conflict: "school-unaffected",
  });
  return db;
}

async function stateFingerprint(db: PGlite, recordIds?: readonly string[]): Promise<string> {
  const filter = recordIds?.length
    ? `where record_id in (${recordIds.map((_, index) => `$${index + 1}`).join(",")})`
    : "";
  const result = await db.query<{ state: string }>(`select md5(coalesce(string_agg(
      row_to_json(snapshot)::text, '|' order by snapshot.deployment_namespace, snapshot.record_id
    ), '')) as state
    from (
      select deployment_namespace, record_id, administrative_state, event_key, conflict_key,
        provenance_type, revision, undo_deadline, removal_finalized_at, published_at,
        created_at, updated_at, record
      from public.classstatus_suspensions ${filter}
    ) snapshot`, recordIds ? [...recordIds] : []);
  return result.rows[0].state;
}

async function executeMigration(db: PGlite): Promise<void> {
  await db.exec(sql);
}

async function expectMigrationRollback(
  mutate: (db: PGlite) => Promise<unknown>,
  expectedError: string,
): Promise<void> {
  const db = await createFixture();
  await mutate(db);
  const before = await stateFingerprint(db);
  let failure: unknown;
  try {
    await executeMigration(db);
  } catch (error) {
    failure = error;
    await db.exec("rollback");
  }
  expect(String(failure)).toContain(expectedError);
  expect(await stateFingerprint(db)).toBe(before);
  const audit = await db.query<{ count: number }>("select count(*)::int as count from public.classstatus_audit_entries");
  expect(audit.rows[0].count).toBe(0);
}

describe("reviewed Valenzuela 2026-08-29 legacy duplicate cleanup", () => {
  it("independently reproduces the approved v2 identity", () => {
    expect(canonicalFamily).toBe("v2f:d2d74b32965ba79ac9b0e1a0d4af185de979cbbe25e3a065544900745050e9d2");
    expect(canonicalEvent).toBe("v2e:8b96a6c76dcb9f456b0093ddd8fd75c31516c1525071f99b248a9e26acaadf58");
    expect(filename.slice(0, 14)).toBe("20260828194729");
    expect(Number(filename.slice(0, 14))).toBeGreaterThan(20260828161129);
  });

  it("executes atomically and produces the reviewed canonical and historical state", async () => {
    const db = await createFixture();
    const controlIds = [
      "unaffected-preview",
      "unaffected-manual",
      "unaffected-aug28",
      "unaffected-other-lgu",
      "unaffected-school",
    ] as const;
    const controlBefore = new Map<string, string>();
    for (const id of controlIds) controlBefore.set(id, await stateFingerprint(db, [id]));
    const retiredSourceBefore = await db.query<{ source: unknown }>(
      "select record -> 'source' as source from public.classstatus_suspensions where deployment_namespace = 'production' and record_id = $1",
      [retiredId],
    );

    await executeMigration(db);

    const rows = await db.query<{
      record_id: string;
      administrative_state: string;
      revision: number;
      event_key: string;
      conflict_key: string;
      record: Record<string, unknown>;
    }>(`select record_id, administrative_state, revision, event_key, conflict_key, record
      from public.classstatus_suspensions
      where deployment_namespace = 'production' and record_id in ($1, $2)
      order by record_id`, [survivorId, retiredId]);
    expect(rows.rows).toHaveLength(2);

    const survivor = rows.rows.find((row) => row.record_id === survivorId)!;
    expect(survivor.administrative_state).toBe("active");
    expect(survivor.revision).toBe(74);
    expect(survivor.event_key).toBe(canonicalEvent);
    expect(survivor.conflict_key).toBe(canonicalFamily);
    expect(survivor.record).toMatchObject({
      id: survivorId,
      lguId: "valenzuela",
      effectiveDate: "2026-08-29",
      status: "classes-suspended",
      affectedLevels: ["all-levels"],
      schoolSector: "all",
      isAllDay: true,
      eventKey: canonicalEvent,
      parserOutcome: "accepted:tier3-lgu-suspension:v2",
      confidence: "medium",
      additionalSources: [],
      administrativeState: "active",
      revision: 74,
      collectorProvenance: { pipeline: "tier3-media" },
      source: {
        id: "rappler-walang-pasok",
        organization: "Rappler Philippines",
        url: sourceUrl,
        evidenceFingerprint: survivorFingerprint,
        evidenceExcerpt: survivorExcerpt,
        updatedAt: "2026-08-28T12:00:28.000Z",
        verified: false,
      },
    });
    expect(survivor.record).not.toHaveProperty("startTime");
    expect(survivor.record).not.toHaveProperty("endTime");

    const retired = rows.rows.find((row) => row.record_id === retiredId)!;
    expect(retired.administrative_state).toBe("removed");
    expect(retired.revision).toBe(52);
    expect(retired.event_key).toBe(retiredLegacyEvent);
    expect(retired.conflict_key).toBe(legacyConflict);
    expect(retired.record).toMatchObject({
      eventKey: retiredLegacyEvent,
      parserOutcome: "accepted:tier3-explicit-lgu-suspension",
      administrativeState: "removed",
      revision: 52,
      source: { evidenceFingerprint: retiredFingerprint, evidenceExcerpt: retiredExcerpt },
    });
    expect(retired.record).toHaveProperty("removalFinalizedAt");
    expect((retired.record as { source: unknown }).source).toEqual(retiredSourceBefore.rows[0].source);

    const active = await db.query<{ count: number }>(`select count(*)::int as count
      from public.classstatus_suspensions
      where deployment_namespace = 'production' and provenance_type = 'automatic-collector'
        and administrative_state = 'active' and record ->> 'effectiveDate' = '2026-08-29'
        and record ->> 'lguId' = 'valenzuela' and not (record ? 'schoolId')`);
    expect(active.rows[0].count).toBe(1);

    const audits = await db.query<{ action: string; reason_code: string; record_id: string }>(
      "select action, reason_code, record_id from public.classstatus_audit_entries where correlation_id = $1 order by record_id",
      [migrationId],
    );
    expect(audits.rows).toEqual([
      { action: "cleanup-canonical-rewrite", reason_code: "cleanup-canonical-rewrite", record_id: survivorId },
      { action: "cleanup-retire", reason_code: "cleanup-stale-duplicate", record_id: retiredId },
    ]);

    for (const id of controlIds) expect(await stateFingerprint(db, [id])).toBe(controlBefore.get(id));
  }, 30_000);

  it.each([
    ["survivor revision drift", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set revision = 74, record = jsonb_set(record, '{revision}', '74'::jsonb) where record_id = '${survivorId}'`), "valenzuela-cleanup-survivor-snapshot-drift"],
    ["retired revision drift", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set revision = 52, record = jsonb_set(record, '{revision}', '52'::jsonb) where record_id = '${retiredId}'`), "valenzuela-cleanup-retired-snapshot-drift"],
    ["survivor event-key drift", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set event_key = '${"a".repeat(64)}', record = jsonb_set(record, '{eventKey}', to_jsonb('${"a".repeat(64)}'::text)) where record_id = '${survivorId}'`), "valenzuela-cleanup-survivor-snapshot-drift"],
    ["retired event-key drift", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set event_key = '${"b".repeat(64)}', record = jsonb_set(record, '{eventKey}', to_jsonb('${"b".repeat(64)}'::text)) where record_id = '${retiredId}'`), "valenzuela-cleanup-retired-snapshot-drift"],
    ["unexpected third Valenzuela row", async (db: PGlite) => {
      const record = legacyRecord({
        id: "unexpected-valenzuela", revision: 1, eventKey: "c".repeat(64), status: "classes-suspended",
        source: citation({ fingerprint: sha256("unexpected-source"), excerpt: "Unexpected Valenzuela evidence", updatedAt: "2026-08-28T12:30:00.000Z" }),
      });
      await insertSuspension(db, { namespace: "production", id: "unexpected-valenzuela", record, event: record.eventKey, conflict: legacyConflict });
    }, "valenzuela-cleanup-target-count-drift"],
    ["another August 29 LGU duplicate", async (db: PGlite) => {
      const record = legacyRecord({
        id: "unexpected-pasig-duplicate", revision: 1, eventKey: "d".repeat(64), status: "classes-suspended", lguId: "pasig",
        source: citation({ fingerprint: sha256("unexpected-pasig-source"), excerpt: "Unexpected Pasig duplicate evidence", updatedAt: "2026-08-28T12:30:00.000Z" }),
      });
      await insertSuspension(db, { namespace: "production", id: "unexpected-pasig-duplicate", record, event: record.eventKey, conflict: "pasig-duplicate" });
    }, "valenzuela-cleanup-other-duplicate-requires-review"],
    ["missing Cron", async (db: PGlite) => db.exec("delete from cron.job"), "valenzuela-cleanup-production-cron-not-exactly-one-inactive"],
    ["duplicate Cron", async (db: PGlite) => db.exec("insert into cron.job (jobname, active) values ('classstatus-production-collector-every-minute', false)"), "valenzuela-cleanup-production-cron-not-exactly-one-inactive"],
    ["active Cron", async (db: PGlite) => db.exec("update cron.job set active = true"), "valenzuela-cleanup-production-cron-not-exactly-one-inactive"],
    ["active Production lease", async (db: PGlite) => db.exec("insert into public.classstatus_collector_leases values ('production','00000000-0000-0000-0000-000000000001',clock_timestamp(),clock_timestamp() + interval '5 minutes',clock_timestamp())"), "valenzuela-cleanup-production-collector-lease-active"],
    ["wrong source fingerprint", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set record = jsonb_set(record, '{source,evidenceFingerprint}', to_jsonb('${"e".repeat(64)}'::text)) where record_id = '${survivorId}'`), "valenzuela-cleanup-survivor-snapshot-drift"],
    ["wrong source URL", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set record = jsonb_set(record, '{source,url}', to_jsonb('https://example.invalid/unreviewed'::text)) where record_id = '${survivorId}'`), "valenzuela-cleanup-survivor-snapshot-drift"],
    ["missing private record ID", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set record = record - 'id' where record_id = '${survivorId}'`), "valenzuela-cleanup-survivor-snapshot-drift"],
  ] as const)("rolls back every cleanup mutation on %s", async (_name, mutate, expectedError) => {
    await expectMigrationRollback(mutate, expectedError);
  }, 30_000);

  it("keeps the cleanup atomic and narrowly scoped", () => {
    expect(sql).toMatch(/\nbegin;[\s\S]*\ncommit;\s*$/);
    expect(sql).not.toMatch(/delete\s+from\s+public\.classstatus_suspensions/i);
    expect(sql).toContain("lock table public.classstatus_collector_leases in share mode");
    expect(sql).toContain("classstatus-production-collector-every-minute");
    expect(sql).toContain("cleanup-stale-duplicate");
  });
});
