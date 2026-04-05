/**
 * Validation utilities for price data
 */

/**
 * Validate gasoline price is in sane range
 * Expected range: 15,000 - 100,000 VND per liter
 */
export function isValidGasPrice(price: number): boolean {
  return typeof price === "number" && price >= 15000 && price <= 100000 && !isNaN(price);
}

/**
 * Validate gold price is in sane range
 * Expected range: 1,000,000 - 30,000,000 VND
 */
export function isValidGoldPrice(price: number): boolean {
  return typeof price === "number" && price >= 1000000 && price <= 30000000 && !isNaN(price);
}

/**
 * Check if value is numeric and non-null
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value) && isFinite(value);
}

/**
 * Parse numeric string to number safely
 */
export function parsePrice(str: string): number | null {
  // Remove common formatting: spaces, commas, etc.
  const cleaned = str.trim().replace(/[,.\s]/g, "");
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) {
    return null;
  }
  return num;
}

/**
 * Verify timestamp is valid ISO8601
 */
export function isValidISO8601(timestamp: string): boolean {
  try {
    const date = new Date(timestamp);
    return date instanceof Date && !isNaN(date.getTime());
  } catch {
    return false;
  }
}
