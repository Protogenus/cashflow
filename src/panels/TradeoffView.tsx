/**
 * panels/TradeoffView.tsx — optimizer × Monte Carlo tradeoff table (milestone 7).
 *
 * Each of the optimizer's top candidates is stress-tested with a reduced
 * Monte Carlo (default 1,000 runs) in the Web Worker, sequentially, with
 * progress ("Candidate 2 of 5…") and cancel. Sortable columns; expandable
 * rows show the candidate's explanation and its fan chart.
 */
import { Fragment, useMemo, useState } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  applySplits,
  graphFingerprint,
  type MonteCarloResult,
  type OptimizerCandidate,
  type PercentageSplitNode,
} from '../engine';
import { useGraphStore } from '../store/graphStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useAssumptionsStore } from '../store/assumptionsStore';
import { useResultsStore, type TradeoffRow } from '../store/resultsStore';
import { useSimWorker } from '../workers/useSimWorker';
import { formatDateLong, formatDateShort, formatMoneyWhole } from '../lib/format';

type SortKey = 'goalScore' | 'overdraft' | 'minP5' | 'rentMiss';

/**
 * Run token, module-level: the per-candidate chain must survive a tab
 * switch (which remounts this view). A ref would reset to 0 on remount and
 * the background chain would halt at the next candidate.
 */
let tradeoffRunToken = 0;

function MiniFan({ mc }: { mc: MonteCarloResult }) {
  const data = useMemo(
    () =>
      mc.bands.map((b) => ({
        date: b.date,
        r90: [b.p5 / 100, b.p95 / 100] as [number, number],
        r50: [b.p25 / 100, b.p75 / 100] as [number, number],
        p50: b.p50 / 100,
      })),
    [mc],
  );
  return (
    <ResponsiveContainer width="100%" height={120} role="img" aria-label="Candidate fan chart">
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDateShort(d)}
          tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
          interval={Math.floor(data.length / 3)}
          minTickGap={8}
        />
        <YAxis
          tickFormatter={(v: number) => `$${Math.round(v / 100) / 10}k`}
          tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
          width={40}
        />
        <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 4" />
        <Area type="monotone" dataKey="r90" fill="var(--band-90)" stroke="none" />
        <Area type="monotone" dataKey="r50" fill="var(--band-50)" stroke="none" />
        <Line type="monotone" dataKey="p50" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function splitSummary(
  candidate: OptimizerCandidate,
  splitNodes: Map<string, PercentageSplitNode>,
): string {
  return Object.entries(candidate.splits)
    .map(([id, percents]) => {
      const node = splitNodes.get(id);
      if (!node) return '';
      return `${node.label}: ${node.outputs.map((o, i) => `${o.label} ${percents[i] ?? o.percent}%`).join(' / ')}`;
    })
    .filter(Boolean)
    .join(' · ');
}

function goalScoreLabel(c: OptimizerCandidate, goal: string): string {
  const b = c.scoreBreakdown;
  switch (goal) {
    case 'maxBuffer':
      return `${formatMoneyWhole(b.pinchBalanceCents)} min`;
    case 'savingsGoal':
      return b.shortfallCents === 0 ? 'Goal hit' : `${formatMoneyWhole(b.shortfallCents ?? 0)} short`;
    case 'debtFastest':
      return b.debtPayoffDate ? `Payoff ${formatDateShort(b.debtPayoffDate)}` : 'Never pays off';
    case 'blend':
      return `Score ${c.score.toFixed(3)}`;
    default:
      return c.score.toFixed(2);
  }
}

export function TradeoffView() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const assumptions = useAssumptionsStore((s) => s.assumptions);
  const activeScenario = useScenarioStore((s) => s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0]);
  const optimizer = useResultsStore((s) => s.optimizer);
  const optimizerFingerprint = useResultsStore((s) => s.optimizerFingerprint);
  const tradeoff = useResultsStore((s) => s.tradeoff);
  const tradeoffFingerprint = useResultsStore((s) => s.tradeoffFingerprint);
  const setTradeoff = useResultsStore((s) => s.setTradeoff);
  const progress = useResultsStore((s) => s.tradeoffProgress);
  const setTradeoffProgress = useResultsStore((s) => s.setTradeoffProgress);
  const running = useResultsStore((s) => s.tradeoffRunning);
  const setTradeoffRunning = useResultsStore((s) => s.setTradeoffRunning);
  const { run, cancel } = useSimWorker('tradeoff');

  const [mcRuns, setMcRuns] = useState(1000);
  const [seed, setSeed] = useState(() => assumptions.mcSeed);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('overdraft');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState<number | null>(0);

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const splitNodes = useMemo(() => {
    const map = new Map<string, PercentageSplitNode>();
    for (const n of nodes) if (n.type === 'percentageSplit') map.set(n.id, n);
    return map;
  }, [nodes]);

  const currentFingerprint = useMemo(() => {
    const base = optimizerFingerprint ?? 'none';
    const g = graphFingerprint(graph, assumptions, activeScenario.disabledNodeIds);
    return `${base}|${mcRuns}|${seed}|${g}`;
  }, [optimizerFingerprint, mcRuns, seed, graph, assumptions, activeScenario.disabledNodeIds]);
  const stale = tradeoff != null && tradeoffFingerprint !== currentFingerprint;
  const rows = stale ? null : tradeoff;

  const sorted = useMemo(() => {
    if (!rows) return null;
    const val = (r: TradeoffRow): number => {
      switch (sortKey) {
        case 'goalScore': return r.goalScore;
        case 'overdraft': return r.overdraftChance;
        case 'minP5': return r.minBalanceP5;
        case 'rentMiss': return r.rentMissChance;
      }
    };
    return [...rows].sort((a, b) => (val(a) - val(b)) * sortDir);
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(key === 'goalScore' || key === 'minP5' ? -1 : 1);
    }
  };

  const buildRow = (c: OptimizerCandidate, mc: MonteCarloResult, index: number): TradeoffRow => {
    const minP5 = Math.min(...mc.bands.map((b) => b.p5));
    const rentMiss =
      mc.rentByMonth.length > 0
        ? Math.max(...mc.rentByMonth.map((r) => 1 - r.probCovered))
        : 0;
    return {
      candidateIndex: index,
      label: `Candidate ${c.rank}`,
      splits: c.splits,
      goalScore: c.score,
      goalScoreLabel: goalScoreLabel(c, optimizer?.goal ?? ''),
      overdraftChance: 1 - mc.probAboveZero,
      minBalanceP5: minP5,
      rentMissChance: rentMiss,
      explanation: c.explanation,
      pinchDate: c.scoreBreakdown.pinchDate,
      drivers: c.drivers.map((d) => ({ name: d.name, contributionCents: d.contributionCents })),
      monteCarlo: mc,
    };
  };

  const runAll = () => {
    if (!optimizer) return;
    setError(null);
    setTradeoffRunning(true);
    setExpanded(0);
    const runId = ++tradeoffRunToken;
    const cands = optimizer.candidates;
    const collected: TradeoffRow[] = [];
    const disabledNodeIds = [...activeScenario.disabledNodeIds];
    let i = 0;

    const finish = () => {
      if (runId !== tradeoffRunToken) return; // cancelled
      setTradeoffRunning(false);
      setTradeoffProgress(null);
      setTradeoff(collected, currentFingerprint);
    };

    const next = () => {
      if (runId !== tradeoffRunToken) return;
      if (i >= cands.length) {
        finish();
        return;
      }
      const c = cands[i];
      setTradeoffProgress({ candidate: i + 1, total: cands.length, done: 0, totalRuns: mcRuns });
      const g = applySplits(graph, c.splits);
      run(
        {
          id: `trade_${runId}_${i}`,
          kind: 'montecarlo',
          graph: structuredClone(g),
          assumptions: structuredClone(assumptions),
          options: { runs: mcRuns, seed, disabledNodeIds },
        },
        {
          onProgress: (done, total) => {
            if (runId === tradeoffRunToken) {
              setTradeoffProgress({ candidate: i + 1, total: cands.length, done, totalRuns: total });
            }
          },
          onDone: (res) => {
            if (runId !== tradeoffRunToken) return;
            collected.push(buildRow(c, res, i));
            i++;
            next();
          },
          onError: (message) => {
            if (runId !== tradeoffRunToken) return;
            setTradeoffRunning(false);
            setTradeoffProgress(null);
            setError(message);
          },
        },
      );
    };
    next();
  };

  const onCancel = () => {
    tradeoffRunToken++; // invalidate the in-flight chain
    cancel();
    setTradeoffRunning(false);
    setTradeoffProgress(null);
  };

  const headers: { key: SortKey; label: string; hint: string }[] = [
    { key: 'goalScore', label: 'Goal score', hint: 'Optimizer score for the chosen goal' },
    { key: 'overdraft', label: 'Overdraft chance', hint: 'Share of runs that dipped below $0' },
    { key: 'minP5', label: 'Min balance (p5)', hint: 'Worst 5% of runs: lowest balance reached' },
    { key: 'rentMiss', label: 'Rent-miss chance', hint: 'Worst month: chance rent was not coverable' },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">Tradeoff table</h2>
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Each optimizer candidate, stress-tested with randomized futures. Pick the
          tradeoff you can live with — there is no single winner.
        </p>
      </div>

      {!optimizer ? (
        <div className="cf-panel p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No optimizer candidates yet.</p>
          <p className="mt-1">Run the optimizer first — its top candidates will appear here for stress-testing.</p>
        </div>
      ) : (
        <>
          <div className="cf-panel flex flex-col gap-2 p-3">
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {optimizer.candidates.length} candidates · goal: <b>{optimizer.goal}</b>
              {optimizerFingerprint !== graphFingerprint(graph, assumptions, activeScenario.disabledNodeIds) && (
                <span style={{ color: 'var(--warning)' }}> — plan changed since optimizing; re-run the optimizer first.</span>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Runs per candidate</span>
              <input
                type="range"
                min={500}
                max={5000}
                step={500}
                value={mcRuns}
                onChange={(e) => setMcRuns(Number(e.target.value))}
                className="flex-1"
                disabled={running}
                aria-label="Monte Carlo runs per candidate"
              />
              <span className="money w-14 text-right">{mcRuns.toLocaleString()}</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Seed</span>
              <input
                type="number"
                className="w-28 rounded border px-1 py-0.5 text-xs money"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                value={seed}
                onChange={(e) => setSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                disabled={running}
                aria-label="Random seed"
              />
            </label>
            {!running ? (
              <button className="cf-btn cf-btn-primary py-2 text-sm font-semibold" onClick={runAll}>
                Stress-test candidates
              </button>
            ) : (
              <button className="cf-btn py-2 text-sm font-semibold" onClick={onCancel}>
                Cancel
              </button>
            )}
            {progress && (
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Candidate {progress.candidate} of {progress.total}…{' '}
                {progress.done.toLocaleString()} / {progress.totalRuns.toLocaleString()} runs
              </div>
            )}
            {error && (
              <div className="text-xs" style={{ color: 'var(--danger)' }}>{error}</div>
            )}
          </div>

          {stale && (
            <div className="cf-panel p-2 text-xs" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
              Inputs changed since this ran — re-run the stress test for current numbers.
            </div>
          )}

          {sorted && sorted.length > 0 && (
            <div className="cf-panel overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-muted)' }} className="text-left">
                    <th className="p-2 font-semibold">Candidate</th>
                    {headers.map((h) => (
                      <th key={h.key} className="p-2 text-right font-semibold">
                        <button
                          onClick={() => toggleSort(h.key)}
                          title={h.hint}
                          className="underline decoration-dotted underline-offset-2"
                          style={{ color: sortKey === h.key ? 'var(--text)' : 'var(--text-muted)' }}
                        >
                          {h.label} {sortKey === h.key ? (sortDir === 1 ? '▲' : '▼') : ''}
                        </button>
                      </th>
                    ))}
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody className="money">
                  {sorted.map((r) => {
                    const cand = optimizer.candidates[r.candidateIndex];
                    const isOpen = expanded === r.candidateIndex;
                    return (
                      <Fragment key={r.candidateIndex}>
                        <tr
                          className="border-t"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <td className="p-2" style={{ fontFamily: 'inherit' }}>
                            <div className="font-semibold">{r.label}</div>
                            <div className="text-[10px] font-normal" style={{ color: 'var(--text-muted)', fontFamily: 'inherit' }}>
                              {cand ? splitSummary(cand, splitNodes) : ''}
                            </div>
                          </td>
                          <td className="p-2 text-right">{r.goalScoreLabel}</td>
                          <td className="p-2 text-right" style={{ color: r.overdraftChance > 0.2 ? 'var(--danger)' : r.overdraftChance > 0.05 ? 'var(--warning)' : 'var(--income)' }}>
                            {Math.round(r.overdraftChance * 100)} of 100
                          </td>
                          <td className="p-2 text-right">{formatMoneyWhole(r.minBalanceP5)}</td>
                          <td className="p-2 text-right">{Math.round(r.rentMissChance * 100)} of 100</td>
                          <td className="p-2 text-right">
                            <button
                              className="cf-btn px-2 py-0.5 text-[11px]"
                              onClick={() => setExpanded(isOpen ? null : r.candidateIndex)}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? 'Hide' : 'Why?'}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                            <td colSpan={6} className="p-2">
                              <p className="text-[11px] leading-relaxed" style={{ fontFamily: 'inherit' }}>{r.explanation}</p>
                              {r.drivers.length > 0 && (
                                <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)', fontFamily: 'inherit' }}>
                                  Pinch drivers: {r.drivers.slice(0, 3).map((d) => `${d.name} (${formatMoneyWhole(d.contributionCents)})`).join(' · ')}
                                  {' '}on {formatDateLong(r.pinchDate)}
                                </div>
                              )}
                              <div className="mt-2">
                                <MiniFan mc={r.monteCarlo} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="cf-panel p-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <span className="font-semibold" style={{ color: 'var(--text)' }}>How to read this. </span>
            Each row is one of the optimizer's top candidates, stress-tested with {mcRuns.toLocaleString()} randomized
            futures. <b>Overdraft chance</b> = share of runs that dipped below $0 at any point. <b>Min balance (p5)</b> =
            in the worst 5% of runs, the lowest the balance got. <b>Rent-miss chance</b> = the worst month's chance the
            rent bill wasn't coverable that day. Higher goal scores are better; lower chances are better. A candidate
            with a great goal score but a 30-in-100 overdraft chance is fragile — that is the tradeoff.
            Based on your inputs — not financial advice.
          </div>
        </>
      )}
    </div>
  );
}
