"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { StartupSplash } from "@/components/StartupSplash";

const PUBLIC_PATHS = new Set(["/", "/sources", "/about", "/install"]);

export function PublicAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const hasShownStartupSplash = useRef(!isPublicPath);
  const [showStartupSplash, setShowStartupSplash] = useState(isPublicPath);
  const dismissStartupSplash = useCallback(() => {
    hasShownStartupSplash.current = true;
    setShowStartupSplash(false);
  }, []);

  return (
    <>
      {isPublicPath && showStartupSplash && !hasShownStartupSplash.current && (
        <StartupSplash onComplete={dismissStartupSplash} />
      )}
      {PUBLIC_PATHS.has(pathname) && <Navbar />}
      {children}
    </>
  );
}
