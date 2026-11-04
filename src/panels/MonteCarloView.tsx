/**
 * panels/MonteCarloView.tsx — Monte Carlo forecast UI (milestone 6).
 *
 * Runs thousands of randomized forecasts in a Web Worker (progress + cancel,
 * UI stays responsive), renders the fan chart (p5–p95 / p25–p75 bands, median
 * line labeled as median, deterministic overlay), frequency-framed
 * probability readouts, rent-cover by month, a shock-event editor, and the
 * seed for reproducible re-runs.
 */
import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  graphFingerprint,
  isIncomeSource,
  validateGraph,
  type ISODate,
  type MonteCarloResult,
  type ShockEvent,
} from '../engine';
import { addDays, formatISODate, parseISODate, toLocalDate, todayISO } from '../engine/dates';
import { useGraphStore } from '../store/graphStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useAssumptionsStore } from '../store/assumptionsStore';
import { useResultsStore } from '../store/resultsStore';
import { useSimWorker } from '../workers/useSimWorker';
import { formatDateLong, formatDateShort, formatMoneyWhole } from '../lib/format';
import { DISCLAIMER_SHORT } from './AssumptionsPanel';

function axisMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${Math.round(v)}`;
}

function newSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 1000000000;
}

function FanTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { payload?: Record<string, number | [number, number]> }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const p = payload[0].payload!;
  const r90 = p.r90 as [number, number];
  const r50 = p.r50 as [number, number];
  return (
    <div className="cf-panel money p-2 text-xs" style={{ maxWidth: 240 }}>
      <div className="font-semibold">{formatDateLong(label)}</div>
      <div>Median <b>{formatMoneyWhole(Math.round((p.p50 as number) * 100))}</b></div>
      <div style={{ color: 'var(--text-muted)' }}>
        50% interval {formatMoneyWhole(Math.round(r50[0] * 100))} … {formatMoneyWhole(Math.round(r50[1] * 100))}
      </div>
      <div style={{ color: 'var(--text-muted)' }}>
        90% interval {formatMoneyWhole(Math.round(r90[0] * 100))} … {formatMoneyWhole(Math.round(r90[1] * 100))}
      </div>
      <div style={{ color: 'var(--text-muted)' }}>
        Planned (typical) {formatMoneyWhole(Math.round((p.det as number) * 100))}
      </div>
    </div>
  );
}

function FanChart({ result }: { result: MonteCarloResult }) {
  const data = useMemo(
    () =>
      result.bands.map((b, i) => ({
        date: b.date,
        r90: [b.p5 / 100, b.p95 / 100] as [number, number],
        r50: [b.p25 / 100, b.p75 / 100] as [number, number],
        p50: b.p50 / 100,
        det: result.deterministic[i] / 100,
      })),
    [result],
  );
  const summary = useMemo(() => {
    let minP50 = Infinity;
    let minP5 = Infinity;
    let minP5Date = result.dates[0];
    for (const b of result.bands) {
      if (b.p50 < minP50) minP50 = b.p50;
      if (b.p5 < minP5) {
        minP5 = b.p5;
        minP5Date = b.date;
      }
    }
    return (
      `Median balance bottoms at ${formatMoneyWhole(minP50)}; the 90% interval ` +
      `reaches down to ${formatMoneyWhole(minP5)} around ${formatDateLong(minP5Date)}. ` +
      `About ${Math.round(result.probAboveZero * 100)} in 100 runs stayed above $0 ` +
      `over ${result.horizonDays} days.`
    );
  }, [result]);

  return (
    <div className="cf-panel p-2">
      <div className="px-2 pt-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
        Balance fan chart · {result.runs.toLocaleString()} runs · seed {result.seed}
      </div>
      <ResponsiveContainer width="100%" height={280} role="img" aria-label={`Fan chart. ${summary}`}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => formatDateShort(d)}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            interval={Math.floor(data.length / 6)}
            minTickGap={8}
          />
          <YAxis tickFormatter={axisMoney} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={52} />
          <Tooltip content={<FanTooltip />} />
          <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 4" />
          <ReferenceLine
            x={data[0]?.date}
            stroke="var(--text-muted)"
            strokeDasharray="3 3"
            label={{ value: 'today', fontSize: 10, fill: 'var(--text-muted)', position: 'insideTopLeft' }}
          />
          <Area type="monotone" dataKey="r90" fill="var(--band-90)" stroke="none" name="90% interval" />
          <Area type="monotone" dataKey="r50" fill="var(--band-50)" stroke="none" name="50% interval" />
          <Line type="monotone" dataKey="p50" stroke="var(--accent)" strokeWidth={2} dot={false} name="Median" />
          <Line
            type="monotone"
            dataKey="det"
            stroke="var(--text-muted)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            dot={false}
            name="Planned (typical values)"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-4 px-2 pb-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <span><span style={{ color: 'var(--accent)' }}>—</span> Median — not the forecast</span>
        <span><span style={{ color: 'var(--text-muted)' }}>┄</span> Planned (typical values, no shocks)</span>
        <span><span style={{ background: 'var(--band-50)', padding: '0 6px' }}>&nbsp;</span> 50% of runs</span>
        <span><span style={{ background: 'var(--band-90)', padding: '0 6px' }}>&nbsp;</span> 90% of runs</span>
      </div>
      <details className="px-2 pb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <summary className="cursor-pointer underline">Chart text summary</summary>
        <p className="mt-1 leading-relaxed">{summary}</p>
      </details>
    </div>
  );
}

function ShockEditor() {
  const shocks = useAssumptionsStore((s) => s.assumptions.shocks);
  const setAssumptions = useAssumptionsStore((s) => s.set);
  const nodes = useGraphStore((s) => s.nodes);
  const horizonDays = useAssumptionsStore((s) => s.assumptions.horizonDays);
  const incomeNodes = useMemo(() => nodes.filter((n) => isIncomeSource(n)), [nodes]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'oneTime' | 'missedPaycheck'>('oneTime');
  const [amount, setAmount] = useState('600');
  const [date, setDate] = useState('');
  const [incomeId, setIncomeId] = useState('');
  const [prob, setProb] = useState(30);

  const today = todayISO();
  const maxDate = formatISODate(addDays(toLocalDate(parseISODate(today)), horizonDays - 1));

  const save = (next: ShockEvent[]) => setAssumptions({ shocks: next });

  const add = () => {
    const clean = name.trim() || (kind === 'oneTime' ? 'Shock event' : 'Missed paycheck');
    const shock: ShockEvent = {
      id: `shk_${crypto.randomUUID()}`,
      name: clean,
      amountCents: Math.max(0, Math.round(Number(amount) || 0) * 100),
      windowDays: [0, horizonDays],
      probability: Math.min(100, Math.max(0, prob)) / 100,
      enabled: true,
      kind,
      ...(kind === 'oneTime' && date ? { date: date as ISODate } : {}),
      ...(kind === 'missedPaycheck' && incomeId ? { incomeNodeId: incomeId } : {}),
    };
    save([...shocks, shock]);
    setName('');
    setAmount('600');
    setDate('');
    setProb(30);
    setOpen(false);
  };

  return (
    <div className="cf-panel p-2">
      <button
        className="flex w-full items-center justify-between px-1 py-1 text-xs font-semibold"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>Shock events ({shocks.length})</span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {shocks.length > 0 && (
        <div className="flex flex-col gap-1 px-1 pb-1">
          {shocks.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={() => save(shocks.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)))}
                aria-label={`Enable ${s.name}`}
              />
              <span className="min-w-0 flex-1 truncate" style={{ color: s.enabled ? 'var(--text)' : 'var(--text-muted)' }}>
                {s.name}
                <span style={{ color: 'var(--text-muted)' }}>
                  {' '}· {s.kind === 'missedPaycheck' ? 'missed paycheck' : `${formatMoneyWhole(s.amountCents)}${s.date ? ` on ${formatDateShort(s.date)}` : ''}`}
                  {' '}· {Math.round(s.probability * 100)}%
                </span>
              </span>
              <button
                className="cf-btn px-1.5 text-[11px]"
                onClick={() => save(shocks.filter((x) => x.id !== s.id))}
                aria-label={`Remove ${s.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="flex flex-col gap-2 border-t px-1 pt-2" style={{ borderColor: 'var(--border)' }}>
          <label className="text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Name</span>
            <input
              type="text"
              className="mt-0.5 w-full rounded border px-1 py-0.5 text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Car repair"
            />
          </label>
          <label className="text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Kind</span>
            <select
              className="mt-0.5 w-full rounded border px-1 py-0.5 text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              value={kind}
              onChange={(e) => setKind(e.target.value as 'oneTime' | 'missedPaycheck')}
            >
              <option value="oneTime">One-time expense</option>
              <option value="missedPaycheck">Missed paycheck</option>
            </select>
          </label>
          {kind === 'oneTime' ? (
            <>
              <label className="text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Amount $</span>
                <input
                  type="number"
                  min={0}
                  className="mt-0.5 w-full rounded border px-1 py-0.5 text-xs money"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Date (blank = random day)</span>
                <input
                  type="date"
                  min={today}
                  max={maxDate}
                  className="mt-0.5 w-full rounded border px-1 py-0.5 text-xs"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label className="text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Income to skip once</span>
              <select
                className="mt-0.5 w-full rounded border px-1 py-0.5 text-xs"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                value={incomeId}
                onChange={(e) => setIncomeId(e.target.value)}
              >
                <option value="">First income ({incomeNodes[0]?.label ?? 'none'})</option>
                {incomeNodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Chance</span>
            <input
              type="range"
              min={1}
              max={100}
              value={prob}
              onChange={(e) => setProb(Number(e.target.value))}
              className="flex-1"
              aria-label="Per-run probability percent"
            />
            <span className="money w-10 text-right">{prob}%</span>
          </label>
          <button className="cf-btn cf-btn-primary py-1 text-xs" onClick={add}>
            Add shock
          </button>
        </div>
      )}
    </div>
  );
}

export function MonteCarloView({ onOpenAssumptions }: { onOpenAssumptions?: () => void }) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const assumptions = useAssumptionsStore((s) => s.assumptions);
  const activeScenario = useScenarioStore((s) => s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0]);
  const setMonteCarlo = useResultsStore((s) => s.setMonteCarlo);
  const stored = useResultsStore((s) => s.monteCarlo);
  const storedFingerprint = useResultsStore((s) => s.monteCarloFingerprint);
  const progress = useResultsStore((s) => s.mcProgress);
  const setMcProgress = useResultsStore((s) => s.setMcProgress);
  const running = useResultsStore((s) => s.mcRunning);
  const setMcRunning = useResultsStore((s) => s.setMcRunning);
  const { run, cancel } = useSimWorker('montecarlo');

  const [runs, setRuns] = useState(2000);
  const [seed, setSeed] = useState(() => assumptions.mcSeed);
  const [error, setError] = useState<string | null>(null);
  const [showFailed, setShowFailed] = useState(false);

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const validation = useMemo(() => validateGraph(graph), [graph]);
  const fingerprint = useMemo(
    () => graphFingerprint(graph, assumptions, activeScenario.disabledNodeIds),
    [graph, assumptions, activeScenario.disabledNodeIds],
  );
  const stale = stored != null && storedFingerprint !== fingerprint;
  const result = stale ? null : stored;

  const start = (useSeed: number) => {
    setError(null);
    setShowFailed(false);
    setMcRunning(true);
    setMcProgress({ done: 0, total: runs });
    run(
      {
        id: `mc_${crypto.randomUUID()}`,
        kind: 'montecarlo',
        graph: structuredClone(graph),
        assumptions: structuredClone(assumptions),
        options: {
          runs,
          seed: useSeed,
          disabledNodeIds: [...activeScenario.disabledNodeIds],
        },
      },
      {
        onProgress: (done, total) => setMcProgress({ done, total }),
        onDone: (res) => {
          setMcRunning(false);
          setMcProgress(null);
          setMonteCarlo(res, fingerprint);
        },
        onError: (message) => {
          setMcRunning(false);
          setMcProgress(null);
          setError(message);
        },
      },
    );
  };

  const onCancel = () => {
    cancel();
    setMcRunning(false);
    setMcProgress(null);
  };

  const in100 = result ? Math.round(result.probAboveZero * 100) : 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">Monte Carlo forecast</h2>
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Thousands of randomized futures from your variable ranges and shock
          events. Same seed + same inputs = identical results, every time.
        </p>
      </div>

      {/* config */}
      <div className="cf-panel flex flex-col gap-2 p-3">
        <label className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>Runs</span>
          <input
            type="range"
            min={500}
            max={10000}
            step={500}
            value={runs}
            onChange={(e) => setRuns(Number(e.target.value))}
            className="flex-1"
            disabled={running}
            aria-label="Simulation runs"
          />
          <span className="money w-14 text-right">{runs.toLocaleString()}</span>
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
          <button
            className="cf-btn px-2 py-0.5 text-[11px]"
            disabled={running}
            onClick={() => setSeed(newSeed())}
            title="Randomize the seed"
            aria-label="Randomize the seed"
          >
            🎲 New
          </button>
        </label>
        {!running ? (
          <button
            className="cf-btn cf-btn-primary py-2 text-sm font-semibold"
            disabled={!validation.valid}
            onClick={() => start(seed)}
          >
            Run simulation
          </button>
        ) : (
          <button className="cf-btn py-2 text-sm font-semibold" onClick={onCancel}>
            Cancel
          </button>
        )}
        {progress && (
          <div>
            <div
              className="h-2 overflow-hidden rounded"
              style={{ background: 'var(--surface-2)' }}
              role="progressbar"
              aria-valuenow={Math.round((progress.done / progress.total) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Simulation progress"
            >
              <div
                className="h-full rounded"
                style={{
                  width: `${(progress.done / progress.total) * 100}%`,
                  background: 'var(--accent)',
                  transition: 'width 200ms',
                }}
              />
            </div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {progress.done.toLocaleString()} / {progress.total.toLocaleString()} runs…
            </div>
          </div>
        )}
        {!validation.valid && (
          <div className="text-xs" style={{ color: 'var(--danger)' }}>
            Fix {validation.errors.length} graph error{validation.errors.length === 1 ? '' : 's'} to run.
          </div>
        )}
        {error && (
          <div className="text-xs" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}
      </div>

      <ShockEditor />

      {stale && (
        <div className="cf-panel p-2 text-xs" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
          Your plan changed since this ran — re-run the simulation for current numbers.
        </div>
      )}

      {result && (
        <>
          {/* headline */}
          <div className="cf-panel p-3">
            <div className="text-sm leading-snug">
              In <b className="money">{in100} of 100</b> simulated futures your balance stayed positive.
            </div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {(result.probAboveZero * 100).toFixed(1)}% · balance never below $0 over {result.horizonDays} days ·
              seed {result.seed} · {result.runs.toLocaleString()} runs in {(result.elapsedMs / 1000).toFixed(1)}s
            </div>
            <button
              className="cf-btn mt-2 px-2 py-0.5 text-[11px]"
              onClick={() => {
                setSeed(result.seed);
                start(result.seed);
              }}
              disabled={running}
              title="Re-runs with the identical seed — results will match exactly"
            >
              ↻ Re-run with same seed
            </button>
          </div>

          <FanChart result={result} />

          {/* rent by month */}
          {result.rentByMonth.length > 0 && (
            <div className="cf-panel p-3">
              <div className="text-xs font-semibold">Rent cover probability by month</div>
              <div className="mt-2 flex flex-col gap-1.5">
                {result.rentByMonth.map((r) => (
                  <div key={r.month} className="flex items-center gap-2 text-xs">
                    <span className="w-20" style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded" style={{ background: 'var(--surface-2)' }}>
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${r.probCovered * 100}%`,
                          background: r.probCovered >= 0.95 ? 'var(--income)' : r.probCovered >= 0.8 ? 'var(--warning)' : 'var(--danger)',
                        }}
                      />
                    </div>
                    <span className="money w-24 text-right">{Math.round(r.probCovered * 100)} of 100</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* bill coverage */}
          {result.billCoverage.length > 0 && (
            <div className="cf-panel p-3">
              <div className="text-xs font-semibold">Bill cover probability</div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Share of runs where every occurrence of the bill was coverable that day.
              </div>
              <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                {result.billCoverage.slice(0, 12).map((b) => (
                  <div key={b.nodeId} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <span className="money" style={{ color: b.probCovered >= 0.95 ? 'var(--income)' : b.probCovered >= 0.8 ? 'var(--warning)' : 'var(--danger)' }}>
                      {Math.round(b.probCovered * 100)} of 100
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* shocks */}
          {result.shockSummary.length > 0 && (
            <div className="cf-panel p-3 text-xs">
              <div className="font-semibold">Shock events in this run</div>
              <div className="mt-1 flex flex-col gap-0.5" style={{ color: 'var(--text-muted)' }}>
                {result.shockSummary.map((s) => (
                  <div key={s.shockId}>
                    {s.name}: fired in {s.appliedRuns.toLocaleString()} of {result.runs.toLocaleString()} runs
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* failed trials */}
          <div className="cf-panel p-3">
            <button
              className="flex w-full items-center justify-between text-xs font-semibold"
              onClick={() => setShowFailed(!showFailed)}
              aria-expanded={showFailed}
            >
              <span>
                {result.failedCount.toLocaleString()} of {result.runs.toLocaleString()} runs dipped below $0
              </span>
              <span style={{ color: 'var(--text-muted)' }}>{showFailed ? '▾' : '▸'}</span>
            </button>
            {showFailed && (
              <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto text-[11px]">
                {result.failedTrials.slice(0, 20).map((t) => (
                  <div key={t.trialIndex} className="border-t pt-1" style={{ borderColor: 'var(--border)' }}>
                    <span className="font-semibold">Run {t.trialIndex}</span>
                    <span style={{ color: 'var(--text-muted)' }}> · below $0 on {formatDateLong(t.firstNegativeDate)}</span>
                    {t.drivers.length > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        {' '}· driven by {t.drivers.slice(0, 2).map((d) => d.name).join(', ')}
                      </span>
                    )}
                  </div>
                ))}
                {result.failedTrials.length === 0 && result.failedCount > 0 && (
                  <div style={{ color: 'var(--text-muted)' }}>
                    All {result.failedCount} failures are beyond the 200 stored for drill-down.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* assumptions */}
          <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Assumptions: variable bills sampled from min/typical/max (triangular); income lands
            before bills on the same day; paychecks shift to the prior Friday and bills to the
            next Monday on weekends. Doesn&apos;t include taxes, market changes, or spending you
            haven&apos;t entered.{' '}
            {onOpenAssumptions && (
              <button
                className="underline"
                style={{ color: 'var(--accent)' }}
                onClick={onOpenAssumptions}
              >
                Details
              </button>
            )}
            <br />
            {DISCLAIMER_SHORT}
          </div>
        </>
      )}
    </div>
  );
}
