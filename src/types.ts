/**
 * Type definitions for Viridi price monitoring system
 */

export interface PriceSnapshot {
  price: number;
  timestamp: string; // ISO8601
}

export interface DailyChangeLog {
  ts: string; // ISO8601 timestamp
  subtype: string; // e.g., "Xang RON 95-III", "Buy"
  old: number;
  new: number;
  delta_vnd: number;
  delta_pct: number;
}

export interface ClassificationResult {
  isMajor: boolean;
  delta_vnd: number;
  delta_pct: number;
}

export interface GasPrice {
  ron95: number;
  e5: number;
}

export interface GoldPrice {
  buy: number;
  sell: number;
}

export interface JobLog {
  timestamp: string;
  job: "gas" | "gold" | "summary";
  action: "fetch" | "parse" | "classify" | "email" | "error";
  status: "success" | "partial" | "fail";
  details?: Record<string, unknown>;
  error?: string;
}

export interface AlertEmailData {
  assetType: "gasoline" | "gold";
  assetSubtype?: string; // e.g., "RON 95", "Buy", "Sell"
  oldPrice: number;
  newPrice: number;
  delta_vnd: number;
  delta_pct: number;
  timestamp: string;
}

export interface GroupedAlertChange {
  subtype: string;
  oldPrice: number;
  newPrice: number;
  delta_vnd: number;
  delta_pct: number;
}

export interface GroupedAlertEmailData {
  assetType: "gasoline" | "gold";
  timestamp: string;
  changes: GroupedAlertChange[];
}

export interface SubtypeSummary {
  subtype: string;
  changes: DailyChangeLog[];
  netChange: number;
  netChangePct: number;
  high?: number;
  low?: number;
}

export interface SummaryEmailData {
  gasoline?: {
    groups: SubtypeSummary[];
  };
  gold?: {
    groups: SubtypeSummary[];
  };
  date: string; // YYYY-MM-DD
}

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface HealthStatus {
  lastSuccessTimestamp: string;
  lastErrorTimestamp?: string;
  lastErrorMessage?: string;
}
