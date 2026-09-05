import { ECDH } from "node:crypto";

export class InvalidPushSubscriptionError extends Error {
  constructor() { super("notification-subscription-invalid"); }
}

/** These are push-service namespaces, never general-purpose hosted domains. */
function isPushService(hostname: string): boolean {
  return hostname === "fcm.googleapis.com"
    || hostname === "updates.push.services.mozilla.com"
    || hostname === "web.push.apple.com"
    || hostname.endsWith(".push.apple.com")
    || hostname === "notify.windows.com"
    || hostname.endsWith(".notify.windows.com");
}

export function validatePushSubscription(input: { endpoint: string; p256dh: string; auth: string }): void {
  try {
    // Reject URL-parser normalization tricks rather than persisting an alternate
    // representation that web-push's legacy URL parser might interpret differently.
    if (input.endpoint.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(input.endpoint)) throw new Error();
    const endpoint = new URL(input.endpoint);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash
      || endpoint.port || !isPushService(endpoint.hostname) || endpoint.pathname === "/"
      || endpoint.href !== input.endpoint) throw new Error();

    // Push API keys are unpadded base64url: a 65-byte uncompressed P-256 point
    // and a 16-byte authentication secret. Length checks alone admit junk that
    // would otherwise remain in the retry outbox indefinitely.
    if (!/^[A-Za-z0-9_-]{87}$/.test(input.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(input.auth)) throw new Error();
    const publicKey = Buffer.from(input.p256dh, "base64url");
    const auth = Buffer.from(input.auth, "base64url");
    if (publicKey.length !== 65 || publicKey[0] !== 4 || auth.length !== 16
      || publicKey.toString("base64url") !== input.p256dh || auth.toString("base64url") !== input.auth) throw new Error();
    ECDH.convertKey(publicKey, "prime256v1", undefined, undefined, "uncompressed");
  } catch { throw new InvalidPushSubscriptionError(); }
}
