import { describe, expect, it } from "vitest";
import { normalizeAnnouncementSegments } from "../src/collector/normalizer";

const context = {
  articleTitle: "Class suspensions for August 23, 2026",
  publishedAt: "2026-08-22T21:00:00+08:00",
  now: new Date("2026-08-23T08:00:00+08:00"),
};

describe("hostile collector statement boundaries", () => {
  it.each([
    "Classes are suspended throughout Metro Manila in all levels, public and private, on August 23, 2026, except Makati City.",
    "Classes are suspended throughout Metro Manila in all levels, public and private, on August 23, 2026, with the exception of Makati City.",
    "Classes are suspended throughout Metro Manila in all levels, public and private, on August 23, 2026, but not Makati City.",
    "Classes are suspended throughout Metro Manila in all levels, public and private, on August 23, 2026, bukod sa Makati City.",
    "Manila - Classes are suspended in all levels, public and private, on August 23, 2026, excluding college students.",
    "Manila - Classes are suspended in all levels, public and private, on August 23, 2026, only in flood-affected barangays.",
    "Manila - Classes are suspended in all levels, public and private, on August 23, 2026, in selected districts.",
  ])("does not broaden an explicitly restricted announcement: %s", (statement) => {
    const results = normalizeAnnouncementSegments(statement, context);
    expect(results.some((result) => result.publishable)).toBe(false);
  });

  it.each([
    "Manila Experimental Academy - Classes are suspended in all levels, public and private, on August 23, 2026.",
    "Manila Experimental College - Classes are suspended in all levels, public and private, on August 23, 2026.",
    "Manila Learning Center - Classes are suspended in all levels, public and private, on August 23, 2026.",
    "Makati Riverside School - Classes are suspended in all levels, public and private, on August 23, 2026.",
    "Unregistered University of Pasig - Classes are suspended in all levels, public and private, on August 23, 2026.",
  ])("does not promote an unregistered institution to an LGU: %s", (statement) => {
    const results = normalizeAnnouncementSegments(statement, context);
    expect(results.some((result) => result.publishable)).toBe(false);
  });

  it("does not lose a trailing exception during statement segmentation", () => {
    const results = normalizeAnnouncementSegments("Classes are suspended throughout Metro Manila in all levels, public and private, on August 23, 2026.\nExcept Makati City.", context);
    expect(results).toMatchObject([{ publishable: false, rejectionReason: "unsupported-restricted-scope" }]);
  });

  it("bounds LGU expansion before any statements can be published", () => {
    const statement = "Classes are suspended throughout Metro Manila in all levels, public and private, on August 23, 2026.";
    const results = normalizeAnnouncementSegments(Array.from({ length: 16 }, () => statement).join("\n"), context);
    expect(results).toMatchObject([{ publishable: false, rejectionReason: "article-complexity-limit" }]);
  });

  it.each(["x".repeat(128_001), "x".repeat(4_001)])("bounds article and indivisible statement size", (text) => {
    expect(normalizeAnnouncementSegments(text, context)).toMatchObject([{ publishable: false, rejectionReason: "article-complexity-limit" }]);
  });

  it("rejects an entire excessive statement batch before producing publication work", () => {
    const statement = "Classes are suspended throughout Metro Manila in all levels, public and private, on August 23, 2026.";
    const results = normalizeAnnouncementSegments(Array.from({ length: 600 }, () => statement).join("\n"), context);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ publishable: false, rejectionReason: "article-complexity-limit" });
  });
});
