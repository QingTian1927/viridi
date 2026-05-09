/**
 * Gasoline price parser for webgia.com Petrolimex prices
 * Extracts RON95-III and E5 RON92-II prices from https://webgia.com/gia-xang-dau/petrolimex/
 */

import { load } from "cheerio";
import { GasPrice, ParseResult } from "../types.js";
import { isValidGasPrice, parsePrice } from "../utils/validators.js";

const WEBGIA_URL = "https://webgia.com/gia-xang-dau/petrolimex/";
const WEBGIA_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
};

/**
 * Fetch gasoline prices from webgia.com
 */
export async function fetchGasolinePrices(): Promise<ParseResult<GasPrice>> {
  try {
    const response = await fetch(WEBGIA_URL, { headers: WEBGIA_HEADERS });
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    return parseGasolineHTML(html);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Fetch failed: ${errorMsg}`,
    };
  }
}

/**
 * Parse gasoline prices from HTML
 * Looks for RON95-III and E5 RON92-II in the Petrolimex price table
 *
 * NOTE: Selectors may need adjustment if webgia changes their layout
 * Look for rows containing these product names and extract the Vùng 1 price
 */
export function parseGasolineHTML(html: string): ParseResult<GasPrice> {
  try {
    const $ = load(html);

    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // Strategy: Find rows in the price table that contain RON95 and E5 identifiers
    // webgia uses a table with the product name in the first column and region prices after it

    let ron95Price: number | null = null;
    let e5Price: number | null = null;

    const rows = $(".table-responsive table tbody tr");

    rows.each((_index: number, row: any) => {
      const cells = $(row).find("th, td");
      const rowText = normalize($(row).text());

      if (cells.length < 3) {
        return;
      }

      const region1Price = parsePrice(cells.eq(1).text().trim());

      // Look for RON 95
      if (
        rowText.includes("xang") &&
        rowText.includes("ron") &&
        rowText.includes("95") &&
        (rowText.includes("iii") || rowText.includes("3")) &&
        !rowText.includes("e10")
      ) {
        if (region1Price && isValidGasPrice(region1Price)) {
          ron95Price = region1Price;
        }
      }

      // Look for E5 RON 92
      if (
        rowText.includes("xang") &&
        rowText.includes("e5") &&
        rowText.includes("92") &&
        (rowText.includes("ii") || rowText.includes("2"))
      ) {
        if (region1Price && isValidGasPrice(region1Price)) {
          e5Price = region1Price;
        }
      }
    });

    // Validation
    if (!ron95Price || !e5Price) {
      return {
        success: false,
        error: `Missing prices: RON95=${ron95Price}, E5=${e5Price}. Layout may have changed.`,
      };
    }

    return {
      success: true,
      data: {
        ron95: ron95Price,
        e5: e5Price,
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
export function parseGasolineRegex(html: string): ParseResult<GasPrice> {
  try {
    // Pattern: Look for RON 95 and numeric price (10,000-100,000 range)
    // Adjust pattern based on actual format observed
    const ron95Pattern = /Ron\s*95[^0-9]*([0-9]{2,3},?[0-9]{3})/i;
    const e5Pattern = /E5[^0-9]*92[^0-9]*([0-9]{2,3},?[0-9]{3})/i;

    const ron95Match = html.match(ron95Pattern);
    const e5Match = html.match(e5Pattern);

    if (!ron95Match || !e5Match) {
      return {
        success: false,
        error: "Could not find price patterns in HTML",
      };
    }

    const ron95 = parsePrice(ron95Match[1]);
    const e5 = parsePrice(e5Match[1]);

    if (!ron95 || !e5 || !isValidGasPrice(ron95) || !isValidGasPrice(e5)) {
      return {
        success: false,
        error: `Invalid prices extracted: RON95=${ron95}, E5=${e5}`,
      };
    }

    return {
      success: true,
      data: {
        ron95,
        e5,
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
