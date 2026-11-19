import type { PlanNode } from '../engine/types';

export type DotTone = 'kept' | 'spent';

/**
 * Travelling-dot colour by possession, not by direction: green while the
 * money stays the player's (into the Bank, into a goal, through a split
 * or conditional, into an income node), red once it leaves their
 * possession (a bill paid, a debt paid). Decided by the TARGET node —
 * where the money ends up — never by the source: a paycheck wired
 * straight to Rent is money leaving, so its dots are red.
 */
export function dotToneForTarget(target: PlanNode | undefined): DotTone {
  if (!target) return 'kept';
  if (
    target.type === 'expense' ||
    target.type === 'debt' ||
    (target.type === 'variableAmount' && target.direction !== 'income')
  ) {
    return 'spent';
  }
  return 'kept';
}
