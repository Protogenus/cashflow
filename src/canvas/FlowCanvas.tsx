/**
 * canvas/FlowCanvas.tsx — React Flow canvas. Engine PlanGraph is the source
 * of truth; RF nodes/edges are derived view-models. Handles: palette drop,
 * drag-to-connect (engine-validated), grouped undo drag, Delete key.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraphStore } from '../store/graphStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useFlowStore } from '../store/flowStore';
import { findOrphanedNodes } from '../engine';
import { cardStatus } from './cardStatus';
import { nodeTypes, type CFNodeData } from './nodes';
import { FlowMoneyEdge } from './FlowMoneyEdge';
import { NODE_META, createNode } from './templates';
import type { NodeType, PlanNode } from '../engine/types';

function edgeClass(source: PlanNode | undefined): string {
  if (!source) return '';
  // Explicit checks (not the isIncomeSource guard): the guard's false branch
  // would narrow away 'variableAmount' and break the expense check below.
  const incomeLike =
    source.type === 'income' || (source.type === 'variableAmount' && source.direction === 'income');
  if (incomeLike) return 'cf-edge-income';
  if (source.type === 'expense' || source.type === 'variableAmount') return 'cf-edge-expense';
  return '';
}

export function FlowCanvas() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const flowActive = useFlowStore((s) => s.active);
  const flowFrames = useFlowStore((s) => s.frames);
  const flowFrameIndex = useFlowStore((s) => s.frameIndex);
  const flowFrame = flowActive
    ? flowFrames[Math.min(flowFrameIndex, flowFrames.length - 1)] ?? null
    : null;
  const flowEdgeIds = useMemo(
    () => new Set((flowFrame?.transfers ?? []).flatMap((t) => t.edgeIds)),
    [flowFrame],
  );
  const flowPulses = useMemo(
    () => new Map((flowFrame?.pulses ?? []).map((p) => [p.nodeId, p])),
    [flowFrame],
  );
  /** Edge id → amount carried on the current frame (drives money-dot count). */
  const flowAmounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of flowFrame?.transfers ?? []) {
      for (const id of t.edgeIds) m.set(id, (m.get(id) ?? 0) + t.amountCents);
    }
    return m;
  }, [flowFrame]);

  const edgeTypes = useMemo(() => ({ flow: FlowMoneyEdge }), []);
  const { screenToFlowPosition } = useReactFlow();

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const orphanIds = useMemo(
    () => new Set(findOrphanedNodes(graph).map((n) => n.id)),
    [graph],
  );
  const disabledIds = useScenarioStore(
    (s) => s.scenarios.find((x) => x.id === s.activeScenarioId)?.disabledNodeIds ?? [],
  );

  const rfNodes: Node<CFNodeData>[] = useMemo(
    () =>
      nodes.map((n) => {
        const status = cardStatus(graph, n);
        const disabled = disabledIds.includes(n.id);
        return {
          id: n.id,
          type: n.type,
          position: n.position,
          selected: selectedNodeIds.includes(n.id),
          // DESIGN.md §9: nodes exposed as named buttons for screen readers.
          ariaLabel:
            `${NODE_META[n.type].title} node: ${n.label}, ${status.primary}` +
            (status.secondary ? `, ${status.secondary}` : '') +
            (disabled ? ', excluded from this scenario' : '') +
            (orphanIds.has(n.id) ? ', not connected' : ''),
          data: { node: n, status, orphaned: orphanIds.has(n.id), disabled, flowPulse: flowPulses.get(n.id) ?? null },
        };
      }),
    [nodes, selectedNodeIds, orphanIds, disabledIds, graph, flowPulses],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const src = nodes.find((n) => n.id === e.source);
        const flowing = flowEdgeIds.has(e.id);
        return {
          id: e.id,
          type: 'flow',
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          data: {
            flowing,
            tone: edgeClass(src),
            amountCents: flowAmounts.get(e.id) ?? 0,
          },
          selected: e.id === selectedEdgeId,
        };
      }),
    [edges, nodes, selectedEdgeId, flowEdgeIds, flowAmounts],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const st = useGraphStore.getState();
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          st.moveNode(c.id, c.position); // silent; history grouped by drag start/stop
        } else if (c.type === 'select') {
          // Accumulate into the multi-selection set (marquee / shift-click).
          const ids = new Set(st.selectedNodeIds);
          if (c.selected) ids.add(c.id);
          else ids.delete(c.id);
          st.setSelectedMany([...ids]);
          if (c.selected) setSelectedEdgeId(null);
        }
      }
    },
    [],
  );

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    useGraphStore
      .getState()
      .connectNodes(conn.source, conn.target, conn.sourceHandle ?? 'out', conn.targetHandle ?? 'in');
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/cashflow-node-type') as NodeType;
      if (!type || !NODE_META[type]) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      useGraphStore.getState().addNode(createNode(type, position));
    },
    [screenToFlowPosition],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // Delete/Backspace removes the selected node (and its edges) or edge —
  // never while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) {
        return;
      }
      e.preventDefault();
      const st = useGraphStore.getState();
      if (selectedEdgeId) {
        st.deleteEdge(selectedEdgeId);
        setSelectedEdgeId(null);
      } else if (st.selectedNodeIds.length > 0) {
        st.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEdgeId]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      panOnDrag={[1, 2]}
      edgeTypes={edgeTypes}
      onConnect={onConnect}
      onNodeDragStart={() => useGraphStore.getState().beginDrag()}
      onNodeDragStop={() => useGraphStore.getState().endDrag()}
      onEdgeClick={(_, edge) => {
        setSelectedEdgeId(edge.id);
        useGraphStore.getState().setSelected(null);
      }}
      onPaneClick={() => {
        setSelectedEdgeId(null);
        useGraphStore.getState().setSelected(null);
      }}
      onDrop={onDrop}
      onDragOver={onDragOver}
      deleteKeyCode={null}
      fitView
      minZoom={0.2}
      maxZoom={2}
      className="cf-canvas"
      aria-label="Money plan canvas. Drag on empty canvas to select several nodes, then drag them to move together. Tab moves between nodes; Enter edits the focused node."
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
