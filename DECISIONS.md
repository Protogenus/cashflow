# DECISIONS.md — Architecture & Product Decision Log

*Append-only. New decisions go at the bottom with date, context, decision, and consequences. Never rewrite history — if a decision is reversed, add a new entry referencing the old one.*

Format for each entry:

```
## YYYY-MM-DD — <short title>
- **Status:** decided | superseded (see YYYY-MM-DD entry)
- **Context:** ...
- **Decision:** ...
- **Consequences:** ...
```

---

## 2026-11-03 — Manual entry only; no bank sync in v1
- **Status:** decided
- **Context:** Every mainstream reference app (PocketSmith, Monarch, Copilot, Simplifi) depends on third-party aggregators (Plaid/Yodlee/Finicity/MX), and sync failures + miscategorization are the top complaint category across all four (RESEARCH.md §2 GAP 6). Recurna Flow ships deliberately manual-first as a privacy position ([recurna.ca](https://www.recurna.ca/)). Building aggregation in v1 would import the incumbents' #1 failure mode plus credential-handling liability.
- **Decision:** v1 has no bank sync, no account aggregation, no credential storage of any kind. Manual entry only; CSV import is a later, explicitly-scoped feature (recurrence suggestions only).
- **Consequences:** ~10 min/week of manual reconciliation is the user's cost (Recurna's framing — honest about it). Privacy story is a differentiator, not an apology. Revisit only with a dedicated security review.

## 2026-11-03 — Recharts over D3 for charts
- **Status:** decided
- **Context:** We need fan/percentile charts, line charts, and histograms. D3 is the most powerful option but its imperative DOM manipulation fights React's render cycle, makes chart code hard to unit-test, and invites hand-rolled components that drift from the design system.
- **Decision:** Recharts (declarative React components; percentile bands via layered `Area` shapes). D3-scale utilities may be used inside the pure engine for quantile math, but no D3 DOM code.
- **Consequences:** Custom interactions (per-trial drill-down, pinch markers) are built as Recharts custom shapes/components. If we ever need something Recharts can't express (e.g. animated hypothetical-outcome plots), revisit — but the bar is "Recharts provably cannot do it."

## 2026-11-03 — localStorage over IndexedDB for persistence
- **Status:** decided
- **Context:** A full plan graph serializes to tens of KB of JSON. IndexedDB offers async storage, indexing, and large quotas — none of which the data needs (no indexable queries, no blobs, no large datasets).
- **Decision:** localStorage with a versioned schema + ordered migrations; JSON export/import as the backup/portability story.
- **Consequences:** Synchronous hydration (simpler first paint, no async edge cases). If graphs approach localStorage quotas (~5MB), revisit. Export files carry `schemaVersion` so old exports remain importable via the migration chain.

## 2026-11-03 — Seeded RNG (mulberry32) for Monte Carlo reproducibility
- **Status:** decided
- **Context:** Reference-app trust research shows "identical inputs produce noticeably different success scores across tools" is a trust killer when assumptions are opaque (RESEARCH.md §2 GAP 7). Users must be able to re-run and get identical results, and support/debugging needs determinism.
- **Decision:** All randomness flows through mulberry32, seeded per run; the seed is displayed in the UI next to every MC result and stored with it. Same seed + same inputs = bit-identical output.
- **Consequences:** "Random" runs still need a seed — generated from `crypto.getRandomValues()` and then displayed, so even a fresh run is reproducible after the fact. Shock-event sampling uses the same stream (documented order: variable draws first, then shocks).

## 2026-11-03 — Brute-force optimizer at 5% steps
- **Status:** decided
- **Context:** The optimizer must search split allocations and return explainable top candidates. Finer grids (1%) explode combinatorics and imply false precision; coarser grids (10%+) miss useful allocations.
- **Decision:** Enumerate 5%-step allocations across user-selected split nodes (summing to 100%), score each with the chosen objective, return top 5 with explanations. Guard: estimated runtime > ~3s → search a pruned subset and say so.
- **Consequences:** 5% is the human-actionable unit ("move 5 points from dining to the car loan") and matches the rounding-honesty rule. The step size is a constant (`optimizerStep: 5`) in Assumptions, editable later if evidence demands.

## 2026-11-03 — Business-day convention: Following/Preceding per item (ISDA vocabulary)
- **Status:** decided
- **Context:** Scheduled dates land on weekends/holidays. Finance has standard vocabulary (ISDA Business Day Conventions: Following, Modified Following, Preceding, No Adjustment — [isda.org](https://www.isda.org/a/C51EE/FX-Glossary-English.pdf)). Payroll typically moves payday to the prior business day; bills typically debit the next ([veloriftlabs.com](https://veloriftlabs.com/p/rbScTiNpqIag3ucRJqd8b.pdf)).
- **Decision:** Expose Following vs. Preceding per recurring item. Defaults: income → Preceding, expenses → Following. Modified Following rejected as default (too clever for a consumer tool); No Adjustment available as an explicit choice.
- **Consequences:** The assumption is visible per item and in the assumptions panel. Holiday calendars: US federal holidays as baseline data (local data, not logic — RESEARCH.md §4); bank/employer-specific holidays are a later addition.

## 2026-11-03 — Monthly-on-31st: last-day-of-month clamp (not RFC 5545 skip)
- **Status:** decided
- **Context:** RFC 5545 says `FREQ=MONTHLY;BYMONTHDAY=31` must *skip* months without a 31st (invalid dates "MUST be ignored") — Jul 31, Aug 31, Oct 31, Dec 31, with September and November silently dropped ([findutils rrule explainer](https://findutils.com/blog/rrule-explained-how-recurring-calendar-events-work/)). For a cash-flow planner, a skipped month = a silently missed bill = a wrong forecast the user trusts. The alternative (clamp Jan 31 → Feb 28) matches how most billing systems behave in practice.
- **Decision:** Single documented convention: **clamp to last day of month** (Jan 31 → Feb 28; "monthly on the 31st" always fires). The UI still offers "last day of each month" as an explicit equivalent label; the key point is one convention, documented, with a test pinning it. Series are anchored on an immutable start date — never chained "+1 month."
- **Consequences:** Differs from strict RFC 5545; documented in the assumptions panel and in-app help so calendar-app users aren't surprised. Engine tests pin: 31st series fires Feb 28 (non-leap) / Feb 29 (leap), never skips.

## 2026-11-03 — No analytics, no telemetry, no network calls with user data
- **Status:** decided
- **Context:** The product's differentiator includes privacy-first, local-only operation. Any telemetry would contradict the positioning and create a data-handling surface with no product benefit at this stage.
- **Decision:** No analytics SDK, no telemetry events, no error-reporting service, no network calls carrying user data. A Playwright E2E gate asserts zero `fetch`/`XHR` during a full session; a Vitest gate asserts the engine bundle contains no network references.
- **Consequences:** We learn from user feedback (support channel), not instrumentation. Crash reports don't exist — the export-JSON flow doubles as the debugging artifact users can share voluntarily.

---

## 2026-11-03 — Monthly-on-29th: same clamp as 31st (Feb 29 fires only in leap years)
- **Status:** decided
- **Context:** The build brief says "Feb 29 fires only in leap years" while DECISIONS.md pins the 31st→last-day clamp for all short months. A monthly-29th series needed one rule for February in non-leap years: skip the month (RFC 5545) or clamp to Feb 28.
- **Decision:** Clamp, consistent with the 31st convention — a monthly-29th series fires Feb 28 in non-leap years and Feb 29 in leap years. The literal Feb-29 date therefore fires only in leap years, satisfying both statements. Skipping is rejected for the same reason as the 31st: a skipped month = a silently missed bill.
- **Consequences:** Engine tests pin: monthly-29th → 2023-02-28 / 2024-02-29; no occurrence ever dated 2023-02-29.

## 2026-11-03 — Single-project layout instead of packages/engine + apps/web monorepo
- **Status:** decided
- **Context:** ARCHITECTURE.md §5 specifies a pnpm monorepo (packages/engine, apps/web). The build brief requires package.json at the repo root with no nested project dir.
- **Decision:** One Vite project; the engine lives at `src/engine/` as a pure, framework-free TypeScript module (no React imports — enforced by a Vitest gate), runnable in a Web Worker as specified. The UI imports only from `src/engine/index.ts`.
- **Consequences:** No pnpm workspaces/filter commands; `npm run test` runs the engine suite. If the engine ever needs independent publishing, revisit the split — the module boundary (single import surface) is preserved either way.

## 2026-11-03 — Business-day adjustment: weekends only; holiday calendar deferred
- **Status:** decided
- **Context:** DECISIONS.md names US federal holidays as baseline data for Following/Preceding. A holiday table is data that must be maintained (and wrong holiday data silently moves real bills); milestones 1–3 ship the convention machinery with weekends only.
- **Decision:** `shiftBusinessDay` adjusts for Saturday/Sunday only. No invented holiday entries. Adding the federal-holiday table is a later, data-only change behind the same function signature.
- **Consequences:** Bills landing on a federal-holiday Monday are not shifted yet; documented in the assumptions line of the forecast view until the table lands.

## 2026-11-03 — Business-day defaults follow DECISIONS.md, not the brief's shorthand
- **Status:** decided
- **Context:** The build brief says "default Following"; DECISIONS.md (2026-11-03 business-day entry) specifies income → Preceding, expenses → Following.
- **Decision:** Follow DECISIONS.md: income nodes default to Preceding (paycheck lands the prior Friday), expense and variable-amount nodes default to Following (debit moves to Monday). Per-node override to preceding/following/none remains.
- **Consequences:** `defaultBusinessDay()` in the engine encodes this; the inspector shows the effective default per node type.

## 2026-11-03 — safetyBufferCents added to Assumptions
- **Status:** decided
- **Context:** The forecast view needs a buffer line ($500 default per the brief) and the safe-to-spend number is defined as minimum balance minus buffer. ARCHITECTURE.md's Assumptions had no buffer field.
- **Decision:** Added `safetyBufferCents` (default 50000) to `Assumptions`; `ForecastResult.safeToSpendCents` = pinch balance − buffer, reported raw (may be negative — the UI decides display flooring).
- **Consequences:** Changing the buffer changes the assumptions hash, correctly marking prior results stale.

## 2026-11-03 — Scenario model: per-scenario node toggles, full graph copies
- **Status:** decided
- **Context:** What-if scenarios need independent graphs that diverge (Base vs "Job loss") plus a cheap way to exclude a node without deleting it. ARCHITECTURE.md's Scenario had no toggle field.
- **Decision:** `Scenario` gains `disabledNodeIds: NodeId[]`. The engine's `forecast()` accepts `opts.disabledNodeIds` and filters nodes + incident edges BEFORE validation (a disabled node can never raise a spurious validation error); `forecastScenario(scenario, assumptions, opts)` is the pure scenario-aware wrapper. The Zustand scenarioStore owns the scenario list; the graphStore stays the editing surface for the active scenario, mirrored via a subscription (undo history resets on scenario switch — cross-scenario undo would be surprising). The model is plain JSON, ready for milestone-10 persistence.
- **Consequences:** Forecast/optimizer/Monte Carlo all take the active scenario's toggles. Disabling the starting-balance node is an honest validation error, not a silent chart.

## 2026-11-03 — Split allocation semantics: goal/debt-bound shares leave the spendable walk
- **Status:** decided
- **Context:** The milestone-3 walk ignored logic nodes entirely, so split percentages could not move any number — the optimizer (milestone 5) would have scored every candidate identically. A real, explainable semantic was needed.
- **Decision:** Income wired into a percentageSplit is divided per output; shares routed to goal or debt sinks LEAVE the spendable balance walk as `transfer` ledger events (the money genuinely moves to savings / extra principal). Shares routed to expense outputs or nowhere stay spendable (money is fungible; the earmark moves no cash). Goal nodes accumulate routed money (hit date, shortfall at target date); debt nodes accumulate extra principal. Direct income → goal/debt edges route 100%. Transfers are excluded from pinch-point driver analysis (allocations are not bills). The debt node's own minimum payment stays unmodeled in the walk (as in milestone 3 — many users model it as a separate expense node); the optimizer scores debt payoff via an extended `projectDebtPayoff(debt, from, extraMonthlyCents)`.
- **Consequences:** Graphs without goal/debt-routed splits forecast byte-identically to milestone 3 (all 85 pre-existing tests pass unchanged). The optimizer's objectives now have real gradients: savings-goal shortfall, spendable minimum, debt payoff date.

## 2026-11-03 — Optimizer: dead-split exclusion + search-space guard
- **Status:** decided
- **Context:** A split only moves the forecast when it routes income into a goal or debt sink (allocation semantics). Searching splits that can't move any number returns arbitrary "winners" — noise presented as optimization.
- **Decision:** `optimize()` computes liveness per split via `buildAllocationPlan`: excluded when no income is wired in, when its income is already claimed by another split (first split in node order wins), or when no output reaches a goal/debt. Excluded splits are reported with reasons (`excludedSplits`) and the search note says so in plain language. Search space: 5% grid; beyond 50k combos coarsen to 10%; beyond that a seeded sample (reproducible) — `searchMode`/`stepUsed`/`searchNote` always tell the UI what ran.
- **Consequences:** The optimizer throws a clear, actionable error when nothing is live ("wire a split output to a goal or debt node") instead of returning junk. Measured: 4 live 2-output splits × 90 days = 14,641 combos in ~2.1–2.6s on this VM (under the 3s budget); typical 1–2 split searches finish in tens of ms.

## 2026-11-03 — Monte Carlo: per-run streams, bill coverability, worker protocol
- **Status:** decided
- **Context:** MC needs reproducible, order-independent randomness (worker scheduling must not change results), plus per-bill coverability and rent-by-month — not just bands.
- **Decision:** Each run's stream is `mulberry32(masterSeed ^ imul(runIndex+1, 0x9E3779B9))` — order-independent by construction. Stream order per run: variable draws first, then shock draws (DECISIONS.md). A bill is "covered" when the day's opening balance >= the bill amount (end-of-previous-day, or the starting balance on day 0); per-node probability = share of runs where every occurrence was covered; rent = /rent/i expense else largest monthly expense, reported by calendar month. Failed-trial drill-down capped at 200 stored rows (true count kept). Worker protocol: `{id, kind:'montecarlo', graph, assumptions, options}` in; progress/done/error out; cancel = terminate. ShockEvent gains optional `kind` ('oneTime' | 'missedPaycheck'), `date`, `incomeNodeId` — backward compatible.
- **Consequences:** Measured: 5,000 runs × 90 days in ~0.5s on this VM (target was < 3s) — no hot-loop optimization needed; the skipHash/skipValidation fast path does the work. UI runs 500–10,000 (default 2,000) with progress + cancel; seed displayed; "re-run with same seed" reproduces bit-identical results (unit-tested).

## Template for future decisions

```
## YYYY-MM-DD — <short title>
- **Status:** decided
- **Context:** ...
- **Decision:** ...
- **Consequences:** ...
```
