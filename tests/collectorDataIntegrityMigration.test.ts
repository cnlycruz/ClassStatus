import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const filename = "20260828090012_stabilize_collector_notice_identity.sql";
const sql = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", filename), "utf8");
const correctionFilename = "20260828135913_fix_collector_v2_corroboration_noop.sql";
const correctionSql = fs.readFileSync(
  path.join(process.cwd(), "supabase", "migrations", correctionFilename),
  "utf8"
);
const adminUi = fs.readFileSync(path.join(process.cwd(), "src", "app", "collector", "AdminConsoleClient.tsx"), "utf8");
const packageJson = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");

describe("collector data-integrity migration contract", () => {
  it("derives and verifies both signed v2 keys independently in PostgreSQL", () => {
    expect(sql).toContain("classstatus-notice-family-v2");
    expect(sql).toContain("classstatus-notice-event-v2");
    expect(sql).toContain("p_event_key <> expected_event_key");
    expect(sql).toContain("p_record ->> 'eventKey' <> expected_event_key");
    expect(sql).toContain("p_conflict_key <> expected_family_key");
    expect(sql).toContain("classstatus:collector-policy-key-rejected");
  });

  it("requires trusted parser policy v2 in addition to the existing Tier 3 boundary", () => {
    expect(sql).toContain("accepted:tier3-lgu-suspension:v2");
    expect(sql).toContain("p_record #>> '{collectorProvenance,pipeline}' <> 'tier3-media'");
    expect(sql).toContain("p_record #>> '{source,id}' not in ('rappler-walang-pasok', 'gma-news-walang-pasok')");
    expect(sql).toContain("p_record #>> '{source,type}' <> 'news-reputable'");
    expect(sql).toContain("source,reliabilityTier");
  });

  it("supports legacy lookup and old-app manual publication without rekeying stored manual rows", () => {
    expect(sql).toContain("classstatus_private.notice_family_key(p_namespace, suspension.record)");
    expect(sql).toContain("classstatus_private.notice_event_key(p_namespace, suspension.record)");
    expect(sql).toContain("event_key ~ '^(?:[0-9a-f]{64}|v2e:[0-9a-f]{64})$'");
    expect(sql).toContain("event_key like 'v2e:%' and event_key <> expected_event_key");
    expect(sql).toContain("provenance_type = 'manual-admin'");
    expect(sql).toContain("duplicates-manual:");
    expect(sql).not.toContain("create or replace function classstatus_private.mutate_lifecycle");
  });

  it("counts the distinct union of exact and overlapping active collector candidates", () => {
    expect(sql).toContain("count(distinct suspension.record_id)");
    expect(sql).toContain("suspension.administrative_state in ('active', 'pending_removal')");
    expect(sql).toMatch(/notice_event_key\(p_namespace, suspension\.record\) = expected_event_key\s+or classstatus_private\.notice_windows_overlap\(suspension\.record, p_record\)/);
    expect(sql).toContain("if plausible_count > 1 then");
    expect(sql).toContain("legacy-duplicates-require-cleanup");
    expect(sql).not.toContain("exact_count");
    expect(sql).not.toContain("overlap_count");
  });

  it("retires the obsolete privileged importer and its supported script surface", () => {
    expect(sql).toContain("drop function if exists public.classstatus_preview_import_suspensions(jsonb)");
    expect(sql).toContain("drop function if exists public.classstatus_production_import_suspensions(jsonb)");
    expect(sql).toContain("drop function if exists classstatus_private.import_suspensions(text, jsonb)");
    expect(sql).not.toContain("create or replace function classstatus_private.import_suspensions");
    expect(fs.existsSync(path.join(process.cwd(), "scripts", "import-suspensions-to-supabase.mjs"))).toBe(false);
    expect(packageJson).not.toContain("data:import-suspensions");
  });

  it("shows explicit status and readable scope while applying the same stable UI order", () => {
    expect(adminUi).toContain('"Full suspension" : "Partial suspension"');
    expect(adminUi).toContain('return "All levels"');
    expect(adminUi).toContain('return "Preschool–SHS"');
    expect(adminUi).toContain(".sort(stableRecordOrder)");
    expect(adminUi).not.toContain("updatedAt");
  });

  it("returns before any row update for exact evidence and semantic no-ops", () => {
    const unchanged = sql.indexOf("'action', 'unchanged', 'record', existing.record");
    const update = sql.indexOf("update public.classstatus_suspensions suspension", unchanged);
    expect(unchanged).toBeGreaterThan(0);
    expect(update).toBeGreaterThan(unchanged);
    expect(sql.slice(unchanged, update)).not.toContain("updated_at =");
  });

  it("retains only current organizations as public corroboration and bounds them", () => {
    expect(sql).toContain("distinct on (organization)");
    expect(sql).toContain("limit 4");
    expect(sql).toContain("'additionalSources', coalesce(verified_sources - 0, '[]'::jsonb)");
    expect(sql).not.toContain("supersededSources");
  });

  it("keeps deterministic Admin ordering independent of updated_at", () => {
    const snapshot = sql.slice(sql.indexOf("create or replace function classstatus_private.admin_snapshot"));
    expect(snapshot).toContain("suspension.record ->> 'effectiveDate'");
    expect(snapshot).toContain("case when suspension.record ? 'schoolId' then 1 else 0 end");
    expect(snapshot).toContain("suspension.created_at");
    expect(snapshot).not.toContain("suspension.updated_at");
  });

  it("preserves hardened function security and does not alter scheduler state", () => {
    expect(sql).toMatch(/create or replace function classstatus_private\.upsert_collected[\s\S]*?security definer\s+set search_path = ''/i);
    expect(sql).toMatch(/create or replace function classstatus_private\.publish_manual[\s\S]*?security definer\s+set search_path = ''/i);
    expect(sql).toContain("revoke execute on all functions in schema classstatus_private");
    expect(sql).not.toContain("cron.schedule");
    expect(sql).not.toContain("cron.unschedule");
  });

  it("uses a forward migration for compatible repeated corroborator no-ops", () => {
    expect(correctionSql).toContain("candidate_is_primary boolean");
    expect(correctionSql).toContain("and not candidate_is_primary");
    expect(correctionSql).toContain("and relation = 'equal'");
    expect(correctionSql).toContain("existing.record ->> 'status' = p_record ->> 'status'");
    const corroboratorNoop = correctionSql.indexOf("and not candidate_is_primary");
    const primaryConflict = correctionSql.indexOf("collector-policy-version-conflict", corroboratorNoop);
    expect(corroboratorNoop).toBeGreaterThan(0);
    expect(primaryConflict).toBeGreaterThan(corroboratorNoop);
  });

  it("marks every successful v2 mutation with parser policy v2", () => {
    const mergedRecord = correctionSql.slice(correctionSql.indexOf("merged := preferred"));
    expect(mergedRecord).toContain("'parserOutcome', 'accepted:tier3-lgu-suspension:v2'");
    expect(mergedRecord).toContain("updated_at = pg_catalog.clock_timestamp()");
  });

  it("preserves the signed v2 boundary and private-function security in the correction", () => {
    expect(correctionSql).toMatch(/create or replace function classstatus_private\.upsert_collected[\s\S]*?security definer\s+set search_path = ''/i);
    expect(correctionSql).toContain("p_event_key <> expected_event_key");
    expect(correctionSql).toContain("p_conflict_key <> expected_family_key");
    expect(correctionSql).toContain("duplicates-manual:");
    expect(correctionSql).toContain("suspension.deployment_namespace = p_namespace");
    expect(correctionSql).toContain("revoke execute on function classstatus_private.upsert_collected(");
    expect(correctionSql).not.toContain("create or replace function public.");
    expect(correctionSql).not.toContain("cron.schedule");
    expect(correctionSql).not.toContain("cron.unschedule");
  });
});
