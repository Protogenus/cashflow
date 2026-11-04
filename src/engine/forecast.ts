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
import { isIncomeSource } from './types';
import type {
  Assumptions,
  Cents,
  DebtNode,
  DebtProgress,
  ForecastResult,
  GoalProgress,
  ISODate,
  LedgerDay,
  LedgerEvent,
  NodeId,
  PercentageSplitNode,
  PlanGraph,
  PlanNode,
  Scenario,
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
    // Date fields must be real calendar dates. The UI's date inputs always
    // produce valid YYYY-MM-DD, but imported JSON can carry anything — a bad
    // date must be a clear validation error, never a silent wrong forecast.
    const checkDate = (value: string, field: string) => {
      try {
        parseISODate(value as ISODate);
      } catch {
        errors.push({
          nodeId: node.id,
          message: `"${node.label}" has an invalid ${field} ("${value}"). Pick a real calendar date.`,
        });
      }
    };
    switch (node.type) {
      case 'startingBalance':
        checkDate(node.asOf, 'as-of date');
        break;
      case 'income':
      case 'expense': {
        const f = node.recurrence.frequency;
        if (f.kind === 'weekly' || f.kind === 'biweekly') checkDate(f.anchor, 'anchor date');
        else if (f.kind === 'once') checkDate(f.date, 'date');
        break;
      }
      case 'goal':
        checkDate(node.targetDate, 'target date');
        break;
      case 'variableAmount': {
        const f = node.recurrence.frequency;
        if (f.kind === 'weekly' || f.kind === 'biweekly') checkDate(f.anchor, 'anchor date');
        else if (f.kind === 'once') checkDate(f.date, 'date');
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
  /** Scenario node toggles: these nodes (and their incident edges) are excluded. */
  disabledNodeIds?: NodeId[];
  /** Skip the assumptions hash (optimizer / Monte Carlo fast path — hashing
   *  the graph per candidate/run dominates runtime at 10k+ calls). */
  skipHash?: boolean;
  /**
   * Skip graph validation (optimizer fast path — the base graph was already
   * validated and candidates differ only in split percents, which sum to 100
   * by construction). Never set for user-supplied graphs.
   */
  skipValidation?: boolean;
  /** Monte Carlo per-run sampled amounts for variableAmount nodes. */
  variableOverrides?: Record<NodeId, Cents>;
  /** Monte Carlo shock events injected as one-time expenses. */
  extraExpenses?: ExtraExpense[];
  /**
   * Monte Carlo "missed paycheck": nodeId -> 0-based indices (in that income
   * node's expanded occurrence order) to drop for this run.
   */
  skipIncomeOccurrences?: Record<NodeId, number[]>;
}

export interface ExtraExpense {
  date: ISODate;
  amountCents: Cents;
  name: string;
  nodeId: NodeId;
}

export interface GenerateEventsOptions {
  variableOverrides?: Record<NodeId, Cents>;
  skipIncomeOccurrences?: Record<NodeId, number[]>;
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------- split allocation semantics ----------
//
// A percentageSplit divides each wired income occurrence into its outputs.
// Money routed to a goal or debt sink LEAVES the spendable balance walk
// (it is moved to savings / paid as extra principal — the checking account
// genuinely drops), while shares routed to expense outputs or to nothing
// stay spendable (money is fungible; the earmark doesn't move cash).
// Goal nodes accumulate the routed amounts (hit date / shortfall); debt
// nodes accumulate extra principal payments. Transfers are excluded from
// driver analysis — they are allocations, not bills.
//
// Paths handled in v1: income -> percentageSplit -> (goal|debt), and direct
// income -> (goal|debt) edges. An income wired into a split is fully handled
// by that split (first split in node order wins if wired to several).

export interface SinkRoute {
  nodeId: NodeId;
  kind: 'goal' | 'debt';
  name: string;
}

export interface SplitAllocation {
  splitId: NodeId;
  incomeIds: NodeId[];
  outputs: { outputId: string; percent: number; sinks: SinkRoute[] }[];
}

export interface AllocationPlan {
  splits: SplitAllocation[];
  /** Income node id -> the split allocation that handles its occurrences. */
  routedIncome: Map<NodeId, SplitAllocation>;
  /** Income node id -> direct goal/debt sinks (only when NOT routed via a split). */
  directSinks: Map<NodeId, SinkRoute[]>;
}

/** Split integer cents into shares by percent; the largest share absorbs rounding. */
export function splitShares(amountCents: Cents, percents: number[]): Cents[] {
  const shares = percents.map((p) => Math.round((amountCents * p) / 100));
  const diff = amountCents - shares.reduce((a, b) => a + b, 0);
  if (diff !== 0 && shares.length > 0) {
    let idx = 0;
    for (let i = 1; i < shares.length; i++) if (shares[i] > shares[idx]) idx = i;
    shares[idx] += diff;
  }
  return shares;
}

/** Divide integer cents equally; the first share absorbs rounding. */
function divideEqually(amountCents: Cents, parts: number): Cents[] {
  if (parts <= 0) return [];
  const each = Math.round(amountCents / parts);
  const out = new Array(parts).fill(each) as Cents[];
  out[0] += amountCents - each * parts;
  return out;
}

export function buildAllocationPlan(graph: PlanGraph): AllocationPlan {
  const byId = new Map<NodeId, PlanNode>(graph.nodes.map((n) => [n.id, n]));
  const splits: SplitAllocation[] = [];
  const routedIncome = new Map<NodeId, SplitAllocation>();

  for (const node of graph.nodes) {
    if (node.type !== 'percentageSplit') continue;
    const incomeIds: NodeId[] = [];
    for (const e of graph.edges) {
      if (e.target !== node.id) continue;
      const src = byId.get(e.source);
      if (src && isIncomeSource(src) && !incomeIds.includes(src.id)) incomeIds.push(src.id);
    }
    const outputs = node.outputs.map((o) => {
      const sinks: SinkRoute[] = [];
      for (const e of graph.edges) {
        if (e.source !== node.id || e.sourceHandle !== o.id) continue;
        const tgt = byId.get(e.target);
        if (tgt?.type === 'goal') sinks.push({ nodeId: tgt.id, kind: 'goal', name: tgt.name });
        else if (tgt?.type === 'debt') sinks.push({ nodeId: tgt.id, kind: 'debt', name: tgt.name });
      }
      return { outputId: o.id, percent: o.percent, sinks };
    });
    const alloc: SplitAllocation = { splitId: node.id, incomeIds, outputs };
    splits.push(alloc);
    for (const iid of incomeIds) {
      if (!routedIncome.has(iid)) routedIncome.set(iid, alloc); // first split wins
    }
  }

  const directSinks = new Map<NodeId, SinkRoute[]>();
  for (const e of graph.edges) {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !isIncomeSource(src) || routedIncome.has(src.id)) continue;
    if (tgt?.type === 'goal' || tgt?.type === 'debt') {
      const list = directSinks.get(src.id) ?? [];
      list.push({ nodeId: tgt.id, kind: tgt.type, name: tgt.name });
      directSinks.set(src.id, list);
    }
  }

  return { splits, routedIncome, directSinks };
}

/** Fingerprint tying a result to the exact graph + assumptions (+ scenario toggles). */
export function graphFingerprint(
  graph: PlanGraph,
  assumptions: Assumptions,
  disabledNodeIds: NodeId[] = [],
): string {
  return fnv1a(JSON.stringify({ graph, assumptions, disabledNodeIds }));
}

/** Expand every income/expense/variable node into dated occurrences. */
export function generateEvents(
  graph: PlanGraph,
  startISO: ISODate,
  horizonDays: number,
  opts: GenerateEventsOptions = {},
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const node of graph.nodes) {
    switch (node.type) {
      case 'income': {
        const occs = expandRecurrence(
          {
            nodeId: node.id,
            name: node.name,
            kind: 'income',
            amountCents: node.amountCents,
            recurrence: node.recurrence,
          },
          startISO,
          horizonDays,
        );
        const skip = new Set(opts.skipIncomeOccurrences?.[node.id] ?? []);
        occs.forEach((o, i) => {
          if (!skip.has(i)) out.push(o);
        });
        break;
      }
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
      case 'variableAmount': {
        // Deterministic mode emits the typical value (ARCHITECTURE.md §2.1);
        // Monte Carlo overrides it per run with a sampled amount. Income-
        // direction variables emit inflows (the irregular-income case); the
        // same skipIncomeOccurrences mechanism backs missed-paycheck shocks.
        const kind = node.direction === 'income' ? 'income' : 'expense';
        const occs = expandRecurrence(
          {
            nodeId: node.id,
            name: node.name,
            kind,
            amountCents: opts.variableOverrides?.[node.id] ?? node.typicalCents,
            recurrence: node.recurrence,
          },
          startISO,
          horizonDays,
        );
        const skip = new Set(opts.skipIncomeOccurrences?.[node.id] ?? []);
        occs.forEach((o, i) => {
          if (!skip.has(i)) out.push(o);
        });
        break;
      }
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
 *
 * Scenario support: `opts.disabledNodeIds` excludes nodes (and their
 * incident edges) before validation, so a disabled node can never break
 * the forecast with a spurious error.
 */
export function forecast(
  graph: PlanGraph,
  assumptions: Assumptions,
  opts: ForecastOptions = {},
): ForecastResult {
  // Scenario toggles: work on the filtered graph from here on.
  const disabled = new Set(opts.disabledNodeIds ?? []);
  const active: PlanGraph =
    disabled.size === 0
      ? graph
      : {
          nodes: graph.nodes.filter((n) => !disabled.has(n.id)),
          edges: graph.edges.filter((e) => !disabled.has(e.source) && !disabled.has(e.target)),
        };

  const validation = opts.skipValidation ? { valid: true, errors: [], warnings: [] } : validateGraph(active);
  if (!validation.valid) {
    throw new Error(
      `Cannot forecast an invalid graph: ${validation.errors.map((e) => e.message).join(' ')}`,
    );
  }

  const startISO = opts.startDate ?? todayISO();
  const horizonDays = assumptions.horizonDays;
  const balanceNode = active.nodes.find((n) => n.type === 'startingBalance')!;
  if (balanceNode.type !== 'startingBalance') throw new Error('unreachable');

  const plan = buildAllocationPlan(active);
  const events = generateEvents(active, startISO, horizonDays, {
    variableOverrides: opts.variableOverrides,
    skipIncomeOccurrences: opts.skipIncomeOccurrences,
  });
  // Monte Carlo shock events: one-time expenses injected into the walk.
  for (const s of opts.extraExpenses ?? []) {
    events.push({
      date: s.date,
      amountCents: s.amountCents,
      nodeId: s.nodeId,
      name: s.name,
      kind: 'expense',
    });
  }
  const byDate = new Map<ISODate, Occurrence[]>();
  for (const ev of events) {
    const list = byDate.get(ev.date);
    if (list) list.push(ev);
    else byDate.set(ev.date, [ev]);
  }
  // Income before expenses on the same day (visible, editable assumption).
  // Sorted once here — not per walk-day — so the hot loop stays allocation-light.
  if (assumptions.sameDayOrder === 'incomeFirst') {
    for (const list of byDate.values()) {
      list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'income' ? -1 : 1));
    }
  }

  const goalNodes = active.nodes.filter((n) => n.type === 'goal');
  const debtNodes = active.nodes.filter((n) => n.type === 'debt');
  const goalById = new Map<NodeId, Extract<PlanNode, { type: 'goal' }>>(
    goalNodes.filter((n): n is Extract<PlanNode, { type: 'goal' }> => n.type === 'goal').map((g) => [g.id, g]),
  );
  const saved = new Map<NodeId, Cents>(goalNodes.map((n) => [n.id, 0]));
  const hitDate = new Map<NodeId, ISODate>();
  const savedAtTarget = new Map<NodeId, Cents>(goalNodes.map((n) => [n.id, 0]));
  const extraPaid = new Map<NodeId, Cents>(debtNodes.map((n) => [n.id, 0]));

  /** Apply a routed share to its sinks; returns the transfer ledger events. */
  const applyToSinks = (sinks: SinkRoute[], shareCents: Cents, date: ISODate): LedgerEvent[] => {
    if (sinks.length === 0 || shareCents === 0) return [];
    const parts = divideEqually(shareCents, sinks.length);
    return sinks.map((sink, i) => {
      const amt = parts[i];
      if (sink.kind === 'goal') {
        saved.set(sink.nodeId, (saved.get(sink.nodeId) ?? 0) + amt);
        const goal = goalById.get(sink.nodeId);
        if (goal && !hitDate.has(sink.nodeId) && (saved.get(sink.nodeId) ?? 0) >= goal.targetCents) {
          hitDate.set(sink.nodeId, date);
        }
      } else {
        extraPaid.set(sink.nodeId, (extraPaid.get(sink.nodeId) ?? 0) + amt);
      }
      return { nodeId: sink.nodeId, name: sink.name, amountCents: -amt, kind: 'transfer' as const };
    });
  };

  const start = toLocalDate(parseISODate(startISO));
  const ledger: LedgerDay[] = [];
  let balance = balanceNode.balanceCents;

  for (let d = 0; d < horizonDays; d++) {
    const date = formatISODate(addDays(start, d));
    const dayEvents = byDate.get(date) ?? [];
    const ledgerEvents: LedgerEvent[] = [];
    for (const ev of dayEvents) {
      const signed = ev.kind === 'income' ? ev.amountCents : -ev.amountCents;
      balance += signed;
      ledgerEvents.push({
        nodeId: ev.nodeId,
        name: ev.name,
        amountCents: signed,
        kind: ev.kind,
      });
      // Split-routed income: divide into outputs; goal/debt shares leave the walk.
      if (ev.kind === 'income') {
        const routed = plan.routedIncome.get(ev.nodeId);
        if (routed) {
          const shares = splitShares(ev.amountCents, routed.outputs.map((o) => o.percent));
          routed.outputs.forEach((o, i) => {
            const transfers = applyToSinks(o.sinks, shares[i], date);
            for (const t of transfers) {
              balance += t.amountCents; // negative: money moved out of the spendable balance
              ledgerEvents.push(t);
            }
          });
        } else {
          const sinks = plan.directSinks.get(ev.nodeId);
          if (sinks && sinks.length > 0) {
            const transfers = applyToSinks(sinks, ev.amountCents, date);
            for (const t of transfers) {
              balance += t.amountCents;
              ledgerEvents.push(t);
            }
          }
        }
      }
    }
    // Snapshot goal accumulation at each goal's target date (or earlier days).
    for (const g of goalNodes) {
      if (g.type === 'goal' && date <= g.targetDate) {
        savedAtTarget.set(g.id, saved.get(g.id) ?? 0);
      }
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

  const horizonEnd = ledger.length > 0 ? ledger[ledger.length - 1].date : startISO;
  const goals: GoalProgress[] = goalNodes
    .filter((n): n is Extract<PlanNode, { type: 'goal' }> => n.type === 'goal')
    .map((g) => {
      const atTarget = g.targetDate <= horizonEnd ? (savedAtTarget.get(g.id) ?? 0) : (saved.get(g.id) ?? 0);
      return {
        nodeId: g.id,
        name: g.name,
        targetCents: g.targetCents,
        targetDate: g.targetDate,
        savedCents: saved.get(g.id) ?? 0,
        hitDate: hitDate.get(g.id) ?? null,
        shortfallAtTargetCents: Math.max(0, g.targetCents - atTarget),
      };
    });
  const debts: DebtProgress[] = debtNodes
    .filter((n): n is Extract<PlanNode, { type: 'debt' }> => n.type === 'debt')
    .map((d) => ({
      nodeId: d.id,
      name: d.name,
      extraPaidCents: extraPaid.get(d.id) ?? 0,
    }));

  const assumptionsHash = opts.skipHash
    ? 'skipped:fast-path'
    : graphFingerprint(active, assumptions, [...disabled]);

  return {
    ledger,
    pinchPoint: { date: pinchDay.date, balanceCents: pinchDay.balanceCents, drivers },
    firstNegativeDate,
    safeToSpendCents: pinchDay.balanceCents - assumptions.safetyBufferCents,
    assumptionsHash,
    goals,
    debts,
  };
}

/**
 * Scenario-aware forecast: runs the scenario's graph with its per-scenario
 * node toggles applied. Pure — the store layer owns scenario bookkeeping.
 */
export function forecastScenario(
  scenario: Scenario,
  assumptions: Assumptions,
  opts: ForecastOptions = {},
): ForecastResult {
  return forecast(scenario.graph, assumptions, {
    ...opts,
    disabledNodeIds: [...(opts.disabledNodeIds ?? []), ...scenario.disabledNodeIds],
  });
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
      if (src && isIncomeSource(src)) incomingIncome.add(src.id);
    }
  }
  let ofAmountCents = 0;
  for (const id of incomingIncome) {
    const inc = graph.nodes.find((n) => n.id === id);
    if (inc?.type === 'income') ofAmountCents += inc.amountCents;
    else if (inc?.type === 'variableAmount') ofAmountCents += inc.typicalCents;
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
 * then the minimum payment plus any extra monthly payment, until the balance
 * clears. Returns null when the payment doesn't cover monthly interest
 * (the balance never falls). The optimizer passes split-routed extra payments
 * here to score "pay debt fastest" candidates.
 */
export function projectDebtPayoff(
  debt: DebtNode,
  fromISO: ISODate = todayISO(),
  extraMonthlyCents: Cents = 0,
): DebtPayoff | null {
  if (debt.balanceCents <= 0) {
    return { payoffDate: fromISO, months: 0, totalInterestCents: 0 };
  }
  const monthlyRate = debt.aprBps / 10000 / 12;
  const payment = debt.minPaymentCents + extraMonthlyCents;
  if (payment <= 0) return null;

  let balance = debt.balanceCents;
  let totalInterest = 0;
  let months = 0;
  const MAX_MONTHS = 1200; // 100 years — a guard, not a plan
  while (balance > 0 && months < MAX_MONTHS) {
    const interest = Math.round(balance * monthlyRate);
    if (interest >= payment) return null; // never amortizes
    totalInterest += interest;
    balance = balance + interest - Math.min(payment, balance + interest);
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
