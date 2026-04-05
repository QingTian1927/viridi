/**
 * Gasoline price check job
 * Triggered on schedule: 08:00, 14:00, 20:00, 23:00 ICT
 * 
 * Flow:
 * 1. Acquire lock to prevent overlap
 * 2. Fetch current prices from PVOil
 * 3. Load previous prices from Redis
 * 4. For each fuel type (RON95, E5):
 *    - If unchanged, skip
 *    - Classify change as major or minor
 *    - Send alert (if major) or log (if minor)
 *    - Update last known price
 * 5. Release lock and record health status
 */

import { fetchGasolinePrices } from "../parsers/gasolineParser.js";
import { classifyGasChange } from "../core/classification.js";
import {
  getLastGasPrice,
  setLastGasPrice,
  addDailyGasLog,
  acquireLockToken,
  releaseLock,
  recordHealthSuccess,
  recordHealthError,
} from "../core/state.js";
import { sendMajorGroupedAlert } from "../services/emailService.js";
import { info } from "../utils/logger.js";
import { getCurrentISO8601 } from "../utils/datetime.js";
import { isValidGasPrice } from "../utils/validators.js";

async function main() {
  const jobName = "gas";

  try {
    // 1. Acquire lock
    const lockId = await acquireLockToken(jobName);
    if (!lockId) {
      info(jobName, "fetch", "partial", { message: "Lock already held, skipping run" });
      return;
    }

    try {
      // 2. Fetch current prices
      info(jobName, "fetch", "success", undefined);
      const fetchResult = await fetchGasolinePrices();

      if (!fetchResult.success) {
        info(jobName, "parse", "fail", undefined, fetchResult.error);
        await recordHealthError(jobName, fetchResult.error || "Unknown parse error");
        return;
      }

      const currentPrices = fetchResult.data!;
      info(jobName, "parse", "success", { ron95: currentPrices.ron95, e5: currentPrices.e5 });

      // 3. Load previous prices
      const previousPrices = await getLastGasPrice();

      // Bootstrap first run: store baseline only, do not compare or alert.
      if (!previousPrices.ron95 || !previousPrices.e5) {
        await setLastGasPrice(currentPrices.ron95, currentPrices.e5);
        await recordHealthSuccess(jobName);
        info(jobName, "fetch", "success", {
          message: "First run baseline initialized",
          ron95: currentPrices.ron95,
          e5: currentPrices.e5,
        });
        return;
      }

      // Baseline integrity guard: if stored previous value is invalid,
      // treat it as corrupted/test seed and reset baseline without comparing.
      if (!isValidGasPrice(previousPrices.ron95.price) || !isValidGasPrice(previousPrices.e5.price)) {
        await setLastGasPrice(currentPrices.ron95, currentPrices.e5);
        await recordHealthSuccess(jobName);
        info(jobName, "fetch", "partial", {
          message: "Invalid previous baseline detected; baseline reset",
          previousRon95: previousPrices.ron95.price,
          previousE5: previousPrices.e5.price,
          currentRon95: currentPrices.ron95,
          currentE5: currentPrices.e5,
        });
        return;
      }

      // 4. Process each fuel type
      let anyChanges = false;
      const groupedRows: Array<{
        subtype: string;
        oldPrice: number;
        newPrice: number;
        delta_vnd: number;
        delta_pct: number;
      }> = [];
      const majorChanges: Array<{
        subtype: string;
        oldPrice: number;
        newPrice: number;
        delta_vnd: number;
        delta_pct: number;
      }> = [];

      const fuelEntries = [
        {
          code: "RON95",
          subtype: "Xang RON 95-III",
          oldPrice: previousPrices.ron95.price,
          newPrice: currentPrices.ron95,
        },
        {
          code: "E5",
          subtype: "Xang E5 RON 92-II",
          oldPrice: previousPrices.e5.price,
          newPrice: currentPrices.e5,
        },
      ];

      for (const fuel of fuelEntries) {
        const oldPrice = fuel.oldPrice;
        const newPrice = fuel.newPrice;
        if (oldPrice === newPrice) {
          groupedRows.push({
            subtype: fuel.subtype,
            oldPrice,
            newPrice,
            delta_vnd: 0,
            delta_pct: 0,
          });
          info(jobName, "classify", "success", {
            fuel: fuel.code,
            status: "unchanged",
          });
        } else {
          anyChanges = true;
          const classification = classifyGasChange(oldPrice, newPrice);

          info(jobName, "classify", "success", {
            fuel: fuel.code,
            isMajor: classification.isMajor,
            delta_vnd: classification.delta_vnd,
            delta_pct: classification.delta_pct,
          });

          if (classification.isMajor) {
            const changeRow = {
              subtype: fuel.subtype,
              oldPrice,
              newPrice,
              delta_vnd: classification.delta_vnd,
              delta_pct: classification.delta_pct,
            };
            majorChanges.push(changeRow);
            groupedRows.push(changeRow);
          } else {
            // Add to daily log
            const logEntry = {
              ts: getCurrentISO8601(),
              subtype: fuel.subtype,
              old: oldPrice,
              new: newPrice,
              delta_vnd: classification.delta_vnd,
              delta_pct: classification.delta_pct,
            };

            await addDailyGasLog(logEntry);
            groupedRows.push({
              subtype: fuel.subtype,
              oldPrice,
              newPrice,
              delta_vnd: classification.delta_vnd,
              delta_pct: classification.delta_pct,
            });
            info(jobName, "email", "success", {
              fuel: fuel.code,
              isMajor: false,
              loggedToDaily: true,
            });
          }
        }
      }

      if (majorChanges.length > 0) {
        const alertSent = await sendMajorGroupedAlert({
          assetType: "gasoline",
          timestamp: getCurrentISO8601(),
          changes: groupedRows,
        });

        info(jobName, "email", alertSent ? "success" : "fail", {
          grouped: true,
          majorChangeCount: majorChanges.length,
          emailSent: alertSent,
        });
      }

      // 5. Update last prices
      await setLastGasPrice(currentPrices.ron95, currentPrices.e5);

      // Record success
      await recordHealthSuccess(jobName);

      info(jobName, "fetch", "success", {
        message: "Job completed",
        changesDetected: anyChanges,
      });
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
  console.error("Gasoline job crashed:", err);
  process.exit(1);
});
