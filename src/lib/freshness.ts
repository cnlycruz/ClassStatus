import { MANILA_TIMEZONE } from "@/utils/philippineTime";
import { OPERATIONAL_COLLECTOR_SOURCES } from "@/data/sources";

// Both live Tier 3 sources are scheduled every minute. A delay begins only
// after two scheduled checks have been missed. Eight intervals is the current
// seven-minute Production lease ceiling plus the next one-minute schedule.
export const EXPECTED_COLLECTOR_INTERVAL_MS = Math.min(
  ...OPERATIONAL_COLLECTOR_SOURCES.map((source) => source.checkIntervalMinutes),
) * 60_000;
export const DELAYED_AFTER_MS = EXPECTED_COLLECTOR_INTERVAL_MS * 2;
export const OUTDATED_AFTER_MS = EXPECTED_COLLECTOR_INTERVAL_MS * 8;

export type FreshnessState = "fresh" | "delayed" | "outdated";

export type FreshnessDisplay = {
  text: string;
  exactTime: string;
  state: FreshnessState;
} | null;

function isValidTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function getFreshnessState(elapsedMs: number): FreshnessState {
  if (elapsedMs > OUTDATED_AFTER_MS) return "outdated";
  if (elapsedMs > DELAYED_AFTER_MS) return "delayed";
  return "fresh";
}

export function formatFreshness(timestamp: string | null | undefined, now: Date = new Date()): FreshnessDisplay {
  if (!timestamp || !isValidTimestamp(timestamp)) return null;

  const checkedAt = new Date(timestamp);
  const elapsedMs = now.getTime() - checkedAt.getTime();
  if (elapsedMs < 0) return null;

  const exactTime = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    dateStyle: "long",
    timeStyle: "short",
  }).format(checkedAt) + " PHT";

  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  const state = getFreshnessState(elapsedMs);
  if (elapsedMinutes < 1) return { text: "Last complete check less than a minute ago", exactTime, state };
  if (elapsedMinutes < 60) return {
    text: `Last complete check ${elapsedMinutes} ${elapsedMinutes === 1 ? "minute" : "minutes"} ago`,
    exactTime,
    state,
  };

  const manilaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(checkedAt);

  if (manilaDate.format(checkedAt) === manilaDate.format(now)) {
    return { text: `Last complete check today at ${time}`, exactTime, state };
  }

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    month: "short",
    day: "numeric",
  }).format(checkedAt);
  return { text: `Last complete check ${date} at ${time}`, exactTime, state };
}
