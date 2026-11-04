/**
 * workers/useSimWorker.ts — React hook managing the simulation Web Worker.
 *
 * One worker per hook instance; sequential messages queue naturally on the
 * worker's single thread (milestone 7's per-candidate runs). Cancel is
 * worker.terminate() + a fresh worker on the next run.
 */
import { useCallback, useEffect, useRef } from 'react';
import SimWorker from './sim.worker?worker';
import type { WorkerOutMessage, WorkerRunMessage } from './sim.worker';
import type { MonteCarloResult } from '../engine/montecarlo';

export interface SimCallbacks {
  onProgress: (done: number, total: number) => void;
  onDone: (result: MonteCarloResult) => void;
  onError: (message: string) => void;
}

export function useSimWorker() {
  const workerRef = useRef<Worker | null>(null);
  const cbsRef = useRef(new Map<string, SimCallbacks>());

  const ensure = (): Worker => {
    if (!workerRef.current) {
      const w = new SimWorker();
      w.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        const msg = e.data;
        const cbs = cbsRef.current.get(msg.id);
        if (!cbs) return;
        if (msg.type === 'progress') {
          cbs.onProgress(msg.done, msg.total);
        } else if (msg.type === 'done') {
          cbsRef.current.delete(msg.id);
          cbs.onDone(msg.result);
        } else {
          cbsRef.current.delete(msg.id);
          cbs.onError(msg.message);
        }
      };
      workerRef.current = w;
    }
    return workerRef.current;
  };

  const run = useCallback((msg: WorkerRunMessage, cbs: SimCallbacks) => {
    cbsRef.current.set(msg.id, cbs);
    ensure().postMessage(msg);
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    cbsRef.current.clear();
  }, []);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  return { run, cancel };
}
