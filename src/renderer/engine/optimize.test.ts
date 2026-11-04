import { describe, expect, it } from 'vitest';
import { applySplits, compositions, optimize } from './optimize';
import type {
  Assumptions,
  ExpenseNode,
  GoalNode,
  IncomeNode,
  ISODate,
  PercentageSplitNode,
  PlanEdge,
  PlanGraph,
  PlanNode,
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
  return { id, type: 'percentageSplit', label: 'Paycheck split', position: { x: 0, y: 0 }, outputs };
}

function goal(id: string, name: string, targetCents: number, targetDate: ISODate): GoalNode {
  return { id, type: 'goal', label: name, position: { x: 0, y: 0 }, name, targetCents, targetDate };
}

function edge(id: string, source: string, target: string, sourceHandle = 'out'): PlanEdge {
  return { id, source, sourceHandle, target, targetHandle: 'in' };
}

// Paycheck $2000 biweekly anchored on START: occurrences on days 0, 14, 28, 42, 56
// in a 60-day horizon (days 0..59) -> exactly 5 paychecks = $10,000 total.
// Rent $500/mo on the 1st: Dec 1 only in the 60-day window.
function savingsGraph(): PlanGraph {
  const nodes: PlanNode[] = [
    balance('bal', 100000),
    income('pay', 'Paycheck', 200000),
    split('sp', [
      { id: 'bills', label: 'Bills', percent: 50 },
      { id: 'save', label: 'Savings', percent: 50 },
    ]),
    expense('rent', 'Rent', 50000),
    goal('g', 'Emergency fund', 100000, '2027-01-01'), // day 59 = last horizon day
  ];
  const edges = [
    edge('e1', 'pay', 'sp'),
    edge('e2', 'sp', 'g', 'save'),
  ];
  return { nodes, edges };
}

const ASSUMPTIONS: Assumptions = { ...DEFAULT_ASSUMPTIONS, horizonDays: 60 };

describe('compositions', () => {
  it('enumerates 5%-step allocations: 2 outputs -> 21, 3 outputs -> 231', () => {
    expect(compositions(20, 2)).toHaveLength(21);
    expect(compositions(20, 3)).toHaveLength(231);
    for (const c of compositions(20, 3)) {
      expect(c.reduce((a, b) => a + b, 0)).toBe(20);
    }
  });
});

describe('optimize: savings goal with analytically known optimum', () => {
  // 5 paychecks x $2000 = $10,000. Goal $1000 by day 59.
  // Saved = $10,000 * p. Need p >= 10% -> smallest 5% step with zero shortfall
  // is 10%. Among zero-shortfall candidates the tie-break (highest minimum
  // balance) picks the SMALLEST such p -> [90, 10].
  it('finds the minimum savings allocation that hits the target', () => {
    const res = optimize(savingsGraph(), ASSUMPTIONS, {
      goal: 'savingsGoal',
      startDate: START,
    });
    expect(res.searchMode).toBe('full');
    expect(res.combosTotal).toBe(21);
    const top = res.candidates[0];
    expect(top.splits['sp']).toEqual([90, 10]);
    expect(top.scoreBreakdown.shortfallCents).toBe(0);
    expect(top.explanation).toContain(top.scoreBreakdown.pinchDate);
  });

  it('is reproducible: same inputs -> identical candidates', () => {
    const a = optimize(savingsGraph(), ASSUMPTIONS, { goal: 'savingsGoal', startDate: START });
    const b = optimize(savingsGraph(), ASSUMPTIONS, { goal: 'savingsGoal', startDate: START });
    expect(a.candidates.map((c) => c.splits)).toEqual(b.candidates.map((c) => c.splits));
    expect(a.candidates.map((c) => c.score)).toEqual(b.candidates.map((c) => c.score));
  });

  it('explanations name the pinch date, drivers, and the delta vs baseline', () => {
    // A graph with a genuine pinch: a big one-time bill mid-horizon.
    const nodes: PlanNode[] = [
      balance('bal', 500000),
      income('pay', 'Paycheck', 200000),
      {
        id: 'ins', type: 'expense', label: 'Insurance', position: { x: 0, y: 0 }, name: 'Car insurance',
        amountCents: 450000,
        recurrence: { frequency: { kind: 'once', date: '2026-11-10' }, businessDay: 'none', exceptions: {} },
      } as PlanNode,
      split('sp', [
        { id: 'bills', label: 'Bills', percent: 50 },
        { id: 'save', label: 'Savings', percent: 50 },
      ]),
      goal('g', 'Emergency fund', 100000, '2027-01-01'),
    ];
    const edges = [edge('e1', 'pay', 'sp'), edge('e2', 'sp', 'g', 'save')];
    const res = optimize({ nodes, edges }, ASSUMPTIONS, { goal: 'savingsGoal', startDate: START });
    const top = res.candidates[0];
    // Pinch is the insurance day: 5000 + 2000 − 200 − 4500 = 2300 on Nov 10.
    expect(top.scoreBreakdown.pinchDate).toBe('2026-11-10');
    expect(top.explanation).toContain('2026-11-10');
    expect(top.explanation).toContain('Car insurance');
    // Baseline [50,50] already hits the $1000 goal, so the delta is on the
    // tie-break (higher minimum balance), not the shortfall.
    expect(top.deltaLabel).toContain('same shortfall');
    expect(res.baselineSplits['sp']).toEqual([50, 50]);
  });
});

describe('optimize: maxBuffer corner', () => {
  it('routes 0% to savings when the goal is purely maximum buffer', () => {
    const res = optimize(savingsGraph(), ASSUMPTIONS, { goal: 'maxBuffer', startDate: START });
    const top = res.candidates[0];
    // Every dollar to savings lowers the spendable minimum: optimum is 0% savings.
    expect(top.splits['sp']).toEqual([100, 0]);
    expect(top.score).toBe(top.scoreBreakdown.pinchBalanceCents);
  });
});

describe('optimize: debt payoff', () => {
  function debtGraph(): PlanGraph {
    const nodes: PlanNode[] = [
      balance('bal', 200000),
      income('pay', 'Paycheck', 200000),
      split('sp', [
        { id: 'bills', label: 'Bills', percent: 100 },
        { id: 'extra', label: 'Extra debt', percent: 0 },
      ]),
      {
        id: 'd', type: 'debt', label: 'Car loan', position: { x: 0, y: 0 }, name: 'Car loan',
        balanceCents: 300000, aprBps: 1200, minPaymentCents: 10000,
      } as PlanNode,
    ];
    const edges = [edge('e1', 'pay', 'sp'), edge('e2', 'sp', 'd', 'extra')];
    return { nodes, edges };
  }

  it('more extra payment -> earlier payoff date in the top candidate', () => {
    const res = optimize(debtGraph(), ASSUMPTIONS, { goal: 'debtFastest', startDate: START });
    const top = res.candidates[0];
    // $3000 @ 12% APR: first-month interest $30, so a 1-month payoff needs
    // payment >= $3030 -> extra >= $2930/mo -> over 60 days extraPaid >= $5,775
    // -> 57.75% of the $10,000 paycheck total -> smallest 5% step is 60%.
    // Among 1-month payoffs the tie-break (highest minimum balance) picks
    // the smallest such extra: [40, 60].
    expect(top.splits['sp']).toEqual([40, 60]);
    expect(top.scoreBreakdown.debtPayoffDate).not.toBeNull();
    expect(top.scoreBreakdown.debtPayoffMonths).toBe(1);
    expect(top.explanation).toContain('Car loan');
    expect(top.deltaLabel).toContain('sooner');
  });

  it('throws a clear error when the objective needs a missing node', () => {
    // savingsGraph's split routes to a goal (live) but has no debt node.
    expect(() =>
      optimize(savingsGraph(), ASSUMPTIONS, { goal: 'debtFastest', startDate: START }),
    ).toThrow(/debt node/);
    // A live split (routes to a debt sink) but no goal node on canvas.
    const noGoal: PlanGraph = {
      nodes: [
        balance('bal', 100000),
        income('pay', 'Paycheck', 200000),
        split('sp', [
          { id: 'a', label: 'Bills', percent: 50 },
          { id: 'b', label: 'Extra', percent: 50 },
        ]),
        {
          id: 'd', type: 'debt', label: 'Loan', position: { x: 0, y: 0 }, name: 'Loan',
          balanceCents: 100000, aprBps: 1200, minPaymentCents: 5000,
        } as PlanNode,
      ],
      edges: [edge('e1', 'pay', 'sp'), edge('e2', 'sp', 'd', 'b')],
    };
    expect(() =>
      optimize(noGoal, ASSUMPTIONS, { goal: 'savingsGoal', startDate: START }),
    ).toThrow(/goal node/);
  });
});

describe('optimize: blend', () => {
  it('returns normalized components and a 0..1 score', () => {
    const res = optimize(savingsGraph(), ASSUMPTIONS, {
      goal: 'blend',
      weights: { buffer: 1, savings: 1, debt: 1 },
      startDate: START,
    });
    const top = res.candidates[0];
    expect(top.score).toBeGreaterThanOrEqual(0);
    expect(top.score).toBeLessThanOrEqual(1);
    const b = top.scoreBreakdown.blend!;
    expect(b.buffer).toBeGreaterThanOrEqual(0);
    expect(b.buffer).toBeLessThanOrEqual(1);
    expect(top.explanation).toContain('Blend score');
  });
});

describe('optimize: search-space guard', () => {
  it('coarsens then samples, and says so', () => {
    // 2 live splits x 4 outputs at 5%: 1771^2 = 3.1M combos -> coarsen to
    // 10%: 286^2 = 81,796 -> still over the cap -> seeded sample.
    const nodes: PlanNode[] = [
      balance('bal', 100000),
      goal('g', 'Fund', 100000, '2027-01-01'),
    ];
    const edges: PlanEdge[] = [];
    for (let s = 0; s < 2; s++) {
      const iid = `pay${s}`;
      const sid = `sp${s}`;
      nodes.push(income(iid, `Paycheck ${s}`, 200000));
      nodes.push(split(sid, [
        { id: 'a', label: 'A', percent: 40 },
        { id: 'b', label: 'B', percent: 30 },
        { id: 'c', label: 'C', percent: 20 },
        { id: 'd', label: 'D', percent: 10 },
      ]));
      edges.push(edge(`e${s}a`, iid, sid));
      edges.push(edge(`e${s}b`, sid, 'g', 'd'));
    }
    const opts = { goal: 'maxBuffer' as const, startDate: START, maxCombos: 500 };
    const res = optimize({ nodes, edges }, ASSUMPTIONS, opts);
    expect(res.searchMode).toBe('sampled');
    expect(res.stepUsed).toBe(10);
    expect(res.combosEvaluated).toBeLessThanOrEqual(500);
    expect(res.searchNote).toContain('sample');
    expect(res.candidates).toHaveLength(5);
    // Sampled search is still reproducible.
    const again = optimize({ nodes, edges }, ASSUMPTIONS, opts);
    expect(again.candidates.map((c) => c.splits)).toEqual(res.candidates.map((c) => c.splits));
  });

  it('excludes dead splits with honest reasons instead of searching noise', () => {
    // sp0: live (routes to goal). sp1: same income -> claimed by sp0.
    // sp2: no income wired. sp3: income wired but only expense outputs.
    const nodes: PlanNode[] = [
      balance('bal', 100000),
      income('pay', 'Paycheck', 200000),
      income('pay2', 'Gig', 50000),
      split('sp0', [
        { id: 'a', label: 'Bills', percent: 70 },
        { id: 's', label: 'Savings', percent: 30 },
      ]),
      split('sp1', [
        { id: 'a', label: 'Bills', percent: 70 },
        { id: 's', label: 'Savings', percent: 30 },
      ]),
      split('sp2', [
        { id: 'a', label: 'Bills', percent: 70 },
        { id: 's', label: 'Savings', percent: 30 },
      ]),
      split('sp3', [
        { id: 'a', label: 'Bills', percent: 70 },
        { id: 's', label: 'Fun', percent: 30 },
      ]),
      goal('g', 'Fund', 100000, '2027-01-01'),
      expense('rent', 'Rent', 50000),
    ];
    const edges: PlanEdge[] = [
      edge('e0', 'pay', 'sp0'),
      edge('e1', 'pay', 'sp1'), // same income: sp1 loses the claim race
      edge('e2', 'sp0', 'g', 's'),
      edge('e5', 'sp1', 'g', 's'), // sp1 has a goal sink but its income is claimed
      edge('e3', 'pay2', 'sp3'),
      edge('e4', 'sp3', 'rent', 'a'),
    ];
    const res = optimize({ nodes, edges }, ASSUMPTIONS, { goal: 'maxBuffer', startDate: START });
    expect(res.splitNodeIds).toEqual(['sp0']);
    expect(res.excludedSplits.map((s) => s.id).sort()).toEqual(['sp1', 'sp2', 'sp3']);
    expect(res.excludedSplits.find((s) => s.id === 'sp1')!.reason).toContain('already routes through');
    expect(res.excludedSplits.find((s) => s.id === 'sp2')!.reason).toContain('no income');
    expect(res.excludedSplits.find((s) => s.id === 'sp3')!.reason).toContain('no output wired to a goal or debt');
    expect(res.searchNote).toContain('already routes through');
    expect(res.combosTotal).toBe(21);
  });
});

describe('applySplits', () => {
  it('writes percents back into a graph copy without mutating the original', () => {
    const g = savingsGraph();
    const out = applySplits(g, { sp: [85, 15] });
    const node = out.nodes.find((n) => n.id === 'sp')!;
    expect(node.type === 'percentageSplit' && node.outputs.map((o) => o.percent)).toEqual([85, 15]);
    const orig = g.nodes.find((n) => n.id === 'sp')!;
    expect(orig.type === 'percentageSplit' && orig.outputs.map((o) => o.percent)).toEqual([50, 50]);
  });
});
