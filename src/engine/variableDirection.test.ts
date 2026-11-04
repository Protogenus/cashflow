import { describe, expect, it } from 'vitest';
import {
  buildAllocationPlan,
  forecast,
  generateEvents,
  isIncomeSource,
  validateGraph,
  DEFAULT_ASSUMPTIONS,
} from './index';
import type {
  ISODate,
  PercentageSplitNode,
  PlanEdge,
  PlanGraph,
  PlanNode,
  StartingBalanceNode,
  VariableAmountNode,
} from './types';

const START: ISODate = '2026-11-03';

function balance(id: string, cents: number): StartingBalanceNode {
  return { id, type: 'startingBalance', label: 'Checking', position: { x: 0, y: 0 }, balanceCents: cents, asOf: START };
}

function variable(
  id: string,
  name: string,
  min: number,
  typ: number,
  max: number,
  direction?: 'income' | 'expense',
): VariableAmountNode {
  return {
    id, type: 'variableAmount', label: name, position: { x: 0, y: 0 }, name,
    minCents: min, typicalCents: typ, maxCents: max, direction,
    recurrence: { frequency: { kind: 'monthly', dayOfMonth: 5 }, businessDay: 'following', exceptions: {} },
  };
}

function split(id: string): PercentageSplitNode {
  return {
    id, type: 'percentageSplit', label: 'Split', position: { x: 0, y: 0 },
    outputs: [
      { id: 'bills', label: 'Bills', percent: 70 },
      { id: 'savings', label: 'Savings', percent: 30 },
    ],
  };
}

function edge(id: string, source: string, sourceHandle: string, target: string): PlanEdge {
  return { id, source, sourceHandle, target, targetHandle: 'in' };
}

function graph(nodes: PlanNode[], edges: PlanEdge[] = []): PlanGraph {
  return { nodes, edges };
}

const A = { ...DEFAULT_ASSUMPTIONS, horizonDays: 60 };

describe('variableAmount direction', () => {
  it('defaults to expense when direction is absent (backward compatible)', () => {
    const v = variable('v', 'Electric', 8000, 14000, 22000);
    expect(isIncomeSource(v)).toBe(false);
    const occs = generateEvents(graph([balance('b', 100000), v]), START, 60);
    const mine = occs.filter((o) => o.nodeId === 'v');
    expect(mine.length).toBeGreaterThan(0);
    for (const o of mine) expect(o.kind).toBe('expense');
  });

  it('income-direction variables emit inflows in the walk', () => {
    const v = variable('v', 'Client income', 200000, 420000, 750000, 'income');
    const res = forecast(graph([balance('b', 100000), v]), A);
    const mine = res.ledger.flatMap((d) => d.events).filter((e) => e.nodeId === 'v');
    expect(mine.length).toBeGreaterThan(0);
    for (const e of mine) {
      expect(e.kind).toBe('income');
      expect(e.amountCents).toBeGreaterThan(0);
    }
    // Deterministic mode uses the typical value.
    expect(mine[0].amountCents).toBe(420000);
  });

  it('income-direction variables route through percentage splits like fixed income', () => {
    const v = variable('v', 'Client income', 200000, 420000, 750000, 'income');
    const s = split('s');
    const goal: PlanNode = {
      id: 'g', type: 'goal', label: 'Buffer', name: 'Buffer', position: { x: 0, y: 0 },
      targetCents: 100000, targetDate: '2027-01-03',
    };
    const g = graph(
      [balance('b', 100000), v, s, goal],
      [edge('e1', 'v', 'out', 's'), edge('e2', 's', 'savings', 'g')],
    );
    expect(validateGraph(g).valid).toBe(true);
    const plan = buildAllocationPlan(g);
    expect(plan.splits[0].incomeIds).toContain('v');
    const res = forecast(g, A);
    const prog = res.goals.find((x) => x.nodeId === 'g');
    expect(prog).toBeDefined();
    // 30% of each $4,200 typical payout over 2 months.
    expect(prog!.savedCents).toBe(2 * Math.round(420000 * 0.3));
  });

  it('skipIncomeOccurrences drops variable-income occurrences too (missed-paycheck shocks)', () => {
    const v = variable('v', 'Client income', 200000, 420000, 750000, 'income');
    const g = graph([balance('b', 100000), v]);
    const full = generateEvents(g, START, 60).filter((o) => o.nodeId === 'v');
    const skipped = generateEvents(g, START, 60, { skipIncomeOccurrences: { v: [0] } }).filter(
      (o) => o.nodeId === 'v',
    );
    expect(full.length).toBeGreaterThan(1);
    expect(skipped).toHaveLength(full.length - 1);
    expect(skipped[0].date).toBe(full[1].date);
  });

  it('expense-direction variables never count as rent candidates for Monte Carlo', () => {
    // Indirect: an income-direction node must not be treated as a bill.
    const v = variable('v', 'Client income', 200000, 420000, 750000, 'income');
    expect(isIncomeSource(v)).toBe(true);
    const b = variable('w', 'Electric', 8000, 14000, 22000, 'expense');
    expect(isIncomeSource(b)).toBe(false);
  });
});
