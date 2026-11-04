/**
 * optimize.ts — brute-force split-percentage optimizer (pure, no framework imports).
 *
 * Searches 5%-step allocations over the user's percentage-split nodes
 * (DECISIONS.md: 5% is the human-actionable unit), scores each candidate
 * with one deterministic forecast per candidate, and returns the top N
 * with explanations generated from the forecast's real pinch point and
 * drivers — never templated fluff.
 *
 * Search-space guard: beyond ~50k combinations the grid coarsens to 10%
 * steps, then to a seeded sample; the UI is told exactly what happened
 * (searchMode + searchNote).
 */
import { buildAllocationPlan, forecast, projectDebtPayoff, validateGraph } from './forecast';
import { mulberry32 } from './rng';
import type {
  Assumptions,
  Cents,
  Driver,
  ISODate,
  NodeId,
  PercentageSplitNode,
  PlanGraph,
} from './types';

export type OptimizerGoal = 'maxBuffer' | 'savingsGoal' | 'debtFastest' | 'blend';

export interface BlendWeights {
  buffer: number;
  savings: number;
  debt: number;
}

export interface OptimizeOptions {
  goal: OptimizerGoal;
  /** Default: every percentageSplit node with 2+ outputs. */
  splitNodeIds?: NodeId[];
  /** Default: the first goal node (required for savingsGoal/blend-savings). */
  goalNodeId?: NodeId;
  /** Default: the first debt node (required for debtFastest/blend-debt). */
  debtNodeId?: NodeId;
  weights?: BlendWeights; // default { buffer: 1, savings: 1, debt: 1 }
  topN?: number; // default 5
  maxCombos?: number; // default 50000
  startDate?: ISODate;
  disabledNodeIds?: NodeId[];
}

export type CandidateSplits = Record<NodeId, number[]>; // percents in node.outputs order

export interface BlendComponents {
  buffer: number;
  savings: number;
  debt: number;
}

export interface ScoreBreakdown {
  pinchBalanceCents: Cents;
  pinchDate: ISODate;
  shortfallCents: Cents | null;
  debtPayoffDate: ISODate | null;
  debtPayoffMonths: number | null;
  debtInterestCents: Cents | null;
  blend: BlendComponents | null;
}

export interface OptimizerCandidate {
  rank: number;
  splits: CandidateSplits;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  drivers: Driver[];
  /** candidate.score − baseline.score, in score units. */
  deltaVsBaseline: number;
  /** Human delta in real units, e.g. "+$95 min balance", "23 days sooner". */
  deltaLabel: string;
  explanation: string;
}

export interface DeadSplit {
  id: NodeId;
  label: string;
  reason: string;
}

export interface OptimizeResult {
  goal: OptimizerGoal;
  candidates: OptimizerCandidate[];
  baselineSplits: CandidateSplits;
  baselineScore: number;
  baselineBreakdown: ScoreBreakdown;
  combosEvaluated: number;
  combosTotal: number;
  searchMode: 'full' | 'coarsened' | 'sampled';
  stepUsed: number;
  elapsedMs: number;
  splitNodeIds: NodeId[];
  /** Requested splits that cannot move the forecast, with honest reasons. */
  excludedSplits: DeadSplit[];
  goalNodeId: NodeId | null;
  debtNodeId: NodeId | null;
  weights: BlendWeights;
  searchNote: string;
}

/** Integer compositions of `units` into `parts` parts (stars and bars). */
export function compositions(units: number, parts: number): number[][] {
  const out: number[][] = [];
  const cur = new Array(parts).fill(0) as number[];
  const rec = (remaining: number, idx: number) => {
    if (idx === parts - 1) {
      cur[idx] = remaining;
      out.push([...cur]);
      return;
    }
    for (let v = 0; v <= remaining; v++) {
      cur[idx] = v;
      rec(remaining - v, idx + 1);
    }
  };
  rec(units, 0);
  return out;
}

/** New graph with the candidate's percents written into the split nodes. */
export function applySplits(graph: PlanGraph, splits: CandidateSplits): PlanGraph {
  const nodes = graph.nodes.map((n) => {
    if (n.type !== 'percentageSplit') return n;
    const percents = splits[n.id];
    if (!percents) return n;
    const split = n as PercentageSplitNode;
    return {
      ...split,
      outputs: split.outputs.map((o, i) => ({ ...o, percent: percents[i] ?? o.percent })),
    };
  });
  return { nodes, edges: graph.edges };
}

function currentSplits(graph: PlanGraph, splitNodeIds: NodeId[]): CandidateSplits {
  const out: CandidateSplits = {};
  for (const id of splitNodeIds) {
    const n = graph.nodes.find((x) => x.id === id);
    if (n?.type === 'percentageSplit') out[id] = n.outputs.map((o) => o.percent);
  }
  return out;
}

interface Metrics {
  pinchBalance: Cents;
  shortfall: Cents; // savings-goal shortfall at target (0 when no goal node)
  payoffDays: number; // debt payoff days from start (MAX when none/never)
  interest: Cents;
}

const NEVER = Number.MAX_SAFE_INTEGER;

function scoreOf(goal: OptimizerGoal, m: Metrics, blend: BlendComponents | null, weights: BlendWeights): number {
  switch (goal) {
    case 'maxBuffer':
      return m.pinchBalance;
    case 'savingsGoal':
      return -m.shortfall;
    case 'debtFastest':
      // Payoff day dominates; interest breaks ties as a fraction of a day.
      return -(m.payoffDays + Math.min(m.interest, 1e12) / 1e12);
    case 'blend': {
      const b = blend!;
      const sum = weights.buffer + weights.savings + weights.debt || 1;
      return (weights.buffer * b.buffer + weights.savings * b.savings + weights.debt * b.debt) / sum;
    }
  }
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

/** Engine-local whole-dollar formatting (UI has its own in lib/format). */
function fmtMoney(cents: Cents): string {
  const sign = cents < 0 ? '−' : '';
  return `${sign}$${fmtInt(Math.round(Math.abs(cents) / 100))}`;
}

function driversText(drivers: Driver[]): string {
  const top = drivers.slice(0, 2);
  if (top.length === 0) return 'no single bill stands out';
  const money = (c: Cents) => `$${fmtInt(Math.round(Math.abs(c) / 100))}`;
  return top.map((d) => `${d.name} (−${money(d.contributionCents)})`).join(' and ');
}

/** Largest single-output shift between two allocations, in plain words. */
function biggestShift(
  graph: PlanGraph,
  splitNodeIds: NodeId[],
  from: CandidateSplits,
  to: CandidateSplits,
): string | null {
  let bestDiff = 0;
  let bestText: string | null = null;
  for (const id of splitNodeIds) {
    const node = graph.nodes.find((n) => n.id === id);
    if (node?.type !== 'percentageSplit') continue;
    const a = from[id] ?? [];
    const b = to[id] ?? [];
    node.outputs.forEach((o, i) => {
      const diff = Math.abs((b[i] ?? 0) - (a[i] ?? 0));
      if (diff > bestDiff) {
        bestDiff = diff;
        bestText = `${node.label}: ${o.label} ${a[i] ?? 0}% → ${b[i] ?? 0}%`;
      }
    });
  }
  return bestText;
}

const MONTH_DAYS = 30.4375;

export function optimize(
  graph: PlanGraph,
  assumptions: Assumptions,
  options: OptimizeOptions,
): OptimizeResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const validation = validateGraph(graph);
  if (!validation.valid) {
    throw new Error(
      `Cannot optimize an invalid graph: ${validation.errors.map((e) => e.message).join(' ')}`,
    );
  }

  const goal = options.goal;
  const topN = options.topN ?? 5;
  const maxCombos = options.maxCombos ?? 50000;
  const weights: BlendWeights = { buffer: 1, savings: 1, debt: 1, ...(options.weights ?? {}) };
  const startDate = options.startDate;
  const disabledNodeIds = options.disabledNodeIds ?? [];

  const allSplits = graph.nodes.filter(
    (n): n is PercentageSplitNode => n.type === 'percentageSplit' && n.outputs.length >= 2,
  );
  const requestedIds = (options.splitNodeIds ?? allSplits.map((n) => n.id)).filter((id) =>
    allSplits.some((n) => n.id === id),
  );
  if (requestedIds.length === 0) {
    throw new Error('The optimizer needs at least one percentage-split node with 2+ outputs.');
  }

  // A split only moves the forecast when it routes income into a goal or
  // debt sink (allocation semantics, DECISIONS.md). Splits that don't —
  // unwired, claimed by another split, or wired only to expense outputs —
  // are excluded with an honest reason instead of searched as noise.
  const disabledSet = new Set(disabledNodeIds);
  const liveGraph: PlanGraph =
    disabledSet.size === 0
      ? graph
      : {
          nodes: graph.nodes.filter((n) => !disabledSet.has(n.id)),
          edges: graph.edges.filter(
            (e) => !disabledSet.has(e.source) && !disabledSet.has(e.target),
          ),
        };
  const plan0 = buildAllocationPlan(liveGraph);
  const claimedBy = new Map<NodeId, PercentageSplitNode>();
  for (const [incomeId, alloc] of plan0.routedIncome) {
    const sn = liveGraph.nodes.find((n) => n.id === alloc.splitId);
    if (sn?.type === 'percentageSplit') claimedBy.set(incomeId, sn);
  }
  const excludedSplits: DeadSplit[] = [];
  const splitNodeIds: NodeId[] = [];
  for (const id of requestedIds) {
    const node = graph.nodes.find((n) => n.id === id);
    if (node?.type !== 'percentageSplit') continue;
    const alloc = plan0.splits.find((s) => s.splitId === id);
    const incomeIds = alloc?.incomeIds ?? [];
    const hasSinks = (alloc?.outputs ?? []).some((o) => o.sinks.length > 0);
    if (incomeIds.length === 0) {
      excludedSplits.push({ id, label: node.label, reason: 'no income wired into it' });
    } else if (!hasSinks) {
      excludedSplits.push({ id, label: node.label, reason: 'no output wired to a goal or debt node' });
    } else {
      const stolen = incomeIds.find((iid) => claimedBy.get(iid)?.id !== id);
      if (stolen) {
        const other = claimedBy.get(stolen)!;
        const incName = graph.nodes.find((n) => n.id === stolen)?.label ?? stolen;
        excludedSplits.push({
          id,
          label: node.label,
          reason: `"${incName}" already routes through "${other.label}"`,
        });
      } else {
        splitNodeIds.push(id);
      }
    }
  }
  if (splitNodeIds.length === 0) {
    throw new Error(
      'No split node routes money to a goal or debt — wire a split output to a goal or debt node so the optimizer has something to explore.',
    );
  }

  const goalNode = options.goalNodeId
    ? graph.nodes.find((n) => n.id === options.goalNodeId && n.type === 'goal')
    : graph.nodes.find((n) => n.type === 'goal');
  const goalNodeId = goalNode?.type === 'goal' ? goalNode.id : null;
  if ((goal === 'savingsGoal' || goal === 'blend') && goal === 'savingsGoal' && !goalNodeId) {
    throw new Error('The savings-goal objective needs a goal node on the canvas.');
  }

  const debtNode = options.debtNodeId
    ? graph.nodes.find((n) => n.id === options.debtNodeId && n.type === 'debt')
    : graph.nodes.find((n) => n.type === 'debt');
  const debtNodeId = debtNode?.type === 'debt' ? debtNode.id : null;
  if (goal === 'debtFastest' && !debtNodeId) {
    throw new Error('The pay-debt-fastest objective needs a debt node on the canvas.');
  }

  const parts = splitNodeIds.map((id) => {
    const n = graph.nodes.find((x) => x.id === id) as PercentageSplitNode;
    return n.outputs.length;
  });

  // ---- search space ----
  let stepUsed = 5;
  let searchMode: OptimizeResult['searchMode'] = 'full';
  let units = Math.round(100 / stepUsed);
  let perSplit = parts.map((p) => compositions(units, p));
  let combosTotal = perSplit.reduce((a, l) => a * l.length, 1);
  if (combosTotal > maxCombos) {
    stepUsed = 10;
    searchMode = 'coarsened';
    units = 10;
    perSplit = parts.map((p) => compositions(units, p));
    combosTotal = perSplit.reduce((a, l) => a * l.length, 1);
  }

  // Candidate enumeration: full grid, or a seeded sample when still too big.
  type Combo = number[][]; // per split: unit counts per output
  let combos: Combo[];
  let combosEvaluated: number;
  if (combosTotal <= maxCombos) {
    combos = [];
    const idx = new Array(splitNodeIds.length).fill(0) as number[];
    const rec = (d: number) => {
      if (d === splitNodeIds.length) {
        combos.push(idx.map((k, s) => perSplit[s][k]));
        return;
      }
      for (let k = 0; k < perSplit[d].length; k++) {
        idx[d] = k;
        rec(d + 1);
      }
    };
    rec(0);
    combosEvaluated = combos.length;
  } else {
    searchMode = 'sampled';
    const rng = mulberry32((assumptions.mcSeed ^ 0x51ed270b) >>> 0);
    const seen = new Set<string>();
    combos = [];
    const target = Math.min(maxCombos, combosTotal);
    let guard = target * 20 + 1000;
    while (combos.length < target && guard-- > 0) {
      const key = perSplit.map((l) => Math.floor(rng() * l.length)).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push(key.split(',').map((k, s) => perSplit[s][Number(k)]));
    }
    combosEvaluated = combos.length;
  }

  // ---- evaluate ----
  const fcastOpts = { startDate, disabledNodeIds, skipHash: true, skipValidation: true } as const;
  const toPercents = (combo: Combo): CandidateSplits => {
    const out: CandidateSplits = {};
    splitNodeIds.forEach((id, s) => {
      out[id] = combo[s].map((u) => (u * 100) / units);
    });
    return out;
  };

  const metricsOf = (splits: CandidateSplits): Metrics => {
    const g = applySplits(graph, splits);
    const res = forecast(g, assumptions, fcastOpts);
    const pinchBalance = res.pinchPoint.balanceCents;
    const shortfall =
      goalNodeId != null
        ? (res.goals.find((x) => x.nodeId === goalNodeId)?.shortfallAtTargetCents ?? 0)
        : 0;
    let payoffDays = NEVER;
    let interest: Cents = NEVER;
    if (debtNodeId != null && debtNode?.type === 'debt') {
      const extra = res.debts.find((x) => x.nodeId === debtNodeId)?.extraPaidCents ?? 0;
      const monthlyExtra = Math.round(extra / (assumptions.horizonDays / MONTH_DAYS));
      const payoff = projectDebtPayoff(debtNode, startDate, monthlyExtra);
      if (payoff) {
        payoffDays = payoff.months * MONTH_DAYS;
        interest = payoff.totalInterestCents;
      }
    }
    return { pinchBalance, shortfall, payoffDays, interest };
  };

  const evaluated: { splits: CandidateSplits; metrics: Metrics }[] = combos.map((combo) => {
    const splits = toPercents(combo);
    return { splits, metrics: metricsOf(splits) };
  });

  // ---- score ----
  let blends: (BlendComponents | null)[] = evaluated.map(() => null);
  if (goal === 'blend') {
    const norm = (vals: number[]): number[] => {
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      if (!(hi > lo)) return vals.map(() => 0.5);
      return vals.map((v) => (v - lo) / (hi - lo));
    };
    const nb = norm(evaluated.map((e) => e.metrics.pinchBalance));
    const ns = norm(evaluated.map((e) => -e.metrics.shortfall));
    const nd = norm(
      evaluated.map((e) => (e.metrics.payoffDays >= NEVER ? -1e18 : -e.metrics.payoffDays)),
    );
    blends = evaluated.map((_, i) => ({ buffer: nb[i], savings: ns[i], debt: nd[i] }));
  }
  const scored = evaluated.map((e, i) => ({
    ...e,
    blend: blends[i],
    score: scoreOf(goal, e.metrics, blends[i], weights),
  }));
  // Deterministic order: score, then pinch balance, then splits (stable, reproducible).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.metrics.pinchBalance !== a.metrics.pinchBalance)
      return b.metrics.pinchBalance - a.metrics.pinchBalance;
    return JSON.stringify(a.splits).localeCompare(JSON.stringify(b.splits));
  });

  // ---- baseline ----
  const baselineSplits = currentSplits(graph, splitNodeIds);
  const baselineMetrics = metricsOf(baselineSplits);
  const baselineBlend: BlendComponents | null =
    goal === 'blend'
      ? {
          buffer: norm1(evaluated.map((e) => e.metrics.pinchBalance), baselineMetrics.pinchBalance),
          savings: norm1(
            evaluated.map((e) => -e.metrics.shortfall),
            -baselineMetrics.shortfall,
          ),
          debt: norm1(
            evaluated.map((e) => (e.metrics.payoffDays >= NEVER ? -1e18 : -e.metrics.payoffDays)),
            baselineMetrics.payoffDays >= NEVER ? -1e18 : -baselineMetrics.payoffDays,
          ),
        }
      : null;
  const baselineScore = scoreOf(goal, baselineMetrics, baselineBlend, weights);

  // ---- top candidates (re-forecast for full breakdown + drivers) ----
  const money = (c: Cents) => `$${fmtInt(Math.round(Math.abs(c) / 100))}`;
  const goalName = goalNode?.type === 'goal' ? goalNode.name : null;
  const goalTarget = goalNode?.type === 'goal' ? goalNode.targetCents : 0;
  const goalTargetDate = goalNode?.type === 'goal' ? goalNode.targetDate : '';
  const debtName = debtNode?.type === 'debt' ? debtNode.name : null;

  const buildCandidate = (
    splits: CandidateSplits,
    score: number,
    blend: BlendComponents | null,
    rank: number,
  ): OptimizerCandidate => {
    const g = applySplits(graph, splits);
    const res = forecast(g, assumptions, fcastOpts);
    const gp = goalNodeId != null ? res.goals.find((x) => x.nodeId === goalNodeId) : undefined;
    const dp = debtNodeId != null ? res.debts.find((x) => x.nodeId === debtNodeId) : undefined;
    let payoffDate: ISODate | null = null;
    let payoffMonths: number | null = null;
    let interestCents: number | null = null;
    if (debtNode?.type === 'debt') {
      const extra = dp?.extraPaidCents ?? 0;
      const monthlyExtra = Math.round(extra / (assumptions.horizonDays / MONTH_DAYS));
      const payoff = projectDebtPayoff(debtNode, startDate, monthlyExtra);
      if (payoff) {
        payoffDate = payoff.payoffDate;
        payoffMonths = payoff.months;
        interestCents = payoff.totalInterestCents;
      }
    }
    const breakdown: ScoreBreakdown = {
      pinchBalanceCents: res.pinchPoint.balanceCents,
      pinchDate: res.pinchPoint.date,
      shortfallCents: gp ? gp.shortfallAtTargetCents : null,
      debtPayoffDate: payoffDate,
      debtPayoffMonths: payoffMonths,
      debtInterestCents: interestCents,
      blend,
    };
    const deltaVsBaseline = score - baselineScore;
    const shift = biggestShift(graph, splitNodeIds, baselineSplits, splits);

    const pinchLine = `Lowest spendable balance ${money(res.pinchPoint.balanceCents)} on ${res.pinchPoint.date}, driven by ${driversText(res.pinchPoint.drivers)}.`;
    let goalLine = '';
    let deltaLabel = '';
    if (goal === 'maxBuffer') {
      const d = res.pinchPoint.balanceCents - baselineMetrics.pinchBalance;
      deltaLabel = d === 0 ? 'same minimum' : `${fmtMoney(d)} min balance`;
      goalLine =
        d === 0
          ? `Matches your current splits' tightest point.`
          : `That's ${money(d)} ${d > 0 ? 'higher' : 'lower'} than your current splits' minimum of ${money(baselineMetrics.pinchBalance)}.`;
    } else if (goal === 'savingsGoal' && gp) {
      const short = gp.shortfallAtTargetCents;
      const perMonth = Math.round(gp.savedCents / (assumptions.horizonDays / MONTH_DAYS));
      goalLine =
        short === 0
          ? `Routes about ${money(perMonth)}/mo toward ${goalName}, hitting the ${money(goalTarget)} target${gp.hitDate ? ` on ${gp.hitDate}` : ` by ${goalTargetDate}`}.`
          : `Routes about ${money(perMonth)}/mo toward ${goalName} — still ${money(short)} short of the ${money(goalTarget)} target on ${goalTargetDate}.`;
      const d = baselineMetrics.shortfall - short;
      deltaLabel = d === 0 ? 'same shortfall' : `${money(d)} less shortfall`;
      goalLine +=
        d === 0
          ? ` Same shortfall as your current splits, with the highest minimum balance among ties.`
          : ` That's ${money(d)} less shortfall than your current splits.`;
    } else if (goal === 'debtFastest' && debtName) {
      if (payoffDate && payoffMonths != null && interestCents != null) {
        goalLine = `${debtName} pays off ${payoffDate} (${payoffMonths} months) with ${money(interestCents)} total interest.`;
        // Delta vs the baseline payoff is filled in after buildCandidate.
      } else {
        goalLine = `${debtName} never fully pays off at this allocation — the payment doesn't cover monthly interest.`;
      }
      deltaLabel = '';
    } else if (goal === 'blend' && blend) {
      const wsum = weights.buffer + weights.savings + weights.debt || 1;
      const wb = Math.round((weights.buffer / wsum) * 100);
      const ws = Math.round((weights.savings / wsum) * 100);
      const wd = Math.round((weights.debt / wsum) * 100);
      goalLine = `Blend score ${score.toFixed(3)} — buffer ${blend.buffer.toFixed(2)}, savings ${blend.savings.toFixed(2)}, debt ${blend.debt.toFixed(2)} (weights ${wb}/${ws}/${wd}).`;
      deltaLabel = `score ${score.toFixed(3)} vs ${baselineScore.toFixed(3)}`;
    }

    const explanation = [pinchLine, goalLine, shift ? `Biggest shift: ${shift}.` : '']
      .filter(Boolean)
      .join(' ');

    return {
      rank,
      splits,
      score,
      scoreBreakdown: breakdown,
      drivers: res.pinchPoint.drivers,
      deltaVsBaseline,
      deltaLabel,
      explanation,
    };
  };

  // Baseline debt payoff for honest debt deltas (recomputed once, not per candidate).
  const baselineDebtPayoff =
    debtNode?.type === 'debt'
      ? (() => {
          const g = applySplits(graph, baselineSplits);
          const res = forecast(g, assumptions, fcastOpts);
          const extra = res.debts.find((x) => x.nodeId === debtNodeId)?.extraPaidCents ?? 0;
          return projectDebtPayoff(
            debtNode,
            startDate,
            Math.round(extra / (assumptions.horizonDays / MONTH_DAYS)),
          );
        })()
      : null;

  const candidates = scored.slice(0, topN).map((s, i) => {
    const c = buildCandidate(s.splits, s.score, s.blend, i + 1);
    // Fill in the debt delta label now that the baseline payoff is known.
    if (goal === 'debtFastest' && debtName) {
      const bd = c.scoreBreakdown;
      if (bd.debtPayoffDate && bd.debtPayoffMonths != null && bd.debtInterestCents != null) {
        if (baselineDebtPayoff) {
          const daysSooner = Math.round(
            (baselineDebtPayoff.months - bd.debtPayoffMonths) * MONTH_DAYS,
          );
          const intSaved = baselineDebtPayoff.totalInterestCents - bd.debtInterestCents;
          c.deltaLabel =
            daysSooner === 0 && intSaved === 0
              ? 'matches current payoff'
              : `${daysSooner} days sooner, ${money(intSaved)} less interest`;
          c.explanation +=
            daysSooner === 0 && intSaved === 0
              ? ` Matches your current splits' payoff.`
              : ` That's ${daysSooner} days sooner than your current splits, saving ${money(intSaved)} in interest.`;
        } else {
          c.deltaLabel = `pays off ${bd.debtPayoffDate}`;
          c.explanation += ` Your current splits never pay it off.`;
        }
      }
    }
    return c;
  });

  // Baseline breakdown for the UI (same shape as candidates).
  const baselineFull = buildCandidate(baselineSplits, baselineScore, baselineBlend, 0);

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsedMs = t1 - t0;

  const fmtCombos = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  let searchNote =
    searchMode === 'full'
      ? `Searched all ${fmtCombos(combosTotal)} allocations at ${stepUsed}% steps.`
      : searchMode === 'coarsened'
        ? `Full 5% grid was ${fmtCombos(combosTotal)} combos — searched all ${fmtCombos(combosEvaluated)} at ${stepUsed}% steps instead.`
        : `Full grid was ${fmtCombos(combosTotal)} combos — evaluated a seeded sample of ${fmtCombos(combosEvaluated)} (reproducible; raise the cap for more).`;
  if (excludedSplits.length > 0) {
    searchNote +=
      ' Skipped ' +
      excludedSplits.map((s) => `"${s.label}" (${s.reason})`).join('; ') +
      ' — their percentages cannot change the forecast.';
  }

  return {
    goal,
    candidates,
    baselineSplits,
    baselineScore,
    baselineBreakdown: baselineFull.scoreBreakdown,
    combosEvaluated,
    combosTotal,
    searchMode,
    stepUsed: stepUsed,
    elapsedMs,
    splitNodeIds,
    excludedSplits,
    goalNodeId,
    debtNodeId,
    weights,
    searchNote,
  };
}

function norm1(vals: number[], v: number): number {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  if (!(hi > lo)) return 0.5;
  return (v - lo) / (hi - lo);
}
