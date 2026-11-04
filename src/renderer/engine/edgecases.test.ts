/**
 * engine/edgecases.test.ts — graceful handling of boundary inputs.
 *
 * Every case must either produce a valid forecast or a clear validation
 * error with a helpful message — never a crash, a blank screen, or a
 * silently wrong result.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS, forecast, validateGraph } from './index';
import type { ISODate, PlanGraph, PlanNode } from './index';
import { todayISO } from './dates';

function bal(balanceCents: number, asOf: string = todayISO()): PlanNode {
  return {
    id: 'bal', type: 'startingBalance', label: 'Checking',
    position: { x: 0, y: 0 }, balanceCents, asOf: asOf as ISODate,
  };
}
function income(amountCents: number): PlanNode {
  return {
    id: 'inc', type: 'income', label: 'Pay', name: 'Pay', position: { x: 0, y: 0 },
    amountCents,
    recurrence: { frequency: { kind: 'monthly', dayOfMonth: 1 }, businessDay: 'preceding', exceptions: {} },
  };
}
function expense(amountCents: number): PlanNode {
  return {
    id: 'exp', type: 'expense', label: 'Bill', name: 'Bill', position: { x: 0, y: 0 },
    amountCents,
    recurrence: { frequency: { kind: 'monthly', dayOfMonth: 15 }, businessDay: 'following', exceptions: {} },
  };
}

describe('edge cases', () => {
  it('zero starting balance: forecast runs, safe-to-spend goes negative by the buffer', () => {
    const g: PlanGraph = { nodes: [bal(0), income(200000)], edges: [] };
    expect(validateGraph(g).valid).toBe(true);
    const r = forecast(g, DEFAULT_ASSUMPTIONS);
    expect(r.ledger).toHaveLength(90);
    expect(r.safeToSpendCents).toBe(-DEFAULT_ASSUMPTIONS.safetyBufferCents);
    expect(r.pinchPoint.balanceCents).toBe(0);
  });

  it('negative starting balance: forecast runs, day 0 is the first negative date', () => {
    const g: PlanGraph = { nodes: [bal(-50000), income(200000)], edges: [] };
    expect(validateGraph(g).valid).toBe(true);
    const r = forecast(g, DEFAULT_ASSUMPTIONS);
    expect(r.pinchPoint.balanceCents).toBe(-50000);
    expect(r.firstNegativeDate).toBe(r.ledger[0].date);
  });

  it('no income nodes: forecast runs (a spend-down plan is legitimate)', () => {
    const g: PlanGraph = { nodes: [bal(100000), expense(50000)], edges: [] };
    const v = validateGraph(g);
    expect(v.valid).toBe(true);
    const r = forecast(g, DEFAULT_ASSUMPTIONS);
    expect(r.ledger[r.ledger.length - 1].balanceCents).toBeLessThan(100000);
    expect(r.pinchPoint.drivers.length).toBeGreaterThan(0);
  });

  it('no expense nodes: forecast runs, balance only grows', () => {
    const g: PlanGraph = { nodes: [bal(100000), income(200000)], edges: [] };
    expect(validateGraph(g).valid).toBe(true);
    const r = forecast(g, DEFAULT_ASSUMPTIONS);
    expect(r.safeToSpendCents).toBe(100000 - DEFAULT_ASSUMPTIONS.safetyBufferCents);
  });

  it('extreme values ($999,999,999): no overflow, no NaN', () => {
    const g: PlanGraph = { nodes: [bal(99999999900), income(99999999900), expense(100)], edges: [] };
    expect(validateGraph(g).valid).toBe(true);
    const r = forecast(g, DEFAULT_ASSUMPTIONS);
    for (const d of r.ledger) {
      expect(Number.isFinite(d.balanceCents)).toBe(true);
    }
    expect(r.pinchPoint.balanceCents).toBe(99999999800);
  });

  it('invalid as-of date: clear validation error naming the node and field', () => {
    const g: PlanGraph = { nodes: [bal(100000, 'not-a-date'), expense(50000)], edges: [] };
    const v = validateGraph(g);
    expect(v.valid).toBe(false);
    expect(v.errors).toHaveLength(1);
    expect(v.errors[0].nodeId).toBe('bal');
    expect(v.errors[0].message).toContain('invalid as-of date');
    expect(v.errors[0].message).toContain('not-a-date');
  });

  it('invalid recurrence anchor and goal target date are flagged', () => {
    const badIncome: PlanNode = {
      id: 'inc2', type: 'income', label: 'Gig', name: 'Gig', position: { x: 0, y: 0 },
      amountCents: 50000,
      recurrence: { frequency: { kind: 'weekly', anchor: '2023-02-30' as ISODate }, businessDay: 'none', exceptions: {} },
    };
    const badGoal: PlanNode = {
      id: 'goal', type: 'goal', label: 'Save', name: 'Save', position: { x: 0, y: 0 },
      targetCents: 1000000, targetDate: 'tomorrow' as ISODate,
    };
    const g: PlanGraph = { nodes: [bal(100000), badIncome, badGoal], edges: [] };
    const v = validateGraph(g);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.nodeId === 'inc2' && e.message.includes('anchor date'))).toBe(true);
    expect(v.errors.some((e) => e.nodeId === 'goal' && e.message.includes('target date'))).toBe(true);
  });

  it('empty graph: tells the user to add a starting-balance node', () => {
    const v = validateGraph({ nodes: [], edges: [] });
    expect(v.valid).toBe(false);
    expect(v.errors[0].message).toContain('starting-balance');
  });
});
