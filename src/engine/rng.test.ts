import { describe, expect, it } from 'vitest';
import { mulberry32, triangularSample } from './rng';

describe('mulberry32', () => {
  it('reproduces the identical sequence for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it('stays in [0, 1)', () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('advances state on every call (no repeats of the first value)', () => {
    const rng = mulberry32(7);
    const seen = new Set(Array.from({ length: 100 }, () => rng()));
    expect(seen.size).toBe(100);
  });
});

describe('triangularSample', () => {
  it('stays within [min, max]', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = triangularSample(rng, 80, 140, 220);
      expect(v).toBeGreaterThanOrEqual(80);
      expect(v).toBeLessThanOrEqual(220);
    }
  });

  it('is reproducible under a fixed seed', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    expect(Array.from({ length: 20 }, () => triangularSample(a, 80, 140, 220))).toEqual(
      Array.from({ length: 20 }, () => triangularSample(b, 80, 140, 220)),
    );
  });

  it('centers near the theoretical mean (min+mode+max)/3', () => {
    const rng = mulberry32(2026);
    const n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += triangularSample(rng, 80, 140, 220);
    const mean = sum / n;
    expect(mean).toBeCloseTo((80 + 140 + 220) / 3, 0); // ±0.5 tolerance
  });

  it('returns min when the range collapses', () => {
    expect(triangularSample(mulberry32(1), 100, 100, 100)).toBe(100);
  });

  it('rejects an invalid range', () => {
    expect(() => triangularSample(mulberry32(1), 200, 100, 150)).toThrow();
  });
});
