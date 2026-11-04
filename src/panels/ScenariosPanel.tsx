/**
 * panels/ScenariosPanel.tsx — what-if scenario management (milestone 4).
 *
 * Named scenarios (each a full graph copy + per-scenario node on/off
 * toggles), rename/duplicate/delete, and a compare view: side-by-side
 * forecast charts for up to 3 scenarios plus a comparison table
 * (min balance, min-balance date, safe-to-spend, first-negative date).
 */
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { forecastScenario, type Scenario } from '../engine';
import { useGraphStore } from '../store/graphStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useAssumptionsStore } from '../store/assumptionsStore';
import { formatDateLong, formatDateShort, formatMoneyWhole } from '../lib/format';

function axisMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${Math.round(v)}`;
}

function MiniChart({ scenario }: { scenario: Scenario }) {
  const assumptions = useAssumptionsStore((s) => s.assumptions);
  const data = useMemo(() => {
    try {
      const res = forecastScenario(scenario, assumptions, { skipHash: true });
      return res.ledger.map((d) => ({ date: d.date, balance: d.balanceCents / 100 }));
    } catch {
      return null;
    }
  }, [scenario, assumptions]);
  if (!data) {
    return <div className="p-3 text-xs" style={{ color: 'var(--danger)' }}>Can't forecast this scenario — fix its graph errors.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDateShort(d)}
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          interval={Math.max(1, Math.floor(data.length / 4))}
          minTickGap={8}
        />
        <YAxis tickFormatter={axisMoney} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={44} />
        <Tooltip
          formatter={(v) => [typeof v === 'number' ? formatMoneyWhole(Math.round(v * 100)) : v, 'Balance']}
          labelFormatter={(d) => formatDateLong(String(d))}
        />
        <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="balance" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface CompareRow {
  id: string;
  name: string;
  minBalance: string;
  minDate: string;
  safeToSpend: string;
  firstNegative: string;
  ok: boolean;
}

function CompareView({ scenarios }: { scenarios: Scenario[] }) {
  const assumptions = useAssumptionsStore((s) => s.assumptions);
  const rows: CompareRow[] = useMemo(
    () =>
      scenarios.map((scn) => {
        try {
          const res = forecastScenario(scn, assumptions, { skipHash: true });
          return {
            id: scn.id,
            name: scn.name,
            minBalance: formatMoneyWhole(res.pinchPoint.balanceCents),
            minDate: formatDateShort(res.pinchPoint.date),
            safeToSpend: formatMoneyWhole(res.safeToSpendCents),
            firstNegative: res.firstNegativeDate ? formatDateShort(res.firstNegativeDate) : '—',
            ok: true,
          };
        } catch {
          return {
            id: scn.id, name: scn.name, minBalance: '—', minDate: '—',
            safeToSpend: '—', firstNegative: '—', ok: false,
          };
        }
      }),
    [scenarios, assumptions],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className={`grid gap-3 ${scenarios.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} ${scenarios.length > 2 ? 'xl:grid-cols-3' : ''}`}>
        {scenarios.map((scn) => (
          <div key={scn.id} className="cf-panel p-2">
            <div className="px-1 pb-1 text-xs font-semibold truncate" title={scn.name}>{scn.name}</div>
            <MiniChart scenario={scn} />
          </div>
        ))}
      </div>
      <div className="cf-panel overflow-x-auto p-2">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }} className="text-left">
              <th className="p-1 font-semibold">Scenario</th>
              <th className="p-1 font-semibold text-right">Min balance</th>
              <th className="p-1 font-semibold text-right">Min date</th>
              <th className="p-1 font-semibold text-right">Safe to spend</th>
              <th className="p-1 font-semibold text-right">First below $0</th>
            </tr>
          </thead>
          <tbody className="money">
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="p-1 font-semibold" style={{ fontFamily: 'inherit' }}>{r.name}</td>
                <td className="p-1 text-right">{r.minBalance}</td>
                <td className="p-1 text-right">{r.minDate}</td>
                <td className="p-1 text-right">{r.safeToSpend}</td>
                <td className="p-1 text-right">{r.firstNegative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Based on your inputs — not financial advice. Each column is computed from that
        scenario's own graph and node toggles.
      </p>
    </div>
  );
}

export function ScenariosPanel() {
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const createScenario = useScenarioStore((s) => s.createScenario);
  const duplicateScenario = useScenarioStore((s) => s.duplicateScenario);
  const renameScenario = useScenarioStore((s) => s.renameScenario);
  const deleteScenario = useScenarioStore((s) => s.deleteScenario);
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario);
  const toggleNodeDisabled = useScenarioStore((s) => s.toggleNodeDisabled);
  const nodes = useGraphStore((s) => s.nodes);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showToggles, setShowToggles] = useState(false);

  const active = scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0];
  const compareScenarios = scenarios.filter((s) => compareIds.includes(s.id)).slice(0, 3);

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 3),
    );
  };

  const commitRename = () => {
    if (editingId) renameScenario(editingId, editName);
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">What-if scenarios</h2>
        <button className="cf-btn cf-btn-primary text-xs" onClick={() => createScenario()}>
          + New scenario
        </button>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Each scenario is a full copy of your plan. Switch between them, turn nodes
        on or off per scenario, and compare forecasts side by side.
      </p>

      {/* scenario list */}
      <div className="flex flex-col gap-2">
        {scenarios.map((scn) => {
          const isActive = scn.id === activeScenarioId;
          const inCompare = compareIds.includes(scn.id);
          return (
            <div
              key={scn.id}
              className="cf-panel flex items-center gap-2 p-2"
              style={isActive ? { borderColor: 'var(--accent)' } : undefined}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setActiveScenario(scn.id)}
                title={isActive ? 'Active scenario' : 'Switch to this scenario'}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: isActive ? 'var(--accent)' : 'var(--border)' }}
                  aria-hidden="true"
                />
                {editingId === scn.id ? (
                  <input
                    className="min-w-0 flex-1 rounded border px-1 py-0.5 text-xs"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Scenario name"
                  />
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {scn.name}
                    </span>
                    {scn.isBaseline && (
                      <span className="shrink-0 rounded px-1 text-[10px]" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                        baseline
                      </span>
                    )}
                  </>
                )}
              </button>
              <label className="flex shrink-0 items-center text-[10px]" style={{ color: 'var(--text-muted)' }} title="Include in comparison (up to 3)">
                <input
                  type="checkbox"
                  checked={inCompare}
                  onChange={() => toggleCompare(scn.id)}
                  aria-label={`Compare ${scn.name}`}
                />
              </label>
              <button
                className="cf-btn shrink-0 px-1.5 text-[11px]"
                title="Rename"
                aria-label={`Rename scenario ${scn.name}`}
                onClick={() => { setEditingId(scn.id); setEditName(scn.name); }}
              >
                ✎
              </button>
              <button
                className="cf-btn shrink-0 px-1.5 text-[11px]"
                title="Duplicate"
                aria-label={`Duplicate scenario ${scn.name}`}
                onClick={() => duplicateScenario(scn.id)}
              >
                ⧉
              </button>
              <button
                className="cf-btn shrink-0 px-1.5 text-[11px]"
                title={scenarios.length <= 1 ? 'Cannot delete the last scenario' : 'Delete'}
                aria-label={`Delete scenario ${scn.name}`}
                disabled={scenarios.length <= 1}
                onClick={() => {
                  if (window.confirm(`Delete scenario "${scn.name}"? This cannot be undone.`)) {
                    deleteScenario(scn.id);
                    setCompareIds((prev) => prev.filter((x) => x !== scn.id));
                  }
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* per-node toggles for the active scenario */}
      <div className="cf-panel p-2">
        <button
          className="flex w-full items-center justify-between px-1 py-1 text-xs font-semibold"
          onClick={() => setShowToggles(!showToggles)}
          aria-expanded={showToggles}
        >
          <span>Nodes in "{active.name}"</span>
          <span style={{ color: 'var(--text-muted)' }}>{showToggles ? '▾' : '▸'}</span>
        </button>
        {showToggles && (
          <div className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto px-1 pb-1">
            {nodes.map((n) => {
              const disabled = active.disabledNodeIds.includes(n.id);
              return (
                <label key={n.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!disabled}
                    onChange={() => toggleNodeDisabled(n.id)}
                    aria-label={`Include ${n.label} in ${active.name}`}
                  />
                  <span style={{ color: disabled ? 'var(--text-muted)' : 'var(--text)', textDecoration: disabled ? 'line-through' : 'none' }}>
                    {n.label}
                  </span>
                  <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>{n.type}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* compare */}
      {compareScenarios.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            Compare ({compareScenarios.length} of up to 3)
          </h3>
          <CompareView scenarios={compareScenarios} />
        </div>
      )}

      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Tip: duplicate "Base", then turn off a node (e.g. a second income) or change
        amounts to model "Job loss" — the forecast for each scenario stays independent.
      </p>
    </div>
  );
}
