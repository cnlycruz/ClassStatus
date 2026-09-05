import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  detectInstallPlatform,
  initialInstallState,
  INSTALL_PROMPT_RETRY_MS,
  installReducer,
  invokeNativeInstallPrompt,
  shouldAutoShowInstallPrompt,
  type BeforeInstallPromptEvent,
  type InstallState,
} from "@/lib/pwaInstall";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

function eligibleState(overrides: Partial<InstallState> = {}): InstallState {
  return {
    ...initialInstallState,
    ready: true,
    platform: "android-chromium",
    ...overrides,
  };
}

function promptEvent(outcome: "accepted" | "dismissed"): BeforeInstallPromptEvent {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  } as unknown as BeforeInstallPromptEvent;
}

describe("PWA install eligibility", () => {
  it("allows the popup for an eligible non-installed user", () => {
    expect(shouldAutoShowInstallPrompt({ state: eligibleState(), now: Date.now() })).toBe(true);
  });

  it("does not allow the popup while running standalone", () => {
    expect(shouldAutoShowInstallPrompt({ state: eligibleState({ standalone: true }), now: Date.now() })).toBe(false);
  });

  it("remembers dismissal during the retry window", () => {
    const now = Date.now();
    expect(shouldAutoShowInstallPrompt({ state: eligibleState({ dismissedAt: now - 1_000 }), now })).toBe(false);
  });

  it("becomes eligible again after seven days", () => {
    const now = Date.now();
    expect(
      shouldAutoShowInstallPrompt({
        state: eligibleState({ dismissedAt: now - INSTALL_PROMPT_RETRY_MS - 1 }),
        now,
      }),
    ).toBe(true);
  });

  it("classifies the supported platform guides", () => {
    expect(detectInstallPlatform({ userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1 Version/17 Mobile Safari/604.1" })).toBe("ios-safari");
    expect(detectInstallPlatform({ userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1 CriOS/125 Mobile" })).toBe("ios-other");
    expect(detectInstallPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125 Mobile" })).toBe("android-chromium");
    expect(detectInstallPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125" })).toBe("desktop-chromium");
  });
});

describe("native installation state", () => {
  it.each(["accepted", "dismissed"] as const)("returns the browser's %s choice", async (outcome) => {
    const event = promptEvent(outcome);
    await expect(invokeNativeInstallPrompt(event)).resolves.toBe(outcome);
    expect(event.prompt).toHaveBeenCalledOnce();
  });

  it("reports an unavailable prompt without claiming success", async () => {
    await expect(invokeNativeInstallPrompt(null)).resolves.toBe("unavailable");
  });

  it("marks appinstalled as installed and suppresses future prompts", () => {
    const installed = installReducer(eligibleState({ canPrompt: true, dismissedAt: Date.now() }), { type: "INSTALLED" });
    expect(installed).toMatchObject({ installed: true, standalone: true, canPrompt: false, dismissedAt: null });
    expect(shouldAutoShowInstallPrompt({ state: installed, now: Date.now() })).toBe(false);
  });
});

describe("install experience contracts", () => {
  it("keeps installation in the mobile menu without adding it to desktop navigation", () => {
    const navbar = read("src", "components", "Navbar.tsx");
    const desktopNavEnd = navbar.indexOf("</nav>");
    expect(navbar).toContain('href="/install"');
    expect(navbar).toContain("Install ClassStatus");
    expect(navbar.indexOf('href="/install"')).toBeGreaterThan(desktopNavEnd);
  });

  it("provides the install route and visual platform instructions", () => {
    const page = read("src", "app", "install", "page.tsx");
    const guide = read("src", "components", "InstallGuide.tsx");
    expect(page).toContain("<InstallGuide />");
    expect(page).toContain("Keep ClassStatus on your home screen for quick access to class suspension updates.");
    expect(guide).toContain("Tap the Share button");
    expect(guide).toContain("Add to Home Screen");
    expect(guide).toContain("Open ClassStatus in Safari first to add it to your home screen.");
    expect(guide).toContain("Open the Chrome menu");
    expect(guide).toContain("Choose Install app");
    expect(guide).toContain("Open from your home screen");
  });

  it("listens for native prompt availability and successful installation", () => {
    const provider = read("src", "components", "InstallProvider.tsx");
    expect(provider).toContain('window.matchMedia("(display-mode: standalone)")');
    expect(provider).toContain('window.addEventListener("beforeinstallprompt"');
    expect(provider).toContain('window.addEventListener("appinstalled"');
    expect(provider).toContain("NavigatorWithStandalone");
  });
});
