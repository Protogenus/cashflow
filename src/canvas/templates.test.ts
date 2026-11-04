/**
 * templates.test.ts — the starter graph must always validate and forecast.
 * The canvas renders it on first load and milestone 3 charts it; a broken
 * template would silently ship a broken first run.
 */
import { describe, expect, it } from 'vitest';
import { forecast, validateGraph } from '../engine';
import { DEFAULT_ASSUMPTIONS } from '../engine/types';
import { createNode, createStarterGraph, NODE_META } from './templates';
import type { NodeType } from '../engine/types';

const TYPES: NodeType[] = [
  'startingBalance', 'income', 'expense', 'variableAmount', 'percentageSplit',
  'prioritySplit', 'conditional', 'goal', 'debt',
];

describe('starter graph', () => {
  it('is a valid graph with all expected pieces', () => {
    const { nodes, edges } = createStarterGraph();
    expect(nodes.map((n) => n.type)).toEqual(
      expect.arrayContaining(['startingBalance', 'income', 'expense', 'variableAmount', 'percentageSplit']),
    );
    const v = validateGraph({ nodes, edges });
    expect(v.errors).toEqual([]);
  });

  it('forecasts over the default horizon', () => {
    const { nodes, edges } = createStarterGraph();
    const res = forecast({ nodes, edges }, DEFAULT_ASSUMPTIONS);
    expect(res.ledger).toHaveLength(90);
    expect(res.pinchPoint.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The sample renter stays positive: rent + electric < paychecks.
    expect(res.firstNegativeDate).toBeNull();
    expect(res.safeToSpendCents).toBeGreaterThan(0);
  });

  it('has unique node and edge ids', () => {
    const { nodes, edges } = createStarterGraph();
    const ids = [...nodes.map((n) => n.id), ...edges.map((e) => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('createNode', () => {
  it('builds every node type without crashing', () => {
    for (const type of TYPES) {
      const node = createNode(type, { x: 0, y: 0 });
      expect(node.type).toBe(type);
      expect(NODE_META[type].title).toBeTruthy();
    }
  });

  it('new splits sum to 100', () => {
    const node = createNode('percentageSplit', { x: 0, y: 0 });
    if (node.type === 'percentageSplit') {
      expect(node.outputs.reduce((s, o) => s + o.percent, 0)).toBe(100);
    }
  });
});
