# DESIGN.md — Cash-Flow Planner Visual Design

*Calm, trustworthy financial tool. Not gamified, not crypto-bro. Every number is shown with its uncertainty and its assumptions — the visual language must make "based on your inputs" feel true at a glance.*

---

## 1. Visual direction

**Tone:** a quiet bank ledger crossed with a lab notebook — precise, honest, unhurried. Surfaces are flat and calm; color is reserved for meaning (money movement, warnings, uncertainty bands), never decoration. No confetti, no streaks, no "level up" language, no dark-pattern urgency. The optimizer's "top candidates" are presented as options with tradeoffs, not winners with trophies — Boldin's guardrail framing ("safe target / too conservative / early warning") is the emotional model ([help.boldin.com](https://help.boldin.com/en/articles/12571086-new-feature-spending-guardrails-insight)).

**Layout:** three regions — left: node palette + scenario list; center: canvas (the primary surface — the graph is part of the main tab model, never a secondary screen, per RESEARCH.md §3); right: inspector when a node is selected, otherwise the forecast/optimizer/MC results panels. The assumptions panel is a persistent, collapsible strip under the results — visible by default on first run, collapsible after.

**Density:** comfortable, not cramped. Financial data needs room to be read; pinch points and driver lists get whitespace, not compression.

---

## 2. Color tokens (CSS variables, light + dark, WCAG AA)

All text/background pairings target **WCAG AA (4.5:1 normal text, 3:1 large text)**. Uncertainty bands use low-saturation fills so the median line stays dominant.

```css
/* Light theme */
--bg:            #FAFAF8;  /* warm paper white */
--surface:       #FFFFFF;
--surface-2:     #F1EFEA;  /* inset panels */
--border:        #E2DED4;
--text:          #1C1A15;  /* near-black, warm */
--text-muted:    #6B665A;  /* 4.6:1 on --bg */
--income:        #2C7449;  /* money in — deep green (darkened 2026-11-04 for AA on --surface-2) */
--expense:       #B3402E;  /* money out — brick red */
--accent:        #2B5F8A;  /* interactive blue-slate */
--warning:       #96600F;  /* amber-brown for pinch/attention (darkened 2026-11-04: was 4.24:1, now 5.05:1) */
--danger:        #B3402E;  /* same as expense: below-$0 */
--band-50:       rgba(43,95,138,.28);  /* 50% interval fill */
--band-80:       rgba(43,95,138,.16);  /* 80% interval fill */
--band-90:       rgba(43,95,138,.08);  /* 90% interval fill */
--on-accent:     #FFFFFF;  /* text on --accent fills (2026-11-04) */
--node-balance:  #2B5F8A;
--node-logic:    #6D5B8E;  /* splits/conditionals — muted violet */
--node-goal:     #2F7D4F;  /* goals/debt-payoff — green family */
--node-debt:     #8A4A2B;  /* debt — rust */
--node-variable: #96600F;  /* variable amounts — amber family */

/* Dark theme */
--bg:            #161511;
--surface:       #1E1D18;
--surface-2:     #26251F;
--border:        #3A382E;
--text:          #EDE9DD;
--text-muted:    #A8A294;  /* 4.6:1 on --bg */
--income:        #5CB87F;
--expense:       #E0705A;
--accent:        #7FA8CC;
--warning:       #D9A441;
--danger:        #E0705A;
--band-50:       rgba(127,168,204,.30);
--band-80:       rgba(127,168,204,.17);
--band-90:       rgba(127,168,204,.09);
--on-accent:     #161511;  /* text on --accent fills: #fff was 2.51:1 in dark (2026-11-04) */
--node-balance:  #7FA8CC;
--node-logic:    #A894C8;
--node-goal:     #5CB87F;
--node-debt:     #D08A5A;
--node-variable: #D9A441;
```

Rules: income is always green-family, expense always red-family, across both themes — money direction must never depend on theme memory. Below-$0 regions on charts use the danger color; pinch-point markers use warning. Chart gridlines use `--border`; never pure black/white text (warm-tinted).

---

## 3. Typography

**Body/UI:** system stack (`-apple-system, "Segoe UI", Roboto, Inter, "Helvetica Neue", Arial, sans-serif`). Justification: financial tools are read all day; system fonts render crisply at small sizes, load instantly, and match the OS the user trusts with their money. No webfont dependency for the working UI.

**Display/numbers:** one tabular-numeral treatment — `font-variant-numeric: tabular-nums` on all money figures so columns and ledger rows align. Headline numbers (pinch point, success share) may use a slightly larger weight (600) but stay in the system stack.

**Display font decision:** no custom display font in v1. A distinctive font buys brand at the cost of load time, licensing review, and a less "serious money" feel; the product differentiates on the canvas and the explanations, not on typography. Revisit only if marketing pages need a voice.

**Scale:** 12px micro-labels (node cards, chart axes), 14px base, 16–20px panel titles, 28–32px headline metrics. Line-height 1.5 for prose (assumptions, disclaimers, explanations).

---

## 4. Node visual language

Every node type is visually distinct by **shape + color + icon** (redundant encoding — never color alone, for colorblind safety). Node cards show live computed values as status overlays ("next: Nov 15 · $2,140") per RESEARCH.md §3.

| Node type | Shape | Color token | Icon | Card shows |
|---|---|---|---|---|
| Starting balance | Rounded rect, double left border | `--node-balance` | Wallet / banknote | Balance + as-of date |
| Income | Rounded rect, **up-arrow chevron** on left edge | `--income` | Arrow-down-into-tray (↓ in) | Amount, frequency ("$2,140 · biweekly · 26/yr") |
| Expense | Rounded rect, **down-arrow chevron** on left edge | `--expense` | Arrow-up-out-of-tray (↑ out) | Amount, next due date |
| Variable amount | Rounded rect, **dashed border** (range = uncertainty) | `--node-variable` | Tilde / wave (~) | "min $80 · typ $140 · max $220" |
| Percentage split | **Diamond** (decision-like) | `--node-logic` | Pie-slice | Output percentages, live split amounts |
| Priority split | **Diamond**, stacked-lines badge | `--node-logic` | Stacked bars | Priority order, caps |
| Conditional | **Hexagon** | `--node-logic` | Branch / fork | "if balance > $500", live true/false state |
| Goal / savings | Rounded rect, **flag tab** on top edge | `--node-goal` | Flag / target | Target, projected hit date or shortfall |
| Debt | Rounded rect, **notched corner** | `--node-debt` | Chain-link / card | Balance, APR, payoff date |

Edges: curved (bezier), subtle animation only while a simulation is running; income edges tinted green-family, expense edges red-family, logic edges neutral slate. Selected edge shows amount flowing. Invalid drop targets highlight red with the rejection reason as a tooltip ("would create a cycle").

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

- **First launch (no graph):** canvas shows a calm empty state — dotted grid, a centered card: "Build your first money plan," three template buttons, and "start from scratch." No dead ends, no demo data pre-loaded (nothing fictional in the app — the templates are clearly labeled starting points the user edits, not pretend finances).
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
