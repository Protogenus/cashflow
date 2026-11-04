/**
 * panels/ForecastView.tsx — deterministic forecast results.
 * Balance chart (Recharts) with buffer line and pinch marker, safe-to-spend
 * headline, lowest-point warning with drivers, per-day event tooltips, and a
 * visible assumptions line. Recomputes live from the Zustand graph store.
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { forecast, validateGraph, type ISODate, type LedgerDay } from '../engine';
import { useGraphStore } from '../store/graphStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useAssumptionsStore } from '../store/assumptionsStore';
import { currencySymbol, formatDateLong, formatDateShort, formatMoney, formatMoneyWhole } from '../lib/format';
import { DISCLAIMER_SHORT } from './AssumptionsPanel';

const HORIZONS = [30, 60, 90, 180];

function axisMoney(v: number): string {
  const sym = currencySymbol();
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sym}${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sym}${Math.round(v)}`;
}

function ForecastTooltip({ active, payload, label, byDate }: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string;
  byDate: Map<ISODate, LedgerDay>;
}) {
  if (!active || !payload?.length || !label) return null;
  const day = byDate.get(label as ISODate);
  if (!day) return null;
  return (
    <div className="cf-panel money p-2 text-xs" style={{ maxWidth: 240 }}>
      <div className="font-semibold">{formatDateLong(day.date)}</div>
      <div className="font-semibold" style={{ color: 'var(--accent)' }}>
        Balance {formatMoney(day.balanceCents)}
      </div>
      {day.events.length > 0 ? (
        <ul className="mt-1">
          {day.events.map((e, i) => (
            <li key={i} style={{ color: e.amountCents >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {e.name} {e.amountCents >= 0 ? `+${formatMoney(e.amountCents)}` : formatMoney(e.amountCents)}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ color: 'var(--text-muted)' }}>No transactions</div>
      )}
    </div>
  );
}

export function ForecastView({ onOpenAssumptions }: { onOpenAssumptions?: () => void }) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const setSelected = useGraphStore((s) => s.setSelected);
  const assumptions = useAssumptionsStore((s) => s.assumptions);
  const setAssumptions = useAssumptionsStore((s) => s.set);
  const activeScenario = useScenarioStore((s) => s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0]);
  const disabledNodeIds = activeScenario.disabledNodeIds;

  const validation = useMemo(() => validateGraph({ nodes, edges }), [nodes, edges]);

  const result = useMemo(() => {
    if (!validation.valid) return null;
    try {
      return forecast({ nodes, edges }, assumptions, { disabledNodeIds });
    } catch {
      return null; // unreachable when validation passes; never a silent wrong chart
    }
  }, [nodes, edges, assumptions, disabledNodeIds, validation.valid]);

  const chart = useMemo(() => {
    if (!result) return null;
    const bufferDollars = assumptions.safetyBufferCents / 100;
    const data = result.ledger.map((d) => ({
      date: d.date,
      balance: d.balanceCents / 100,
      buffer: bufferDollars,
    }));
    const byDate = new Map<ISODate, LedgerDay>(result.ledger.map((d) => [d.date, d]));
    return { data, byDate, bufferDollars };
  }, [result, assumptions.safetyBufferCents]);

  // Text alternative for the chart (DESIGN.md §9): same numbers the chart
  // shows, as sentences — also the basis of the explanation panel.
  const chartSummary = useMemo(() => {
    if (!result) return '';
    let min = Infinity;
    let max = -Infinity;
    let minDate = result.ledger[0]?.date;
    let maxDate = result.ledger[0]?.date;
    for (const d of result.ledger) {
      if (d.balanceCents < min) {
        min = d.balanceCents;
        minDate = d.date;
      }
      if (d.balanceCents > max) {
        max = d.balanceCents;
        maxDate = d.date;
      }
    }
    const days = result.ledger.length;
    return (
      `Projected balance over ${days} days. ` +
      `Lowest point ${formatMoneyWhole(min)} on ${minDate ? formatDateLong(minDate) : '—'}; ` +
      `highest point ${formatMoneyWhole(max)} on ${maxDate ? formatDateLong(maxDate) : '—'}. ` +
      `Safe to spend ${formatMoneyWhole(result.safeToSpendCents)} after the ` +
      `${formatMoneyWhole(assumptions.safetyBufferCents)} buffer.` +
      (result.firstNegativeDate
        ? ` Balance goes below $0 on ${formatDateLong(result.firstNegativeDate)}.`
        : ' Balance stays at or above $0 for the whole window.')
    );
  }, [result, assumptions.safetyBufferCents]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* horizon selector */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Horizon</span>
        <div className="flex gap-1" role="group" aria-label="Forecast horizon">
          {HORIZONS.map((h) => (
            <button
              key={h}
              className={`cf-btn px-3 py-1 text-xs ${assumptions.horizonDays === h ? 'cf-btn-primary' : ''}`}
              onClick={() => setAssumptions({ horizonDays: h })}
              aria-pressed={assumptions.horizonDays === h}
            >
              {h}d
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1 whitespace-nowrap text-xs" style={{ color: 'var(--text-muted)' }}>
          Buffer $
          <input
            type="number"
            min={0}
            step={50}
            className="w-20 max-w-full rounded border px-1 py-0.5 text-xs money"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
            value={assumptions.safetyBufferCents / 100}
            onChange={(e) => {
              const v = Math.max(0, Math.round(Number(e.target.value) || 0) * 100);
              setAssumptions({ safetyBufferCents: v });
            }}
            aria-label="Safety buffer in dollars"
          />
        </label>
      </div>

      {!validation.valid && (
        <div className="cf-panel p-3 text-xs" style={{ borderColor: 'var(--danger)' }}>
          <p className="font-semibold" style={{ color: 'var(--danger)' }}>
            Fix {validation.errors.length} error{validation.errors.length === 1 ? '' : 's'} to run the forecast:
          </p>
          <ul className="mt-1 list-disc pl-4">
            {validation.errors.map((e, i) => (
              <li key={i}>
                {e.message}{' '}
                {e.nodeId && (
                  <button className="underline" style={{ color: 'var(--accent)' }} onClick={() => setSelected(e.nodeId!)}>
                    Go to node
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && chart && (
        <>
          {/* safe to spend */}
          <div className="cf-panel p-3">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Safe to spend
            </div>
            <div
              className="cf-display money text-3xl"
              style={{ color: result.safeToSpendCents < 0 ? 'var(--danger)' : 'var(--text)' }}
            >
              {formatMoneyWhole(result.safeToSpendCents)}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Lowest projected balance minus your {formatMoneyWhole(assumptions.safetyBufferCents)} buffer,
              over the next {assumptions.horizonDays} days.
            </div>
          </div>

          {/* pinch point */}
          <div
            className="cf-panel p-3"
            style={{ borderColor: 'var(--warning)' }}
            role="alert"
          >
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--warning)' }}>
              ◆ Lowest point
            </div>
            <div className="money text-xl font-semibold">
              {formatMoneyWhole(result.pinchPoint.balanceCents)}
              <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                {' '}on {formatDateLong(result.pinchPoint.date)}
              </span>
            </div>
            {result.pinchPoint.drivers.length > 0 ? (
              <div className="mt-1 text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Driven by: </span>
                {result.pinchPoint.drivers
                  .map((d) => `${d.name} (${formatMoney(d.contributionCents)})`)
                  .join(' · ')}
              </div>
            ) : (
              <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                Your starting balance is the lowest point — no bills drag it lower in this window.
              </div>
            )}
            {result.firstNegativeDate && (
              <div className="mt-2 text-xs font-semibold" style={{ color: 'var(--danger)' }}>
                ⚠ Balance goes below $0 on {formatDateLong(result.firstNegativeDate)}.
              </div>
            )}
          </div>

          {/* chart */}
          <div className="cf-panel p-2">
            <div className="px-2 pt-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              Projected balance · {assumptions.horizonDays} days
            </div>
            <ResponsiveContainer width="100%" height={260} role="img" aria-label={`Balance chart. ${chartSummary}`}>
              <LineChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => formatDateShort(d as ISODate)}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  interval={Math.max(1, Math.floor(chart.data.length / 5))}
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={axisMoney}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  width={52}
                />
                <Tooltip content={<ForecastTooltip byDate={chart.byDate} />} />
                <ReferenceLine
                  y={0}
                  stroke="var(--danger)"
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                  name="Projected balance"
                />
                <Line
                  type="monotone"
                  dataKey="buffer"
                  stroke="var(--warning)"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  dot={false}
                  name="Safety buffer"
                />
                <ReferenceDot
                  x={result.pinchPoint.date}
                  y={result.pinchPoint.balanceCents / 100}
                  r={5}
                  fill="var(--warning)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 px-2 pb-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span><span style={{ color: 'var(--accent)' }}>—</span> Projected balance</span>
              <span><span style={{ color: 'var(--warning)' }}>┄</span> Safety buffer</span>
              <span><span style={{ color: 'var(--warning)' }}>◆</span> Lowest point</span>
            </div>
            <details className="px-2 pb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <summary className="cursor-pointer underline">Chart text summary</summary>
              <p className="mt-1 leading-relaxed">{chartSummary}</p>
            </details>
          </div>

          {/* assumptions (visible, per RESEARCH.md §3) */}
          <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Assumptions: income lands before bills on the same day; paychecks shift to the prior
            Friday and bills to the next Monday on weekends; variable bills use their typical value;
            a bill on the 31st lands on the last day of short months — never skipped.{' '}
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
