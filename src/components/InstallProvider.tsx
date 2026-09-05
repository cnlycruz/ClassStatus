"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  BeforeInstallPromptEvent,
  detectInstallPlatform,
  initialInstallState,
  INSTALL_COMPLETED_KEY,
  INSTALL_PROMPT_DISMISSED_AT_KEY,
  installReducer,
  invokeNativeInstallPrompt,
  type InstallPromptOutcome,
  type InstallState,
} from "@/lib/pwaInstall";

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

interface InstallContextValue extends InstallState {
  installing: boolean;
  dismissPrompt: () => void;
  requestInstall: () => Promise<InstallPromptOutcome>;
}

const InstallContext = createContext<InstallContextValue | null>(null);

function readStoredTimestamp(key: string): number | null {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readStoredBoolean(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function isRunningStandalone(mediaQuery: MediaQueryList): boolean {
  return mediaQuery.matches || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(installReducer, initialInstallState);
  const [installing, setInstalling] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const standalone = isRunningStandalone(standaloneQuery);
    dispatch({
      type: "INITIALIZED",
      state: {
        standalone,
        installed: standalone || readStoredBoolean(INSTALL_COMPLETED_KEY),
        canPrompt: false,
        platform: detectInstallPlatform({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          maxTouchPoints: navigator.maxTouchPoints,
        }),
        dismissedAt: readStoredTimestamp(INSTALL_PROMPT_DISMISSED_AT_KEY),
      },
    });

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      dispatch({ type: "PROMPT_AVAILABLE" });
    };

    const handleAppInstalled = () => {
      deferredPrompt.current = null;
      try {
        window.localStorage.setItem(INSTALL_COMPLETED_KEY, "1");
        window.localStorage.removeItem(INSTALL_PROMPT_DISMISSED_AT_KEY);
      } catch {
        // Installation state still updates for this session when storage is unavailable.
      }
      dispatch({ type: "INSTALLED" });
    };

    const handleDisplayModeChange = () => {
      dispatch({ type: "STANDALONE_CHANGED", standalone: isRunningStandalone(standaloneQuery) });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    standaloneQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      standaloneQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const dismissPrompt = useCallback(() => {
    const timestamp = Date.now();
    try {
      window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_AT_KEY, String(timestamp));
    } catch {
      // Dismissal still applies for this session when storage is unavailable.
    }
    dispatch({ type: "DISMISSED", at: timestamp });
  }, []);

  const requestInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    const promptEvent = deferredPrompt.current;
    if (!promptEvent) return "unavailable";

    setInstalling(true);
    const outcome = await invokeNativeInstallPrompt(promptEvent);
    deferredPrompt.current = null;
    dispatch({ type: "PROMPT_CONSUMED" });
    setInstalling(false);
    if (outcome === "dismissed") dismissPrompt();
    return outcome;
  }, [dismissPrompt]);

  const value = useMemo<InstallContextValue>(
    () => ({ ...state, installing, dismissPrompt, requestInstall }),
    [dismissPrompt, installing, requestInstall, state],
  );

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

export function useInstallState(): InstallContextValue {
  const context = useContext(InstallContext);
  if (!context) throw new Error("useInstallState must be used inside InstallProvider");
  return context;
}
