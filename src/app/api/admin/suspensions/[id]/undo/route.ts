import type { NextRequest } from "next/server";
import { z } from "zod";
import { undoRemoval } from "@/lib/admin/suspensions";
import { AdminHttpError, adminErrorResponse, readBoundedJson, requireAdminMutation } from "@/lib/admin/requestSecurity";
const schema = z.object({ expectedRevision: z.number().int().positive(), idempotencyKey: z.string().max(64) }).strict();
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const session = await requireAdminMutation(request); const { id } = await context.params; const body = schema.parse(await readBoundedJson(request)); return Response.json({ success: true, record: undoRemoval(id, body.expectedRevision, body.idempotencyKey, session.id) }, { headers: { "Cache-Control": "no-store, private" } }); } catch (error) { if (error instanceof Error && !(error instanceof AdminHttpError)) return Response.json({ success: false, error: error.message.startsWith("[") ? "VALIDATION_FAILED" : error.message }, { status: error.message === "record-not-found" ? 404 : 409 }); return adminErrorResponse(error); } }
