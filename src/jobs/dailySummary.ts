/**
 * Daily summary job
 * Triggered once per day at 23:30 ICT
 *
 * Flow:
 * 1. Acquire lock to prevent overlap
 * 2. Load daily logs for gasoline and gold
 * 3. If both empty, exit (no email)
 * 4. Compute net change, high, low for each asset
 * 5. Build and send summary email
 * 6. Clear daily logs (only on successful send)
 * 7. Record health status
 */

import {
  getDailyGasLog,
  getDailyGoldLog,
  clearDailyGasLog,
  clearDailyGoldLog,
  acquireLockToken,
  releaseLock,
  recordHealthSuccess,
  recordHealthError,
} from "../core/state.js";
import { sendDailySummary } from "../services/emailService.js";
import { info } from "../utils/logger.js";
import { getVietnamDateString } from "../utils/datetime.js";
import { SummaryEmailData, DailyChangeLog, SubtypeSummary } from "../types.js";

function computeSummary(changes: DailyChangeLog[]): SubtypeSummary | null {
  if (changes.length === 0) {
    return null;
  }

  const firstChange = changes[0];
  const lastChange = changes[changes.length - 1];

  const netChange = lastChange.new - firstChange.old;
  const netChangePct = (netChange / firstChange.old) * 100;

  let high = firstChange.old;
  let low = firstChange.old;

  changes.forEach((change) => {
    if (change.new > high) high = change.new;
    if (change.new < low) low = change.new;
    if (change.old > high) high = change.old;
    if (change.old < low) low = change.old;
  });

  return {
    subtype: changes[0].subtype,
    changes,
    netChange,
    netChangePct,
    high,
    low,
  };
}

function computeGroupedSummaries(changes: DailyChangeLog[]): SubtypeSummary[] {
  const bySubtype = new Map<string, DailyChangeLog[]>();

  for (const change of changes) {
    const key = change.subtype || "Unknown";
    const group = bySubtype.get(key);
    if (group) {
      group.push(change);
    } else {
      bySubtype.set(key, [change]);
    }
  }

  const groups: SubtypeSummary[] = [];
  for (const groupChanges of bySubtype.values()) {
    const summary = computeSummary(groupChanges);
    if (summary) {
      groups.push(summary);
    }
  }

  return groups;
}

async function main() {
  const jobName = "summary";
  const dateStr = getVietnamDateString();

  try {
    // 1. Acquire lock
    const lockId = await acquireLockToken(jobName);
    if (!lockId) {
      info(jobName, "fetch", "partial", { message: "Lock already held, skipping run" });
      return;
    }

    try {
      // 2. Load daily logs
      info(jobName, "fetch", "success", undefined);

      const gasLog = await getDailyGasLog(dateStr);
      const goldLog = await getDailyGoldLog(dateStr);

      info(jobName, "parse", "success", {
        gasChanges: gasLog.length,
        goldChanges: goldLog.length,
      });

      // 3. Check if empty
      if (gasLog.length === 0 && goldLog.length === 0) {
        info(jobName, "email", "success", {
          message: "No changes today, skipping email",
          date: dateStr,
        });
        await recordHealthSuccess(jobName);
        return;
      }

      // 4. Compute summaries
      const gasGroups = computeGroupedSummaries(gasLog);
      const goldGroups = computeGroupedSummaries(goldLog);

      info(jobName, "classify", "success", {
        gasSummaryGroupCount: gasGroups.length,
        goldSummaryGroupCount: goldGroups.length,
      });

      // 5. Build and send summary email
      const summaryData: SummaryEmailData = {
        date: dateStr,
        gasoline: gasGroups.length > 0 ? { groups: gasGroups } : undefined,
        gold: goldGroups.length > 0 ? { groups: goldGroups } : undefined,
      };

      const emailSent = await sendDailySummary(summaryData);

      if (!emailSent) {
        info(jobName, "email", "fail", {
          message: "Failed to send summary email",
          date: dateStr,
        });
        await recordHealthError(jobName, "Failed to send summary email");
        // Note: NOT clearing logs on failure, so they'll be retried next run
        return;
      }

      info(jobName, "email", "success", {
        message: "Summary email sent",
        date: dateStr,
        gasChanges: gasLog.length,
        goldChanges: goldLog.length,
      });

      // 6. Clear daily logs (only on successful send)
      await clearDailyGasLog(dateStr);
      await clearDailyGoldLog(dateStr);

      // 7. Record success
      await recordHealthSuccess(jobName);
    } finally {
      // Always release lock
      await releaseLock(jobName, lockId);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    info(jobName, "error", "fail", undefined, errorMsg);
    await recordHealthError(jobName, errorMsg);
  }
}

main().catch((err) => {
  console.error("Summary job crashed:", err);
  process.exit(1);
});
