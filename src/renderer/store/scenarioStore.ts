/**
 * store/scenarioStore.ts — what-if scenarios (Zustand).
 *
 * Each scenario is a full copy of the graph plus per-scenario node on/off
 * toggles (disabledNodeIds). The graphStore remains the editing surface for
 * the ACTIVE scenario: a subscription mirrors every graph edit into the
 * active scenario, and switching scenarios persists the outgoing graph and
 * loads the incoming one. Undo/redo history is per scenario-switch (reset
 * on switch — cross-scenario undo would be surprising).
 *
 * The model is plain JSON (Scenario from the engine types), so it
 * serializes cleanly for localStorage persistence (milestone 10).
 */
import { create } from 'zustand';
import { useGraphStore } from './graphStore';
import { createStarterGraph } from '../canvas/templates';
import type { NodeId, PlanEdge, PlanNode, Scenario } from '../engine';

interface ScenarioStore {
  scenarios: Scenario[];
  activeScenarioId: string;

  /** Duplicate the active scenario's current graph into a new named scenario. */
  createScenario: (name?: string) => void;
  duplicateScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  deleteScenario: (id: string) => void;
  setActiveScenario: (id: string) => void;
  /** Flip a node's include/exclude toggle within the active scenario. */
  toggleNodeDisabled: (nodeId: NodeId) => void;
  isNodeDisabled: (nodeId: NodeId) => boolean;
  /**
   * Replace the whole scenario list (boot hydration, import, reset).
   * Loads the active scenario's graph into the editor and resets undo.
   */
  hydrate: (scenarios: Scenario[], activeScenarioId: string) => void;
  /** Back to a single fresh baseline scenario (used by "Reset all data"). */
  resetToStarter: () => void;
}

function nowISO(): string {
  return new Date().toISOString();
}

function makeScenario(name: string, nodes: PlanNode[], edges: PlanEdge[], isBaseline: boolean): Scenario {
  return {
    id: `scn_${crypto.randomUUID()}`,
    name,
    graph: { nodes: structuredClone(nodes), edges: structuredClone(edges) },
    disabledNodeIds: [],
    isBaseline,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

function activeOf(s: { scenarios: Scenario[]; activeScenarioId: string }): Scenario {
  return s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0];
}

export const useScenarioStore = create<ScenarioStore>()((set, get) => {
  // Seed from the graph store's initial state so ids match from the start.
  const g0 = useGraphStore.getState();
  const base = makeScenario('Base', g0.nodes, g0.edges, true);

  /** Write the live graph back into the active scenario (subscribe target). */
  const persistActive = (nodes: PlanNode[], edges: PlanEdge[]) => {
    const st = get();
    const active = activeOf(st);
    if (!active) return;
    // Skip the write when nothing changed (e.g. right after a scenario load).
    const cur = active.graph;
    if (cur.nodes === nodes && cur.edges === edges) return;
    set({
      scenarios: st.scenarios.map((s) =>
        s.id === active.id
          ? { ...s, graph: { nodes, edges }, updatedAt: nowISO() }
          : s,
      ),
    });
  };

  // Mirror every graph edit into the active scenario. This subscription only
  // reads graphStore, so scenario edits here never loop back.
  useGraphStore.subscribe((s) => persistActive(s.nodes, s.edges));

  /** Load a scenario's graph into the editing surface (resets undo history). */
  const loadIntoGraph = (scn: Scenario) => {
    useGraphStore.setState({
      nodes: structuredClone(scn.graph.nodes),
      edges: structuredClone(scn.graph.edges),
      selectedNodeId: null,
      past: [],
      future: [],
    });
  };

  return {
    scenarios: [base],
    activeScenarioId: base.id,

    createScenario: (name) => {
      const st = get();
      const g = useGraphStore.getState();
      const count = st.scenarios.length + 1;
      const scn = makeScenario(name?.trim() || `Scenario ${count}`, g.nodes, g.edges, false);
      set({ scenarios: [...st.scenarios, scn], activeScenarioId: scn.id });
      loadIntoGraph(scn);
    },

    duplicateScenario: (id) => {
      const st = get();
      const src = st.scenarios.find((s) => s.id === id);
      if (!src) return;
      const copy = makeScenario(`${src.name} (copy)`, src.graph.nodes, src.graph.edges, false);
      copy.disabledNodeIds = [...src.disabledNodeIds];
      set({ scenarios: [...st.scenarios, copy], activeScenarioId: copy.id });
      loadIntoGraph(copy);
    },

    renameScenario: (id, name) => {
      const clean = name.trim();
      if (!clean) return;
      set((st) => ({
        scenarios: st.scenarios.map((s) =>
          s.id === id ? { ...s, name: clean, updatedAt: nowISO() } : s,
        ),
      }));
    },

    deleteScenario: (id) => {
      const st = get();
      if (st.scenarios.length <= 1) return; // always keep one scenario
      const remaining = st.scenarios.filter((s) => s.id !== id);
      const nextActive =
        st.activeScenarioId === id ? remaining[0].id : st.activeScenarioId;
      set({ scenarios: remaining, activeScenarioId: nextActive });
      if (st.activeScenarioId === id) {
        const scn = remaining.find((s) => s.id === nextActive)!;
        loadIntoGraph(scn);
      }
    },

    setActiveScenario: (id) => {
      const st = get();
      if (id === st.activeScenarioId) return;
      const scn = st.scenarios.find((s) => s.id === id);
      if (!scn) return;
      // The subscribe mirror already persisted the outgoing graph.
      set({ activeScenarioId: id });
      loadIntoGraph(scn);
    },

    toggleNodeDisabled: (nodeId) => {
      set((st) => {
        const active = activeOf(st);
        const has = active.disabledNodeIds.includes(nodeId);
        const disabledNodeIds = has
          ? active.disabledNodeIds.filter((x) => x !== nodeId)
          : [...active.disabledNodeIds, nodeId];
        return {
          scenarios: st.scenarios.map((s) =>
            s.id === active.id ? { ...s, disabledNodeIds, updatedAt: nowISO() } : s,
          ),
        };
      });
    },

    isNodeDisabled: (nodeId) => activeOf(get()).disabledNodeIds.includes(nodeId),

    hydrate: (scenarios, activeScenarioId) => {
      const list = structuredClone(scenarios);
      const active = list.find((s) => s.id === activeScenarioId) ?? list[0];
      if (!active) return;
      set({ scenarios: list, activeScenarioId: active.id });
      loadIntoGraph(active);
    },

    resetToStarter: () => {
      const { nodes, edges } = createStarterGraph();
      // '' matches nothing, so hydrate falls back to the single fresh scenario.
      get().hydrate([makeScenario('Base', nodes, edges, true)], '');
    },
  };
});
