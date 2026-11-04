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

/** Per-type icon colors tuned for the dark sidebar (readable in both themes). */
const TYPE_ICON_COLOR: Record<NodeType, string> = {
  startingBalance: 'var(--sb-balance)',
  income: 'var(--sb-income)',
  expense: 'var(--sb-expense)',
  variableAmount: 'var(--sb-variable)',
  percentageSplit: 'var(--sb-logic)',
  prioritySplit: 'var(--sb-logic)',
  conditional: 'var(--sb-logic)',
  goal: 'var(--sb-goal)',
  debt: 'var(--sb-debt)',
};

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
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide">
        Add nodes
      </h2>
      <p className="cf-sidebar-sub mb-3 text-[11px]">
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
            <span style={{ color: TYPE_ICON_COLOR[type] }}>
              <NodeIcon type={type} />
            </span>
            <span>
              <span className="block font-semibold leading-tight">{NODE_META[type].title}</span>
              <span className="cf-palette-blurb block text-[10px] leading-tight">
                {NODE_META[type].blurb}
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
