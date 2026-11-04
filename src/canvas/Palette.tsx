/**
 * canvas/Palette.tsx — drag (or click) nodes onto the canvas.
 * Keyboard/touch fallback: clicking a palette item adds the node at the
 * center of the current viewport.
 */
import { useReactFlow } from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';
import { NODE_META, createNode } from './templates';
import { NodeIcon } from './nodeIcons';
import type { NodeType } from '../engine/types';

const ORDER: NodeType[] = [
  'startingBalance',
  'income',
  'expense',
  'variableAmount',
  'percentageSplit',
  'prioritySplit',
  'conditional',
  'goal',
  'debt',
];

export function Palette() {
  const { screenToFlowPosition } = useReactFlow();

  const onDragStart = (e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData('application/cashflow-node-type', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  const addAtCenter = (type: NodeType) => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    useGraphStore.getState().addNode(createNode(type, position));
  };

  return (
    <aside className="w-56 shrink-0 overflow-y-auto p-3" aria-label="Node palette">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Add nodes
      </h2>
      <p className="mb-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Drag onto the canvas, or click to place.
      </p>
      <div className="flex flex-col gap-2">
        {ORDER.map((type) => (
          <button
            key={type}
            className="cf-palette-item"
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            onClick={() => addAtCenter(type)}
            title={NODE_META[type].blurb}
          >
            <span style={{ color: 'var(--accent)' }}>
              <NodeIcon type={type} />
            </span>
            <span>
              <span className="block font-semibold leading-tight">{NODE_META[type].title}</span>
              <span className="block text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                {NODE_META[type].blurb}
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
