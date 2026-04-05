/**
 * State management for price monitoring
 * Handles Redis interactions for last prices, daily logs, locks, and health status
 */

import { redis } from "../redis.js";
import { PriceSnapshot, DailyChangeLog, HealthStatus } from "../types.js";
import { getCurrentISO8601, getVietnamDateString } from "../utils/datetime.js";

// ============= Last Known Prices =============

export async function getLastGasPrice(): Promise<{ ron95: PriceSnapshot | null; e5: PriceSnapshot | null }> {
  const ron95Str = await redis.get("gas:last:ron95");
  const e5Str = await redis.get("gas:last:e5");

  return {
    ron95: ron95Str ? (JSON.parse(ron95Str) as PriceSnapshot) : null,
    e5: e5Str ? (JSON.parse(e5Str) as PriceSnapshot) : null,
  };
}

export async function setLastGasPrice(ron95: number, e5: number): Promise<void> {
  const timestamp = getCurrentISO8601();
  await redis.setJSON("gas:last:ron95", { price: ron95, timestamp });
  await redis.setJSON("gas:last:e5", { price: e5, timestamp });
}

export async function getLastGoldPrice(): Promise<{ buy: PriceSnapshot | null; sell: PriceSnapshot | null }> {
  const buyStr = await redis.get("gold:last:buy");
  const sellStr = await redis.get("gold:last:sell");

  return {
    buy: buyStr ? (JSON.parse(buyStr) as PriceSnapshot) : null,
    sell: sellStr ? (JSON.parse(sellStr) as PriceSnapshot) : null,
  };
}

export async function setLastGoldPrice(buy: number, sell: number): Promise<void> {
  const timestamp = getCurrentISO8601();
  await redis.setJSON("gold:last:buy", { price: buy, timestamp });
  await redis.setJSON("gold:last:sell", { price: sell, timestamp });
}

// ============= Daily Logs =============

export async function getDailyGasLog(date?: string): Promise<DailyChangeLog[]> {
  const dateStr = date ?? getVietnamDateString();
  const key = `gas:daily:${dateStr}`;
  const str = await redis.get(key);
  if (!str) return [];
  try {
    return JSON.parse(str) as DailyChangeLog[];
  } catch {
    return [];
  }
}

export async function addDailyGasLog(change: DailyChangeLog, date?: string): Promise<void> {
  const dateStr = date ?? getVietnamDateString();
  const key = `gas:daily:${dateStr}`;
  const logs = await getDailyGasLog(dateStr);
  logs.push(change);
  await redis.setJSON(key, logs);
}

export async function clearDailyGasLog(date?: string): Promise<void> {
  const dateStr = date ?? getVietnamDateString();
  const key = `gas:daily:${dateStr}`;
  await redis.del(key);
}

export async function getDailyGoldLog(date?: string): Promise<DailyChangeLog[]> {
  const dateStr = date ?? getVietnamDateString();
  const key = `gold:daily:${dateStr}`;
  const str = await redis.get(key);
  if (!str) return [];
  try {
    return JSON.parse(str) as DailyChangeLog[];
  } catch {
    return [];
  }
}

export async function addDailyGoldLog(change: DailyChangeLog, date?: string): Promise<void> {
  const dateStr = date ?? getVietnamDateString();
  const key = `gold:daily:${dateStr}`;
  const logs = await getDailyGoldLog(dateStr);
  logs.push(change);
  await redis.setJSON(key, logs);
}

export async function clearDailyGoldLog(date?: string): Promise<void> {
  const dateStr = date ?? getVietnamDateString();
  const key = `gold:daily:${dateStr}`;
  await redis.del(key);
}

// ============= Distributed Locks =============

/**
 * Acquire a lock with 5-minute expiry
 * Returns true if lock acquired, false if already held
 */
export async function acquireLock(jobName: "gas" | "gold" | "summary"): Promise<boolean> {
  const key = `lock:${jobName}`;
  const lockId = getCurrentISO8601();
  return await redis.setNX(key, lockId, 300); // 5 minutes
}

export async function acquireLockToken(jobName: "gas" | "gold" | "summary"): Promise<string | null> {
  const key = `lock:${jobName}`;
  const lockId = `${getCurrentISO8601()}-${Math.random().toString(36).slice(2)}`;
  const acquired = await redis.setNX(key, lockId, 300); // 5 minutes
  return acquired ? lockId : null;
}

export async function releaseLock(jobName: "gas" | "gold" | "summary", lockId: string): Promise<void> {
  const key = `lock:${jobName}`;

  // Delete lock only if caller still owns it.
  const releaseScript = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  await redis.eval(releaseScript, 1, key, lockId);
}

// ============= Health Status =============

export async function recordHealthSuccess(jobName: "gas" | "gold" | "summary"): Promise<void> {
  const key = `health:success:${jobName}`;
  const timestamp = getCurrentISO8601();
  await redis.set(key, timestamp);
}

export async function recordHealthError(jobName: "gas" | "gold" | "summary", error: string): Promise<void> {
  const key = `health:error:${jobName}`;
  const timestamp = getCurrentISO8601();
  const errorData = JSON.stringify({ timestamp, message: error });
  await redis.set(key, errorData);
}

export async function getHealthStatus(jobName: "gas" | "gold" | "summary"): Promise<HealthStatus | null> {
  const successKey = `health:success:${jobName}`;
  const errorKey = `health:error:${jobName}`;

  const successStr = await redis.get(successKey);
  const errorStr = await redis.get(errorKey);

  if (!successStr) return null;

  const status: HealthStatus = {
    lastSuccessTimestamp: successStr,
  };

  if (errorStr) {
    try {
      const errorData = JSON.parse(errorStr) as { timestamp: string; message: string };
      status.lastErrorTimestamp = errorData.timestamp;
      status.lastErrorMessage = errorData.message;
    } catch {
      // Ignore parse errors
    }
  }

  return status;
}
