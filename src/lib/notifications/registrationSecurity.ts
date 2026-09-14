import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { getSecurityPepper } from "@/lib/admin/config";
import { getStorageDriver } from "@/lib/storage/driver";

export const PUSH_REGISTRATION_RATE_POLICY = {
  burstWindowSeconds: 10 * 60,
  burstAttemptLimit: 60,
  burstNewEndpointLimit: 30,
  dailyAttemptLimit: 600,
  dailyNewEndpointLimit: 200,
} as const;

export class PushRegistrationRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("push-registration-rate-limited");
  }
}

function normalizeIp(value: string): string | undefined {
  const candidate = value.trim();
  const version = isIP(candidate);
  if (version === 4) return candidate.split(".").map((part) => String(Number(part))).join(".");
  if (version === 6) {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  }
  return undefined;
}

export function pushRegistrationIdentityHash(request: NextRequest): string {
  let identity: string;
  if (process.env.VERCEL === "1") {
    const forwarded = request.headers.get("x-vercel-forwarded-for");
    // Vercel documents this as its platform-derived client address. Reject a
    // list or malformed value rather than falling back to a spoofable header.
    if (!forwarded || forwarded.includes(",")) throw new Error("push-registration-identity-unavailable");
    const ip = normalizeIp(forwarded);
    if (!ip) throw new Error("push-registration-identity-unavailable");
    identity = `ip:${ip}`;
  } else {
    // Local JSON is a development/test capability. A shared local bucket keeps
    // behavior deterministic without trusting arbitrary forwarded headers.
    if (getStorageDriver() !== "local-json") throw new Error("push-registration-identity-unavailable");
    identity = "local-development";
  }

  const secret = getStorageDriver() === "local-json"
    ? Buffer.from("classstatus-local-push-registration", "utf8")
    : getSecurityPepper();
  return createHmac("sha256", secret).update(`push-registration\0${identity}`, "utf8").digest("hex");
}
