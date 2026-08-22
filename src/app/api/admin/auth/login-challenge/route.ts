import { createLoginChallenge } from "@/lib/admin/auth";
import { adminErrorResponse } from "@/lib/admin/requestSecurity";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ challenge: createLoginChallenge() }, { headers: { "Cache-Control": "no-store, private" } }); }
  catch (error) { return adminErrorResponse(error); }
}
