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

## Template for future decisions

```
## YYYY-MM-DD — <short title>
- **Status:** decided
- **Context:** ...
- **Decision:** ...
- **Consequences:** ...
```
