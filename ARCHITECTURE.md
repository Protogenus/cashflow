# ARCHITECTURE.md — Cash-Flow Planner Technical Architecture

*Local-only web app. No backend, no network calls with user data, no analytics. The simulation engine is a pure, framework-free TypeScript module — unit-testable in Vitest, runnable in a Web Worker.*

---

## 1. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** (strict mode) | Shared types across engine, state, and UI; catches date-logic and currency mistakes at compile time. |
| Build/dev | **Vite** | Fast dev loop; ESM-first; trivial Web Worker support via `new Worker(new URL(..., import.meta.url), { type: 'module' })`. |
| UI framework | **React 18+** | Canvas + panels + charts are component-heavy; largest hiring/maintenance surface. |
| Canvas | **React Flow (xyflow)** | The proven node-graph interaction grammar (dotted-grid canvas, pan/zoom, `Controls`, `MiniMap`, `fitView`, `screenToFlowPosition`, `onConnect` validation) is built in — exactly the patterns in RESEARCH.md §3. |
| Charts | **Recharts (preferred over D3)** | Fan/percentile charts, line charts, and histograms are all expressible with declarative React components. D3's imperative DOM manipulation fights React's render cycle and makes testing brittle; Recharts keeps chart code as pure props-in/components-out, which matches how we need to unit-test explanations and makes custom shapes (percentile bands via `Area` layers) straightforward. D3-scale utilities may be used *inside* the engine for quantile computation, but no D3 DOM code. |
| State | **Zustand** | Small, selector-based store; no boilerplate; easy to keep the graph (React Flow state) and app state (scenarios, results, settings) in separate slices without prop-drilling. |
| Styling | **Tailwind CSS** + CSS variables for theme tokens | Utility classes for layout; CSS variables for the light/dark token sets defined in DESIGN.md. |
| Unit tests | **Vitest** | Same toolchain as Vite; runs the pure engine module with zero DOM. Target: 80%+ coverage on the engine. |
| E2E tests | **Playwright** | Covers the 10 core user stories; also used for the "no user-data network calls" gate (run with network interception asserting zero `fetch`/`XHR`). |
| Auto-layout | **dagre** (on-demand "tidy" only) | Not continuous — preserves freeform positioning per RESEARCH.md §3. |

---

## 2. Simulation engine (pure TypeScript module)

**Location:** `packages/engine/` (own tsconfig, zero dependencies except dev-time Vitest). **Rule: no React imports anywhere in this module.** This keeps it unit-testable, lets it run in a Web Worker (Monte Carlo off the main thread), and makes the math auditable in isolation — the explainability requirement means every engine output carries its provenance.

### 2.1 Deterministic forecast algorithm

Input: a scenario graph (nodes + edges), a start date, a horizon in days (default 90).

1. **Event generation.** Each income/expense node declares a recurrence rule: `{ frequency, anchorDate, dayOfMonth?, intervalDays?, endDate?, businessDay?, exceptions }`. The engine expands occurrences over the horizon from the **immutable anchor date** — never by chaining "+1 month" off the last occurrence (RESEARCH.md §4: chaining degrades 31st→28th clamps permanently).
   - `biweekly`: every 14 days from anchor (26/yr). `semimonthly`: fixed calendar dates (24/yr) — distinct options, counts stated in UI.
   - `monthly`: day-of-month + **31st convention = last-day-of-month clamp** (DECISIONS.md): Jan 31 → Feb 28; never skips a month (RFC 5545's skip convention is rejected deliberately — a skipped month = a missed bill in the projection).
   - `businessDay: 'preceding' | 'following' | 'none'`: ISDA vocabulary; income defaults to `preceding` (paycheck lands the prior Friday), expenses default to `following` (debit moves to Monday). Applied per occurrence, then re-checked against the same calendar month (Modified Following is NOT the default — too clever; we document plain Following/Preceding).
   - Exceptions: a moved/edited occurrence stores the override against the original occurrence (`RECURRENCE-ID` pattern); the series rule stays intact; `COUNT` consumes cancelled slots.
   - **Timezone:** all events midnight-anchored, stored and computed as **local wall-clock** (user's zone), never UTC-shifted. Financial events are DST-insensitive by construction; timed alerts (if any) are the only place DST handling matters.
2. **Graph evaluation order.** The node graph is a DAG (cycles rejected at connect time — RESEARCH.md §3). Nodes topologically sorted; money flows along edges in dependency order. Each node, given the day's incoming amounts and balances, computes its outputs:
   - `startingBalance`: emits the opening balance once (day 0).
   - `income` / `expense`: emit scheduled events (expense amounts subtracted).
   - `percentageSplit`: divides incoming by fixed percentages across outputs (the optimizer mutates these).
   - `prioritySplit`: fills outputs in priority order (waterfall).
   - `conditional`: routes by a predicate on current balance ("if balance > X").
   - `variableAmount`: deterministic mode emits the **typical** value (Monte Carlo samples min/typical/max — see §2.3).
   - `goal`/`savings`: accumulates toward a target by a date (reports projected hit date or shortfall).
   - `debt`: amortizes with optional extra payment; reports payoff date.
3. **Day-by-day balance walk.** Starting at day 0, process each day's events in time order (income before expenses on the same day — documented assumption, editable in the assumptions panel), accumulate a running balance, and record the per-day ledger: `{ date, balance, events[] }`.
4. **Pinch-point detection.** Scan the ledger for the **global minimum balance** (the pinch point), plus the **first date the balance drops below $0** if any. For each, collect the **driving events**: the N events in the preceding window whose outflow contributed most (ranked by amount), so the explanation layer can say "rent + car payment + utilities, March 3–5, drove the $212 minimum."
5. **Explanation output.** Every forecast returns `{ ledger, pinchPoint, firstNegativeDate, drivers, assumptionsHash }` — the explanation is a first-class return value, not a UI afterthought.

Complexity: O(days × events/day) per run — trivially fast; the optimizer and Monte Carlo call this repeatedly, so it must stay allocation-light (no React, no DOM).

### 2.2 Brute-force optimizer

Goal: search split-percentage allocations (5% steps) over the user-selected split nodes for a user-chosen objective.

- **Objective functions:** `maxSafetyBuffer` (maximize minimum balance over horizon), `hitSavingsGoal` (minimize shortfall of goal node by target date), `payDebtFastest` (minimize payoff date, tie-break by interest avoided), `weightedBlend` (normalized weighted sum, weights user-editable).
- **Search:** enumerate the Cartesian product of 5%-step allocations across k split nodes (constrained to sum 100%). For k=4 splits this is manageable (bounded combinatorics; engine prunes obviously-dominated prefixes early). Each candidate = one deterministic forecast + objective score. Guard: if k or horizon makes the search exceed ~3s estimated, cap and warn ("searching a subset — refine your splits").
- **Output:** top 5 candidates, each `{ splits, score, pinchPoint, drivers, deltaVsBaseline }`, plus the **tradeoff table** (see §2.4). Every candidate's explanation is generated by the same driver-analysis as §2.1 step 4–5.
- Rationale for 5% steps (DECISIONS.md): finer grids (1%) explode combinatorics and imply false precision; 5% is human-actionable ("move 5 points from dining to the car loan") and matches the rounding-honesty rule (RESEARCH.md §3 "Avoid").

### 2.3 Monte Carlo engine

- **RNG:** `mulberry32` seeded PRNG. Seed displayed in the UI; same seed + same inputs = bit-identical results. This is the reproducibility answer to "different tools give different scores" (RESEARCH.md §2 GAP 7).
- **Sampling:** for each trial, each `variableAmount` node draws from its min/typical/max range. Default distribution: **triangular** (min, typical=mode, max) — chosen over uniform because users' "typical" carries information, and over normal because ranges are bounded and non-expert-friendly. The distribution choice is shown in the assumptions panel and editable.
- **Shock events:** user-toggleable, parameterized: `$600 car repair` (random day within horizon, probability p), `missed paycheck` (one income event skipped, probability p), plus custom (amount + window + probability). Shocks are sampled per trial from their probabilities.
- **Scale:** 2,000 trials default (matches ProjectionLab's ceiling; Boldin uses 1,000 — RESEARCH.md §1). 90-day horizon × 2,000 trials is fast in a Worker; progress events emitted per 100 trials.
- **Aggregation:** per-day percentiles (P10/P25/P50/median/P75/P90) across trials → fan chart bands. Pinch-point distribution: histogram of each trial's minimum-balance date. Failure analysis: trials that go below $0 are tagged with the events/node that drove them negative — the per-trial drill-down pattern borrowed from ProjectionLab ([projectionlab.com](https://projectionlab.com/changelog)).
- **Headline metric:** frequency-framed first — "in 9 of 10 simulated futures your balance stays positive" — with the percentage secondary and the success definition ("balance never drops below $0 during the 90-day horizon") beside it. Per RESEARCH.md §3: lead with the fan chart; central line is the median, labeled as such; never "the forecast."

### 2.4 Tradeoff table (optimizer × Monte Carlo)

Each of the optimizer's top-5 candidates is also run through a reduced Monte Carlo (500 trials — fast, still informative; full 2,000 on demand for a selected candidate). The table shows per candidate: objective score, success probability, worst-decile outcome (P10 minimum balance), and the pinch-point date distribution. This is where "the solve direction" (RESEARCH.md §2 GAP 1) meets uncertainty — the user picks a candidate *knowing* its fragility.

---

## 3. Data model (TypeScript interfaces — engine layer)

```ts
// ---------- primitives ----------
type NodeId = string;
type ISODate = string; // YYYY-MM-DD, local wall-clock
type Cents = number;   // all money as integer cents internally

type Frequency =
  | { kind: 'weekly'; anchor: ISODate }
  | { kind: 'biweekly'; anchor: ISODate }        // every 14 days; ~26/yr
  | { kind: 'semimonthly'; days: [number, number] } // e.g. [1, 15]; 24/yr
  | { kind: 'monthly'; dayOfMonth: number | 'last' }
  | { kind: 'once'; date: ISODate };

type BusinessDay = 'preceding' | 'following' | 'none';

interface Recurrence {
  frequency: Frequency;
  businessDay: BusinessDay;          // per-item Following/Preceding
  endDate?: ISODate;
  exceptions: Record<ISODate, { newDate?: ISODate; newAmountCents?: Cents; skipped?: boolean }>;
}

// ---------- nodes ----------
type NodeType =
  | 'startingBalance' | 'income' | 'expense' | 'variableAmount'
  | 'percentageSplit' | 'prioritySplit' | 'conditional'
  | 'goal' | 'debt';

interface BaseNode { id: NodeId; type: NodeType; label: string; position: { x: number; y: number } }

interface StartingBalanceNode extends BaseNode { type: 'startingBalance'; balanceCents: Cents; asOf: ISODate }
interface IncomeNode extends BaseNode {
  type: 'income'; amountCents: Cents; recurrence: Recurrence; name: string;
}
interface ExpenseNode extends BaseNode {
  type: 'expense'; amountCents: Cents; recurrence: Recurrence; name: string; category?: string;
}
interface VariableAmountNode extends BaseNode {
  type: 'variableAmount'; minCents: Cents; typicalCents: Cents; maxCents: Cents;
  recurrence: Recurrence; name: string;
}
interface PercentageSplitNode extends BaseNode {
  type: 'percentageSplit'; outputs: { id: string; label: string; percent: number }[]; // sum = 100
}
interface PrioritySplitNode extends BaseNode {
  type: 'prioritySplit'; outputs: { id: string; label: string; priority: number; capCents?: Cents }[];
}
interface ConditionalNode extends BaseNode {
  type: 'conditional'; predicate: { op: 'gt' | 'lt'; thresholdCents: Cents }; // "if balance > X"
  trueLabel: string; falseLabel: string;
}
interface GoalNode extends BaseNode {
  type: 'goal'; targetCents: Cents; targetDate: ISODate; name: string;
}
interface DebtNode extends BaseNode {
  type: 'debt'; balanceCents: Cents; aprBps: number; minPaymentCents: Cents; name: string;
}
type PlanNode = StartingBalanceNode | IncomeNode | ExpenseNode | VariableAmountNode
  | PercentageSplitNode | PrioritySplitNode | ConditionalNode | GoalNode | DebtNode;

// ---------- graph ----------
interface PlanEdge { id: string; source: NodeId; sourceHandle: string; target: NodeId; targetHandle: string }
interface PlanGraph { nodes: PlanNode[]; edges: PlanEdge[] }

// ---------- scenarios / alerts / settings ----------
interface Scenario {
  id: string; name: string; graph: PlanGraph;
  isBaseline: boolean; createdAt: string; updatedAt: string;
}
interface Alert {
  id: string; kind: 'belowZero' | 'pinchPoint' | 'goalAtRisk' | 'debtPayoffChanged';
  scenarioId: string; message: string; date: ISODate; acknowledged: boolean;
}
interface Assumptions {
  horizonDays: number;                 // default 90
  sameDayOrder: 'incomeFirst';         // income before expenses on the same day
  monthEndConvention: 'clampToLastDay';// DECISIONS.md: Jan 31 -> Feb 28, never skip
  variableDistribution: 'triangular';  // min/typical/max sampling
  mcTrials: number;                    // default 2000
  mcSeed: number;                      // displayed; reproducibility
  shocks: ShockEvent[];
  optimizerStep: 5;                    // 5% steps
  currency: string;                    // single currency in v1 (e.g. 'USD')
}
interface ShockEvent {
  id: string; name: string; amountCents: Cents;
  windowDays: [number, number];         // e.g. [0, 90]
  probability: number;                 // per-trial occurrence probability
  enabled: boolean;
}

// ---------- engine outputs ----------
interface LedgerDay { date: ISODate; balanceCents: Cents; events: LedgerEvent[] }
interface LedgerEvent { nodeId: NodeId; name: string; amountCents: Cents; kind: 'income' | 'expense' | 'transfer' }
interface PinchPoint { date: ISODate; balanceCents: Cents; drivers: Driver[] }
interface Driver { nodeId: NodeId; name: string; contributionCents: Cents }
interface ForecastResult {
  ledger: LedgerDay[]; pinchPoint: PinchPoint;
  firstNegativeDate: ISODate | null;
  assumptionsHash: string;             // ties result to the assumptions that produced it
}
interface MonteCarloResult {
  seed: number; trials: number;
  bands: { date: ISODate; p10: Cents; p25: Cents; p50: Cents; p75: Cents; p90: Cents }[];
  successShare: number;                // share of trials never below $0
  pinchHistogram: { date: ISODate; count: number }[];
  failedTrials: { trialIndex: number; firstNegativeDate: ISODate; drivers: Driver[] }[];
}
```

**localStorage schema (versioned):**

```ts
interface PersistedState {
  schemaVersion: 3;                    // bump on breaking changes; migrations run in order
  scenarios: Scenario[];
  activeScenarioId: string;
  assumptions: Assumptions;
  alerts: Alert[];
  theme: 'light' | 'dark' | 'system';
}
```

Migrations: `migrateV1toV2`, `migrateV2toV3`, … each a pure function; on load, run from stored version to current; on failure, keep a backup of the raw JSON under a `.bak` key and start fresh rather than corrupt.

### Why localStorage, not IndexedDB (DECISIONS.md)

A full plan graph serializes to tens of kilobytes of JSON. IndexedDB buys async storage, indexing, and large quotas — none of which we need: we have no queries to index, no blobs, no multi-hundred-MB datasets. localStorage gives a synchronous read/write API (simpler state hydration, no async edge cases on first paint), zero schema-management overhead, and the same persistence guarantee for our data sizes. The real backup story is JSON export/import (human-readable, portable, versioned) — which also covers "what if the app dies" (Recurna's positioning, [recurna.ca](https://www.recurna.ca/)). If graphs ever grow beyond localStorage quotas (~5MB), revisit.

---

## 4. State management (Zustand)

Slices in `src/store/`:

- `graphSlice` — React Flow nodes/edges, selection, inspector target; wraps `applyNodeChanges`/`applyEdgeChanges`. Emits to a **single grouped undo/redo stack** (drag = one step via batch; typing debounced ~400ms).
- `scenarioSlice` — scenarios list, active scenario, duplicate/rename/delete, baseline comparison toggling.
- `resultsSlice` — last deterministic forecast, optimizer candidates, Monte Carlo result, tradeoff table; each keyed by `assumptionsHash` so stale results are visibly marked ("assumptions changed since this ran").
- `assumptionsSlice` — the Assumptions object; every change invalidates results (marks stale, does not auto-rerun heavy sims — user re-runs explicitly, which also keeps MC costs predictable).
- `uiSlice` — theme, panel visibility, onboarding state, toasts.

**Engine ↔ UI boundary:** the UI never imports engine internals beyond its public API (`forecast(graph, assumptions)`, `optimize(graph, assumptions, objective)`, `monteCarlo(graph, assumptions, onProgress)`). Monte Carlo and the optimizer run in a **Web Worker** (`src/workers/sim.worker.ts`) posting results back; the deterministic forecast is fast enough for the main thread but uses the same API.

---

## 5. File / directory structure

```
cashflow-planner/
├── RESEARCH.md  PRODUCT_SPEC.md  ARCHITECTURE.md  DESIGN.md  DECISIONS.md
├── research/                      # raw part-a..d files (source material, kept)
├── packages/
│   └── engine/                    # PURE TypeScript, no React — the sim engine
│       ├── src/
│       │   ├── index.ts           # public API: forecast, optimize, monteCarlo
│       │   ├── types.ts           # interfaces from §3
│       │   ├── recurrence.ts      # event generation (anchor-based, clamp, business-day)
│       │   ├── forecast.ts        # deterministic day-by-day walk + pinch detection
│       │   ├── optimize.ts        # brute-force 5% search + explanations
│       │   ├── montecarlo.ts      # mulberry32, triangular sampling, shocks, aggregation
│       │   ├── explain.ts         # driver analysis shared by forecast/optimizer/MC
│       │   ├── migrate.ts         # schema migrations (also used by app layer)
│       │   └── rng.ts             # mulberry32 + distributions
│       └── test/                  # Vitest: recurrence edge cases, pinch detection,
│                                  # optimizer bounds, MC seed reproducibility, no-fetch gate
├── apps/
│   └── web/                       # Vite + React + React Flow + Recharts + Zustand + Tailwind
│       ├── src/
│       │   ├── main.tsx
│       │   ├── store/             # zustand slices (§4)
│       │   ├── canvas/            # React Flow setup, custom node components (9 types),
│       │   │                      # palette, inspector, validation, undo/redo
│       │   ├── panels/            # forecast chart, optimizer results, MC results,
│       │   │                      # tradeoff table, assumptions panel, scenarios
│       │   ├── charts/            # Recharts wrappers: fan chart, histogram, ledger
│       │   ├── workers/           # sim.worker.ts (engine in Worker)
│       │   ├── templates/         # 3 starter templates (JSON)
│       │   └── styles/            # tailwind + CSS-variable theme tokens
│       └── e2e/                   # Playwright: 10 user stories, no-network gate
└── docs/                          # (this set, plus ADRs as they accrue in DECISIONS.md)
```

**Build/test commands (planned):** `pnpm --filter engine test` (Vitest), `pnpm --filter web test:e2e` (Playwright), `pnpm build` (engine → worker bundle → web). The `no-fetch` gate: a Vitest test in `packages/engine/test/` asserts the engine bundle contains no `fetch(`/`XMLHttpRequest` references; a Playwright run with route-abort on all network asserts zero requests during a full session.
