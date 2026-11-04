# Part C — Monte Carlo / Simulation Reference Apps

> Researched 2026-11-03. Every factual claim cites a source URL verified via text fetch on that date. Claims that
could not be verified are marked **UNVERIFIED**.

## 1. ProjectionLab

**What it does:** A web-based financial-independence and retirement modeling tool. You model income, expenses, savings, accounts, and milestones (retirement date, Roth conversions, Social Security timing), and it projects net worth, taxes, and cash flow year by year for the rest of your life. Created by Kyle Nolan, solo-launched in 2021, bootstrapped to ~$1M ARR with ~100k households using it. Sources: https://firenum.com/blog/projectionlab-review · https://thecollegeinvestor.com/44369/projectionlab-review/

**How it presents Monte Carlo / probabilistic outputs:**
- Headline metric is a **"Chance of Success" score** — the share of simulated runs where the portfolio outlasts the plan. Runs **up to 2,000 Monte Carlo trials** in random-sampling mode; trial count is constrained by the historical record when backtesting. Source: https://www.boldin.com/retirement/boldin-vs-projectionlab/
- **Fan chart** offering uncertainty bands over time (added per changelog), **percentile-range distributions and IQR indicators** for milestones (e.g., "financial independence might occur as early as age 45 in the top 25% of scenarios or as late as 55 in the bottom 1%"), distribution histograms with clickable bars to filter trials, and **individual-trial drill-down** — click a failed trial to see exactly where it went wrong. Sources: https://projectionlab.com/changelog · https://projectionlab.com/blog/getting-started-with-projectionlab
- **Historical backtesting** alongside Monte Carlo: runs the plan against every rolling historical period (back to 1928/1872 depending on source — retirebeforedad says back to 1928; firenum cites a Fire Planner running every start year since 1872), plus a **block-bootstrap** methodology that shuffles consecutive slices of historical returns to preserve year-to-year patterns. Sources: https://www.financialsamurai.com/projectionlab-review-best-diy-retirement-planning-tool/ · https://firenum.com/blog/projectionlab-review · https://www.retirebeforedad.com/projectionlab-review/
- Notable contrast: per Boldin's own comparison, ProjectionLab "surfaces its Monte Carlo results as a Chance of Success score as well, but **leaves interpreting it more to the user**" — no spending guardrails or plain-language action nudges. Source: https://www.boldin.com/retirement/boldin-vs-projectionlab/
- Their changelog documents ongoing investment in MC presentation: interactive **milestone timing distributions with IQR indicators**, sparkline charts in trial cards, filtering trials by milestone timing or outcome type, and automatic re-runs when plan inputs go stale. Sources: https://projectionlab.com/changelog
- Statistics for each metric of interest are shown split at a milestone, with a table of occurrence rates and timing for each milestone (e.g., FI likelihood by age). Source: https://projectionlab.com/blog/getting-started-with-projectionlab
- **Sampling methodology is user-configurable**: historical data vs. custom probability distributions, and per ProjectionLab's own explainer, "the return and inflation distributions you feed it shape every result." Sources: https://projectionlab.com/blog/getting-started-with-projectionlab · https://projectionlab.com/financial-terms/monte-carlo-simulation
- A Sankey cash-flow chart shows annual money in/out per year. Source: https://thecollegeinvestor.com/44369/projectionlab-review/

**Pricing (verified Oct 2026 against vendor pricing pages):** Basic free (forecasting, Monte Carlo, backtesting; plans not saved); Premium **$129/year** (saved plans, tax tools, Roth conversion modeling, compare mode, downloadable reports; 7-day free trial); Lifetime **$1,199 one-time**; Pro **$549/year** for advisors. 2026 price hikes: Premium $109→$129, Pro $540→$549, lifetime $799→$1,199; monthly option removed. Sources: https://thecollegeinvestor.com/44369/projectionlab-review/ · https://firenum.com/blog/projectionlab-review
- Premium's 2026 additions per reviews: Roth conversion modeling, capital gains harvesting, withdrawal strategies, ACA subsidy planning, estate planning, Compare Mode, downloadable reports, international presets. A "Fire Planner" add-on runs month-by-month through 500 Monte Carlo sims plus every start year since 1872 with US taxes. Source: https://thecollegeinvestor.com/44369/projectionlab-review/ · https://firenum.com/blog/projectionlab-review

**Strengths:** Best-in-class visualizations (10/10 per Marriage Kids and Money); Monte Carlo + backtesting on the *free* tier; deep tax modeling (federal/state/capital gains/RMDs/Roth ladders) on Premium; flexible-spending rules ("if the market drops 30% from ATH, cut discretionary 60%") that run inside the simulation; Compare Mode for side-by-side scenarios; **international tax presets**; downloadable reports; active Discord community; 4.9/5 on Product Hunt. Sources: https://marriagekidsandmoney.com/projectionlab-review/ · https://www.financialsamurai.com/projectionlab-review-best-diy-retirement-planning-tool/ · https://www.producthunt.com/products/projectionlab

**Weaknesses:** Steep learning curve — setup takes hours and "leaves interpreting it more to the user"; no direct bank/brokerage account sync (imports via Monarch/YNAB/Lunch Money instead); overkill for the accumulation phase ("if you're still building toward your first $100k–$250k invested, it's more tool than you need"); no AI assistant; reviewer notes "limited innovation over the past year"; multi-currency still missing (top-voted roadmap request since Nov 2021). Sources: https://wealthpotion.com/blog/projectionlab-review-alternative · https://marriagekidsandmoney.com/projectionlab-review/ · https://firenum.com/blog/projectionlab-review

**What users complain about:**
- Tax-calculation defaults: "most of them are defaulted and can't be fixed, so it skews all of our results... a miscalculated result in one year skews all of the remaining future years compounded" — a FIRE blogger canceled Premium over this. https://thenomadfi.com/insights/projection-lab-2025-324042
- Setup burden: users say initial setup "takes a little while" and many inputs can make forecasts "feel complex" (Product Hunt, 4.9/11 reviews). https://www.producthunt.com/products/projectionlab
- Over-precision expectations: "any promise of precise prediction remains limited" — users need coaching that the tool is a trade-off finder, not a crystal ball. https://www.producthunt.com/products/projectionlab
- Lifetime tier price has climbed from $450 at launch to $1,199 — reviewers note "waiting costs money." Source: https://firenum.com/blog/projectionlab-review
- Reddit aggregation (gummysearch, 2 mentions, 4.0/5): users recommend ProjectionLab's "self-hosted version" for long-term planning; one user manually updates accounts quarterly because there's no sync. https://gummysearch.com/tools/best-products/personal-finance-app/
- Boldin-leaning users on Bogleheads note ProjectionLab demands you do your own interpretation vs. Boldin's guardrails. https://www.bogleheads.org/forum/viewtopic.php?t=457003
- Price increases in 2026 (lifetime $799→$1,199) annoyed long-time watchers. https://thecollegeinvestor.com/44369/projectionlab-review/

**Explaining results to non-experts:** ProjectionLab runs a public explainer, *"What is a Monte Carlo Simulation?"*, written in plain language: "Rather than telling you what will happen, it tells you how often a plan like yours works across a wide range of possible futures"; explicitly warns "An 85% result does not mean you have a 15% chance of going broke tomorrow"; notes "a Monte Carlo simulation is only as good as its assumptions" and that small assumption changes swing results. Reviewers reinforce this framing ("85% ≠ 15% chance of failure; in 15% of scenarios you may need to be flexible"). Sources: https://projectionlab.com/financial-terms/monte-carlo-simulation · https://www.makingsenseofcents.com/2025/07/projectionlab-review.html
- **Takeaway for a node-based cash-flow planner:** ProjectionLab is the closest reference to "nodes driving a
   probabilistic engine" — milestone/timing concepts map well (their milestone timing distributions are
   essentially node-events projected onto percentiles). The individual-trial drill-down ("click a failed trial,
   see where it went wrong") is a killer UX pattern worth borrowing.

## 2. Boldin (formerly NewRetirement)

**What it does:** Full retirement-planning platform (founded 2005 by Stephen and Tim Chen; rebranded from NewRetirement in Sept 2024). Maps income, assets, spending, taxes, Social Security, Medicare, and withdrawal strategy into one integrated plan with 100+ (free) to 250+ (paid) inputs, scenario comparison, and account sync via Plaid. Sources: https://thecollegeinvestor.com/33680/newretirement-review/ · https://marriagekidsandmoney.com/boldin-review/

**How it presents Monte Carlo / probabilistic outputs:**
- **1,000 Monte Carlo trials** built around the user's assumed return (monthly-varying returns); headline metric is a **"Chance of Success"** percentage — "If Boldin shows an 82% Chance of Success, that means 820 of 1,000 simulated futures ended with money remaining." Sources: https://help.boldin.com/en/articles/11452478-financial-planning-methods · https://www.boldin.com/retirement/boldin-vs-projectionlab/
- **Spending Guardrails** — the signature translation layer: a **Safe Spending Target calibrated to ~80% success**, with an **Upper Guardrail at 95%** ("too conservative") and **Lower Guardrail at 70%** ("early-warning threshold"). Plain-language framing: "My retirement lifestyle, assuming things go reasonably well." Guardrails flag when to spend more or trim back for a few years. Sources: https://help.boldin.com/en/articles/12571086-new-feature-spending-guardrails-insight · https://www.boldin.com/retirement/plannerplus-price-increase-october-2026/
- **Market Risk Explorer**: model a decade of poor returns or three bad years in a row and see how it changes the score. **Sankey cash-flow chart** added 2026. Sources: https://www.boldin.com/retirement/plannerplus-price-increase-october-2026/
- Default assumptions are published: 8.08% return on a moderate portfolio, 2.54% inflation. Source: https://www.boldin.com/retirement/boldin-vs-empower/
- Boldin caveats results explicitly: founder Steve Chen's line — "the range of possible outcomes. It's not a guarantee but a way to guide your decisions and avoid catastrophic mistakes." Source: https://www.boldin.com/retirement/maxifi-vs-boldin-which-is-the-better-retirement-planning-tool-for-you/
- Free tier has **no Monte Carlo** and limited tax projections — a deliberate line. Source: https://www.monteclimb.com/blog/retirement-planning-software-comparison
- The help center is unusually candid about methodology: 1,000 trials, monthly-varying returns, standard deviation from a lookup chart, and a warning that the FIRE earliest-retirement calculation "often returns a very low Chance of Success." Source: https://help.boldin.com/en/articles/11452478-financial-planning-methods
- Boldin also supports Guardrails-style withdrawal strategies (Guyton-Klinger) and a "Max Spend" view showing the impact of drawing accounts down to a legacy goal — presented as an upper guardrail. Source: https://help.boldin.com/en/articles/11452478-financial-planning-methods

**Pricing:** Basic free; PlannerPlus **$168/year** (annual only, 14-day trial) — raised from $144→$168 for new subscribers on Oct 15, 2026 (existing subscribers grandfathered; earlier raised $120→$144 in July 2025); Boldin Advisors Retirement Plan Checkup $3,200 flat fee; ongoing advice from ~$1,200/year. Sources: https://hudsonweekly.com/retirement-planning-software-goes-free-the-adviser-sends-a-flat-fee-bill/ · https://www.boldin.com/retirement/newretirement-vs-best-retirement-planning/ · https://thecollegeinvestor.com/33680/newretirement-review/
- PlannerPlus Academy ($270/year, live monthly deep-dive classes) sits above PlannerPlus. Sources: https://www.mymillennialguide.com/newretirement-review/
- Plaid account syncing (PlannerPlus) claims to update 250+ data points across investments and business banking automatically. Source: https://www.retirepreneur.com/boldin-review
- PlannerPlus includes a document vault, live classes, multiple scenario comparisons (up to 10 scenarios, 3 side by side), Medicare/Social Security modeling, and unlimited Boldin AI. Source: https://www.boldin.com/retirement/boldin-vs-projectionlab/

**Strengths:** Cohesive plan tying taxes + Social Security + Medicare + withdrawals together; Spending Guardrails translate probability into actionable spending guidance; Monte Carlo + Roth Conversion Explorer + unlimited AI assistant ("Boldin AI") in PlannerPlus; live classes and Q&A; 250,000+ users; CNBC Select 2026 "best for a complete retirement roadmap" (per Boldin's own comparison page — self-reported). Sources: https://marriagekidsandmoney.com/boldin-review/ · https://www.boldin.com/retirement/newretirement-vs-best-retirement-planning/ · https://www.mymillennialguide.com/retirement-planning-tools/
- Independent long-term user (Marriage Kids and Money, 4.8/5): "What impressed me most wasn't the Monte Carlo analysis or even the retirement projections. It was the ability to quickly test real-life financial decisions and see how they impact my future." Source: https://marriagekidsandmoney.com/boldin-review/

**Weaknesses:** No mobile app; doesn't manage investments (planning only); free tier withholds Monte Carlo, detailed taxes, and (per one review) **locks default rates** and shows pessimistic scenarios with fewer controls than paid — some reviewers say this "scares" users into paying. Sources: https://thecollegeinvestor.com/33680/newretirement-review/ · https://www.moneydigest.com/2139366/retirement-planning-apps-ranked-worst-to-best/ · https://www.monteclimb.com/blog/retirement-planning-software-comparison

**What users complain about:**
- Price hikes: $120→$144 (2025) →$168 (Oct 2026) drew criticism in White Coat Investor comment threads. https://hudsonweekly.com/retirement-planning-software-goes-free-the-adviser-sends-a-flat-fee-bill/
- A detailed Bogleheads comparison (Boldin vs. Pralana) rated Boldin a "B": misses Pralana's detailed spreadsheets that make the "black magic" inspectable, and its Roth Conversion Explorer was "a bit too aggressive in pushing large conversions in the first couple years." https://www.bogleheads.org/forum/viewtopic.php?t=457003
- General "garbage in, garbage out" skepticism: identical inputs produce noticeably different success scores across tools due to different simulation methods. https://www.tigerdroppings.com/rant/money/does-anyone-here-use-the-retirement-planning-tool-boldin/121779565/ · https://www.boldin.com/retirement/boldin-vs-projectionlab/
- One reviewer (early-retirement.org, via monteclimb) reported NewRetirement "locked its default rates on the free tier." https://www.monteclimb.com/blog/retirement-planning-software-comparison
- Users who tried several tools note they "give different results and recommendations due to different default assumptions" — a trust issue when assumptions are buried. https://www.tigerdroppings.com/rant/money/does-anyone-here-use-the-retirement-planning-tool-boldin/121779565/
- Reviewers flag known quirks in current-year tax math — "treat it as a planning tool, not a filing tool." https://rankite.com/blog/best-tax-planning-software

**Explaining results to non-experts:** Guardrails do the heavy lifting (80%/95%/70% mapped to "safe target / too conservative / early warning" with in-plain-English definitions); the help center defines Chance of Success as "probability of the plan not running out of money by end of plan" based on 1,000 trials; their own onboarding content coaches users that "aiming for 99% may keep you working years longer" and 80% "still provides confidence" — i.e., they actively teach that sub-100% scores are normal and fixable. Sources: https://help.boldin.com/en/articles/12571086-new-feature-spending-guardrails-insight · https://youtubetotranscript.com/transcript?v=B2-Om4STXQM
- **Takeaway for a node-based cash-flow planner:** Boldin's guardrails are the clearest model for turning MC
   output into a *decision UI* — safe target + warning bands derived from probability thresholds. Their explicit
   published defaults (8.08% / 2.54%) are also the template for assumption transparency.

## 3. Analog Capital

**What it does:** A new (2026-era) SEC-registered investment adviser, **Analog Capital AI, LLC (CRD# 339783)**, offering retirement/tax/estate planning software at analogcapital.ai. Pitch: "Planning that starts with a conversation, not a form" — you describe your household in ~10 minutes by voice or text, and the platform builds a plan across retirement, tax, insurance, and estate, kept current as circumstances change; optional hourly CFP/CPA engagement, no minimums. Sources: https://analogcapital.ai/welcome.html · https://dev.analogcapital.ai/support.html
- **Name-confusion warning (verified):** several similarly-named but unrelated firms exist — "Analog Capital Partners" (CRD# 309636, a Houston fee-only advisory firm led by Billy Desai, using RightCapital software) and "Analog Capital" (a Southeast Asian multi-family office). None of these is the analogcapital.ai software product. Sources: https://indyfin.com/financial-advisor/texas/houston/billy-desai-4087988/ · https://altss.com/profile/analog-capital

**How it presents Monte Carlo / probabilistic outputs:**
- **1,000 simulated market paths** ("a Monte Carlo analysis") behind every number; differentiators vs. competitors: federal **and state tax computed in every year of every path**, lifespans **drawn from government life tables and varied per path** (income stops, survivor benefit begins, taxes change with it), insurance coverage and estate documents carried through. Source: https://analogcapital.ai/welcome.html
- Their "Why Analog" page frames the answer not as a score but as **solved numbers**: "we solve for your numbers — the most you can spend each month, and the earliest you can stop working" — and emphasizes **traceability**: "every number traceable back to the assumption and the transaction that produced it... open any figure to that year's tax form — every rule applied, what each one was worth in dollars, and the transactions that triggered it." Source: https://dev.analogcapital.ai/why-analog.html
- No fan charts, percentile bands, or "chance of success" percentages are described on their public pages
   **(UNVERIFIED — these pages describe outputs only in prose)**.
- Granularity pitch: mortgages amortized on real terms (payoff date, interest deduction), stock grants vested on their own calendar taxed the year they vest, retirement accounts with contribution limits/employer match/RMDs, and a mobile app with "the same what-if dials and the same assistant." Source: https://dev.analogcapital.ai/why-analog.html
- Their "six questions to ask any planning tool" checklist is itself a positioning device — lead question: "Does it solve for your answer — how much you can spend, how early you can stop — or just score the plan you typed in?" Source: https://dev.analogcapital.ai/why-analog.html

**Pricing: UNVERIFIED / not publicly listed.** No pricing page or prices appear on the site or in search results.
The site says plans can be built "on your own" or with hourly CFP/CPA help with "no minimums" — no dollar figures
found. (UNVERIFIED)

**Strengths (from their own positioning; no independent reviews exist):** tax realism (per-path, per-year tax computation), variable lifespans from mortality tables, conversation-based onboarding instead of a 200-field form, full assumption traceability down to simulated tax-form lines, an assistant that "works on the plan itself — models the change, saves both futures side by side." Source: https://dev.analogcapital.ai/why-analog.html

**Weaknesses: UNVERIFIED from independent sources.** Objectively: brand-new (© 2026), zero third-party reviews or
user complaints found in this research; thin public footprint (marketing site + dev site); "SEC-registered" does
not imply verified planning quality. Their demo pages carry prominent "fictional data / not advice" disclaimers.

**What users complain about:** None found — product too new for Reddit/reviews coverage. **(UNVERIFIED / no
evidence)**
- Operational notes from their own site: live phone support M–F 9am–6pm ET, mobile apps on App Store/Google
   Play, data encrypted in transit and at rest, "never sold." Support FAQ covers plan updates via forwarded
   brokerage statements. Sources: https://dev.analogcapital.ai/support.html · https://analogcapital.ai/welcome.html

**Explaining results to non-experts:** Heavy disclaimers site-wide: "for informational and educational purposes only... not intended to constitute personalized investment, tax, legal, or financial advice... projections... based on user-provided data and a set of underlying assumptions that may not reflect actual market conditions, tax laws, or future outcomes." The transparency play is traceability: any number expands to the assumptions and transactions behind it. Source: https://analogcapital.ai/welcome.html · https://dev.analogcapital.ai/why-analog.html
- **Takeaway for a node-based cash-flow planner:** Analog is the best articulation of the "drill into any number"
   philosophy — each node could surface the assumption + transactions behind its computed values, with the
   per-path tax detail as inspiration for a node showing its contribution to the whole plan.

## Cross-cutting notes: how the three present uncertainty

1. **All three converge on the same core statistic** — a single headline probability (ProjectionLab: "Chance of
    Success"; Boldin: "Chance of Success"; Analog: "1,000 simulated market paths behind every number," framed as
    solved answers instead of a score). Nobody ships raw Monte Carlo math to the user.
2. **But the interpretation layer differs sharply.** ProjectionLab gives you rich exploratory visuals (fan charts,
    percentile distributions, per-trial drill-down) and leaves interpretation to you — the most "lab-like." Boldin
    adds a **decision layer**: guardrails map 80/95/70% bands to "spend more / hold steady / pull back" guidance.
    Analog's bet is **traceability**: every figure expands down to its assumptions and simulated tax form, plus a
    conversational assistant that models changes for you.
3. **Presentation primitives observed:** chance-of-success % (all), fan/uncertainty bands (ProjectionLab),
    percentile milestones with IQR (ProjectionLab), historical backtest pass/fail table by start year
    (ProjectionLab), Sankey cash-flow diagrams (ProjectionLab, Boldin), guardrail bands on spending (Boldin),
    per-year tax arcs across all paths (Analog).
4. **Transparency patterns:** all publish methodology explainers or help-center articles; all warn that a sub-100%
    score is not failure (ProjectionLab: "85% ≠ 15% chance of going broke"; Boldin: 80% is the *target*, not a
    C-grade); all flag assumptions as the real lever. Boldin's help center even publishes its default assumptions
    (8.08% return / 2.54% inflation) — the most concrete disclosure found.
5. **Trust landmines to avoid:** free tiers that withhold the probability engine (Boldin) or saved plans
    (ProjectionLab) feel like bait; free-tier pessimistic defaults (Boldin) read as upsell pressure; differing
    scores from identical inputs (all) erode trust when assumptions are opaque; price-hike history for all paid
    products is a complaint vector.
6. **The "solved vs. scored" spectrum:** ProjectionLab scores the plan you typed in and hands you tools to improve
    it; Boldin scores it *and* solves for a safe spending level; Analog skips the score and goes straight to
    solved numbers (max spend, earliest retirement). For a node-based planner, the solve-direction (what *could*
    this node be?) is arguably the most compelling framing — users want answers, not grades.
7. **Every incumbent's MC visualization is read-only-at-scale:** thousands of paths collapse to one score plus
    bands. A node-based tool has a natural advantage here — per-node distributions, per-path money flow through
    the node graph, and "which node breaks this path" diagnostics are things none of the three offer in their
    current form.
8. **Pricing placement of the MC engine is the sharpest product differentiator observed:** ProjectionLab gives
    Monte Carlo + backtesting away free (monetizing tax tools and saved plans); Boldin puts Monte Carlo behind
    the $168 paywall (monetizing the "real" analysis). For a new entrant, ProjectionLab's approach suggests the
    probability engine itself is a trust-building free tier, while the monetizable layer is depth (taxes,
    scenarios, reports).
9. **Trial counts are converging on 1,000–2,000** (Boldin 1,000; Analog 1,000; ProjectionLab up to 2,000; Empower
    cited at 5,000 by Boldin's own comparison page) — "1,000 simulated market paths" has become the category's
    standard marketing claim, so differentiation comes from what the sim *includes* (per-path taxes, variable
    lifespans) rather than the raw count. Source: https://www.boldin.com/retirement/boldin-vs-empower/
