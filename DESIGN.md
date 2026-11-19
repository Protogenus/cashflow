# DESIGN.md — Cash-Flow Planner Visual Design

*Calm, trustworthy financial tool. Not gamified, not crypto-bro. Every number is shown with its uncertainty and its assumptions — the visual language must make "based on your inputs" feel true at a glance.*

---

## 1. Visual direction

**Tone:** a quiet bank ledger crossed with a lab notebook — precise, honest, unhurried. Surfaces are flat and calm; color is reserved for meaning (money movement, warnings, uncertainty bands), never decoration. No confetti, no streaks, no "level up" language, no dark-pattern urgency. The optimizer's "top candidates" are presented as options with tradeoffs, not winners with trophies — Boldin's guardrail framing ("safe target / too conservative / early warning") is the emotional model ([help.boldin.com](https://help.boldin.com/en/articles/12571086-new-feature-spending-guardrails-insight)).

**Layout:** three regions — left: node palette + scenario list; center: canvas (the primary surface — the graph is part of the main tab model, never a secondary screen, per RESEARCH.md §3); right: inspector when a node is selected, otherwise the forecast/optimizer/MC results panels. The assumptions panel is a persistent, collapsible strip under the results — visible by default on first run, collapsible after.

**Density:** comfortable, not cramped. Financial data needs room to be read; pinch points and driver lists get whitespace, not compression.

---

## 2. Color tokens (CSS variables, dark-only, WCAG AA)

The theme is [Matcha](https://github.com/lucafalasco/matcha) (dark-only) — one theme, no light/dark toggle. All text/background pairings target **WCAG AA (4.5:1 normal text, 3:1 large text)**. Uncertainty bands use low-opacity fills so the median line stays dominant.

```css
/* Matcha — the whole token set lives in src/renderer/index.css :root */
--bg:            #273136;  /* canonical Matcha background */
--surface:       #323F45;  /* card surfaces */
--surface-2:     #3D4C53;  /* hovers, wells */
--border:        #4A5E65;
--text:          #D1DED3;  /* canonical Matcha foreground */
--text-muted:    #9AB0A4;
--income:        #7EB08A;  /* money in — raw matcha green */
--expense:       #FF819F;  /* money out — raw matcha pink */
--deposit:       #7EB08A;  /* money in: edges + travelling dots */
--withdraw:      #ED1C1C;  /* money out: edges + travelling dots — true red */
--accent:        #FF819F;  /* highlights, median line, selection */
--accent-deep:   #FF819F;
--warning:       #D2B48C;  /* raw matcha tan — pinch/attention */
--danger:        #FF819F;  /* below-$0 regions */
--danger-soft:   #4A2C35;
--sage:          #7EB08A;
--sage-soft:     #2C3D33;
--amber:         #D2B48C;
--amber-soft:    #3D362A;
--sky:           #7EA4B0;  /* raw matcha blue */
--sky-soft:      #26383E;
--band-50:       rgba(255,129,159,.28);  /* 50% interval fill */
--band-80:       rgba(255,129,159,.16);  /* 80% interval fill */
--band-90:       rgba(255,129,159,.08);  /* 90% interval fill */
--on-accent:     #273136;  /* text on --accent fills */
--node-balance:  #7EA4B0;
--node-logic:    #BA8EAF;  /* splits/conditionals — raw matcha mauve */
--node-goal:     #7EB08A;
--node-debt:     #FF8A3D;  /* debt — orange, per spec */
--node-expense:  #ED1C1C;  /* expense node accent — red, per spec */
--node-variable: #D2B48C;  /* variable amounts — raw matcha tan */
/* Sidebar (dark rail) icon colors are the raw Matcha hexes in --sb-* */
--sidebar:       #1E2629;
--sidebar-2:     #323F45;
--sidebar-ink:   #D1DED3;
--sidebar-muted: #9AB0A4;
```

Rules: money direction is never color alone — deposits are green, withdrawals true red (`#ED1C1C`), in dots, edges, and chips alike. Below-$0 regions on charts use the danger color; pinch-point markers use warning. Chart gridlines use `--border`; never pure black/white text. All border radii are 3px, including pills and circles.

---

## 3. Typography

**Body/UI:** system stack (`-apple-system, "Segoe UI", Roboto, Inter, "Helvetica Neue", Arial, sans-serif`). Justification: financial tools are read all day; system fonts render crisply at small sizes, load instantly, and match the OS the user trusts with their money. No webfont dependency for the working UI.

**Display/numbers:** one tabular-numeral treatment — `font-variant-numeric: tabular-nums` on all money figures so columns and ledger rows align. Headline numbers (pinch point, success share) may use a slightly larger weight (600) but stay in the system stack.

**Display font:** Georgia serif (`--font-display`) for headings, greetings, and big numbers; system stack for the working UI. No webfont dependency — the serif is a system font, so it costs no load time.

**Scale:** 12px micro-labels (node cards, chart axes), 14px base, 16–20px panel titles, 28–32px headline metrics. Line-height 1.5 for prose (assumptions, disclaimers, explanations).

---

## 4. Node visual language

Every node is the **same rectangular card** with a 5px solid left-border accent in the type's colour, plus a distinct Lucide icon (redundant encoding — never color alone, for colorblind safety). The per-type shapes of the original design (chevrons, flag tab, debt notch, dashed variable border, double balance border, diamond splits, hexagon conditional) were removed 2026-11-19 in favour of one style. Node cards show live computed values as labelled stat rows (label left, value right, hairline between rows), never a run-on paragraph.

| Node type | Left-border accent | Icon (Lucide) | Card shows |
|---|---|---|---|
| Starting balance | `--node-balance` (blue) | circle-dollar-sign | Balance + as-of date |
| Income | `--income` (green) | banknote-check | Amount, frequency, next payday |
| Expense | `--node-expense` (red `#ED1C1C`) | banknote-arrow-down | Amount, frequency, due date |
| Variable amount | `--node-variable` (tan) | trending-up-down | Direction, min / typical / max, next |
| Percentage split | `--node-logic` (mauve) | square-percent | One row per output: percent · live amount |
| Priority split | `--node-logic` (mauve) | star-plus | Priority order, caps ("Up to $X" / "No cap") |
| Conditional | `--node-logic` (mauve) | scroll-text | "If balance > $X", true/false labels |
| Goal / savings | `--node-goal` (green) | goal | Target, by date |
| Debt | `--node-debt` (orange) | banknote-x | Balance owed, APR, payoff date |

**Routing in the forecast:** all three routers move money. A percentage split divides each wired income occurrence by percent; a priority split fills its outputs in priority order up to their caps; a conditional sends the whole occurrence down its true or false branch (predicate tested against the balance after the income lands). Goal/debt sinks on any routed branch leave the spendable balance; shares to expense outputs or to nothing stay spendable, and the expense still hits on its own schedule. An income wired into several routers is handled by the first that claims it (percentage, then priority, then conditional; first in node order within a kind). Direct income → goal/debt edges apply only when no router claims the income.

**Flow chips:** during Timelapse playback, each node that moves money shows chips hanging below its bottom border, in rows of 3–4. A chip shows only the charge name; hovering it pops the amount up in a bubble above the chip. Chip borders follow money direction (green deposit, red withdrawal).

Edges: curved (bezier), subtle animation only while a simulation is running; deposit edges green, withdrawal edges true red, logic edges mauve. A flowing edge keeps its direction colour and only gets thicker — it never turns accent pink. Selected edge shows amount flowing. Invalid drop targets highlight red with the rejection reason as a tooltip ("would create a cycle").

**Validation surfacing:** field errors inline in the inspector; a validation count badge sits next to the "Run forecast" button; clicking it navigates to the offending node/field (RESEARCH.md §3).

---

## 5. Charts and uncertainty presentation

- **Forecast chart:** fan chart. Solid line = observed/planned-to-date (if any actuals), then P50 median line labeled "median — not the forecast," with 50/80/90% interval bands in `--band-*` fills. Past-vs-projected boundary explicitly marked. Below-$0 region shaded danger. Pinch point marked with a warning diamond + date label. (Fan-chart legitimacy rules F1–F5, RESEARCH.md §3.)
- **Monte Carlo panel:** headline in **frequency framing first** — "In 9 of 10 simulated futures your balance stays positive" — percentage secondary, with the success definition beside it ("balance never below $0 over 90 days"). Per-trial drill-down: clicking a failed-trial row opens its ledger with the driving events highlighted (ProjectionLab pattern, [projectionlab.com](https://projectionlab.com/changelog)).
- **Tradeoff table:** one row per optimizer candidate: objective score, success share, worst-decile (P10) minimum, pinch-date range. Sortable; selecting a row loads the candidate into the canvas as a preview overlay (dashed baseline vs. candidate — Recurna's dashed-comparison pattern, [recurna.ca](https://www.recurna.ca/)).
- **Numbers:** rounded aggressively — $41,800, never $41,832.17 (RESEARCH.md §3). Cents shown only in the ledger detail view.
- **Disclaimer:** short, contextual, at the point of the number — e.g. under the MC headline: *"Based on your inputs. Doesn't include taxes, market changes, or spending you haven't entered. Not financial advice."* Assumptions panel one click away.

---

## 6. Empty states

- **First launch:** the app seeds a starter graph (bi-weekly paycheck, rent, electric, starting balance) so the canvas is never empty — the user edits real numbers from the first minute. The onboarding overlay offers the three starter templates or a blank canvas instead; templates are clearly labeled starting points, not pretend finances.
- **No forecast yet:** results panel shows a ghost outline of the fan chart with "Run your first forecast" — teaches where output will appear.
- **Optimizer with no split nodes:** "Add a percentage-split node to let the optimizer explore allocations" with a one-click "add split node" action.
- **Monte Carlo with no variable nodes or shocks:** still runs (deterministic bands collapse), but shows a nudge: "Add a min/typical/max range or a shock event to see uncertainty."

---

## 7. Onboarding flow

**Goal: working first plan in under 60 seconds.**

1. Welcome screen (one screen, no carousel): "See your next 90 days of money." → Choose a template or start blank.
2. **3 starter templates** (editable JSON, clearly labeled as starting points):
   - **Single-income renter:** bi-weekly paycheck, rent (1st), car payment, electric (variable), two subscriptions, starting balance.
   - **Couple with car loan:** two incomes (bi-weekly + semi-monthly — demonstrating the distinction), mortgage/rent, car loan debt node, childcare expense, savings goal.
   - **Variable-income freelancer:** irregular income modeled as variable-amount nodes, quarterly estimated-tax expense, savings goal with target date.
3. Guided first-run (3 steps, skippable, ~45 seconds): (a) "This is your starting balance — set it to what your account shows today"; (b) "Drag a bill onto the canvas and connect it"; (c) "Press Run forecast — this is your pinch point." Each step highlights the relevant UI; completing it checks off.
4. After first forecast: a single contextual nudge — "Try the optimizer: pick a goal" — not a tour of every feature.

**Principles:** no account creation, no email capture, no "connect your bank" upsell (there is nothing to connect — DECISIONS.md). Progress is saved automatically to localStorage; the user can export JSON at any time.

---

## 8. Mobile behavior

The canvas is a desktop-first surface. On small screens (<768px):

- **List-view fallback:** the graph renders as a vertical list of node cards grouped by type (money in → splits/logic → money out → goals/debts), each expandable to edit fields. Edges are summarized as "flows to: Rent, Electric" chips. All simulation features (forecast, optimizer, Monte Carlo, tradeoff table) work identically — only the spatial canvas is replaced.
- Switching between canvas and list is manual (a toggle), never automatic mid-session; the choice persists per device.
- Touch: node drag uses a long-press handle; pinch-zoom and two-finger pan on canvas where shown; all inspector controls are ≥44px touch targets.
- Charts remain fully readable; the fan chart keeps its bands (no simplification that hides uncertainty).

---

## 9. Accessibility

- **Keyboard canvas navigation:** Tab moves focus between nodes/edges; arrow keys pan the canvas when it has focus; Enter opens the inspector for the focused node; Delete/Backspace removes selection; Ctrl+Z / Ctrl+Shift+Z undo/redo; Ctrl+C/V/X duplicate flows; `?` opens the shortcut list. Every canvas action has a keyboard equivalent — the list view is the ultimate fallback.
- **ARIA:** canvas region labeled; nodes exposed as buttons with names ("Expense node: Rent, $1,400 monthly"); live region announces simulation completion and validation errors; charts have `role="img"` with full text alternatives.
- **Chart text alternatives:** every chart ships with a generated textual summary ("Median balance stays above $800; 90% interval dips to –$120 in late March; pinch point March 21 at $212 in the median run") — also the basis for the explanation panel, so a11y and explainability share one source.
- **Motion:** edge animations and chart transitions respect `prefers-reduced-motion` (static render, no animation).
- **Contrast:** all tokens meet WCAG AA (noted in §2); focus indicators are 2px `--accent` outlines, never removed.
- **Forms:** every inspector field labeled; numeric fields use `inputmode="decimal"` with plain-language error messages ("Enter an amount, like 1400.00").
