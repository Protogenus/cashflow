# Part B: Niche Cash-Flow Forecasting Apps

Research date: 2026-11-03. All claims cite a source URL fetched via text search/open (no live browser). Unverifiable claims are marked UNVERIFIED. These apps are all small/obscure; independent user reviews are essentially nonexistent.

## Recurna Flow

**What it does:** Canadian-built personal cash-flow forecasting with the tagline "Test the future before you live it." It answers "Am I going to be OK in three months?" with week-by-week balance projections, deliberately manual-first so no bank credentials leave the user. Currently an invite-only beta (applications reviewed weekly). (https://www.recurna.ca/)

**Core UX approach:** You "anchor" each recurring transaction once (rent, payday, hydro bill) and the engine projects it forward — week by week, not as a monthly average, so you see the actual week three bills land together. A 52-week table shows weekly change and closing balance; a chart overlays a "simulated" future as a dashed line against the solid planned line. The homepage demo lets you "move one thing and watch the year redraw" with the original projection staying put as a dashed baseline for comparison. (https://www.recurna.ca/)

**Pricing (verified, CAD):** Free $0 forever (12 weeks ahead, one account, household sharing, what-if sandbox "test changes live", CSV+JSON export); Pro $8/mo or $72/year (save 25%) — unlimited horizon ("as far as your money carries"), every account, saveable/compareable what-ifs, AI connector, priority founder support. Founding beta members get Pro free for a year, then $6/mo locked for two more. (https://www.recurna.ca/)

**Scenario / what-if features:** Yes, and it's the headline differentiator. The what-if sandbox lets you toggle a change and see the year redraw; Pro adds saved scenarios ("keep them: save, compare, make it real"). A Pro "AI connector" lets you ask questions in your own words via Claude — "We run the real math" — with per-question data consent and no data sent to an AI vendor. Projected-vs-realized comparison over time on both plans. (https://www.recurna.ca/)

**Strengths:** Week-level granularity (the "on budget for the month but overdraft on a Tuesday" framing); manual-first privacy stance (transaction data "never reaches a US aggregator"); household sharing free on every plan with two logins, one shared forecast; full CSV/JSON export on the free tier ("what if I commit and the app dies" handled); positioned explicitly against YNAB/Monarch/Copilot as cheaper ($8 vs ~$20 CAD) and forward-looking rather than backward-tracking. (https://www.recurna.ca/)

**Weaknesses:** No bank sync at launch — explicitly "a Pro roadmap item, not a missing piece," so ~10 min/week of manual reconciliation is the cost; invite-only beta (can't just sign up); horizon limited to 12 weeks on free; small single-founder operation (founder runs his own year in it weekly; support is "replies from the founder"). (https://www.recurna.ca/)

**What users complain about:** No public user reviews, Reddit threads, or Product Hunt/App Store listings could be found — it is still in beta, so there is no meaningful complaint corpus. UNVERIFIED whether beta users' reactions are positive.

## ForeCash

The name is heavily overloaded — at least four distinct products use it. Disambiguated below.

### ForeCash (fore-cash.io) — personal forecaster, PWA

**What it does:** Personal cash-flow forecasting app ("Know Your Money Before It Hits") that shows your exact bank balance on any future date, built as a Progressive Web App on Supabase with optional Plaid bank sync. Appears to have hackathon origins (listed on Devpost). (https://www.fore-cash.io/; https://devpost.com/software/newest?page=23704&utf8=%E2%9C%93)

**Core UX approach:** Three steps — add accounts (bank connect or manual), plan recurring income/expenses (spreadsheet import or one-by-one), then see the forecast. Centerpiece is a "cash flow calendar" with every paycheck/bill on its day and a running balance on every cell so you can spot the lowest point of the month weeks early. Recurring transactions are grouped by frequency: "edit one row, watch every future date update instantly." (https://www.fore-cash.io/)

**Pricing (verified, USD):** Pro $9.99/mo (unlimited manual accounts, bank sync up to 2 connections, automatic balance sync, 10-year forecast horizon, scenario planning, goals & life events, +$1.99/mo per extra connection); Family $14.99/mo (everything in Pro, up to 5 members, up to 10 bank connections, shared accounts & goals, premium reports, priority support). Every plan has a 7-day free trial, no credit card. (https://www.fore-cash.io/)

**Scenario / what-if features:** Yes — "Scenario Planning: What if you got a raise? What if you moved? Create scenarios and compare your financial futures." Also balance alerts ("get warned before your balance goes negative"). (https://www.fore-cash.io/)

**Strengths:** Plaid bank sync on paid plans (Recurna's missing piece), generous 10-year forecast horizon, CSV/Excel import, family/household plan, PWA = installable on iPhone/Android without app stores, transparent calculation claims ("we show you exactly what goes into every calculation"). (https://www.fore-cash.io/)

**Weaknesses:** PWA only — dedicated native iOS/Android app is still "on our roadmap"; no free tier, only a 7-day trial; bank sync caps are low (2 connections on Pro, extras cost per-connection); no public evidence of traction — UNVERIFIED how many users it has. (https://www.fore-cash.io/)

**What users complain about:** None found — no Reddit, Product Hunt, or app-store review corpus for this product. (Note: Freecash.com "scam" reviews on ProductReview.com.au and ForeCash Golf are unrelated products with similar names.)

### Forecash (forecash.io) — interactive scenario graph app

**What it does:** A personal financial-planner app whose origin story is two people making spreadsheets to survive paycheck-to-paycheck student-loan payments — "when you're working close to a zero balance, *when* you pay is just as important as *how much*." It draws a projection graph "from today, drawing every day into the future." (https://forecash.io/; https://forecash.io/about)

**Core UX approach:** The centerpiece is an interactive forecasting graph: you can add items to the projection and *drag expenses around* to reschedule them, watching the graph update live to see how decisions change your financial outlook — "this is the core of Forecash; it empowers you to experiment with the future." Ballpark estimates are fine to start; if the projection gets close to zero it shows you when. (https://forecash.io/)

**Pricing:** UNVERIFIED — the landing page only says "Try for yourself below by signing up for a free trial." No prices published on the public page. (https://forecash.io/)

**Scenario / what-if features:** Yes — the strongest of any product surveyed. "Multiple Scenario Planning: Should you rent or buy an apartment? Invest in a retirement account? Pay off a student loan? ... If you decide to pay the loan off, how? Do you put in a big chunk now, refinance, or both? Forecash is designed to help you test and compare." Plus embedded "automatic calculators" showing total interest per loan strategy in every scenario. (https://forecash.io/)

**Strengths:** Most scenario-centric design in the set (drag-to-reschedule on the graph is the standout interaction); automatic loan/tradeoff calculators embedded in scenarios; origin story matches the paycheck-to-paycheck use case exactly. (https://forecash.io/)

**Weaknesses:** UNVERIFIED pricing and whether the app is actively maintained (page copy mentions "admittedly still iterating and learning from our users"); no mention of bank sync or mobile apps; drag-the-graph UX is powerful but potentially fiddly on small screens — UNVERIFIED. (https://forecash.io/)

**What users complain about:** None found — no public reviews located.

### foreCASH (forecash.software) — UK B2B SME software (different market)

**What it does:** A long-standing UK specialist cash-flow forecasting product for businesses (self-employed up to multi-company groups), originally positioned as a replacement for Sage 50 Financial Forecasting / Winforecast. It is a **Windows desktop app** ("does not run on Apple MACs") with monthly P&L, balance sheet, funds-flow reports, and monthly/weekly/daily cash-flow views with drill-down. (https://forecash.software/fcSpec.aspx; https://www.accountingweb.co.uk/business/management-accounting/were-going-to-replace-winforecast)

**Core UX approach:** Import opening ledgers from your accounting system, then model payments/receipts with drag-and-drop rescheduling (right-click to defer a payment when cash is strained), variance analysis vs actuals, invoice-finance facility modeling, and sector-specific editions (wholesalers, retail, manufacturing, project-based companies with staged payments). (https://forecash.software/fcScreenshots.aspx; http://forecash.software/FAQ.aspx)

**Pricing (verified, GBP):** foreCASH Lite from £35/mo or £495 outright; full foreCASH from £60/mo or £1,000 outright; setup/training £40/mo or £950; 28-day free trial, no card. Also sells a done-for-you forecasting service from £2,000 setup. (https://forecash.software/forecasting.aspx; http://forecash.software/FAQ.aspx)

**Scenario / what-if features:** Yes — scenario comparisons including cash-strain management ("plan a solution" by rescheduling via drag-drop, tracking the status/amount of changes), multi-currency, and stress-tested variants for banks. (https://forecash.software/forecasting.aspx)

**Strengths:** Deep specialist tooling (invoice discounting, stock finance, CIS deductions, project stage cascade); mature product with professional-services revenue; free 28-day trial with no card. **Weaknesses:** Windows-only desktop software with an early-2000s UX; SMB accounting niche, irrelevant to personal use; pricing opaque on final numbers (depends on users/companies). (https://forecash.software/fcSpec.aspx)

**What users complain about:** None found — enterprise/SME tools rarely review publicly; no Reddit or review-site corpus located.

### Related name-alikes worth one line

- **Forcash iOS app (forcash.io, Elbrus LLC)** — native iPhone/iPad/Watch app; headline metric is a daily "safe to spend" amount; free tier (tracking + 1-month forecast), Premium (3/6/12-month forecasts), Deluxe (24/36-month + goals + retrospectives); bank sync for US/Canada/UK; 5.0/5 from just 7 App Store ratings. (https://www.appbrain.com/appstore/forcash/ios-6738464156)
- **Forecash (forecashapp.com)** — Squarespace marketing site ("simple, powerful way to see where your money is going"); features: transaction importing (manual or bank), lowest/highest balance projections, what-if planning, month-by-month dashboard. Pricing UNVERIFIED; relationship to the other ForeCash products UNVERIFIED. (https://www.forecashapp.com/about)

## CashFlowCast

**What it does:** Small-business cash-flow forecasting ("See your cash crunch 90 days before it hits"). Reads your income/payment patterns from a bank CSV import or manual entry and produces a rolling forecast updated daily, with runway/burn-rate stats, next-low-point identification, and plain-English low-balance alerts. Explicitly *not* bookkeeping — "a forecasting tool, not a bookkeeping or tax service." (https://www.cashflowcast.net/)

**Core UX approach:** "From bank feed to forecast in three moves": import a CSV (no bank connection required — "your data is never used to move money") or enter income/bills by hand → rolling forecast projects balance forward → model decisions (new hire, slow month, big purchase) and compare baseline vs scenarios ($84,210 baseline / $61,900 with new hire / $52,340 slow month in their example). Invoices and bills feed straight into the forecast; multi-entity and multi-currency on the top tier. (https://www.cashflowcast.net/)

**Pricing (verified, USD):** Starter $19/mo (1 account, 90-day rolling forecast, weekly email summary, 1 user); Growth $49/mo (up to 5 accounts, 12-month forecast, **scenario planning (what-if)**, up to 3 team members, invoice & bill tracking); Scale $99/mo (unlimited accounts, multi-entity/multi-currency, unlimited team members, API access, onboarding call). 14-day free trial on every plan, cancel anytime from account settings. (https://www.cashflowcast.net/)

**Scenario / what-if features:** Yes — the Growth-tier centerpiece: "Test your big decisions before you spend a dime... Model it in seconds," plus low-balance "financial smoke detector" notifications giving a 90-day head start. (https://www.cashflowcast.net/)

**Strengths:** Pattern-learning forecast ("learns your actual payment patterns, seasonal or not, instead of assuming a flat monthly average"); no bank-login required (CSV import), which lowers trust friction; clear runway/burn/next-low-point headline metrics; API and multi-entity on Scale; positions against the "spreadsheet trap" and payroll panic with concrete pains. (https://www.cashflowcast.net/)

**Weaknesses:** Scenario planning — arguably the core value prop — is paywalled behind the $49 Growth tier (Starter at $19 lacks it); small-business positioning overlaps with Pulse/Float at higher price discipline, yet brand is tiny; Capterra describes it as *personal* finance software (checking-account forecasting, savings tracker, portfolio tracker) while cashflowcast.net pitches SMB — the positioning appears inconsistent or the listing covers a different/later product; a separate cashflowcast.io sells a personal budget tracker at $24.95/yr, adding to name confusion. (https://www.cashflowcast.net/; https://www.capterra.com/financial-management-software/?page=6; http://cashflowcast.io/cashflowcast.php?Action=1&PageID=536063&k=personal-budget-tracker)

**What users complain about:** Essentially no review corpus — Capterra lists CashFlowCast at 5.0 from exactly 1 review; no Reddit threads or forum complaints located. The lack of independent reviews at these prices is itself a signal of negligible traction. (https://www.capterra.com/financial-management-software/?page=6)

## Cross-cutting notes

1. **Anchored recurring transactions are the universal forecast engine.** Every personal app here works the same way: enter recurring income/expenses once (calendar-event-like), project deterministically forward. Nobody advertises ML/AI forecasting — it's arithmetic, and several say so explicitly ("We run the real math"). A node-based planner can differentiate on *how* projections compose, not the projection itself.
2. **What-if is table stakes, but the interaction depth varies.** Recurna: toggle-a-change with dashed baseline comparison + saveable scenarios. fore-cash.io: scenario creation/comparison. forecash.io: drag expenses directly on the forecast graph (the most tactile what-if UX in the set) + embedded loan-interest calculators. CashFlowCast: baseline-vs-decision scenario overlays. None offer optimization ("find the best schedule") or Monte Carlo-style simulation — that gap is wide open.
3. **Bank sync splits the field.** ForeCash (fore-cash.io) and Forcash iOS sync via Plaid; Recurna and forecash.io are deliberately manual-first (privacy/trust pitch); CashFlowCast does CSV-only. Manual-first is a viable premium position, not just a missing feature.
4. **Week/day granularity is the recurring complaint about incumbents.** Recurna ("overdraft on a Tuesday"), fore-cash.io (per-day calendar cells), and CashFlowCast (daily updates) all attack monthly averages. Any planner must support sub-month resolution.
5. **Name collisions are severe.** "ForeCash" = 4–5 distinct products; "CashFlowCast" = at least 2. For the build: pick a name and check app-store/domain/review-site collisions before committing.
6. **No meaningful complaint corpus exists for any of them.** Recurna is in beta; fore-cash.io and CashFlowCast have ~1 review each; forecash.io and foreCASH have none findable. The honest finding: these are all pre-traction, so user-complaint research will have to come from adjacent categories (YNAB/Monarch/Reddit personal-finance threads) rather than direct competitors.
