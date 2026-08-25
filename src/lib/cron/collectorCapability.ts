import { createHash, createHmac, randomUUID } from "node:crypto";
import { getCronSecret } from "@/lib/cron/authorization";
import { getDeploymentNamespace } from "@/lib/storage/driver";
import type { DeploymentNamespace } from "@/lib/storage/contracts";

export const COLLECTOR_CAPABILITY_VERSION = "classstatus-collector-v1";

export const COLLECTOR_CAPABILITY_ACTIONS = [
  "lease.acquire",
  "lease.release",
  "record.upsert",
  "logs.append",
] as const;

export type CollectorCapabilityAction = (typeof COLLECTOR_CAPABILITY_ACTIONS)[number];

interface CollectorCapabilityInput {
  namespace: DeploymentNamespace;
  action: CollectorCapabilityAction;
  payload: string;
  issuedAt: number;
  nonce: string;
  secret: string;
}

export interface CollectorCapabilityRpcArgs {
  p_payload: string;
  p_issued_at: number;
  p_nonce: string;
  p_signature: string;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildCollectorCapabilityMessage(input: Omit<CollectorCapabilityInput, "secret">): string {
  return [
    COLLECTOR_CAPABILITY_VERSION,
    input.namespace,
    input.action,
    String(input.issuedAt),
    input.nonce,
    sha256Hex(input.payload),
  ].join("\n");
}

export function signCollectorCapability(input: CollectorCapabilityInput): CollectorCapabilityRpcArgs {
  if (input.namespace !== "preview" && input.namespace !== "production") {
    throw new Error("COLLECTOR_CAPABILITY_UNAVAILABLE");
  }
  if (!COLLECTOR_CAPABILITY_ACTIONS.includes(input.action)) throw new Error("COLLECTOR_CAPABILITY_UNAVAILABLE");
  if (!Number.isSafeInteger(input.issuedAt) || input.issuedAt <= 0) throw new Error("COLLECTOR_CAPABILITY_UNAVAILABLE");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.nonce)) {
    throw new Error("COLLECTOR_CAPABILITY_UNAVAILABLE");
  }
  if (input.secret.length < 43) throw new Error("COLLECTOR_CAPABILITY_UNAVAILABLE");

  const message = buildCollectorCapabilityMessage(input);
  return {
    p_payload: input.payload,
    p_issued_at: input.issuedAt,
    p_nonce: input.nonce,
    p_signature: createHmac("sha256", input.secret).update(message, "utf8").digest("hex"),
  };
}

export function createCollectorCapability(
  action: CollectorCapabilityAction,
  payload: unknown
): CollectorCapabilityRpcArgs {
  const namespace = getDeploymentNamespace();
  const serializedPayload = JSON.stringify(payload);
  if (serializedPayload === undefined) throw new Error("COLLECTOR_CAPABILITY_UNAVAILABLE");
  return signCollectorCapability({
    namespace,
    action,
    payload: serializedPayload,
    issuedAt: Math.floor(Date.now() / 1000),
    nonce: randomUUID().toLowerCase(),
    secret: getCronSecret(),
  });
}
