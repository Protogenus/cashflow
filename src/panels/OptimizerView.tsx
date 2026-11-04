/**
 * panels/OptimizerView.tsx — brute-force split optimizer UI (milestone 5).
 *
 * Goal picker (4 objectives + blend weights), split-node selection, ranked
 * candidate cards with real explanations, and an undoable Apply. Runs
 * synchronously on the main thread; typical searches finish in well under
 * 3 seconds (the engine reports its own wall time).
 */
import { useMemo, useState } from 'react';
import {
  applySplits,
  graphFingerprint,
  optimize,
  validateGraph,
  type BlendWeights,
  type NodeId,
  type OptimizeResult,
  type OptimizerGoal,
  type PercentageSplitNode,
} from '../engine';
import { useGraphStore } from '../store/graphStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useAssumptionsStore } from '../store/assumptionsStore';
import { useResultsStore } from '../store/resultsStore';
import { createNode } from '../canvas/templates';
import { formatDateLong, formatMoney, formatMoneyWhole } from '../lib/format';

const GOALS: { id: OptimizerGoal; title: string; blurb: string }[] = [
  { id: 'maxBuffer', title: 'Maximize safety buffer', blurb: 'Highest possible lowest balance over the horizon.' },
  { id: 'savingsGoal', title: 'Hit savings goal by date', blurb: 'Minimize the shortfall vs. the goal target on its date.' },
  { id: 'debtFastest', title: 'Pay debt fastest', blurb: 'Earliest payoff date, then least total interest.' },
  { id: 'blend', title: 'Weighted blend', blurb: 'Combine all three with your own weights.' },
];

function CandidateCard({
  candidate,
  result,
  onApply,
}: {
  candidate: OptimizeResult['candidates'][number];
  result: OptimizeResult;
  onApply: (c: OptimizeResult['candidates'][number]) => void;
}) {
  const nodes = useGraphStore((s) => s.nodes);
  const [expanded, setExpanded] = useState(candidate.rank === 1);
  const splitNodes = useMemo(() => {
    const map = new Map<NodeId, PercentageSplitNode>();
    for (const n of nodes) if (n.type === 'percentageSplit') map.set(n.id, n);
    return map;
  }, [nodes]);

  return (
    <div className="cf-panel p-3" style={candidate.rank === 1 ? { borderColor: 'var(--accent)' } : undefined}>
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: candidate.rank === 1 ? 'var(--accent)' : 'var(--surface-2)', color: candidate.rank === 1 ? '#fff' : 'var(--text)' }}
        >
          {candidate.rank}
        </span>
        <span className="text-xs font-semibold">{candidate.deltaLabel || 'Top candidate'}</span>
        <button
          className="cf-btn ml-auto px-2 py-0.5 text-xs"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide' : 'Why?'}
        </button>
        <button className="cf-btn cf-btn-primary px-3 py-0.5 text-xs" onClick={() => onApply(candidate)}>
          Apply
        </button>
      </div>

      {/* splits */}
      <div className="mt-2 flex flex-col gap-1">
        {result.splitNodeIds.map((id) => {
          const node = splitNodes.get(id);
          if (!node) return null;
          const percents = candidate.splits[id] ?? [];
          return (
            <div key={id} className="text-xs">
              <span className="font-semibold">{node.label}: </span>
              <span className="money" style={{ color: 'var(--text-muted)' }}>
                {node.outputs.map((o, i) => `${o.label} ${percents[i] ?? o.percent}%`).join(' · ')}
              </span>
            </div>
          );
        })}
      </div>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs leading-relaxed">{candidate.explanation}</p>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {candidate.scoreBreakdown.shortfallCents != null && (
              <div>Shortfall at goal date: {formatMoney(candidate.scoreBreakdown.shortfallCents)}</div>
            )}
            {candidate.scoreBreakdown.debtPayoffDate && (
              <div>
                Payoff {formatDateLong(candidate.scoreBreakdown.debtPayoffDate)} · interest{' '}
                {formatMoney(candidate.scoreBreakdown.debtInterestCents ?? 0)}
              </div>
            )}
            {candidate.scoreBreakdown.blend && (
              <div>
                Blend — buffer {candidate.scoreBreakdown.blend.buffer.toFixed(2)} · savings{' '}
                {candidate.scoreBreakdown.blend.savings.toFixed(2)} · debt{' '}
                {candidate.scoreBreakdown.blend.debt.toFixed(2)}
              </div>
            )}
            <div>
              Lowest point {formatMoneyWhole(candidate.scoreBreakdown.pinchBalanceCents)} on{' '}
              {formatDateLong(candidate.scoreBreakdown.pinchDate)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function OptimizerView() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const assumptions = useAssumptionsStore((s) => s.assumptions);
  const activeScenario = useScenarioStore((s) => s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0]);
  const setOptimizer = useResultsStore((s) => s.setOptimizer);
  const storedOptimizer = useResultsStore((s) => s.optimizer);
  const storedFingerprint = useResultsStore((s) => s.optimizerFingerprint);

  const [goal, setGoal] = useState<OptimizerGoal>('maxBuffer');
  const [weights, setWeights] = useState<BlendWeights>({ buffer: 40, savings: 40, debt: 20 });
  const [checkedSplits, setCheckedSplits] = useState<NodeId[] | null>(null); // null = all
  const [goalNodeId, setGoalNodeId] = useState<string>('');
  const [debtNodeId, setDebtNodeId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [ranMs, setRanMs] = useState<number | null>(null);

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const splitNodes = useMemo(
    () => nodes.filter((n): n is PercentageSplitNode => n.type === 'percentageSplit' && n.outputs.length >= 2),
    [nodes],
  );
  const goalNodes = useMemo(() => nodes.filter((n) => n.type === 'goal'), [nodes]);
  const debtNodes = useMemo(() => nodes.filter((n) => n.type === 'debt'), [nodes]);
  const fingerprint = useMemo(
    () => graphFingerprint(graph, assumptions, activeScenario.disabledNodeIds),
    [graph, assumptions, activeScenario.disabledNodeIds],
  );
  const stale = storedOptimizer != null && storedFingerprint !== fingerprint;
  const result = stale ? null : storedOptimizer;

  const validation = useMemo(() => validateGraph(graph), [graph]);
  const effectiveSplits = checkedSplits ?? splitNodes.map((n) => n.id);

  const run = () => {
    setError(null);
    try {
      const t0 = performance.now();
      const res = optimize(graph, assumptions, {
        goal,
        splitNodeIds: effectiveSplits,
        goalNodeId: goalNodeId || undefined,
        debtNodeId: debtNodeId || undefined,
        weights: goal === 'blend' ? weights : undefined,
        startDate: undefined,
        disabledNodeIds: activeScenario.disabledNodeIds,
      });
      const t1 = performance.now();
      setRanMs(t1 - t0);
      setOptimizer(res, graphFingerprint(graph, assumptions, activeScenario.disabledNodeIds));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const applyCandidate = (c: OptimizeResult['candidates'][number]) => {
    const st = useGraphStore.getState();
    st.beginEdit();
    const next = applySplits(graph, c.splits);
    for (const n of next.nodes) {
      if (n.type === 'percentageSplit') {
        st.updateNode(n.id, () => n);
      }
    }
    st.commitEdit();
    useGraphStore.setState({ toast: `Applied candidate #${c.rank} splits — undo with Ctrl+Z.` });
  };

  const addSplitNode = () => {
    const st = useGraphStore.getState();
    const count = st.nodes.length;
    st.addNode(createNode('percentageSplit', { x: 120 + (count % 5) * 40, y: 120 + (count % 5) * 30 }));
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">Split optimizer</h2>
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Searches split-percentage allocations in 5% steps and ranks the best for
          your goal. Every candidate is a real forecast of your graph.
        </p>
      </div>

      {/* goal picker */}
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Optimization goal">
        {GOALS.map((g) => {
          const disabled =
            (g.id === 'savingsGoal' && goalNodes.length === 0) ||
            (g.id === 'debtFastest' && debtNodes.length === 0);
          return (
            <label
              key={g.id}
              className="cf-panel flex cursor-pointer items-start gap-2 p-2"
              style={disabled ? { opacity: 0.5 } : goal === g.id ? { borderColor: 'var(--accent)' } : undefined}
            >
              <input
                type="radio"
                name="opt-goal"
                className="mt-0.5"
                checked={goal === g.id}
                disabled={disabled}
                onChange={() => setGoal(g.id)}
              />
              <span>
                <span className="block text-xs font-semibold">{g.title}</span>
                <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {g.blurb}
                  {g.id === 'savingsGoal' && goalNodes.length === 0 && ' (needs a goal node)'}
                  {g.id === 'debtFastest' && debtNodes.length === 0 && ' (needs a debt node)'}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {/* blend weights */}
      {goal === 'blend' && (
        <div className="cf-panel flex flex-col gap-2 p-3">
          <div className="text-xs font-semibold">Blend weights</div>
          {(['buffer', 'savings', 'debt'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-xs">
              <span className="w-16 capitalize" style={{ color: 'var(--text-muted)' }}>{k}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={weights[k]}
                onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
                className="flex-1"
                aria-label={`${k} weight`}
              />
              <span className="money w-8 text-right">{weights[k]}</span>
            </label>
          ))}
        </div>
      )}

      {/* goal / debt node pickers */}
      {(goal === 'savingsGoal' || goal === 'blend') && goalNodes.length > 1 && (
        <label className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>Goal</span>
          <select
            className="rounded border px-1 py-0.5 text-xs"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
            value={goalNodeId}
            onChange={(e) => setGoalNodeId(e.target.value)}
          >
            <option value="">First goal ({goalNodes[0].label})</option>
            {goalNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </select>
        </label>
      )}
      {(goal === 'debtFastest' || goal === 'blend') && debtNodes.length > 1 && (
        <label className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>Debt</span>
          <select
            className="rounded border px-1 py-0.5 text-xs"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
            value={debtNodeId}
            onChange={(e) => setDebtNodeId(e.target.value)}
          >
            <option value="">First debt ({debtNodes[0].label})</option>
            {debtNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </select>
        </label>
      )}

      {/* split selection */}
      {splitNodes.length > 0 ? (
        <div className="cf-panel p-2">
          <div className="px-1 py-1 text-xs font-semibold">Splits to optimize</div>
          {splitNodes.map((n) => (
            <label key={n.id} className="flex items-center gap-2 px-1 py-0.5 text-xs">
              <input
                type="checkbox"
                checked={effectiveSplits.includes(n.id)}
                onChange={() =>
                  setCheckedSplits((prev) => {
                    const cur = prev ?? splitNodes.map((x) => x.id);
                    return cur.includes(n.id) ? cur.filter((x) => x !== n.id) : [...cur, n.id];
                  })
                }
              />
              {n.label}
              <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {n.outputs.length} outputs
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="cf-panel p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No percentage-split nodes yet.</p>
          <p className="mt-1">Add a percentage-split node and wire an output to a goal or debt node to let the optimizer explore allocations.</p>
          <button className="cf-btn mt-2 text-xs" onClick={addSplitNode}>+ Add split node</button>
        </div>
      )}

      {!validation.valid && (
        <div className="cf-panel p-3 text-xs" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          Fix {validation.errors.length} graph error{validation.errors.length === 1 ? '' : 's'} before optimizing.
        </div>
      )}

      <button
        className="cf-btn cf-btn-primary py-2 text-sm font-semibold"
        disabled={splitNodes.length === 0 || !validation.valid}
        onClick={run}
      >
        Find best splits
      </button>

      {error && (
        <div className="cf-panel p-3 text-xs" style={{ borderColor: 'var(--warning)' }}>
          <span className="font-semibold" style={{ color: 'var(--warning)' }}>Can't optimize: </span>
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {result.searchNote}{' '}
            {ranMs != null && <span>Searched in {(ranMs / 1000).toFixed(1)}s on this machine.</span>}
          </div>
          {result.candidates.map((c) => (
            <CandidateCard key={c.rank} candidate={c} result={result} onApply={applyCandidate} />
          ))}
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Based on your inputs — not financial advice. Applying writes the
            candidate's percentages into your graph (undoable). The tradeoff tab
            shows what each candidate costs in uncertainty.
          </p>
        </div>
      )}
    </div>
  );
}
