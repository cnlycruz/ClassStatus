import type { NextRequest } from "next/server";
import { z } from "zod";
import { undoRemoval } from "@/lib/admin/suspensions";
import { readBoundedJson, requireAdminMutation } from "@/lib/admin/requestSecurity";
import { suspensionErrorResponse } from "@/lib/admin/suspensionErrors";
const schema = z.object({ expectedRevision: z.number().int().positive(), idempotencyKey: z.string().max(64) }).strict();
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const session = await requireAdminMutation(request); const { id } = await context.params; const body = schema.parse(await readBoundedJson(request)); return Response.json({ success: true, record: await undoRemoval(id, body.expectedRevision, body.idempotencyKey, session.id) }, { headers: { "Cache-Control": "no-store, private" } }); } catch (error) { return suspensionErrorResponse(error); } }
