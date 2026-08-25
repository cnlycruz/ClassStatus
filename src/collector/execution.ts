import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import type { SupabaseClient } from "@supabase/supabase-js";
import { globalCollector } from "@/collector/engine";
import { isCollectorWorkerExecution, withCollectorWorkerExecution } from "@/collector/executionContext";
import {
  createPublicSupabaseClient,
  createServiceSupabaseClient,
  createUserSupabaseClient,
} from "@/lib/supabase/server";
import { createPreviewCollectorCapability } from "@/lib/cron/collectorCapability";
import { getDeploymentNamespace, getStorageDriver } from "@/lib/storage/driver";
import type { CollectorSummary } from "@/types";
import type { DeploymentNamespace } from "@/lib/storage/contracts";

export const COLLECTOR_LEASE_TTL_MS = 5 * 60 * 1000;

export interface CollectorLease {
  acquire(namespace: DeploymentNamespace, ownerToken: string): Promise<boolean>;
  release(namespace: DeploymentNamespace, ownerToken: string): Promise<void>;
}

export type CollectorExecutionResult =
  | { success: true; skipped: true; reason: "collector_already_running" }
  | { success: true; skipped: false; summary: CollectorSummary };

interface LocalLeaseRecord {
  ownerToken: string;
  acquiredAt: string;
  expiresAt: string;
}

type LocalLeaseDocument = Partial<Record<DeploymentNamespace, LocalLeaseRecord>>;

function localLeaseFile(): string {
  const directory = path.resolve(process.env.CLASSSTATUS_DATA_DIR || path.join(process.cwd(), "data"));
  return path.join(directory, "collector_leases.json");
}

function ensureLocalLeaseFile(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, "{}\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
}

function writeLocalLeases(file: string, leases: LocalLeaseDocument): void {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(leases, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, file);
}

async function mutateLocalLeases<T>(operation: (leases: LocalLeaseDocument) => T): Promise<T> {
  const file = localLeaseFile();
  ensureLocalLeaseFile(file);
  const release = await lockfile.lock(file, {
    realpath: false,
    stale: 10_000,
    retries: { retries: 5, minTimeout: 10, maxTimeout: 75 },
  });
  try {
    const leases = JSON.parse(fs.readFileSync(file, "utf8")) as LocalLeaseDocument;
    const result = operation(leases);
    writeLocalLeases(file, leases);
    return result;
  } finally {
    await release();
  }
}

const localCollectorLease: CollectorLease = {
  async acquire(namespace, ownerToken) {
    return mutateLocalLeases((leases) => {
      const now = Date.now();
      const current = leases[namespace];
      if (current && current.ownerToken !== ownerToken && Date.parse(current.expiresAt) > now) return false;
      leases[namespace] = {
        ownerToken,
        acquiredAt: new Date(now).toISOString(),
        expiresAt: new Date(now + COLLECTOR_LEASE_TTL_MS).toISOString(),
      };
      return true;
    });
  },
  async release(namespace, ownerToken) {
    await mutateLocalLeases((leases) => {
      if (leases[namespace]?.ownerToken === ownerToken) delete leases[namespace];
    });
  },
};

async function collectorLeaseClient(namespace: DeploymentNamespace): Promise<SupabaseClient> {
  if (isCollectorWorkerExecution()) {
    if (namespace !== "preview") throw new Error("COLLECTOR_LEASE_UNAVAILABLE");
    return createPublicSupabaseClient();
  }
  if (namespace === "preview") return createUserSupabaseClient();
  return createServiceSupabaseClient();
}

const supabaseCollectorLease: CollectorLease = {
  async acquire(namespace, ownerToken) {
    const client = await collectorLeaseClient(namespace);
    const scheduled = isCollectorWorkerExecution();
    const operation = scheduled
      ? "classstatus_preview_worker_acquire_collector_lease"
      : `classstatus_${namespace}_acquire_collector_lease`;
    const args = scheduled
      ? createPreviewCollectorCapability("lease.acquire", { ownerToken })
      : { p_owner_token: ownerToken };
    const { data, error } = await client.rpc(operation, args);
    if (error) throw new Error("COLLECTOR_LEASE_UNAVAILABLE");
    return data === true;
  },
  async release(namespace, ownerToken) {
    const client = await collectorLeaseClient(namespace);
    const scheduled = isCollectorWorkerExecution();
    const operation = scheduled
      ? "classstatus_preview_worker_release_collector_lease"
      : `classstatus_${namespace}_release_collector_lease`;
    const args = scheduled
      ? createPreviewCollectorCapability("lease.release", { ownerToken })
      : { p_owner_token: ownerToken };
    const { error } = await client.rpc(operation, args);
    if (error) throw new Error("COLLECTOR_LEASE_UNAVAILABLE");
  },
};

function collectorNamespace(): DeploymentNamespace {
  if (getStorageDriver() === "supabase") return getDeploymentNamespace();
  return process.env.CLASSSTATUS_SUPABASE_NAMESPACE === "production" ? "production" : "preview";
}

function selectedCollectorLease(): CollectorLease {
  return getStorageDriver() === "supabase" ? supabaseCollectorLease : localCollectorLease;
}

export async function executeCollectorWithLease(options: {
  namespace: DeploymentNamespace;
  lease: CollectorLease;
  runSweep: () => Promise<CollectorSummary>;
  ownerToken?: string;
}): Promise<CollectorExecutionResult> {
  const ownerToken = options.ownerToken || randomUUID();
  if (!(await options.lease.acquire(options.namespace, ownerToken))) {
    return { success: true, skipped: true, reason: "collector_already_running" };
  }

  try {
    return { success: true, skipped: false, summary: await options.runSweep() };
  } finally {
    try {
      await options.lease.release(options.namespace, ownerToken);
    } catch (error) {
      console.error("Collector lease release failed; the lease will expire automatically.", error);
    }
  }
}

export function runCollectorWithLease(): Promise<CollectorExecutionResult> {
  return executeCollectorWithLease({
    namespace: collectorNamespace(),
    lease: selectedCollectorLease(),
    runSweep: () => globalCollector.runSweep(),
  });
}

export function runScheduledCollectorWithLease(): Promise<CollectorExecutionResult> {
  return withCollectorWorkerExecution(() => runCollectorWithLease());
}
