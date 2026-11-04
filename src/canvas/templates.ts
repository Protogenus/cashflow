/**
 * canvas/templates.ts — the sample starter graph and the palette node factory.
 * The starter graph is the milestone-2/3 demo surface: a single-income renter
 * (balance, bi-weekly paycheck, monthly rent, variable electric, a paycheck
 * split). Nothing here is presented as the user's data — it's the editable
 * starting point the brief asks the canvas to render.
 */
import { todayISO, toLocalDate, parseISODate, formatISODate, addDays } from '../engine/dates';
import type {
  ISODate,
  NodeId,
  NodeType,
  PlanEdge,
  PlanNode,
} from '../engine/types';

export const NODE_META: Record<NodeType, { title: string; blurb: string }> = {
  startingBalance: { title: 'Starting balance', blurb: 'What your account shows today' },
  income: { title: 'Income', blurb: 'Paycheck or other money in, on a schedule' },
  expense: { title: 'Expense', blurb: 'A bill: amount, due date, frequency' },
  variableAmount: { title: 'Variable bill', blurb: 'Min / typical / max instead of one number' },
  percentageSplit: { title: 'Percentage split', blurb: 'Divide money by fixed percentages' },
  prioritySplit: { title: 'Priority split', blurb: 'Fill buckets in priority order' },
  conditional: { title: 'Conditional', blurb: 'Route money on "if balance > X"' },
  goal: { title: 'Savings goal', blurb: 'A target amount by a date' },
  debt: { title: 'Debt', blurb: 'Balance, APR, minimum payment' },
};

function nid(prefix: string): NodeId {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/** Most recent Friday on or before today (local). */
function lastFriday(): ISODate {
  let d = toLocalDate(parseISODate(todayISO()));
  while (d.getDay() !== 5) d = addDays(d, -1);
  return formatISODate(d);
}

export function createStarterGraph(): { nodes: PlanNode[]; edges: PlanEdge[] } {
  const today = todayISO();
  const bal: PlanNode = {
    id: nid('bal'), type: 'startingBalance', label: 'Checking account',
    position: { x: 40, y: 40 }, balanceCents: 250000, asOf: today,
  };
  const pay: PlanNode = {
    id: nid('pay'), type: 'income', label: 'Paycheck', name: 'Paycheck',
    position: { x: 40, y: 220 }, amountCents: 185000,
    recurrence: {
      frequency: { kind: 'biweekly', anchor: lastFriday() },
      businessDay: 'preceding', exceptions: {},
    },
  };
  const split: PlanNode = {
    id: nid('split'), type: 'percentageSplit', label: 'Paycheck split',
    position: { x: 360, y: 220 },
    outputs: [
      { id: 'bills', label: 'Bills', percent: 80 },
      { id: 'savings', label: 'Savings', percent: 20 },
    ],
  };
  const rent: PlanNode = {
    id: nid('rent'), type: 'expense', label: 'Rent', name: 'Rent',
    position: { x: 680, y: 120 }, amountCents: 140000,
    recurrence: {
      frequency: { kind: 'monthly', dayOfMonth: 1 },
      businessDay: 'following', exceptions: {},
    },
  };
  const elec: PlanNode = {
    id: nid('elec'), type: 'variableAmount', label: 'Electric', name: 'Electric bill',
    position: { x: 680, y: 330 },
    minCents: 8000, typicalCents: 14000, maxCents: 22000,
    recurrence: {
      frequency: { kind: 'monthly', dayOfMonth: 15 },
      businessDay: 'following', exceptions: {},
    },
  };
  const nodes = [bal, pay, split, rent, elec];
  const edges: PlanEdge[] = [
    { id: nid('e'), source: pay.id, sourceHandle: 'out', target: split.id, targetHandle: 'in' },
    { id: nid('e'), source: split.id, sourceHandle: 'bills', target: rent.id, targetHandle: 'in' },
    { id: nid('e'), source: split.id, sourceHandle: 'bills', target: elec.id, targetHandle: 'in' },
  ];
  return { nodes, edges };
}

/** Defaults for a node dropped from the palette (user edits immediately). */
export function createNode(type: NodeType, position: { x: number; y: number }): PlanNode {
  const today = todayISO();
  const label = NODE_META[type].title;
  const id = nid(type.slice(0, 4));
  const base = { id, type, label, position } as const;

  switch (type) {
    case 'startingBalance':
      return { ...base, type, balanceCents: 0, asOf: today };
    case 'income':
      return {
        ...base, type, name: label, amountCents: 100000,
        recurrence: {
          frequency: { kind: 'biweekly', anchor: lastFriday() },
          businessDay: 'preceding', exceptions: {},
        },
      };
    case 'expense':
      return {
        ...base, type, name: label, amountCents: 10000,
        recurrence: {
          frequency: { kind: 'monthly', dayOfMonth: parseISODate(today).d },
          businessDay: 'following', exceptions: {},
        },
      };
    case 'variableAmount':
      return {
        ...base, type, name: label, minCents: 5000, typicalCents: 10000, maxCents: 15000,
        recurrence: {
          frequency: { kind: 'monthly', dayOfMonth: parseISODate(today).d },
          businessDay: 'following', exceptions: {},
        },
      };
    case 'percentageSplit':
      return {
        ...base, type,
        outputs: [
          { id: nid('o'), label: 'First', percent: 50 },
          { id: nid('o'), label: 'Second', percent: 50 },
        ],
      };
    case 'prioritySplit':
      return {
        ...base, type,
        outputs: [
          { id: nid('o'), label: 'First', priority: 1 },
          { id: nid('o'), label: 'Second', priority: 2 },
        ],
      };
    case 'conditional':
      return {
        ...base, type,
        predicate: { op: 'gt', thresholdCents: 50000 },
        trueLabel: 'Above $500', falseLabel: 'At or below $500',
      };
    case 'goal':
      return { ...base, type, name: label, targetCents: 500000, targetDate: today };
    case 'debt':
      return {
        ...base, type, name: label,
        balanceCents: 500000, aprBps: 1999, minPaymentCents: 15000,
      };
  }
}
