/**
 * workers/useSimWorker.ts — React hook over the module-level sim pool.
 *
 * The worker deliberately outlives the calling view (see simPool.ts): no
 * terminate-on-unmount, so tab switches don't kill in-flight runs. Cancel
 * stays explicit and scoped per owner.
 */
import { useCallback } from 'react';
import { cancelSim, isSimRunning, runSim, type SimCallbacks, type SimOwner } from './simPool';
import type { WorkerRunMessage } from './sim.worker';

export type { SimCallbacks, SimOwner };

export function useSimWorker(owner: SimOwner = 'montecarlo') {
  const run = useCallback(
    (msg: WorkerRunMessage, cbs: SimCallbacks) => runSim(owner, msg, cbs),
    [owner],
  );
  const cancel = useCallback(() => cancelSim(owner), [owner]);
  const isRunning = useCallback(() => isSimRunning(owner), [owner]);
  return { run, cancel, isRunning };
}
