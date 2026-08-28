import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import lockfile from "proper-lockfile";
import { z } from "zod";
import type { AdminSecurityDocument, AdminStateDocument, AuditEntry } from "@/lib/admin/types";
import type { CollectorLog, SourceCitation, SuspensionRecord } from "@/types";
import { effectiveAdminState } from "@/utils/administrativeState";
import { isLivePublicationRecord, isLiveTier3Record } from "@/collector/sourcePolicy";
import { projectPublicStorageRecord } from "@/lib/admin/publicProjection";
import type { CollectedUpsertResult, SuspensionStore } from "./contracts";
import { assertLocalJsonAvailable } from "./driver";

const STATE_SCHEMA_VERSION = 2;

function dataDirectory(): string {
  return path.resolve(process.env.CLASSSTATUS_DATA_DIR || path.join(process.cwd(), "data"));
}

function stateFile(): string { return path.join(dataDirectory(), "suspensions.json"); }
function securityFile(): string { return path.join(dataDirectory(), "admin_security.json"); }
function collectorLogsFile(): string { return path.join(dataDirectory(), "collector_logs.json"); }

function ensureFile(file: string, initial: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    atomicWrite(file, initial);
  }
}

function atomicWrite(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
}

function withFileLock<T>(file: string, initial: unknown, operation: () => T): T {
  ensureFile(file, initial);
  let release: (() => void) | undefined;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 6; attempt++) {
    try { release = lockfile.lockSync(file, { realpath: false, stale: 10_000 }); break; }
    catch (error) {
      if (attempt === 5) throw error;
      Atomics.wait(sleeper, 0, 0, 15 * (attempt + 1));
    }
  }
  if (!release) throw new Error("ADMIN_STORAGE_LOCK_UNAVAILABLE");
  try { return operation(); } finally { release(); }
}

const recordSchema = z.object({
  id: z.string().min(1), lguId: z.string().min(1), status: z.string().min(1),
  affectedLevels: z.array(z.string()), schoolSector: z.string(), effectiveDate: z.string(),
}).passthrough();

function readStateDocument(): AdminStateDocument {
  const file = stateFile();
  ensureFile(file, []);
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  if (Array.isArray(raw)) {
    const records = z.array(recordSchema).parse(raw) as unknown as SuspensionRecord[];
    return { schemaVersion: STATE_SCHEMA_VERSION, records, audit: [], confirmations: [], idempotency: [] };
  }
  const parsed = z.object({
    schemaVersion: z.literal(STATE_SCHEMA_VERSION), records: z.array(recordSchema),
    audit: z.array(z.object({ id: z.string(), timestamp: z.string(), action: z.string(), outcome: z.enum(["success", "failure"]) }).passthrough()),
    confirmations: z.array(z.object({ id: z.string(), sessionId: z.string(), payloadHash: z.string(), expiresAt: z.string(), consumedAt: z.string().optional() })),
    idempotency: z.array(z.object({ key: z.string(), sessionId: z.string(), operation: z.string(), payloadHash: z.string(), createdAt: z.string(), response: z.unknown() })),
  }).parse(raw);
  return parsed as unknown as AdminStateDocument;
}

function emptySecurity(): AdminSecurityDocument {
  return { schemaVersion: 1, identifierBuckets: [], globalFailures: [] };
}

function readSecurityDocument(): AdminSecurityDocument {
  const file = securityFile();
  ensureFile(file, emptySecurity());
  return z.object({
    schemaVersion: z.literal(1),
    activeSession: z.object({ id: z.string(), tokenDigest: z.string(), credentialVersion: z.string(), createdAt: z.string(), lastSeenAt: z.string(), absoluteExpiresAt: z.string() }).optional(),
    identifierBuckets: z.array(z.object({ fingerprint: z.string(), failures: z.array(z.string()), lockUntil: z.string().optional(), backoffLevel: z.number().int().nonnegative() })),
    globalFailures: z.array(z.string()),
  }).parse(JSON.parse(fs.readFileSync(file, "utf8"))) as AdminSecurityDocument;
}

export const localStateStore = {
  readState() { assertLocalJsonAvailable(); return readStateDocument(); },
  mutateState<T>(mutation: (state: AdminStateDocument) => T): T {
    assertLocalJsonAvailable();
    return withFileLock(stateFile(), [], () => {
      const state = readStateDocument();
      const result = mutation(state);
      atomicWrite(stateFile(), state);
      return result;
    });
  },
};

export const localSecurityStore: AdminSecurityStore = {
  readSecurity() { assertLocalJsonAvailable(); return readSecurityDocument(); },
  mutateSecurity<T>(mutation: (state: AdminSecurityDocument) => T): T {
    assertLocalJsonAvailable();
    return withFileLock(securityFile(), emptySecurity(), () => {
      const state = readSecurityDocument();
      const result = mutation(state);
      atomicWrite(securityFile(), state);
      return result;
    });
  },
};

interface AdminSecurityStore {
  readSecurity(): AdminSecurityDocument;
  mutateSecurity<T>(mutation: (state: AdminSecurityDocument) => T): T;
}

const CONFIRMATION_MS = 10 * 60 * 1000;
const RECEIPT_MS = 24 * 60 * 60 * 1000;

function appendStateAudit(state: AdminStateDocument, entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
  const result: AuditEntry = { id: randomUUID(), timestamp: new Date().toISOString(), ...entry };
  state.audit.unshift(result);
  state.audit = state.audit.slice(0, 1000);
  return result;
}

function pruneReceipts(state: AdminStateDocument, now = Date.now()): void {
  state.confirmations = state.confirmations.filter((item) => !item.consumedAt && Date.parse(item.expiresAt) > now);
  state.idempotency = state.idempotency.filter((item) => now - Date.parse(item.createdAt) < RECEIPT_MS);
}

function conflictKey(record: SuspensionRecord): string {
  return [
    record.lguId,
    record.schoolId || "lgu",
    record.effectiveDate,
    [...record.affectedLevels].sort().join(","),
    record.schoolSector,
    record.isAllDay ? "all-day" : `${record.startTime || ""}-${record.endTime || ""}`,
  ].join("|");
}

function uniqueSources(sources: SourceCitation[]): SourceCitation[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const identity = `${source.organization.trim().toLowerCase()}|${source.url}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function withVerification(sources: SourceCitation[], confidence: "medium" | "high"): SourceCitation[] {
  return sources.map((source) => ({ ...source, verified: confidence === "high" }));
}

function readCollectorLogs(): CollectorLog[] {
  const file = collectorLogsFile();
  ensureFile(file, []);
  return z.array(z.object({
    id: z.string(), timestamp: z.string(), level: z.enum(["info", "warn", "error", "success"]),
    sourceId: z.string(), sourceName: z.string(), message: z.string(),
  }).passthrough()).parse(JSON.parse(fs.readFileSync(file, "utf8"))) as CollectorLog[];
}

export const localSuspensionStore: SuspensionStore = {
  async readState() { return localStateStore.readState(); },
  async listPublicRecords() {
    return localStateStore.readState().records
      .filter((record) => isLivePublicationRecord(record) && effectiveAdminState(record) === "active")
      .map(projectPublicStorageRecord);
  },
  async createConfirmation(sessionId, payloadHash) {
    return localStateStore.mutateState((state) => {
      pruneReceipts(state);
      const receipt = { id: randomUUID(), sessionId, payloadHash, expiresAt: new Date(Date.now() + CONFIRMATION_MS).toISOString() };
      state.confirmations.push(receipt);
      return receipt;
    });
  },
  async publishManual(input) {
    return localStateStore.mutateState((state) => {
      pruneReceipts(state);
      const prior = state.idempotency.find((item) => item.key === input.idempotencyKey && item.sessionId === input.sessionId && item.operation === "publish");
      if (prior) {
        if (prior.payloadHash !== input.requestHash) throw new Error("idempotency-conflict");
        return prior.response as SuspensionRecord;
      }
      const confirmation = state.confirmations.find((item) => item.id === input.confirmationId && item.sessionId === input.sessionId && item.payloadHash === input.confirmationPayloadHash);
      if (!confirmation || confirmation.consumedAt || Date.parse(confirmation.expiresAt) <= Date.now()) throw new Error("confirmation-invalid");
      const duplicate = state.records.find((item) => effectiveAdminState(item) !== "removed" && item.eventKey === input.record.eventKey);
      if (duplicate) throw new Error("duplicate-publication");
      const now = new Date().toISOString();
      confirmation.consumedAt = now;
      state.records.unshift(input.record);
      appendStateAudit(state, { action: "manual-publication", outcome: "success", recordId: input.record.id, targetSummary: input.targetSummary, correlationId: input.idempotencyKey });
      state.idempotency.push({ key: input.idempotencyKey, sessionId: input.sessionId, operation: "publish", payloadHash: input.requestHash, createdAt: now, response: input.record });
      return input.record;
    });
  },
  async mutateLifecycle(input) {
    return localStateStore.mutateState((state) => {
      pruneReceipts(state);
      const prior = state.idempotency.find((item) => item.key === input.idempotencyKey && item.sessionId === input.sessionId && item.operation === input.operation);
      if (prior) {
        if (prior.payloadHash !== input.requestHash) throw new Error("idempotency-conflict");
        return prior.response as SuspensionRecord;
      }
      const record = state.records.find((item) => item.id === input.recordId);
      if (!record) throw new Error("record-not-found");
      if ((record.revision || 1) !== input.expectedRevision) throw new Error("stale-revision");
      const now = new Date();
      if (input.operation === "remove") {
        if (effectiveAdminState(record, now) !== "active") throw new Error("invalid-state-transition");
        record.administrativeState = "pending_removal";
        record.removalRequestedAt = now.toISOString();
        record.undoDeadline = new Date(now.getTime() + 30_000).toISOString();
      } else {
        if (record.administrativeState !== "pending_removal" || !record.undoDeadline || now.getTime() >= Date.parse(record.undoDeadline)) throw new Error("undo-window-expired");
        record.administrativeState = "active";
        delete record.removalRequestedAt;
        delete record.undoDeadline;
      }
      record.revision = input.expectedRevision + 1;
      appendStateAudit(state, { action: input.operation === "remove" ? "removal-request" : "removal-undo", outcome: "success", recordId: record.id, targetSummary: record.schoolId || record.lguId, correlationId: input.idempotencyKey });
      state.idempotency.push({ key: input.idempotencyKey, sessionId: input.sessionId, operation: input.operation, payloadHash: input.requestHash, createdAt: now.toISOString(), response: record });
      return { ...record };
    });
  },
  async reconcileExpiredRemovals(now = new Date()) {
    return localStateStore.mutateState((state) => {
      let count = 0;
      for (const record of state.records) {
        if (record.administrativeState !== "pending_removal" || !record.undoDeadline || now.getTime() < Date.parse(record.undoDeadline)) continue;
        record.administrativeState = "removed";
        record.removalFinalizedAt = now.toISOString();
        record.revision = (record.revision || 1) + 1;
        count++;
        appendStateAudit(state, { action: "removal-finalized", outcome: "success", recordId: record.id, targetSummary: record.schoolId || record.lguId, effectiveAt: record.undoDeadline });
      }
      return count;
    });
  },
  async appendAudit(entry) {
    return localStateStore.mutateState((state) => appendStateAudit(state, entry));
  },
  async listAudit(limit = 100, offset = 0) {
    const all = localStateStore.readState().audit;
    return { entries: all.slice(offset, offset + Math.max(1, Math.min(limit, 200))), total: all.length };
  },
  async upsertCollected(input): Promise<CollectedUpsertResult> {
    return localStateStore.mutateState((state) => {
      const candidate = input.candidate;
      const activeRecords = state.records.filter((record) => effectiveAdminState(record) === "active");
      const duplicateManual = activeRecords.find((record) => record.publicationProvenance?.type === "manual-admin" && record.eventKey === input.eventKey);
      if (duplicateManual) return { action: "held", record: candidate, reason: `duplicates-manual:${duplicateManual.id}` };
      const conflict = activeRecords.find((record) => conflictKey(record) === input.conflictKey && record.status !== candidate.status);
      if (conflict) return { action: "held", record: candidate, reason: `conflicts-with:${conflict.id}` };
      const existingIndex = state.records.findIndex((record) => isLiveTier3Record(record) && record.eventKey === input.eventKey);
      if (existingIndex < 0) {
        candidate.source = { ...candidate.source, verified: false };
        state.records.unshift(candidate);
        return { action: "created", record: candidate };
      }
      const existing = state.records[existingIndex];
      if (effectiveAdminState(existing) !== "active") return { action: "held", record: candidate, reason: `administratively-removed:${existing.id}` };
      const isNewer = new Date(candidate.publishedAt).getTime() > new Date(existing.publishedAt).getTime();
      const preferred = isNewer ? candidate : existing;
      const sources = uniqueSources([preferred.source, existing.source, ...(existing.additionalSources || []), candidate.source]);
      const confidence: "medium" | "high" = new Set(sources.map((source) => source.organization.trim().toLowerCase())).size >= 2 ? "high" : "medium";
      const verifiedSources = withVerification(sources, confidence);
      const merged: SuspensionRecord = { ...preferred, id: existing.id, eventKey: input.eventKey, source: verifiedSources[0], additionalSources: verifiedSources.slice(1), confidence, collectorProvenance: preferred.collectorProvenance, publicationProvenance: { type: "automatic-collector", publicLabel: "Published from approved Tier 3 media evidence" }, administrativeState: "active", revision: (existing.revision || 1) + 1 };
      state.records[existingIndex] = merged;
      const sameOutlet = [existing.source, ...(existing.additionalSources || [])].some((source) => source.organization === candidate.source.organization && source.url === candidate.source.url);
      return { action: sameOutlet ? "updated" : "merged", record: merged };
    });
  },
  async clearCollected() {
    localStateStore.mutateState((state) => { state.records = state.records.filter((record) => !isLiveTier3Record(record)); });
  },
  async appendCollectorLogs(logs) {
    assertLocalJsonAvailable();
    withFileLock(collectorLogsFile(), [], () => {
      const current = readCollectorLogs();
      atomicWrite(collectorLogsFile(), [...logs, ...current].slice(0, 200));
    });
  },
  async listCollectorLogs(limit = 200) {
    assertLocalJsonAvailable();
    return readCollectorLogs().slice(0, Math.max(1, Math.min(limit, 200)));
  },
};

export function getAdminStateFileVersion(): string | null {
  try { const stats = fs.statSync(stateFile()); return `${stats.mtimeMs}:${stats.size}`; } catch { return null; }
}
