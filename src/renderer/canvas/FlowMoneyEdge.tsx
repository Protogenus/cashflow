/**
 * canvas/FlowMoneyEdge.tsx — custom edge with gamified money-flow dots.
 *
 * The base bezier renders like the default edge (every branch is one dark
 * grey). While the timelapse plays, edges carrying money get thicker plus
 * coin dots that travel the path into the target node — declarative SMIL
 * animateMotion, no JS timers. Dot colour is possession, not direction:
 * green while the money stays the player's, red once it leaves.
 */
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

import type { DotTone } from './dotTone';

export interface FlowMoneyEdgeData extends Record<string, unknown> {
  /** Timelapse: this edge carries money on the current frame. */
  flowing?: boolean;
  /** Dot colour by possession: 'kept' (green, money stays the player's)
      or 'spent' (red, money leaves). The branch itself is always grey. */
  dotTone?: DotTone;
  /** Amount on this edge this frame; sets the dot count. */
  amountCents?: number;
}

export function FlowMoneyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const d = (data ?? {}) as FlowMoneyEdgeData;
  const dots = d.flowing
    ? Math.min(5, Math.max(2, Math.round((d.amountCents ?? 100000) / 100000)))
    : 0;
  return (
    <g>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={d.flowing ? 'cf-edge-flow' : ''}
      />
      {dots > 0 && (
        <g aria-hidden="true" className={d.dotTone === 'spent' ? 'cf-dot-spent' : 'cf-dot-kept'}>
          {Array.from({ length: dots }, (_, i) => (
            <circle key={i} r={6} className="cf-money-dot">
              <animateMotion
                dur="1.2s"
                begin={`${-(i * 0.4)}s`}
                repeatCount="indefinite"
                path={path}
              />
            </circle>
          ))}
        </g>
      )}
    </g>
  );
}
