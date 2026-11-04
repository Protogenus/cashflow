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
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraphStore } from '../store/graphStore';
import { findOrphanedNodes } from '../engine';
import { cardStatus } from './cardStatus';
import { nodeTypes, type CFNodeData } from './nodes';
import { NODE_META, createNode } from './templates';
import type { NodeType } from '../engine/types';

function edgeClass(sourceType: NodeType | undefined): string {
  if (sourceType === 'income') return 'cf-edge-income';
  if (sourceType === 'expense' || sourceType === 'variableAmount') return 'cf-edge-expense';
  return '';
}

export function FlowCanvas() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const orphanIds = useMemo(
    () => new Set(findOrphanedNodes(graph).map((n) => n.id)),
    [graph],
  );

  const rfNodes: Node<CFNodeData>[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        selected: n.id === selectedNodeId,
        data: { node: n, status: cardStatus(graph, n), orphaned: orphanIds.has(n.id) },
      })),
    [nodes, selectedNodeId, orphanIds, graph],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const src = nodes.find((n) => n.id === e.source);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          className: edgeClass(src?.type),
          selected: e.id === selectedEdgeId,
        };
      }),
    [edges, nodes, selectedEdgeId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const st = useGraphStore.getState();
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          st.moveNode(c.id, c.position); // silent; history grouped by drag start/stop
        } else if (c.type === 'select') {
          st.setSelected(c.selected ? c.id : null);
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
      } else if (st.selectedNodeId) {
        st.deleteNode(st.selectedNodeId);
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
      aria-label="Money plan canvas. Tab to move between nodes; Enter edits the focused node."
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}
