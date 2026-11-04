# FINAL_REPORT.md — Cash-Flow Planner FINISH phase

Date: 2026-11-04. Starting point: 10 build milestones committed, 173 Vitest tests green, `npm run build` green. This report covers the FINISH phase (items 1–9 below) and ends with an honest audit against PRODUCT_SPEC.md.

## 1. Responsive / mobile — DONE

- The mobile list-view fallback (DESIGN.md requirement) was implemented in an earlier FINISH commit: at ≤767px the canvas is replaced by a grouped node list (money-in → splits/logic → money-out → goals/debts) whose cards expand into the **same** `NodeEditor` the desktop Inspector uses — no second editor to drift. A manual List/Canvas toggle exists; the app never auto-switches.
- **Fixed in this phase:** the mobile header's button row didn't wrap, clipping the Settings button mid-text at 375px. Added `flex-wrap` to the header action group (verified by screenshot).

## 2. Accessibility — DONE

- Keyboard: Tab reaches canvas nodes, Enter opens the Inspector, Delete/Backspace removes, Esc clears selection/closes panels, `?` opens a shortcut dialog (also a header `?` button).
- Charts have text alternatives: MC view had one; the forecast chart got `role="img"` + generated summary (min/max/pinch/safe-to-spend) + a visible `<details>` text summary.
- Contrast: measured in Node during the earlier FINISH pass — light `--warning` #A86A12 (4.24:1) → `#96600F` (5.05:1); light `--income` → `#2C7449`; new `--on-accent` token so primary buttons and the optimizer rank badge pass on both themes.
- Skip link, `:focus-visible` styles, 44px touch targets ≤767px, `aria-label`s on RF nodes and all icon-only buttons (audited: zero unlabeled icon buttons).
- **axe-core scan (this phase, headless Chromium): 0 critical violations.** 1 serious: `aria-prohibited-attr` on React Flow's connection-handle `<div>`s — that is @xyflow/react's own markup, and the `aria-label`s are intentional screen-reader affordances ("output Bills handle"). Stripping them to satisfy the linter would make real accessibility worse, so this is a documented intentional exception, not a fix.

## 3. Performance — VERIFIED, numbers below

Measured in headless Chromium (renter template, Web Worker pool):

| Workload | Measured | Target |
|---|---|---|
| Monte Carlo 5,000 runs × 90 days (worker) | **1,688–1,963 ms wall** | < 3 s ✅ |
| Monte Carlo 2,000 runs × 90 days (extrapolated ~40%) | ~700–800 ms | < 2 s ✅ |
| Optimizer, 21 allocations (1 split node) | **71 ms wall / 0.0 s engine** | < 3 s ✅ |
| Tab switch mid-MC-run | 364–491 ms, UI responsive | responsive ✅ |
| Same-seed MC re-run | identical headline (deterministic) | ✅ |

The optimizer bounds combinatorial explosion honestly: full 5% grid → coarsened steps → seeded sampling, always telling the user which mode ran ("Full grid was 194.5k combos — evaluated a seeded sample of 2.0k (reproducible; raise the cap for more)"). A real bug was found and fixed during perf probing: switching result tabs used to terminate in-flight worker runs; `src/workers/simPool.ts` now keeps per-owner workers alive and the stores own the running/progress state.

## 4. Playwright E2E — 7/7 PASSING (headless Chromium)

`npm run test:e2e` — 44.9 s total:

```
✓ onboarding builds a graph and the forecast appears (5.5s)
✓ add an expense node via the palette and see the forecast update (11.7s)
✓ run optimizer and apply a candidate (7.2s)
✓ run Monte Carlo with 500 runs and see fan chart + probabilities (24.2s)
✓ export JSON then import it back (14.0s)
✓ no network calls with user data during a full session (7.3s)
✓ mobile list view: browse, expand, and edit a node (6.1s)
```

Real assertions only (forecast values change, candidate applied + toast, same-seed determinism, restored graph after wipe). No app behavior was weakened to make tests pass.

## 5. Edge cases — DONE

`src/engine/edgecases.test.ts` (8 tests): zero balance, negative starting balance, no income nodes, no expense nodes, $999,999,999 extremes (no overflow/NaN), invalid dates, empty graph — all forecast-or-clear-error, never crash/blank. `validateGraph` rejects invalid dates (as-of, recurrence anchors, once-dates, goal targets) with node-specific messages. Money inputs accept negatives (overdrawn accounts are real). TemplatePicker applies directly on an empty canvas, confirms only when replacing a non-empty one.

## 6. Visual QA — DONE (22 screenshots reviewed, 6 fixes)

`docs/screenshots/`: canvas, forecast, optimizer, Monte Carlo, tradeoff, scenarios, alerts, settings, onboarding — light + dark desktop; onboarding, list, forecast — light + dark mobile. Every shot reviewed at full size; zero console/page errors during capture.

Fixes from the review:
1. **Removed the React Flow MiniMap.** It rendered its frame with zero node dots — the RF store never populates measured dimensions for our custom node types (verified 0 `.react-flow__minimap-node` elements even after 5 s). An empty minimap reads as broken; zoom controls + fitView remain. Logged in DECISIONS.md.
2. **Scenario row truncation** — "Base" rendered as "Base…" (baseline badge inside the truncating span crowded it out). Badge moved out; compare checkbox is now icon-only with tooltip + aria-label.
3. **Mobile header clipping** (item 1 above).
4. **Chart x-axis collisions** — 7 ticks in the 320px panel clipped the last tick ("Jan 93"/"Jan 29" overlapping). Thinned to 5 tick targets across Forecast/MC/Tradeoff/Scenarios.
5. **$0 ReferenceLine label** overlapped the last x tick — removed (line is self-evident).

## 7. Polish — DONE

Empty states (optimizer, tradeoff, node list, alerts), loading/progress states (MC + tradeoff worker progress with cancel; optimizer/forecast are sub-second synchronous), tooltips + aria-labels on every icon-only button (audited), sensible defaults (90d horizon, $500 buffer, 500 MC runs, seeded RNG).

## 8. Docs — DONE

- `README.md`: setup (`npm install` / `dev` / `test` / `test:e2e` / `build`), feature tour with screenshots, architecture map, how the simulation works (deterministic walk, triangular sampling, mulberry32, weekend-shift rules), and explicit limits (no bank sync, no taxes, not financial advice, single currency).
- Screenshots committed under `docs/screenshots/*.png` and referenced from the README.

## 9. Final audit vs PRODUCT_SPEC.md

Exercised in the running app (headless) unless noted:

| MVP item | Status |
|---|---|
| 9 node types (balance, income, expense, variable, %-split, priority-split, conditional, goal, debt) | ✅ palette + inspector, E2E adds expense |
| Drag-from-palette, side inspector edit, Delete/Backspace, undo/redo | ✅ E2E + manual |
| Deterministic 90-day forecast, pinch point + drivers, safe-to-spend | ✅ E2E + screenshots |
| Optimizer: 4 goals, 5% steps, top 5 + explanations (drivers, pinch date, delta vs baseline) | ✅ E2E applies candidate; Vitest covers goals |
| Monte Carlo: seeded (mulberry32), variable ranges (triangular), shock events, fan chart, frequency headline, drill-down into failing runs with drivers | ✅ E2E 500-run + determinism |
| Tradeoff table (optimizer × MC) | ✅ screenshot of completed run |
| Assumptions panel + disclaimer on every result view | ✅ visible in screenshots |
| Scenarios: named, baseline, per-scenario node toggles, compare | ✅ exercised headless |
| localStorage (versioned) + JSON export/import, 3 templates, <60s onboarding | ✅ E2E round-trip + onboarding test |
| Light/dark/system themes, WCAG AA, keyboard canvas nav, chart text alternatives, mobile list fallback | ✅ screenshots + axe (0 critical) |
| No network calls with user data | ✅ Vitest no-network gate + Playwright zero-non-localhost test |

**Honest gaps (not shipped):**
1. **User story 8 — drag an expense on the forecast chart to a different date.** Not implemented. The underlying capability exists (Inspector date edit → forecast updates live), but the forecash.io-style drag interaction does not. This is a real feature (hit-testing recurring events, pixel→date mapping, undo integration), not a polish item — building it hastily would produce a thin slice, so it's recorded here instead.
2. **MC pinch-point distribution histogram.** The spec lists it as an MC output; the failed-trial drill-down (date + drivers per failing run) covers "which node breaks this path," but there is no distribution chart of pinch dates across trials.
3. **E2E covers 7 flows, not literally all 10 user stories** (conditional nodes, priority splits, debt-payoff goal are covered by Vitest, not E2E).
4. **Build chunk-size warning**: 959 KB JS (286 KB gzip) — no code-splitting yet. Fine for local-first v1, worth addressing before any hosted deployment.
5. **axe serious** (React Flow handle `aria-label`s) — intentional exception, see item 2.

## Test summary (final runs, 2026-11-04)

- **Vitest: 15 files, 181 tests, all passing** (5.95 s). Includes the engine no-network gate and the no-React-in-engine gate.
- **Playwright: 7/7 passing** (44.9 s, headless Chromium).
- **`npm run build`: succeeds** (tsc + vite, 6.15 s).

## Suggested next steps

1. Story 8 drag-on-chart interaction (the largest known MVP gap).
2. MC pinch-date distribution chart.
3. Code-split the bundle (Recharts + React Flow are the bulk) before any hosted deployment.
4. E2E for conditional/priority-split/debt-payoff paths.
5. Per DECISIONS.md: the app is local-only by design — any cloud backup/sync would need an explicit product decision first, not a quiet addition.
