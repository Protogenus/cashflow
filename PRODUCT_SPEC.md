# PRODUCT_SPEC.md — Cash-Flow Planner Product Specification

*Node-based personal cash-flow planner. Privacy-first, local-only, no backend, no analytics. Two differentiators: (1) brute-force split optimizer; (2) Monte Carlo forecasts with shock events. Every recommendation explainable, framed as "based on your inputs," with a visible assumptions panel and a short disclaimer.*

---

## 1. Target user

**Primary: the "tight-month" household manager.** Someone (or a couple) who is paid on a schedule, has fixed recurring bills, and experiences at least one pinch point per month — the "on budget for the month but overdraft on a Tuesday" problem that Recurna Flow was founded to address ([recurna.ca](https://www.recurna.ca/)). Concretely: a single-income renter whose paychecks land bi-weekly while rent and the car payment land on the 1st; a couple juggling a car loan, subscriptions, and irregular utilities; a freelancer with variable income who needs to know, in week-level granularity, whether a slow month breaks the plan. Their age and tech level: comfortable with spreadsheets and calendar apps, possibly burned by bank-sync failures.

**Why existing tools fail them:**
- **Bank-sync is the #1 complaint vector, not a feature.** All four mainstream reference apps (PocketSmith, Monarch, Copilot, Simplifi) depend on third-party aggregators (Plaid/Yodlee/Finicity/MX) and all four get hammered for sync failures and miscategorization; Simplifi's May 2026 missing-transactions incident corrupted users' data and plans ([RESEARCH.md](RESEARCH.md), §2 GAP 6). A local-only, manual-entry tool sidesteps the problem the incumbents' users complain about most.
- **Forecasting is either missing, coarse, or manual-only.** Copilot has no forecasting at all ([lumaledger.app](https://lumaledger.app/blog/copilot-money-vs-monarch-money)); Monarch's Core projection window is months-short and its debt-payoff integration is weak; PocketSmith's learning curve is "too sophisticated for most people" ([askmeoffers.com](https://askmeoffers.com/users-review/pocketsmith-com/)); and no app tells you *which bills* drive the constraint or *searches* for a better allocation — every what-if is hand-proposed by the user ([RESEARCH.md](RESEARCH.md), §2 GAP 1).
- **Probabilistic thinking exists only at retirement scale.** Boldin and ProjectionLab run Monte Carlo on 30-year portfolios ([help.boldin.com](https://help.boldin.com/en/articles/11452478-financial-planning-methods)); nobody applies it to "will I be negative in the third week of next month if the electric bill runs high and the car needs a repair" ([RESEARCH.md](RESEARCH.md), §2 GAP 2). That is the exact question this user asks.
- **Setup cost vs. payoff is wrong for them.** ProjectionLab's setup "takes hours" ([producthunt.com](https://www.producthunt.com/products/projectionlab)); PocketSmith needs hand-tuned rules and categories ([pocketkiwi.com](https://www.pocketkiwi.com/post/pocketsmith-review-of-reviews)). This user wants a working first plan in under a minute (see onboarding in DESIGN.md).

**Secondary: the optimizer-curious planner.** A user who already has a budget but wants the app to *find* the best allocation — "show me the top 5 ways to split my next paycheck" — and understand *why* each one works. Nobody serves this user today (RESEARCH.md GAP 1).

---

## 2. Core user stories

1. **As a bi-weekly-paid renter, I want to see my daily balance for the next 90 days** so that I can spot the week where rent + car payment + utilities all land before my second paycheck.
2. **As a household manager, I want to build my plan by dragging nodes (paycheck, rent, car payment, subscriptions) onto a canvas and connecting them** so that I can see my money flow the way I think about it, not as a spreadsheet.
3. **As a user with variable bills, I want to give each expense a min/typical/max range instead of a single number** so that the forecast reflects what I actually pay month to month.
4. **As a user who wants a better plan, I want the app to brute-force split-percentage options for a goal I choose** (maximize safety buffer, hit a savings goal by a date, pay debt fastest, or a weighted blend) **and show me the top candidates with explanations** so that I don't have to hand-test dozens of allocations.
5. **As a nervous planner, I want a Monte Carlo forecast ("94% chance of staying above $0") based on my variable ranges and optional shock events** (a $600 car repair, a missed paycheck) so that I know how fragile my plan is before the month starts.
6. **As a non-expert, I want every recommendation to tell me which bills drove the constraint and which date was the pinch point** so that I can understand the answer in one glance and trust it's based on my inputs.
7. **As a privacy-conscious user, I want all of my data to stay in my browser with manual entry only** so that no bank credentials, transaction history, or personal data ever leaves my machine or touches a third-party aggregator.
8. **As a planner who edits a real plan, I want to drag an expense on the forecast graph to a different date and watch the projection update live** (the forecash.io pattern, [forecash.io](https://forecash.io/)) so that I can experiment with paying a bill early or late before I commit.
9. **As a planner with competing goals, I want to define multiple scenarios (baseline + "what if I pay the car loan extra") and compare them side by side** (the PocketSmith named-scenario pattern, [pocketsmith.com](https://www.pocketsmith.com/plan-ahead/what-if-scenarios/)) so that I can make a decision with the tradeoffs visible.
10. **As a skeptical user, I want to see every assumption the simulation used — in plain language, next to the result — and re-run any result with the same seed** so that the numbers never read as a black-box verdict.

---

## 3. MVP scope

**In (v1, must ship):**
- Node canvas: starting-balance node, income nodes (amount + frequency: weekly/bi-weekly/semi-monthly/monthly), expense nodes (amount + due date + frequency), percentage-split nodes, priority-split nodes, conditional ("if balance > X") nodes, variable-amount nodes (min/typical/max), goal/savings nodes, debt nodes. Add via drag-from-palette; edit via side inspector; delete via Delete/Backspace; undo/redo (single grouped stack).
- Deterministic forecast engine: day-by-day balance walk over a 90-day horizon, event generation from recurrence rules (bi-weekly vs. semi-monthly as distinct options with counts stated; 31st-handling per DECISIONS.md; Following/Preceding weekend adjustment per item), pinch-point detection (min balance + date + driving events).
- Brute-force optimizer: split percentages in 5% steps over user-chosen split nodes, for one chosen goal (maximize safety buffer | hit savings goal by date | pay debt fastest | weighted blend). Returns top 5 candidates, each with an explanation (which bills drove the constraint, the pinch date, and the delta vs. baseline).
- Monte Carlo: 2,000 trials (ProjectionLab-scale ceiling; Boldin uses 1,000 — [help.boldin.com](https://help.boldin.com/en/articles/11452478-financial-planning-methods)), seeded RNG (mulberry32) for reproducibility; variable bills sampled from min/typical/max ranges; optional shock events ($600 car repair, missed paycheck, user-defined). Outputs: fan/percentile chart, frequency-framed headline ("in 9 of 10 simulated futures your balance stays positive"), pinch-point distribution, per-trial drill-down on failure paths ("which node breaks this path").
- Tradeoff table combining optimizer + Monte Carlo per candidate (goal score vs. success probability).
- Assumptions panel (visible, editable, plain language) + short contextual disclaimer on every result view; per research/part-d §4, the disclaimer names specific limits ("doesn't include taxes, market shocks, or changes to your spending") at the point of the number.
- Scenarios: named, saved, toggleable baseline + what-ifs with dashed-baseline comparison (Recurna pattern, [recurna.ca](https://www.recurna.ca/)); compare mode.
- State: localStorage with versioned schema + migrations; JSON export/import; 3 starter templates; guided first-run (sample graph in under 60 seconds).
- Light + dark themes, WCAG AA contrast, keyboard canvas navigation, chart text alternatives, mobile list-view fallback.
- No network calls with user data. No backend. No analytics.

**Later (explicitly out of v1):**
- Bank sync / account aggregation of any kind (Plaid, Yodlee, Finicity, MX — all deliberately excluded; see DECISIONS.md).
- Mobile-native app (PWA/mobile wrapper later; v1 is a responsive web app with a list-view canvas fallback).
- Tax modeling, investment/retirement horizons, Roth conversions — the ProjectionLab/Boldin layer is a different product, not a v1 feature.
- Multi-currency (ProjectionLab's top-voted request since 2021 — [firenum.com](https://firenum.com/blog/projectionlab-review) — proves it's wanted, but it's a later expansion; v1 is single-currency).
- CSV import from banks (later, and only as recurrence-suggestion input — never as sync).
- Household sync / multi-user / shared plans; account sharing; cloud backup.
- Historical backtesting (ProjectionLab's block-bootstrap — [firenum.com](https://firenum.com/blog/projectionlab-review) — is a v2 candidate, not v1).
- AI assistant / conversational layer; MCP server exposure.
- Debt-payoff snowball/avalanche scheduling beyond "pay debt fastest" optimization target.

---

## 4. What we are DELIBERATELY NOT building

- **No bank sync in v1** — manual entry only. Bank aggregators are the top complaint vector across every incumbent (RESEARCH.md §2 GAP 6); excluding them is a trust and privacy position, not a missing feature. Recorded in DECISIONS.md.
- **Private by default** — no backend, no accounts, no telemetry. If the user's data leaves the machine at all, it's because they explicitly exported a JSON file.
- **No account aggregation** — this tool does not connect to, read, or sync with any financial institution, now or in v1's roadmap.
- **No mobile-native app in v1** — responsive web with a list-view fallback for the canvas on small screens.
- **No financial advice** — the app is an educational planning tool. Outputs are framed as "based on your inputs"; recommendations describe tradeoffs, never prescribe actions ("you should invest in X"). Per research/part-d §4 rule 7.
- **No automated decision-making on the user's behalf** — the optimizer proposes; the user applies.

---

## 5. Success criteria for MVP

- A new user builds a working plan from a starter template and sees a 90-day forecast in under 60 seconds (first-run guided flow).
- The optimizer returns top-5 candidates for a 90-day plan with 4 split nodes in under 3 seconds on a mid-range laptop (brute-force bound is documented in ARCHITECTURE.md).
- Monte Carlo (2,000 trials, 90 days) completes in under 2 seconds, or shows a progress state with the seed displayed; re-running the same seed reproduces identical results.
- Every recommendation shown to a user carries: the driving bills, the pinch date, the delta vs. baseline, and the assumptions link — verified by inspection, not trust.
- No user-data network calls: verified by a test that asserts the simulation and storage layers make zero `fetch`/`XMLHttpRequest` calls (and a Playwright E2E run with network blocked except none).
- Lighthouse/axe: zero critical accessibility violations; WCAG AA contrast on all text tokens; keyboard-only canvas navigation covers add/edit/connect/delete/undo.
- 80%+ Vitest coverage on the simulation engine (pure module, framework-free); Playwright E2E covers the 10 core user stories.
