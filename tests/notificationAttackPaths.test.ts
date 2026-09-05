import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createECDH, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as subscribe } from "@/app/api/alerts/subscribe/route";
import { createManualBroadcast, savePushSubscription } from "@/lib/notifications/storage";
import { dispatchPendingPushNotifications } from "@/lib/notifications/dispatch";
import { validatePushSubscription } from "@/lib/notifications/subscriptionValidation";

const origin = "http://localhost:3000";
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const keys = { p256dh: ecdh.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 7).toString("base64url") };
let directory: string;
function request(endpoint: string, subscriptionKeys = keys) {
  return new NextRequest(`${origin}/api/alerts/subscribe`, {
    method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" },
    body: JSON.stringify({ subscription: { endpoint, keys: subscriptionKeys }, lguIds: ["manila"] }),
  });
}

describe("anonymous notification attack paths", () => {
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "classstatus-push-security-"));
    vi.stubEnv("CLASSSTATUS_DATA_DIR", directory);
    vi.stubEnv("CLASSSTATUS_STORAGE_DRIVER", "local-json");
    vi.stubEnv("CLASSSTATUS_SUPABASE_NAMESPACE", "preview");
    vi.stubEnv("CLASSSTATUS_PUBLIC_ORIGIN", origin);
    vi.stubEnv("CLASSSTATUS_VAPID_PUBLIC_KEY", "mock-public-key");
    vi.stubEnv("CLASSSTATUS_VAPID_PRIVATE_KEY", "mock-private-key");
    vi.stubEnv("CLASSSTATUS_VAPID_SUBJECT", "mailto:test@example.invalid");
    vi.spyOn(webpush, "setVapidDetails").mockImplementation(() => undefined);
    vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  });
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("rejects an anonymous attacker-controlled destination before persistence", async () => {
    const response = await subscribe(request("https://attacker.example/receive"));
    expect(response.status).toBe(422);
    expect(fs.existsSync(path.join(directory, "push_notifications.json"))).toBe(false);
  });

  it("rejects an unsafe destination at the shared storage boundary", async () => {
    await expect(savePushSubscription({ endpoint: "https://attacker.example/receive", ...keys, lguIds: ["manila"] }))
      .rejects.toThrow("notification-subscription-invalid");
    expect(fs.existsSync(path.join(directory, "push_notifications.json"))).toBe(false);
  });

  it.each([
    "https://127.0.0.1:8443/internal", "http://169.254.169.254/latest/meta-data/",
    "https://2130706433/internal", "https://0177.0.0.1/internal", "https://0x7f000001/internal",
    "https://[::1]/internal", "https://[::ffff:127.0.0.1]/internal", "https://10.0.0.1/internal",
    "https://metadata.google.internal/computeMetadata/v1/", "file:///etc/passwd", "javascript:alert(1)",
    "https://fcm.googleapis.com.attacker.example/push", "https://attacker.example/#fcm.googleapis.com",
    "https://fcm.googleapis.com@attacker.example/push", "https://attacker@fcm.googleapis.com/push",
    "https://fcm.googleapis.com:8443/push", "https://fcm.googleapis.com./push",
    "https://fcm.googleapis.com/push#fragment", "https://fcm.googleapis.com\\@attacker.example/push",
    "https://fcm.googleapis.com/\npush", "https://attacker.push.apple.com.evil.example/push",
  ])("rejects destination confusion/private-network input %s", async (endpoint) => {
    expect((await subscribe(request(endpoint))).status).toBe(422);
  });

  it.each([
    "https://fcm.googleapis.com/fcm/send/synthetic-token",
    "https://updates.push.services.mozilla.com/wpush/v2/synthetic-token",
    "https://web.push.apple.com/synthetic-token",
    "https://wns2-db5p.notify.windows.com/w/?token=synthetic-token",
  ])("accepts supported provider subscription %s without making a network request", async (endpoint) => {
    const response = await subscribe(request(endpoint));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ subscriptionId: expect.any(String) });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it.each([
    { p256dh: "a".repeat(32), auth: keys.auth },
    { p256dh: keys.p256dh, auth: "a".repeat(16) },
    { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString("base64url"), auth: keys.auth },
    { p256dh: keys.p256dh, auth: `${keys.auth.slice(0, -1)}x` },
  ])("rejects malformed encryption keys before persistence %#", async (subscriptionKeys) => {
    expect((await subscribe(request("https://fcm.googleapis.com/fcm/send/fixture", subscriptionKeys))).status).toBe(422);
    expect(fs.existsSync(path.join(directory, "push_notifications.json"))).toBe(false);
  });

  it("bounds transport socket inactivity for valid stored subscriptions", async () => {
    await savePushSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/fixture", ...keys, lguIds: ["manila"] });
    await createManualBroadcast({ requestKey: randomUUID(), message: "Local security fixture", recipientMode: "all", targetLguIds: [] });
    await dispatchPendingPushNotifications();
    expect(webpush.sendNotification).toHaveBeenCalledWith(expect.any(Object), expect.any(String), { timeout: 10_000 });
  });

  it("rejects a syntactically valid but invalid curve point at the sender boundary", () => {
    expect(() => validatePushSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/fixture", p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString("base64url"), auth: keys.auth })).toThrow("notification-subscription-invalid");
  });

  it("invalidates legacy arbitrary destinations before the network sender runs", async () => {
    // Represents a subscription accepted before endpoint validation existed.
    await savePushSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/legacy-fixture", ...keys, lguIds: ["manila"] });
    const file = path.join(directory, "push_notifications.json");
    const legacy = JSON.parse(fs.readFileSync(file, "utf8"));
    legacy.subscriptions[0].endpoint = "https://attacker.example/receive";
    fs.writeFileSync(file, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");
    // Simulates the ordinary later authorized broadcast that triggers dispatch.
    await createManualBroadcast({ requestKey: randomUUID(), message: "Local security fixture", recipientMode: "all", targetLguIds: [] });
    await dispatchPendingPushNotifications();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    const state = JSON.parse(fs.readFileSync(path.join(directory, "push_notifications.json"), "utf8"));
    expect(state.subscriptions[0].active).toBe(false);
    expect(state.deliveries[0]).toMatchObject({ state: "invalid", lastErrorCode: "subscription-invalid" });
  });
});
