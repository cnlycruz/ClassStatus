import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDashboardRenderFingerprint,
  DASHBOARD_REFRESH_INTERVAL_MS,
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

describe("visibility-aware dashboard refresh", () => {
  it("polls every 30 seconds only while visible", () => {
    vi.useFakeTimers();
    const target = new FakeVisibilityTarget();
    const refresh = vi.fn();
    const stop = startVisibilityAwareDashboardRefresh({ visibilityTarget: target, refresh });

    vi.advanceTimersByTime(DASHBOARD_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    target.setVisibility("hidden");
    vi.advanceTimersByTime(DASHBOARD_REFRESH_INTERVAL_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(1);

    target.setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(DASHBOARD_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
  });

  it("starts paused when the page is hidden and refreshes immediately on return", () => {
    vi.useFakeTimers();
    const target = new FakeVisibilityTarget();
    target.visibilityState = "hidden";
    const refresh = vi.fn();
    const stop = startVisibilityAwareDashboardRefresh({ visibilityTarget: target, refresh });

    vi.advanceTimersByTime(DASHBOARD_REFRESH_INTERVAL_MS * 2);
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
});
