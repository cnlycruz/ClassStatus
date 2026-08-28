import { beforeAll, describe, expect, it } from "vitest";
import argon2 from "argon2";
import { getManilaDateString, getManilaTomorrowDateString } from "@/utils/philippineTime";
import { normalizeManualDraft } from "@/lib/admin/validation";
import { createLoginChallenge, isStoredSessionValidForToken, verifyAdminCredentials, verifyLoginChallenge } from "@/lib/admin/auth";
import { getAdminConfig } from "@/lib/admin/config";
import { hmac } from "@/lib/admin/crypto";

beforeAll(async () => {
  process.env.CLASSSTATUS_ADMIN_USERNAME = "classstatus-admin";
  process.env.CLASSSTATUS_ADMIN_PASSWORD_HASH = await argon2.hash("correct horse battery staple", { type: argon2.argon2id, memoryCost: 8192, timeCost: 1 });
  process.env.CLASSSTATUS_SESSION_SECRET = Buffer.alloc(32, 7).toString("base64");
  process.env.CLASSSTATUS_PUBLIC_ORIGIN = "http://localhost:3000";
  process.env.CLASSSTATUS_STORAGE_DRIVER = "local-json";
});

function baseDraft() {
  return {
    targetType: "lgu", targetId: "caloocan", sector: "all", affectedLevels: ["all-levels"], effectiveDate: getManilaDateString(),
    reason: { preset: "heavy-rain" }, duration: { preset: "whole-day", isAllDay: true }, evidence: { preset: "lgu-official-announcement" },
    proofUrl: "https://caloocancity.gov.ph/advisories/classes", publicNote: "Stay safe.",
  };
}

describe("admin validation and authentication primitives", () => {
  it("derives registry metadata and full LGU status server-side", () => {
    const result = normalizeManualDraft(baseDraft());
    expect(result.targetName).toBe("Caloocan"); expect(result.lguId).toBe("caloocan"); expect(result.status).toBe("classes-suspended");
  });
  it("locks school sector and offered levels to the registry", () => {
    const result = normalizeManualDraft({ ...baseDraft(), targetType: "school", targetId: "ust-manila", sector: "public", affectedLevels: ["college"] });
    expect(result.schoolId).toBe("ust-manila"); expect(result.sector).toBe("private"); expect(result.status).toBe("partial-suspension");
    const fullSchool = normalizeManualDraft({ ...baseDraft(), targetType: "school", targetId: "ust-manila", sector: "public", affectedLevels: ["all-levels"] });
    expect(fullSchool.sector).toBe("private"); expect(fullSchool.status).toBe("classes-suspended");
    expect(() => normalizeManualDraft({ ...baseDraft(), targetType: "school", targetId: "ust-manila", affectedLevels: ["preschool"] })).toThrow("school-level-mismatch");
  });
  it("enforces today/tomorrow, exact partial times, and safe proof URLs", () => {
    expect(normalizeManualDraft({ ...baseDraft(), effectiveDate: getManilaTomorrowDateString() }).effectiveDate).toBe(getManilaTomorrowDateString());
    expect(() => normalizeManualDraft({ ...baseDraft(), effectiveDate: "2026-01-01" })).toThrow("effective-date-outside-live-window");
    expect(() => normalizeManualDraft({ ...baseDraft(), duration: { preset: "morning-classes" } })).toThrow("duration-time-invalid");
    expect(() => normalizeManualDraft({ ...baseDraft(), proofUrl: "javascript:alert(1)" })).toThrow("proof-url-invalid");
    expect(() => normalizeManualDraft({ ...baseDraft(), proofUrl: "https://user:pass@example.com/proof" })).toThrow("proof-url-invalid");
  });
  it("requires clean Other values while preserving plain text", () => {
    const result = normalizeManualDraft({ ...baseDraft(), reason: { preset: "other", customValue: "  Localized advisory <script>alert(1)</script>  " } });
    expect(result.resolvedReason).toBe("Localized advisory <script>alert(1)</script>");
    expect(() => normalizeManualDraft({ ...baseDraft(), reason: { preset: "other", customValue: "   " } })).toThrow("reason-invalid");
  });
  it("verifies Argon2 credentials without enumerating the username path", async () => {
    expect(await verifyAdminCredentials("classstatus-admin", "correct horse battery staple")).toBe(true);
    expect(await verifyAdminCredentials("someone-else", "correct horse battery staple")).toBe(false);
    expect(await verifyAdminCredentials("classstatus-admin", "wrong password")).toBe(false);
  });
  it("signs and expires login challenges", () => {
    const challenge = createLoginChallenge(); expect(verifyLoginChallenge(challenge)).toBe(true); expect(verifyLoginChallenge(`${challenge}tampered`)).toBe(false);
  });
  it("rejects tampered, idle-expired, absolute-expired, and credential-stale sessions", () => {
    const config = getAdminConfig(); const now = Date.now(); const token = "test-session-token";
    const session = { id: "session", tokenDigest: hmac(`session:${token}`, config.sessionSecret), credentialVersion: config.credentialVersion, createdAt: new Date(now - 60_000).toISOString(), lastSeenAt: new Date(now - 60_000).toISOString(), absoluteExpiresAt: new Date(now + 60_000).toISOString() };
    expect(isStoredSessionValidForToken(session, token, now)).toBe(true);
    expect(isStoredSessionValidForToken(session, "tampered", now)).toBe(false);
    expect(isStoredSessionValidForToken({ ...session, lastSeenAt: new Date(now - 31 * 60_000).toISOString() }, token, now)).toBe(false);
    expect(isStoredSessionValidForToken({ ...session, absoluteExpiresAt: new Date(now).toISOString() }, token, now)).toBe(false);
    expect(isStoredSessionValidForToken({ ...session, credentialVersion: "stale" }, token, now)).toBe(false);
  });
});
