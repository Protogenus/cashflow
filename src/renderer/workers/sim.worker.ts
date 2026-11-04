/**
 * workers/sim.worker.ts — Monte Carlo simulation off the main thread.
 *
 * Vite `?worker` import; the engine is pure TS so it bundles cleanly.
 * Protocol (all structured-cloneable, no functions):
 *   main -> worker: { id, kind: 'montecarlo', graph, assumptions, options }
 *   worker -> main: { id, type: 'progress', done, total }
 *                   { id, type: 'done', result }
 *                   { id, type: 'error', message }
 * Cancellation is worker.terminate() from the main thread (milestone 7
 * reuses the same protocol for sequential per-candidate runs).
 */
import { runMonteCarlo } from '../engine/montecarlo';
import type { Assumptions, ISODate, NodeId, PlanGraph } from '../engine/types';

export interface WorkerRunOptions {
  runs: number;
  seed: number;
  startDate?: ISODate;
  disabledNodeIds?: NodeId[];
}

export interface WorkerRunMessage {
  id: string;
  kind: 'montecarlo';
  graph: PlanGraph;
  assumptions: Assumptions;
  options: WorkerRunOptions;
}

export type WorkerOutMessage =
  | { id: string; type: 'progress'; done: number; total: number }
  | { id: string; type: 'done'; result: ReturnType<typeof runMonteCarlo> }
  | { id: string; type: 'error'; message: string };

self.onmessage = (e: MessageEvent<WorkerRunMessage>) => {
  const msg = e.data;
  if (!msg || msg.kind !== 'montecarlo') return;
  try {
    const result = runMonteCarlo(msg.graph, msg.assumptions, {
      ...msg.options,
      onProgress: (done, total) => {
        const out: WorkerOutMessage = { id: msg.id, type: 'progress', done, total };
        self.postMessage(out);
      },
    });
    const done: WorkerOutMessage = { id: msg.id, type: 'done', result };
    self.postMessage(done);
  } catch (err) {
    const fail: WorkerOutMessage = {
      id: msg.id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(fail);
  }
};
