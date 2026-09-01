export const DASHBOARD_REFRESH_INTERVAL_MS = 60_000;
export const DASHBOARD_REFRESH_SECOND = 30;

export function createDashboardRenderFingerprint<
  Summary extends {
    updatedAt: string;
    philippineTimeFormatted: string;
  },
>(payload: {
  summary: Summary;
  lgus: unknown;
}): string {
  const {
    updatedAt: _updatedAt,
    philippineTimeFormatted: _philippineTimeFormatted,
    ...renderedSummary
  } = payload.summary;

  return JSON.stringify({
    summary: renderedSummary,
    lgus: payload.lgus,
  });
}

export interface VisibilityTarget {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export function millisecondsUntilNextDashboardRefresh(nowMs = Date.now()): number {
  const now = new Date(nowMs);
  const next = new Date(nowMs);
  next.setMilliseconds(0);
  next.setSeconds(DASHBOARD_REFRESH_SECOND);
  if (next.getTime() <= now.getTime()) next.setMinutes(next.getMinutes() + 1);
  return next.getTime() - now.getTime();
}

export function startVisibilityAwareDashboardRefresh(options: {
  visibilityTarget: VisibilityTarget;
  refresh: () => void | Promise<void>;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): () => void {
  const now = options.now || Date.now;
  const setTimeoutFn = options.setTimeoutFn || setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const cancel = () => {
    if (timer !== undefined) clearTimeoutFn(timer);
    timer = undefined;
  };

  const schedule = () => {
    cancel();
    if (stopped || options.visibilityTarget.visibilityState !== "visible") return;
    timer = setTimeoutFn(() => {
      timer = undefined;
      if (stopped || options.visibilityTarget.visibilityState !== "visible") return;
      void Promise.resolve(options.refresh()).finally(schedule);
    }, millisecondsUntilNextDashboardRefresh(now()));
  };

  const onVisibilityChange = () => {
    if (options.visibilityTarget.visibilityState !== "visible") {
      cancel();
      return;
    }
    void Promise.resolve(options.refresh()).finally(schedule);
  };

  schedule();
  options.visibilityTarget.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    stopped = true;
    cancel();
    options.visibilityTarget.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
