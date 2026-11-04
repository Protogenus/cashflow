/**
 * store/assumptionsStore.ts — the Assumptions object (Zustand).
 * Every change here changes the assumptions hash, so results keyed by that
 * hash are visibly marked stale until re-run (resultsSlice, later milestone).
 * Milestone 3 exposes horizon + safety buffer; the full assumptions panel
 * comes with a later milestone.
 */
import { create } from 'zustand';
import { DEFAULT_ASSUMPTIONS, type Assumptions } from '../engine';

interface AssumptionsStore {
  assumptions: Assumptions;
  set: (patch: Partial<Assumptions>) => void;
}

export const useAssumptionsStore = create<AssumptionsStore>()((set) => ({
  assumptions: DEFAULT_ASSUMPTIONS,
  set: (patch) => set((s) => ({ assumptions: { ...s.assumptions, ...patch } })),
}));
