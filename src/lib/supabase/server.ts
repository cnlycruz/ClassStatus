import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseRuntimeConfig } from "./runtimeConfig";

function hardenedCookieOptions<T extends Record<string, unknown>>(options: T): T & {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: "/";
} {
  return {
    ...options,
    httpOnly: true,
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  };
}

export async function createUserSupabaseClient() {
  const { url, publishableKey } = getSupabaseRuntimeConfig();
  const jar = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return jar.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => jar.set(name, value, hardenedCookieOptions(options)));
        } catch {
          // Server Components cannot write cookies; middleware performs refreshes.
        }
      },
    },
  });
}

export function createPublicSupabaseClient() {
  const { url, publishableKey } = getSupabaseRuntimeConfig();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function sessionIdFromAccessToken(accessToken: string): string {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) throw new Error();
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { session_id?: unknown };
    if (typeof payload.session_id !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.session_id)) throw new Error();
    return payload.session_id.toLowerCase();
  } catch { throw new Error("ADMIN_AUTH_UNAVAILABLE"); }
}
