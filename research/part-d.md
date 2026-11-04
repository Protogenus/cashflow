# Part D — Node-Graph UX, Forecast Visualization, Date Logic, Responsible Presentation

Research for the node-based personal cash-flow planner. Collected 2026-11-03
via web search and text fetches. Every factual claim cites a source URL;
unverifiable claims are marked UNVERIFIED.

---

## 1. Node-Graph / Visual-Workflow UX Patterns

Reference implementations: n8n, Node-RED, Zapier's visual builder,
Figma-style canvases (Figma, tldraw, Excalidraw), and the React Flow (xyflow)
component library. The interaction grammar below is convergent — users of any
of these tools will expect the same gestures.

### Patterns worth adopting

- **Infinite pannable/zoomable canvas, dotted-grid background.** n8n renders a
  light dotted grid as the primary "you are on a canvas" cue; pan = click-drag
  on empty canvas, zoom = scroll wheel / trackpad pinch. Floating control
  cluster (bottom-left): zoom in / out / zoom-to-fit / reset-to-100% / tidy-up
  (auto-layout). React Flow ships `Controls`, `Background`, `MiniMap` as
  built-ins plus `fitView()`. (n8n skips the minimap — fit/tidy substitute.) Sources: https://github.com/scaler-llm-experiments/n8n-judge/blob/HEAD/docs/n8n-reference/01-canvas-and-nodes.md · https://deepwiki.com/imcaffiene/n8n-clone/3.3-visual-workflow-editor
- **Drag-from-palette to add; drag-from-output onto empty canvas opens the node
  picker and auto-wires.** n8n trails a "+" affordance from each output port —
  clicking it opens the picker and inserts + wires the chosen node in one step.
  Manual port-drag is for connecting existing nodes / fan-outs. React Flow:
  convert drop points with `screenToFlowPosition()`; validate in `onConnect`. Sources: https://github.com/scaler-llm-experiments/n8n-judge/blob/HEAD/docs/n8n-reference/01-canvas-and-nodes.md · https://github.com/thedogwiththedataonit/react-flow/blob/HEAD/AGENTS.md
- **Standard selection grammar:** single click; shift-click multi-select;
  marquee (drag-to-select on empty canvas); Escape to clear. Both Delete and
  Backspace must remove the selection (Mac has no Delete key). Expected too:
  copy/paste (Ctrl+C/V), duplicate, select-all (Ctrl+A). Sources: https://github.com/anand-s-kale/scriptmanager/blob/HEAD/docs/superpowers/specs/2026-07-15-n8n-inspired-workflow-editor-design.md · https://github.com/alas-poor-ophelia/windrose-md/blob/HEAD/.claude/skills/ui-design/SKILL.md
- **Reject invalid connections on drop with a concise reason.** Standard
  validations: prevent cycles, self-loops, duplicate edges; enforce handle type
  compatibility; cap max connections per handle. Curved, selectable edges with
  clear direction; unique handle IDs are mandatory for multi-handle nodes. Sources: https://github.com/anand-s-kale/scriptmanager/blob/HEAD/docs/superpowers/specs/2026-07-15-n8n-inspired-workflow-editor-design.md · https://github.com/thedogwiththedataonit/react-flow/blob/HEAD/AGENTS.md
- **Edit via side inspector + inline edits on the node card.** The canvas stays
  the primary editing surface — a remediation plan treats "Graph is not part of
  the main tab model" as a systemic failure. Sources: https://github.com/anand-s-kale/scriptmanager/blob/HEAD/docs/superpowers/specs/2026-07-15-n8n-inspired-workflow-editor-design.md · https://github.com/bluzir/c8c/blob/HEAD/specs/c8c-workflow-editor-ux-remediation-plan.md
- **Validation at the point of edit, not at compute time.** Field-level errors
  inside the inspector, a persistent validation count near the compute action,
  and one-click navigation from a validation list to the offending node/field. Source: https://github.com/bluzir/c8c/blob/HEAD/specs/c8c-workflow-editor-ux-remediation-plan.md
- **One undo/redo stack, grouped operations.** "Cmd+Z reverts the last edit
  regardless of surface" — fragmented undo across canvas/inspector/list is a
  P0 defect, not polish. Grouping: mouse-down→mouse-up = one step (a drag
  emits hundreds of position updates; use begin-batch/end-batch); typing
  debounces to one step per ~300–500ms pause. Broken undo "destroys user trust
  faster than almost any other bug." Sources: https://github.com/bluzir/c8c/blob/HEAD/specs/c8c-workflow-editor-ux-remediation-plan.md · https://github.com/alas-poor-ophelia/windrose-md/blob/HEAD/.claude/skills/ui-design/SKILL.md
- **Status overlays on nodes.** An n8n topology view gained green/red/yellow
  badges per node + last-run timestamps directly on the canvas. For this
  planner: per-node live values on the card ("next: Nov 15 · $2,140"). Source: https://community.n8n.io/t/ticket-based-cookie-sso-for-n8n-community-edition-complete-design-implementation/278489
- **Performance hygiene (React Flow):** memoize custom node/edge components,
  define `nodeTypes`/`edgeTypes` outside the component, keep nodes lightweight,
  keep edge animations subtle, separate node content state from graph state,
  serialize with `toObject()` for save/restore, use stable IDs, validate before
  saving. Sources: https://www.scenario.press/blogs/249147/How-to-Get-Started-with-React-Flow-Build-Interactive-Workflows?lang=es_es · https://github.com/thedogwiththedataonit/react-flow/blob/HEAD/AGENTS.md · http://umatechnology.org/react-js-graph-visualization-choosing-react-flow-cytoscape-js-or-sigma-js/
- **Auto-layout on demand (dagre), not continuous** — an explicit "tidy" action
  that preserves the user's freeform positioning otherwise. Source: https://github.com/thedogwiththedataonit/react-flow/blob/HEAD/AGENTS.md

### Anti-patterns to avoid

- **Mode confusion:** user doesn't know which tool is active (pan vs. select).
  Fix: highlight the active tool, change the cursor instantly (<100ms). Source: https://github.com/alas-poor-ophelia/windrose-md/blob/HEAD/.claude/skills/ui-design/SKILL.md
- **Hidden modifier-key features.** Show modifier hints in tooltips. Source: https://github.com/alas-poor-ophelia/windrose-md/blob/HEAD/.claude/skills/ui-design/SKILL.md
- **Ungrouped undo:** one drag costing hundreds of Ctrl+Z presses. Source: https://github.com/alas-poor-ophelia/windrose-md/blob/HEAD/.claude/skills/ui-design/SKILL.md
- **Feedback gap:** validation only at compute time; status shown only on a
  separate surface. Show feedback where the user is already looking. Source: https://github.com/bluzir/c8c/blob/HEAD/specs/c8c-workflow-editor-ux-remediation-plan.md

---

## 2. Best Practices for Visualizing Forecasts with Uncertainty

### Chart selection

- The fan chart is the canonical form for projection uncertainty: the Bank of
  England inflation fan and the National Hurricane Center's "cone of
  uncertainty." The FT Visual Vocabulary lists "Fan chart (projection)" under
  Change over Time: "Use to show the uncertainty in future projections —
  usually this grows the further forward to projection." Sources: https://www.scientificamerican.com/article/how-to-get-better-at-embracing-unknowns/?print=true. · https://github.com/Financial-Times/chart-doctor/blob/main/visual-vocabulary/README.md
- A fan chart is legitimate ONLY when: (F1) the banded region is genuinely the
  future, not observed history; (F2) bands are real quantiles of a defined
  predictive distribution from a stated model (e.g. 50/80/90% predictive
  intervals), not hand-drawn; (F3) the observed-vs-projected boundary is
  visually explicit (solid past, banded future); (F4) the central line is not
  presented as "the" forecast; (F5) the horizon is bounded to where the model
  is meaningful. Forbidden: fans over non-forecast data; smooth bands not
  derived from a model. Source: https://github.com/ideotion/open-omniscience/blob/HEAD/docs/research/dataviz/chart_decision_framework.md

### What the research says

- Bank of England Staff Working Paper No. 1,196 (2026) tested fan charts vs.
  dot plots, box-and-whisker, speedometers, and ranges on experts and UK
  households: fan charts "perform best overall; combining high perceived
  usability with superior accuracy in conveying distributional information
  across audiences," helped the public "learn more realistic uncertainty
  perceptions," and acted as an "insurance policy" preserving forecaster
  credibility after misses. (Counterweight: the Bernanke Review recommended
  discontinuing the BoE fan chart while stressing uncertainty communication
  still matters — the debate is about the device, not hiding uncertainty.) Sources: https://www.bankofengland.co.uk/working-paper/2026/anchors-aweigh-the-effect-of-communicating-forecast-uncertainty · https://ryan-rholes.github.io/Papers/Uncertainty_Communication.pdf
- Frequency framing beats abstract intervals for lay readers. Quantile
  dotplots (stacks of dots, each a fixed probability chunk — counting dots =
  reading probability) and hypothetical outcome plots (animated frames of
  possible outcomes; people infer the distribution from frequency of
  occurrence) outperform error bars and text intervals, which produce biases.
  Label the interval explicitly (95% CI vs. SD vs. SE). Sources: https://www.scientificamerican.com/article/how-to-get-better-at-embracing-unknowns/?print=true. · https://statmodeling.stat.columbia.edu/2022/03/25/advice-for-the-government-on-communicating-uncertainty/ · https://github.com/ideotion/open-omniscience/blob/HEAD/docs/research/dataviz/chart_decision_framework.md

### Honesty rules for the planner

- A chart that hides uncertainty looks more precise than the evidence allows.
  Show intervals/scenarios/missingness when they affect interpretation; use
  plain language to distinguish probability from outcome and model from
  measurement. Source: https://dsai.smritiweb.com/static/viz.html
- Show uncertainty in the main view, not liner notes: "What we visualize
  implies what we think is important. Relegating uncertainty information to
  liner notes … while putting unadorned point estimates on the main page tells
  the public we are pretty sure we can't be wrong." Source: https://statmodeling.stat.columbia.edu/2022/03/25/advice-for-the-government-on-communicating-uncertainty/
- For probability-of-ruin / probability-of-success displays: the percentage
  answers "what share of simulated futures survive," not "will I be OK." Lead
  with the percentile-band balance chart plus frequency-framed outcomes ("in 3
  of 10 simulated futures the account goes negative by 2035"); keep the
  headline percentage secondary and always paired with the definition of
  "success/failure." UNVERIFIED (synthesis of the cited sources; no single
  source prescribes this exact pairing).

---

## 3. Date / Recurrence Logic Pitfalls

### Bi-weekly vs. semi-monthly

- Bi-weekly = every 14 days anchored to a start date: 26 pay periods in a
  common year (occasionally 27), periods drifting across and sometimes
  straddling month boundaries.
- Semi-monthly = twice per month on fixed calendar dates (1st/15th, or
  15th/last day): exactly 24 per year, anchored to the month so cutoffs are
  stable.
- Sources: https://storyvergey.com/d/Dh5JMsNTMxurIzzPMwd6M.pdf · https://veloriftlabs.com/p/rbScTiNpqIag3ucRJqd8b.pdf
- The planner's UI must offer these as distinct options with the count stated
  ("26 paychecks/yr, every other Friday" vs. "24/yr, on the 1st and 15th") — a
  bi-weekly salary modelled as semi-monthly undercounts a year by ~3.8% of
  gross. UNVERIFIED (arithmetic: 26 vs 24; the UI recommendation is product
  judgment).

### The month-end problem

- "Monthly on the 31st" is NOT "last day of month." RFC 5545 (iCalendar, the
  standard behind Google/Apple/Outlook calendars): recurrence instances with
  invalid dates (e.g. February 31) "MUST be ignored and MUST NOT be counted as
  part of the recurrence set." So `FREQ=MONTHLY;BYMONTHDAY=31` yields Jul 31,
  Aug 31, Oct 31, Dec 31 — September and November silently skipped. For "last
  day of every month" use `BYMONTHDAY=-1`. Sources: https://findutils.com/blog/rrule-explained-how-recurring-calendar-events-work/ · https://publish.obsidian.md/tasks/Getting+Started/Recurring+Tasks
- Expose these as two distinct choices with plain labels ("on the 31st — skips
  shorter months" vs. "on the last day of each month"); a skipped month means
  a missed bill in the projection. Source: https://publish.obsidian.md/tasks/Getting+Started/Recurring+Tasks
- The alternative convention — clamp-to-end (Jan 31 → Feb 28) — is valid only
  if chosen deliberately: adding a month to Jan 31 can yield Mar 2 (overflow)
  or Feb 28 (clamp) depending on the date library, so the planner must pick
  and document ONE convention and never rely on language-default date
  arithmetic silently. Sources: https://publish.obsidian.md/tasks/Getting+Started/Recurring+Tasks · https://cal67.calculator.city/recurrence-calculator.html
- Anchor every series on an immutable start date (RFC 5545 requires it). Never
  chain "+1 month" onto the last computed occurrence — the 31st→28th clamp
  permanently degrades the series. Sources: https://github.com/super-productivity/plainspace/blob/HEAD/docs/plans/repeating-tasks-concept.md · https://publish.obsidian.md/tasks/Getting+Started/Recurring+Tasks

### Weekend / holiday adjustment

- Use finance's standard vocabulary, the ISDA Business Day Conventions, for
  what happens when a scheduled date lands on a non-business day: **Following**
  (move to the first following business day); **Modified Following** (next
  business day, unless it lands in the next calendar month — then the preceding
  business day; the default for most payment/period-end dates in swap
  contracts); **Preceding** (first preceding business day); **No Adjustment**. Sources: https://www.isda.org/a/C51EE/FX-Glossary-English.pdf · https://legalclarity.org/what-is-the-modified-following-business-day-convention/
- Expose at least Following vs. Preceding per recurring item (paychecks usually
  arrive the preceding Friday; some bills debit the following Monday) with a
  documented default; payroll systems typically move payday to the prior
  business day on a holiday/weekend. Source: https://veloriftlabs.com/p/rbScTiNpqIag3ucRJqd8b.pdf
- The shift can change the effective accrual period — a holiday near a payment
  date can add/subtract a day or two of interest and slightly change the amount
  owed. Source: https://fedlaws.org/day-count-conventions-30-360-actual-360-and-actual-actual/
- Holiday calendars are local data, not logic: US federal holidays are the
  baseline, but bank/employer holidays vary. Test "problem years" where major
  holidays cluster with weekends and month-ends. Source: https://veloriftlabs.com/p/rbScTiNpqIag3ucRJqd8b.pdf

### Leap years, DST, timezones

- Feb 29 events occur only in leap years under RFC 5545 (a yearly series
  starting 2024-02-29 fires next in 2028). State the rule explicitly; don't
  silently collapse to Feb 28 forever. Source: https://findutils.com/blog/rrule-explained-how-recurring-calendar-events-work/
- Recur on wall-clock local time, not UTC. RFC 5545 recommends `DTSTART` with
  a `TZID`; a script that converts to UTC first and adds 7×24h lands an hour
  off after a DST change. Source: https://medium.com/@findutils/calendar-data-hygiene-filter-scrub-and-expand-recurring-events-in-ics-files-348783ae0d2c
- Spring-forward (nonexistent local time): fire at the post-gap instant for
  that occurrence only, keeping the series anchored — matches Google Calendar /
  Temporal 'compatible' behavior (deliberately diverges from RFC §3.3.10's
  skip). Fall-back (ambiguous): take the earlier instant. Source: https://github.com/super-productivity/plainspace/blob/HEAD/docs/plans/repeating-tasks-concept.md
- Midnight-anchored financial events are DST-insensitive; only timed alerts
  need this handling — but store occurrences as local wall-clock in the user's
  zone regardless. UNVERIFIED (product judgment applying the cited standards).

### Edited occurrences and exceptions

- `COUNT` is applied while the rule evaluates, then exceptions are removed —
  a cancelled/skipped occurrence still consumes a counted slot. Deleting one
  occurrence must not extend the series. Sources: https://findutils.com/blog/rrule-explained-how-recurring-calendar-events-work/ · https://medium.com/@findutils/calendar-data-hygiene-filter-scrub-and-expand-recurring-events-in-ics-files-348783ae0d2c
- When one occurrence of a series is moved/edited, keep the series rule intact
  and store the exception against the original occurrence (iCalendar's
  `RECURRENCE-ID` pattern); ignoring the override can double-list it. Source: https://findutils.com/blog/rrule-explained-how-recurring-calendar-events-work/
- `DTSTART` counts as the first occurrence — the anchor date itself fires. Source: https://medium.com/@findutils/calendar-data-hygiene-filter-scrub-and-expand-recurring-events-in-ics-files-348783ae0d2c

---

## 4. Presenting Probabilistic Financial Outputs Responsibly to Non-Experts

### Regulatory baselines

- **FCA (UK): "clear, fair and not misleading" + demonstrable understanding.**
  Financial promotions and communications (COBS 4) must be clear, fair and not
  misleading. The Consumer Duty (PRIN 2A; open products 31 July 2023, closed
  books 31 July 2024) raised the bar: communications must *equip retail
  customers to make informed decisions* — judged by actual customer
  understanding, not technical accuracy, with testing expected for complex
  products. Sources: https://handbook.fca.org.uk/handbook/bcobs2/bcobs2s1 · https://complianceconsultant.org/consumer-duty-compliance-checklist-what-fca-regulated-firms-must-do-now-secrets-you-wish-you-knew-one-year-ago/ · https://zenithspark.co.uk/what-are-the-rules-for-financial-services-copy/
- The FCA's own behavioural testing found consumers frequently don't read
  generic bolted-on risk statements at all — a disclaimer box is not a cure
  for a misleading headline number. Risk information should be balanced,
  contextual, proportionate to likelihood and impact, and positioned at the
  right point in the user journey. Sources: https://zenithspark.co.uk/what-are-the-rules-for-financial-services-copy/ · http://www.investmentuk.org/sites/default/files/2026-04/Risk%20Warnings%20Guidance%20final.pdf
- **US: no unfair or deceptive acts/practices.** The CFPB enforces UDAAP
  (fines for misleading "zero fees" claims; disclaimers do not cure an
  underlying deceptive presentation). Dodd-Frank §1032 requires disclosures in
  "plain language, presented in a clear, concise, and understandable form."
  Industry norm: "Hypothetical performance ≠ actual results" must sit near the
  claim, not buried in fine print. Sources: https://empathyfirstmedia.com/financial-pr-compliance-guidelines/ · https://github.com/havryleshko/fin-regbase/blob/HEAD/wiki/summaries/dodd-frank-title-x-cfpb.md

### Why "probability of success" misleads

- Clients don't evaluate a 90% probability rationally — research (Kitces, via
  Kahneman's *Thinking, Fast and Slow*) shows they substitute an easier
  emotional question ("how bad would it feel to run out of money?"), so a
  stated 85%-vs-99% preference reflects fear intensity, not risk appetite. Source: https://obj.portfolioconstructionforum.edu.au/articles_perspectives/PortfolioConstruction-Forum_Do_Our_Brains_Really_Even_Know_How_To_Evaluate_A_Monte_Carlo_Analysis.pdf
- The "success/failure" framing conflates underspending with success: a future
  where the user dies with $3M unspent after decades of anxious underspending
  counts as "success" — "in any meaningful sense, that is not success. It is
  regret." Binary framing hides the spectrum of outcomes; show dollars across
  scenarios (median, poor, great), not just a survival percentage. Sources: https://incomelaboratory.com/retirement-income-guardrails-complete-guide/ · https://www.advisorperspectives.com/articles/2026/09/15/integrating-monte-carlo-modeling-actuarial-approach-copilot
- Alternatives: "probability of adjustment" (share of futures needing a
  spending cut — itself ambiguous without stating what adjustment and what
  happens without it) and dollar-answers ("you can spend $8,200/mo; if the
  balance drops to $X, cut to $7,400") instead of bare percentages. Sources: https://www.kitces.com/page/102/?s · https://incomelaboratory.com/retirement-income-guardrails-complete-guide/

### Concrete presentation rules for this app

1. Never show a point forecast without its band. Lead with the fan/percentile
   chart; the central line is the median, labeled as such — never "the
   forecast." (Basis: §2.)
2. Use frequency framing for lay users: "in 8 of 10 simulated futures your
   balance stays positive" alongside the percentage. (Basis: §2 research.)
3. State key assumptions next to the output in plain language (return
   distribution, inflation, what's excluded); risk emphasis proportionate to
   likelihood and impact, per the FCA. Source: http://www.investmentuk.org/sites/default/files/2026-04/Risk%20Warnings%20Guidance%20final.pdf
4. Round aggressively to avoid false precision ($41,800/yr, not $41,832.17/yr);
   bands should look like bands. UNVERIFIED (design judgment consistent with
   cited honesty rules).
5. Label projections as exploratory — "results of hypothetical scenarios" —
   per statistical-practice guidance. Source: https://statmodeling.stat.columbia.edu/2022/03/25/advice-for-the-government-on-communicating-uncertainty/
6. Make the disclaimer contextual, naming the specific limits ("doesn't include
   taxes, market shocks, or changes to your spending") at the point where the
   user reads the number. (Basis: §4 regulatory findings on unread generic
   warnings.)
7. Do not present outputs as financial advice ("you should invest in X"); the
   app is an educational planning tool. Investment content that ignores advice
   regulation reads as suspect to regulators and users. Source: https://stridec.com/blog/aeo-for-fintech/
8. Show assumptions as visible, editable inputs — the node graph is ideal:
   each assumption node exposes its value — so the projection never reads as a
   black-box verdict. (Basis: §1 status overlays; product judgment, otherwise
   UNVERIFIED.)

### Open questions

- UNVERIFIED: no published study was found testing which disclaimer placement
  (inline vs. modal vs. footer) best preserves comprehension of Monte Carlo
  outputs for personal-finance users specifically.
- UNVERIFIED: "probability of adjustment" has practitioner support but no
  cited consumer-comprehension experiment was found; user-test before making it
  the headline metric.
