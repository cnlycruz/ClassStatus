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

export function adminCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-classstatus_admin_session" : "classstatus_admin_session";
}
