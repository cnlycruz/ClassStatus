import { createHash } from "crypto";
import { getStorageDriver } from "@/lib/storage/driver";

export interface AdminConfig {
  username: string;
  passwordHash: string;
  sessionSecret: Buffer;
  publicOrigin: string;
  credentialVersion: string;
}

export function getAdminConfig(): AdminConfig {
  if (getStorageDriver() !== "local-json") throw new Error("ADMIN_AUTH_UNAVAILABLE");
  const username = process.env.CLASSSTATUS_ADMIN_USERNAME?.trim();
  const passwordHash = process.env.CLASSSTATUS_ADMIN_PASSWORD_HASH?.trim();
  const secretText = process.env.CLASSSTATUS_SESSION_SECRET?.trim();
  const originText = process.env.CLASSSTATUS_PUBLIC_ORIGIN?.trim();
  if (!username || !passwordHash || !secretText || !originText) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  const sessionSecret = Buffer.from(secretText, "base64");
  if (sessionSecret.length < 32) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  let publicOrigin: string;
  try {
    const parsed = new URL(originText);
    if (!/^https?:$/.test(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
    publicOrigin = parsed.origin;
  } catch { throw new Error("ADMIN_AUTH_UNAVAILABLE"); }
  return {
    username,
    passwordHash,
    sessionSecret,
    publicOrigin,
    credentialVersion: createHash("sha256").update(`${username}\0${passwordHash}`).digest("hex"),
  };
}

function parseSecret(name: string): Buffer {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  const secret = Buffer.from(value, "base64");
  if (secret.length < 32) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  return secret;
}

export function getSecurityPepper(): Buffer {
  if (getStorageDriver() === "local-json") return getAdminConfig().sessionSecret;
  return parseSecret("CLASSSTATUS_SECURITY_PEPPER");
}

export function getConfiguredAdminUserId(): string {
  const userId = process.env.CLASSSTATUS_ADMIN_USER_ID?.trim().toLowerCase();
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId)) {
    throw new Error("ADMIN_AUTH_UNAVAILABLE");
  }
  return userId;
}

export function getPublicOrigin(): string {
  const configuredOrigin = process.env.CLASSSTATUS_PUBLIC_ORIGIN?.trim();
  const vercelUrl = process.env.VERCEL_ENV === "preview" ? process.env.VERCEL_URL?.trim() : undefined;
  const originText = configuredOrigin || (vercelUrl ? `https://${vercelUrl}` : undefined);
  if (!originText) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  try {
    const parsed = new URL(originText);
    if (!/^https?:$/.test(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
    if (process.env.VERCEL === "1" && parsed.protocol !== "https:") throw new Error();
    return parsed.origin;
  } catch { throw new Error("ADMIN_AUTH_UNAVAILABLE"); }
}

export function adminCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-classstatus_admin_session" : "classstatus_admin_session";
}
