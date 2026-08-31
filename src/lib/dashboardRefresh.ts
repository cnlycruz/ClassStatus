export const DASHBOARD_REFRESH_INTERVAL_MS = 30_000;

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

export function startVisibilityAwareDashboardRefresh(options: {
  visibilityTarget: VisibilityTarget;
  refresh: () => void | Promise<void>;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}): () => void {
  const setIntervalFn = options.setIntervalFn || setInterval;
  const clearIntervalFn = options.clearIntervalFn || clearInterval;
  let interval: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (interval !== undefined) clearIntervalFn(interval);
    interval = undefined;
  };
  const start = () => {
    if (interval !== undefined || options.visibilityTarget.visibilityState !== "visible") return;
    interval = setIntervalFn(() => void options.refresh(), DASHBOARD_REFRESH_INTERVAL_MS);
  };
  const onVisibilityChange = () => {
    if (options.visibilityTarget.visibilityState !== "visible") {
      stop();
      return;
    }
    void options.refresh();
    start();
  };

  start();
  options.visibilityTarget.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    stop();
    options.visibilityTarget.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
