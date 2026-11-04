/**
 * canvas/cardStatus.ts — live computed values shown on node cards
 * (DESIGN.md §4 "status overlays"). All values derive from the engine;
 * nothing is invented: unwired splits show percentages only, debts with no
 * valid amortization show no payoff date.
 */
import {
  computeSplitPreview,
  describeFrequency,
  nextOccurrenceDate,
  projectDebtPayoff,
  todayISO,
  type PlanGraph,
  type PlanNode,
} from '../engine';
import { formatDateShort, formatMoney } from '../lib/format';

export interface CardStatus {
  primary: string;
  secondary?: string;
}

export function cardStatus(graph: PlanGraph, node: PlanNode): CardStatus {
  const today = todayISO();
  switch (node.type) {
    case 'startingBalance':
      return { primary: formatMoney(node.balanceCents), secondary: `as of ${formatDateShort(node.asOf)}` };
    case 'income': {
      const next = nextOccurrenceDate(node.recurrence, today);
      return {
        primary: `${formatMoney(node.amountCents)} · ${describeFrequency(node.recurrence).split(' · ')[0]}`,
        secondary: next ? `next: ${formatDateShort(next)}` : 'no upcoming dates',
      };
    }
    case 'expense': {
      const next = nextOccurrenceDate(node.recurrence, today);
      return {
        primary: `${formatMoney(node.amountCents)} · ${describeFrequency(node.recurrence).split(' · ')[0]}`,
        secondary: next ? `due: ${formatDateShort(next)}` : 'no upcoming dates',
      };
    }
    case 'variableAmount': {
      const next = nextOccurrenceDate(node.recurrence, today);
      const dir = node.direction === 'income' ? 'in' : 'out';
      return {
        primary: `${dir} · min ${formatMoney(node.minCents)} · typ ${formatMoney(node.typicalCents)} · max ${formatMoney(node.maxCents)}`,
        secondary: next ? `next: ${formatDateShort(next)}` : 'no upcoming dates',
      };
    }
    case 'percentageSplit': {
      const preview = computeSplitPreview(graph, node.id);
      const wired = preview.some((o) => o.ofAmountCents > 0);
      return {
        primary: node.outputs.map((o) => `${o.percent}% ${o.label}`).join(' · '),
        secondary: wired
          ? preview.map((o) => `${formatMoney(o.amountCents)} → ${o.label}`).join(' · ')
          : 'nothing wired in yet',
      };
    }
    case 'prioritySplit': {
      const ordered = [...node.outputs].sort((a, b) => a.priority - b.priority);
      return {
        primary: ordered.map((o) => `${o.priority}. ${o.label}${o.capCents ? ` ≤ ${formatMoney(o.capCents)}` : ''}`).join(' · '),
      };
    }
    case 'conditional':
      return {
        primary: `if balance ${node.predicate.op === 'gt' ? '>' : '<'} ${formatMoney(node.predicate.thresholdCents)}`,
        secondary: `${node.trueLabel} / ${node.falseLabel}`,
      };
    case 'goal':
      return {
        primary: `${formatMoney(node.targetCents)} target`,
        secondary: `by ${formatDateShort(node.targetDate)}`,
      };
    case 'debt': {
      const payoff = projectDebtPayoff(node, today);
      return {
        primary: `${formatMoney(node.balanceCents)} · ${(node.aprBps / 100).toFixed(2)}% APR`,
        secondary: payoff ? `payoff ~${formatDateShort(payoff.payoffDate)}` : 'min payment never clears it',
      };
    }
  }
}
