"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/Navbar";

const PUBLIC_PATHS = new Set(["/", "/sources", "/about", "/install"]);

export function PublicAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      {PUBLIC_PATHS.has(pathname) && <Navbar />}
      {children}
    </>
  );
}
