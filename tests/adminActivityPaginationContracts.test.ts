import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("admin activity pagination contracts", () => {
  it("requests five newest audit entries during bootstrap", () => {
    expect(read("src", "app", "api", "admin", "bootstrap", "route.ts")).toContain("suspensionStore.listAudit(5, 0)");
  });

  it("loads additive five-entry audit pages and deduplicates them", () => {
    const client = read("src", "app", "collector", "AdminConsoleClient.tsx");
    expect(client).toContain("?page=${page}&limit=5");
    expect(client).toContain("filter((entry: AuditEntry) => !current.audit.some((existing) => existing.id === entry.id))");
    expect(client).toContain('busy === "load-audit" ? "Loading activity…" : "Load more activity"');
    expect(client).toContain("data.audit.length < data.auditTotal");
  });
});
