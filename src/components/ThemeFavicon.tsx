"use client";

import { useEffect } from "react";
import { useTheme } from "./ThemeContext";

const LIGHT_FAVICON = "/icons/class-status-favicon.png";
const DARK_FAVICON = "/icons/class-status-favicon-dark.png";

export function ThemeFavicon() {
  const { theme } = useTheme();

  useEffect(() => {
    const href = theme === "dark" ? DARK_FAVICON : LIGHT_FAVICON;
    const existingFavicon =
      document.querySelector<HTMLLinkElement>('link[rel="icon"][sizes="32x32"]') ??
      document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]') ??
      document.querySelector<HTMLLinkElement>('link[rel="icon"]');

    if (existingFavicon) {
      existingFavicon.href = href;
      existingFavicon.type = "image/png";
      return;
    }

    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.sizes = "32x32";
    favicon.type = "image/png";
    favicon.href = href;
    document.head.appendChild(favicon);

    return () => favicon.remove();
  }, [theme]);

  return null;
}
