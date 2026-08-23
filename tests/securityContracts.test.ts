import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { projectPublicSuspension } from "@/lib/admin/publicProjection";
import type { SuspensionRecord } from "@/types";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260823083017_isolate_production_sessions_and_throttle.sql"
);

describe("security deployment contracts", () => {
  it("keeps committed migration versions aligned with the deployed history", () => {
    const names = fs.readdirSync(path.join(process.cwd(), "supabase", "migrations"));
    expect(names).toEqual(expect.arrayContaining([
      "20260823065312_classstatus_durable_state.sql",
      "20260823065639_harden_function_privileges.sql",
      "20260823070947_enforce_single_admin_principal.sql",
      "20260823083017_isolate_production_sessions_and_throttle.sql",
    ]));
  });

  it("removes the anonymous failure writer that could manufacture global lockouts", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");
    const authSource = fs.readFileSync(path.join(process.cwd(), "src", "lib", "admin", "auth.ts"), "utf8");
    expect(migration).toContain("drop function public.classstatus_preview_check_login_throttle(text)");
    expect(migration).toContain("drop function public.classstatus_production_check_login_throttle(text)");
    expect(migration).toContain("drop function public.classstatus_preview_record_login_failure(text)");
    expect(migration).toContain("drop function public.classstatus_production_record_login_failure(text)");
    expect(authSource).not.toContain("_record_login_failure`");
  });

  it("makes every Production session-guard write service-role-only", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");
    expect(migration).toContain("drop function public.classstatus_production_start_admin_session(text, text)");
    expect(migration).toContain("classstatus_production_start_admin_session(text, text, uuid, uuid)");
    expect(migration).toContain("classstatus_production_touch_admin_session(boolean, uuid, uuid)");
    expect(migration).toContain("classstatus_production_revoke_admin_session(uuid, uuid)");
    expect(migration).toMatch(/grant execute on function public\.classstatus_production_start_admin_session\(text, text, uuid, uuid\)\s+to service_role/i);
    expect(migration).not.toMatch(/grant execute on function public\.classstatus_production_(?:start|touch|revoke)_admin_session[\s\S]{0,100}to authenticated/i);
  });

  it("projects public records without administrative or collector internals", () => {
    const record: SuspensionRecord = {
      id: "public-record",
      lguId: "manila",
      status: "classes-suspended",
      affectedLevels: ["all-levels"],
      schoolSector: "all",
      effectiveDate: "2026-08-23",
      isAllDay: true,
      reason: "Heavy rain",
      announcementSummary: "Classes are suspended.",
      source: {
        id: "gma-news-walang-pasok",
        name: "GMA News",
        organization: "GMA Network",
        url: "https://www.gmanetwork.com/news/example",
        type: "news-reputable",
        reliabilityTier: 3,
        verified: false,
        publishedAt: "2026-08-23T00:00:00.000Z",
      },
      confidence: "medium",
      discoveredAt: "2026-08-23T00:00:00.000Z",
      publishedAt: "2026-08-23T00:00:00.000Z",
      lifecycleState: "active",
      isActive: true,
      isUpcoming: false,
      isExpired: false,
      collectorProvenance: {
        pipeline: "tier3-media",
        runId: "private-run-id",
        collectedAt: "2026-08-23T00:01:00.000Z",
      },
      administrativeState: "active",
      revision: 7,
      eventKey: "a".repeat(64),
    };
    const projected = projectPublicSuspension(record) as Record<string, unknown>;
    expect(projected).not.toHaveProperty("collectorProvenance");
    expect(projected).not.toHaveProperty("administrativeState");
    expect(projected).not.toHaveProperty("revision");
    expect(projected).not.toHaveProperty("eventKey");
    expect(JSON.stringify(projected)).not.toContain("private-run-id");
  });
});
