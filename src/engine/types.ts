/**
 * types.ts — engine data model (pure TypeScript, no framework imports).
 *
 * Canonical graph model per ARCHITECTURE.md §3. This is the source of truth;
 * the React Flow canvas derives its view-model from these types, never the
 * other way around. Money is integer cents everywhere; dates are ISODate
 * strings ("YYYY-MM-DD") interpreted as LOCAL wall-clock, never UTC-shifted.
 */

// ---------- primitives ----------
export type NodeId = string;
export type ISODate = string; // YYYY-MM-DD, local wall-clock
export type Cents = number; // integer cents; never fractional

export type Frequency =
  | { kind: 'weekly'; anchor: ISODate }
  | { kind: 'biweekly'; anchor: ISODate } // every 14 days from anchor; ~26/yr
  | { kind: 'semimonthly'; days: [number, number] } // e.g. [1, 15]; 24/yr
  | { kind: 'monthly'; dayOfMonth: number | 'last' } // 31st clamps to last day (DECISIONS.md)
  | { kind: 'once'; date: ISODate };

export type BusinessDay = 'preceding' | 'following' | 'none';

export interface Recurrence {
  frequency: Frequency;
  /** ISDA vocabulary. Defaults: income → 'preceding', expenses → 'following'. */
  businessDay: BusinessDay;
  endDate?: ISODate;
  /** Keyed by the ORIGINAL occurrence date (iCalendar RECURRENCE-ID pattern). */
  exceptions: Record<ISODate, { newDate?: ISODate; newAmountCents?: Cents; skipped?: boolean }>;
}

// ---------- nodes ----------
export type NodeType =
  | 'startingBalance'
  | 'income'
  | 'expense'
  | 'variableAmount'
  | 'percentageSplit'
  | 'prioritySplit'
  | 'conditional'
  | 'goal'
  | 'debt';

export interface BaseNode {
  id: NodeId;
  type: NodeType;
  label: string;
  position: { x: number; y: number };
}

export interface StartingBalanceNode extends BaseNode {
  type: 'startingBalance';
  balanceCents: Cents;
  asOf: ISODate;
}

export interface IncomeNode extends BaseNode {
  type: 'income';
  name: string;
  amountCents: Cents;
  recurrence: Recurrence;
}

export interface ExpenseNode extends BaseNode {
  type: 'expense';
  name: string;
  amountCents: Cents;
  recurrence: Recurrence;
  category?: string;
}

export interface VariableAmountNode extends BaseNode {
  type: 'variableAmount';
  name: string;
  minCents: Cents;
  typicalCents: Cents;
  maxCents: Cents;
  recurrence: Recurrence;
  /**
   * Money direction. 'expense' (the default when absent) behaves exactly as
   * before — the node emits outflows. 'income' makes it emit inflows
   * (typical value in the deterministic forecast, triangular sampling in
   * Monte Carlo): the irregular-income case (freelancers). Direction flows
   * through event generation, split routing, the optimizer, and Monte Carlo
   * via isIncomeSource().
   */
  direction?: 'income' | 'expense';
}

/**
 * Money-in sources: fixed income nodes plus income-direction variable
 * nodes. Pure; used everywhere the engine must treat a node as income.
 */
export function isIncomeSource(node: PlanNode): node is IncomeNode | VariableAmountNode {
  return node.type === 'income' || (node.type === 'variableAmount' && node.direction === 'income');
}

export interface PercentageSplitNode extends BaseNode {
  type: 'percentageSplit';
  /** Outputs must sum to 100. Each output id maps to a React Flow source handle. */
  outputs: { id: string; label: string; percent: number }[];
}

export interface PrioritySplitNode extends BaseNode {
  type: 'prioritySplit';
  outputs: { id: string; label: string; priority: number; capCents?: Cents }[];
}

export interface ConditionalNode extends BaseNode {
  type: 'conditional';
  predicate: { op: 'gt' | 'lt'; thresholdCents: Cents }; // "if balance > X"
  trueLabel: string;
  falseLabel: string;
}

export interface GoalNode extends BaseNode {
  type: 'goal';
  name: string;
  targetCents: Cents;
  targetDate: ISODate;
}

export interface DebtNode extends BaseNode {
  type: 'debt';
  name: string;
  balanceCents: Cents;
  /** Annual percentage rate in basis points, e.g. 1999 = 19.99%. */
  aprBps: number;
  minPaymentCents: Cents;
}

export type PlanNode =
  | StartingBalanceNode
  | IncomeNode
  | ExpenseNode
  | VariableAmountNode
  | PercentageSplitNode
  | PrioritySplitNode
  | ConditionalNode
  | GoalNode
  | DebtNode;

// ---------- graph ----------
export interface PlanEdge {
  id: string;
  source: NodeId;
  sourceHandle: string;
  target: NodeId;
  targetHandle: string;
}

export interface PlanGraph {
  nodes: PlanNode[];
  edges: PlanEdge[];
}

// ---------- scenarios / alerts / settings ----------
export interface Scenario {
  id: string;
  name: string;
  graph: PlanGraph;
  /** Node ids excluded from this scenario's forecast (per-scenario on/off toggles). */
  disabledNodeIds: NodeId[];
  isBaseline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  kind: 'belowZero' | 'pinchPoint' | 'goalAtRisk' | 'debtPayoffChanged';
  scenarioId: string;
  message: string;
  date: ISODate;
  acknowledged: boolean;
}

export interface Assumptions {
  horizonDays: number; // default 90
  sameDayOrder: 'incomeFirst'; // income before expenses on the same day
  monthEndConvention: 'clampToLastDay'; // DECISIONS.md: Jan 31 -> Feb 28, never skip
  variableDistribution: 'triangular'; // min/typical/max sampling (Monte Carlo)
  mcTrials: number; // default 2000
  mcSeed: number; // displayed; reproducibility
  shocks: ShockEvent[];
  optimizerStep: 5; // 5% steps (DECISIONS.md)
  currency: string; // single currency in v1 (e.g. 'USD')
  /** Safety buffer subtracted from the minimum balance for "safe to spend". */
  safetyBufferCents: Cents; // default 50000 ($500)
}

export interface ShockEvent {
  id: string;
  name: string;
  amountCents: Cents;
  windowDays: [number, number]; // e.g. [0, 90]
  probability: number; // per-trial occurrence probability
  enabled: boolean;
  /**
   * 'oneTime': a one-time expense on a date (e.g. $600 car repair).
   * 'missedPaycheck': skip one occurrence of an income node.
   * Default 'oneTime'.
   */
  kind?: 'oneTime' | 'missedPaycheck';
  /** Fixed date for oneTime shocks (default: a random day inside windowDays). */
  date?: ISODate;
  /** Income node to skip one occurrence of (missedPaycheck only). */
  incomeNodeId?: NodeId;
}

// ---------- engine outputs ----------
export interface LedgerEvent {
  nodeId: NodeId;
  name: string;
  amountCents: Cents; // signed: + for money in, − for money out
  kind: 'income' | 'expense' | 'transfer';
}

export interface LedgerDay {
  date: ISODate;
  /** End-of-day balance after applying the day's events. */
  balanceCents: Cents;
  events: LedgerEvent[];
}

export interface Driver {
  nodeId: NodeId;
  name: string;
  /** Signed cents; outflows that drove the pinch are negative. */
  contributionCents: Cents;
}

export interface PinchPoint {
  date: ISODate;
  balanceCents: Cents;
  drivers: Driver[];
}

export interface ForecastResult {
  ledger: LedgerDay[];
  pinchPoint: PinchPoint;
  firstNegativeDate: ISODate | null;
  /** Minimum end-of-day balance minus the safety buffer (raw; may be negative). */
  safeToSpendCents: Cents;
  /** Ties the result to the exact graph + assumptions that produced it. */
  assumptionsHash: string;
  /** Per-goal accumulation from split-routed / directly-wired income. */
  goals: GoalProgress[];
  /** Per-debt extra payments from split-routed / directly-wired income. */
  debts: DebtProgress[];
}

/** How a savings goal fared over the horizon (see allocation semantics below). */
export interface GoalProgress {
  nodeId: NodeId;
  name: string;
  targetCents: Cents;
  targetDate: ISODate;
  /** Total routed into the goal over the horizon. */
  savedCents: Cents;
  /** First date savedCents reached the target (null when never). */
  hitDate: ISODate | null;
  /** max(0, target − saved on min(targetDate, horizon end)). */
  shortfallAtTargetCents: Cents;
}

/** Extra principal payments a debt node received over the horizon. */
export interface DebtProgress {
  nodeId: NodeId;
  name: string;
  /** Total routed into the debt above any minimum payment. */
  extraPaidCents: Cents;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  horizonDays: 90,
  sameDayOrder: 'incomeFirst',
  monthEndConvention: 'clampToLastDay',
  variableDistribution: 'triangular',
  mcTrials: 2000,
  mcSeed: 20261103,
  shocks: [],
  optimizerStep: 5,
  currency: 'USD',
  safetyBufferCents: 50000,
};
