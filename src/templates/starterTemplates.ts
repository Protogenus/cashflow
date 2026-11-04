/**
 * templates/starterTemplates.ts — the 3 starter templates (DESIGN.md §7).
 *
 * Each template is a REAL, fully-wired graph: one starting-balance node,
 * realistic incomes/expenses/goals, splits that sum to 100, and edges with
 * no cycles or duplicates. Dates anchor relative to today so the forecast
 * works the moment the template loads. Nothing here is placeholder data —
 * these are editable starting points, labeled as such in the UI.
 */
import {
  addDays,
  addMonthsClamped,
  formatISODate,
  parseISODate,
  toLocalDate,
  todayISO,
} from '../engine/dates';
import type {
  ExpenseNode,
  GoalNode,
  IncomeNode,
  ISODate,
  NodeId,
  PercentageSplitNode,
  PlanEdge,
  PlanGraph,
  PlanNode,
  StartingBalanceNode,
  VariableAmountNode,
  DebtNode,
} from '../engine/types';

export interface StarterTemplate {
  id: 'renter' | 'couple' | 'freelancer';
  title: string;
  /** One-line description for the picker. */
  description: string;
  build: () => PlanGraph;
}

let counter = 0;
function nid(prefix: string): NodeId {
  counter += 1;
  return `tpl_${prefix}_${counter}`;
}

/** Most recent Friday on or before today (local). */
function lastFriday(): ISODate {
  let d = toLocalDate(parseISODate(todayISO()));
  while (d.getDay() !== 5) d = addDays(d, -1);
  return formatISODate(d);
}

function monthsOut(n: number): ISODate {
  return formatISODate(addMonthsClamped(toLocalDate(parseISODate(todayISO())), n));
}

/**
 * The next `count` estimated-tax due dates after today:
 * Apr 15, Jun 15, Sep 15, Jan 15 (US individual estimated tax).
 */
export function nextQuarterlyDueDates(from: ISODate, count: number): ISODate[] {
  const out: ISODate[] = [];
  const { y } = parseISODate(from);
  const cands: [number, number][] = [
    [1, 15],
    [4, 15],
    [6, 15],
    [9, 15],
  ];
  for (let year = y; out.length < count && year <= y + 2; year += 1) {
    for (const [m, d] of cands) {
      const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` as ISODate;
      if (iso > from) out.push(iso);
      if (out.length === count) break;
    }
  }
  return out;
}

// ---------- node factories ----------

function bal(label: string, balanceCents: number, x: number, y: number): StartingBalanceNode {
  return {
    id: nid('bal'), type: 'startingBalance', label, position: { x, y },
    balanceCents, asOf: todayISO(),
  };
}

function inc(
  name: string, amountCents: number,
  frequency: IncomeNode['recurrence']['frequency'],
  x: number, y: number,
): IncomeNode {
  return {
    id: nid('inc'), type: 'income', label: name, name, position: { x, y },
    amountCents, recurrence: { frequency, businessDay: 'preceding', exceptions: {} },
  };
}

function exp(
  name: string, amountCents: number,
  frequency: ExpenseNode['recurrence']['frequency'],
  x: number, y: number,
): ExpenseNode {
  return {
    id: nid('exp'), type: 'expense', label: name, name, position: { x, y },
    amountCents, recurrence: { frequency, businessDay: 'following', exceptions: {} },
  };
}

function varBill(
  name: string, minCents: number, typicalCents: number, maxCents: number,
  frequency: VariableAmountNode['recurrence']['frequency'],
  x: number, y: number,
  direction: 'income' | 'expense' = 'expense',
): VariableAmountNode {
  return {
    id: nid('var'), type: 'variableAmount', label: name, name, position: { x, y },
    minCents, typicalCents, maxCents, direction,
    recurrence: {
      frequency,
      businessDay: direction === 'income' ? 'preceding' : 'following',
      exceptions: {},
    },
  };
}

function split(
  label: string, outputs: { id: string; label: string; percent: number }[],
  x: number, y: number,
): PercentageSplitNode {
  return { id: nid('spl'), type: 'percentageSplit', label, position: { x, y }, outputs };
}

function goalNode(name: string, targetCents: number, targetDate: ISODate, x: number, y: number): GoalNode {
  return {
    id: nid('goal'), type: 'goal', label: name, name, position: { x, y },
    targetCents, targetDate,
  };
}

function debtNode(
  name: string, balanceCents: number, aprBps: number, minPaymentCents: number,
  x: number, y: number,
): DebtNode {
  return {
    id: nid('debt'), type: 'debt', label: name, name, position: { x, y },
    balanceCents, aprBps, minPaymentCents,
  };
}

function edge(source: NodeId, sourceHandle: string, target: NodeId): PlanEdge {
  return { id: nid('e'), source, sourceHandle, target, targetHandle: 'in' };
}

const M = (day: number) => ({ kind: 'monthly' as const, dayOfMonth: day });
const BW = () => ({ kind: 'biweekly' as const, anchor: lastFriday() });

// ---------- template (a): single-income renter ----------

function buildRenter(): PlanGraph {
  const checking = bal('Checking account', 185000, 40, 40);
  const pay = inc('Paycheck', 192000, BW(), 40, 240);
  const paycheckSplit = split('Paycheck split', [
    { id: 'bills', label: 'Bills', percent: 75 },
    { id: 'savings', label: 'Savings', percent: 25 },
  ], 380, 240);
  const rent = exp('Rent', 140000, M(1), 720, 60);
  const electric = varBill('Electric', 9000, 14000, 21000, M(15), 720, 240);
  const internet = exp('Internet', 7900, M(20), 720, 420);
  const streaming = exp('Video streaming', 1699, M(12), 720, 560);
  const emergency = goalNode('Emergency fund', 300000, monthsOut(6), 1080, 240);

  const nodes: PlanNode[] = [checking, pay, paycheckSplit, rent, electric, internet, streaming, emergency];
  const edges: PlanEdge[] = [
    edge(pay.id, 'out', paycheckSplit.id),
    edge(paycheckSplit.id, 'bills', rent.id),
    edge(paycheckSplit.id, 'bills', electric.id),
    edge(paycheckSplit.id, 'bills', internet.id),
    edge(paycheckSplit.id, 'bills', streaming.id),
    edge(paycheckSplit.id, 'savings', emergency.id),
  ];
  return { nodes, edges };
}

// ---------- template (b): couple with car loan ----------

function buildCouple(): PlanGraph {
  const checking = bal('Checking account', 320000, 40, 40);
  const salaryA = inc('Salary (Alex)', 275000, BW(), 40, 240);
  const salaryB = inc('Salary (Sam)', 210000, { kind: 'semimonthly', days: [5, 20] }, 40, 440);
  const incomeSplit = split('Income split', [
    { id: 'bills', label: 'Bills', percent: 80 },
    { id: 'savings', label: 'Savings', percent: 12 },
    { id: 'extraDebt', label: 'Extra debt', percent: 8 },
  ], 380, 300);
  const rent = exp('Rent', 165000, M(1), 720, 60);
  const carPayment = exp('Car payment', 31000, M(10), 720, 220);
  const insurance = exp('Car insurance', 14500, M(18), 720, 380);
  const groceries = varBill('Groceries', 38000, 52000, 70000, M(1), 720, 540);
  const carLoan = debtNode('Car loan', 1420000, 790, 31000, 1080, 380);
  const emergency = goalNode('Emergency fund', 500000, monthsOut(9), 1080, 180);

  const nodes: PlanNode[] = [
    checking, salaryA, salaryB, incomeSplit,
    rent, carPayment, insurance, groceries, carLoan, emergency,
  ];
  const edges: PlanEdge[] = [
    edge(salaryA.id, 'out', incomeSplit.id),
    edge(salaryB.id, 'out', incomeSplit.id),
    edge(incomeSplit.id, 'bills', rent.id),
    edge(incomeSplit.id, 'bills', carPayment.id),
    edge(incomeSplit.id, 'bills', insurance.id),
    edge(incomeSplit.id, 'bills', groceries.id),
    edge(incomeSplit.id, 'savings', emergency.id),
    edge(incomeSplit.id, 'extraDebt', carLoan.id),
  ];
  return { nodes, edges };
}

// ---------- template (c): variable-income freelancer ----------

function buildFreelancer(): PlanGraph {
  const today = todayISO();
  const [taxQ1, taxQ2] = nextQuarterlyDueDates(today, 2);

  const checking = bal('Checking account', 450000, 40, 40);
  const retainer = inc('Retainer', 150000, M(1), 40, 240);
  const client = varBill('Client income', 200000, 420000, 750000, M(15), 40, 440, 'income');
  // A variable node used as income: monthly typical draw, sampled in Monte Carlo.
  const incomeSplit = split('Income split', [
    { id: 'bills', label: 'Bills', percent: 70 },
    { id: 'tax', label: 'Tax reserve', percent: 20 },
    { id: 'buffer', label: 'Buffer', percent: 10 },
  ], 380, 300);
  const rent = exp('Rent', 155000, M(1), 720, 60);
  const utilities = varBill('Utilities', 11000, 16000, 24000, M(12), 720, 220);
  const tax1 = exp('Estimated tax', 180000, { kind: 'once', date: taxQ1 }, 720, 380);
  const tax2 = exp('Estimated tax (next)', 180000, { kind: 'once', date: taxQ2 }, 720, 540);
  const taxGoal = goalNode('Tax reserve', 720000, monthsOut(6), 1080, 220);
  const bufferGoal = goalNode('Buffer savings', 200000, monthsOut(3), 1080, 420);

  const nodes: PlanNode[] = [
    checking, retainer, client, incomeSplit,
    rent, utilities, tax1, tax2, taxGoal, bufferGoal,
  ];
  const edges: PlanEdge[] = [
    edge(retainer.id, 'out', incomeSplit.id),
    edge(client.id, 'out', incomeSplit.id),
    edge(incomeSplit.id, 'bills', rent.id),
    edge(incomeSplit.id, 'bills', utilities.id),
    edge(incomeSplit.id, 'bills', tax1.id),
    edge(incomeSplit.id, 'bills', tax2.id),
    edge(incomeSplit.id, 'tax', taxGoal.id),
    edge(incomeSplit.id, 'buffer', bufferGoal.id),
  ];
  return { nodes, edges };
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'renter',
    title: 'Single-income renter',
    description: 'Bi-weekly paycheck with a savings split, rent, variable electric, and subscriptions.',
    build: buildRenter,
  },
  {
    id: 'couple',
    title: 'Couple with car loan',
    description: 'Two incomes (bi-weekly + semi-monthly), rent, car payment and loan, insurance, groceries.',
    build: buildCouple,
  },
  {
    id: 'freelancer',
    title: 'Variable-income freelancer',
    description: 'Retainer plus irregular client income, quarterly estimated taxes, and savings buffers.',
    build: buildFreelancer,
  },
];

export function getTemplate(id: StarterTemplate['id']): StarterTemplate {
  const t = STARTER_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}

export interface OnboardingAnswers {
  balanceCents: number;
  payAmountCents: number;
  payDate: ISODate;
  payFreq: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  billName: string;
  billAmountCents: number;
  billDayOfMonth: number; // 1..28
}

/**
 * Build the onboarding graph: starting balance + paycheck + biggest bill,
 * fully wired as independent emitters (no edges needed — the forecast sums
 * every income/expense node). Positions keep the three cards readable.
 */
export function buildOnboardingGraph(a: OnboardingAnswers): PlanGraph {
  const checking = bal('Checking account', a.balanceCents, 40, 40);

  const frequency = (() => {
    switch (a.payFreq) {
      case 'weekly':
        return { kind: 'weekly' as const, anchor: a.payDate };
      case 'biweekly':
        return { kind: 'biweekly' as const, anchor: a.payDate };
      case 'semimonthly':
        return { kind: 'semimonthly' as const, days: [1, 15] as [number, number] };
      case 'monthly':
        return { kind: 'monthly' as const, dayOfMonth: parseISODate(a.payDate).d };
    }
  })();
  const pay = inc('Paycheck', a.payAmountCents, frequency, 40, 260);

  const bill = exp(a.billName, a.billAmountCents, M(a.billDayOfMonth), 400, 260);

  return { nodes: [checking, pay, bill], edges: [] };
}
