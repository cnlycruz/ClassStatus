import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("manual refresh feedback", () => {
  it("ties the public refresh icon to the manual request lifecycle, not dashboard polling", () => {
    const page = read("src", "app", "page.tsx");
    const hero = read("src", "components", "StatusHero.tsx");

    expect(page).toContain("const manualDashboardRefreshInFlight = useRef(false)");
    expect(page).toContain("const handleDashboardRefresh = useCallback(async () =>");
    expect(page).toContain("await loadData()");
    expect(page).toContain("setIsDashboardRefreshing(true)");
    expect(page).toContain("setIsDashboardRefreshing(false)");
    expect(page).toContain("onRefresh={handleDashboardRefresh}");
    expect(page).toContain("isRefreshing={isDashboardRefreshing}");
    expect(hero).toContain('isRefreshing ? "animate-spin" : ""');
    expect(hero).toContain("disabled={isRefreshing}");
    expect(hero).toContain("aria-busy={isRefreshing}");
  });

  it("shares the collector overview request and clears feedback after success or failure", () => {
    const admin = read("src", "app", "collector", "AdminConsoleClient.tsx");

    expect(admin).toContain("const loadRequest = useRef<Promise<void> | null>(null)");
    expect(admin).toContain("if (loadRequest.current) return loadRequest.current");
    expect(admin).toContain("const overviewRefreshInFlight = useRef(false)");
    expect(admin).toContain("async function refreshOverview()");
    expect(admin).toContain("setIsOverviewRefreshing(true)");
    expect(admin).toContain("finally { overviewRefreshInFlight.current = false; setIsOverviewRefreshing(false); }");
    expect(admin).toContain("disabled={isOverviewRefreshing}");
    expect(admin).toContain("aria-busy={isOverviewRefreshing}");
    expect(admin).toContain('isOverviewRefreshing ? "animate-spin" : ""');
  });
});
