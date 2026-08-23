import { describe, expect, it } from "vitest";
import { getInitialDashboardSelection } from "@/lib/dashboardSelection";

describe("dashboard initial LGU selection", () => {
  it("keeps a clean dashboard load unselected", () => {
    expect(getInitialDashboardSelection(null)).toBeNull();
  });

  it("does not infer Manila from a missing or invalid query value", () => {
    expect(getInitialDashboardSelection("")).toBeNull();
    expect(getInitialDashboardSelection("not-an-lgu")).toBeNull();
  });

  it("preserves a deliberate valid LGU deep link", () => {
    expect(getInitialDashboardSelection("manila")).toBe("manila");
  });
});
