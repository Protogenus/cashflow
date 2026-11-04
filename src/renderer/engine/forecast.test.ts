import { describe, expect, it } from 'vitest';
import {
  computeSplitPreview,
  findOrphanedNodes,
  forecast,
  projectDebtPayoff,
  topologicalOrder,
  validateConnection,
  validateGraph,
} from './forecast';
import type {
  Assumptions,
  DebtNode,
  ExpenseNode,
  IncomeNode,
  ISODate,
  LedgerDay,
  PlanEdge,
  PlanGraph,
  PlanNode,
  StartingBalanceNode,
  VariableAmountNode,
} from './types';
import { DEFAULT_ASSUMPTIONS } from './types';

const START: ISODate = '2026-11-03'; // a Tuesday

function balance(id: string, cents: number): StartingBalanceNode {
  return { id, type: 'startingBalance', label: 'Checking', position: { x: 0, y: 0 }, balanceCents: cents, asOf: START };
}

function income(
  id: string,
  name: string,
  cents: number,
  frequency: IncomeNode['recurrence']['frequency'],
  businessDay: IncomeNode['recurrence']['businessDay'] = 'preceding',
): IncomeNode {
  return {
    id, type: 'income', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents, recurrence: { frequency, businessDay, exceptions: {} },
  };
}

function expense(
  id: string,
  name: string,
  cents: number,
  frequency: ExpenseNode['recurrence']['frequency'],
  businessDay: ExpenseNode['recurrence']['businessDay'] = 'following',
): ExpenseNode {
  return {
    id, type: 'expense', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents, recurrence: { frequency, businessDay, exceptions: {} },
  };
}

function variable(
  id: string,
  name: string,
  min: number,
  typ: number,
  max: number,
  frequency: VariableAmountNode['recurrence']['frequency'],
): VariableAmountNode {
  return {
    id, type: 'variableAmount', label: name, position: { x: 0, y: 0 }, name,
    minCents: min, typicalCents: typ, maxCents: max,
    recurrence: { frequency, businessDay: 'following', exceptions: {} },
  };
}

function edge(id: string, source: string, target: string): PlanEdge {
  return { id, source, sourceHandle: 'out', target, targetHandle: 'in' };
}

function graph(nodes: PlanNode[], edges: PlanEdge[] = []): PlanGraph {
  return { nodes, edges };
}

function assumptions(overrides: Partial<Assumptions> = {}): Assumptions {
  return { ...DEFAULT_ASSUMPTIONS, ...overrides };
}

function day(ledger: LedgerDay[], date: ISODate): LedgerDay {
  const d = ledger.find((l) => l.date === date);
  if (!d) throw new Error(`no ledger day ${date}`);
  return d;
}

describe('forecast: basic walk', () => {
  // balance $2,500 · paycheck $1,850 biweekly (anchor Fri 2026-10-30)
  // rent $1,400 monthly on the 1st (following; Nov 1 is a Sunday -> Nov 2, before start)
  const g = graph([
    balance('bal', 250000),
    income('pay', 'Paycheck', 185000, { kind: 'biweekly', anchor: '2026-10-30' }),
    expense('rent', 'Rent', 140000, { kind: 'monthly', dayOfMonth: 1 }),
  ]);
  const res = forecast(g, assumptions(), { startDate: START });

  it('walks 90 days from the starting balance', () => {
    expect(res.ledger).toHaveLength(90);
    expect(res.ledger[0].date).toBe('2026-11-03');
    expect(res.ledger[0].balanceCents).toBe(250000);
    expect(res.ledger[89].date).toBe('2027-01-31');
  });

  it('applies paychecks on the 14-day cadence', () => {
    expect(day(res.ledger, '2026-11-13').balanceCents).toBe(435000);
    expect(day(res.ledger, '2026-11-27').balanceCents).toBe(620000);
    expect(day(res.ledger, '2026-12-11').balanceCents).toBe(665000);
  });

  it('applies rent on the 1st (Dec 1 Tue, Jan 1 Fri — no weekend shift)', () => {
    expect(day(res.ledger, '2026-12-01').balanceCents).toBe(480000);
    expect(day(res.ledger, '2026-12-01').events[0]).toMatchObject({
      name: 'Rent', amountCents: -140000, kind: 'expense',
    });
    expect(day(res.ledger, '2027-01-01').balanceCents).toBe(710000);
  });

  it('detects the pinch point as the global minimum (day 0 here)', () => {
    expect(res.pinchPoint.date).toBe('2026-11-03');
    expect(res.pinchPoint.balanceCents).toBe(250000);
    expect(res.pinchPoint.drivers).toEqual([]);
  });

  it('computes safe-to-spend as minimum minus buffer', () => {
    expect(res.safeToSpendCents).toBe(250000 - 50000);
  });

  it('reports no negative date when the balance stays positive', () => {
    expect(res.firstNegativeDate).toBeNull();
  });

  it('produces a stable assumptions hash', () => {
    const again = forecast(g, assumptions(), { startDate: START });
    expect(again.assumptionsHash).toBe(res.assumptionsHash);
    const changed = forecast(g, assumptions({ safetyBufferCents: 100000 }), { startDate: START });
    expect(changed.assumptionsHash).not.toBe(res.assumptionsHash);
    expect(changed.safeToSpendCents).toBe(250000 - 100000);
  });
});

describe('forecast: pinch point with drivers', () => {
  const g = graph([
    balance('bal', 250000),
    expense('car', 'Car repair', 240000, { kind: 'once', date: '2026-11-05' }),
  ]);
  const res = forecast(g, assumptions({ horizonDays: 30 }), { startDate: START });

  it('finds the mid-horizon minimum with its driving expense', () => {
    expect(res.pinchPoint.date).toBe('2026-11-05');
    expect(res.pinchPoint.balanceCents).toBe(10000);
    expect(res.pinchPoint.drivers).toEqual([
      { nodeId: 'car', name: 'Car repair', contributionCents: -240000 },
    ]);
  });

  it('allows safe-to-spend to go honestly negative', () => {
    expect(res.safeToSpendCents).toBe(10000 - 50000);
  });
});

describe('forecast: first negative date', () => {
  it('reports the first day the balance drops below $0', () => {
    const g = graph([
      balance('bal', 50000),
      expense('big', 'Big bill', 80000, { kind: 'once', date: '2026-11-05' }),
    ]);
    const res = forecast(g, assumptions({ horizonDays: 30 }), { startDate: START });
    expect(res.firstNegativeDate).toBe('2026-11-05');
    expect(res.pinchPoint.date).toBe('2026-11-05');
    expect(day(res.ledger, '2026-11-05').balanceCents).toBe(-30000);
  });
});

describe('forecast: same-day ordering', () => {
  it('applies income before expenses on the same day', () => {
    const g = graph([
      balance('bal', 200000),
      income('pay', 'Paycheck', 10000, { kind: 'once', date: '2026-11-05' }),
      expense('bill', 'Bill', 15000, { kind: 'once', date: '2026-11-05' }),
    ]);
    const res = forecast(g, assumptions({ horizonDays: 30 }), { startDate: START });
    const d = day(res.ledger, '2026-11-05');
    expect(d.events.map((e) => e.kind)).toEqual(['income', 'expense']);
    expect(d.events[0].amountCents).toBe(10000);
    expect(d.events[1].amountCents).toBe(-15000);
    expect(d.balanceCents).toBe(195000);
  });
});

describe('forecast: variable amounts use the typical value', () => {
  it('emits typical (not min/max) in deterministic mode, weekend-adjusted', () => {
    // 2026-11-15 is a Sunday -> following -> 2026-11-16.
    const g = graph([
      balance('bal', 100000),
      variable('elec', 'Electric', 8000, 14000, 22000, { kind: 'monthly', dayOfMonth: 15 }),
    ]);
    const res = forecast(g, assumptions({ horizonDays: 30 }), { startDate: START });
    const d = day(res.ledger, '2026-11-16');
    expect(d.events).toHaveLength(1);
    expect(d.events[0]).toMatchObject({ name: 'Electric', amountCents: -14000 });
    expect(res.pinchPoint.date).toBe('2026-11-16');
    expect(res.pinchPoint.drivers[0]).toMatchObject({ name: 'Electric', contributionCents: -14000 });
  });
});

describe('forecast: invalid graphs throw', () => {
  it('throws with no starting-balance node', () => {
    const g = graph([income('pay', 'Paycheck', 100, { kind: 'once', date: '2026-11-05' })]);
    expect(() => forecast(g, assumptions(), { startDate: START })).toThrow(/starting-balance/i);
  });

  it('throws on a cycle instead of producing a wrong chart', () => {
    const g = graph(
      [
        balance('bal', 100),
        income('a', 'A', 100, { kind: 'once', date: '2026-11-05' }),
        expense('b', 'B', 50, { kind: 'once', date: '2026-11-05' }),
      ],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
    );
    expect(() => forecast(g, assumptions(), { startDate: START })).toThrow(/cycle/i);
  });
});

describe('validateGraph', () => {
  it('accepts a clean graph', () => {
    const v = validateGraph(graph([balance('bal', 100)]));
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('flags split percentages that do not sum to 100', () => {
    const v = validateGraph(
      graph([
        balance('bal', 100),
        {
          id: 's', type: 'percentageSplit', label: 'Split', position: { x: 0, y: 0 },
          outputs: [
            { id: 'o1', label: 'A', percent: 70 },
            { id: 'o2', label: 'B', percent: 20 },
          ],
        },
      ]),
    );
    expect(v.valid).toBe(false);
    expect(v.errors[0].message).toMatch(/sum to 100/);
    expect(v.errors[0].nodeId).toBe('s');
  });

  it('flags variable ranges where min > max', () => {
    const v = validateGraph(graph([balance('bal', 100), variable('v', 'V', 500, 100, 200, { kind: 'once', date: '2026-11-05' })]));
    expect(v.valid).toBe(false);
    expect(v.errors[0].message).toMatch(/min ≤ typical ≤ max/);
  });

  it('warns (not errors) on orphaned nodes', () => {
    const v = validateGraph(
      graph([balance('bal', 100), income('pay', 'Paycheck', 100, { kind: 'once', date: '2026-11-05' })]),
    );
    expect(v.valid).toBe(true);
    expect(v.warnings.some((w) => w.nodeId === 'pay')).toBe(true);
  });
});

describe('validateConnection', () => {
  const g = graph(
    [balance('bal', 100), income('a', 'A', 100, { kind: 'once', date: '2026-11-05' }), expense('b', 'B', 50, { kind: 'once', date: '2026-11-05' }), expense('c', 'C', 50, { kind: 'once', date: '2026-11-05' })],
    [edge('e1', 'a', 'b')],
  );

  it('accepts a fresh valid connection', () => {
    expect(validateConnection(g, 'a', 'c')).toEqual({ ok: true });
  });
  it('rejects self-loops', () => {
    expect(validateConnection(g, 'a', 'a').ok).toBe(false);
  });
  it('rejects duplicate source→target edges', () => {
    const r = validateConnection(g, 'a', 'b');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/already connected/i);
  });
  it('rejects connections that would create a cycle', () => {
    const r = validateConnection(g, 'b', 'a');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cycle/i);
  });
  it('rejects inputs to the starting-balance node', () => {
    const r = validateConnection(g, 'a', 'bal');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no inputs/i);
  });
});

describe('topologicalOrder', () => {
  it('orders dependencies before dependents', () => {
    const order = topologicalOrder(
      graph(
        [balance('bal', 1), income('a', 'A', 1, { kind: 'once', date: '2026-11-05' }), expense('b', 'B', 1, { kind: 'once', date: '2026-11-05' })],
        [edge('e1', 'a', 'b')],
      ),
    );
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
  });
});

describe('findOrphanedNodes', () => {
  it('flags unconnected non-balance nodes, never the balance node', () => {
    const orphans = findOrphanedNodes(
      graph(
        [balance('bal', 1), income('a', 'A', 1, { kind: 'once', date: '2026-11-05' }), expense('b', 'B', 1, { kind: 'once', date: '2026-11-05' })],
        [edge('e1', 'a', 'b')],
      ),
    );
    expect(orphans).toEqual([]);
    const orphans2 = findOrphanedNodes(
      graph([balance('bal', 1), income('a', 'A', 1, { kind: 'once', date: '2026-11-05' })]),
    );
    expect(orphans2.map((n) => n.id)).toEqual(['a']);
  });
});

describe('computeSplitPreview', () => {
  const split = {
    id: 's', type: 'percentageSplit' as const, label: 'Paycheck split', position: { x: 0, y: 0 },
    outputs: [
      { id: 'bills', label: 'Bills', percent: 80 },
      { id: 'save', label: 'Savings', percent: 20 },
    ],
  };
  const pay = income('pay', 'Paycheck', 185000, { kind: 'biweekly', anchor: '2026-10-30' });

  it('shows live per-output amounts from wired income', () => {
    const preview = computeSplitPreview(
      graph([balance('bal', 1), pay, split], [edge('e1', 'pay', 's')]),
      's',
    );
    expect(preview).toEqual([
      { id: 'bills', label: 'Bills', percent: 80, ofAmountCents: 185000, amountCents: 148000 },
      { id: 'save', label: 'Savings', percent: 20, ofAmountCents: 185000, amountCents: 37000 },
    ]);
  });

  it('shows zero (not invented) amounts when nothing is wired in', () => {
    const preview = computeSplitPreview(graph([balance('bal', 1), split]), 's');
    expect(preview.every((o) => o.amountCents === 0)).toBe(true);
  });
});

describe('projectDebtPayoff', () => {
  const debt = (over: Partial<DebtNode> = {}): DebtNode => ({
    id: 'd', type: 'debt', label: 'Car loan', position: { x: 0, y: 0 },
    name: 'Car loan', balanceCents: 500000, aprBps: 1999, minPaymentCents: 15000, ...over,
  });

  it('projects a real amortized payoff date', () => {
    const p = projectDebtPayoff(debt(), '2026-11-03');
    expect(p).not.toBeNull();
    // ~$5k at 19.99% APR, $150/mo: roughly 3.5–4 years.
    expect(p!.months).toBeGreaterThan(30);
    expect(p!.months).toBeLessThan(60);
    expect(p!.totalInterestCents).toBeGreaterThan(0);
    expect(p!.payoffDate > '2026-11-03').toBe(true);
  });

  it('returns null when the minimum payment never covers interest', () => {
    // Monthly interest ≈ $83.29 > $50 payment.
    expect(projectDebtPayoff(debt({ minPaymentCents: 5000 }), '2026-11-03')).toBeNull();
  });

  it('handles a zero balance and zero payment honestly', () => {
    expect(projectDebtPayoff(debt({ balanceCents: 0 }), '2026-11-03')).toEqual({
      payoffDate: '2026-11-03', months: 0, totalInterestCents: 0,
    });
    expect(projectDebtPayoff(debt({ minPaymentCents: 0 }), '2026-11-03')).toBeNull();
  });
});
