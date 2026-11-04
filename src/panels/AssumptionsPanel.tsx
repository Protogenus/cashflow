/**
 * panels/AssumptionsPanel.tsx — every assumption the math makes, in plain
 * language, next to the results (PRODUCT_SPEC.md §3, user story 10).
 *
 * Each item is either editable (it is a setting — buffer, horizon, MC runs,
 * seed, currency) or read-only text (a modeling choice). The disclaimer is
 * part of this panel and repeated as a one-liner in the forecast and
 * Monte Carlo views.
 */
import { useAssumptionsStore } from '../store/assumptionsStore';
import { useSettingsStore } from '../store/settingsStore';
import { formatDollars, parseDollarsToCents } from '../lib/format';

export const DISCLAIMER =
  'Based on your inputs only. This is a planning tool, not financial advice. Forecasts are projections, not guarantees.';

export const DISCLAIMER_SHORT =
  'Based on your inputs only — a planning tool, not financial advice. Projections, not guarantees.';

const inputCls = 'w-24 rounded border px-2 py-1 text-xs money';
const inputStyle = { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' };

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="cf-panel p-3">
      <div className="text-xs font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {children}
      </div>
    </li>
  );
}

export function AssumptionsPanel() {
  const assumptions = useAssumptionsStore((s) => s.assumptions);
  const setAssumptions = useAssumptionsStore((s) => s.set);
  const settings = useSettingsStore((s) => s);
  const setSettings = useSettingsStore((s) => s.set);

  return (
    <div className="flex flex-col gap-4 p-4">
      <section aria-label="Disclaimer">
        <div
          className="rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: 'var(--warning)', background: 'var(--surface-2)' }}
        >
          <span className="font-semibold">Please note: </span>
          {DISCLAIMER}
        </div>
      </section>

      <section aria-label="Editable assumptions">
        <h2 className="mb-2 text-sm font-semibold">Your settings</h2>
        <ul className="flex flex-col gap-2">
          <li className="cf-panel flex items-center gap-2 p-3">
            <div className="flex-1">
              <div className="text-xs font-semibold">Safety buffer</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                The “stay above” line on the forecast chart. Safe-to-spend is the lowest
                projected balance minus this buffer.
              </div>
            </div>
            <label className="flex items-center gap-1 text-xs">
              $
              <input
                className={inputCls}
                style={inputStyle}
                inputMode="decimal"
                aria-label="Safety buffer in dollars"
                value={formatDollars(settings.safetyBufferCentsDefault)}
                onChange={(e) => {
                  const c = parseDollarsToCents(e.target.value);
                  if (c == null) return;
                  setSettings({ safetyBufferCentsDefault: c });
                  setAssumptions({ safetyBufferCents: c });
                }}
              />
            </label>
          </li>
          <li className="cf-panel flex items-center gap-2 p-3">
            <div className="flex-1">
              <div className="text-xs font-semibold">Forecast horizon</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                How far ahead the deterministic forecast projects.
              </div>
            </div>
            <div className="flex gap-1" role="group" aria-label="Forecast horizon">
              {[30, 60, 90].map((h) => (
                <button
                  key={h}
                  className={`cf-btn px-3 py-1 text-xs ${settings.horizonDaysDefault === h ? 'cf-btn-primary' : ''}`}
                  aria-pressed={settings.horizonDaysDefault === h}
                  onClick={() => {
                    setSettings({ horizonDaysDefault: h });
                    setAssumptions({ horizonDays: h });
                  }}
                >
                  {h}d
                </button>
              ))}
            </div>
          </li>
          <li className="cf-panel flex items-center gap-2 p-3">
            <div className="flex-1">
              <div className="text-xs font-semibold">Monte Carlo runs</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Simulated futures per Monte Carlo run. More runs = smoother bands, slower run.
              </div>
            </div>
            <input
              type="number"
              className={inputCls}
              style={inputStyle}
              min={100}
              max={10000}
              step={100}
              aria-label="Monte Carlo default run count"
              value={settings.mcTrialsDefault}
              onChange={(e) => {
                const n = Math.min(10000, Math.max(100, Math.round(Number(e.target.value) || 0)));
                setSettings({ mcTrialsDefault: n });
                setAssumptions({ mcTrials: n });
              }}
            />
          </li>
          <li className="cf-panel flex items-center gap-2 p-3">
            <div className="flex-1">
              <div className="text-xs font-semibold">Monte Carlo seed</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Same seed + same inputs = bit-identical results. Shown next to every run.
              </div>
            </div>
            <input
              type="number"
              className={inputCls}
              style={inputStyle}
              aria-label="Monte Carlo seed"
              value={assumptions.mcSeed}
              onChange={(e) => setAssumptions({ mcSeed: Math.round(Number(e.target.value) || 0) })}
            />
          </li>
        </ul>
      </section>

      <section aria-label="Modeling choices">
        <h2 className="mb-2 text-sm font-semibold">How the math works</h2>
        <ul className="flex flex-col gap-2">
          <Item title="Recurrence rules">
            Monthly bills scheduled for the 31st fire on the last day of shorter months
            (Jan&nbsp;31 → Feb&nbsp;28) — a month is never skipped. Each series is expanded
            from an immutable start date, never chained off the previous occurrence.
          </Item>
          <Item title="Weekends">
            Paychecks landing on a weekend move to the prior Friday; bills move to the
            following Monday. Each item carries its own rule, adjustable in its editor.
            Weekends only — there is no holiday calendar yet, so a bill due on a public-holiday
            Monday is not shifted.
          </Item>
          <Item title="Same-day order">
            When income and expenses land on the same day, income is applied first.
          </Item>
          <Item title="Variable amounts">
            The deterministic forecast uses each variable node&apos;s <em>typical</em> value.
            Monte Carlo draws each occurrence from a triangular min / typical / max
            distribution — bounded, and your “typical” counts as the most likely value.
          </Item>
          <Item title="Splits move real money">
            Shares routed to a goal or debt node leave your spendable balance (saved toward
            the target / extra principal paid). Shares routed to bills stay spendable —
            money is fungible, so the earmark moves no cash.
          </Item>
          <Item title="One path, not a prediction">
            The deterministic forecast is a single path through your inputs. It does not
            include taxes, market changes, or spending you haven&apos;t entered.
          </Item>
          <Item title="What Monte Carlo probabilities mean">
            “In 9 of 10 simulated futures your balance stays positive” means 9 of 10
            simulated runs stayed above $0 — frequencies over simulated futures given your
            inputs, not a guarantee about the real world.
          </Item>
          <Item title="Alerts">
            Alert rules are checked against the deterministic forecast (not Monte Carlo),
            honoring the active scenario&apos;s disabled nodes.
          </Item>
        </ul>
      </section>
    </div>
  );
}
