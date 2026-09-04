import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("public suspension-alert settings contracts", () => {
  it("moves alert controls out of the dashboard card and beside the theme control", () => {
    const page = read("src", "app", "page.tsx");
    const navbar = read("src", "components", "Navbar.tsx");
    expect(page).not.toContain("<SuspensionAlerts");
    expect(navbar).toContain('import { SuspensionAlerts } from "./SuspensionAlerts"');
    expect(navbar.indexOf("<SuspensionAlerts")).toBeLessThan(navbar.indexOf("Dark / Light Theme Toggle"));
  });

  it("keeps manual settings available while making automatic prompting local and bounded", () => {
    const alerts = read("src", "components", "SuspensionAlerts.tsx");
    expect(alerts).toContain("SUSPENSION_ALERTS_DISMISS_KEY");
    expect(alerts).toContain("shouldAutoOpenAlertSetup");
    expect(alerts).toContain("openedThisVisit: autoOpened.current");
    expect(alerts).toContain('onClick={() => setOpen(true)}');
    expect(alerts).toContain("Don&apos;t show again");
    expect(alerts).toContain('Notification.requestPermission()');
    expect(alerts).toContain('onClick={enable}');
  });

  it("uses truthful bell states and preserves secure server-side preference operations", () => {
    const alerts = read("src", "components", "SuspensionAlerts.tsx");
    expect(alerts).toContain("<BellOff");
    expect(alerts).toContain("<Bell");
    expect(alerts).toContain('method: "PATCH"');
    expect(alerts).toContain('method: "DELETE"');
    expect(alerts).toContain("await upsertSubscription()");
    expect(alerts).toContain("allAlertLocations()");
  });

  it("renders a viewport-fixed, portal-based dialog with bounded internal scrolling", () => {
    const alerts = read("src", "components", "SuspensionAlerts.tsx");
    expect(alerts).toContain('from "react-dom"');
    expect(alerts).toContain("createPortal(");
    expect(alerts).toContain("document.body");
    expect(alerts).toContain("fixed inset-0 z-[100]");
    expect(alerts).toContain("100dvh");
    expect(alerts).toContain("safe-area-inset-top");
    expect(alerts).toContain("safe-area-inset-bottom");
    expect(alerts).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(alerts).toContain("flex shrink-0 flex-col-reverse");
    expect(alerts).toContain('body.style.overflow = "hidden"');
    expect(alerts).not.toContain("items-end justify-center bg-slate-950/60 p-3");
  });
});
