import { describe, expect, it } from 'vitest';
import {
  buildAllocationPlan,
  forecast,
  forecastScenario,
  generateEvents,
  projectDebtPayoff,
  splitShares,
  validateGraph,
} from './forecast';
import { findDrivers } from './explain';
import type {
  Assumptions,
  DebtNode,
  ExpenseNode,
  GoalNode,
  IncomeNode,
  ISODate,
  PercentageSplitNode,
  PlanEdge,
  PlanGraph,
  PlanNode,
  Scenario,
  StartingBalanceNode,
} from './types';
import { DEFAULT_ASSUMPTIONS } from './types';

const START: ISODate = '2026-11-03'; // a Tuesday

function balance(id: string, cents: number): StartingBalanceNode {
  return { id, type: 'startingBalance', label: 'Checking', position: { x: 0, y: 0 }, balanceCents: cents, asOf: START };
}

function income(id: string, name: string, cents: number): IncomeNode {
  return {
    id, type: 'income', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents,
    recurrence: { frequency: { kind: 'biweekly', anchor: START }, businessDay: 'none', exceptions: {} },
  };
}

function expense(id: string, name: string, cents: number): ExpenseNode {
  return {
    id, type: 'expense', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents,
    recurrence: { frequency: { kind: 'monthly', dayOfMonth: 1 }, businessDay: 'none', exceptions: {} },
  };
}

function split(id: string, outputs: { id: string; label: string; percent: number }[]): PercentageSplitNode {
  return { id, type: 'percentageSplit', label: 'Split', position: { x: 0, y: 0 }, outputs };
}

function goal(id: string, name: string, targetCents: number, targetDate: ISODate): GoalNode {
  return { id, type: 'goal', label: name, position: { x: 0, y: 0 }, name, targetCents, targetDate };
}

function debt(id: string, name: string): DebtNode {
  return {
    id, type: 'debt', label: name, position: { x: 0, y: 0 }, name,
    balanceCents: 500000, aprBps: 1999, minPaymentCents: 15000,
  };
}

function edge(id: string, source: string, target: string, sourceHandle = 'out'): PlanEdge {
  return { id, source, sourceHandle, target, targetHandle: 'in' };
}

function scenarioOf(graph: PlanGraph, disabledNodeIds: string[] = []): Scenario {
  return {
    id: 's1', name: 'Test', graph, disabledNodeIds,
    isBaseline: true, createdAt: '2026-11-03', updatedAt: '2026-11-03',
  };
}

const ASSUMPTIONS: Assumptions = { ...DEFAULT_ASSUMPTIONS, horizonDays: 90 };

describe('split allocation semantics', () => {
  // Paycheck $2000 biweekly -> split 70/30 -> [Bills, Savings goal $1000 by day 60].
  // 7 paychecks in 90 days (days 0,14,...,84): 7 * $600 = $4200 saved.
  function savingsGraph(): PlanGraph {
    const nodes: PlanNode[] = [
      balance('bal', 100000),
      income('pay', 'Paycheck', 200000),
      split('sp', [
        { id: 'bills', label: 'Bills', percent: 70 },
        { id: 'save', label: 'Savings', percent: 30 },
      ]),
      goal('g', 'Emergency fund', 100000, '2026-12-31'),
    ];
    const edges = [
      edge('e1', 'pay', 'sp'),
      edge('e2', 'sp', 'g', 'save'),
    ];
    return { nodes, edges };
  }

  it('routes split shares to goal sinks out of the spendable walk', () => {
    const g = savingsGraph();
    expect(validateGraph(g).valid).toBe(true);
    const res = forecast(g, ASSUMPTIONS, { startDate: START, skipHash: true });

    // 7 paychecks x $600 to savings = $4200 moved out of the walk.
    const goalProg = res.goals.find((x) => x.nodeId === 'g')!;
    expect(goalProg.savedCents).toBe(7 * 60000);
    // Two paychecks ($1200) clear the $1000 target on day 14.
    expect(goalProg.hitDate).toBe('2026-11-17');
    expect(goalProg.shortfallAtTargetCents).toBe(0);

    // Spendable balance on day 0: 1000 + 2000 - 600 = 2400.
    expect(res.ledger[0].balanceCents).toBe(100000 + 200000 - 60000);
    // Ledger shows the income AND the transfer.
    const kinds = res.ledger[0].events.map((e) => e.kind);
    expect(kinds).toEqual(['income', 'transfer']);
    const transfer = res.ledger[0].events.find((e) => e.kind === 'transfer')!;
    expect(transfer.nodeId).toBe('g');
    expect(transfer.amountCents).toBe(-60000);
  });

  it('excludes transfers from pinch-point drivers (allocations are not bills)', () => {
    const g = savingsGraph();
    const res = forecast(g, ASSUMPTIONS, { startDate: START, skipHash: true });
    for (const d of res.pinchPoint.drivers) {
      expect(d.nodeId).not.toBe('g');
    }
    // findDrivers directly: a transfer-heavy window still reports only real outflows.
    const drivers = findDrivers(res.ledger, res.pinchPoint.date, 7, 4);
    expect(drivers.every((d) => d.nodeId !== 'g')).toBe(true);
  });

  it('tracks split-routed extra payments per debt node', () => {
    const nodes: PlanNode[] = [
      balance('bal', 100000),
      income('pay', 'Paycheck', 200000),
      split('sp', [
        { id: 'bills', label: 'Bills', percent: 80 },
        { id: 'extra', label: 'Extra debt', percent: 20 },
      ]),
      debt('d', 'Car loan'),
    ];
    const edges = [edge('e1', 'pay', 'sp'), edge('e2', 'sp', 'd', 'extra')];
    const res = forecast({ nodes, edges }, ASSUMPTIONS, { startDate: START, skipHash: true });
    const dp = res.debts.find((x) => x.nodeId === 'd')!;
    expect(dp.extraPaidCents).toBe(7 * 40000); // 7 paychecks x $400
    // Spendable balance reflects the extra payments leaving the account.
    expect(res.ledger[0].balanceCents).toBe(100000 + 200000 - 40000);
  });

  it('supports direct income -> goal edges (no split)', () => {
    const nodes: PlanNode[] = [
      balance('bal', 50000),
      income('gig', 'Side gig', 50000),
      goal('g', 'Trip', 100000, '2027-02-01'),
    ];
    const edges = [edge('e1', 'gig', 'g')];
    const res = forecast({ nodes, edges }, ASSUMPTIONS, { startDate: START, skipHash: true });
    const gp = res.goals.find((x) => x.nodeId === 'g')!;
    expect(gp.savedCents).toBe(7 * 50000);
    // Full gig income leaves the walk: 500 + 500 - 500 = 500 on day 0.
    expect(res.ledger[0].balanceCents).toBe(50000);
  });

  it('leaves expense-routed split shares in the walk (starter-template shape)', () => {
    const nodes: PlanNode[] = [
      balance('bal', 100000),
      income('pay', 'Paycheck', 200000),
      split('sp', [
        { id: 'bills', label: 'Bills', percent: 80 },
        { id: 'save', label: 'Savings', percent: 20 },
      ]),
      expense('rent', 'Rent', 140000),
    ];
    const edges = [edge('e1', 'pay', 'sp'), edge('e2', 'sp', 'rent', 'bills')];
    const res = forecast({ nodes, edges }, ASSUMPTIONS, { startDate: START, skipHash: true });
    // No goal/debt sinks: the full paycheck stays spendable; no transfers.
    expect(res.ledger[0].balanceCents).toBe(100000 + 200000);
    expect(res.ledger[0].events.map((e) => e.kind)).toEqual(['income']);
    expect(res.goals).toEqual([]);
  });

  it('splitShares divides cents with the largest share absorbing rounding', () => {
    expect(splitShares(10000, [70, 30])).toEqual([7000, 3000]);
    const shares = splitShares(100, [33.333, 33.333, 33.334]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('buildAllocationPlan maps income -> split -> goal sinks', () => {
    const plan = buildAllocationPlan(savingsGraph());
    expect(plan.routedIncome.get('pay')?.splitId).toBe('sp');
    const saveOut = plan.routedIncome.get('pay')!.outputs.find((o) => o.outputId === 'save')!;
    expect(saveOut.sinks).toEqual([{ nodeId: 'g', kind: 'goal', name: 'Emergency fund' }]);
    const billsOut = plan.routedIncome.get('pay')!.outputs.find((o) => o.outputId === 'bills')!;
    expect(billsOut.sinks).toEqual([]);
  });
});

describe('scenario-aware forecast', () => {
  function twoExpenseGraph(): PlanGraph {
    const nodes: PlanNode[] = [
      balance('bal', 200000),
      income('pay', 'Paycheck', 200000),
      expense('rent', 'Rent', 140000),
      expense('boat', 'Boat', 50000),
    ];
    return { nodes, edges: [] };
  }

  it('forecastScenario excludes disabled nodes from the walk', () => {
    const g = twoExpenseGraph();
    const base = forecastScenario(scenarioOf(g), ASSUMPTIONS, { startDate: START, skipHash: true });
    const without = forecastScenario(scenarioOf(g, ['boat']), ASSUMPTIONS, { startDate: START, skipHash: true });
    // Boat ($500/mo) excluded: every balance is higher by the boat payments to date.
    expect(without.ledger[0].balanceCents).toBe(base.ledger[0].balanceCents);
    const lastBase = base.ledger[base.ledger.length - 1].balanceCents;
    const lastWithout = without.ledger[without.ledger.length - 1].balanceCents;
    expect(lastWithout - lastBase).toBe(2 * 50000); // Dec 1 + Jan 1 boat payments in the 90-day window
    // Disabled node never appears in the ledger.
    expect(without.ledger.every((d) => d.events.every((e) => e.nodeId !== 'boat'))).toBe(true);
  });

  it('disabled nodes are excluded before validation (no spurious errors)', () => {
    const nodes: PlanNode[] = [
      balance('bal', 100000),
      income('pay', 'Paycheck', 200000),
      split('sp', [{ id: 'a', label: 'A', percent: 40 }, { id: 'b', label: 'B', percent: 30 }]), // invalid: sums to 70
    ];
    const edges = [edge('e1', 'pay', 'sp')];
    // Enabled: the bad split is a validation error.
    expect(() => forecast({ nodes, edges }, ASSUMPTIONS, { startDate: START })).toThrow(/sum to 100/);
    // Disabled: the split (and its edge) vanish before validation.
    const res = forecast({ nodes, edges }, ASSUMPTIONS, { startDate: START, disabledNodeIds: ['sp'], skipHash: true });
    expect(res.ledger[0].balanceCents).toBe(100000 + 200000);
  });

  it('disabling the starting balance is an honest error, not a silent chart', () => {
    const g = twoExpenseGraph();
    expect(() =>
      forecast(g, ASSUMPTIONS, { startDate: START, disabledNodeIds: ['bal'] }),
    ).toThrow(/starting-balance/);
  });
});

describe('projectDebtPayoff with extra payments', () => {
  const d = debt('d', 'Car loan'); // $5000 @ 19.99%, $150 min

  it('extra payments shorten payoff and reduce interest', () => {
    const base = projectDebtPayoff(d, START)!;
    const extra = projectDebtPayoff(d, START, 10000)!; // +$100/mo
    expect(extra.months).toBeLessThan(base.months);
    expect(extra.totalInterestCents).toBeLessThan(base.totalInterestCents);
    // Sanity: $250/mo on $5000 @ ~1.67%/mo clears in well under the base term.
    expect(extra.months).toBeLessThan(30);
  });

  it('still returns null when payments never cover interest', () => {
    const deep = debt('d2', 'Deep');
    deep.balanceCents = 1000000; // $10k @ 19.99% -> ~$167/mo interest
    deep.minPaymentCents = 10000; // $100 < interest
    expect(projectDebtPayoff(deep, START, 0)).toBeNull();
    expect(projectDebtPayoff(deep, START, 10000)).not.toBeNull(); // +$100 covers it
  });
});

describe('monte-carlo forecast options (fast path)', () => {
  function simpleGraph(): PlanGraph {
    const nodes: PlanNode[] = [
      balance('bal', 100000),
      income('pay', 'Paycheck', 200000),
      {
        id: 'elec', type: 'variableAmount', label: 'Electric', position: { x: 0, y: 0 }, name: 'Electric',
        minCents: 8000, typicalCents: 14000, maxCents: 22000,
        recurrence: { frequency: { kind: 'monthly', dayOfMonth: 15 }, businessDay: 'none', exceptions: {} },
      } as PlanNode,
    ];
    return { nodes, edges: [] };
  }

  it('variableOverrides replaces the typical value', () => {
    const g = simpleGraph();
    const typical = forecast(g, ASSUMPTIONS, { startDate: START, skipHash: true });
    const high = forecast(g, ASSUMPTIONS, {
      startDate: START, skipHash: true, variableOverrides: { elec: 22000 },
    });
    // Electric hits on day 12 (Nov 15): high run is $80 lower from there on.
    expect(high.ledger[20].balanceCents - typical.ledger[20].balanceCents).toBe(14000 - 22000);
  });

  it('skipIncomeOccurrences drops one paycheck', () => {
    const g = simpleGraph();
    const full = forecast(g, ASSUMPTIONS, { startDate: START, skipHash: true });
    const skipped = forecast(g, ASSUMPTIONS, {
      startDate: START, skipHash: true, skipIncomeOccurrences: { pay: [0] },
    });
    const last = (r: ReturnType<typeof forecast>) => r.ledger[r.ledger.length - 1].balanceCents;
    expect(last(full) - last(skipped)).toBe(200000);
  });

  it('extraExpenses inject shock events on their date', () => {
    const g = simpleGraph();
    const shocked = forecast(g, ASSUMPTIONS, {
      startDate: START, skipHash: true,
      extraExpenses: [{ date: '2026-12-01', amountCents: 60000, name: 'Car repair', nodeId: 'shock:1' }],
    });
    const day = shocked.ledger.find((d) => d.date === '2026-12-01')!;
    expect(day.events.some((e) => e.nodeId === 'shock:1' && e.amountCents === -60000)).toBe(true);
  });

  it('generateEvents honors overrides (shared code path)', () => {
    const g = simpleGraph();
    const occs = generateEvents(g, START, 90, { variableOverrides: { elec: 22000 }, skipIncomeOccurrences: { pay: [0] } });
    const elecOccs = occs.filter((o) => o.nodeId === 'elec');
    expect(elecOccs.every((o) => o.amountCents === 22000)).toBe(true);
    expect(occs.filter((o) => o.nodeId === 'pay')).toHaveLength(6); // 7 minus 1
  });
});
