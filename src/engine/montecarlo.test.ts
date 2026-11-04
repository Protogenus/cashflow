import { describe, expect, it } from 'vitest';
import { computePercentiles, runMonteCarlo, runSeed } from './montecarlo';
import type {
  Assumptions,
  ExpenseNode,
  IncomeNode,
  ISODate,
  PlanGraph,
  PlanNode,
  StartingBalanceNode,
  VariableAmountNode,
} from './types';
import { DEFAULT_ASSUMPTIONS } from './types';

const START: ISODate = '2026-11-03';

function balance(id: string, cents: number): StartingBalanceNode {
  return { id, type: 'startingBalance', label: 'Checking', position: { x: 0, y: 0 }, balanceCents: cents, asOf: START };
}

function income(id: string, name: string, cents: number): IncomeNode {
  return {
    id, type: 'income', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents,
    recurrence: { frequency: { kind: 'biweekly', anchor: START }, businessDay: 'none', exceptions: {} },
  };
}

function expense(id: string, name: string, cents: number): ExpenseNode {
  return {
    id, type: 'expense', label: name, position: { x: 0, y: 0 }, name,
    amountCents: cents,
    recurrence: { frequency: { kind: 'monthly', dayOfMonth: 1 }, businessDay: 'none', exceptions: {} },
  };
}

function variable(id: string, name: string, min: number, typ: number, max: number): VariableAmountNode {
  return {
    id, type: 'variableAmount', label: name, position: { x: 0, y: 0 }, name,
    minCents: min, typicalCents: typ, maxCents: max,
    recurrence: { frequency: { kind: 'monthly', dayOfMonth: 15 }, businessDay: 'none', exceptions: {} },
  };
}

function simpleGraph(): PlanGraph {
  const nodes: PlanNode[] = [
    balance('bal', 200000),
    income('pay', 'Paycheck', 200000),
    expense('rent', 'Rent', 140000),
    variable('elec', 'Electric', 8000, 14000, 22000),
  ];
  return { nodes, edges: [] };
}

const ASSUMPTIONS: Assumptions = { ...DEFAULT_ASSUMPTIONS, horizonDays: 90 };

function stripTiming(r: ReturnType<typeof runMonteCarlo>) {
  const { elapsedMs: _e, ...rest } = r;
  void _e;
  return rest;
}

describe('computePercentiles', () => {
  it('linear-interpolates on a tiny synthetic dataset', () => {
    expect(computePercentiles([10, 20, 30, 40], [0.5])).toEqual([25]);
    expect(computePercentiles([10, 20, 30, 40], [0, 1])).toEqual([10, 40]);
    expect(computePercentiles([10, 20, 30, 40], [0.25])).toEqual([17.5]);
    expect(computePercentiles([5], [0.5])).toEqual([5]);
  });
});

describe('runSeed', () => {
  it('is order-independent: same (seed, index) always maps the same', () => {
    expect(runSeed(42, 7)).toBe(runSeed(42, 7));
    expect(runSeed(42, 7)).not.toBe(runSeed(42, 8));
    expect(runSeed(42, 7)).not.toBe(runSeed(43, 7));
  });
});

describe('runMonteCarlo', () => {
  it('is reproducible: same seed + graph -> identical results', () => {
    const a = runMonteCarlo(simpleGraph(), ASSUMPTIONS, { runs: 300, seed: 1234, startDate: START });
    const b = runMonteCarlo(simpleGraph(), ASSUMPTIONS, { runs: 300, seed: 1234, startDate: START });
    expect(stripTiming(a)).toEqual(stripTiming(b));
    expect(a.bands).toHaveLength(90);
    expect(a.deterministic).toHaveLength(90);
  });

  it('different seeds diverge', () => {
    const a = runMonteCarlo(simpleGraph(), ASSUMPTIONS, { runs: 300, seed: 1, startDate: START });
    const b = runMonteCarlo(simpleGraph(), ASSUMPTIONS, { runs: 300, seed: 2, startDate: START });
    expect(a.bands.map((x) => x.p50)).not.toEqual(b.bands.map((x) => x.p50));
  });

  it('applies a certain one-time shock on its date in every run', () => {
    const shockDate: ISODate = '2026-12-01';
    const withShock = runMonteCarlo(
      simpleGraph(),
      {
        ...ASSUMPTIONS,
        shocks: [
          {
            id: 's1', name: 'Car repair', amountCents: 60000,
            windowDays: [0, 90], probability: 1, enabled: true,
            kind: 'oneTime', date: shockDate,
          },
        ],
      },
      { runs: 200, seed: 99, startDate: START },
    );
    const noShock = runMonteCarlo(simpleGraph(), ASSUMPTIONS, { runs: 200, seed: 99, startDate: START });
    expect(withShock.shockSummary[0].appliedRuns).toBe(200);
    // Same seed: the only difference is the shock, so every percentile band
    // from the shock date onward sits exactly $600 lower.
    const idx = withShock.dates.indexOf(shockDate);
    expect(idx).toBeGreaterThan(0);
    for (const d of [idx, idx + 10, 89]) {
      for (const q of ['p5', 'p25', 'p50', 'p75', 'p95'] as const) {
        expect(withShock.bands[d][q] - noShock.bands[d][q]).toBe(-60000);
      }
    }
    // Before the shock date the bands are identical.
    for (const q of ['p5', 'p50', 'p95'] as const) {
      expect(withShock.bands[0][q]).toBe(noShock.bands[0][q]);
    }
  });

  it('missed-paycheck shock skips one income occurrence per run', () => {
    const res = runMonteCarlo(
      simpleGraph(),
      {
        ...ASSUMPTIONS,
        shocks: [
          {
            id: 's2', name: 'Missed paycheck', amountCents: 0,
            windowDays: [0, 90], probability: 1, enabled: true,
            kind: 'missedPaycheck', incomeNodeId: 'pay',
          },
        ],
      },
      { runs: 100, seed: 7, startDate: START },
    );
    expect(res.shockSummary[0].appliedRuns).toBe(100);
    // Every run loses exactly one $2000 paycheck vs the no-shock median path.
    const noShock = runMonteCarlo(simpleGraph(), ASSUMPTIONS, { runs: 100, seed: 7, startDate: START });
    const endP50 = (r: typeof res) => r.bands[89].p50;
    expect(endP50(noShock) - endP50(res)).toBe(200000);
  });

  it('reports rent-cover probability by month and per-bill coverage', () => {
    const res = runMonteCarlo(simpleGraph(), ASSUMPTIONS, { runs: 200, seed: 5, startDate: START });
    // Rent on the 1st: Dec 2026 + Jan 2027 in the 90-day window.
    expect(res.rentByMonth.map((r) => r.month)).toEqual(['2026-12', '2027-01']);
    for (const r of res.rentByMonth) {
      expect(r.probCovered).toBeGreaterThanOrEqual(0);
      expect(r.probCovered).toBeLessThanOrEqual(1);
    }
    const rent = res.billCoverage.find((b) => b.nodeId === 'rent')!;
    expect(rent.probCovered).toBeGreaterThan(0.9); // $2000 buffer vs $1400 rent: nearly always covered
    expect(res.probAboveZero).toBeGreaterThanOrEqual(0);
    expect(res.probAboveZero).toBeLessThanOrEqual(1);
  });

  it('variable sampling spreads the bands (deterministic bands collapse without variables)', () => {
    const fixed: PlanGraph = {
      nodes: [balance('bal', 200000), income('pay', 'Paycheck', 200000), expense('rent', 'Rent', 140000)],
      edges: [],
    };
    const res = runMonteCarlo(fixed, ASSUMPTIONS, { runs: 100, seed: 3, startDate: START });
    // No variables, no shocks: every run identical -> p5 == p95 everywhere.
    for (const b of res.bands) {
      expect(b.p5).toBe(b.p95);
    }
    expect(res.probAboveZero).toBe(1);
  });

  it('failed trials carry the first-negative date and drivers', () => {
    const broke: PlanGraph = {
      nodes: [balance('bal', 10000), expense('rent', 'Big rent', 500000)],
      edges: [],
    };
    const res = runMonteCarlo(broke, ASSUMPTIONS, { runs: 50, seed: 11, startDate: START });
    expect(res.failedCount).toBe(50);
    expect(res.probAboveZero).toBe(0);
    expect(res.failedTrials.length).toBeGreaterThan(0);
    const t = res.failedTrials[0];
    expect(t.firstNegativeDate).toBe('2026-12-01'); // rent day
    expect(t.drivers.some((d) => d.nodeId === 'rent')).toBe(true);
  });
});
