import { describe, expect, it } from 'vitest';
import { findDrivers } from './explain';
import type { LedgerDay } from './types';

function day(date: string, balance: number, events: LedgerDay['events'] = []): LedgerDay {
  return { date, balanceCents: balance, events };
}

describe('findDrivers', () => {
  it('ranks outflows in the 7-day window before the pinch, largest first', () => {
    const ledger: LedgerDay[] = [
      day('2026-11-01', 300000),
      day('2026-11-02', 300000, [
        { nodeId: 'rent', name: 'Rent', amountCents: -140000, kind: 'expense' },
      ]),
      day('2026-11-03', 160000, [
        { nodeId: 'car', name: 'Car payment', amountCents: -42000, kind: 'expense' },
        { nodeId: 'elec', name: 'Electric', amountCents: -14000, kind: 'expense' },
      ]),
      day('2026-11-04', 104000, [
        { nodeId: 'pay', name: 'Paycheck', amountCents: 185000, kind: 'income' },
      ]),
    ];
    const drivers = findDrivers(ledger, '2026-11-03', 7, 4);
    expect(drivers.map((d) => d.name)).toEqual(['Rent', 'Car payment', 'Electric']);
    expect(drivers[0].contributionCents).toBe(-140000);
    // Income is not a driver of a low point.
    expect(drivers.some((d) => d.nodeId === 'pay')).toBe(false);
  });

  it('aggregates repeated outflows from the same node', () => {
    const ledger: LedgerDay[] = [
      day('2026-11-01', 200000, [
        { nodeId: 'sub', name: 'Subscriptions', amountCents: -1500, kind: 'expense' },
      ]),
      day('2026-11-02', 198500, [
        { nodeId: 'sub', name: 'Subscriptions', amountCents: -1500, kind: 'expense' },
      ]),
      day('2026-11-03', 197000),
    ];
    const drivers = findDrivers(ledger, '2026-11-03', 7, 4);
    expect(drivers).toHaveLength(1);
    expect(drivers[0].contributionCents).toBe(-3000);
  });

  it('excludes events outside the window', () => {
    const ledger: LedgerDay[] = [
      day('2026-10-20', 500000, [
        { nodeId: 'old', name: 'Old bill', amountCents: -99999, kind: 'expense' },
      ]),
      day('2026-11-03', 100000, [
        { nodeId: 'new', name: 'Recent bill', amountCents: -1000, kind: 'expense' },
      ]),
    ];
    const drivers = findDrivers(ledger, '2026-11-03', 7, 4);
    expect(drivers.map((d) => d.nodeId)).toEqual(['new']);
  });

  it('returns an empty list when the pinch has no preceding outflows', () => {
    const ledger = [day('2026-11-03', 250000)];
    expect(findDrivers(ledger, '2026-11-03')).toEqual([]);
  });

  it('caps at topN', () => {
    const ledger = [
      day('2026-11-03', 1000, [
        { nodeId: 'a', name: 'A', amountCents: -1, kind: 'expense' },
        { nodeId: 'b', name: 'B', amountCents: -2, kind: 'expense' },
        { nodeId: 'c', name: 'C', amountCents: -3, kind: 'expense' },
      ]),
    ];
    expect(findDrivers(ledger, '2026-11-03', 7, 2)).toHaveLength(2);
  });
});
