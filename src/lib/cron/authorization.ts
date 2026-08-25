import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const MINIMUM_CRON_SECRET_CHARACTERS = 43;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function getCronSecret(): string {
  const secret = process.env.CLASSSTATUS_CRON_SECRET?.trim() || "";
  if (secret.length < MINIMUM_CRON_SECRET_CHARACTERS) throw new Error("CRON_AUTH_UNAVAILABLE");
  return secret;
}

export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expected = process.env.CLASSSTATUS_CRON_SECRET?.trim() || "";
  const match = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/);
  const supplied = match?.[1] || "";
  const configured = expected.length >= MINIMUM_CRON_SECRET_CHARACTERS;
  const matched = timingSafeEqual(digest(supplied), digest(expected));
  return configured && Boolean(match) && matched;
}
