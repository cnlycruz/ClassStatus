import argon2 from "argon2";
import { cookies } from "next/headers";
import { getAdminConfig, adminCookieName } from "./config";
import { hmac, randomToken, safeEqual, sha256 } from "./crypto";
import { securityStore } from "@/lib/storage";
import type { AdminSessionView, StoredSession } from "./types";

const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const CHALLENGE_MS = 10 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 900_000];

function tokenDigest(token: string, secret: Buffer): string { return hmac(`session:${token}`, secret); }
function csrfFor(session: StoredSession, secret: Buffer): string { return hmac(`csrf:${session.id}:${session.tokenDigest}`, secret); }
function fingerprint(value: string, secret: Buffer): string { return hmac(`fingerprint:${value.normalize("NFKC").trim().toLowerCase()}`, secret); }

export function createLoginChallenge(): string {
  const config = getAdminConfig();
  const payload = `${randomToken(18)}.${Date.now() + CHALLENGE_MS}`;
  return `${payload}.${hmac(`login:${payload}`, config.sessionSecret)}`;
}

export function verifyLoginChallenge(challenge: string): boolean {
  try {
    const config = getAdminConfig();
    const parts = challenge.split(".");
    if (parts.length !== 3) return false;
    const payload = `${parts[0]}.${parts[1]}`;
    return Number(parts[1]) > Date.now() && safeEqual(parts[2], hmac(`login:${payload}`, config.sessionSecret));
  } catch { return false; }
}

export function checkLoginThrottle(identifier: string): { allowed: boolean; retryAfterSeconds?: number } {
  const config = getAdminConfig(); const now = Date.now();
  return securityStore.mutateSecurity((state) => {
    state.globalFailures = state.globalFailures.filter((time) => now - Date.parse(time) < WINDOW_MS);
    const bucket = state.identifierBuckets.find((item) => item.fingerprint === fingerprint(identifier, config.sessionSecret));
    const globalLockUntil = state.globalFailures.length >= 30 ? Date.parse(state.globalFailures[state.globalFailures.length - 1]) + 900_000 : 0;
    const lockUntil = Math.max(bucket?.lockUntil ? Date.parse(bucket.lockUntil) : 0, globalLockUntil);
    if (lockUntil > now) return { allowed: false, retryAfterSeconds: Math.ceil((lockUntil - now) / 1000) };
    return { allowed: true };
  });
}

export function recordLoginFailure(identifier: string): void {
  const config = getAdminConfig(); const now = Date.now(); const nowIso = new Date(now).toISOString();
  securityStore.mutateSecurity((state) => {
    state.globalFailures = [...state.globalFailures.filter((time) => now - Date.parse(time) < WINDOW_MS), nowIso];
    const fp = fingerprint(identifier, config.sessionSecret);
    let bucket = state.identifierBuckets.find((item) => item.fingerprint === fp);
    if (!bucket) { bucket = { fingerprint: fp, failures: [], backoffLevel: 0 }; state.identifierBuckets.push(bucket); }
    bucket.failures = [...bucket.failures.filter((time) => now - Date.parse(time) < WINDOW_MS), nowIso];
    if (bucket.failures.length >= 5) {
      const level = Math.min(bucket.backoffLevel, BACKOFF_MS.length - 1);
      bucket.lockUntil = new Date(now + BACKOFF_MS[level]).toISOString();
      bucket.backoffLevel = Math.min(level + 1, BACKOFF_MS.length - 1);
    }
    state.identifierBuckets = state.identifierBuckets.slice(-100);
  });
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const config = getAdminConfig();
  let passwordValid = false;
  try { passwordValid = await argon2.verify(config.passwordHash, password); } catch { passwordValid = false; }
  return safeEqual(sha256(username.normalize("NFKC").trim()), sha256(config.username)) && passwordValid;
}

export async function issueAdminSession(): Promise<AdminSessionView> {
  const config = getAdminConfig(); const now = new Date(); const token = randomToken(32);
  const session: StoredSession = {
    id: randomToken(18), tokenDigest: tokenDigest(token, config.sessionSecret), credentialVersion: config.credentialVersion,
    createdAt: now.toISOString(), lastSeenAt: now.toISOString(), absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS).toISOString(),
  };
  securityStore.mutateSecurity((state) => { state.activeSession = session; state.identifierBuckets = []; });
  try {
    const jar = await cookies();
    jar.set(adminCookieName(), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: new Date(session.absoluteExpiresAt) });
  } catch (error) {
    securityStore.mutateSecurity((state) => { if (state.activeSession?.id === session.id) delete state.activeSession; });
    throw error;
  }
  return { id: session.id, csrfToken: csrfFor(session, config.sessionSecret), absoluteExpiresAt: session.absoluteExpiresAt, idleExpiresAt: new Date(now.getTime() + IDLE_MS).toISOString() };
}

export async function getAdminSession(options: { touch?: boolean } = {}): Promise<AdminSessionView | null> {
  let config; try { config = getAdminConfig(); } catch { return null; }
  let token: string | undefined;
  try { token = (await cookies()).get(adminCookieName())?.value; } catch { return null; }
  if (!token) return null;
  const digest = tokenDigest(token, config.sessionSecret); const now = Date.now();
  try {
    return securityStore.mutateSecurity((state) => {
      const session = state.activeSession;
      if (!session || !storedSessionIsValid(session, digest, config.credentialVersion, now)) {
        if (session && safeEqual(session.tokenDigest, digest)) delete state.activeSession;
        return null;
      }
      if (options.touch !== false && now - Date.parse(session.lastSeenAt) >= 60_000) session.lastSeenAt = new Date(now).toISOString();
      return { id: session.id, csrfToken: csrfFor(session, config.sessionSecret), absoluteExpiresAt: session.absoluteExpiresAt, idleExpiresAt: new Date(Date.parse(session.lastSeenAt) + IDLE_MS).toISOString() };
    });
  } catch { return null; }
}

function storedSessionIsValid(session: StoredSession, digest: string, credentialVersion: string, now: number): boolean {
  return safeEqual(session.tokenDigest, digest) && session.credentialVersion === credentialVersion && Date.parse(session.absoluteExpiresAt) > now && Date.parse(session.lastSeenAt) + IDLE_MS > now;
}

export function isStoredSessionValidForToken(session: StoredSession, token: string, now = Date.now()): boolean {
  const config = getAdminConfig();
  return storedSessionIsValid(session, tokenDigest(token, config.sessionSecret), config.credentialVersion, now);
}

export async function revokeAdminSession(): Promise<void> {
  try { securityStore.mutateSecurity((state) => { delete state.activeSession; }); } catch { /* fail closed */ }
  (await cookies()).set(adminCookieName(), "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}
