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

## 2026-11-03 — Tradeoff table: sequential worker runs, reduced MC per candidate
- **Status:** decided
- **Context:** Optimizer × Monte Carlo is K runs × M candidates — full 2,000-run MC per candidate would take ~5× longer and block the UI.
- **Decision:** Default 1,000 runs per candidate (control: 500–5,000), run sequentially through the existing worker protocol with per-candidate progress ("Candidate 2 of 5…") and cancel. Rows: goal score (units depend on the goal, labeled), overdraft chance (1 − P(above $0)), min-balance p5 (worst 5% of runs' lowest point), rent-miss chance (worst month). Sortable; expandable rows show the candidate's engine-generated explanation + mini fan chart. Results keyed by a fingerprint of (optimizer result, runs, seed, graph+assumptions) so staleness is visible.
- **Consequences:** A 5-candidate stress test at 1,000 runs ≈ 2–3s in the worker. No canvas preview overlay on row select (DESIGN.md §5) — deferred; the expandable fan chart covers the comparison need for v1.

## Template for future decisions

```
## YYYY-MM-DD — <short title>
- **Status:** decided
- **Context:** ...
- **Decision:** ...
- **Consequences:** ...
```

## 2026-11-03 — Variable-amount nodes gain an income direction
- **Status:** decided
- **Context:** The variable-amount node was expense-only (generateEvents hardcoded kind 'expense'), but PRODUCT_SPEC/DESIGN.md specify the freelancer template's "irregular income modeled as variable node". Wiring a variable node as income without engine support would have silently subtracted the income from the balance — wrong numbers presented as a forecast.
- **Decision:** `VariableAmountNode.direction?: 'income' | 'expense'`, optional, defaulting to 'expense' (every existing graph and test behaves byte-identically). A shared pure guard `isIncomeSource()` (now a type guard) is used everywhere the engine must treat a node as money-in: event generation (kind, incl. skipIncomeOccurrences for missed-paycheck shocks), split allocation claiming, direct income→goal/debt edges, split-preview cards, and Monte Carlo rent designation (income-direction variables are never bills). The Inspector exposes a Money in/out toggle; canvas edges tint green for income-direction sources.
- **Consequences:** Freelancer template models client income as a true variable inflow (typical in deterministic, triangular-sampled in MC, shockable via missed-paycheck). No schema migration needed — absent `direction` means expense.

## 2026-11-03 — Alert rules evaluate the deterministic forecast, not Monte Carlo
- **Status:** decided
- **Context:** Milestone 8's rules ("warn me if projected balance drops under $X") need a single, explainable, instant answer. Running them over Monte Carlo bands would make trigger dates probabilistic and the explanations ("which bills drove it") ambiguous.
- **Decision:** `evaluateAlerts()` runs one deterministic forecast (honoring the active scenario's disabled-node toggles) and evaluates all enabled rules against it. Severity ordering is critical > warning > info, then earliest firing date. Explanations reuse the shared `findDrivers` analysis so alerts and the forecast panel never disagree about what drove a low point.
- **Consequences:** Alerts recompute live on every graph/assumptions change (one forecast — cheap). MC-based alerting is a later feature if users ask for it.

## 2026-11-03 — Persistence: versioned localStorage schema v1
- **Status:** decided
- **Context:** ARCHITECTURE.md sketched a `schemaVersion: 3` persisted shape with an acknowledged-alerts list; milestones 1–9 built a different reality (rules engine instead of acknowledged alerts, settings store, onboarding flag). The real schema needed pinning.
- **Decision:** Key `cashflow-planner/v1` holds `{ schemaVersion: 1, scenarios, activeScenarioId, assumptions, rules, settings, savedAt }`. Boot hydrates every store via `applyPersistedState()`; changes autosave debounced 500ms (skipped until hydration completes so seed state never overwrites a real save). Corrupt/unparseable data is backed up to `cashflow-planner/v1.corrupt` and the app starts fresh with a dismissible notice — never a crash. Migrations are pure chained functions; the v1→v2 pattern is documented in `migratePersisted` (unknown future versions are rejected, never guessed). Export downloads the same versioned JSON; import validates schema version + every scenario graph through the engine validator before anything is applied (replace = full wipe, merge = imported scenarios appended with fresh ids). "Reset all data" requires typing RESET.
- **Consequences:** Export files stay importable across versions via the migration chain. The `.corrupt` backup keeps only the latest copy.

## 2026-11-03 — Settings own the theme; header toggle removed
- **Status:** decided
- **Context:** The header had its own light/dark toggle (local state); milestone 10 adds a real theme setting (light/dark/system) plus reduced-motion and currency.
- **Decision:** One source of truth: `settingsStore.theme`. The header toggle was removed; theme lives in the Settings tab (also reachable via the header ⚙ button). Currency is display-only (symbol prefix, no conversion); changing it re-renders the app via a store subscription so all money figures update. Reduced motion toggles a `reduce-motion` class with an animation/transition kill-switch, defaulting to the OS preference.
- **Consequences:** No two theme states to disagree. The old per-session toggle is gone — users who used it now pick once in Settings.

## 2026-11-03 — Onboarding completion is a persisted setting; templates replace the canvas
- **Status:** decided
- **Context:** First-run onboarding must show once (no saved data → overlay), be skippable, and be re-runnable from Settings. Template loads and the onboarding-built graph replace the whole canvas.
- **Decision:** `settingsStore.onboardingComplete` gates the overlay; `loadGraph()` on the graph store replaces nodes/edges and resets undo history (cross-graph undo would be surprising — same rule as scenario switches). The scenario mirror persists the loaded graph into the active scenario automatically, so templates work inside scenarios without special-casing. Template loads ask for confirmation only when the canvas is non-empty.
- **Consequences:** "Reset to template" and "Clear canvas" are safe (confirmed), undoable only within the new graph's own history.

## 2026-11-04 — Sim workers outlive their views (module-level pool)
- **Status:** decided
- **Context:** Each result view owned its Web Worker via useSimWorker, which terminated the worker on unmount. Switching result tabs unmounts the view — so clicking away mid-Monte-Carlo silently discarded the run (found during FINISH perf probing). The completion callback also died, leaving a remounted view stuck on "running" with the result delivered but the flag never cleared.
- **Decision:** `workers/simPool.ts` holds one module-level worker per owner ('montecarlo' | 'tradeoff'); no terminate-on-unmount. Run state (running flag + progress) is mirrored in the results store — the single source of truth — so a remounted view picks up live progress and the correct flag; pool callbacks reference stable store setters. Cancel stays explicit and scoped per owner. Tradeoff's per-candidate chain token is module-level (a ref reset on remount and halted the background chain).
- **Consequences:** A run started on the MC tab completes even if the user browses Forecast/Optimizer meanwhile; the result appears on return. Workers live until explicit cancel or page unload — two workers max, same as before.

## 2026-11-04 — MiniMap removed (rendered an empty box)
- **Status:** decided
- **Context:** The React Flow MiniMap rendered its frame and viewport mask but zero node dots — the RF store never populated measured dimensions for our custom node types (verified: `.react-flow__minimap-node` count stayed 0 even after 5s; `nodeHasDimensions` gate filters every node). An empty minimap frame reads as a broken control.
- **Decision:** Remove the MiniMap; keep zoom Controls + fitView. Revisit if a future @xyflow/react version measures custom nodes correctly — the removal is one line to revert.
- **Consequences:** Slightly less at-a-glance navigation on large graphs; the canvas remains fully pannable/zoomable.

## 2026-11-04 — Right rail: 24rem + 3×3 tab grid; Settings rows stack vertically
- **Status:** decided
- **Context:** Blake: the right rail was cramped (w-80) with tiny tab buttons half-hidden behind a horizontal scrollbar; Settings rows had label/control columns colliding at narrow widths.
- **Decision:** Rail widened to 24rem; the 9 tab buttons became a 3×3 grid (no horizontal scroll) at 13px with an active-background tint; "MC"→"Monte Carlo", "Tradeoff"→"Trade-off". Settings `Row` restyled as a vertical stack (title+blurb above, control below, wrapping) so it reads cleanly at any width.
- **Consequences:** Less canvas width on small laptop screens; mobile already uses full-width sections.

## 2026-11-04 — Split nodes use the rectangular card (diamond removed)
- **Status:** decided
- **Context:** Blake: "I dont like the Split node is diagonal, make it like the other nodes."
- **Decision:** Deleted `DiamondShell`; both split nodes now use `RectShell` with a `cf-node-split` accent (logic-color left border, like income/expense) and multiple output handles along the right edge. Dead diamond CSS removed.
- **Consequences:** Splits are visually consistent with every other node; still distinguishable by color + icon. Conditional keeps its hexagon (not flagged).

## 2026-11-04 — Marquee multi-select on the canvas
- **Status:** decided
- **Context:** Blake: "Make it so I can drag a marquee over nodes to select them all and move them."
- **Decision:** `selectionOnDrag` + `panOnDrag={[1,2]}` (middle/right-drag still pans). Store gained `selectedNodeIds` alongside `selectedNodeId` (single-selection convenience: set iff exactly one selected, so the Inspector auto-open behavior is unchanged). Selection changes accumulate via `onNodesChange` 'select' events — required because nodes are controlled (`selected` comes from the store); `onSelectionChange` alone never fired with the real set. Dragging any selected node moves the group; beginDrag/endDrag already snapshot once, so multi-move is a single undo step. Delete removes the whole selection in one history entry. Inspector empty state shows "N nodes selected" guidance.
- **Consequences:** Left-drag no longer pans the canvas (standard tradeoff for marquee apps); keyboard Delete now deletes groups.

## 2026-11-04 — Timelapse: play/stop money-flow playback on the canvas
- **Status:** decided
- **Context:** Blake: "We need a play and stop button for the node graph that shows a timelapse of a selected time and how money gets dispersed, good to troubleshoot splits."
- **Decision:** New pure engine module `engine/flow.ts`: `flowFrames()` replays the deterministic forecast walk and emits per-day frames (edge transfers with amounts + node pulses + one-line summary), derived from the same `forecast()` + `buildAllocationPlan()` the chart uses — the timelapse can only show what the forecast computes. `flowStore` holds playback state (frames snapshot on Play; 14/30/60/90-day window; 1×/2×/4× speed; scrub slider). `TimelapseBar` docks at the canvas bottom (collapsed ▶ button when idle). Active edges glow with animated dashes; firing nodes get pulsing amount chips; the bar shows date, balance, and the day's money movement in words. Scrubbing pauses. Honest footnote: only percentage-split routing is simulated — priority/conditional nodes don't move money in the forecast yet (pre-existing engine scope, not changed here).
- **Consequences:** Frames are a snapshot — edits mid-playback don't rebuild until Play is pressed again. 6 new engine tests; 187 unit tests green.
