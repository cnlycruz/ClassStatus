/** @type {import('next').NextConfig} */
const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const upgradeInsecureRequests = process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : "";
function supabaseConnectOrigin() {
  try {
    const url = new URL(process.env.SUPABASE_URL || "");
    return url.protocol === "https:" ? ` ${url.origin}` : "";
  } catch {
    return "";
  }
}
function portfolioFrameOrigin() {
  const configuredOrigin = process.env.PORTFOLIO_ORIGIN?.trim();
  if (!configuredOrigin) return "";

  try {
    const url = new URL(configuredOrigin);
    const isHttpOrigin = url.protocol === "http:" || url.protocol === "https:";
    const isExactOrigin = !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
    return isHttpOrigin && isExactOrigin ? ` ${url.origin}` : "";
  } catch {
    return "";
  }
}
const supabaseOrigin = supabaseConnectOrigin();
const frameAncestors = `'self'${portfolioFrameOrigin()} http://localhost:3000 http://127.0.0.1:3000`;
const securityHeaders = [
  { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${developmentEval}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'${supabaseOrigin}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors ${frameAncestors}${upgradeInsecureRequests}` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];
if (process.env.NODE_ENV === "production") securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/collector/:path*", headers: [{ key: "Cache-Control", value: "no-store, private" }] },
      { source: "/api/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store, private" }] },
      { source: "/api/collector/:path*", headers: [{ key: "Cache-Control", value: "no-store, private" }] },
      { source: "/auth/reset-password", headers: [{ key: "Cache-Control", value: "no-store, private" }, { key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
};

export default nextConfig;
