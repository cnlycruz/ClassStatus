export const INSTALL_PROMPT_DISMISSED_AT_KEY = "classstatus-install-prompt-dismissed-at";
export const INSTALL_COMPLETED_KEY = "classstatus-install-completed";
export const INSTALL_PROMPT_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

export type InstallPlatform =
  | "ios-safari"
  | "ios-other"
  | "android-chromium"
  | "desktop-chromium"
  | "other";

export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface InstallEnvironment {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

export interface InstallState {
  ready: boolean;
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  platform: InstallPlatform;
  dismissedAt: number | null;
}

export type InstallAction =
  | { type: "INITIALIZED"; state: Omit<InstallState, "ready"> }
  | { type: "PROMPT_AVAILABLE" }
  | { type: "PROMPT_CONSUMED" }
  | { type: "DISMISSED"; at: number }
  | { type: "INSTALLED" }
  | { type: "STANDALONE_CHANGED"; standalone: boolean };

export const initialInstallState: InstallState = {
  ready: false,
  standalone: false,
  installed: false,
  canPrompt: false,
  platform: "other",
  dismissedAt: null,
};

export function installReducer(state: InstallState, action: InstallAction): InstallState {
  switch (action.type) {
    case "INITIALIZED":
      return { ...action.state, ready: true };
    case "PROMPT_AVAILABLE":
      return { ...state, canPrompt: true };
    case "PROMPT_CONSUMED":
      return { ...state, canPrompt: false };
    case "DISMISSED":
      return { ...state, dismissedAt: action.at };
    case "INSTALLED":
      return { ...state, installed: true, standalone: true, canPrompt: false, dismissedAt: null };
    case "STANDALONE_CHANGED":
      return {
        ...state,
        standalone: action.standalone,
        installed: action.standalone || state.installed,
      };
  }
}

export function detectInstallPlatform(environment: InstallEnvironment): InstallPlatform {
  const { userAgent, platform = "", maxTouchPoints = 0 } = environment;
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);

  if (isIOS) {
    const isAlternativeBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|FBAN|FBAV|Instagram|Messenger|Telegram/i.test(
      userAgent,
    );
    return isAlternativeBrowser ? "ios-other" : "ios-safari";
  }

  if (/Android/i.test(userAgent) && /Chrome|Chromium|EdgA|SamsungBrowser/i.test(userAgent)) {
    return "android-chromium";
  }

  if (!/Android/i.test(userAgent) && /Chrome|Chromium|Edg|OPR/i.test(userAgent)) {
    return "desktop-chromium";
  }

  return "other";
}

export function isDismissalActive(
  dismissedAt: number | null,
  now: number,
  retryAfterMs = INSTALL_PROMPT_RETRY_MS,
): boolean {
  return dismissedAt !== null && Number.isFinite(dismissedAt) && now - dismissedAt < retryAfterMs;
}

export function shouldAutoShowInstallPrompt({
  state,
  now,
}: {
  state: InstallState;
  now: number;
}): boolean {
  if (!state.ready || state.standalone || state.installed || isDismissalActive(state.dismissedAt, now)) {
    return false;
  }

  return state.canPrompt || state.platform === "ios-safari" || state.platform === "ios-other" || state.platform === "android-chromium";
}

export async function invokeNativeInstallPrompt(
  promptEvent: BeforeInstallPromptEvent | null,
): Promise<InstallPromptOutcome> {
  if (!promptEvent) return "unavailable";

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "unavailable";
  }
}
