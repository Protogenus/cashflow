import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  evaluateAlerts,
  validateRule,
  type AlertRule,
} from './alerts';
import { DEFAULT_ASSUMPTIONS } from './types';
import type {
  ExpenseNode,
  GoalNode,
  IncomeNode,
  ISODate,
  PlanEdge,
  PlanGraph,
  PlanNode,
  StartingBalanceNode,
} from './types';

const START: ISODate = '2026-11-03'; // a Tuesday

function balance(id: string, cents: number): StartingBalanceNode {
  return { id, type: 'startingBalance', label: 'Checking', position: { x: 0, y: 0 }, balanceCents: cents, asOf: START };
}

function income(
  id: string,
  name: string,
  cents: number,
  frequency: IncomeNode['recurrence']['frequency'],
): IncomeNode {
  return {
    id, type: 'income', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents, recurrence: { frequency, businessDay: 'preceding', exceptions: {} },
  };
}

function expense(
  id: string,
  name: string,
  cents: number,
  frequency: ExpenseNode['recurrence']['frequency'],
): ExpenseNode {
  return {
    id, type: 'expense', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents, recurrence: { frequency, businessDay: 'following', exceptions: {} },
  };
}

function goal(id: string, name: string, targetCents: number, targetDate: ISODate): GoalNode {
  return { id, type: 'goal', label: name, position: { x: 0, y: 0 }, name, targetCents, targetDate };
}

function edge(id: string, source: string, target: string): PlanEdge {
  return { id, source, sourceHandle: 'out', target, targetHandle: 'in' };
}

function graph(nodes: PlanNode[], edges: PlanEdge[] = []): PlanGraph {
  return { nodes, edges };
}

function rule(over: Partial<AlertRule>): AlertRule {
  return {
    id: `rule_${Math.random().toString(36).slice(2)}`,
    name: 'Test rule',
    type: 'balanceBelow',
    params: {},
    severity: 'warning',
    enabled: true,
    ...over,
  };
}

const A = { ...DEFAULT_ASSUMPTIONS, horizonDays: 90 };

describe('balanceBelow rule', () => {
  it('fires when the projected balance drops under $0 and names the driving bill', () => {
    const g = graph([
      balance('bal', 100000),
      expense('rent', 'Rent', 140000, { kind: 'monthly', dayOfMonth: 5 }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'balanceBelow', params: { thresholdCents: 0 }, severity: 'critical' })],
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].dates).toContain('2026-11-05');
    expect(alerts[0].explanation).toContain('Rent');
  });

  it('stays quiet when the balance stays above the threshold', () => {
    const g = graph([
      balance('bal', 500000),
      expense('rent', 'Rent', 140000, { kind: 'monthly', dayOfMonth: 5 }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'balanceBelow', params: { thresholdCents: 0 } })],
    );
    expect(alerts).toHaveLength(0);
  });

  it('fires the buffer rule when balance dips under $500 but not under $0', () => {
    const g = graph([
      balance('bal', 100000),
      expense('rent', 'Rent', 60000, { kind: 'once', date: '2026-11-05' }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [
        rule({ type: 'balanceBelow', name: 'below zero', params: { thresholdCents: 0 }, severity: 'critical' }),
        rule({ type: 'balanceBelow', name: 'below buffer', params: { thresholdCents: 50000 }, severity: 'warning' }),
      ],
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ruleName).toBe('below buffer');
  });
});

describe('billCoverage rule', () => {
  it('fires when a big bill cannot be covered by the opening balance', () => {
    const g = graph([
      balance('bal', 50000),
      expense('rent', 'Rent', 140000, { kind: 'monthly', dayOfMonth: 5 }),
      expense('coffee', 'Coffee', 400, { kind: 'monthly', dayOfMonth: 6 }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'billCoverage', params: { minAmountCents: 100000 }, severity: 'warning' })],
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].dates).toContain('2026-11-05');
    // Names the big bill, not the small one below the floor.
    expect(alerts[0].explanation).toContain('Rent');
    expect(alerts[0].explanation).not.toContain('Coffee');
  });

  it('stays quiet when the floor is above every bill', () => {
    const g = graph([
      balance('bal', 50000),
      expense('rent', 'Rent', 140000, { kind: 'monthly', dayOfMonth: 5 }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'billCoverage', params: { minAmountCents: 200000 } })],
    );
    expect(alerts).toHaveLength(0);
  });

  it('stays quiet when the opening balance covers the bill', () => {
    const g = graph([
      balance('bal', 200000),
      income('pay', 'Paycheck', 200000, { kind: 'biweekly', anchor: START }),
      expense('rent', 'Rent', 140000, { kind: 'monthly', dayOfMonth: 5 }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'billCoverage', params: { minAmountCents: 100000 } })],
    );
    expect(alerts).toHaveLength(0);
  });
});

describe('paydayGap rule', () => {
  it('fires when monthly paydays are more than 21 days apart', () => {
    const g = graph([
      balance('bal', 100000),
      income('pay', 'Paycheck', 200000, { kind: 'monthly', dayOfMonth: 1 }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'paydayGap', params: { maxGapDays: 21 }, severity: 'warning' })],
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].explanation).toContain('days');
  });

  it('stays quiet for biweekly pay with a 21-day limit', () => {
    const g = graph([
      balance('bal', 100000),
      income('pay', 'Paycheck', 200000, { kind: 'biweekly', anchor: START }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'paydayGap', params: { maxGapDays: 21 } })],
    );
    expect(alerts).toHaveLength(0);
  });

  it('stays quiet when there are fewer than two income events', () => {
    const g = graph([
      balance('bal', 100000),
      income('pay', 'Bonus', 200000, { kind: 'once', date: '2026-11-10' }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'paydayGap', params: { maxGapDays: 21 } })],
    );
    expect(alerts).toHaveLength(0);
  });
});

describe('goalOffTrack rule', () => {
  it('fires when the goal is projected to miss, naming the goal and shortfall', () => {
    const g = graph([
      balance('bal', 100000),
      goal('g1', 'Emergency fund', 500000, '2027-02-01'),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'goalOffTrack', severity: 'warning' })],
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].explanation).toContain('Emergency fund');
    expect(alerts[0].explanation).toContain('short');
    expect(alerts[0].dates).toContain('2027-02-01');
  });

  it('stays quiet when income wired into the goal hits the target', () => {
    const g = graph(
      [
        balance('bal', 100000),
        income('pay', 'Paycheck', 200000, { kind: 'biweekly', anchor: START }),
        goal('g1', 'Emergency fund', 200000, '2026-12-03'),
      ],
      [edge('e1', 'pay', 'g1')],
    );
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'goalOffTrack', severity: 'warning' })],
    );
    expect(alerts).toHaveLength(0);
  });
});

describe('rule plumbing', () => {
  it('ignores disabled rules', () => {
    const g = graph([
      balance('bal', 100000),
      expense('rent', 'Rent', 140000, { kind: 'monthly', dayOfMonth: 5 }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [rule({ type: 'balanceBelow', params: { thresholdCents: 0 }, enabled: false })],
    );
    expect(alerts).toHaveLength(0);
  });

  it('sorts critical before warning, then by first firing date', () => {
    const g = graph([
      balance('bal', 100000),
      expense('rent', 'Rent', 140000, { kind: 'monthly', dayOfMonth: 5 }),
    ]);
    const alerts = evaluateAlerts(
      g, A,
      [
        rule({ name: 'warn', type: 'balanceBelow', params: { thresholdCents: 50000 }, severity: 'warning' }),
        rule({ name: 'crit', type: 'balanceBelow', params: { thresholdCents: 0 }, severity: 'critical' }),
        rule({ name: 'info', type: 'billCoverage', params: { minAmountCents: 100000 }, severity: 'info' }),
      ],
    );
    expect(alerts.map((a) => a.severity)).toEqual(['critical', 'warning', 'info']);
  });

  it('the default rules fire on an overdrawn plan', () => {
    const g = graph([
      balance('bal', 100000),
      expense('rent', 'Rent', 140000, { kind: 'monthly', dayOfMonth: 5 }),
    ]);
    const alerts = evaluateAlerts(g, A, DEFAULT_RULES);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].ruleName).toBe('Balance below $0');
    expect(alerts[1].ruleName).toBe('Balance below $500 buffer');
  });
});

describe('validateRule', () => {
  it('accepts a well-formed rule', () => {
    expect(validateRule(rule({ type: 'paydayGap', params: { maxGapDays: 21 } }))).toEqual([]);
  });

  it('rejects an empty name and bad params', () => {
    expect(validateRule(rule({ name: '  ' })).length).toBeGreaterThan(0);
    expect(validateRule(rule({ type: 'paydayGap', params: { maxGapDays: 0 } })).length).toBeGreaterThan(0);
    expect(validateRule(rule({ type: 'billCoverage', params: { minAmountCents: 50 } })).length).toBeGreaterThan(0);
  });
});
