/**
 * canvas/cardStatus.ts — live computed values shown on node cards
 * (DESIGN.md §4 "status overlays"). All values derive from the engine;
 * nothing is invented: unwired splits show percentages only, debts with no
 * valid amortization show no payoff date.
 *
 * A status is two things at once: `primary`/`secondary` are the one-line
 * summary the list view and screen-reader labels still use, and `chunks`
 * are the same facts split into labelled rows the node card renders —
 * one fact per row, label on the left, value on the right, instead of a
 * run-on paragraph joined by middots.
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

/** One labelled fact on a node card. */
export interface StatChunk {
  label: string;
  value: string;
}

export interface CardStatus {
  primary: string;
  secondary?: string;
  chunks: StatChunk[];
  /** A muted one-line note under the chunks (e.g. an unwired split). */
  note?: string;
}

export function cardStatus(graph: PlanGraph, node: PlanNode): CardStatus {
  const today = todayISO();
  switch (node.type) {
    case 'startingBalance':
      return {
        primary: formatMoney(node.balanceCents),
        secondary: `as of ${formatDateShort(node.asOf)}`,
        chunks: [
          { label: 'Balance', value: formatMoney(node.balanceCents) },
          { label: 'As of', value: formatDateShort(node.asOf) },
        ],
      };
    case 'income': {
      const next = nextOccurrenceDate(node.recurrence, today);
      return {
        primary: `${formatMoney(node.amountCents)} · ${describeFrequency(node.recurrence).split(' · ')[0]}`,
        secondary: next ? `next: ${formatDateShort(next)}` : 'no upcoming dates',
        chunks: [
          { label: 'Amount', value: formatMoney(node.amountCents) },
          { label: 'Every', value: describeFrequency(node.recurrence).split(' · ')[0] },
          { label: 'Next', value: next ? formatDateShort(next) : 'No upcoming dates' },
        ],
      };
    }
    case 'expense': {
      const next = nextOccurrenceDate(node.recurrence, today);
      return {
        primary: `${formatMoney(node.amountCents)} · ${describeFrequency(node.recurrence).split(' · ')[0]}`,
        secondary: next ? `due: ${formatDateShort(next)}` : 'no upcoming dates',
        chunks: [
          { label: 'Amount', value: formatMoney(node.amountCents) },
          { label: 'Every', value: describeFrequency(node.recurrence).split(' · ')[0] },
          { label: 'Due', value: next ? formatDateShort(next) : 'No upcoming dates' },
        ],
      };
    }
    case 'variableAmount': {
      const next = nextOccurrenceDate(node.recurrence, today);
      const dir = node.direction === 'income' ? 'in' : 'out';
      return {
        primary: `${dir} · min ${formatMoney(node.minCents)} · typ ${formatMoney(node.typicalCents)} · max ${formatMoney(node.maxCents)}`,
        secondary: next ? `next: ${formatDateShort(next)}` : 'no upcoming dates',
        chunks: [
          { label: 'Direction', value: node.direction === 'income' ? 'Money in' : 'Money out' },
          { label: 'Minimum', value: formatMoney(node.minCents) },
          { label: 'Typical', value: formatMoney(node.typicalCents) },
          { label: 'Maximum', value: formatMoney(node.maxCents) },
          { label: 'Next', value: next ? formatDateShort(next) : 'No upcoming dates' },
        ],
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
        chunks: preview.map((o) => ({
          label: o.label,
          value: wired ? `${o.percent}% · ${formatMoney(o.amountCents)}` : `${o.percent}%`,
        })),
        note: wired ? undefined : 'Nothing wired in yet',
      };
    }
    case 'prioritySplit': {
      const ordered = [...node.outputs].sort((a, b) => a.priority - b.priority);
      return {
        primary: ordered.map((o) => `${o.priority}. ${o.label}${o.capCents ? ` ≤ ${formatMoney(o.capCents)}` : ''}`).join(' · '),
        chunks: ordered.map((o) => ({
          label: `${o.priority}. ${o.label}`,
          value: o.capCents ? `Up to ${formatMoney(o.capCents)}` : 'No cap',
        })),
      };
    }
    case 'conditional':
      return {
        primary: `if balance ${node.predicate.op === 'gt' ? '>' : '<'} ${formatMoney(node.predicate.thresholdCents)}`,
        secondary: `${node.trueLabel} / ${node.falseLabel}`,
        chunks: [
          { label: 'If balance', value: `${node.predicate.op === 'gt' ? '>' : '<'} ${formatMoney(node.predicate.thresholdCents)}` },
          { label: 'When true', value: node.trueLabel },
          { label: 'When false', value: node.falseLabel },
        ],
      };
    case 'goal':
      return {
        primary: `${formatMoney(node.targetCents)} target`,
        secondary: `by ${formatDateShort(node.targetDate)}`,
        chunks: [
          { label: 'Target', value: formatMoney(node.targetCents) },
          { label: 'By', value: formatDateShort(node.targetDate) },
        ],
      };
    case 'debt': {
      const payoff = projectDebtPayoff(node, today);
      return {
        primary: `${formatMoney(node.balanceCents)} · ${(node.aprBps / 100).toFixed(2)}% APR`,
        secondary: payoff ? `payoff ~${formatDateShort(payoff.payoffDate)}` : 'min payment never clears it',
        chunks: [
          { label: 'Balance owed', value: formatMoney(node.balanceCents) },
          { label: 'APR', value: `${(node.aprBps / 100).toFixed(2)}%` },
          { label: 'Payoff', value: payoff ? `~${formatDateShort(payoff.payoffDate)}` : 'Min payment never clears it' },
        ],
      };
    }
  }
}
