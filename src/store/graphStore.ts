/**
 * store/graphStore.ts — graph state (Zustand). The engine's PlanGraph is the
 * source of truth; React Flow nodes derive from it in FlowCanvas.
 *
 * Undo/redo is a single grouped stack (RESEARCH.md §3): one drag = one step
 * (snapshot taken on drag start, committed on drag stop), inspector typing is
 * debounced (~400ms) into one step, add/delete/connect commit immediately.
 */
import { create } from 'zustand';
import {
  validateConnection,
  type NodeId,
  type PlanEdge,
  type PlanGraph,
  type PlanNode,
} from '../engine';
import { createStarterGraph } from '../canvas/templates';

export interface Snapshot {
  nodes: PlanNode[];
  edges: PlanEdge[];
}

interface GraphStore {
  nodes: PlanNode[];
  edges: PlanEdge[];
  selectedNodeId: NodeId | null;
  toast: string | null;
  past: Snapshot[];
  future: Snapshot[];

  // --- mutations (each documents its history behavior) ---
  /** Palette drop / click-add: one history step. */
  addNode: (node: PlanNode) => void;
  /** Inspector live edit: NO history (call beginEdit/commitEdit around bursts). */
  updateNode: (id: NodeId, updater: (n: PlanNode) => PlanNode) => void;
  /** Canvas drag: NO history (call beginDrag/endDrag around the gesture). */
  moveNode: (id: NodeId, position: { x: number; y: number }) => void;
  /** Delete key: one history step (node + incident edges). */
  deleteNode: (id: NodeId) => void;
  /** Canvas connect: validates via the engine; one history step on success. */
  connectNodes: (source: NodeId, target: NodeId, sourceHandle: string, targetHandle: string) => void;
  deleteEdge: (id: string) => void;
  setSelected: (id: NodeId | null) => void;
  dismissToast: () => void;

  // --- history grouping ---
  beginEdit: () => void;
  commitEdit: () => void;
  beginDrag: () => void;
  endDrag: () => void;
  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 100;

function snap(nodes: PlanNode[], edges: PlanEdge[]): Snapshot {
  // structuredClone keeps history snapshots fully detached from live state.
  return { nodes: structuredClone(nodes), edges: structuredClone(edges) };
}

function graphOf(s: { nodes: PlanNode[]; edges: PlanEdge[] }): PlanGraph {
  return { nodes: s.nodes, edges: s.edges };
}

// Anchors for grouped operations (module-level: exactly one gesture at a time).
let editAnchor: Snapshot | null = null;
let dragAnchor: Snapshot | null = null;

export const useGraphStore = create<GraphStore>()((set, get) => {
  /** Push a before-state onto the undo stack and clear redo. */
  const pushHistory = (before: Snapshot) => {
    const { past } = get();
    set({ past: [...past.slice(-(HISTORY_LIMIT - 1)), before], future: [] });
  };

  return {
    ...createStarterGraph(),
    selectedNodeId: null,
    toast: null,
    past: [],
    future: [],

    addNode: (node) => {
      const { nodes, edges } = get();
      pushHistory(snap(nodes, edges));
      set({ nodes: [...nodes, node], selectedNodeId: node.id });
    },

    updateNode: (id, updater) => {
      set({ nodes: get().nodes.map((n) => (n.id === id ? updater(n) : n)) });
    },

    moveNode: (id, position) => {
      set({
        nodes: get().nodes.map((n) => (n.id === id ? { ...n, position } : n)),
      });
    },

    deleteNode: (id) => {
      const { nodes, edges, selectedNodeId } = get();
      pushHistory(snap(nodes, edges));
      set({
        nodes: nodes.filter((n) => n.id !== id),
        edges: edges.filter((e) => e.source !== id && e.target !== id),
        selectedNodeId: selectedNodeId === id ? null : selectedNodeId,
      });
    },

    connectNodes: (source, target, sourceHandle, targetHandle) => {
      const st = get();
      const check = validateConnection(graphOf(st), source, target);
      if (!check.ok) {
        set({ toast: check.reason ?? 'Connection rejected.' });
        return;
      }
      pushHistory(snap(st.nodes, st.edges));
      const edge: PlanEdge = {
        id: `e_${crypto.randomUUID()}`,
        source,
        sourceHandle,
        target,
        targetHandle,
      };
      set({ edges: [...st.edges, edge] });
    },

    deleteEdge: (id) => {
      const { nodes, edges } = get();
      pushHistory(snap(nodes, edges));
      set({ edges: edges.filter((e) => e.id !== id) });
    },

    setSelected: (id) => set({ selectedNodeId: id }),
    dismissToast: () => set({ toast: null }),

    beginEdit: () => {
      if (!editAnchor) {
        const { nodes, edges } = get();
        editAnchor = snap(nodes, edges);
      }
    },
    commitEdit: () => {
      if (editAnchor) {
        const { nodes, edges } = get();
        if (JSON.stringify(editAnchor) !== JSON.stringify({ nodes, edges })) {
          pushHistory(editAnchor);
        }
        editAnchor = null;
      }
    },
    beginDrag: () => {
      const { nodes, edges } = get();
      dragAnchor = snap(nodes, edges);
    },
    endDrag: () => {
      if (dragAnchor) {
        const { nodes, edges } = get();
        if (JSON.stringify(dragAnchor) !== JSON.stringify({ nodes, edges })) {
          pushHistory(dragAnchor);
        }
        dragAnchor = null;
      }
    },

    undo: () => {
      const { past, future, nodes, edges } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({
        nodes: prev.nodes,
        edges: prev.edges,
        past: past.slice(0, -1),
        future: [...future, snap(nodes, edges)],
        selectedNodeId: null,
      });
    },
    redo: () => {
      const { past, future, nodes, edges } = get();
      const next = future[future.length - 1];
      if (!next) return;
      set({
        nodes: next.nodes,
        edges: next.edges,
        past: [...past, snap(nodes, edges)],
        future: future.slice(0, -1),
        selectedNodeId: null,
      });
    },
  };
});
