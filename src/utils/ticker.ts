/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function normalizeYahooTicker(rawTicker: string): string {
  const ticker = rawTicker.trim();
  if (!ticker) {
    return ticker;
  }

  const existingHongKongTicker = ticker.match(/\b\d{1,5}\.HK\b/i);
  if (existingHongKongTicker) {
    const [code] = existingHongKongTicker[0].split(".");
    return `${code.padStart(4, "0")}.HK`;
  }

  const hkexMatch = ticker.match(/\bHKEX\b[^0-9]*(\d{1,5})/i);
  if (hkexMatch) {
    return `${hkexMatch[1].padStart(4, "0")}.HK`;
  }

  if (/^\d{1,5}$/.test(ticker)) {
    return `${ticker.padStart(4, "0")}.HK`;
  }

  return ticker.toUpperCase();
}

export function isLikelyResolvedYahooTicker(ticker: string): boolean {
  const normalized = ticker.trim().toUpperCase();
  return Boolean(
    normalized.match(/^\^[A-Z0-9]+$/) ||
    normalized.match(/^[A-Z]{1,6}([.-][A-Z])?$/) ||
    normalized.match(/^\d{4,6}\.(HK|SS|SZ|T|KS|TW)$/)
  );
}
