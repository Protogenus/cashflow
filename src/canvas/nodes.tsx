/**
 * canvas/nodes.tsx — the 9 custom React Flow node components.
 * Visual language per DESIGN.md §4: every type is distinct by shape + color
 * + icon (redundant encoding, never color alone). Cards show live computed
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

function Status({ status }: { status: CardStatus }) {
  return (
    <>
      <div className="cf-node-status money">{status.primary}</div>
      {status.secondary && <div className="cf-node-status">{status.secondary}</div>}
    </>
  );
}

/** Rectangular card shell (balance / income / expense / variable / goal / debt). */
function RectShell({
  data, selected, className, chevron, flagTab, handles,
}: NodeProps & {
  className: string;
  chevron?: boolean;
  flagTab?: boolean;
  handles: React.ReactNode;
}) {
  const { node, status, orphaned, disabled } = data;
  return (
    <div className={`cf-node ${className}${selected ? ' selected' : ''}${disabled ? ' cf-node-disabled' : ''}`} title={node.label}>
      {chevron && <span className="cf-edge-chevron" aria-hidden="true" />}
      {flagTab && <span className="cf-flag-tab" aria-hidden="true" />}
      {orphaned && <OrphanBadge />}
      <Label node={node} />
      <Status status={status} />
      {handles}
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
    <RectShell {...props} className="cf-node-income" chevron handles={<OutRight />} />
  );
}

export function ExpenseNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-expense" chevron handles={<InLeft />} />
  );
}

export function VariableAmountNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-variable" handles={<InLeft />} />
  );
}

export function GoalNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-goal" flagTab handles={<InLeft />} />
  );
}

export function DebtNode(props: NodeProps) {
  return (
    <RectShell {...props} className="cf-node-debt" handles={<InLeft />} />
  );
}

/** Diamond shell shared by the two split nodes. */
function DiamondShell({
  data, selected, badge, outputs,
}: NodeProps & { badge?: React.ReactNode; outputs: { id: string; label: string }[] }) {
  const { node, status, orphaned, disabled } = data;
  const n = outputs.length;
  return (
    <div className={`cf-diamond-wrap${selected ? ' selected' : ''}${disabled ? ' cf-node-disabled' : ''}`} title={node.label}>
      {orphaned && <OrphanBadge />}
      {badge}
      <div className="cf-diamond" aria-hidden="true" />
      <div className="cf-diamond-content">
        <div className="cf-node-label">
          <span className="cf-node-icon">
            <NodeIcon type={node.type} />
          </span>
          <span>{node.label}</span>
        </div>
        <div className="cf-node-status money">{status.primary}</div>
        {status.secondary && <div className="cf-node-status">{status.secondary}</div>}
      </div>
      <Handle type="target" position={Position.Left} id="in" style={{ top: '50%' }} aria-label="input" />
      {outputs.map((o, i) => (
        <Handle
          key={o.id}
          type="source"
          position={Position.Right}
          id={o.id}
          style={{ top: `${((i + 1) / (n + 1)) * 100}%` }}
          aria-label={`output ${o.label}`}
          title={o.label}
        />
      ))}
    </div>
  );
}

export function PercentageSplitNode(props: NodeProps) {
  const node = props.data.node;
  const outputs = node.type === 'percentageSplit' ? node.outputs : [];
  return <DiamondShell {...props} outputs={outputs} />;
}

export function PrioritySplitNode(props: NodeProps) {
  const node = props.data.node;
  const outputs = node.type === 'prioritySplit' ? node.outputs : [];
  return (
    <DiamondShell
      {...props}
      outputs={outputs}
      badge={
        <span className="cf-priority-badge" title="Priority order">
          <NodeIcon type="prioritySplit" />
        </span>
      }
    />
  );
}

export function ConditionalNode(props: NodeProps) {
  const { node, status, orphaned } = props.data;
  const { selected } = props;
  return (
    <div className={`cf-hex-wrap${selected ? ' selected' : ''}`} title={node.label}>
      {orphaned && <OrphanBadge />}
      <div className="cf-hex-border" aria-hidden="true" />
      <div className="cf-hex">
        <div className="cf-node-label">
          <span className="cf-node-icon">
            <NodeIcon type={node.type} />
          </span>
          <span>{node.label}</span>
        </div>
        <div className="cf-node-status money">{status.primary}</div>
        {status.secondary && <div className="cf-node-status">{status.secondary}</div>}
      </div>
      <Handle type="target" position={Position.Left} id="in" style={{ top: '50%' }} aria-label="input" />
      <Handle type="source" position={Position.Right} id="true" style={{ top: '32%' }} aria-label="true output" title="true" />
      <Handle type="source" position={Position.Right} id="false" style={{ top: '68%' }} aria-label="false output" title="false" />
    </div>
  );
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
