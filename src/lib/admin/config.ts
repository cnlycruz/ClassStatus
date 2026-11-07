import { createHash } from "crypto";

export interface AdminConfig {
  username: string;
  passwordHash: string;
  sessionSecret: Buffer;
  publicOrigin: string;
  credentialVersion: string;
}

export function getAdminConfig(): AdminConfig {
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


export function getSecurityPepper(): Buffer {
  return getAdminConfig().sessionSecret;
}

export function getPublicOrigin(): string {
  const originText = process.env.CLASSSTATUS_PUBLIC_ORIGIN?.trim();
  if (!originText) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  try {
    const parsed = new URL(originText);
    if (!/^https?:$/.test(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error();
    return parsed.origin;
  } catch { throw new Error("ADMIN_AUTH_UNAVAILABLE"); }
}

export function adminCookieName(): string {
  return getPublicOrigin().startsWith("https:") ? "__Host-classstatus_admin_session" : "classstatus_admin_session";
}
