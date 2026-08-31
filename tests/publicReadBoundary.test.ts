import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSuspensions } from "@/collector/storage";
import { GET as getLgus } from "@/app/api/lgus/route";
import { localStateStore, localSuspensionStore } from "@/lib/storage/localJson";
import type { SuspensionRecord } from "@/types";

const originalEnvironment = {
  dataDirectory: process.env.CLASSSTATUS_DATA_DIR,
  storageDriver: process.env.CLASSSTATUS_STORAGE_DRIVER,
  vercel: process.env.VERCEL,
  vercelEnvironment: process.env.VERCEL_ENV,
};

let testDataDirectory: string;

function automaticRecord(
  id: string,
  lguId: SuspensionRecord["lguId"],
  overrides: Partial<SuspensionRecord> = {}
): SuspensionRecord {
  return {
    id,
    lguId,
    status: "classes-suspended",
    affectedLevels: ["all-levels"],
    schoolSector: "all",
    effectiveDate: "2026-08-28",
    isAllDay: true,
    reason: "Heavy rainfall",
    announcementSummary: "Classes are suspended.",
    fullAnnouncementText: "Private full announcement text",
    source: {
      id: "gma-news-walang-pasok",
      name: "GMA News",
      organization: "GMA Network",
      url: `https://www.gmanetwork.com/news/${id}`,
      type: "news-reputable",
      reliabilityTier: 3,
      verified: false,
      publishedAt: "2026-08-27T20:00:00+08:00",
    },
    confidence: "medium",
    discoveredAt: "2026-08-27T20:01:00+08:00",
    publishedAt: "2026-08-27T20:00:00+08:00",
    lifecycleState: "upcoming",
    isActive: false,
    isUpcoming: true,
    isExpired: false,
    eventKey: id.padEnd(64, "a").slice(0, 64),
    parserOutcome: "private-parser-result",
    collectorProvenance: {
      pipeline: "tier3-media",
      runId: "private-run-id",
      collectedAt: "2026-08-27T20:01:00+08:00",
    },
    publicationProvenance: {
      type: "automatic-collector",
      publicLabel: "Published from approved Tier 3 media evidence",
    },
    administrativeState: "active",
    revision: 3,
    ...overrides,
  };
}

function manualRecord(id: string, lguId: SuspensionRecord["lguId"]): SuspensionRecord {
  return {
    ...automaticRecord(id, lguId),
    source: {
      id: "manual-admin",
      name: "ClassStatus Admin",
      organization: "ClassStatus",
      url: "https://pasay.gov.ph/suspension",
      type: "manual-evidence",
      verified: true,
      publishedAt: "2026-08-27T20:00:00+08:00",
    },
    confidence: "admin-verified",
    collectorProvenance: undefined,
    publicationProvenance: {
      type: "manual-admin",
      publicLabel: "Manually verified by Class Status Admin",
    },
    manualEvidence: {
      providerPreset: "lgu-official-announcement",
      providerName: "Pasay City Government",
      proofUrl: "https://pasay.gov.ph/suspension",
    },
  };
}

function restoreEnvironment() {
  for (const [name, value] of [
    ["CLASSSTATUS_DATA_DIR", originalEnvironment.dataDirectory],
    ["CLASSSTATUS_STORAGE_DRIVER", originalEnvironment.storageDriver],
    ["VERCEL", originalEnvironment.vercel],
    ["VERCEL_ENV", originalEnvironment.vercelEnvironment],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

describe("approved public suspension read boundary", () => {
  beforeEach(() => {
    testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "classstatus-public-read-"));
    process.env.CLASSSTATUS_DATA_DIR = testDataDirectory;
    process.env.CLASSSTATUS_STORAGE_DRIVER = "local-json";
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnvironment();
    fs.rmSync(testDataDirectory, { recursive: true, force: true });
  });

  it("filters locally before projection and strips every private publication field", async () => {
    const activeAutomatic = automaticRecord("automatic-public", "pateros");
    const activeManual = manualRecord("manual-public", "pasay");
    const removed = automaticRecord("removed-private", "pasig", { administrativeState: "removed" });
    const demo = automaticRecord("demo-private", "paranaque", { isDemo: true, confidence: "demo" });
    const invalidCollector = automaticRecord("invalid-private", "taguig", { collectorProvenance: undefined });
    localStateStore.mutateState((state) => {
      state.records = [activeAutomatic, activeManual, removed, demo, invalidCollector];
    });

    const records = await localSuspensionStore.listPublicRecords();

    expect(records.map((record) => record.id)).toEqual(["automatic-public", "manual-public"]);
    for (const record of records) {
      expect(record).not.toHaveProperty("administrativeState");
      expect(record).not.toHaveProperty("revision");
      expect(record).not.toHaveProperty("eventKey");
      expect(record).not.toHaveProperty("collectorProvenance");
      expect(record).not.toHaveProperty("parserOutcome");
      expect(record).not.toHaveProperty("fullAnnouncementText");
    }
  });

  it("lets projected automatic and manual records update the public LGU dashboard", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T08:00:00+08:00"));
    localStateStore.mutateState((state) => {
      state.records = [
        automaticRecord("pateros-full", "pateros"),
        automaticRecord("pasig-partial", "pasig", {
          status: "partial-suspension",
          affectedLevels: ["elementary", "junior-high"],
          schoolSector: "public",
        }),
        automaticRecord("paranaque-upcoming", "paranaque", { effectiveDate: "2026-08-29" }),
        manualRecord("pasay-manual", "pasay"),
        automaticRecord("taguig-removed", "taguig", { administrativeState: "removed" }),
      ];
    });

    const approved = await getSuspensions();
    expect(approved).toHaveLength(4);
    expect(approved.find((record) => record.id === "pateros-full")?.collectorProvenance).toBeUndefined();

    const response = await getLgus();
    const body = await response.json();
    const lgu = (id: string) => body.lgus.find((item: { id: string }) => item.id === id);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(lgu("pateros")).toMatchObject({ status: "classes-suspended", hasUpcoming: false });
    expect(lgu("pasig")).toMatchObject({ status: "partial-suspension", hasUpcoming: false });
    expect(lgu("paranaque")).toMatchObject({ status: "classes-suspended", hasUpcoming: true });
    expect(lgu("pasay")).toMatchObject({ status: "classes-suspended", hasUpcoming: false });
    expect(lgu("taguig")).toMatchObject({ status: "awaiting-information", hasUpcoming: false });
    expect(JSON.stringify(body)).not.toMatch(/private-run-id|private-parser-result|Private full announcement text/);
    expect(JSON.stringify(body)).not.toMatch(/collectorProvenance|administrativeState|eventKey|revision|parserOutcome|fullAnnouncementText/);
  });
});
