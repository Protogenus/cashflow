/**
 * store/resultsStore.ts — heavy simulation results (Zustand, in-memory).
 *
 * Optimizer candidates, Monte Carlo results, and the tradeoff table live
 * here (not in the graph/assumptions stores) so the panels share them.
 * Each result is stored with the fingerprint of the inputs that produced
 * it; the UI marks results stale when the graph/assumptions change.
 * Plain JSON throughout — ready for milestone-10 persistence.
 */
import { create } from 'zustand';
import type { MonteCarloResult } from '../engine/montecarlo';
import type { OptimizeResult } from '../engine/optimize';

export interface TradeoffRow {
  candidateIndex: number;
  label: string;
  splits: Record<string, number[]>;
  goalScore: number;
  goalScoreLabel: string;
  overdraftChance: number; // 0..1 — share of runs that dipped below $0
  minBalanceP5: number; // cents
  rentMissChance: number; // 0..1 — worst month
  explanation: string;
  pinchDate: string;
  drivers: { name: string; contributionCents: number }[];
  monteCarlo: MonteCarloResult;
}

interface ResultsStore {
  optimizer: OptimizeResult | null;
  optimizerFingerprint: string | null;
  setOptimizer: (r: OptimizeResult, fingerprint: string) => void;

  monteCarlo: MonteCarloResult | null;
  monteCarloFingerprint: string | null;
  setMonteCarlo: (r: MonteCarloResult, fingerprint: string) => void;
  /**
   * Live MC progress + running flag, mirrored here (not just view-local
   * state) so a run survives tab switches: the pool callbacks outlive the
   * view, and a remounted view reads the same store.
   */
  mcProgress: { done: number; total: number } | null;
  setMcProgress: (p: { done: number; total: number } | null) => void;
  mcRunning: boolean;
  setMcRunning: (b: boolean) => void;

  tradeoff: TradeoffRow[] | null;
  tradeoffFingerprint: string | null;
  setTradeoff: (rows: TradeoffRow[], fingerprint: string) => void;
  /** Per-candidate tradeoff progress (same remount reasoning as mcProgress). */
  tradeoffProgress: { candidate: number; total: number; done: number; totalRuns: number } | null;
  setTradeoffProgress: (p: ResultsStore['tradeoffProgress']) => void;
  tradeoffRunning: boolean;
  setTradeoffRunning: (b: boolean) => void;

  clearAll: () => void;
}

export const useResultsStore = create<ResultsStore>()((set) => ({
  optimizer: null,
  optimizerFingerprint: null,
  setOptimizer: (optimizer, optimizerFingerprint) =>
    set({ optimizer, optimizerFingerprint, tradeoff: null, tradeoffFingerprint: null }),

  monteCarlo: null,
  monteCarloFingerprint: null,
  setMonteCarlo: (monteCarlo, monteCarloFingerprint) => set({ monteCarlo, monteCarloFingerprint }),

  mcProgress: null,
  setMcProgress: (mcProgress) => set({ mcProgress }),
  mcRunning: false,
  setMcRunning: (mcRunning) => set({ mcRunning }),

  tradeoff: null,
  tradeoffFingerprint: null,
  setTradeoff: (tradeoff, tradeoffFingerprint) => set({ tradeoff, tradeoffFingerprint }),

  tradeoffProgress: null,
  setTradeoffProgress: (tradeoffProgress) => set({ tradeoffProgress }),
  tradeoffRunning: false,
  setTradeoffRunning: (tradeoffRunning) => set({ tradeoffRunning }),

  clearAll: () =>
    set({
      optimizer: null,
      optimizerFingerprint: null,
      monteCarlo: null,
      monteCarloFingerprint: null,
      mcProgress: null,
      mcRunning: false,
      tradeoff: null,
      tradeoffFingerprint: null,
      tradeoffProgress: null,
      tradeoffRunning: false,
    }),
}));
