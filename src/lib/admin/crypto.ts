import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export function randomToken(bytes = 32): string { return randomBytes(bytes).toString("base64url"); }
export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function hmac(value: string, secret: Buffer): string { return createHmac("sha256", secret).update(value).digest("base64url"); }
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
