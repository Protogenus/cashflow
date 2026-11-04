/**
 * rng.ts — seeded PRNG + sampling distributions (pure, no framework imports).
 *
 * All randomness in the product flows through mulberry32 with a displayed
 * seed: same seed + same inputs = bit-identical results (DECISIONS.md).
 * Monte Carlo (later milestone) draws variables first, then shocks, from one
 * stream in a documented order.
 */

/** mulberry32: small, fast, deterministic PRNG. Returns values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Triangular distribution sample on [min, max] with the given mode.
 * Chosen over uniform because a user's "typical" carries information, and
 * over normal because ranges are bounded and non-expert-friendly
 * (ARCHITECTURE.md §2.3). Deterministic mode emits the mode (== typical).
 */
export function triangularSample(rng: () => number, min: number, mode: number, max: number): number {
  if (!(min <= mode && mode <= max)) {
    throw new Error(`triangularSample requires min <= mode <= max; got ${min}, ${mode}, ${max}`);
  }
  if (min === max) return min;
  const u = rng();
  const f = (mode - min) / (max - min);
  if (u < f) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}
