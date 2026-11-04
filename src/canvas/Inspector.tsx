/**
 * canvas/Inspector.tsx — property panel for the selected node.
 * Edits apply live to the store; typing is grouped into one undo step
 * (beginEdit on first keystroke, commitEdit debounced ~500ms / on blur).
 */
import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '../store/graphStore';
import { useScenarioStore } from '../store/scenarioStore';
import { todayISO } from '../engine/dates';
import type {
  BusinessDay,
  Frequency,
  IncomeNode,
  NodeId,
  PlanNode,
  Recurrence,
} from '../engine/types';
import { formatDollars, parseDollarsToCents } from '../lib/format';

type RecurringNode = IncomeNode | Extract<PlanNode, { type: 'expense' }> | Extract<PlanNode, { type: 'variableAmount' }>;

// ---------- edit grouping ----------
function useEditGroup() {
  const beginEdit = useGraphStore((s) => s.beginEdit);
  const commitEdit = useGraphStore((s) => s.commitEdit);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  return {
    changed: () => {
      beginEdit();
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        commitEdit();
        timer.current = null;
      }, 500);
    },
    blur: () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      commitEdit();
    },
  };
}

// ---------- field primitives ----------
function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="cf-field">
      <label>{label}</label>
      {children}
      {error ? <div className="cf-error">{error}</div> : hint ? <div className="cf-hint">{hint}</div> : null}
    </div>
  );
}

type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
};

function TextInput({ value, onChange, onBlur, ...rest }: TextInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      {...rest}
    />
  );
}

/** Money input in dollars; commits integer cents only for valid input. */
function MoneyInput({ cents, onCommit, onBlur, ariaLabel }: { cents: number; onCommit: (cents: number) => void; onBlur: () => void; ariaLabel?: string }) {
  const { changed } = useEditGroup();
  const [text, setText] = useState(() => formatDollars(cents));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(formatDollars(cents));
      setInvalid(false);
    }
  }, [cents, focused]);
  return (
    <>
      <div className="flex items-center gap-1">
        <span style={{ color: 'var(--text-muted)' }}>$</span>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseDollarsToCents(e.target.value);
            if (parsed !== null) {
              setInvalid(false);
              changed();
              onCommit(parsed);
            } else {
              setInvalid(true);
            }
          }}
          onBlur={() => {
            setFocused(false);
            const parsed = parseDollarsToCents(text);
            if (parsed !== null) {
              setInvalid(false);
              onCommit(parsed);
            } else {
              setText(formatDollars(cents));
              setInvalid(false);
            }
            onBlur();
          }}
          aria-label={ariaLabel ?? 'Amount in dollars'}
        />
      </div>
      {invalid && <div className="cf-error">Enter an amount, like 1400.00</div>}
    </>
  );
}

function LabeledMoney({ label, cents, onCommit, onBlur }: { label: string; cents: number; onCommit: (c: number) => void; onBlur: () => void }) {
  return (
    <Field label={label}>
      <MoneyInput cents={cents} onCommit={onCommit} onBlur={onBlur} ariaLabel={label} />
    </Field>
  );
}

// ---------- recurrence editor ----------
function FrequencyEditor({ recurrence, onChange }: { recurrence: Recurrence; onChange: (r: Recurrence) => void }) {
  const { changed, blur } = useEditGroup();
  const setFreq = (frequency: Frequency) => {
    changed();
    onChange({ ...recurrence, frequency });
  };
  const setBusinessDay = (businessDay: BusinessDay) => {
    changed();
    onChange({ ...recurrence, businessDay });
  };
  const f = recurrence.frequency;

  return (
    <>
      <Field label="Frequency">
        <select
          value={f.kind}
          onChange={(e) => {
            const kind = e.target.value as Frequency['kind'];
            const today = todayISO();
            if (kind === 'weekly' || kind === 'biweekly') setFreq({ kind, anchor: today });
            else if (kind === 'semimonthly') setFreq({ kind, days: [1, 15] });
            else if (kind === 'monthly') setFreq({ kind, dayOfMonth: 1 });
            else setFreq({ kind, date: today });
          }}
          onBlur={blur}
        >
          <option value="weekly">Weekly · 52/yr</option>
          <option value="biweekly">Every 2 weeks · 26/yr</option>
          <option value="semimonthly">Twice a month · 24/yr</option>
          <option value="monthly">Monthly · 12/yr</option>
          <option value="once">One-time</option>
        </select>
      </Field>

      {(f.kind === 'weekly' || f.kind === 'biweekly') && (
        <Field label="Anchor date" hint="Every 7 / 14 days from this date.">
          <input
            type="date"
            value={f.anchor}
            onChange={(e) => {
              if (e.target.value) {
                changed();
                setFreq({ ...f, anchor: e.target.value });
              }
            }}
            onBlur={blur}
          />
        </Field>
      )}

      {f.kind === 'semimonthly' && (
        <div className="flex gap-2">
          {[0, 1].map((i) => (
            <Field key={i} label={i === 0 ? 'First day' : 'Second day'}>
              <input
                type="number"
                min={1}
                max={31}
                value={f.days[i]}
                onChange={(e) => {
                  const v = Math.min(31, Math.max(1, Number(e.target.value) || 1));
                  changed();
                  const days: [number, number] = [...f.days] as [number, number];
                  days[i] = v;
                  setFreq({ ...f, days });
                }}
                onBlur={blur}
              />
            </Field>
          ))}
        </div>
      )}

      {f.kind === 'monthly' && (
        <Field label="Day of month" hint="A 31st lands on the last day of short months — never skipped.">
          <select
            value={String(f.dayOfMonth)}
            onChange={(e) => {
              changed();
              const v = e.target.value;
              setFreq({ ...f, dayOfMonth: v === 'last' ? 'last' : Number(v) });
            }}
            onBlur={blur}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)}>
                {d}
              </option>
            ))}
            <option value="last">Last day</option>
          </select>
        </Field>
      )}

      {f.kind === 'once' && (
        <Field label="Date">
          <input
            type="date"
            value={f.date}
            onChange={(e) => {
              if (e.target.value) {
                changed();
                setFreq({ ...f, date: e.target.value });
              }
            }}
            onBlur={blur}
          />
        </Field>
      )}

      <Field label="Weekend rule" hint="Paychecks usually land the Friday before; bills debit the Monday after.">
        <select value={recurrence.businessDay} onChange={(e) => setBusinessDay(e.target.value as BusinessDay)} onBlur={blur}>
          <option value="preceding">Preceding (Friday before)</option>
          <option value="following">Following (Monday after)</option>
          <option value="none">No adjustment</option>
        </select>
      </Field>
    </>
  );
}

// ---------- per-type editors ----------
function RecurringFields({ node }: { node: RecurringNode }) {
  const updateNode = useGraphStore((s) => s.updateNode);
  const { changed, blur } = useEditGroup();
  const patch = (fn: (n: PlanNode) => PlanNode) => updateNode(node.id, fn);
  const setRec = (recurrence: Recurrence) =>
    patch((n) => (n.type === 'income' || n.type === 'expense' || n.type === 'variableAmount' ? { ...n, recurrence } : n));

  return (
    <>
      <Field label="Name">
        <TextInput
          value={node.name}
          onChange={(v) => {
            changed();
            patch((n) => ({ ...n, name: v }));
          }}
          onBlur={blur}
        />
      </Field>
      {'amountCents' in node && (
        <LabeledMoney
          label="Amount"
          cents={(node as { amountCents: number }).amountCents}
          onCommit={(c) => {
            changed();
            patch((n) => ('amountCents' in n ? { ...n, amountCents: c } : n));
          }}
          onBlur={blur}
        />
      )}
      {node.type === 'variableAmount' && (
        <>
          <div>
            <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              Direction
            </span>
            <div className="flex gap-1" role="group" aria-label="Money direction">
              {(['expense', 'income'] as const).map((d) => (
                <button
                  key={d}
                  className={`cf-btn flex-1 px-3 py-1 text-xs ${(node.direction ?? 'expense') === d ? 'cf-btn-primary' : ''}`}
                  aria-pressed={(node.direction ?? 'expense') === d}
                  onClick={() => {
                    changed();
                    patch((n) => (n.type === 'variableAmount' ? { ...n, direction: d } : n));
                    blur();
                  }}
                >
                  {d === 'expense' ? 'Money out (bill)' : 'Money in (income)'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {node.direction === 'income'
                ? 'Emits the typical value as income; Monte Carlo samples the min/typical/max range.'
                : 'Emits the typical value as a bill; Monte Carlo samples the min/typical/max range.'}
            </p>
          </div>
          <LabeledMoney label="Minimum" cents={node.minCents} onCommit={(c) => { changed(); patch((n) => (n.type === 'variableAmount' ? { ...n, minCents: c } : n)); }} onBlur={blur} />
          <LabeledMoney label="Typical" cents={node.typicalCents} onCommit={(c) => { changed(); patch((n) => (n.type === 'variableAmount' ? { ...n, typicalCents: c } : n)); }} onBlur={blur} />
          <LabeledMoney label="Maximum" cents={node.maxCents} onCommit={(c) => { changed(); patch((n) => (n.type === 'variableAmount' ? { ...n, maxCents: c } : n)); }} onBlur={blur} />
        </>
      )}
      <FrequencyEditor recurrence={node.recurrence} onChange={setRec} />
    </>
  );
}

function PercentageSplitEditor({ node }: { node: Extract<PlanNode, { type: 'percentageSplit' }> }) {
  const updateNode = useGraphStore((s) => s.updateNode);
  const { changed, blur } = useEditGroup();
  const sum = node.outputs.reduce((s, o) => s + o.percent, 0);
  const setOutputs = (outputs: typeof node.outputs) => {
    changed();
    updateNode(node.id, (n) => (n.type === 'percentageSplit' ? { ...n, outputs } : n));
  };
  return (
    <>
      {node.outputs.map((o) => (
        <div key={o.id} className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Output">
              <TextInput
                value={o.label}
                onChange={(v) => {
                  changed();
                  setOutputs(node.outputs.map((x) => (x.id === o.id ? { ...x, label: v } : x)));
                }}
                onBlur={blur}
              />
            </Field>
          </div>
          <div className="w-20">
            <Field label="%">
              <input
                type="number"
                min={0}
                max={100}
                value={o.percent}
                onChange={(e) => {
                  changed();
                  setOutputs(node.outputs.map((x) => (x.id === o.id ? { ...x, percent: Number(e.target.value) || 0 } : x)));
                }}
                onBlur={blur}
              />
            </Field>
          </div>
          <button
            className="cf-btn mb-1 px-2"
            disabled={node.outputs.length <= 2}
            onClick={() => setOutputs(node.outputs.filter((x) => x.id !== o.id))}
            title="Remove output"
            aria-label={`Remove output ${o.label}`}
          >
            ×
          </button>
        </div>
      ))}
      <div className="text-xs" style={{ color: Math.abs(sum - 100) > 1e-9 ? 'var(--danger)' : 'var(--text-muted)' }}>
        Total: {sum}% {Math.abs(sum - 100) > 1e-9 ? '— must sum to 100' : '✓'}
      </div>
      {node.outputs.length < 8 && (
        <button
          className="cf-btn mt-1"
          onClick={() =>
            setOutputs([...node.outputs, { id: `o_${crypto.randomUUID().slice(0, 8)}`, label: 'New', percent: 0 }])
          }
        >
          + Add output
        </button>
      )}
    </>
  );
}

function PrioritySplitEditor({ node }: { node: Extract<PlanNode, { type: 'prioritySplit' }> }) {
  const updateNode = useGraphStore((s) => s.updateNode);
  const { changed, blur } = useEditGroup();
  const setOutputs = (outputs: typeof node.outputs) => {
    changed();
    updateNode(node.id, (n) => (n.type === 'prioritySplit' ? { ...n, outputs } : n));
  };
  return (
    <>
      {node.outputs.map((o) => (
        <div key={o.id} className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Bucket">
              <TextInput value={o.label} onChange={(v) => { changed(); setOutputs(node.outputs.map((x) => (x.id === o.id ? { ...x, label: v } : x))); }} onBlur={blur} />
            </Field>
          </div>
          <div className="w-16">
            <Field label="Prio">
              <input type="number" min={1} value={o.priority} onChange={(e) => { changed(); setOutputs(node.outputs.map((x) => (x.id === o.id ? { ...x, priority: Number(e.target.value) || 1 } : x))); }} onBlur={blur} />
            </Field>
          </div>
          <div className="w-24">
            <Field label="Cap $">
              <input
                type="text" inputMode="decimal" placeholder="none"
                value={o.capCents ? (o.capCents / 100).toString() : ''}
                onChange={(e) => {
                  const parsed = parseDollarsToCents(e.target.value);
                  changed();
                  setOutputs(node.outputs.map((x) => (x.id === o.id ? { ...x, capCents: parsed ?? undefined } : x)));
                }}
                onBlur={blur}
              />
            </Field>
          </div>
          <button className="cf-btn mb-1 px-2" disabled={node.outputs.length <= 2}
            onClick={() => setOutputs(node.outputs.filter((x) => x.id !== o.id))} aria-label={`Remove bucket ${o.label}`}>×</button>
        </div>
      ))}
      {node.outputs.length < 8 && (
        <button className="cf-btn mt-1" onClick={() => setOutputs([...node.outputs, { id: `o_${crypto.randomUUID().slice(0, 8)}`, label: 'New', priority: node.outputs.length + 1 }])}>
          + Add bucket
        </button>
      )}
    </>
  );
}

// ---------- main panel ----------

/**
 * NodeEditor edits one node by id — the exact same form the Inspector tab
 * shows. NodeListView reuses it for inline editing on small screens, so both
 * surfaces stay identical by construction.
 */
export function NodeEditor({ nodeId }: { nodeId: NodeId | null }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId));
  const updateNode = useGraphStore((s) => s.updateNode);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const { changed, blur } = useEditGroup();
  const activeScenario = useScenarioStore((s) => s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0]);
  const toggleNodeDisabled = useScenarioStore((s) => s.toggleNodeDisabled);

  if (!node) {
    return (
      <div className="p-4 text-[13px]" style={{ color: 'var(--text-muted)' }}>
        <p className="font-semibold" style={{ color: 'var(--text)' }}>Nothing selected</p>
        <p className="mt-1">Click a node to edit its amount, schedule, and rules. Drag a node from the palette to add one.</p>
      </div>
    );
  }

  return (
    <div key={node.id} className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Edit node</h2>
        <button className="cf-btn" onClick={() => deleteNode(node.id)} title="Delete node (Del)">
          Delete
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}
        title="Excluded nodes are skipped by this scenario's forecast, optimizer, and Monte Carlo runs.">
        <input
          type="checkbox"
          checked={!activeScenario.disabledNodeIds.includes(node.id)}
          onChange={() => toggleNodeDisabled(node.id)}
        />
        Included in scenario "{activeScenario.name}"
      </label>

      <Field label="Label">
        <TextInput
          value={node.label}
          onChange={(v) => {
            changed();
            updateNode(node.id, (n) => ({ ...n, label: v }));
          }}
          onBlur={blur}
        />
      </Field>

      {node.type === 'startingBalance' && (
        <>
          <LabeledMoney label="Balance" cents={node.balanceCents}
            onCommit={(c) => { changed(); updateNode(node.id, (n) => (n.type === 'startingBalance' ? { ...n, balanceCents: c } : n)); }} onBlur={blur} />
          <Field label="As of">
            <input type="date" value={node.asOf}
              onChange={(e) => { if (e.target.value) { changed(); updateNode(node.id, (n) => (n.type === 'startingBalance' ? { ...n, asOf: e.target.value } : n)); } }}
              onBlur={blur} />
          </Field>
        </>
      )}

      {(node.type === 'income' || node.type === 'expense' || node.type === 'variableAmount') && (
        <RecurringFields node={node} />
      )}

      {node.type === 'percentageSplit' && <PercentageSplitEditor node={node} />}
      {node.type === 'prioritySplit' && <PrioritySplitEditor node={node} />}

      {node.type === 'conditional' && (
        <>
          <Field label="Condition">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>if balance</span>
              <select
                value={node.predicate.op}
                onChange={(e) => { changed(); updateNode(node.id, (n) => (n.type === 'conditional' ? { ...n, predicate: { ...n.predicate, op: e.target.value as 'gt' | 'lt' } } : n)); }}
                onBlur={blur}
              >
                <option value="gt">&gt;</option>
                <option value="lt">&lt;</option>
              </select>
            </div>
          </Field>
          <LabeledMoney label="Threshold" cents={node.predicate.thresholdCents}
            onCommit={(c) => { changed(); updateNode(node.id, (n) => (n.type === 'conditional' ? { ...n, predicate: { ...n.predicate, thresholdCents: c } } : n)); }} onBlur={blur} />
          <Field label="True branch label">
            <TextInput value={node.trueLabel}
              onChange={(v) => { changed(); updateNode(node.id, (n) => (n.type === 'conditional' ? { ...n, trueLabel: v } : n)); }} onBlur={blur} />
          </Field>
          <Field label="False branch label">
            <TextInput value={node.falseLabel}
              onChange={(v) => { changed(); updateNode(node.id, (n) => (n.type === 'conditional' ? { ...n, falseLabel: v } : n)); }} onBlur={blur} />
          </Field>
        </>
      )}

      {node.type === 'goal' && (
        <>
          <Field label="Name">
            <TextInput value={node.name}
              onChange={(v) => { changed(); updateNode(node.id, (n) => (n.type === 'goal' ? { ...n, name: v } : n)); }} onBlur={blur} />
          </Field>
          <LabeledMoney label="Target" cents={node.targetCents}
            onCommit={(c) => { changed(); updateNode(node.id, (n) => (n.type === 'goal' ? { ...n, targetCents: c } : n)); }} onBlur={blur} />
          <Field label="Target date">
            <input type="date" value={node.targetDate}
              onChange={(e) => { if (e.target.value) { changed(); updateNode(node.id, (n) => (n.type === 'goal' ? { ...n, targetDate: e.target.value } : n)); } }}
              onBlur={blur} />
          </Field>
        </>
      )}

      {node.type === 'debt' && (
        <>
          <Field label="Name">
            <TextInput value={node.name}
              onChange={(v) => { changed(); updateNode(node.id, (n) => (n.type === 'debt' ? { ...n, name: v } : n)); }} onBlur={blur} />
          </Field>
          <LabeledMoney label="Balance owed" cents={node.balanceCents}
            onCommit={(c) => { changed(); updateNode(node.id, (n) => (n.type === 'debt' ? { ...n, balanceCents: c } : n)); }} onBlur={blur} />
          <Field label="APR %" hint="Annual percentage rate, e.g. 19.99">
            <input type="text" inputMode="decimal"
              defaultValue={(node.aprBps / 100).toString()}
              key={`apr-${node.id}`}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v) && v >= 0 && v <= 100) {
                  changed();
                  updateNode(node.id, (n) => (n.type === 'debt' ? { ...n, aprBps: Math.round(v * 100) } : n));
                }
              }}
              onBlur={blur} />
          </Field>
          <LabeledMoney label="Minimum payment" cents={node.minPaymentCents}
            onCommit={(c) => { changed(); updateNode(node.id, (n) => (n.type === 'debt' ? { ...n, minPaymentCents: c } : n)); }} onBlur={blur} />
        </>
      )}
    </div>
  );
}

/** Inspector tab: the editor for whatever node is currently selected. */
export function Inspector() {
  const selectedNodeId: NodeId | null = useGraphStore((s) => s.selectedNodeId);
  return <NodeEditor nodeId={selectedNodeId} />;
}
