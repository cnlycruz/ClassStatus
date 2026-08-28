import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

const filename = "20260828161129_cleanup_20260828_legacy_suspensions.sql";
const sql = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", filename), "utf8");
const RAPPLER_URL = "https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/";
const GMA_URL = "https://www.gmanetwork.com/news/serbisyopubliko/walangpasok/1000102/walang-pasok-class-suspensions-for-friday-august-28-2026/story/";
const PALACE_FINGERPRINT = "a3462f30826f75ffa8b048a1d3298ecdb30c17a2337350d538aa22a3b3dac2e4";
const FALSE_GMA_FINGERPRINT = "8427326edfee1b9fde9cc09d53b70f4146df8ba018e10a4638fbfae5e1ec2c4a";
const MIGRATION_ID = "20260828161129_cleanup_20260828_legacy_suspensions";

type ExpectedRow = { id: string; lgu: string; revision: number; event: string; conflict: string; disposition: string; survivor: string | null };
type CanonicalRow = {
  id: string; lgu: string; family: string; event: string; status: string; levels: string[];
  sector: string; confidence: string; mode: string; donor: string | null;
  primaryId: string; primaryOrganization: string; primaryUrl: string; primaryFingerprint: string;
  gmaId: string | null; gmaOrganization: string | null; gmaUrl: string | null; gmaFingerprint: string | null;
};

const expectedRowPattern = /^\s*\('(?<id>tier3-[0-9a-f]+)', '(?<lgu>[a-z-]+)', (?<revision>\d+), '(?<event>[0-9a-f]{64})', '(?<conflict>[^']+)', '(?<disposition>[a-z-]+)', (?<survivor>null|'tier3-[0-9a-f]+')\)(?:,|;)?$/gm;
const expectedRows: ExpectedRow[] = [...sql.matchAll(expectedRowPattern)].map((match) => ({
  id: match.groups!.id, lgu: match.groups!.lgu, revision: Number(match.groups!.revision),
  event: match.groups!.event, conflict: match.groups!.conflict, disposition: match.groups!.disposition,
  survivor: match.groups!.survivor === "null" ? null : match.groups!.survivor.slice(1, -1),
}));
const reviewedManifestDigest = sha256(
  [...sql.matchAll(expectedRowPattern)].map((match) => Object.values(match.groups!).join("|")).join("\n"),
);

const canonicalRowPattern = /^\s*\('(?<id>tier3-[0-9a-f]+)', '(?<lgu>[a-z-]+)', '(?<family>v2f:[0-9a-f]{64})', '(?<event>v2e:[0-9a-f]{64})', '(?<status>[a-z-]+)', '(?<levels>\[[^']+\])', '(?<sector>[a-z-]+)', '(?<confidence>[a-z-]+)', '(?<mode>[a-z-]+)', (?<donor>null|'tier3-[0-9a-f]+'), '(?<primaryId>[^']+)', '(?<primaryOrganization>[^']+)', '(?<primaryUrl>[^']+)', '(?<primaryFingerprint>[0-9a-f]{64})', (?<gmaId>null|'[^']+'), (?<gmaOrganization>null|'[^']+'), (?<gmaUrl>null|'[^']+'), (?<gmaFingerprint>null|'[0-9a-f]{64}')\)(?:,|;)?$/gm;

function nullableSqlString(value: string): string | null {
  return value === "null" ? null : value.slice(1, -1);
}

const canonicalRows: CanonicalRow[] = [...sql.matchAll(canonicalRowPattern)].map((match) => ({
  id: match.groups!.id, lgu: match.groups!.lgu, family: match.groups!.family, event: match.groups!.event,
  status: match.groups!.status, levels: JSON.parse(match.groups!.levels) as string[], sector: match.groups!.sector,
  confidence: match.groups!.confidence, mode: match.groups!.mode, donor: nullableSqlString(match.groups!.donor),
  primaryId: match.groups!.primaryId, primaryOrganization: match.groups!.primaryOrganization,
  primaryUrl: match.groups!.primaryUrl, primaryFingerprint: match.groups!.primaryFingerprint,
  gmaId: nullableSqlString(match.groups!.gmaId), gmaOrganization: nullableSqlString(match.groups!.gmaOrganization),
  gmaUrl: nullableSqlString(match.groups!.gmaUrl), gmaFingerprint: nullableSqlString(match.groups!.gmaFingerprint),
}));
const reviewedEvidenceDigest = sha256(
  [...sql.matchAll(canonicalRowPattern)].map((match) => Object.values(match.groups!).join("|")).join("\n"),
);

const palaceRows = [
  { id: "tier3-38c64eb2ad2632b325ef", lgu: "makati", family: "v2f:c0636a3014ddd360a8aefc159d15416cbb082903c4d5d7091d6222e15d007f22", event: "v2e:6f6c67f7ed35f5e8349cef03906dafbdc2f29f0425f8c3d1559c5efc33647eda" },
  { id: "tier3-e7588054b36a1880aef8", lgu: "pasig", family: "v2f:0c212785d32af422f1abf90927380b1b5a6ae270cb4995a12de450e90de4a3cb", event: "v2e:6b1f828e0d13b0ed034df6021d0a7818f4393925a86a2c0ad383740cff5355b0" },
  { id: "tier3-19feec500c8ff152a1fc", lgu: "pateros", family: "v2f:a716bdbba538547c7224d110bcc8fc210d48dd320d506aa081b820ca11620806", event: "v2e:cdac6abe56ab9e3ad3f62fd9b68e87e03f19a1cd3b36f4a89a210d7a3d4809bb" },
] as const;
const falseCitationLgus = new Set(["mandaluyong", "muntinlupa", "navotas", "pasay", "quezon-city", "taguig"]);
const openDatabases: PGlite[] = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((db) => db.close()));
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function familyKey(lguId: string): string {
  return `v2f:${sha256(["classstatus-notice-family-v2", "production", `lgu:${lguId}`, "2026-08-28"].join("\n"))}`;
}
function eventKey(lguId: string, window: string): string {
  return `v2e:${sha256(["classstatus-notice-event-v2", familyKey(lguId), window].join("\n"))}`;
}

function citation(input: { id: string; organization: string; url: string; fingerprint: string; excerpt: string }) {
  return {
    id: input.id, name: input.organization, organization: input.organization, url: input.url,
    type: "news-reputable", reliabilityTier: 3, verified: false,
    publishedAt: "2026-08-27T10:00:00.000Z", articleTitle: "Reviewed August 28 class suspensions",
    evidenceExcerpt: input.excerpt, evidenceFingerprint: input.fingerprint,
  };
}
function canonicalSource(spec: CanonicalRow) {
  return citation({ id: spec.primaryId, organization: spec.primaryOrganization, url: spec.primaryUrl,
    fingerprint: spec.primaryFingerprint, excerpt: `${spec.lgu} reviewed Rappler suspension evidence` });
}
function gmaSource(spec: CanonicalRow) {
  if (!spec.gmaId || !spec.gmaOrganization || !spec.gmaUrl || !spec.gmaFingerprint) throw new Error(`Missing reviewed GMA evidence for ${spec.lgu}`);
  return citation({ id: spec.gmaId, organization: spec.gmaOrganization, url: spec.gmaUrl,
    fingerprint: spec.gmaFingerprint, excerpt: `${spec.lgu} reviewed GMA suspension evidence` });
}

function legacyRecord(row: ExpectedRow) {
  const canonical = canonicalRows.find((candidate) => candidate.id === row.id);
  const palace = palaceRows.find((candidate) => candidate.id === row.id);
  const donorCanonical = canonicalRows.find((candidate) => candidate.donor === row.id);
  const conflictParts = row.conflict.split("|");
  const legacyLevels = conflictParts[3]?.split(",") ?? ["all-levels"];
  const isAllDay = conflictParts[5] === "all-day";
  let source;
  let additionalSources: ReturnType<typeof citation>[] = [];

  if (canonical) {
    source = canonicalSource(canonical);
    if (canonical.mode === "canonical-gma") additionalSources = [gmaSource(canonical)];
    if (falseCitationLgus.has(canonical.lgu)) additionalSources = [citation({
      id: "gma-news-walang-pasok", organization: "GMA Network", url: GMA_URL,
      fingerprint: FALSE_GMA_FINGERPRINT, excerpt: "Malolos reviewed false section expansion evidence",
    })];
  } else if (palace) {
    source = citation({
      id: "rappler-walang-pasok", organization: "Rappler Philippines", url: RAPPLER_URL,
      fingerprint: PALACE_FINGERPRINT,
      excerpt: "[Walang Pasok] Malacañang suspended afternoon classes (starting 1 pm) in all levels for public and private schools in Metro Manila.",
    });
  } else if (donorCanonical) {
    source = gmaSource(donorCanonical);
  } else {
    const falsePlace = row.disposition === "false-geography" ? (legacyLevels.includes("preschool") ? "Agoo" : "Malolos") : row.lgu;
    source = citation({ id: "rappler-walang-pasok", organization: "Rappler Philippines", url: RAPPLER_URL,
      fingerprint: sha256(`legacy-source:${row.id}`), excerpt: `${falsePlace} legacy evidence` });
  }

  return {
    id: row.id, lguId: row.lgu, status: palace ? "partial-suspension" : (canonical?.status ?? "partial-suspension"),
    affectedLevels: palace ? ["all-levels"] : (canonical?.levels ?? legacyLevels),
    schoolSector: palace ? "all" : (canonical?.sector ?? conflictParts[4] ?? "all"), effectiveDate: "2026-08-28",
    ...(isAllDay ? {} : { startTime: "12:00", endTime: "23:59" }), isAllDay,
    reason: "Legacy class suspension announcement", announcementSummary: `${row.lgu} legacy suspension`, source,
    additionalSources, confidence: canonical?.confidence ?? "medium", discoveredAt: "2026-08-27T10:00:00.000Z",
    publishedAt: "2026-08-27T10:00:00.000Z", lifecycleState: "expired", isUpcoming: false, isActive: false,
    isExpired: true, isDemo: false, eventKey: row.event, parserOutcome: "accepted:tier3-explicit-lgu-suspension",
    collectorProvenance: { pipeline: "tier3-media", runId: "legacy-reviewed-snapshot", collectedAt: "2026-08-27T10:00:00.000Z" },
    publicationProvenance: { type: "automatic-collector", publicLabel: "Published from approved Tier 3 media evidence" },
    administrativeState: "active", revision: row.revision,
  };
}

const fixtureSchema = `
  create schema cron;
  create schema classstatus_private;
  create table cron.job (jobid bigint generated always as identity primary key, jobname text, active boolean);
  create table public.classstatus_collector_leases (
    deployment_namespace text primary key check (deployment_namespace in ('preview', 'production')),
    owner_token uuid not null, acquired_at timestamptz not null default clock_timestamp(),
    lease_expires_at timestamptz not null, updated_at timestamptz not null default clock_timestamp(),
    check (lease_expires_at > acquired_at)
  );
  create table public.classstatus_suspensions (
    deployment_namespace text not null check (deployment_namespace in ('preview', 'production')),
    record_id text not null, record jsonb not null check (jsonb_typeof(record) = 'object' and record ->> 'id' = record_id),
    event_key text not null check (event_key ~ '^([0-9a-f]{64}|v2e:[0-9a-f]{64})$'), conflict_key text not null,
    provenance_type text not null check (provenance_type in ('automatic-collector', 'manual-admin')),
    administrative_state text not null check (administrative_state in ('active', 'pending_removal', 'removed')),
    revision bigint not null check (revision > 0), published_at timestamptz not null,
    created_at timestamptz not null, updated_at timestamptz not null,
    undo_deadline timestamptz, removal_finalized_at timestamptz, primary key (deployment_namespace, record_id)
  );
  create unique index classstatus_suspensions_active_event_key_idx
    on public.classstatus_suspensions (deployment_namespace, event_key)
    where administrative_state in ('active', 'pending_removal');
  create table public.classstatus_audit_entries (
    audit_id bigint generated always as identity primary key, deployment_namespace text not null,
    action text not null, outcome text not null, record_id text, target_summary text,
    correlation_id text, reason_code text, effective_at timestamptz not null
  );
  create table classstatus_private.test_notice_keys (
    lgu_id text not null, window_key text not null, family_key text not null, event_key text not null,
    primary key (lgu_id, window_key)
  );
  create function classstatus_private.notice_family_key(p_namespace text, p_record jsonb)
  returns text language sql stable as $$
    select keys.family_key from classstatus_private.test_notice_keys keys
    where p_namespace = 'production' and keys.lgu_id = p_record ->> 'lguId'
    order by keys.window_key limit 1
  $$;
  create function classstatus_private.notice_event_key(p_namespace text, p_record jsonb)
  returns text language sql stable as $$
    select keys.event_key from classstatus_private.test_notice_keys keys
    where p_namespace = 'production' and keys.lgu_id = p_record ->> 'lguId'
      and keys.window_key = case when p_record -> 'isAllDay' = 'true'::jsonb
        then 'all-day:' || (p_record ->> 'effectiveDate')
        else 'time:' || (p_record ->> 'startTime') || '-' || (p_record ->> 'endTime') || ':' || (p_record ->> 'effectiveDate') end
  $$;
`;

async function insertSuspension(db: PGlite, input: {
  namespace: "production" | "preview"; id: string; record: Record<string, unknown>; event: string; conflict: string;
  provenance: "automatic-collector" | "manual-admin"; state?: "active" | "pending_removal" | "removed"; revision?: number;
}) {
  await db.query(`insert into public.classstatus_suspensions (
    deployment_namespace, record_id, record, event_key, conflict_key, provenance_type,
    administrative_state, revision, published_at, created_at, updated_at
  ) values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, '2026-08-27T10:00:00Z', '2026-08-27T10:00:00Z', '2026-08-27T10:00:00Z')`,
  [input.namespace, input.id, JSON.stringify(input.record), input.event, input.conflict,
    input.provenance, input.state ?? "active", input.revision ?? 1]);
}

async function createFixture(): Promise<PGlite> {
  const db = new PGlite();
  openDatabases.push(db);
  await db.exec(fixtureSchema);
  await db.exec("insert into cron.job (jobname, active) values ('classstatus-production-collector-every-minute', false);");
  const familySpecs = new Map<string, string>();
  for (const row of canonicalRows) familySpecs.set(row.lgu, row.family);
  familySpecs.set("makati", familyKey("makati"));
  for (const [lgu, family] of familySpecs) {
    await db.query("insert into classstatus_private.test_notice_keys values ($1, $2, $3, $4)",
      [lgu, "all-day:2026-08-28", family, eventKey(lgu, "all-day:2026-08-28")]);
  }
  for (const palace of palaceRows) {
    await db.query("insert into classstatus_private.test_notice_keys values ($1, $2, $3, $4)",
      [palace.lgu, "time:13:00-23:59:2026-08-28", palace.family, palace.event]);
  }
  for (const row of expectedRows) {
    await insertSuspension(db, { namespace: "production", id: row.id, record: legacyRecord(row), event: row.event,
      conflict: row.conflict, provenance: "automatic-collector", revision: row.revision });
  }
  await insertSuspension(db, { namespace: "preview", id: "unaffected-preview",
    record: { ...legacyRecord(expectedRows[0]), id: "unaffected-preview" }, event: sha256("unaffected-preview"),
    conflict: "preview-unaffected", provenance: "automatic-collector" });
  await insertSuspension(db, { namespace: "production", id: "unaffected-manual",
    record: { ...legacyRecord(expectedRows[0]), id: "unaffected-manual", publicationProvenance: { type: "manual-admin" } },
    event: sha256("unaffected-manual"), conflict: "manual-unaffected", provenance: "manual-admin" });
  await insertSuspension(db, { namespace: "production", id: "unaffected-aug29",
    record: { ...legacyRecord(expectedRows[0]), id: "unaffected-aug29", effectiveDate: "2026-08-29" },
    event: sha256("unaffected-aug29"), conflict: "aug29-unaffected", provenance: "automatic-collector" });
  return db;
}

async function stateFingerprint(db: PGlite, recordIds?: readonly string[]): Promise<string> {
  const filter = recordIds?.length
    ? `where record_id in (${recordIds.map((_, index) => `$${index + 1}`).join(",")})`
    : "";
  const result = await db.query<{ state: string }>(`select md5(coalesce(string_agg(row_to_json(snapshot)::text, '|' order by snapshot.deployment_namespace, snapshot.record_id), '')) as state
    from (select deployment_namespace, record_id, administrative_state, event_key, conflict_key,
      provenance_type, revision, undo_deadline, removal_finalized_at, published_at, created_at,
      updated_at, record from public.classstatus_suspensions ${filter}) snapshot`, recordIds ? [...recordIds] : []);
  return result.rows[0].state;
}
async function executeMigration(db: PGlite): Promise<void> { await db.exec(sql); }
async function expectMigrationRollback(mutate: (db: PGlite) => Promise<unknown>, expectedError: string): Promise<void> {
  const db = await createFixture();
  await mutate(db);
  const before = await stateFingerprint(db);
  let failure: unknown;
  try { await executeMigration(db); } catch (error) { failure = error; await db.exec("rollback;"); }
  expect(String(failure)).toContain(expectedError);
  expect(await stateFingerprint(db)).toBe(before);
  const audit = await db.query<{ count: number }>("select count(*)::int as count from public.classstatus_audit_entries");
  expect(audit.rows[0].count).toBe(0);
}

describe("reviewed 2026-08-28 Production cleanup migration", () => {
  it("pins the exact reviewed 57-row snapshot and independently reproducible v2 keys", () => {
    expect(expectedRows).toHaveLength(57);
    expect(new Set(expectedRows.map((row) => row.id)).size).toBe(57);
    expect(reviewedManifestDigest).toBe("16f878efc63d23a829d9455777ffb5a7ad3c675a77e26881da2aa661a7527938");
    expect(canonicalRows).toHaveLength(16);
    expect(reviewedEvidenceDigest).toBe("297d3edab5e39196212dfbfe3135330763294c2bfcce4f7d27476a1452241bc2");
    for (const row of canonicalRows) {
      expect(row.family).toBe(familyKey(row.lgu));
      expect(row.event).toBe(eventKey(row.lgu, "all-day:2026-08-28"));
      expect(row.primaryUrl).toBe(RAPPLER_URL);
      expect(row.primaryFingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const palace of palaceRows) {
      expect(palace.family).toBe(familyKey(palace.lgu));
      expect(palace.event).toBe(eventKey(palace.lgu, "time:13:00-23:59:2026-08-28"));
    }
    expect(sql).toContain(familyKey("makati"));
    expect(sql).toContain(eventKey("makati", "all-day:2026-08-28"));
  });

  it("executes atomically and produces the reviewed active, historical, and audit state", async () => {
    const db = await createFixture();
    const unaffectedIds = ["unaffected-preview", "unaffected-manual", "unaffected-aug29"] as const;
    const unaffectedBefore = new Map<string, string>();
    for (const recordId of unaffectedIds) unaffectedBefore.set(recordId, await stateFingerprint(db, [recordId]));
    const retiredSpecs = expectedRows.filter((row) => !["canonical", "palace"].includes(row.disposition));
    const retiredBefore = await db.query<{ record_id: string; source: unknown; event_key: string; conflict_key: string }>(
      `select record_id, record -> 'source' as source, event_key, conflict_key from public.classstatus_suspensions
       where record_id in (${retiredSpecs.map((_, index) => `$${index + 1}`).join(",")}) order by record_id`, retiredSpecs.map((row) => row.id));
    await executeMigration(db);

    const counts = await db.query<{ active: number; removed: number; all_day: number; timed: number; audits: number }>(`select
      count(*) filter (where administrative_state = 'active')::int as active,
      count(*) filter (where administrative_state = 'removed')::int as removed,
      count(*) filter (where administrative_state = 'active' and record -> 'isAllDay' = 'true'::jsonb)::int as all_day,
      count(*) filter (where administrative_state = 'active' and record -> 'isAllDay' = 'false'::jsonb)::int as timed,
      (select count(*)::int from public.classstatus_audit_entries where correlation_id = '${MIGRATION_ID}') as audits
      from public.classstatus_suspensions where deployment_namespace = 'production'
        and provenance_type = 'automatic-collector' and record ->> 'effectiveDate' = '2026-08-28'`);
    expect(counts.rows[0]).toEqual({ active: 20, removed: 38, all_day: 17, timed: 3, audits: 58 });

    const mapSemantics = await db.query<{ full_count: number; partial_lgus: string[] }>(`select
      count(*) filter (where record -> 'isAllDay' = 'true'::jsonb and record ->> 'status' = 'classes-suspended'
        and record -> 'affectedLevels' = '["all-levels"]'::jsonb and record ->> 'schoolSector' = 'all')::int as full_count,
      array_agg(distinct record ->> 'lguId' order by record ->> 'lguId') filter (where record ->> 'status' = 'partial-suspension') as partial_lgus
      from public.classstatus_suspensions where deployment_namespace = 'production' and provenance_type = 'automatic-collector'
        and administrative_state = 'active' and record ->> 'effectiveDate' = '2026-08-28'`);
    expect(mapSemantics.rows[0]).toEqual({ full_count: 14, partial_lgus: ["makati", "pasig", "pateros"] });

    const makati = await db.query<{ record: Record<string, unknown>; event_key: string; conflict_key: string }>(
      "select record, event_key, conflict_key from public.classstatus_suspensions where deployment_namespace = 'production' and record_id = 'tier3-7d2be29935738601a447'");
    expect(makati.rows[0].record).toMatchObject({ id: "tier3-7d2be29935738601a447", lguId: "makati", status: "partial-suspension", affectedLevels: ["all-levels"],
      schoolSector: "public", isAllDay: true, parserOutcome: "accepted:tier3-lgu-suspension:v2", collectorProvenance: { pipeline: "tier3-media" } });
    expect(makati.rows[0].event_key).toBe(eventKey("makati", "all-day:2026-08-28"));
    expect(makati.rows[0].conflict_key).toBe(familyKey("makati"));

    const palace = await db.query<{ record: Record<string, unknown> }>(`select record from public.classstatus_suspensions
      where record_id in ('tier3-38c64eb2ad2632b325ef','tier3-e7588054b36a1880aef8','tier3-19feec500c8ff152a1fc')`);
    expect(palace.rows).toHaveLength(3);
    for (const row of palace.rows) expect(row.record).toMatchObject({ status: "partial-suspension", affectedLevels: ["all-levels"],
      schoolSector: "all", isAllDay: false, startTime: "13:00", endTime: "23:59", parserOutcome: "accepted:tier3-lgu-suspension:v2" });

    const evidence = await db.query<{ lgu: string; sources: number; gma_fingerprint: string | null }>(`select record ->> 'lguId' as lgu,
      jsonb_array_length(record -> 'additionalSources') as sources, record #>> '{additionalSources,0,evidenceFingerprint}' as gma_fingerprint
      from public.classstatus_suspensions where deployment_namespace = 'production' and administrative_state = 'active'
        and provenance_type = 'automatic-collector' and record ->> 'effectiveDate' = '2026-08-28' and record -> 'isAllDay' = 'true'::jsonb`);
    const corroborated = new Set(["caloocan", "malabon", "manila", "marikina", "paranaque", "pateros", "san-juan", "valenzuela"]);
    for (const row of evidence.rows) {
      expect(row.sources).toBe(corroborated.has(row.lgu) ? 1 : 0);
      if (row.sources === 1) expect(row.gma_fingerprint).not.toBe(FALSE_GMA_FINGERPRINT);
    }

    const retiredAfter = await db.query<{ record_id: string; source: unknown; event_key: string; conflict_key: string; revision: number }>(
      "select record_id, record -> 'source' as source, event_key, conflict_key, revision from public.classstatus_suspensions where administrative_state = 'removed' order by record_id");
    expect(retiredAfter.rows).toHaveLength(38);
    for (const before of retiredBefore.rows) {
      const after = retiredAfter.rows.find((row) => row.record_id === before.record_id)!;
      expect(after.source).toEqual(before.source);
      expect(after.event_key).toBe(before.event_key);
      expect(after.conflict_key).toBe(before.conflict_key);
      expect(after.revision).toBe(expectedRows.find((row) => row.id === before.record_id)!.revision + 1);
    }
    for (const recordId of unaffectedIds) {
      expect(await stateFingerprint(db, [recordId])).toBe(unaffectedBefore.get(recordId));
    }
  }, 30_000);

  it("detects an updated_at-only stored-state mutation", async () => {
    const db = await createFixture();
    const before = await stateFingerprint(db, ["unaffected-preview"]);
    await db.exec("update public.classstatus_suspensions set updated_at = updated_at + interval '1 second' where record_id = 'unaffected-preview'");
    expect(await stateFingerprint(db, ["unaffected-preview"])).not.toBe(before);
  });

  it.each([
    ["revision drift", async (db: PGlite) => db.exec("update public.classstatus_suspensions set revision = revision + 1, record = jsonb_set(record, '{revision}', to_jsonb(revision + 1)) where record_id = 'tier3-98c7ebaa676e886302d1'"), "cleanup-reviewed-snapshot-drift"],
    ["event-key drift", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set event_key = '${"a".repeat(64)}', record = jsonb_set(record, '{eventKey}', to_jsonb('${"a".repeat(64)}'::text)) where record_id = 'tier3-98c7ebaa676e886302d1'`), "cleanup-reviewed-snapshot-drift"],
    ["missing Cron", async (db: PGlite) => db.exec("delete from cron.job"), "cleanup-production-collector-cron-not-exactly-one-inactive"],
    ["duplicate Cron", async (db: PGlite) => db.exec("insert into cron.job (jobname, active) values ('classstatus-production-collector-every-minute', false)"), "cleanup-production-collector-cron-not-exactly-one-inactive"],
    ["active Cron", async (db: PGlite) => db.exec("update cron.job set active = true"), "cleanup-production-collector-cron-not-exactly-one-inactive"],
    ["NULL Cron state", async (db: PGlite) => db.exec("update cron.job set active = null"), "cleanup-production-collector-cron-not-exactly-one-inactive"],
    ["active Production lease", async (db: PGlite) => db.exec("insert into public.classstatus_collector_leases values ('production','00000000-0000-0000-0000-000000000001',clock_timestamp(),clock_timestamp() + interval '5 minutes',clock_timestamp())"), "cleanup-production-collector-lease-active"],
    ["missing private record ID", async (db: PGlite) => db.exec("update public.classstatus_suspensions set record = record - 'id' where record_id = 'tier3-98c7ebaa676e886302d1'"), "cleanup-reviewed-snapshot-drift"],
    ["JSON-null private record ID", async (db: PGlite) => db.exec("update public.classstatus_suspensions set record = jsonb_set(record, '{id}', 'null'::jsonb) where record_id = 'tier3-98c7ebaa676e886302d1'"), "cleanup-reviewed-snapshot-drift"],
    ["NULL organization", async (db: PGlite) => db.exec("update public.classstatus_suspensions set record = jsonb_set(record, '{source,organization}', 'null'::jsonb) where record_id = 'tier3-98c7ebaa676e886302d1'"), "cleanup-reviewed-snapshot-drift"],
    ["missing evidence fingerprint", async (db: PGlite) => db.exec("update public.classstatus_suspensions set record = record #- '{source,evidenceFingerprint}' where record_id = 'tier3-98c7ebaa676e886302d1'"), "cleanup-reviewed-snapshot-drift"],
    ["wrong reviewed GMA fingerprint", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set record = jsonb_set(record, '{additionalSources,0,evidenceFingerprint}', to_jsonb('${"b".repeat(64)}'::text)) where record_id = 'tier3-98c7ebaa676e886302d1'`), "cleanup-reviewed-gma-citation-count"],
    ["wrong reviewed donor GMA fingerprint after earlier rewrites", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set record = jsonb_set(record, '{source,evidenceFingerprint}', to_jsonb('${"b".repeat(64)}'::text)) where record_id = 'tier3-423d8fb2b8713efc36c7'`), "cleanup-untrusted-gma-corroboration"],
    ["wrong reviewed Rappler URL", async (db: PGlite) => db.exec("update public.classstatus_suspensions set record = jsonb_set(record, '{source,url}', to_jsonb('https://example.invalid/unreviewed'::text)) where record_id = 'tier3-98c7ebaa676e886302d1'"), "cleanup-untrusted-canonical-primary"],
    ["wrong reviewed Palace fingerprint after canonical rewrites", async (db: PGlite) => db.exec(`update public.classstatus_suspensions set record = jsonb_set(record, '{source,evidenceFingerprint}', to_jsonb('${"b".repeat(64)}'::text)) where record_id = 'tier3-38c64eb2ad2632b325ef'`), "cleanup-untrusted-palace-primary"],
    ["unexpected automatic row", async (db: PGlite) => { const base = legacyRecord(expectedRows[0]); await insertSuspension(db, {
      namespace: "production", id: "unexpected-auto", record: { ...base, id: "unexpected-auto", eventKey: "c".repeat(64) },
      event: "c".repeat(64), conflict: "unexpected", provenance: "automatic-collector" }); }, "cleanup-snapshot-count-drift"],
    ["conflicting Makati record", async (db: PGlite) => { const record = { ...legacyRecord(expectedRows[0]), id: "tier3-7d2be29935738601a447",
      administrativeState: "removed", eventKey: eventKey("makati", "all-day:2026-08-28") }; await insertSuspension(db, {
      namespace: "production", id: "tier3-7d2be29935738601a447", record, event: eventKey("makati", "all-day:2026-08-28"),
      conflict: familyKey("makati"), provenance: "automatic-collector", state: "removed" }); }, "cleanup-makati-canonical-conflict"],
  ] as const)("rolls back every mutation on %s", async (_name, mutate, expectedError) => {
    await expectMigrationRollback(mutate, expectedError);
  }, 30_000);

  it("cannot be destructively reapplied after a successful cleanup", async () => {
    const db = await createFixture();
    await executeMigration(db);
    const before = await stateFingerprint(db);
    const auditsBefore = await db.query<{ count: number }>("select count(*)::int as count from public.classstatus_audit_entries");
    let failure: unknown;
    try { await executeMigration(db); } catch (error) { failure = error; await db.exec("rollback;"); }
    expect(String(failure)).toContain("cleanup-snapshot-count-drift");
    expect(await stateFingerprint(db)).toBe(before);
    const auditsAfter = await db.query<{ count: number }>("select count(*)::int as count from public.classstatus_audit_entries");
    expect(auditsAfter.rows[0].count).toBe(auditsBefore.rows[0].count);
  }, 30_000);

  it("requires exactly one explicitly inactive Cron and never changes scheduler state", () => {
    expect(sql).toContain("pg_catalog.count(*) filter (where scheduled_job.active is false)");
    expect(sql).toContain("cron_count is distinct from 1 or inactive_cron_count is distinct from 1");
    expect(sql).not.toContain("cron.schedule");
    expect(sql).not.toContain("cron.unschedule");
  });
  it("locks and checks the Production lease without modifying lease state", () => {
    expect(sql).toContain("lock table public.classstatus_collector_leases in share mode");
    expect(sql).toContain("lease.lease_expires_at > pg_catalog.clock_timestamp()");
    expect(sql).not.toMatch(/(?:delete|update|insert\s+into)\s+public\.classstatus_collector_leases/i);
  });
  it("keeps the explicit atomic wrapper and never deletes suspensions", () => {
    expect(sql).toMatch(/\nbegin;[\s\S]*\ncommit;\s*$/);
    expect(sql).not.toMatch(/delete\s+from\s+public\.classstatus_suspensions/i);
    expect(sql).toContain("is distinct from array['makati', 'pasig', 'pateros']::text[]");
  });
});
