/**
 * montecarlo.ts — Monte Carlo forecast engine (pure, no framework imports).
 *
 * Thousands of randomized forecasts: each run samples variable-amount nodes
 * from their min/typical/max via a triangular distribution, applies shock
 * events by probability, and walks the deterministic forecast. Results are
 * aggregated into per-day balance percentiles (the fan chart), the share of
 * runs that stay above $0, per-bill coverability, and rent-cover probability
 * by month.
 *
 * Reproducibility: each run draws from its own mulberry32 stream derived
 * from (master seed, run index) — order-independent, so the same seed +
 * inputs always produce bit-identical results regardless of worker
 * scheduling. Variable draws happen before shock draws in every run
 * (documented stream order, DECISIONS.md).
 */
import { addDays, formatISODate, parseISODate, toLocalDate, todayISO } from './dates';
import { findDrivers } from './explain';
import { forecast, generateEvents, validateGraph, type ExtraExpense } from './forecast';
import { expandRecurrence } from './recurrence';
import { mulberry32, triangularSample } from './rng';
import {
  isIncomeSource,
  type Assumptions,
  type Cents,
  type Driver,
  type ISODate,
  type NodeId,
  type PlanGraph,
} from './types';

export interface MonteCarloOptions {
  /** 500..10,000 (UI clamps; the engine trusts the caller). */
  runs: number;
  seed: number;
  startDate?: ISODate;
  disabledNodeIds?: NodeId[];
  onProgress?: (done: number, total: number) => void;
}

export interface BandPoint {
  date: ISODate;
  p5: Cents;
  p25: Cents;
  p50: Cents;
  p75: Cents;
  p95: Cents;
}

export interface FailedTrial {
  trialIndex: number;
  firstNegativeDate: ISODate;
  drivers: Driver[];
}

export interface MonteCarloResult {
  seed: number;
  runs: number;
  horizonDays: number;
  startDate: ISODate;
  dates: ISODate[];
  bands: BandPoint[];
  /** Share of runs whose balance never dropped below $0. */
  probAboveZero: number;
  /** Rent-cover probability by calendar month (YYYY-MM). */
  rentByMonth: { month: string; label: string; probCovered: number }[];
  /** Per-bill cover probability (every occurrence covered in the run). */
  billCoverage: { nodeId: NodeId; name: string; probCovered: number }[];
  shockSummary: { shockId: string; name: string; appliedRuns: number }[];
  /** Deterministic overlay (typical values, no shocks) for the fan chart. */
  deterministic: Cents[];
  /** Capped at 200 rows; failedCount is the true total. */
  failedTrials: FailedTrial[];
  failedCount: number;
  elapsedMs: number;
}

/**
 * Linear-interpolation percentiles over ascending-sorted values
 * (the numpy 'linear' method). Exported for unit tests.
 */
export function computePercentiles(sorted: number[], qs: number[]): number[] {
  const n = sorted.length;
  return qs.map((q) => {
    if (n === 0) return NaN;
    if (n === 1) return sorted[0];
    const pos = Math.min(1, Math.max(0, q)) * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  });
}

/** Order-independent per-run seed: master seed mixed with the run index. */
export function runSeed(masterSeed: number, runIndex: number): number {
  return (masterSeed ^ Math.imul(runIndex + 1, 0x9e3779b9)) >>> 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface BillTemplate {
  nodeId: NodeId;
  name: string;
  date: ISODate;
  typicalCents: Cents;
  isVariable: boolean;
}

export function runMonteCarlo(
  graph: PlanGraph,
  assumptions: Assumptions,
  options: MonteCarloOptions,
): MonteCarloResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { runs, seed } = options;
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(`Monte Carlo needs runs >= 1 (got ${runs}).`);
  }

  const validation = validateGraph(graph);
  if (!validation.valid) {
    throw new Error(
      `Cannot run Monte Carlo on an invalid graph: ${validation.errors.map((e) => e.message).join(' ')}`,
    );
  }

  const disabled = new Set(options.disabledNodeIds ?? []);
  const active: PlanGraph =
    disabled.size === 0
      ? graph
      : {
          nodes: graph.nodes.filter((n) => !disabled.has(n.id)),
          edges: graph.edges.filter((e) => !disabled.has(e.source) && !disabled.has(e.target)),
        };

  const startISO = options.startDate ?? todayISO();
  const horizonDays = assumptions.horizonDays;
  const start = toLocalDate(parseISODate(startISO));
  const dates: ISODate[] = [];
  for (let d = 0; d < horizonDays; d++) dates.push(formatISODate(addDays(start, d)));
  const dateIndex = new Map<ISODate, number>(dates.map((d, i) => [d, i]));

  const balanceNode = active.nodes.find((n) => n.type === 'startingBalance');
  const openingCents = balanceNode?.type === 'startingBalance' ? balanceNode.balanceCents : 0;

  const variableNodes = active.nodes.filter((n) => n.type === 'variableAmount');
  const incomeNodes = new Map<NodeId, PlanGraph['nodes'][number]>();
  for (const n of active.nodes) if (isIncomeSource(n)) incomeNodes.set(n.id, n);

  // Bill template: expense/variable occurrences are identical across runs
  // except for sampled amounts, so expand once and reuse.
  const occs = generateEvents(active, startISO, horizonDays);
  const bills: BillTemplate[] = occs
    .filter((o) => o.kind === 'expense')
    .map((o) => {
      const node = active.nodes.find((n) => n.id === o.nodeId);
      return {
        nodeId: o.nodeId,
        name: o.name,
        date: o.date,
        typicalCents: o.amountCents,
        isVariable: node?.type === 'variableAmount',
      };
    });

  // Rent designation: a /rent/i expense node, else the largest monthly expense.
  // Income-direction variable nodes are never bills (they emit inflows).
  // Explicit `: boolean` — without it TS 5.5's inferred filter predicate
  // collapses the `!isIncomeSource(n)` disjunct to `never`, typing the
  // array as ExpenseNode[] and breaking the variableAmount branch below.
  const expenseNodes = active.nodes.filter(
    (n): boolean => n.type === 'expense' || (n.type === 'variableAmount' && !isIncomeSource(n)),
  );
  let rentId: NodeId | null = null;
  const rentNamed = expenseNodes.find((n) => /rent/i.test(n.type === 'expense' || n.type === 'variableAmount' ? n.name : ''));
  if (rentNamed) {
    rentId = rentNamed.id;
  } else {
    let best = -1;
    for (const n of expenseNodes) {
      let amt = -1;
      if (n.type === 'expense') amt = n.amountCents;
      else if (n.type === 'variableAmount') amt = n.typicalCents;
      if (amt > best) {
        best = amt;
        rentId = n.id;
      }
    }
  }

  const shocks = assumptions.shocks.filter((s) => s.enabled);
  const shockFired = new Map<string, number>(shocks.map((s) => [s.id, 0]));

  // Column-major balance matrix: matrix[day * runs + run].
  const matrix = new Float64Array(horizonDays * runs);
  let aboveZero = 0;
  const billCoveredRuns = new Map<NodeId, number>();
  const rentMonthCovered = new Map<string, { covered: number; label: string }>();
  const failedTrials: FailedTrial[] = [];
  let failedCount = 0;

  const progressEvery = Math.max(1, Math.floor(runs / 100));

  for (let run = 0; run < runs; run++) {
    const rng = mulberry32(runSeed(seed, run));

    // 1. Variable draws (documented order: variables first, then shocks).
    const variableOverrides: Record<NodeId, Cents> = {};
    for (const v of variableNodes) {
      if (v.type !== 'variableAmount') continue;
      variableOverrides[v.id] = Math.round(
        triangularSample(rng, v.minCents, v.typicalCents, v.maxCents),
      );
    }

    // 2. Shock draws.
    const extraExpenses: ExtraExpense[] = [];
    const skipIncomeOccurrences: Record<NodeId, number[]> = {};
    for (const shock of shocks) {
      if (!(rng() < shock.probability)) continue;
      shockFired.set(shock.id, (shockFired.get(shock.id) ?? 0) + 1);
      if (shock.kind === 'missedPaycheck' && shock.incomeNodeId) {
        const node = incomeNodes.get(shock.incomeNodeId);
        if (node && isIncomeSource(node)) {
          const count = expandRecurrence(
            {
              nodeId: node.id,
              name: node.name,
              kind: 'income',
              amountCents: node.type === 'income' ? node.amountCents : node.typicalCents,
              recurrence: node.recurrence,
            },
            startISO,
            horizonDays,
          ).length;
          if (count > 0) {
            const idx = Math.floor(rng() * count);
            (skipIncomeOccurrences[shock.incomeNodeId] ??= []).push(idx);
          }
        }
      } else {
        let date: ISODate;
        if (shock.date) {
          date = shock.date;
        } else {
          const [a, b] = shock.windowDays;
          const lo = Math.max(0, Math.min(a, b));
          const hi = Math.min(horizonDays - 1, Math.max(a, b));
          date = formatISODate(addDays(start, lo + Math.floor(rng() * (hi - lo + 1))));
        }
        extraExpenses.push({
          date,
          amountCents: shock.amountCents,
          name: shock.name,
          nodeId: `shock:${shock.id}`,
        });
      }
    }

    // 3. Deterministic walk for this run.
    const res = forecast(active, assumptions, {
      startDate: startISO,
      skipHash: true,
      skipValidation: true,
      variableOverrides,
      extraExpenses,
      skipIncomeOccurrences,
    });

    let runMin = Infinity;
    let runNegative = false;
    for (let d = 0; d < horizonDays; d++) {
      const bal = res.ledger[d].balanceCents;
      matrix[d * runs + run] = bal;
      if (bal < runMin) runMin = bal;
      if (bal < 0) runNegative = true;
    }
    if (!runNegative) aboveZero++;

    // 4. Bill coverability from the run's start-of-day balances.
    // A bill is covered when the day's opening balance >= the bill amount.
    const nodeOk = new Map<NodeId, boolean>();
    const rentMonthOk = new Map<string, boolean>();
    for (const b of bills) {
      const di = dateIndex.get(b.date);
      if (di === undefined) continue;
      const amount = b.isVariable ? (variableOverrides[b.nodeId] ?? b.typicalCents) : b.typicalCents;
      const opening = di === 0 ? openingCents : matrix[(di - 1) * runs + run];
      const covered = opening >= amount;
      if (!covered) {
        nodeOk.set(b.nodeId, false);
        if (b.nodeId === rentId) rentMonthOk.set(b.date.slice(0, 7), false);
      } else {
        if (!nodeOk.has(b.nodeId)) nodeOk.set(b.nodeId, true);
        if (b.nodeId === rentId && !rentMonthOk.has(b.date.slice(0, 7))) {
          rentMonthOk.set(b.date.slice(0, 7), true);
        }
      }
    }
    for (const [nodeId, ok] of nodeOk) {
      if (ok) billCoveredRuns.set(nodeId, (billCoveredRuns.get(nodeId) ?? 0) + 1);
    }
    for (const [month, ok] of rentMonthOk) {
      const cur = rentMonthCovered.get(month) ?? { covered: 0, label: monthLabel(month) };
      if (ok) cur.covered++;
      rentMonthCovered.set(month, cur);
    }
    // Every rent month gets a per-run entry above (covered or not), so no fixup needed.

    // 5. Failed-trial drill-down (capped storage, true count kept).
    if (runNegative) {
      failedCount++;
      if (failedTrials.length < 200) {
        let firstNegativeDate: ISODate = dates[horizonDays - 1];
        for (let d = 0; d < horizonDays; d++) {
          if (matrix[d * runs + run] < 0) {
            firstNegativeDate = dates[d];
            break;
          }
        }
        failedTrials.push({
          trialIndex: run,
          firstNegativeDate,
          drivers: findDrivers(res.ledger, firstNegativeDate, 7, 4),
        });
      }
    }

    if (options.onProgress && (run + 1) % progressEvery === 0) {
      options.onProgress(run + 1, runs);
    }
  }
  if (options.onProgress) options.onProgress(runs, runs);

  // ---- aggregation ----
  const bands: BandPoint[] = [];
  const qs = [0.05, 0.25, 0.5, 0.75, 0.95];
  const col = new Array<number>(runs);
  for (let d = 0; d < horizonDays; d++) {
    for (let r = 0; r < runs; r++) col[r] = matrix[d * runs + r];
    col.sort((a, b) => a - b);
    const [p5, p25, p50, p75, p95] = computePercentiles(col, qs);
    bands.push({
      date: dates[d],
      p5: Math.round(p5),
      p25: Math.round(p25),
      p50: Math.round(p50),
      p75: Math.round(p75),
      p95: Math.round(p95),
    });
  }

  const det = forecast(active, assumptions, { startDate: startISO, skipHash: true, skipValidation: true });
  const deterministic = det.ledger.map((l) => l.balanceCents);

  const billCoverage = [...billCoveredRuns.entries()]
    .map(([nodeId, covered]) => {
      const tpl = bills.find((b) => b.nodeId === nodeId);
      return { nodeId, name: tpl?.name ?? nodeId, probCovered: covered / runs };
    })
    .sort((a, b) => b.probCovered - a.probCovered || a.name.localeCompare(b.name));
  // Bills that never had an occurrence (or never covered) still deserve a row.
  const seenBills = new Set(billCoverage.map((b) => b.nodeId));
  for (const b of bills) {
    if (!seenBills.has(b.nodeId)) {
      seenBills.add(b.nodeId);
      billCoverage.push({ nodeId: b.nodeId, name: b.name, probCovered: 0 });
    }
  }

  const rentByMonth = [...rentMonthCovered.entries()]
    .map(([month, v]) => ({ month, label: v.label, probCovered: v.covered / runs }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    seed,
    runs,
    horizonDays,
    startDate: startISO,
    dates,
    bands,
    probAboveZero: aboveZero / runs,
    rentByMonth,
    billCoverage,
    shockSummary: shocks.map((s) => ({
      shockId: s.id,
      name: s.name,
      appliedRuns: shockFired.get(s.id) ?? 0,
    })),
    deterministic,
    failedTrials,
    failedCount,
    elapsedMs: t1 - t0,
  };
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
