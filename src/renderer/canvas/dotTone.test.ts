import { describe, expect, it } from 'vitest';
import type { PlanNode } from '../engine/types';
import { dotToneForTarget } from './dotTone';

// Only `type` and `direction` are read, so minimal fixtures are enough.
const node = (type: PlanNode['type'], direction?: 'income' | 'expense') =>
  ({ type, direction }) as PlanNode;

describe('dotToneForTarget', () => {
  it('keeps money that lands in the Bank green', () => {
    expect(dotToneForTarget(node('startingBalance'))).toBe('kept');
  });

  it('keeps money routed into a goal or a split green', () => {
    expect(dotToneForTarget(node('goal'))).toBe('kept');
    expect(dotToneForTarget(node('percentageSplit'))).toBe('kept');
    expect(dotToneForTarget(node('prioritySplit'))).toBe('kept');
    expect(dotToneForTarget(node('conditional'))).toBe('kept');
  });

  it('keeps money flowing into an income-direction variable green', () => {
    expect(dotToneForTarget(node('variableAmount', 'income'))).toBe('kept');
  });

  it('spends money wired to a bill or a debt red', () => {
    expect(dotToneForTarget(node('expense'))).toBe('spent');
    expect(dotToneForTarget(node('debt'))).toBe('spent');
    expect(dotToneForTarget(node('variableAmount', 'expense'))).toBe('spent');
  });

  it('defaults to kept with no target', () => {
    expect(dotToneForTarget(undefined)).toBe('kept');
  });
});
