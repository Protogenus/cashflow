/**
 * lib/format.ts — display formatting (UI layer; the engine stays numeric).
 * Per DESIGN.md: round aggressively in headlines; cents only in ledger detail.
 */
import { parseISODate } from '../engine/dates';
import type { ISODate } from '../engine/types';
import { useSettingsStore } from '../store/settingsStore';

/**
 * The user's chosen display symbol (settings → currency). Display only:
 * amounts are never converted, only re-prefixed. Safe to call outside
 * React — reads the store directly.
 */
export function currencySymbol(): string {
  try {
    return useSettingsStore.getState().currencySymbol || '$';
  } catch {
    return '$';
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * $1,850 or $1,850.50 (symbol follows the currency setting); negatives
 * render as −$1,850 (ledger detail keeps cents).
 */
export function formatMoney(cents: number, symbol: string = currencySymbol()): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = dollars.toLocaleString('en-US');
  return rem === 0
    ? `${sign}${symbol}${grouped}`
    : `${sign}${symbol}${grouped}.${String(rem).padStart(2, '0')}`;
}

/** Aggressively rounded headline money: $41,800 (never $41,832.17). */
export function formatMoneyWhole(cents: number): string {
  return formatMoney(Math.round(cents / 100) * 100);
}

/** For text inputs: 140050 -> "1400.50". */
export function formatDollars(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

/**
 * Parse a dollars input ("1400", "1,400.50", "$1,400") into integer cents.
 * Returns null when the input is not a valid non-negative amount.
 */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** '2026-11-13' -> 'Nov 13'. */
export function formatDateShort(iso: ISODate): string {
  const { m, d } = parseISODate(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

/** '2026-11-13' -> 'November 13, 2026'. */
export function formatDateLong(iso: ISODate): string {
  const { y, m, d } = parseISODate(iso);
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}
