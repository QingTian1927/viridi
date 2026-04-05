/**
 * Date and time utilities for Vietnam timezone
 */

const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";

/**
 * Get current date in Vietnam timezone as YYYY-MM-DD
 */
export function getVietnamDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

/**
 * Get current timestamp in ISO8601 format (uses local system time)
 * In production, this will be UTC from GitHub Actions, but we store ISO8601 for consistency
 */
export function getCurrentISO8601(): string {
  return new Date().toISOString();
}

/**
 * Format timestamp to HH:MM:SS in Vietnam timezone
 */
export function formatTimeInVietnam(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: VIETNAM_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

/**
 * Format full datetime in Vietnam timezone
 */
export function formatDateTimeInVietnam(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: VIETNAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}
