import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_REFRESH_INTERVAL_MS,
  startVisibilityAwareDashboardRefresh,
  type VisibilityTarget,
} from "@/lib/dashboardRefresh";

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
