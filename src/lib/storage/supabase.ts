import { randomUUID } from "crypto";
import { z } from "zod";
import { getConfiguredAdminUserId } from "@/lib/admin/config";
import type { AdminStateDocument, AuditEntry, ConfirmationReceipt } from "@/lib/admin/types";
import {
  createPublicSupabaseClient,
  createUserSupabaseClient,
  sessionIdFromAccessToken,
} from "@/lib/supabase/server";
import { isCollectorWorkerExecution } from "@/collector/executionContext";
import { createCollectorCapability } from "@/lib/cron/collectorCapability";
import type { CollectorLog, SuspensionRecord } from "@/types";
import type { SuspensionStore } from "./contracts";
import { getDeploymentNamespace } from "./driver";

const uuidSchema = z.string().uuid();
const recordSchema = z.object({ id: z.string().min(1), lguId: z.string().min(1), status: z.string().min(1) }).passthrough();
const auditSchema = z.object({ id: z.string().uuid(), timestamp: z.string(), action: z.string(), outcome: z.enum(["success", "failure"]) }).passthrough();

function rpcError(error: { message?: string } | null): never {
  const message = error?.message || "ADMIN_STORAGE_UNAVAILABLE";
  const match = message.match(/classstatus:([a-z0-9-]+)/i);
  throw new Error(match?.[1] || "ADMIN_STORAGE_UNAVAILABLE");
}

async function verifiedAdminContext() {
  const client = await createUserSupabaseClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user || userData.user.id !== getConfiguredAdminUserId()) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) throw new Error("ADMIN_AUTH_UNAVAILABLE");
  return { client, sessionId: sessionIdFromAccessToken(accessToken) };
}

async function adminRpc(operation: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const namespace = getDeploymentNamespace();
  const context = await verifiedAdminContext();
  const { data, error } = await context.client.rpc(`classstatus_${namespace}_${operation}`, args);
  if (error) rpcError(error);
  return data;
}

async function collectorRpc(operation: string, args: Record<string, unknown> = {}): Promise<unknown> {
  if (!isCollectorWorkerExecution()) return adminRpc(operation, args);
  const namespace = getDeploymentNamespace();
  const client = createPublicSupabaseClient();
  let rpcOperation: string;
  let proof: ReturnType<typeof createCollectorCapability>;
  if (operation === "upsert_collected") {
    rpcOperation = `classstatus_${namespace}_worker_upsert_collected`;
    proof = createCollectorCapability("record.upsert", {
      record: args.p_record,
      eventKey: args.p_event_key,
      conflictKey: args.p_conflict_key,
    });
  } else if (operation === "append_collector_logs") {
    rpcOperation = `classstatus_${namespace}_worker_append_collector_logs`;
    proof = createCollectorCapability("logs.append", { logs: args.p_logs });
  } else {
    throw new Error("ADMIN_STORAGE_UNAVAILABLE");
  }
  const { data, error } = await client.rpc(rpcOperation, proof);
  if (error) rpcError(error);
  return data;
}

async function publicRpc(operation: string): Promise<unknown> {
  const namespace = getDeploymentNamespace();
  const { data, error } = await createPublicSupabaseClient().rpc(`classstatus_${namespace}_${operation}`);
  if (error) rpcError(error);
  return data;
}

function parseRecord(value: unknown): SuspensionRecord {
  return recordSchema.parse(value) as unknown as SuspensionRecord;
}

export const supabaseSuspensionStore: SuspensionStore = {
  async readState() {
    const value = z.object({
      records: z.array(recordSchema),
      audit: z.array(auditSchema),
      confirmations: z.array(z.unknown()).default([]),
      idempotency: z.array(z.unknown()).default([]),
    }).parse(await adminRpc("admin_snapshot"));
    return { schemaVersion: 2, ...value } as unknown as AdminStateDocument;
  },
  async listPublicRecords() {
    return z.array(recordSchema).parse(await publicRpc("list_public_suspensions")) as unknown as SuspensionRecord[];
  },
  async createConfirmation(sessionId, payloadHash) {
    const context = await verifiedAdminContext();
    if (context.sessionId !== sessionId) throw new Error("ADMIN_AUTH_UNAVAILABLE");
    const value = await adminRpc("create_confirmation", { p_receipt_id: randomUUID(), p_payload_hash: payloadHash });
    return z.object({ id: uuidSchema, sessionId: uuidSchema, payloadHash: z.string(), expiresAt: z.string() }).parse(value) as ConfirmationReceipt;
  },
  async publishManual(input) {
    return parseRecord(await adminRpc("publish_manual", {
      p_record: input.record,
      p_confirmation_id: input.confirmationId,
      p_confirmation_payload_hash: input.confirmationPayloadHash,
      p_request_hash: input.requestHash,
      p_idempotency_key: input.idempotencyKey,
      p_target_summary: input.targetSummary,
    }));
  },
  async mutateLifecycle(input) {
    return parseRecord(await adminRpc("mutate_lifecycle", {
      p_operation: input.operation,
      p_record_id: input.recordId,
      p_expected_revision: input.expectedRevision,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
    }));
  },
  async reconcileExpiredRemovals() {
    return z.number().int().nonnegative().parse(await adminRpc("reconcile_removals"));
  },
  async appendAudit(entry) {
    return auditSchema.parse(await adminRpc("append_audit", {
      p_action: entry.action,
      p_outcome: entry.outcome,
      p_record_id: entry.recordId || null,
      p_target_summary: entry.targetSummary || null,
      p_correlation_id: entry.correlationId || null,
      p_reason_code: entry.reasonCode || null,
      p_effective_at: entry.effectiveAt || null,
    })) as AuditEntry;
  },
  async listAudit(limit = 100, offset = 0) {
    const value = z.object({ entries: z.array(auditSchema), total: z.number().int().nonnegative() }).parse(await adminRpc("list_audit", { p_limit: limit, p_offset: offset }));
    return value as { entries: AuditEntry[]; total: number };
  },
  async upsertCollected(input) {
    const value = z.object({ action: z.enum(["created", "updated", "merged", "held"]), record: recordSchema, reason: z.string().optional() }).parse(await collectorRpc("upsert_collected", {
      p_record: input.candidate,
      p_event_key: input.eventKey,
      p_conflict_key: input.conflictKey,
    }));
    return value as unknown as Awaited<ReturnType<SuspensionStore["upsertCollected"]>>;
  },
  async clearCollected() {
    throw new Error("operation-unavailable");
  },
  async appendCollectorLogs(logs) {
    await collectorRpc("append_collector_logs", { p_logs: logs });
  },
  async listCollectorLogs(limit = 200) {
    return z.array(z.object({ id: z.string(), timestamp: z.string(), level: z.enum(["info", "warn", "error", "success"]), sourceId: z.string(), sourceName: z.string(), message: z.string() }).passthrough()).parse(await adminRpc("list_collector_logs", { p_limit: limit })) as CollectorLog[];
  },
};
