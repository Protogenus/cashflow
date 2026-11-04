/**
 * panels/SettingsPanel.tsx — settings, data management, and about/help.
 *
 * - Theme (light/dark/system), safety-buffer / horizon / MC-run defaults,
 *   currency display (symbol only — never converted), reduced motion.
 * - Re-run onboarding; reset to template / clear canvas.
 * - JSON export (download) / import (validate → summary → replace or merge).
 * - Reset all data with a typed destructive confirm.
 * - About/Help: how the simulation works and its limits.
 */
import { useRef, useState } from 'react';
import { DEFAULT_ASSUMPTIONS } from '../engine';
import {
  applyPersistedState,
  clearPersisted,
  collectPersistedState,
  downloadExport,
  parseImportFile,
  type ImportSummary,
  type ParsedImport,
} from '../persistence';
import { useAlertsStore } from '../store/alertsStore';
import { useAssumptionsStore } from '../store/assumptionsStore';
import { useResultsStore } from '../store/resultsStore';
import { useScenarioStore } from '../store/scenarioStore';
import {
  CURRENCY_OPTIONS,
  useSettingsStore,
  type ReducedMotionChoice,
  type ThemeChoice,
} from '../store/settingsStore';
import { formatDollars, parseDollarsToCents } from '../lib/format';
import { TemplatePicker } from '../components/TemplatePicker';

const inputCls = 'rounded border px-2 py-1 text-xs money';
const inputStyle = { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ title, blurb, control }: { title: string; blurb: string; control: React.ReactNode }) {
  return (
    <div className="cf-panel flex items-center gap-2 p-3">
      <div className="flex-1">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{blurb}</div>
      </div>
      {control}
    </div>
  );
}

export function SettingsPanel() {
  const settings = useSettingsStore((s) => s);
  const setSettings = useSettingsStore((s) => s.set);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const reopenOnboarding = useSettingsStore((s) => s.reopenOnboarding);
  const setAssumptions = useAssumptionsStore((s) => s.set);
  const resetRules = useAlertsStore((s) => s.resetToDefaults);
  const resetScenarios = useScenarioStore((s) => s.resetToStarter);
  const clearResults = useResultsStore((s) => s.clearAll);
  const hydrate = useScenarioStore((s) => s.hydrate);

  const [showTemplates, setShowTemplates] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetArmed, setResetArmed] = useState(false);
  const [imported, setImported] = useState<ParsedImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setDefault = (patch: Partial<typeof settings>) => setSettings(patch);

  const onCurrencyCode = (code: string) => {
    const opt = CURRENCY_OPTIONS.find((o) => o.code === code);
    if (!opt) return;
    if (code === 'custom') {
      setDefault({ currencyCode: code });
    } else {
      setDefault({ currencyCode: code, currencySymbol: opt.symbol });
    }
  };

  const doExport = () => downloadExport(collectPersistedState());

  const onImportFile = async (file: File) => {
    setImportError(null);
    setImported(null);
    try {
      const text = await file.text();
      setImported(parseImportFile(text));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const importReplace = () => {
    if (!imported) return;
    applyPersistedState(imported.state);
    clearResults();
    setImported(null);
  };

  const importMerge = () => {
    if (!imported) return;
    const st = useScenarioStore.getState();
    const fresh = imported.state.scenarios.map((s) => ({
      ...s,
      id: `scn_${crypto.randomUUID()}`,
      name: `${s.name} (imported)`,
      graph: structuredClone(s.graph),
      disabledNodeIds: [...s.disabledNodeIds],
    }));
    hydrate([...st.scenarios, ...fresh], st.activeScenarioId);
    setImported(null);
  };

  const resetAll = () => {
    if (resetConfirm !== 'RESET') return;
    clearPersisted(typeof localStorage !== 'undefined' ? localStorage : null);
    setAssumptions(structuredClone(DEFAULT_ASSUMPTIONS));
    resetRules();
    resetSettings();
    clearResults();
    resetScenarios();
    reopenOnboarding();
    setResetArmed(false);
    setResetConfirm('');
  };

  const summaryLine = (s: ImportSummary) =>
    `${s.scenarios} scenario${s.scenarios === 1 ? '' : 's'}, ${s.nodes} nodes, ${s.rules} alert rule${s.rules === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col gap-5 p-4">
      <Section title="Appearance">
        <Row
          title="Theme"
          blurb="System follows your OS light/dark setting."
          control={
            <div className="flex gap-1" role="group" aria-label="Theme">
              {(['light', 'dark', 'system'] as ThemeChoice[]).map((t) => (
                <button
                  key={t}
                  className={`cf-btn px-3 py-1 text-xs ${settings.theme === t ? 'cf-btn-primary' : ''}`}
                  aria-pressed={settings.theme === t}
                  onClick={() => setDefault({ theme: t })}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          }
        />
        <Row
          title="Motion"
          blurb="Reduce disables edge and chart animation. System follows your OS setting."
          control={
            <div className="flex gap-1" role="group" aria-label="Motion">
              {(['system', 'reduce', 'full'] as ReducedMotionChoice[]).map((m) => (
                <button
                  key={m}
                  className={`cf-btn px-3 py-1 text-xs ${settings.reducedMotion === m ? 'cf-btn-primary' : ''}`}
                  aria-pressed={settings.reducedMotion === m}
                  onClick={() => setDefault({ reducedMotion: m })}
                >
                  {m === 'system' ? 'System' : m === 'reduce' ? 'Reduce' : 'Full'}
                </button>
              ))}
            </div>
          }
        />
        <Row
          title="Currency display"
          blurb="Symbol only — amounts are never converted or exchanged."
          control={
            <div className="flex items-center gap-1">
              <select
                className={inputCls}
                style={inputStyle}
                value={settings.currencyCode}
                onChange={(e) => onCurrencyCode(e.target.value)}
                aria-label="Currency display"
              >
                {CURRENCY_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </select>
              {settings.currencyCode === 'custom' && (
                <input
                  className={inputCls}
                  style={{ ...inputStyle, width: 48 }}
                  value={settings.currencySymbol}
                  maxLength={3}
                  onChange={(e) => setDefault({ currencySymbol: e.target.value })}
                  aria-label="Custom currency symbol"
                />
              )}
            </div>
          }
        />
      </Section>

      <Section title="Plan defaults">
        <Row
          title="Safety buffer"
          blurb="Your preferred stay-above line; also applied to the current plan."
          control={
            <label className="flex items-center gap-1 text-xs">
              $
              <input
                className={inputCls}
                style={inputStyle}
                inputMode="decimal"
                aria-label="Default safety buffer in dollars"
                value={formatDollars(settings.safetyBufferCentsDefault)}
                onChange={(e) => {
                  const c = parseDollarsToCents(e.target.value);
                  if (c == null) return;
                  setDefault({ safetyBufferCentsDefault: c });
                  setAssumptions({ safetyBufferCents: c });
                }}
              />
            </label>
          }
        />
        <Row
          title="Forecast horizon"
          blurb="Your preferred projection length; also applied to the current plan."
          control={
            <div className="flex gap-1" role="group" aria-label="Default forecast horizon">
              {[30, 60, 90].map((h) => (
                <button
                  key={h}
                  className={`cf-btn px-3 py-1 text-xs ${settings.horizonDaysDefault === h ? 'cf-btn-primary' : ''}`}
                  aria-pressed={settings.horizonDaysDefault === h}
                  onClick={() => {
                    setDefault({ horizonDaysDefault: h });
                    setAssumptions({ horizonDays: h });
                  }}
                >
                  {h}d
                </button>
              ))}
            </div>
          }
        />
        <Row
          title="Monte Carlo runs"
          blurb="Your preferred simulated-future count; also applied to the current plan."
          control={
            <input
              type="number"
              className={inputCls}
              style={inputStyle}
              min={100}
              max={10000}
              step={100}
              aria-label="Default Monte Carlo run count"
              value={settings.mcTrialsDefault}
              onChange={(e) => {
                const n = Math.min(10000, Math.max(100, Math.round(Number(e.target.value) || 0)));
                setDefault({ mcTrialsDefault: n });
                setAssumptions({ mcTrials: n });
              }}
            />
          }
        />
        <button className="cf-btn self-start px-3 py-1 text-xs" onClick={resetSettings}>
          Reset settings to defaults
        </button>
      </Section>

      <Section title="Guided setup">
        <Row
          title="Onboarding"
          blurb="Replay the 3-step first-run flow that builds a plan from your answers."
          control={
            <button className="cf-btn px-3 py-1 text-xs" onClick={reopenOnboarding}>
              Re-run onboarding
            </button>
          }
        />
        <Row
          title="Templates"
          blurb="Load a starter template or clear the canvas (with confirmation)."
          control={
            <button className="cf-btn px-3 py-1 text-xs" onClick={() => setShowTemplates(true)}>
              Choose template…
            </button>
          }
        />
      </Section>

      <Section title="Export / import">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Everything — scenarios, assumptions, alert rules, settings — lives in this browser.
          Export a JSON backup any time; import validates the file before applying anything.
        </p>
        <div className="flex gap-2">
          <button className="cf-btn px-3 py-1 text-xs" onClick={doExport}>
            Export JSON
          </button>
          <button className="cf-btn px-3 py-1 text-xs" onClick={() => fileRef.current?.click()}>
            Import JSON…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import JSON file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {importError && (
          <p className="text-xs font-medium" style={{ color: 'var(--danger)' }} role="alert">
            {importError}
          </p>
        )}
        {imported && (
          <div className="cf-panel p-3">
            <div className="text-xs font-semibold">File looks good: {summaryLine(imported.summary)}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Saved {new Date(imported.summary.savedAt).toLocaleString()}. Replace wipes the
              current plan; merge keeps it and adds the imported scenarios.
            </div>
            <div className="mt-2 flex gap-2">
              <button className="cf-btn cf-btn-primary px-3 py-1 text-xs" onClick={importReplace}>
                Replace current plan
              </button>
              <button className="cf-btn px-3 py-1 text-xs" onClick={importMerge}>
                Merge (add scenarios)
              </button>
              <button className="cf-btn px-3 py-1 text-xs" onClick={() => setImported(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Danger zone">
        <div className="cf-panel border p-3" style={{ borderColor: 'var(--danger)' }}>
          <div className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
            Reset all data
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Wipes scenarios, rules, settings, and the browser autosave, then restarts onboarding.
            This cannot be undone — export a backup first if you want one.
          </p>
          {!resetArmed ? (
            <button
              className="cf-btn mt-2 px-3 py-1 text-xs"
              style={{ color: 'var(--danger)' }}
              onClick={() => setResetArmed(true)}
            >
              Reset all data…
            </button>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              <label className="text-xs font-semibold">
                Type RESET to confirm
                <input
                  className={`${inputCls} mt-1 w-32`}
                  style={inputStyle}
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  aria-label="Type RESET to confirm data reset"
                />
              </label>
              <div className="flex gap-2">
                <button
                  className="cf-btn px-3 py-1 text-xs"
                  style={{ color: 'var(--danger)' }}
                  disabled={resetConfirm !== 'RESET'}
                  onClick={resetAll}
                >
                  Wipe everything
                </button>
                <button
                  className="cf-btn px-3 py-1 text-xs"
                  onClick={() => { setResetArmed(false); setResetConfirm(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="About this planner">
        <div className="cf-panel space-y-2 p-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <p>
            <strong style={{ color: 'var(--text)' }}>How it works.</strong> The nodes on your
            canvas become a day-by-day projection: each income, bill, and variable amount
            expands into dated events from its recurrence rule, and the engine walks forward
            one day at a time — income before expenses — routing split shares to your goals
            and debts and recording your balance every day. The lowest point is your pinch
            point, and the engine names the bills that drove it.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Monte Carlo.</strong> The same walk runs
            thousands of times, each run drawing your variable bills from their min/typical/max
            ranges and rolling the dice on the shock events you enable. The fan chart shows
            where those simulated futures land; “in 9 of 10 simulated futures” is a frequency
            over simulations. Re-running with the same seed reproduces the exact same result.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Limits.</strong> The planner only knows
            what you enter — there is no bank sync, taxes exist only if you model them, there
            is no holiday calendar, and your variable ranges are estimates. Suggestions
            describe tradeoffs among your inputs; they are not financial advice. A projection
            is a planning aid, not a guarantee — when a plan looks fragile, the alerts and
            the optimizer&apos;s candidate suggestions are the place to explore what to change.
          </p>
        </div>
      </Section>

      {showTemplates && <TemplatePicker onClose={() => setShowTemplates(false)} />}
    </div>
  );
}
