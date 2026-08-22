import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import lockfile from "proper-lockfile";
import { z } from "zod";
import type { AdminSecurityDocument, AdminStateDocument } from "@/lib/admin/types";
import type { SuspensionRecord } from "@/types";
import type { AdminSecurityStore, SuspensionStore } from "./contracts";

const STATE_SCHEMA_VERSION = 2;

function dataDirectory(): string {
  return path.resolve(process.env.CLASSSTATUS_DATA_DIR || path.join(process.cwd(), "data"));
}

function stateFile(): string { return path.join(dataDirectory(), "suspensions.json"); }
function securityFile(): string { return path.join(dataDirectory(), "admin_security.json"); }

function assertDriverAvailable(): void {
  const driver = process.env.CLASSSTATUS_STORAGE_DRIVER || "local-json";
  const isVercelProduction = process.env.VERCEL === "1" && (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production");
  if (driver !== "local-json" || isVercelProduction) {
    throw new Error("ADMIN_STORAGE_UNAVAILABLE");
  }
}

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

export const localSuspensionStore: SuspensionStore = {
  readState() { assertDriverAvailable(); return readStateDocument(); },
  mutateState<T>(mutation: (state: AdminStateDocument) => T): T {
    assertDriverAvailable();
    return withFileLock(stateFile(), [], () => {
      const state = readStateDocument();
      const result = mutation(state);
      atomicWrite(stateFile(), state);
      return result;
    });
  },
};

export const localSecurityStore: AdminSecurityStore = {
  readSecurity() { assertDriverAvailable(); return readSecurityDocument(); },
  mutateSecurity<T>(mutation: (state: AdminSecurityDocument) => T): T {
    assertDriverAvailable();
    return withFileLock(securityFile(), emptySecurity(), () => {
      const state = readSecurityDocument();
      const result = mutation(state);
      atomicWrite(securityFile(), state);
      return result;
    });
  },
};

export function getAdminStateFileVersion(): string | null {
  try { const stats = fs.statSync(stateFile()); return `${stats.mtimeMs}:${stats.size}`; } catch { return null; }
}
