import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

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

// Development-only: one shared, deterministic bucket and no trusted proxy headers.
export function pushRegistrationIdentityHash(_request: NextRequest): string {
  return createHmac("sha256", "classstatus-local-push-registration")
    .update("push-registration\0local-development", "utf8")
    .digest("hex");
}
