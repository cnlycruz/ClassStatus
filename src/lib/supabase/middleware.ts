import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseRuntimeConfig } from "./runtimeConfig";

export async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const { url, publishableKey } = getSupabaseRuntimeConfig();
  let response = NextResponse.next({ request });
  const client = createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, {
          ...options,
          httpOnly: true,
          secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
        }));
      },
    },
  });
  await client.auth.getClaims();
  return response;
}
