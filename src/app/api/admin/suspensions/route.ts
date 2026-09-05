import type { NextRequest } from "next/server";
import { z } from "zod";
import { publishManualSuspension } from "@/lib/admin/suspensions";
import { readBoundedJson, requireAdminMutation } from "@/lib/admin/requestSecurity";
import { suspensionErrorResponse } from "@/lib/admin/suspensionErrors";
const schema = z.object({ draft: z.unknown(), confirmationToken: z.string().max(512), idempotencyKey: z.string().max(64), confirmed: z.literal(true) }).strict();
export async function POST(request: NextRequest) { try { const session = await requireAdminMutation(request); const body = schema.parse(await readBoundedJson(request)); const record = await publishManualSuspension(body, session.id); return Response.json({ success: true, record }, { status: 201, headers: { "Cache-Control": "no-store, private" } }); } catch (error) { return suspensionErrorResponse(error); } }
