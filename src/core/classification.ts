/**
 * Price change classification logic
 * Determines if a price change is major or minor based on thresholds
 */

import { ClassificationResult, PriceSnapshot } from "../types.js";
import { config } from "../config.js";

/**
 * Classify gasoline price change
 * Major if: delta >= max(1%, 1000 VND/L)
 */
export function classifyGasChange(oldPrice: number, newPrice: number): ClassificationResult {
  const delta_vnd = newPrice - oldPrice;
  const delta_pct = (delta_vnd / oldPrice) * 100;
  const absDelta_vnd = Math.abs(delta_vnd);
  const absDelta_pct = Math.abs(delta_pct);

  const threshold_pct = config.thresholds.gas.majorPct;
  const threshold_vnd = config.thresholds.gas.majorVnd;

  const isMajor = absDelta_pct >= threshold_pct || absDelta_vnd >= threshold_vnd;

  return {
    isMajor,
    delta_vnd,
    delta_pct,
  };
}

/**
 * Classify gold price change
 * Major if: delta >= max(3%, 300,000 VND/chỉ)
 */
export function classifyGoldChange(oldPrice: number, newPrice: number): ClassificationResult {
  const delta_vnd = newPrice - oldPrice;
  const delta_pct = (delta_vnd / oldPrice) * 100;
  const absDelta_vnd = Math.abs(delta_vnd);
  const absDelta_pct = Math.abs(delta_pct);

  const threshold_pct = config.thresholds.gold.majorPct;
  const threshold_vnd = config.thresholds.gold.majorVnd;

  const isMajor = absDelta_pct >= threshold_pct || absDelta_vnd >= threshold_vnd;

  return {
    isMajor,
    delta_vnd,
    delta_pct,
  };
}

/**
 * Format change with sign for display (+/-1,234)
 */
export function formatPriceChange(delta: number, includeSign = true): string {
  const sign = delta >= 0 ? "+" : "";
  return `${includeSign ? sign : ""}${delta.toLocaleString()}`;
}

/**
 * Format percentage change (+/-1.23%)
 */
export function formatPercentChange(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}%`;
}
