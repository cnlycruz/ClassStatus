import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("web push privacy contracts", () => {
  it("keeps subscriptions and notification events private in Supabase", () => {
    const migration = read("supabase", "migrations", "20260905100000_add_web_push_notifications.sql");
    expect(migration).toContain("classstatus_push_subscriptions enable row level security");
    expect(migration).toContain("classstatus_notification_events enable row level security");
    expect(migration).toContain("revoke all on table public.classstatus_push_subscriptions from public, anon, authenticated");
    expect(migration).not.toMatch(/grant .*classstatus_(?:push_subscriptions|notification_events).* to anon/i);
  });

  it("never returns subscription keys or VAPID private credentials to browser routes", () => {
    const config = read("src", "app", "api", "alerts", "config", "route.ts");
    const subscribe = read("src", "app", "api", "alerts", "subscribe", "route.ts");
    expect(config).toContain("CLASSSTATUS_VAPID_PUBLIC_KEY");
    expect(config).not.toContain("VAPID_PRIVATE");
    expect(subscribe).not.toContain("p256dh: subscription.p256dh");
    expect(subscribe).toContain("subscriptionId: subscription.id");
  });

  it("keeps manual broadcasts admin-only and exposes no public history route", () => {
    const route = read("src", "app", "api", "admin", "notifications", "route.ts");
    const bootstrap = read("src", "app", "api", "admin", "bootstrap", "route.ts");
    expect(route).toContain("requireAdminMutation(request)");
    expect(route).not.toContain("export async function GET");
    expect(bootstrap).toContain("requireAdmin()");
  });

  it("uses a private idempotent manual-broadcast outbox extension", () => {
    const migration = read("supabase", "migrations", "20260905101500_add_manual_admin_broadcasts.sql");
    expect(migration).toContain("event_type in ('automatic', 'manual')");
    expect(migration).toContain("manual_request_key_idx");
    expect(migration).toContain("subscription.lgu_ids && target_ids");
    expect(migration).toContain("classstatus_private.manual_notification_store");
    expect(migration).toContain("revoke execute on all functions in schema classstatus_private");
  });
});
