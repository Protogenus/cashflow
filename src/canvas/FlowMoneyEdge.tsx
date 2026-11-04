/**
 * canvas/FlowMoneyEdge.tsx — custom edge with gamified money-flow dots.
 *
 * The base bezier renders exactly like the default edge (tone classes inherit
 * through the wrapping <g>). While the timelapse plays, edges carrying money
 * get glowing animated dashes plus coin dots that travel the path into the
 * target node — declarative SMIL animateMotion, no JS timers.
 */
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export interface FlowMoneyEdgeData extends Record<string, unknown> {
  /** Timelapse: this edge carries money on the current frame. */
  flowing?: boolean;
  /** 'cf-edge-income' | 'cf-edge-expense' | '' — stroke tone. */
  tone?: string;
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
    <g className={d.tone ?? ''}>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={d.flowing ? 'cf-edge-flow' : ''}
      />
      {dots > 0 && (
        <g aria-hidden="true">
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
