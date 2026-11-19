/**
 * canvas/nodes.tsx — the 9 custom React Flow node components.
 * Visual language: every node is the same card with a left-border accent
 * in the type's colour, plus a distinct icon. Cards show live computed
 * status from the engine (cardStatus.ts).
 */
import { Handle, Position } from '@xyflow/react';
import type { PlanNode } from '../engine/types';
import type { CardStatus } from './cardStatus';
import { NodeIcon } from './nodeIcons';

export interface CFNodeData extends Record<string, unknown> {
  node: PlanNode;
  status: CardStatus;
  orphaned: boolean;
  /** Excluded from the active scenario's forecast (milestone 4). */
  disabled: boolean;
  /** Timelapse frame pulses (canvas money-flow playback) — empty when idle. */
  flowPulses?: { amountCents: number; kind: 'income' | 'expense' | 'split' | 'balance' | 'outflow'; note?: string }[];
}

interface NodeProps {
  data: CFNodeData;
  selected: boolean;
}

const ORPHAN_TITLE = 'This node is not connected to anything. It still counts in validation, but money cannot flow through it.';

function OrphanBadge() {
  return (
    <span className="cf-orphan-badge" title={ORPHAN_TITLE} aria-label={ORPHAN_TITLE}>
      !
    </span>
  );
}

function Label({ node }: { node: PlanNode }) {
  return (
    <div className="cf-node-label">
      <span className="cf-node-icon">
        <NodeIcon type={node.type} />
      </span>
      <span>{node.label}</span>
    </div>
  );
}

/**
 * Node facts as labelled rows — one fact per row, label left, value right,
 * hairline between rows — instead of a run-on paragraph. Both label and
 * value stay the old muted status colour; the row layout does the work.
 */
function Status({ status }: { status: CardStatus }) {
  return (
    <>
      <dl className="cf-node-stats">
        {status.chunks.map((c) => (
          <div className="cf-node-stat" key={c.label}>
            <dt>{c.label}</dt>
            <dd className="money">{c.value}</dd>
          </div>
        ))}
      </dl>
      {status.note && <div className="cf-node-note">{status.note}</div>}
    </>
  );
}

/**
 * What a pulse's note means as a charge name. Engine notes are "→ Rent"
 * (the money's destination) or "$370 kept in balance" (the amount is already
 * the chip's own number, so only the words carry). Balance pulses have no
 * note at all. Anything without a readable name falls back to its kind.
 */
function pulseName(pulse: NonNullable<CFNodeData['flowPulses']>[number]): string {
  if (pulse.kind === 'balance') return 'Balance';
  const note = (pulse.note ?? '').trim();
  if (note.startsWith('→ ')) return note.slice(2);
  const kept = note.match(/^\$[\d,]+(?:\.\d+)?\s+(.+)$/);
  if (kept) {
    const words = kept[1];
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  if (note) return note;
  return pulse.kind.charAt(0).toUpperCase() + pulse.kind.slice(1);
}

/**
 * A flow chip shows only the charge name. The amount is a hover bubble
 * above the chip (CSS), so the strip stays compact and fits 3–4 chips
 * per row. Chips take pointer events so the hover works; the container
 * doesn't, so the gaps between chips still pass drags to the canvas.
 */
function FlowChip({ pulse }: { pulse: NonNullable<CFNodeData['flowPulses']>[number] }) {
  const isBalance = pulse.kind === 'balance';
  const sign = pulse.amountCents < 0 ? '−' : isBalance ? '' : '+';
  const abs = Math.abs(pulse.amountCents);
  const d = Math.floor(abs / 100);
  const amount = `${sign}$${d.toLocaleString('en-US')}`;
  return (
    <span className={`cf-flow-chip ${pulse.kind}`} aria-hidden="true">
      <span className="cf-flow-name">{pulseName(pulse)}</span>
      <span className="cf-flow-amount money">{amount}</span>
    </span>
  );
}

function FlowChips({ pulses }: { pulses: NonNullable<CFNodeData['flowPulses']> }) {
  if (pulses.length === 0) return null;
  return (
    <span className="cf-flow-chips" aria-hidden="true">
      {pulses.map((p, i) => (
        <FlowChip key={i} pulse={p} />
      ))}
    </span>
  );
}

/**
 * Rectangular card shell for every node type. One style for all nodes:
 * the same card, the same left-border accent in the type's colour. No
 * per-type shapes — no chevrons, no flag tab, no debt notch, no hexagon.
 */
function RectShell({
  data, selected, className, handles, outputs,
}: NodeProps & {
  className: string;
  handles?: React.ReactNode;
  outputs?: { id: string; label: string }[];
}) {
  const { node, status, orphaned, disabled } = data;
  const n = outputs?.length ?? 0;
  return (
    <div className={`cf-node ${className}${selected ? ' selected' : ''}${disabled ? ' cf-node-disabled' : ''}`} title={node.label}>
      {orphaned && <OrphanBadge />}
      <Label node={node} />
      <Status status={status} />
      {data.flowPulses && <FlowChips pulses={data.flowPulses} />}
      {handles}
      {outputs && (
        <>
          <Handle type="target" position={Position.Left} id="in" aria-label="input" />
          {outputs.map((o, i) => (
            <Handle
              key={o.id}
              type="source"
              position={Position.Right}
              id={o.id}
              style={{ top: n === 1 ? '50%' : `${((i + 1) / (n + 1)) * 100}%` }}
              aria-label={`output ${o.label}`}
              title={o.label}
            />
          ))}
        </>
      )}
    </div>
  );
}

function OutRight({ id = 'out' }: { id?: string }) {
  return <Handle type="source" position={Position.Right} id={id} aria-label="output" />;
}
function InLeft() {
  return <Handle type="target" position={Position.Left} id="in" aria-label="input" />;
}

export function StartingBalanceNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-balance" handles={<OutRight />} />
  );
}

export function IncomeNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-income" handles={<OutRight />} />
  );
}

export function ExpenseNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-expense" handles={<InLeft />} />
  );
}

export function VariableAmountNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-variable" handles={<InLeft />} />
  );
}

export function GoalNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-goal" handles={<InLeft />} />
  );
}

export function DebtNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-debt" handles={<InLeft />} />
  );
}

/** Rectangular split shell — same card as every other node, with one output
 *  handle per split branch along the right edge. */
function SplitShell({
  data, selected, outputs,
}: NodeProps & { outputs: { id: string; label: string }[] }) {
  return <RectShell data={data} selected={selected} className="cf-node-split" outputs={outputs} />;
}

export function PercentageSplitNode(props: NodeProps) {
  const node = props.data.node;
  const outputs = node.type === 'percentageSplit' ? node.outputs : [];
  return <SplitShell {...props} outputs={outputs} />;
}

export function PrioritySplitNode(props: NodeProps) {
  const node = props.data.node;
  const outputs = node.type === 'prioritySplit' ? node.outputs : [];
  return <SplitShell {...props} outputs={outputs} />;
}

export function ConditionalNode(props: NodeProps) {
  const node = props.data.node;
  const outputs = node.type === 'conditional'
    ? [{ id: 'true', label: node.trueLabel }, { id: 'false', label: node.falseLabel }]
    : [];
  return <RectShell {...props} className="cf-node-conditional" outputs={outputs} />;
}

/** Maps engine NodeType -> React Flow custom component. */
export const nodeTypes = {
  startingBalance: StartingBalanceNode,
  income: IncomeNode,
  expense: ExpenseNode,
  variableAmount: VariableAmountNode,
  percentageSplit: PercentageSplitNode,
  prioritySplit: PrioritySplitNode,
  conditional: ConditionalNode,
  goal: GoalNode,
  debt: DebtNode,
};
