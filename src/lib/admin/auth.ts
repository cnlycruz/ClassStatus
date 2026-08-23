import argon2 from "argon2";
import { cookies } from "next/headers";
import {
  adminCookieName,
  getAdminConfig,
  getConfiguredAdminUserId,
  getSecurityPepper,
} from "./config";
import { hmac, randomToken, safeEqual, sha256 } from "./crypto";
import { securityStore } from "@/lib/storage";
import { getDeploymentNamespace, getStorageDriver } from "@/lib/storage/driver";
import {
  createServiceSupabaseClient,
  createUserSupabaseClient,
  sessionIdFromAccessToken,
} from "@/lib/supabase/server";
import type { AdminSessionView, StoredSession } from "./types";

const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const CHALLENGE_MS = 10 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 900_000];

function tokenDigest(token: string, secret: Buffer): string { return hmac(`session:${token}`, secret); }
function localCsrfFor(session: StoredSession, secret: Buffer): string { return hmac(`csrf:${session.id}:${session.tokenDigest}`, secret); }
function supabaseCsrfFor(sessionId: string): string { return hmac(`supabase-csrf:${sessionId}`, getSecurityPepper()); }
function fingerprint(value: string, secret = getSecurityPepper()): string { return hmac(`fingerprint:${value.normalize("NFKC").trim().toLowerCase()}`, secret); }

export function createLoginChallenge(): string {
  const payload = `${randomToken(18)}.${Date.now() + CHALLENGE_MS}`;
  return `${payload}.${hmac(`login:${payload}`, getSecurityPepper())}`;
}

export function verifyLoginChallenge(challenge: string): boolean {
  try {
    const parts = challenge.split(".");
    if (parts.length !== 3) return false;
    const payload = `${parts[0]}.${parts[1]}`;
    return Number(parts[1]) > Date.now() && safeEqual(parts[2], hmac(`login:${payload}`, getSecurityPepper()));
  } catch { return false; }
}

export async function checkLoginThrottle(identifier: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  if (getStorageDriver() === "supabase") {
    // Supabase Auth enforces the hosted, IP-based sign-in limit. A separate
    // pre-auth database endpoint cannot authenticate that a failure came from
    // this server and would create an avoidable denial-of-service primitive.
    void identifier;
    return { allowed: true };
  }
  const config = getAdminConfig();
  const now = Date.now();
  return securityStore.mutateSecurity((state) => {
    state.globalFailures = state.globalFailures.filter((time) => now - Date.parse(time) < WINDOW_MS);
    const bucket = state.identifierBuckets.find((item) => item.fingerprint === fingerprint(identifier, config.sessionSecret));
    const globalLockUntil = state.globalFailures.length >= 30 ? Date.parse(state.globalFailures[state.globalFailures.length - 1]) + 900_000 : 0;
    const lockUntil = Math.max(bucket?.lockUntil ? Date.parse(bucket.lockUntil) : 0, globalLockUntil);
    if (lockUntil > now) return { allowed: false, retryAfterSeconds: Math.ceil((lockUntil - now) / 1000) };
    return { allowed: true };
  });
}

export async function recordLoginFailure(identifier: string): Promise<void> {
  if (getStorageDriver() === "supabase") {
    // Supabase Auth applies configurable IP-based sign-in throttling before it
    // returns an authentication failure. Do not expose a separate anonymous
    // database writer: it would let arbitrary callers manufacture lockouts.
    return;
  }
  const config = getAdminConfig();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
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

async function issueLocalAdminSession(): Promise<AdminSessionView> {
  const config = getAdminConfig();
  const now = new Date();
  const token = randomToken(32);
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
  return { id: session.id, csrfToken: localCsrfFor(session, config.sessionSecret), absoluteExpiresAt: session.absoluteExpiresAt, idleExpiresAt: new Date(now.getTime() + IDLE_MS).toISOString() };
}

type SupabaseAdminContext = {
  client: Awaited<ReturnType<typeof createUserSupabaseClient>>;
  userId: string;
  sessionId: string;
};

async function verifiedSupabaseAdminContext(
  suppliedClient?: Awaited<ReturnType<typeof createUserSupabaseClient>>
): Promise<SupabaseAdminContext> {
  const client = suppliedClient || await createUserSupabaseClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user || userData.user.id !== getConfiguredAdminUserId()) {
    throw new Error("ADMIN_AUTH_UNAVAILABLE");
  }
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  return {
    client,
    userId: userData.user.id,
    sessionId: sessionIdFromAccessToken(accessToken),
  };
}

async function supabaseSessionPolicyRpc(
  operation: "start_admin_session" | "touch_admin_session" | "revoke_admin_session",
  args: Record<string, unknown> = {},
  suppliedContext?: SupabaseAdminContext
) {
  const namespace = getDeploymentNamespace();
  const context = suppliedContext || await verifiedSupabaseAdminContext();
  const { data, error } = namespace === "preview"
    ? await context.client.rpc(`classstatus_preview_${operation}`, args)
    : await createServiceSupabaseClient().rpc(`classstatus_production_${operation}`, {
        ...args,
        p_admin_user_id: context.userId,
        p_admin_session_id: context.sessionId,
      });
  if (error) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  return { client: context.client, data };
}

export async function authenticateAndIssueAdminSession(identifier: string, password: string): Promise<AdminSessionView | null> {
  if (getStorageDriver() === "local-json") {
    if (!await verifyAdminCredentials(identifier, password)) return null;
    return issueLocalAdminSession();
  }
  const client = await createUserSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email: identifier, password });
  if (error || !data.user || !data.session || data.user.id !== getConfiguredAdminUserId()) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return null;
  }
  const sessionId = sessionIdFromAccessToken(data.session.access_token);
  const context = { client, userId: data.user.id, sessionId };
  const csrfToken = supabaseCsrfFor(sessionId);
  try {
    const result = await supabaseSessionPolicyRpc("start_admin_session", {
      p_csrf_digest: sha256(csrfToken),
      p_login_fingerprint: fingerprint(identifier),
    }, context);
    const policy = result.data as { sessionId?: unknown; absoluteExpiresAt?: unknown; idleExpiresAt?: unknown } | null;
    if (!policy || policy.sessionId !== sessionId || typeof policy.absoluteExpiresAt !== "string" || typeof policy.idleExpiresAt !== "string") throw new Error();
    return { id: sessionId, csrfToken, absoluteExpiresAt: policy.absoluteExpiresAt, idleExpiresAt: policy.idleExpiresAt };
  } catch (error) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw error;
  }
}

export async function issueAdminSession(): Promise<AdminSessionView> {
  if (getStorageDriver() !== "local-json") throw new Error("ADMIN_AUTH_UNAVAILABLE");
  return issueLocalAdminSession();
}

async function getLocalAdminSession(options: { touch?: boolean }): Promise<AdminSessionView | null> {
  let config; try { config = getAdminConfig(); } catch { return null; }
  let token: string | undefined;
  try { token = (await cookies()).get(adminCookieName())?.value; } catch { return null; }
  if (!token) return null;
  const digest = tokenDigest(token, config.sessionSecret);
  const now = Date.now();
  try {
    return securityStore.mutateSecurity((state) => {
      const session = state.activeSession;
      if (!session || !storedSessionIsValid(session, digest, config.credentialVersion, now)) {
        if (session && safeEqual(session.tokenDigest, digest)) delete state.activeSession;
        return null;
      }
      if (options.touch !== false && now - Date.parse(session.lastSeenAt) >= 60_000) session.lastSeenAt = new Date(now).toISOString();
      return { id: session.id, csrfToken: localCsrfFor(session, config.sessionSecret), absoluteExpiresAt: session.absoluteExpiresAt, idleExpiresAt: new Date(Date.parse(session.lastSeenAt) + IDLE_MS).toISOString() };
    });
  } catch { return null; }
}

export async function getAdminSession(options: { touch?: boolean } = {}): Promise<AdminSessionView | null> {
  let driver; try { driver = getStorageDriver(); } catch { return null; }
  if (driver === "local-json") return getLocalAdminSession(options);
  try {
    const context = await verifiedSupabaseAdminContext();
    const result = await supabaseSessionPolicyRpc(
      "touch_admin_session",
      { p_touch: options.touch !== false },
      context
    );
    const policy = result.data as { sessionId?: unknown; csrfDigest?: unknown; absoluteExpiresAt?: unknown; idleExpiresAt?: unknown } | null;
    const csrfToken = supabaseCsrfFor(context.sessionId);
    if (!policy || policy.sessionId !== context.sessionId || policy.csrfDigest !== sha256(csrfToken) || typeof policy.absoluteExpiresAt !== "string" || typeof policy.idleExpiresAt !== "string") return null;
    return { id: context.sessionId, csrfToken, absoluteExpiresAt: policy.absoluteExpiresAt, idleExpiresAt: policy.idleExpiresAt };
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
  if (getStorageDriver() === "local-json") {
    try { securityStore.mutateSecurity((state) => { delete state.activeSession; }); } catch { /* fail closed */ }
    (await cookies()).set(adminCookieName(), "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
    return;
  }
  try {
    const result = await supabaseSessionPolicyRpc("revoke_admin_session");
    await result.client.auth.signOut({ scope: "global" });
  } catch {
    const client = await createUserSupabaseClient();
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
