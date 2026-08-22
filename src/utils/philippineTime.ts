/**
 * Philippine Time (PHT, Asia/Manila, UTC+8) Utilities.
 * Ensures consistent date & time handling across server and client.
 */

export const MANILA_TIMEZONE = "Asia/Manila";

/**
 * Returns current Date object in UTC
 */
export function getNow(): Date {
  return new Date();
}

/**
 * Formats a Date object to YYYY-MM-DD in Asia/Manila timezone
 */
export function getManilaDateString(date: Date = getNow()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // e.g. "2026-08-19"
}

/**
 * Returns tomorrow's date formatted as YYYY-MM-DD in Asia/Manila timezone
 */
export function getManilaTomorrowDateString(date: Date = getNow()): string {
  const tomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return getManilaDateString(tomorrow);
}

/**
 * Formats current Manila time in readable 12-hour format with AM/PM (e.g., "10:30 PM PHT")
 */
export function formatManilaTime(date: Date = getNow()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${formatter.format(date)} PHT`;
}

/**
 * Formats date into human-readable string (e.g. "Wednesday, August 19, 2026")
 */
export function formatManilaDateReadable(dateStrOrDate: string | Date = getNow()): string {
  const date = typeof dateStrOrDate === "string" 
    ? new Date(`${dateStrOrDate}T00:00:00+08:00`)
    : dateStrOrDate;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return formatter.format(date);
}

/**
 * Extracts current hour (0-23) in Asia/Manila timezone
 */
export function getManilaHour(date: Date = getNow()): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    hour: "numeric",
    hour12: false,
  });
  return parseInt(formatter.format(date), 10);
}

/**
 * Checks if a given target date string (YYYY-MM-DD) is today in Asia/Manila
 */
export function isManilaToday(dateStr: string, now: Date = getNow()): boolean {
  return dateStr === getManilaDateString(now);
}

/**
 * Checks if a given target date string (YYYY-MM-DD) is tomorrow in Asia/Manila
 */
export function isManilaTomorrow(dateStr: string, now: Date = getNow()): boolean {
  return dateStr === getManilaTomorrowDateString(now);
}

/**
 * Checks if target date is in the past in Asia/Manila
 */
export function isManilaPast(dateStr: string, now: Date = getNow()): boolean {
  return dateStr < getManilaDateString(now);
}
