import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDashboardRenderFingerprint,
  millisecondsUntilNextDashboardRefresh,
  startVisibilityAwareDashboardRefresh,
  type VisibilityTarget,
} from "@/lib/dashboardRefresh";

const dashboardPayload = {
  summary: {
    updatedAt: "2026-09-01T00:00:00.000Z",
    philippineTimeFormatted: "8:00:00 AM PHT",
    todayDateFormatted: "September 1, 2026",
    suspendedCount: 2,
    overallStatusHeadline: "Active Class Suspensions in 2 LGUs across Metro Manila",
  },
  lgus: [{ id: "manila", status: "classes-suspended" }],
};

class FakeVisibilityTarget implements VisibilityTarget {
  public visibilityState = "visible";
  private listener?: () => void;
  addEventListener(_type: "visibilitychange", listener: () => void) { this.listener = listener; }
  removeEventListener(_type: "visibilitychange", listener: () => void) {
    if (this.listener === listener) this.listener = undefined;
  }
  setVisibility(state: "visible" | "hidden") {
    this.visibilityState = state;
    this.listener?.();
  }
}

afterEach(() => vi.useRealTimers());

describe("wall-clock dashboard refresh", () => {
  it("aligns the next refresh to second 30", () => {
    expect(millisecondsUntilNextDashboardRefresh(Date.parse("2026-08-30T12:00:05.000Z"))).toBe(25_000);
    expect(millisecondsUntilNextDashboardRefresh(Date.parse("2026-08-30T12:00:29.000Z"))).toBe(1_000);
    expect(millisecondsUntilNextDashboardRefresh(Date.parse("2026-08-30T12:00:30.001Z"))).toBe(59_999);
  });

  it("stays aligned across repeated runs and pauses while hidden", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T12:00:05.000Z"));
    const target = new FakeVisibilityTarget();
    const refresh = vi.fn();
    const stop = startVisibilityAwareDashboardRefresh({ visibilityTarget: target, refresh });

    await vi.advanceTimersByTimeAsync(25_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(Date.now()).toBe(Date.parse("2026-08-30T12:00:30.000Z"));

    target.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    target.setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(new Date(Date.now()).getUTCSeconds()).toBe(30);
    stop();
  });

  it("starts paused when hidden and refreshes immediately on return", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T12:00:05.000Z"));
    const target = new FakeVisibilityTarget();
    target.visibilityState = "hidden";
    const refresh = vi.fn();
    const stop = startVisibilityAwareDashboardRefresh({ visibilityTarget: target, refresh });

    await vi.advanceTimersByTimeAsync(90_000);
    expect(refresh).not.toHaveBeenCalled();
    target.setVisibility("visible");
    expect(refresh).toHaveBeenCalledOnce();
    stop();
  });
});

describe("dashboard render fingerprint", () => {
  it("ignores only non-rendered request clock fields", () => {
    const nextPoll = {
      ...dashboardPayload,
      summary: {
        ...dashboardPayload.summary,
        updatedAt: "2026-09-01T00:00:30.000Z",
        philippineTimeFormatted: "8:00:30 AM PHT",
      },
    };

    expect(createDashboardRenderFingerprint(nextPoll)).toBe(
      createDashboardRenderFingerprint(dashboardPayload),
    );
  });

  it("changes when rendered summary or LGU data changes", () => {
    const changedCount = {
      ...dashboardPayload,
      summary: { ...dashboardPayload.summary, suspendedCount: 3 },
    };
    const changedLgu = {
      ...dashboardPayload,
      lgus: [{ id: "manila", status: "classes-continue" }],
    };

    expect(createDashboardRenderFingerprint(changedCount)).not.toBe(
      createDashboardRenderFingerprint(dashboardPayload),
    );
    expect(createDashboardRenderFingerprint(changedLgu)).not.toBe(
      createDashboardRenderFingerprint(dashboardPayload),
    );
  });

  it("changes when the public successful-check timestamp changes", () => {
    const first = { ...dashboardPayload, freshness: { lastSuccessfulCheckAt: "2026-09-01T00:00:00.000Z" } };
    const next = { ...dashboardPayload, freshness: { lastSuccessfulCheckAt: "2026-09-01T00:01:00.000Z" } };
    expect(createDashboardRenderFingerprint(first)).not.toBe(createDashboardRenderFingerprint(next));
  });
});
