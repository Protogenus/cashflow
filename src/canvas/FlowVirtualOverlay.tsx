/**
 * canvas/FlowVirtualOverlay.tsx — timelapse routes for money with no drawn edge.
 *
 * Bills (rent, utilities, …) are paid straight out of the balance: the graph
 * has no edge for that, but the forecast walk really does move the money.
 * While the timelapse plays, this overlay draws a temporary dashed route from
 * the account node to each bill paid that day, with coin dots traveling it.
 * Rendered as a child of <ReactFlow>, so it lives inside the transformed
 * viewport and pans/zooms with the canvas.
 */
import { getBezierPath, Position, useNodes, useViewport, useStore as useRFStore } from '@xyflow/react';
import { useFlowStore } from '../store/flowStore';

export function FlowVirtualOverlay() {
  const active = useFlowStore((s) => s.active);
  const frames = useFlowStore((s) => s.frames);
  const frameIndex = useFlowStore((s) => s.frameIndex);
  const nodes = useNodes();
  const { x, y, zoom } = useViewport();
  // Dots restart their SMIL animation on every mousemove while dragging —
  // hide the overlay until the drag ends instead of juddering.
  const anyDragging = useRFStore((s) => s.nodes.some((n) => n.dragging));

  if (!active || anyDragging || frames.length === 0) return null;
  const frame = frames[Math.min(frameIndex, frames.length - 1)];
  const virtual = frame.transfers.filter((t) => t.edgeIds.length === 0);
  if (virtual.length === 0) return null;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const routes = virtual.flatMap((t, vi) => {
    const src = byId.get(t.fromId);
    const dst = byId.get(t.toId);
    if (!src || !dst) return [];
    const sw = src.measured?.width ?? 220;
    const sh = src.measured?.height ?? 96;
    const dw = dst.measured?.width ?? 220;
    const dh = dst.measured?.height ?? 96;
    const srcRight = dst.position.x >= src.position.x;
    const [path] = getBezierPath({
      sourceX: src.position.x + (srcRight ? sw : 0),
      sourceY: src.position.y + sh / 2,
      sourcePosition: srcRight ? Position.Right : Position.Left,
      targetX: dst.position.x + (srcRight ? 0 : dw),
      targetY: dst.position.y + dh / 2,
      targetPosition: srcRight ? Position.Left : Position.Right,
    });
    return [{ key: `${t.fromId}-${t.toId}-${vi}`, path, amountCents: t.amountCents }];
  });
  if (routes.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        zIndex: 5,
      }}
    >
      {routes.map(({ key, path, amountCents }) => {
        const dots = Math.min(4, Math.max(2, Math.round(amountCents / 100000)));
        return (
          <g key={key} className="cf-edge-expense">
            <path d={path} className="cf-virtual-path" fill="none" />
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
        );
      })}
    </svg>
  );
}
