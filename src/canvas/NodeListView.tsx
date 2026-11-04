/**
 * canvas/NodeListView.tsx — list-view fallback for the plan graph on small
 * screens (DESIGN.md §8). The spatial canvas is replaced by a vertical list
 * of node cards grouped by type (money in → splits/logic → money out →
 * goals/debts); each card expands to the SAME NodeEditor the Inspector tab
 * uses, so editing is identical in both views. Edges are summarized as
 * "flows to" chips (removable) plus a connect control.
 *
 * Switching between canvas and list is manual (App's mobile toggle) and
 * persists per device — never automatic mid-session.
 */
import { useMemo, useState } from 'react';
import { useGraphStore } from '../store/graphStore';
import { useScenarioStore } from '../store/scenarioStore';
import { cardStatus } from './cardStatus';
import { NODE_META, createNode } from './templates';
import { NodeIcon } from './nodeIcons';
import { NodeEditor } from './Inspector';
import type { NodeId, NodeType, PlanEdge, PlanGraph, PlanNode } from '../engine/types';

type Group = 'Money in' | 'Splits & logic' | 'Money out' | 'Goals & debts';

function groupOf(n: PlanNode): Group {
  switch (n.type) {
    case 'startingBalance':
    case 'income':
      return 'Money in';
    case 'variableAmount':
      return n.direction === 'income' ? 'Money in' : 'Money out';
    case 'percentageSplit':
    case 'prioritySplit':
    case 'conditional':
      return 'Splits & logic';
    case 'expense':
      return 'Money out';
    case 'goal':
    case 'debt':
      return 'Goals & debts';
  }
}

const GROUP_ORDER: Group[] = ['Money in', 'Splits & logic', 'Money out', 'Goals & debts'];
const ADD_ORDER: NodeType[] = [
  'startingBalance', 'income', 'expense', 'variableAmount',
  'percentageSplit', 'prioritySplit', 'conditional', 'goal', 'debt',
];

function FlowChips({ node, edges, nodes }: { node: PlanNode; edges: PlanEdge[]; nodes: PlanNode[] }) {
  const deleteEdge = useGraphStore((s) => s.deleteEdge);
  const labelOf = (id: NodeId) => nodes.find((n) => n.id === id)?.label ?? 'removed node';
  const incoming = edges.filter((e) => e.target === node.id);
  const outgoing = edges.filter((e) => e.source === node.id);
  if (incoming.length === 0 && outgoing.length === 0) return null;
  return (
    <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
      {outgoing.length > 0 && (
        <div className="mb-1">
          <span className="font-semibold">Flows to: </span>
          {outgoing.map((e) => (
            <span
              key={e.id}
              className="mr-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              {labelOf(e.target)}
              <button
                className="font-bold"
                onClick={() => deleteEdge(e.id)}
                aria-label={`Remove connection to ${labelOf(e.target)}`}
                title="Remove connection"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {incoming.length > 0 && (
        <div>
          <span className="font-semibold">From: </span>
          {incoming.map((e) => (
            <span
              key={e.id}
              className="mr-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              {labelOf(e.source)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectControl({ node, nodes, edges }: { node: PlanNode; nodes: PlanNode[]; edges: PlanEdge[] }) {
  const connectNodes = useGraphStore((s) => s.connectNodes);
  const [target, setTarget] = useState('');
  const candidates = useMemo(
    () =>
      nodes.filter(
        (n) => n.id !== node.id && !edges.some((e) => e.source === node.id && e.target === n.id),
      ),
    [nodes, edges, node.id],
  );
  if (candidates.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px]">
      <label className="flex flex-1 items-center gap-2">
        <span style={{ color: 'var(--text-muted)' }}>Connect to</span>
        <select
          className="min-w-0 flex-1 rounded border px-1 py-1 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label={`Connect ${node.label} to another node`}
        >
          <option value="">Choose a node…</option>
          {candidates.map((n) => (
            <option key={n.id} value={n.id}>
              {NODE_META[n.type].title}: {n.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="cf-btn px-2 py-1 text-xs"
        disabled={!target}
        onClick={() => {
          if (target) {
            connectNodes(node.id, target, 'out', 'in');
            setTarget('');
          }
        }}
      >
        Connect
      </button>
    </div>
  );
}

function NodeCard({ node, graph, expanded, onToggle }: {
  node: PlanNode;
  graph: PlanGraph;
  expanded: boolean;
  onToggle: () => void;
}) {
  const setSelected = useGraphStore((s) => s.setSelected);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const disabled = useScenarioStore((s) =>
    (s.scenarios.find((x) => x.id === s.activeScenarioId)?.disabledNodeIds ?? []).includes(node.id),
  );
  const status = cardStatus(graph, node);
  return (
    <div
      className="cf-panel"
      style={selectedNodeId === node.id ? { borderColor: 'var(--accent)' } : undefined}
    >
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => {
          onToggle();
          setSelected(node.id);
        }}
        aria-expanded={expanded}
        aria-label={`${NODE_META[node.type].title}: ${node.label}. ${expanded ? 'Collapse' : 'Expand'} to edit.`}
      >
        <span style={{ color: 'var(--accent)' }} aria-hidden="true">
          <NodeIcon type={node.type} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">
            {node.label}
            {disabled && (
              <span className="ml-2 rounded border px-1 text-[10px] font-normal" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
                excluded
              </span>
            )}
          </span>
          <span className="block truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {status.primary}{status.secondary ? ` · ${status.secondary}` : ''}
          </span>
        </span>
        <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="border-t px-1 pb-2" style={{ borderColor: 'var(--border)' }}>
          <FlowChips node={node} edges={graph.edges} nodes={graph.nodes} />
          <ConnectControl node={node} nodes={graph.nodes} edges={graph.edges} />
          <NodeEditor nodeId={node.id} />
        </div>
      )}
    </div>
  );
}

export function NodeListView() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const addNode = useGraphStore((s) => s.addNode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const [expandedId, setExpandedId] = useState<NodeId | null>(selectedNodeId);
  const [addType, setAddType] = useState<NodeType>('expense');

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const grouped = useMemo(() => {
    const m = new Map<Group, PlanNode[]>();
    for (const g of GROUP_ORDER) m.set(g, []);
    for (const n of nodes) m.get(groupOf(n))!.push(n);
    return m;
  }, [nodes]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3" aria-label="Plan nodes as a list">
      {/* add control (replaces the palette on small screens) */}
      <div className="cf-panel flex items-center gap-2 p-2">
        <label className="flex flex-1 items-center gap-2 text-xs">
          <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Add node</span>
          <select
            className="min-w-0 flex-1 rounded border px-2 py-2 text-[13px]"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
            value={addType}
            onChange={(e) => setAddType(e.target.value as NodeType)}
            aria-label="Node type to add"
          >
            {ADD_ORDER.map((t) => (
              <option key={t} value={t}>{NODE_META[t].title} — {NODE_META[t].blurb}</option>
            ))}
          </select>
        </label>
        <button
          className="cf-btn cf-btn-primary px-4 py-2 text-sm"
          onClick={() => {
            const position = { x: 40, y: 40 + nodes.length * 48 };
            addNode(createNode(addType, position));
          }}
        >
          Add
        </button>
      </div>

      {nodes.length === 0 && (
        <div className="cf-panel p-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No nodes yet</p>
          <p className="mt-1 text-xs">Add your first node above, or load a starter template from Settings.</p>
        </div>
      )}

      {GROUP_ORDER.map((g) => {
        const list = grouped.get(g)!;
        if (list.length === 0) return null;
        return (
          <section key={g} aria-label={g}>
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              {g}
            </h2>
            <div className="flex flex-col gap-2">
              {list.map((n) => (
                <NodeCard
                  key={n.id}
                  node={n}
                  graph={graph}
                  expanded={expandedId === n.id}
                  onToggle={() => setExpandedId(expandedId === n.id ? null : n.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
