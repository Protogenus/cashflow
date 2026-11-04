/**
 * alerts.ts — user-creatable alert rules evaluated against the deterministic
 * forecast (pure, no framework imports).
 *
 * Rule types:
 *   balanceBelow — warn when the projected balance drops under a threshold
 *   billCoverage  — warn when a bill over $X can't be covered by the day's
 *                   opening balance
 *   paydayGap     — warn when the gap between consecutive income events
 *                   exceeds N days
 *   goalOffTrack  — warn when a goal is projected to miss its target by date
 *
 * Each rule evaluates to a TriggeredAlert with the firing dates and a
 * plain-language explanation naming the driving bills/dates (driver
 * detection is reused from explain.ts — the same analysis the forecast
 * itself uses, so alerts and explanations never disagree).
 */
import { daysBetween, parseISODate, toLocalDate } from './dates';
import { findDrivers } from './explain';
import { forecast } from './forecast';
import type {
  Assumptions,
  Cents,
  Driver,
  ForecastResult,
  ISODate,
  LedgerDay,
  NodeId,
  PlanGraph,
} from './types';

export type AlertRuleType = 'balanceBelow' | 'billCoverage' | 'paydayGap' | 'goalOffTrack';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRuleParams {
  /** balanceBelow: fire when end-of-day balance is under this. */
  thresholdCents?: Cents;
  /** billCoverage: only consider bills at or above this amount. */
  minAmountCents?: Cents;
  /** paydayGap: fire when the gap between income events exceeds this many days. */
  maxGapDays?: number;
}

export interface AlertRule {
  id: string;
  name: string;
  type: AlertRuleType;
  params: AlertRuleParams;
  severity: AlertSeverity;
  enabled: boolean;
}

export interface TriggeredAlert {
  ruleId: string;
  ruleName: string;
  ruleType: AlertRuleType;
  severity: AlertSeverity;
  /** Every day the rule fires, ascending. */
  dates: ISODate[];
  /** Plain-language explanation naming the driving bills/dates. */
  explanation: string;
}

/** Sort order for the UI: critical first, then by earliest firing date. */
export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export interface EvaluateAlertsOptions {
  /** Same scenario-toggle semantics as forecast(). */
  disabledNodeIds?: NodeId[];
}

/** Sensible defaults, created alongside the starter graph (editable, deletable). */
export const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'rule_balance_below_zero',
    name: 'Balance below $0',
    type: 'balanceBelow',
    params: { thresholdCents: 0 },
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'rule_balance_below_buffer',
    name: 'Balance below $500 buffer',
    type: 'balanceBelow',
    params: { thresholdCents: 50000 },
    severity: 'warning',
    enabled: true,
  },
];

// ---------- small pure formatters (engine-local, same style as optimize.ts) ----------

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

function money(c: Cents): string {
  const sign = c < 0 ? '−' : '';
  return `${sign}$${fmtInt(Math.round(Math.abs(c) / 100))}`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function shortDate(iso: ISODate): string {
  const { m, d } = parseISODate(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

function driverNames(drivers: Driver[]): string {
  return drivers.map((d) => d.name).join(', ');
}

// ---------- rule evaluators ----------

/** balanceBelow: every ledger day with end-of-day balance under the threshold. */
function evalBalanceBelow(
  rule: AlertRule,
  result: ForecastResult,
): TriggeredAlert | null {
  const threshold = rule.params.thresholdCents ?? 0;
  const hit = result.ledger.filter((day) => day.balanceCents < threshold);
  if (hit.length === 0) return null;

  const dates = hit.map((d) => d.date);
  const worst = hit.reduce((a, b) => (b.balanceCents < a.balanceCents ? b : a));
  const drivers = findDrivers(result.ledger, worst.date);
  const driverText =
    drivers.length > 0
      ? ` Driven by ${driverNames(drivers)} (${shortDate(worst.date)} ± 7 days).`
      : '';

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.type,
    severity: rule.severity,
    dates,
    explanation:
      `Projected balance drops below ${money(threshold)} on ${dates.length} ` +
      `day${dates.length === 1 ? '' : 's'}, reaching ${money(worst.balanceCents)} on ` +
      `${shortDate(worst.date)}.${driverText}`,
  };
}

/**
 * billCoverage: a bill is "covered" when the day's opening balance is at
 * least the bill amount. Only bills at or above params.minAmountCents are
 * considered (defaults to $1 — every bill).
 */
function evalBillCoverage(
  rule: AlertRule,
  graph: PlanGraph,
  result: ForecastResult,
): TriggeredAlert | null {
  const minAmount = Math.abs(rule.params.minAmountCents ?? 100);

  const openingOf = (idx: number): Cents => {
    if (idx === 0) {
      const bal = graph.nodes.find((n) => n.type === 'startingBalance');
      return bal?.type === 'startingBalance' ? bal.balanceCents : 0;
    }
    return result.ledger[idx - 1].balanceCents;
  };

  // day index -> the bills on that day the opening balance can't cover
  const missed = new Map<number, { name: string; amountCents: Cents }[]>();
  result.ledger.forEach((day: LedgerDay, idx: number) => {
    const opening = openingOf(idx);
    for (const ev of day.events) {
      if (ev.kind !== 'expense') continue;
      const amount = Math.abs(ev.amountCents);
      if (amount < minAmount) continue;
      if (opening < amount) {
        const list = missed.get(idx) ?? [];
        list.push({ name: ev.name, amountCents: amount });
        missed.set(idx, list);
      }
    }
  });
  if (missed.size === 0) return null;

  const dates = [...missed.keys()].sort((a, b) => a - b).map((i) => result.ledger[i].date);
  const examples = [...missed.entries()]
    .slice(0, 3)
    .map(([i, bills]) => {
      const opening = openingOf(i);
      const billText = bills
        .map((b) => `${b.name} (${money(b.amountCents)})`)
        .join(', ');
      return `${shortDate(result.ledger[i].date)}: ${billText} vs opening balance ${money(opening)}`;
    })
    .join('; ');
  const more = missed.size > 3 ? ` (+${missed.size - 3} more)` : '';

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.type,
    severity: rule.severity,
    dates,
    explanation:
      `${missed.size} bill${missed.size === 1 ? '' : 's'} over ${money(minAmount)} ` +
      `can't be covered by the day's opening balance: ${examples}${more}.`,
  };
}

/**
 * paydayGap: fire when the gap between two consecutive income events exceeds
 * maxGapDays (default 21). The firing date is the later payday of each gap.
 */
function evalPaydayGap(
  rule: AlertRule,
  result: ForecastResult,
): TriggeredAlert | null {
  const maxGap = rule.params.maxGapDays ?? 21;

  const incomeDates: ISODate[] = [];
  for (const day of result.ledger) {
    if (day.events.some((ev) => ev.kind === 'income')) incomeDates.push(day.date);
  }
  if (incomeDates.length < 2) return null;

  const gaps: { from: ISODate; to: ISODate; days: number }[] = [];
  for (let i = 1; i < incomeDates.length; i++) {
    const days = daysBetween(
      toLocalDate(parseISODate(incomeDates[i - 1])),
      toLocalDate(parseISODate(incomeDates[i])),
    );
    if (days > maxGap) gaps.push({ from: incomeDates[i - 1], to: incomeDates[i], days });
  }
  if (gaps.length === 0) return null;

  const dates = gaps.map((g) => g.to);
  const detail = gaps
    .map((g) => `${g.days} days between ${shortDate(g.from)} and ${shortDate(g.to)}`)
    .join('; ');

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.type,
    severity: rule.severity,
    dates,
    explanation:
      `${gaps.length} income gap${gaps.length === 1 ? '' : 's'} longer than ${maxGap} days: ` +
      `${detail}. Bills landing in the gap are paid from the opening balance alone.`,
  };
}

/** goalOffTrack: fire for every goal projected to miss its target (shortfall > 0). */
function evalGoalOffTrack(
  rule: AlertRule,
  result: ForecastResult,
): TriggeredAlert | null {
  const missed = result.goals.filter((g) => g.shortfallAtTargetCents > 0);
  if (missed.length === 0) return null;

  const dates = missed.map((g) => g.targetDate).sort();
  const detail = missed
    .map(
      (g) =>
        `${g.name}: ${money(g.savedCents)} saved toward ${money(g.targetCents)} by ` +
        `${shortDate(g.targetDate)} — ${money(g.shortfallAtTargetCents)} short`,
    )
    .join('; ');

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.type,
    severity: rule.severity,
    dates,
    explanation: `Projected to miss: ${detail}, based on the current splits and income schedule.`,
  };
}

const EVALUATORS: Record<AlertRuleType, (rule: AlertRule, graph: PlanGraph, result: ForecastResult) => TriggeredAlert | null> = {
  balanceBelow: (rule, _graph, result) => evalBalanceBelow(rule, result),
  billCoverage: (rule, graph, result) => evalBillCoverage(rule, graph, result),
  paydayGap: (rule, _graph, result) => evalPaydayGap(rule, result),
  goalOffTrack: (rule, _graph, result) => evalGoalOffTrack(rule, result),
};

/**
 * Evaluate all enabled rules against one deterministic forecast of the
 * graph. Rules are cheap (one shared forecast); results are deterministic.
 */
export function evaluateAlerts(
  graph: PlanGraph,
  assumptions: Assumptions,
  rules: AlertRule[],
  opts: EvaluateAlertsOptions = {},
): TriggeredAlert[] {
  const active = rules.filter((r) => r.enabled);
  if (active.length === 0) return [];

  const result = forecast(graph, assumptions, { disabledNodeIds: opts.disabledNodeIds });
  const out: TriggeredAlert[] = [];
  for (const rule of active) {
    const hit = EVALUATORS[rule.type](rule, graph, result);
    if (hit) out.push(hit);
  }
  return out.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''),
  );
}

/** Validate rule parameters; returns human-readable problems (empty = OK). */
export function validateRule(rule: AlertRule): string[] {
  const problems: string[] = [];
  if (!rule.name.trim()) problems.push('Rule needs a name.');
  switch (rule.type) {
    case 'balanceBelow':
      if (rule.params.thresholdCents == null || Number.isNaN(rule.params.thresholdCents)) {
        problems.push('Balance threshold must be a number of cents.');
      }
      break;
    case 'billCoverage':
      if (rule.params.minAmountCents == null || rule.params.minAmountCents < 100) {
        problems.push('Bill amount floor must be at least $1.');
      }
      break;
    case 'paydayGap':
      if (rule.params.maxGapDays == null || rule.params.maxGapDays < 1) {
        problems.push('Max gap must be at least 1 day.');
      }
      break;
    case 'goalOffTrack':
      break;
  }
  return problems;
}
