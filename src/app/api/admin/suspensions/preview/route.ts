import type { NextRequest } from "next/server";
import { createPublicationPreview } from "@/lib/admin/suspensions";
import { readBoundedJson, requireAdminMutation } from "@/lib/admin/requestSecurity";
import { suspensionErrorResponse } from "@/lib/admin/suspensionErrors";
export async function POST(request: NextRequest) { try { const session = await requireAdminMutation(request); return Response.json(await createPublicationPreview(await readBoundedJson(request), session.id), { headers: { "Cache-Control": "no-store, private" } }); } catch (error) { return suspensionErrorResponse(error); } }
