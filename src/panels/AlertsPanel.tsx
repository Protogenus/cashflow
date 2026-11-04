/**
 * panels/AlertsPanel.tsx — triggered alerts + the rule editor.
 *
 * Alerts recompute from the current graph, assumptions, and the active
 * scenario's disabled-node toggles on every render (the evaluation is one
 * deterministic forecast — cheap). Triggered alerts sort by severity then
 * first firing date, each with its engine-generated explanation.
 */
import { useMemo, useState } from 'react';
import {
  evaluateAlerts,
  validateGraph,
  type AlertRule,
  type AlertRuleType,
  type AlertSeverity,
  type TriggeredAlert,
} from '../engine';
import { useAlertsStore, defaultParamsFor } from '../store/alertsStore';
import { useGraphStore } from '../store/graphStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useAssumptionsStore } from '../store/assumptionsStore';
import { formatDateLong, formatMoney, formatDollars, parseDollarsToCents } from '../lib/format';

const RULE_TYPES: { id: AlertRuleType; label: string; blurb: string }[] = [
  { id: 'balanceBelow', label: 'Balance below', blurb: 'Warn when the projected balance drops under an amount' },
  { id: 'billCoverage', label: 'Bill coverage', blurb: 'Warn when a big bill exceeds the day\u2019s opening balance' },
  { id: 'paydayGap', label: 'Payday gap', blurb: 'Warn when the gap between income events is too long' },
  { id: 'goalOffTrack', label: 'Goal off track', blurb: 'Warn when a goal is projected to miss its target date' },
];

const SEVERITIES: AlertSeverity[] = ['critical', 'warning', 'info'];

function severityStyle(sev: AlertSeverity): React.CSSProperties {
  const color =
    sev === 'critical' ? 'var(--danger)' : sev === 'warning' ? 'var(--warning)' : 'var(--accent)';
  return {
    color,
    border: `1px solid ${color}`,
    borderRadius: 999,
    padding: '0 8px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  };
}

function ruleTypeLabel(t: AlertRuleType): string {
  return RULE_TYPES.find((x) => x.id === t)?.label ?? t;
}

function ruleSummary(rule: AlertRule): string {
  switch (rule.type) {
    case 'balanceBelow':
      return `below ${formatMoney(rule.params.thresholdCents ?? 0)}`;
    case 'billCoverage':
      return `bills over ${formatMoney(rule.params.minAmountCents ?? 100000)}`;
    case 'paydayGap':
      return `gap over ${rule.params.maxGapDays ?? 21} days`;
    case 'goalOffTrack':
      return 'any goal projected to miss';
  }
}

function alertDatesLabel(a: TriggeredAlert): string {
  if (a.dates.length === 0) return '';
  if (a.dates.length === 1) return formatDateLong(a.dates[0]);
  return `${formatDateLong(a.dates[0])} \u2013 ${formatDateLong(a.dates[a.dates.length - 1])} (${a.dates.length} days)`;
}

function RuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Omit<AlertRule, 'id'>;
  onSave: (r: Omit<AlertRule, 'id'>) => string[];
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<AlertRuleType>(initial.type);
  const [severity, setSeverity] = useState<AlertSeverity>(initial.severity);
  const [params, setParams] = useState(initial.params);
  const [problems, setProblems] = useState<string[]>([]);

  const inputCls =
    'rounded border px-2 py-1 text-xs money w-full';
  const inputStyle = { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' };

  const setTypeAndDefaults = (t: AlertRuleType) => {
    setType(t);
    setParams(defaultParamsFor(t));
  };

  const save = () => {
    const errs = onSave({ name: name.trim(), type, params, severity, enabled: initial.enabled });
    if (errs.length > 0) setProblems(errs);
  };

  return (
    <div className="cf-panel space-y-2 p-3">
      <label className="block text-xs font-semibold">
        Rule name
        <input
          className={inputCls}
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Balance below $0"
        />
      </label>
      <label className="block text-xs font-semibold">
        Rule type
        <select className={inputCls} style={inputStyle} value={type} onChange={(e) => setTypeAndDefaults(e.target.value as AlertRuleType)}>
          {RULE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} — {t.blurb}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <label className="block flex-1 text-xs font-semibold">
          Severity
          <select className={inputCls} style={inputStyle} value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity)}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        {type === 'balanceBelow' && (
          <label className="block flex-1 text-xs font-semibold">
            Warn below (dollars)
            <input
              className={inputCls}
              style={inputStyle}
              inputMode="decimal"
              value={formatDollars(params.thresholdCents ?? 0)}
              onChange={(e) => {
                const c = parseDollarsToCents(e.target.value);
                if (c != null) setParams({ ...params, thresholdCents: c });
              }}
            />
          </label>
        )}
        {type === 'billCoverage' && (
          <label className="block flex-1 text-xs font-semibold">
            Bill floor (dollars)
            <input
              className={inputCls}
              style={inputStyle}
              inputMode="decimal"
              value={formatDollars(params.minAmountCents ?? 100000)}
              onChange={(e) => {
                const c = parseDollarsToCents(e.target.value);
                if (c != null) setParams({ ...params, minAmountCents: c });
              }}
            />
          </label>
        )}
        {type === 'paydayGap' && (
          <label className="block flex-1 text-xs font-semibold">
            Max gap (days)
            <input
              className={inputCls}
              style={inputStyle}
              type="number"
              min={1}
              value={params.maxGapDays ?? 21}
              onChange={(e) => setParams({ ...params, maxGapDays: Math.max(1, Math.round(Number(e.target.value) || 0)) })}
            />
          </label>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="text-xs" style={{ color: 'var(--danger)' }}>
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 pt-1">
        <button className="cf-btn cf-btn-primary text-xs" onClick={save}>Save rule</button>
        <button className="cf-btn text-xs" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function AlertsPanel() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const assumptions = useAssumptionsStore((s) => s.assumptions);
  const activeScenario = useScenarioStore((s) => s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0]);
  const rules = useAlertsStore((s) => s.rules);
  const addRule = useAlertsStore((s) => s.addRule);
  const updateRule = useAlertsStore((s) => s.updateRule);
  const deleteRule = useAlertsStore((s) => s.deleteRule);
  const toggleRule = useAlertsStore((s) => s.toggleRule);
  const resetToDefaults = useAlertsStore((s) => s.resetToDefaults);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const validation = useMemo(() => validateGraph({ nodes, edges }), [nodes, edges]);

  const alerts = useMemo<TriggeredAlert[]>(() => {
    if (!validation.valid) return [];
    try {
      return evaluateAlerts({ nodes, edges }, assumptions, rules, {
        disabledNodeIds: activeScenario.disabledNodeIds,
      });
    } catch {
      return [];
    }
  }, [nodes, edges, assumptions, rules, activeScenario.disabledNodeIds, validation.valid]);

  const newDraft: Omit<AlertRule, 'id'> = {
    name: '',
    type: 'balanceBelow',
    params: defaultParamsFor('balanceBelow'),
    severity: 'warning',
    enabled: true,
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* triggered alerts */}
      <section aria-label="Triggered alerts">
        <h2 className="mb-2 text-sm font-semibold">Alerts</h2>
        {!validation.valid ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Fix the graph validation errors to evaluate alert rules.
          </p>
        ) : alerts.length === 0 ? (
          <div className="cf-panel p-4 text-center">
            <p className="text-sm font-semibold">No alerts — your plan looks stable based on your inputs.</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              {rules.filter((r) => r.enabled).length} rule{rules.filter((r) => r.enabled).length === 1 ? '' : 's'} checked
              against the {assumptions.horizonDays}-day projection.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.map((a) => (
              <li key={a.ruleId + a.dates[0]} className="cf-panel p-3">
                <div className="flex items-center gap-2">
                  <span style={severityStyle(a.severity)}>{a.severity}</span>
                  <span className="text-sm font-semibold">{a.ruleName}</span>
                </div>
                <div className="mt-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {alertDatesLabel(a)}
                </div>
                <p className="mt-1 text-xs leading-relaxed">{a.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* rule editor */}
      <section aria-label="Alert rules">
        <div className="mb-2 flex items-center">
          <h2 className="text-sm font-semibold">Rules</h2>
          <div className="ml-auto flex gap-1">
            <button className="cf-btn text-xs" onClick={() => setAdding(true)} disabled={adding}>
              + Add rule
            </button>
            <button className="cf-btn text-xs" onClick={resetToDefaults} title="Restore the default rules">
              Reset defaults
            </button>
          </div>
        </div>

        {adding && (
          <RuleForm
            initial={newDraft}
            onSave={(r) => {
              const errs = addRule(r);
              if (errs.length === 0) setAdding(false);
              return errs;
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        <ul className="mt-2 flex flex-col gap-2">
          {rules.map((r) => (
            <li key={r.id} className="cf-panel p-3">
              {editingId === r.id ? (
                <RuleForm
                  initial={r}
                  onSave={(draft) => {
                    const errs = updateRule(r.id, draft);
                    if (errs.length === 0) setEditingId(null);
                    return errs;
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      className="cf-btn px-2 py-0.5 text-xs"
                      onClick={() => toggleRule(r.id)}
                      aria-pressed={r.enabled}
                      title={r.enabled ? 'Disable rule' : 'Enable rule'}
                    >
                      {r.enabled ? '✓' : '○'}
                    </button>
                    <span className={`text-sm font-semibold ${r.enabled ? '' : 'line-through'}`} style={r.enabled ? undefined : { color: 'var(--text-muted)' }}>
                      {r.name}
                    </span>
                    <span className="ml-auto" style={severityStyle(r.severity)}>{r.severity}</span>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {ruleTypeLabel(r.type)} · {ruleSummary(r)}
                  </div>
                  <div className="mt-2 flex gap-1">
                    <button className="cf-btn text-xs" onClick={() => { setEditingId(r.id); setConfirmDeleteId(null); }}>
                      Edit
                    </button>
                    {confirmDeleteId === r.id ? (
                      <>
                        <button className="cf-btn text-xs" style={{ color: 'var(--danger)' }} onClick={() => { deleteRule(r.id); setConfirmDeleteId(null); }}>
                          Confirm delete
                        </button>
                        <button className="cf-btn text-xs" onClick={() => setConfirmDeleteId(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button className="cf-btn text-xs" onClick={() => setConfirmDeleteId(r.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        {rules.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No rules. Add one above, or reset to the defaults.
          </p>
        )}
      </section>
    </div>
  );
}
