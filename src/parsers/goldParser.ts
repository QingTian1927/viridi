/**
 * Gold price parser for PhuQuy Group Vietnam
 * Extracts SJC gold buying and selling prices from https://phuquygroup.vn/
 */

import { load } from "cheerio";
import { GoldPrice, ParseResult } from "../types.js";
import { isValidGoldPrice, parsePrice } from "../utils/validators.js";

const PHUQUY_URL = "https://phuquygroup.vn/";

/**
 * Fetch gold prices from PhuQuy Group
 */
export async function fetchGoldPrices(): Promise<ParseResult<GoldPrice>> {
  try {
    const response = await fetch(PHUQUY_URL);
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    return parseGoldHTML(html);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Fetch failed: ${errorMsg}`,
    };
  }
}

/**
 * Parse gold prices from HTML
 * Looks for SJC gold buying and selling prices
 *
 * NOTE: Selectors may need adjustment if PhuQuy changes their layout
 * SJC gold is typically shown with buy/sell price pairs
 */
export function parseGoldHTML(html: string): ParseResult<GoldPrice> {
  try {
    const $ = load(html);

    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    let buyPrice: number | null = null;
    let sellPrice: number | null = null;

    // Prefer the dedicated price table container.
    const rows = $("#priceList table tbody tr");

    rows.each((_index: number, row: any) => {
      const cells = $(row).find("td");
      if (cells.length < 3) {
        return;
      }

      const itemName = normalize(cells.eq(0).text());

      // Look for SJC gold row specifically.
      if (itemName.includes("vang mieng") && itemName.includes("sjc")) {
        const buyStr = cells.eq(1).text().trim();
        const sellStr = cells.eq(2).text().trim();

        const parsedBuy = parsePrice(buyStr);
        if (parsedBuy && isValidGoldPrice(parsedBuy)) {
          buyPrice = parsedBuy;
        }

        const parsedSell = parsePrice(sellStr);
        if (parsedSell && isValidGoldPrice(parsedSell)) {
          sellPrice = parsedSell;
        }
      }
    });

    // Validation
    if (!buyPrice || !sellPrice) {
      return {
        success: false,
        error: `Missing prices: Buy=${buyPrice}, Sell=${sellPrice}. Layout may have changed.`,
      };
    }

    return {
      success: true,
      data: {
        buy: buyPrice,
        sell: sellPrice,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Parse error: ${errorMsg}`,
    };
  }
}

/**
 * Fallback parser using regex patterns
 * Useful if DOM-based parsing fails due to layout changes
 */
export function parseGoldRegex(html: string): ParseResult<GoldPrice> {
  try {
    // Pattern: Look for SJC gold prices (6 digits, 400k-900k range)
    // Format typically like: "SJC ... 750000 ... 760000"
    const sjcSection = html.match(/SJC[^0-9]*([0-9]{6})[^0-9]*([0-9]{6})/i);

    if (!sjcSection) {
      return {
        success: false,
        error: "Could not find SJC gold prices in HTML",
      };
    }

    const buy = parsePrice(sjcSection[1]);
    const sell = parsePrice(sjcSection[2]);

    if (!buy || !sell || !isValidGoldPrice(buy) || !isValidGoldPrice(sell)) {
      return {
        success: false,
        error: `Invalid prices extracted: Buy=${buy}, Sell=${sell}`,
      };
    }

    return {
      success: true,
      data: {
        buy,
        sell,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Regex parse error: ${errorMsg}`,
    };
  }
}
