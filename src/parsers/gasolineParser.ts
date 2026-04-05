/**
 * Gasoline price parser for PVOil Vietnam
 * Extracts RON95-III and E5 RON92-II prices from https://www.pvoil.com.vn/tin-gia-xang-dau
 */

import { load } from "cheerio";
import { GasPrice, ParseResult } from "../types.js";
import { isValidGasPrice, parsePrice } from "../utils/validators.js";

const PVOIL_URL = "https://www.pvoil.com.vn/tin-gia-xang-dau";

/**
 * Fetch gasoline prices from PVOil
 */
export async function fetchGasolinePrices(): Promise<ParseResult<GasPrice>> {
  try {
    const response = await fetch(PVOIL_URL);
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
 * Looks for RON95-III and E5 RON92-II in table rows
 *
 * NOTE: Selectors may need adjustment if PVOil changes their layout
 * Look for rows containing these product names and extract price values
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

    // Strategy: Find rows in price table that contain RON95 and E5 identifiers
    // PVOil typically uses a table with product name in one column and price in another

    let ron95Price: number | null = null;
    let e5Price: number | null = null;

    // Prefer the known price table container used on PVOIL price page.
    const rows = $(".oilpricescontainer table tbody tr");

    rows.each((_index: number, row: any) => {
      const cells = $(row).find("td");
      const rowText = normalize($(row).text());

      if (cells.length < 3) {
        return;
      }

      // Current table shape: [index, name(colspan), price, change]
      const explicitPrice = parsePrice(cells.eq(2).text().trim());

      // Fallback: find the first price-like cell that contains the currency marker.
      let fallbackPrice: number | null = null;
      cells.each((i: number, cell: any) => {
        if (i < 2) return;
        const cellText = $(cell).text().trim();
        if (!cellText.includes("đ")) return;
        const parsed = parsePrice(cellText);
        if (parsed !== null && parsed >= 10000) {
          fallbackPrice = parsed;
        }
      });

      const candidatePrice = explicitPrice ?? fallbackPrice;

      // Look for RON 95
      if (
        rowText.includes("xang") &&
        rowText.includes("ron") &&
        rowText.includes("95") &&
        (rowText.includes("iii") || rowText.includes("3")) &&
        !rowText.includes("e10")
      ) {
        const parsed = candidatePrice;
        if (parsed && isValidGasPrice(parsed)) {
          ron95Price = parsed;
        }
      }

      // Look for E5 RON 92
      if (
        rowText.includes("xang") &&
        rowText.includes("e5") &&
        rowText.includes("92") &&
        (rowText.includes("ii") || rowText.includes("2"))
      ) {
        const parsed = candidatePrice;
        if (parsed && isValidGasPrice(parsed)) {
          e5Price = parsed;
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
