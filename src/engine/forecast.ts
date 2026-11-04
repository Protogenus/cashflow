/**
 * forecast.ts — deterministic day-by-day balance forecast (pure, no framework imports).
 *
 * The walk is event-based: income/expense/variableAmount nodes expand their
 * recurrences into dated occurrences; each day applies its events (income
 * before expenses — a visible assumption) to a running balance seeded by the
 * starting-balance node. Logic nodes (splits, conditionals) and goal/debt
 * nodes are validated as part of the graph here; their allocation semantics
 * (optimizer) and payoff projections (debt) build on this walk in later
 * milestones. projectDebtPayoff is already real: a debt node reports an
 * amortized payoff date from its APR and minimum payment.
 */
import { addDays, formatISODate, parseISODate, toLocalDate, todayISO } from './dates';
import { findDrivers } from './explain';
import { expandRecurrence, type Occurrence } from './recurrence';
import type {
  Assumptions,
  Cents,
  DebtNode,
  ForecastResult,
  ISODate,
  LedgerDay,
  LedgerEvent,
  NodeId,
  PercentageSplitNode,
  PlanGraph,
  PlanNode,
} from './types';

// ---------- validation ----------

export interface GraphIssue {
  nodeId?: NodeId;
  message: string;
}

export interface GraphValidation {
  errors: GraphIssue[];
  warnings: GraphIssue[];
  valid: boolean;
}

/** Topological order of node ids (dependencies before dependents). Throws on cycles. */
export function topologicalOrder(graph: PlanGraph): NodeId[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const inDegree = new Map<NodeId, number>();
  const outgoing = new Map<NodeId, NodeId[]>();
  for (const id of ids) {
    inDegree.set(id, 0);
    outgoing.set(id, []);
  }
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue; // dangling edge: ignore for ordering
    outgoing.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }
  const queue: NodeId[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
  const order: NodeId[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id)!) {
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }
  if (order.length !== ids.size) {
    throw new Error('Graph contains a cycle; topological order is undefined.');
  }
  return order;
}

/** Would adding source → target create a cycle? (DFS from target over existing edges.) */
export function wouldCreateCycle(graph: PlanGraph, sourceId: NodeId, targetId: NodeId): boolean {
  const outgoing = new Map<NodeId, NodeId[]>();
  for (const n of graph.nodes) outgoing.set(n.id, []);
  for (const e of graph.edges) outgoing.get(e.source)?.push(e.target);
  // Reachable from target? If source is reachable from target, the new edge closes a loop.
  const seen = new Set<NodeId>([targetId]);
  const stack = [targetId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === sourceId) return true;
    for (const next of outgoing.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

export interface ConnectionCheck {
  ok: boolean;
  reason?: string;
}

/** Canvas calls this in onConnect; rejected drops explain themselves to the user. */
export function validateConnection(
  graph: PlanGraph,
  sourceId: NodeId,
  targetId: NodeId,
): ConnectionCheck {
  const source = graph.nodes.find((n) => n.id === sourceId);
  const target = graph.nodes.find((n) => n.id === targetId);
  if (!source || !target) return { ok: false, reason: 'Unknown node.' };
  if (sourceId === targetId) return { ok: false, reason: 'A node cannot connect to itself.' };
  if (target.type === 'startingBalance') {
    return { ok: false, reason: 'The starting-balance node has no inputs.' };
  }
  if (graph.edges.some((e) => e.source === sourceId && e.target === targetId)) {
    return { ok: false, reason: 'These nodes are already connected.' };
  }
  if (wouldCreateCycle(graph, sourceId, targetId)) {
    return { ok: false, reason: 'This connection would create a cycle.' };
  }
  return { ok: true };
}

/** Non-balance nodes with no edges at all — flagged with a badge, never deleted. */
export function findOrphanedNodes(graph: PlanGraph): PlanNode[] {
  const connected = new Set<NodeId>();
  for (const e of graph.edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  return graph.nodes.filter((n) => n.type !== 'startingBalance' && !connected.has(n.id));
}

export function validateGraph(graph: PlanGraph): GraphValidation {
  const errors: GraphIssue[] = [];
  const warnings: GraphIssue[] = [];

  const balances = graph.nodes.filter((n) => n.type === 'startingBalance');
  if (balances.length === 0) {
    errors.push({ message: 'Add a starting-balance node so the forecast has a day-0 balance.' });
  } else if (balances.length > 1) {
    for (const b of balances) {
      errors.push({ nodeId: b.id, message: 'Only one starting-balance node is allowed.' });
    }
  }

  try {
    topologicalOrder(graph);
  } catch {
    errors.push({ message: 'The graph contains a cycle. Money must flow in one direction.' });
  }

  const seenPairs = new Set<string>();
  for (const e of graph.edges) {
    const key = `${e.source}→${e.target}`;
    if (seenPairs.has(key)) {
      errors.push({ message: `Duplicate connection between two nodes is not allowed.` });
    } else {
      seenPairs.add(key);
    }
    if (!graph.nodes.some((n) => n.id === e.source) || !graph.nodes.some((n) => n.id === e.target)) {
      errors.push({ message: 'An edge references a node that no longer exists.' });
    }
  }

  for (const node of graph.nodes) {
    switch (node.type) {
      case 'variableAmount': {
        const { minCents, typicalCents, maxCents } = node;
        if (!(minCents <= typicalCents && typicalCents <= maxCents)) {
          errors.push({
            nodeId: node.id,
            message: `Variable range must satisfy min ≤ typical ≤ max (got ${minCents} / ${typicalCents} / ${maxCents}).`,
          });
        }
        break;
      }
      case 'percentageSplit': {
        const sum = node.outputs.reduce((s, o) => s + o.percent, 0);
        if (Math.abs(sum - 100) > 1e-9) {
          errors.push({
            nodeId: node.id,
            message: `Split percentages must sum to 100 (currently ${sum}).`,
          });
        }
        break;
      }
      case 'debt': {
        if (node.minPaymentCents < 0 || node.balanceCents < 0) {
          errors.push({ nodeId: node.id, message: 'Debt balance and payment cannot be negative.' });
        }
        break;
      }
      case 'goal': {
        if (node.targetDate < todayISO()) {
          warnings.push({ nodeId: node.id, message: 'Goal target date is in the past.' });
        }
        break;
      }
    }
  }

  for (const orphan of findOrphanedNodes(graph)) {
    warnings.push({
      nodeId: orphan.id,
      message: `"${orphan.label}" isn't connected to anything.`,
    });
  }

  return { errors, warnings, valid: errors.length === 0 };
}

// ---------- forecast ----------

export interface ForecastOptions {
  startDate?: ISODate; // default: today (local)
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Expand every income/expense/variable node into dated occurrences. */
export function generateEvents(
  graph: PlanGraph,
  startISO: ISODate,
  horizonDays: number,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const node of graph.nodes) {
    switch (node.type) {
      case 'income':
        out.push(
          ...expandRecurrence(
            {
              nodeId: node.id,
              name: node.name,
              kind: 'income',
              amountCents: node.amountCents,
              recurrence: node.recurrence,
            },
            startISO,
            horizonDays,
          ),
        );
        break;
      case 'expense':
        out.push(
          ...expandRecurrence(
            {
              nodeId: node.id,
              name: node.name,
              kind: 'expense',
              amountCents: node.amountCents,
              recurrence: node.recurrence,
            },
            startISO,
            horizonDays,
          ),
        );
        break;
      case 'variableAmount':
        // Deterministic mode emits the typical value (ARCHITECTURE.md §2.1).
        out.push(
          ...expandRecurrence(
            {
              nodeId: node.id,
              name: node.name,
              kind: 'expense',
              amountCents: node.typicalCents,
              recurrence: node.recurrence,
            },
            startISO,
            horizonDays,
          ),
        );
        break;
      default:
        break; // logic/goal/debt nodes emit no balance events in the deterministic walk
    }
  }
  return out;
}

/**
 * Day-by-day deterministic forecast. Throws if the graph is invalid
 * (no starting balance, cycles, bad ranges) — the caller surfaces the
 * validation errors from validateGraph instead of a silent wrong chart.
 */
export function forecast(
  graph: PlanGraph,
  assumptions: Assumptions,
  opts: ForecastOptions = {},
): ForecastResult {
  const validation = validateGraph(graph);
  if (!validation.valid) {
    throw new Error(
      `Cannot forecast an invalid graph: ${validation.errors.map((e) => e.message).join(' ')}`,
    );
  }

  const startISO = opts.startDate ?? todayISO();
  const horizonDays = assumptions.horizonDays;
  const balanceNode = graph.nodes.find((n) => n.type === 'startingBalance')!;
  if (balanceNode.type !== 'startingBalance') throw new Error('unreachable');

  const events = generateEvents(graph, startISO, horizonDays);
  const byDate = new Map<ISODate, Occurrence[]>();
  for (const ev of events) {
    const list = byDate.get(ev.date);
    if (list) list.push(ev);
    else byDate.set(ev.date, [ev]);
  }

  const start = toLocalDate(parseISODate(startISO));
  const ledger: LedgerDay[] = [];
  let balance = balanceNode.balanceCents;

  for (let d = 0; d < horizonDays; d++) {
    const date = formatISODate(addDays(start, d));
    const dayEvents = byDate.get(date) ?? [];
    // Income before expenses on the same day (visible, editable assumption).
    const ordered =
      assumptions.sameDayOrder === 'incomeFirst'
        ? [...dayEvents].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'income' ? -1 : 1))
        : dayEvents;
    const ledgerEvents: LedgerEvent[] = [];
    for (const ev of ordered) {
      const signed = ev.kind === 'income' ? ev.amountCents : -ev.amountCents;
      balance += signed;
      ledgerEvents.push({
        nodeId: ev.nodeId,
        name: ev.name,
        amountCents: signed,
        kind: ev.kind,
      });
    }
    ledger.push({ date, balanceCents: balance, events: ledgerEvents });
  }

  // Pinch point: global minimum end-of-day balance (earliest date on ties).
  let pinchIdx = 0;
  for (let i = 1; i < ledger.length; i++) {
    if (ledger[i].balanceCents < ledger[pinchIdx].balanceCents) pinchIdx = i;
  }
  const pinchDay = ledger[pinchIdx];
  const drivers = findDrivers(ledger, pinchDay.date, 7, 4);

  let firstNegativeDate: ISODate | null = null;
  for (const day of ledger) {
    if (day.balanceCents < 0) {
      firstNegativeDate = day.date;
      break;
    }
  }

  const assumptionsHash = fnv1a(JSON.stringify({ graph, assumptions }));

  return {
    ledger,
    pinchPoint: { date: pinchDay.date, balanceCents: pinchDay.balanceCents, drivers },
    firstNegativeDate,
    safeToSpendCents: pinchDay.balanceCents - assumptions.safetyBufferCents,
    assumptionsHash,
  };
}

// ---------- node status / previews (real computed values for canvas cards) ----------

export interface SplitPreviewOutput {
  id: string;
  label: string;
  percent: number;
  /** Sum of directly-connected income node amounts this output is a share of. */
  ofAmountCents: Cents;
  amountCents: Cents;
}

/**
 * Live split amounts for a percentage-split card: each output's share of the
 * income nodes wired directly into the split. Empty when nothing is wired —
 * the card then shows the percentages only (no invented numbers).
 */
export function computeSplitPreview(graph: PlanGraph, splitId: NodeId): SplitPreviewOutput[] {
  const node = graph.nodes.find((n) => n.id === splitId);
  if (!node || node.type !== 'percentageSplit') return [];
  const split = node as PercentageSplitNode;
  const incomingIncome = new Set<NodeId>();
  for (const e of graph.edges) {
    if (e.target === splitId) {
      const src = graph.nodes.find((n) => n.id === e.source);
      if (src?.type === 'income') incomingIncome.add(src.id);
    }
  }
  let ofAmountCents = 0;
  for (const id of incomingIncome) {
    const inc = graph.nodes.find((n) => n.id === id);
    if (inc?.type === 'income') ofAmountCents += inc.amountCents;
  }
  return split.outputs.map((o) => ({
    id: o.id,
    label: o.label,
    percent: o.percent,
    ofAmountCents,
    amountCents: Math.round((ofAmountCents * o.percent) / 100),
  }));
}

export interface DebtPayoff {
  payoffDate: ISODate;
  months: number;
  totalInterestCents: Cents;
}

/**
 * Amortized payoff projection for a debt node: monthly interest at aprBps/12,
 * then the minimum payment, until the balance clears. Returns null when the
 * minimum payment doesn't cover monthly interest (the balance never falls).
 */
export function projectDebtPayoff(debt: DebtNode, fromISO: ISODate = todayISO()): DebtPayoff | null {
  if (debt.balanceCents <= 0) {
    return { payoffDate: fromISO, months: 0, totalInterestCents: 0 };
  }
  const monthlyRate = debt.aprBps / 10000 / 12;
  if (debt.minPaymentCents <= 0) return null;

  let balance = debt.balanceCents;
  let totalInterest = 0;
  let months = 0;
  const MAX_MONTHS = 1200; // 100 years — a guard, not a plan
  while (balance > 0 && months < MAX_MONTHS) {
    const interest = Math.round(balance * monthlyRate);
    if (interest >= debt.minPaymentCents) return null; // never amortizes
    totalInterest += interest;
    balance = balance + interest - Math.min(debt.minPaymentCents, balance + interest);
    months++;
  }
  if (balance > 0) return null;
  const from = toLocalDate(parseISODate(fromISO));
  // Walk month-by-month from `from` so the payoff date is a real calendar date.
  let cursor = from;
  for (let i = 0; i < months; i++) {
    const { y, m } = { y: cursor.getFullYear(), m: cursor.getMonth() + 1 };
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    cursor = toLocalDate({ y: ny, m: nm, d: 1 });
  }
  return { payoffDate: formatISODate(cursor), months, totalInterestCents: totalInterest };
}
