/**
 * Structured logging utility for Viridi
 */

import { JobLog } from "../types.js";

export function logJob(log: JobLog): void {
  const output = JSON.stringify(log);
  console.log(output);
}

export function info(
  job: "gas" | "gold" | "summary",
  action: "fetch" | "parse" | "classify" | "email" | "error",
  status: "success" | "partial" | "fail",
  details?: Record<string, unknown>,
  error?: string
): void {
  logJob({
    timestamp: new Date().toISOString(),
    job,
    action,
    status,
    details,
    error,
  });
}
