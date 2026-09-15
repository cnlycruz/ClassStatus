export const PORTFOLIO_EMBED_VALUE = "portfolio";

export function isPortfolioEmbedMode(search: string): boolean {
  return new URLSearchParams(search).get("embed") === PORTFOLIO_EMBED_VALUE;
}
