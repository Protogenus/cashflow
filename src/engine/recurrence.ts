/**
 * recurrence.ts — anchor-based recurrence expansion (pure, no framework imports).
 *
 * Every series is expanded from an IMMUTABLE anchor/rule — never by chaining
 * "+1 month" off the last occurrence (chaining permanently degrades the
 * 31st→28th clamp down the chain; see RESEARCH.md §3). Monthly series with a
 * day-of-month beyond the month's length clamp to the last day (DECISIONS.md:
 * Jan 31 → Feb 28; the series never skips a month).
 */
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  daysInMonth,
  formatISODate,
  parseISODate,
  shiftBusinessDay,
  toLocalDate,
} from './dates';
import type { BusinessDay, Cents, ISODate, NodeId, Recurrence } from './types';

export interface OccurrenceInput {
  nodeId: NodeId;
  name: string;
  kind: 'income' | 'expense';
  /** Base amount; an exception may override it per occurrence. */
  amountCents: Cents;
  recurrence: Recurrence;
}

export interface Occurrence {
  date: ISODate;
  amountCents: Cents;
  nodeId: NodeId;
  name: string;
  kind: 'income' | 'expense';
}

/**
 * Expand a recurrence into concrete occurrences within
 * [startISO, startISO + horizonDays). Returned sorted by date ascending.
 */
export function expandRecurrence(
  input: OccurrenceInput,
  startISO: ISODate,
  horizonDays: number,
): Occurrence[] {
  const { recurrence } = input;
  const start = toLocalDate(parseISODate(startISO));
  const endExclusive = addDays(start, horizonDays);
  const endDate = recurrence.endDate ? toLocalDate(parseISODate(recurrence.endDate)) : null;

  // 1. Generate raw (unshifted, exception-free) dates from the anchor/rule.
  const rawDates: Date[] = [];
  const freq = recurrence.frequency;
  switch (freq.kind) {
    case 'weekly':
    case 'biweekly': {
      const interval = freq.kind === 'weekly' ? 7 : 14;
      const anchor = toLocalDate(parseISODate(freq.anchor));
      // First k with anchor + k*interval >= start (k may be negative).
      let k = Math.ceil(daysBetween(anchor, start) / interval);
      for (let d = addDays(anchor, k * interval); d < endExclusive; d = addDays(d, interval), k++) {
        rawDates.push(d);
      }
      break;
    }
    case 'semimonthly': {
      // Walk month by month; clamp each requested day to the month's length.
      const cursor = toLocalDate({ y: start.getFullYear(), m: start.getMonth() + 1, d: 1 });
      for (let m = cursor; m < endExclusive; m = addMonthsClamped(m, 1)) {
        const dim = daysInMonth(m.getFullYear(), m.getMonth() + 1);
        for (const day of freq.days) {
          rawDates.push(
            toLocalDate({
              y: m.getFullYear(),
              m: m.getMonth() + 1,
              d: Math.min(day, dim),
            }),
          );
        }
      }
      break;
    }
    case 'monthly': {
      const cursor = toLocalDate({ y: start.getFullYear(), m: start.getMonth() + 1, d: 1 });
      for (let m = cursor; m < endExclusive; m = addMonthsClamped(m, 1)) {
        const dim = daysInMonth(m.getFullYear(), m.getMonth() + 1);
        const day = freq.dayOfMonth === 'last' ? dim : Math.min(freq.dayOfMonth, dim);
        rawDates.push(toLocalDate({ y: m.getFullYear(), m: m.getMonth() + 1, d: day }));
      }
      break;
    }
    case 'once': {
      const d = toLocalDate(parseISODate(freq.date));
      if (d >= start && d < endExclusive) rawDates.push(d);
      break;
    }
  }

  // 2. Apply business-day adjustment, exceptions, and the end date; filter range.
  const out: Occurrence[] = [];
  for (const raw of rawDates) {
    const originalISO = formatISODate(raw);
    const exc = recurrence.exceptions[originalISO];
    if (exc?.skipped) continue;

    let date: Date;
    let amountCents = input.amountCents;
    if (exc?.newDate) {
      // A user-moved occurrence keeps the exact date they chose (no re-shift).
      date = toLocalDate(parseISODate(exc.newDate));
    } else {
      date = shiftBusinessDay(raw, recurrence.businessDay);
    }
    if (exc?.newAmountCents !== undefined) amountCents = exc.newAmountCents;

    const iso = formatISODate(date);
    if (iso < startISO) continue;
    if (date >= endExclusive) continue;
    if (endDate && date > endDate) continue;

    out.push({ date: iso, amountCents, nodeId: input.nodeId, name: input.name, kind: input.kind });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/**
 * First occurrence on or after fromISO, or null if none within 2 years
 * (bounded so weekly/biweekly anchors in the far past terminate).
 */
export function nextOccurrenceDate(recurrence: Recurrence, fromISO: ISODate): ISODate | null {
  const occ = expandRecurrence(
    { nodeId: '', name: '', kind: 'income', amountCents: 0, recurrence },
    fromISO,
    731,
  );
  return occ.length > 0 ? occ[0].date : null;
}

/** Human label, e.g. "biweekly · 26/yr". Counts are stated per RESEARCH.md §3. */
export function describeFrequency(recurrence: Recurrence): string {
  const f = recurrence.frequency;
  switch (f.kind) {
    case 'weekly':
      return 'weekly · 52/yr';
    case 'biweekly':
      return 'biweekly · 26/yr';
    case 'semimonthly':
      return `semi-monthly (${ordinal(f.days[0])} & ${ordinal(f.days[1])}) · 24/yr`;
    case 'monthly':
      return f.dayOfMonth === 'last' ? 'monthly · last day · 12/yr' : `monthly · ${ordinal(f.dayOfMonth)} · 12/yr`;
    case 'once':
      return 'one-time';
  }
}

/** Short per-node default for businessDay: income → preceding, everything else → following. */
export function defaultBusinessDay(nodeKind: 'income' | 'expense' | 'variable'): BusinessDay {
  return nodeKind === 'income' ? 'preceding' : 'following';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
