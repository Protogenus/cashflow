/**
 * explain.ts — driver analysis shared by forecast/optimizer/Monte Carlo
 * (pure, no framework imports).
 *
 * The explanation is a first-class engine output, not a UI afterthought:
 * for a low point on the balance walk, findDrivers ranks the outflows in the
 * preceding window by amount so the UI can say "rent + car payment +
 * utilities, Mar 3–5, drove the $212 minimum."
 */
import { addDays, formatISODate, parseISODate, toLocalDate } from './dates';
import type { Driver, ISODate, LedgerDay } from './types';

/**
 * Rank the outflow events in the window [pinchDate − windowDays, pinchDate]
 * by size, returning the top N as drivers. Window is inclusive of the pinch
 * date itself (same-day bills drove it too). Contributions are negative
 * (money out). Returns at most topN drivers; fewer when the window has
 * fewer outflows (e.g. the pinch is the starting balance on day 0).
 */
export function findDrivers(
  ledger: LedgerDay[],
  pinchDate: ISODate,
  windowDays = 7,
  topN = 4,
): Driver[] {
  const pinch = toLocalDate(parseISODate(pinchDate));
  const windowStart = formatISODate(addDays(pinch, -windowDays));

  const totals = new Map<string, Driver>();
  for (const day of ledger) {
    if (day.date < windowStart || day.date > pinchDate) continue;
    for (const ev of day.events) {
      if (ev.amountCents >= 0) continue; // only outflows drive a low point
      const existing = totals.get(ev.nodeId);
      if (existing) {
        existing.contributionCents += ev.amountCents;
      } else {
        totals.set(ev.nodeId, {
          nodeId: ev.nodeId,
          name: ev.name,
          contributionCents: ev.amountCents,
        });
      }
    }
  }

  return [...totals.values()]
    .sort((a, b) => a.contributionCents - b.contributionCents) // most negative first
    .slice(0, topN);
}
