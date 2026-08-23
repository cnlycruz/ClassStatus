import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getStorageDriver } from "@/lib/storage/driver";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    if (getStorageDriver() !== "supabase") return NextResponse.next();
    return await refreshSupabaseSession(request);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/collector/:path*", "/api/admin/:path*", "/api/collector/:path*"],
};
