/**
 * components/Onboarding.tsx — first-run guided onboarding overlay.
 *
 * Three steps, skippable, completable in under 60 seconds:
 *   1. current balance
 *   2. next paycheck (amount + date + frequency)
 *   3. biggest monthly bill (name + amount + day of month)
 * Finishing builds a real, fully-wired graph from the answers and drops it
 * on the canvas — the forecast view then shows a genuine forecast.
 * "Start from a template instead" swaps in the TemplatePicker.
 */
import { useState } from 'react';
import { addDays, formatISODate, parseISODate, toLocalDate, todayISO } from '../engine/dates';
import type { ISODate } from '../engine/types';
import { buildOnboardingGraph } from '../templates/starterTemplates';
import { useGraphStore } from '../store/graphStore';
import { useSettingsStore } from '../store/settingsStore';
import { parseDollarsToCents } from '../lib/format';
import { TemplatePicker } from './TemplatePicker';

type PayFreq = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

const FREQS: { id: PayFreq; label: string }[] = [
  { id: 'weekly', label: 'Every week' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'semimonthly', label: 'Twice a month (1st & 15th)' },
  { id: 'monthly', label: 'Monthly' },
];

/** Next Friday from today (local) — a sane default payday. */
function nextFriday(): ISODate {
  let d = toLocalDate(parseISODate(todayISO()));
  do {
    d = addDays(d, 1);
  } while (d.getDay() !== 5);
  return formatISODate(d);
}

const inputCls = 'w-full rounded border px-3 py-2 text-sm money';
const inputStyle = { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' };

export function Onboarding() {
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);

  const [balance, setBalance] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState<ISODate>(nextFriday());
  const [payFreq, setPayFreq] = useState<PayFreq>('biweekly');
  const [billName, setBillName] = useState('Rent');
  const [billAmount, setBillAmount] = useState('');
  const [billDay, setBillDay] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const skip = () => completeOnboarding();

  const finish = () => {
    const balanceCents = parseDollarsToCents(balance, { allowNegative: true }) ?? 0;
    const payCents = parseDollarsToCents(payAmount);
    const billCents = parseDollarsToCents(billAmount);
    if (payCents == null || payCents <= 0) {
      setError('Enter your paycheck amount, like 1850.');
      setStep(1);
      return;
    }
    if (billCents == null || billCents <= 0 || !billName.trim()) {
      setError('Enter the bill name and amount.');
      setStep(2);
      return;
    }
    const day = Math.min(28, Math.max(1, parseInt(billDay, 10) || 1));
    const g = buildOnboardingGraph({
      balanceCents,
      payAmountCents: payCents,
      payDate,
      payFreq,
      billName: billName.trim(),
      billAmountCents: billCents,
      billDayOfMonth: day,
    });
    loadGraph(g.nodes, g.edges);
    completeOnboarding();
  };

  const next = () => {
    setError(null);
    if (step === 0) {
      if (parseDollarsToCents(balance, { allowNegative: true }) == null) {
        setError('Enter a balance, like 1850. Use 0 if you are not sure.');
        return;
      }
      setStep(1);
    } else if (step === 1) {
      const c = parseDollarsToCents(payAmount);
      if (c == null || c <= 0) {
        setError('Enter your paycheck amount, like 1850.');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
        setError('Pick the date of your next paycheck.');
        return;
      }
      setStep(2);
    } else {
      finish();
    }
  };

  const steps = ['Balance', 'Paycheck', 'Biggest bill'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Set up your first money plan"
    >
      {showTemplates ? (
        <TemplatePicker
          onClose={() => setShowTemplates(false)}
          onApplied={completeOnboarding}
        />
      ) : (
        <div className="cf-panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">See your next 90 days of money</h2>
            <button className="cf-btn px-2 py-1 text-xs" onClick={skip}>
              Skip
            </button>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Three quick questions — about a minute — and you will have a working plan.
          </p>

          {/* step dots */}
          <div className="mt-4 flex gap-2" aria-label={`Step ${step + 1} of 3`}>
            {steps.map((label, i) => (
              <div key={label} className="flex-1">
                <div
                  className="h-1.5 rounded-full"
                  style={{ background: i <= step ? 'var(--accent)' : 'var(--border)' }}
                />
                <div
                  className="mt-1 text-[11px] font-medium"
                  style={{ color: i === step ? 'var(--text)' : 'var(--text-muted)' }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 min-h-48">
            {step === 0 && (
              <label className="block">
                <span className="text-sm font-semibold">What is your current balance?</span>
                <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-muted)' }}>
                  What your checking account shows right now.
                </span>
                <input
                  autoFocus
                  className={`${inputCls} mt-2`}
                  style={inputStyle}
                  inputMode="decimal"
                  placeholder="1850"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && next()}
                  aria-label="Current balance in dollars"
                />
              </label>
            )}
            {step === 1 && (
              <div className="flex flex-col gap-3">
                <span className="text-sm font-semibold">When is your next paycheck, and how much?</span>
                <label className="block text-xs font-semibold">
                  Amount
                  <input
                    autoFocus
                    className={`${inputCls} mt-1`}
                    style={inputStyle}
                    inputMode="decimal"
                    placeholder="1850"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && next()}
                    aria-label="Paycheck amount in dollars"
                  />
                </label>
                <div className="flex gap-2">
                  <label className="block flex-1 text-xs font-semibold">
                    Next payday
                    <input
                      type="date"
                      className={`${inputCls} mt-1`}
                      style={inputStyle}
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value as ISODate)}
                    />
                  </label>
                  <label className="block flex-1 text-xs font-semibold">
                    How often
                    <select
                      className={`${inputCls} mt-1`}
                      style={inputStyle}
                      value={payFreq}
                      onChange={(e) => setPayFreq(e.target.value as PayFreq)}
                    >
                      {FREQS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="flex flex-col gap-3">
                <span className="text-sm font-semibold">What is your biggest monthly bill?</span>
                <label className="block text-xs font-semibold">
                  Bill name
                  <input
                    autoFocus
                    className={`${inputCls} mt-1`}
                    style={inputStyle}
                    placeholder="Rent"
                    value={billName}
                    onChange={(e) => setBillName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && next()}
                  />
                </label>
                <div className="flex gap-2">
                  <label className="block flex-1 text-xs font-semibold">
                    Amount
                    <input
                      className={`${inputCls} mt-1`}
                      style={inputStyle}
                      inputMode="decimal"
                      placeholder="1400"
                      value={billAmount}
                      onChange={(e) => setBillAmount(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && next()}
                    />
                  </label>
                  <label className="block flex-1 text-xs font-semibold">
                    Due day of month
                    <select
                      className={`${inputCls} mt-1`}
                      style={inputStyle}
                      value={billDay}
                      onChange={(e) => setBillDay(e.target.value)}
                    >
                      {Array.from({ length: 28 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-2 text-xs font-medium" style={{ color: 'var(--danger)' }} role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center gap-2">
            {step > 0 && (
              <button className="cf-btn px-4 py-2 text-sm" onClick={() => { setError(null); setStep(step - 1); }}>
                Back
              </button>
            )}
            <button className="cf-btn cf-btn-primary ml-auto px-5 py-2 text-sm" onClick={next}>
              {step === 2 ? 'Build my plan' : 'Next'}
            </button>
          </div>

          <button
            className="mt-4 w-full text-center text-xs underline"
            style={{ color: 'var(--accent)' }}
            onClick={() => setShowTemplates(true)}
          >
            Start from a template instead
          </button>
          <p className="mt-2 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Based on your inputs — not financial advice. Everything stays on this device.
          </p>
        </div>
      )}
    </div>
  );
}
