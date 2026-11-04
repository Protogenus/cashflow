import { describe, expect, it } from 'vitest';
import { forecast, validateGraph, DEFAULT_ASSUMPTIONS } from '../engine';
import { todayISO } from '../engine';
import {
  buildOnboardingGraph,
  nextQuarterlyDueDates,
  STARTER_TEMPLATES,
} from './starterTemplates';

describe('starter templates', () => {
  for (const t of STARTER_TEMPLATES) {
    describe(t.title, () => {
      it('validates with no errors and no warnings', () => {
        const g = t.build();
        const v = validateGraph(g);
        expect(v.errors).toEqual([]);
        expect(v.warnings).toEqual([]);
      });

      it('produces a real deterministic forecast', () => {
        const g = t.build();
        const res = forecast(g, DEFAULT_ASSUMPTIONS);
        expect(res.ledger).toHaveLength(DEFAULT_ASSUMPTIONS.horizonDays);
        // Every template has money movement: at least one income and one outflow.
        const kinds = new Set(res.ledger.flatMap((d) => d.events.map((e) => e.kind)));
        expect(kinds.has('income')).toBe(true);
        expect(kinds.has('expense')).toBe(true);
      });

      it('has exactly one starting balance and valid splits', () => {
        const g = t.build();
        expect(g.nodes.filter((n) => n.type === 'startingBalance')).toHaveLength(1);
        for (const n of g.nodes) {
          if (n.type === 'percentageSplit') {
            const sum = n.outputs.reduce((s, o) => s + o.percent, 0);
            expect(sum).toBe(100);
          }
        }
      });
    });
  }

  it('renter: paycheck split routes to the emergency-fund goal', () => {
    const g = STARTER_TEMPLATES.find((t) => t.id === 'renter')!.build();
    const res = forecast(g, DEFAULT_ASSUMPTIONS);
    const goal = res.goals.find((x) => x.name === 'Emergency fund');
    expect(goal).toBeDefined();
    expect(goal!.savedCents).toBeGreaterThan(0);
  });

  it('couple: two incomes, debt extra payments, and goal savings all move', () => {
    const g = STARTER_TEMPLATES.find((t) => t.id === 'couple')!.build();
    expect(g.nodes.filter((n) => n.type === 'income')).toHaveLength(2);
    expect(g.nodes.filter((n) => n.type === 'debt')).toHaveLength(1);
    const res = forecast(g, DEFAULT_ASSUMPTIONS);
    const debt = res.debts.find((x) => x.name === 'Car loan');
    expect(debt).toBeDefined();
    expect(debt!.extraPaidCents).toBeGreaterThan(0);
    const goal = res.goals.find((x) => x.name === 'Emergency fund');
    expect(goal!.savedCents).toBeGreaterThan(0);
  });

  it('freelancer: variable income emits inflows and routes through the split', () => {
    const g = STARTER_TEMPLATES.find((t) => t.id === 'freelancer')!.build();
    const res = forecast(g, DEFAULT_ASSUMPTIONS);
    const clientEvents = res.ledger.flatMap((d) => d.events).filter((e) => e.name === 'Client income');
    expect(clientEvents.length).toBeGreaterThan(0);
    // Income direction: positive amounts, never negative.
    for (const e of clientEvents) expect(e.amountCents).toBeGreaterThan(0);
    const taxGoal = res.goals.find((x) => x.name === 'Tax reserve');
    expect(taxGoal!.savedCents).toBeGreaterThan(0);
    // The quarterly tax bills use the real upcoming due dates; at least the
    // first one lands inside the 90-day horizon.
    const taxBills = res.ledger.flatMap((d) => d.events).filter((e) => e.name.startsWith('Estimated tax'));
    expect(taxBills.length).toBeGreaterThanOrEqual(1);
    const taxNodes = g.nodes.filter((n) => n.type === 'expense' && n.name.startsWith('Estimated tax'));
    const dueDates = taxNodes
      .map((n) => (n.type === 'expense' && n.recurrence.frequency.kind === 'once' ? n.recurrence.frequency.date : null))
      .filter(Boolean)
      .sort();
    expect(dueDates).toHaveLength(2);
    expect(dueDates[0]! > todayISO()).toBe(true);
  });
});

describe('buildOnboardingGraph', () => {
  const answers = {
    balanceCents: 185000,
    payAmountCents: 192000,
    payDate: '2026-11-06' as const,
    payFreq: 'biweekly' as const,
    billName: 'Rent',
    billAmountCents: 140000,
    billDayOfMonth: 1,
  };

  it('builds a valid graph from the three answers', () => {
    const g = buildOnboardingGraph(answers);
    const v = validateGraph(g);
    expect(v.errors).toEqual([]);
    expect(g.nodes).toHaveLength(3);
    expect(g.nodes.filter((n) => n.type === 'startingBalance')).toHaveLength(1);
    expect(g.nodes.filter((n) => n.type === 'income')).toHaveLength(1);
    expect(g.nodes.filter((n) => n.type === 'expense')).toHaveLength(1);
  });

  it('carries the answered values into the nodes', () => {
    const g = buildOnboardingGraph(answers);
    const bal = g.nodes.find((n) => n.type === 'startingBalance');
    const pay = g.nodes.find((n) => n.type === 'income');
    const bill = g.nodes.find((n) => n.type === 'expense');
    expect(bal?.type === 'startingBalance' && bal.balanceCents).toBe(185000);
    expect(pay?.type === 'income' && pay.amountCents).toBe(192000);
    expect(
      pay?.type === 'income' &&
        pay.recurrence.frequency.kind === 'biweekly' &&
        pay.recurrence.frequency.anchor,
    ).toBe('2026-11-06');
    expect(bill?.type === 'expense' && bill.name).toBe('Rent');
    expect(bill?.type === 'expense' && bill.amountCents).toBe(140000);
  });

  it('produces a genuine forecast with income and the bill', () => {
    const g = buildOnboardingGraph(answers);
    const res = forecast(g, DEFAULT_ASSUMPTIONS);
    const kinds = new Set(res.ledger.flatMap((d) => d.events.map((e) => e.kind)));
    expect(kinds.has('income')).toBe(true);
    expect(kinds.has('expense')).toBe(true);
    const rents = res.ledger.flatMap((d) => d.events).filter((e) => e.name === 'Rent');
    expect(rents.length).toBeGreaterThan(0);
  });

  it('maps each frequency choice to the right recurrence', () => {
    const monthly = buildOnboardingGraph({ ...answers, payFreq: 'monthly' });
    const mp = monthly.nodes.find((n) => n.type === 'income');
    expect(mp?.type === 'income' && mp.recurrence.frequency.kind).toBe('monthly');
    const semi = buildOnboardingGraph({ ...answers, payFreq: 'semimonthly' });
    const sp = semi.nodes.find((n) => n.type === 'income');
    expect(
      sp?.type === 'income' &&
        sp.recurrence.frequency.kind === 'semimonthly' &&
        sp.recurrence.frequency.days,
    ).toEqual([1, 15]);
  });
});

describe('nextQuarterlyDueDates', () => {
  it('returns the upcoming Apr/Jun/Sep/Jan 15 dates after the given day', () => {
    expect(nextQuarterlyDueDates('2026-11-03', 2)).toEqual(['2027-01-15', '2027-04-15']);
    expect(nextQuarterlyDueDates('2026-01-01', 2)).toEqual(['2026-01-15', '2026-04-15']);
    expect(nextQuarterlyDueDates('2026-06-15', 1)).toEqual(['2026-09-15']);
  });
});
