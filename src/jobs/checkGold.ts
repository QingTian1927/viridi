/**
 * Gold price check job
 * Triggered on schedule: Every 2 days at 09:00 ICT
 * 
 * Flow:
 * 1. Acquire lock to prevent overlap
 * 2. Fetch current prices from PhuQuy Group
 * 3. Load previous prices from Redis
 * 4. For each price type (buy, sell):
 *    - If unchanged, skip
 *    - Classify change as major or minor
 *    - Send alert (if major) or log (if minor)
 *    - Update last known price
 * 5. Release lock and record health status
 */

import { fetchGoldPrices } from "../parsers/goldParser.js";
import { classifyGoldChange } from "../core/classification.js";
import {
  getLastGoldPrice,
  setLastGoldPrice,
  addDailyGoldLog,
  acquireLockToken,
  releaseLock,
  recordHealthSuccess,
  recordHealthError,
} from "../core/state.js";
import { sendMajorGroupedAlert } from "../services/emailService.js";
import { info } from "../utils/logger.js";
import { getCurrentISO8601 } from "../utils/datetime.js";
import { isValidGoldPrice } from "../utils/validators.js";

async function main() {
  const jobName = "gold";

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
      const fetchResult = await fetchGoldPrices();

      if (!fetchResult.success) {
        info(jobName, "parse", "fail", undefined, fetchResult.error);
        await recordHealthError(jobName, fetchResult.error || "Unknown parse error");
        return;
      }

      const currentPrices = fetchResult.data!;
      info(jobName, "parse", "success", { buy: currentPrices.buy, sell: currentPrices.sell });

      // 3. Load previous prices
      const previousPrices = await getLastGoldPrice();

      // Bootstrap first run: store baseline only, do not compare or alert.
      if (!previousPrices.buy || !previousPrices.sell) {
        await setLastGoldPrice(currentPrices.buy, currentPrices.sell);
        await recordHealthSuccess(jobName);
        info(jobName, "fetch", "success", {
          message: "First run baseline initialized",
          buy: currentPrices.buy,
          sell: currentPrices.sell,
        });
        return;
      }

      // Baseline integrity guard: if stored previous value is invalid,
      // treat it as corrupted/test seed and reset baseline without comparing.
      if (!isValidGoldPrice(previousPrices.buy.price) || !isValidGoldPrice(previousPrices.sell.price)) {
        await setLastGoldPrice(currentPrices.buy, currentPrices.sell);
        await recordHealthSuccess(jobName);
        info(jobName, "fetch", "partial", {
          message: "Invalid previous baseline detected; baseline reset",
          previousBuy: previousPrices.buy.price,
          previousSell: previousPrices.sell.price,
          currentBuy: currentPrices.buy,
          currentSell: currentPrices.sell,
        });
        return;
      }

      // 4. Process each price type
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

      const goldEntries = [
        {
          key: "buy",
          subtype: "Vang mieng SJC - Buy",
          oldPrice: previousPrices.buy.price,
          newPrice: currentPrices.buy,
        },
        {
          key: "sell",
          subtype: "Vang mieng SJC - Sell",
          oldPrice: previousPrices.sell.price,
          newPrice: currentPrices.sell,
        },
      ];

      for (const gold of goldEntries) {
        const oldPrice = gold.oldPrice;
        const newPrice = gold.newPrice;
        if (oldPrice === newPrice) {
          groupedRows.push({
            subtype: gold.subtype,
            oldPrice,
            newPrice,
            delta_vnd: 0,
            delta_pct: 0,
          });
          info(jobName, "classify", "success", {
            type: gold.key,
            status: "unchanged",
          });
        } else {
          anyChanges = true;
          const classification = classifyGoldChange(oldPrice, newPrice);

          info(jobName, "classify", "success", {
            type: gold.key,
            isMajor: classification.isMajor,
            delta_vnd: classification.delta_vnd,
            delta_pct: classification.delta_pct,
          });

          if (classification.isMajor) {
            const changeRow = {
              subtype: gold.subtype,
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
              subtype: gold.subtype,
              old: oldPrice,
              new: newPrice,
              delta_vnd: classification.delta_vnd,
              delta_pct: classification.delta_pct,
            };

            await addDailyGoldLog(logEntry);
            groupedRows.push({
              subtype: gold.subtype,
              oldPrice,
              newPrice,
              delta_vnd: classification.delta_vnd,
              delta_pct: classification.delta_pct,
            });
            info(jobName, "email", "success", {
              type: gold.key,
              isMajor: false,
              loggedToDaily: true,
            });
          }
        }
      }

      if (majorChanges.length > 0) {
        const alertSent = await sendMajorGroupedAlert({
          assetType: "gold",
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
      await setLastGoldPrice(currentPrices.buy, currentPrices.sell);

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
  console.error("Gold job crashed:", err);
  process.exit(1);
});
