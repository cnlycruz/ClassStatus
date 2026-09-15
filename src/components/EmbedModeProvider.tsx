"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isPortfolioEmbedMode } from "@/lib/embedMode";

const PortfolioEmbedContext = createContext(false);

export function EmbedModeProvider({ children }: { children: ReactNode }) {
  const [portfolioEmbed, setPortfolioEmbed] = useState(false);

  useEffect(() => {
    setPortfolioEmbed(isPortfolioEmbedMode(window.location.search));
  }, []);

  return <PortfolioEmbedContext.Provider value={portfolioEmbed}>{children}</PortfolioEmbedContext.Provider>;
}

export function usePortfolioEmbedMode(): boolean {
  return useContext(PortfolioEmbedContext);
}
