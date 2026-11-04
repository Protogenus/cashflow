import { describe, expect, it } from 'vitest';
import { flowFrames } from './flow';
import { DEFAULT_ASSUMPTIONS } from './types';
import type {
  Assumptions,
  ISODate,
  PlanEdge,
  PlanGraph,
  PlanNode,
} from './types';

const START: ISODate = '2026-11-03'; // a Tuesday

function balance(id: string, cents: number): PlanNode {
  return { id, type: 'startingBalance', label: 'Checking', position: { x: 0, y: 0 }, balanceCents: cents, asOf: START };
}

function income(id: string, name: string, cents: number, date: ISODate): PlanNode {
  return {
    id, type: 'income', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents, recurrence: { frequency: { kind: 'once', date }, businessDay: 'preceding', exceptions: {} },
  };
}

function expense(id: string, name: string, cents: number, date: ISODate): PlanNode {
  return {
    id, type: 'expense', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents, recurrence: { frequency: { kind: 'once', date }, businessDay: 'following', exceptions: {} },
  };
}

function split(id: string): PlanNode {
  return {
    id, type: 'percentageSplit', label: 'Paycheck split', position: { x: 0, y: 0 },
    outputs: [
      { id: 'bills', label: 'Bills', percent: 80 },
      { id: 'save', label: 'Savings', percent: 20 },
    ],
  };
}

function goal(id: string, name: string): PlanNode {
  return {
    id, type: 'goal', label: name, position: { x: 0, y: 0 }, name,
    targetCents: 100000, targetDate: '2027-06-01',
  };
}

function edge(id: string, source: string, target: string, sourceHandle = 'out'): PlanEdge {
  return { id, source, target, sourceHandle, targetHandle: 'in' };
}

function graph(nodes: PlanNode[], edges: PlanEdge[] = []): PlanGraph {
  return { nodes, edges };
}

function assumptions(overrides: Partial<Assumptions> = {}): Assumptions {
  return { ...DEFAULT_ASSUMPTIONS, ...overrides, horizonDays: 10 };
}

const OPTS = { windowDays: 5, startDate: '2026-11-03' as ISODate };

describe('flowFrames', () => {
  it('emits one frame per day with the running balance', () => {
    const frames = flowFrames(
      graph([balance('bal', 100000), income('pay', 'Paycheck', 185000, '2026-11-05')]),
      assumptions(),
      OPTS,
    );
    expect(frames).toHaveLength(5);
    expect(frames[0].balanceCents).toBe(100000);
    // Payday is day index 2 (Nov 5): balance jumps, pulse fires.
    expect(frames[2].balanceCents).toBe(285000);
    expect(frames[2].pulses).toEqual([
      { nodeId: 'bal', amountCents: 285000, kind: 'balance' },
      { nodeId: 'pay', amountCents: 185000, kind: 'income' },
    ]);
    expect(frames[2].summary).toMatch(/Paycheck/);
  });

  it('turns a percentage-split payday into edge transfers with shares', () => {
    const g = graph(
      [balance('bal', 100000), income('pay', 'Paycheck', 185000, '2026-11-05'), split('s'), goal('g', 'Savings')],
      [edge('e1', 'pay', 's'), edge('e2', 's', 'g', 'save')],
    );
    const frames = flowFrames(g, assumptions(), OPTS);
    const payday = frames[2];
    const byLabel = new Map(payday.transfers.map((t) => [t.label, t]));
    // Income → split carries the full paycheck.
    expect(byLabel.get('Paycheck → Paycheck split')?.amountCents).toBe(185000);
    expect(byLabel.get('Paycheck → Paycheck split')?.edgeIds).toEqual(['e1']);
    // 20% output routes to the goal through its wired edge.
    const toGoal = byLabel.get('20% → Savings');
    expect(toGoal?.amountCents).toBe(37000);
    expect(toGoal?.edgeIds).toEqual(['e2']);
    // 80% output has no wired edge: kept in balance, noted on the split pulse.
    const splitPulse = payday.pulses.find((p) => p.nodeId === 's' && p.kind === 'split');
    expect(splitPulse?.kind).toBe('split');
    expect(splitPulse?.amountCents).toBe(148000);
    expect(splitPulse?.note).toMatch(/kept in balance/);
    // Outflow chips: money visibly leaves the paycheck and the split node.
    const payOut = payday.pulses.find((p) => p.nodeId === 'pay' && p.kind === 'outflow');
    expect(payOut?.amountCents).toBe(-185000);
    expect(payOut?.note).toBe('→ Paycheck split');
    const splitOut = payday.pulses.find((p) => p.nodeId === 's' && p.kind === 'outflow');
    expect(splitOut?.amountCents).toBe(-37000);
    expect(splitOut?.note).toBe('→ Savings');
    expect(payday.summary).toMatch(/20% \(\$370\) → Savings/);
    expect(payday.summary).toMatch(/\$1,480 kept in balance/);
  });

  it('follows drawn branches into a wired bill instead of a virtual route', () => {
    const frames = flowFrames(
      graph(
        [balance('bal', 100000), split('s'), expense('util', 'Electric', 21000, '2026-11-05')],
        [edge('e9', 's', 'util', 'bills')],
      ),
      assumptions(),
      OPTS,
    );
    // The payment travels the user's drawn split → bill edge.
    expect(frames[2].transfers).toEqual([
      {
        fromId: 's',
        toId: 'util',
        edgeIds: ['e9'],
        amountCents: 21000,
        label: 'Electric',
      },
    ]);
    const out = frames[2].pulses.find((p) => p.kind === 'outflow');
    expect(out).toEqual({ nodeId: 's', amountCents: -21000, kind: 'outflow', note: '→ Electric' });
  });

  it('pulses expenses with negative amounts', () => {

    const frames = flowFrames(
      graph([balance('bal', 100000), expense('rent', 'Rent', 140000, '2026-11-05')]),
      assumptions(),
      OPTS,
    );
    expect(frames[2].pulses).toEqual([
      { nodeId: 'bal', amountCents: -40000, kind: 'balance' },
      { nodeId: 'rent', amountCents: -140000, kind: 'expense' },
      { nodeId: 'bal', amountCents: -140000, kind: 'outflow', note: '→ Rent' },
    ]);
    expect(frames[2].summary).toMatch(/Rent/);
    // The bill payment is a virtual transfer: balance → bill, no drawn edge.
    expect(frames[2].transfers).toEqual([
      {
        fromId: 'bal',
        toId: 'rent',
        edgeIds: [],
        amountCents: 140000,
        label: 'Rent',
      },
    ]);
  });

  it('reports quiet days honestly', () => {
    const frames = flowFrames(
      graph([balance('bal', 100000)]),
      assumptions(),
      { windowDays: 3 },
    );
    expect(frames[0].transfers).toEqual([]);
    expect(frames[0].pulses).toEqual([
      { nodeId: 'bal', amountCents: 100000, kind: 'balance' },
    ]);
    expect(frames[0].summary).toMatch(/no money moved/);
  });

  it('throws on an invalid graph instead of inventing frames', () => {
    // No starting balance: forecast validation fails.
    expect(() =>
      flowFrames(graph([income('pay', 'Paycheck', 100, '2026-11-05')]), assumptions()),
    ).toThrow(/invalid graph/);
  });

  it('caps the window at the horizon', () => {
    const frames = flowFrames(graph([balance('bal', 1)]), assumptions(), { windowDays: 500 });
    expect(frames.length).toBeLessThanOrEqual(10);
  });
});
