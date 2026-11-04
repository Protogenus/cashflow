/**
 * dates.ts — local wall-clock date utilities (pure, no framework imports).
 *
 * Financial events are DST-insensitive by construction: every date is a
 * calendar day in the user's local zone, parsed/constructed with the local
 * Date constructor (never `new Date("YYYY-MM-DD")`, which parses as UTC and
 * shifts across zones). All functions here are safe to run in a Web Worker.
 */
import type { ISODate } from './types';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

/** Parse "YYYY-MM-DD" into calendar components; throws on malformed input. */
export function parseISODate(s: ISODate): YMD {
  const m = ISO_RE.exec(s);
  if (!m) throw new Error(`Invalid ISODate: ${s}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
    throw new Error(`Invalid ISODate: ${s}`);
  }
  return { y, m: mo, d };
}

/** Local midnight for a calendar date (wall-clock, DST-safe). */
export function toLocalDate(ymd: YMD): Date {
  return new Date(ymd.y, ymd.m - 1, ymd.d);
}

/** Calendar components of a local Date. */
export function fromLocalDate(d: Date): YMD {
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

export function formatISODate(d: Date): ISODate {
  const { y, m, d: day } = fromLocalDate(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(day)}` as ISODate;
}

export function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

export function daysInMonth(y: number, m: number): number {
  // Day 0 of the next month = last day of this month (local; no time involved).
  return new Date(y, m, 0).getDate();
}

/** Add n calendar days in wall-clock time (immune to DST 23/25-hour days). */
export function addDays(d: Date, n: number): Date {
  const { y, m, d: day } = fromLocalDate(d);
  return toLocalDate({ y, m, d: day + n }); // Date constructor normalizes overflow
}

/**
 * Add n months to a calendar date, clamping the day to the target month's
 * length. Jan 31 + 1 month -> Feb 28 (or Feb 29 in leap years).
 */
export function addMonthsClamped(d: Date, n: number): Date {
  const { y, m, d: day } = fromLocalDate(d);
  const total = (m - 1) + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12 + 1;
  return toLocalDate({ y: ny, m: nm, d: Math.min(day, daysInMonth(ny, nm)) });
}

export function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * ISDA-style business-day adjustment, weekends only (no holiday calendar yet —
 * recorded in DECISIONS.md). 'preceding' moves Sat/Sun back to Friday;
 * 'following' moves them forward to Monday; 'none' leaves the date as-is.
 * Plain Following/Preceding: the shift may cross a month boundary (Modified
 * Following is deliberately NOT applied — see DECISIONS.md).
 */
export function shiftBusinessDay(d: Date, convention: 'preceding' | 'following' | 'none'): Date {
  if (convention === 'none') return d;
  const dow = d.getDay();
  if (dow === 6) return addDays(d, convention === 'following' ? 2 : -1); // Saturday
  if (dow === 0) return addDays(d, convention === 'following' ? 1 : -2); // Sunday
  return d;
}

/** Whole calendar days from a to b (b − a); both treated as local dates. */
export function daysBetween(a: Date, b: Date): number {
  const da = toLocalDate(fromLocalDate(a)).getTime();
  const db = toLocalDate(fromLocalDate(b)).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** Compare two local dates: −1 | 0 | 1. */
export function compareDates(a: Date, b: Date): number {
  const da = formatISODate(a);
  const db = formatISODate(b);
  return da < db ? -1 : da > db ? 1 : 0;
}

/** Today's date as a local ISODate. */
export function todayISO(): ISODate {
  return formatISODate(new Date());
}

/** True if the ISODate falls on Sat/Sun. */
export function isWeekendISO(s: ISODate): boolean {
  return isWeekend(toLocalDate(parseISODate(s)));
}
