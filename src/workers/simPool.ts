/**
 * workers/simPool.ts — module-level Web Worker pool for simulations.
 *
 * One worker per owner ('montecarlo' | 'tradeoff'). The worker intentionally
 * OUTLIVES the view that started it: switching result tabs unmounts the
 * view, and killing the worker there would silently discard a run the user
 * is waiting for. Runs therefore continue in the background across tab
 * switches; results land in the results store, and progress is mirrored
 * there too so a remounted view can pick it up. Cancel is explicit and
 * scoped per owner (terminate + drop callbacks).
 */
import SimWorker from './sim.worker?worker';
import type { WorkerOutMessage, WorkerRunMessage } from './sim.worker';
import type { MonteCarloResult } from '../engine/montecarlo';

export interface SimCallbacks {
  onProgress: (done: number, total: number) => void;
  onDone: (result: MonteCarloResult) => void;
  onError: (message: string) => void;
}

export type SimOwner = 'montecarlo' | 'tradeoff';

interface PoolEntry {
  worker: Worker;
  cbs: Map<string, SimCallbacks>;
}

const pool = new Map<SimOwner, PoolEntry>();

function entry(owner: SimOwner): PoolEntry {
  let e = pool.get(owner);
  if (!e) {
    const worker = new SimWorker();
    const cbs = new Map<string, SimCallbacks>();
    worker.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
      const msg = ev.data;
      const cb = cbs.get(msg.id);
      if (!cb) return;
      if (msg.type === 'progress') {
        cb.onProgress(msg.done, msg.total);
      } else if (msg.type === 'done') {
        cbs.delete(msg.id);
        cb.onDone(msg.result);
      } else {
        cbs.delete(msg.id);
        cb.onError(msg.message);
      }
    };
    e = { worker, cbs };
    pool.set(owner, e);
  }
  return e;
}

/** Post a run to the owner's worker (sequential per worker). */
export function runSim(owner: SimOwner, msg: WorkerRunMessage, cbs: SimCallbacks): void {
  const e = entry(owner);
  e.cbs.set(msg.id, cbs);
  e.worker.postMessage(msg);
}

/** True while the owner has at least one run awaiting completion. */
export function isSimRunning(owner: SimOwner): boolean {
  const e = pool.get(owner);
  return !!e && e.cbs.size > 0;
}

/** Explicit cancel: terminate the owner's worker and drop its callbacks. */
export function cancelSim(owner: SimOwner): void {
  const e = pool.get(owner);
  if (e) {
    e.worker.terminate();
    pool.delete(owner);
  }
}
