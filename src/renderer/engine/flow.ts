/**
 * engine/flow.ts — timelapse frames for the canvas "money flow" playback.
 *
 * Pure and framework-free. Replays the deterministic forecast walk and turns
 * each day's ledger events into *visual* transfers: which graph edges carried
 * money that day, which nodes fired, and a one-line human summary. The canvas
 * highlights those edges/nodes frame by frame, so split routing can be
 * watched — and troubleshot — day by day.
 *
 * Faithfulness rule: frames are derived from the same walk the forecast
 * chart uses (forecast() + buildAllocationPlan()). Anything the walk doesn't
 * route (priority splits, conditionals — see the UI note) doesn't appear.
 */
import {
  buildAllocationPlan,
  divideEqually,
  forecast,
  splitShares,
  validateGraph,
  type AllocationPlan,
} from './forecast';
import type {
  Assumptions,
  Cents,
  ISODate,
  LedgerEvent,
  NodeId,
  PlanEdge,
  PlanGraph,
} from './types';

/** Local money formatter ($1,850) — the engine never touches the settings store. */
function money(cents: Cents): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const d = Math.floor(abs / 100);
  const r = abs % 100;
  const grouped = d.toLocaleString('en-US');
  return r === 0 ? `${sign}$${grouped}` : `${sign}$${grouped}.${String(r).padStart(2, '0')}`;
}

export interface FlowTransfer {
  fromId: NodeId;
  toId: NodeId;
  /** Graph edge ids to light up (empty when the money has no drawn edge). */
  edgeIds: string[];
  amountCents: Cents;
  /** Short label, e.g. "80% → Bills". */
  label: string;
}

export interface FlowPulse {
  nodeId: NodeId;
  /** Signed amount for the floating chip (+income, −expense, balance level). */
  amountCents: Cents;
  kind: 'income' | 'expense' | 'split' | 'balance' | 'outflow';
  /** Extra line under the chip, e.g. "$370 kept in balance". */
  note?: string;
}

export interface FlowFrame {
  date: ISODate;
  balanceCents: Cents;
  pulses: FlowPulse[];
  transfers: FlowTransfer[];
  /** One-line readout, e.g. "Nov 13 — Paycheck +$1,850 → Split; 80% ($1,480) → Bills …". */
  summary: string;
}

export interface FlowOptions {
  /** Days of the forecast to play (default 30, capped at the horizon). */
  windowDays?: number;
  /** Scenario toggle: nodes excluded from the walk (and their edges). */
  disabledNodeIds?: NodeId[];
  /** First simulated day (default: today). Tests pin this for determinism. */
  startDate?: ISODate;
}

function activeGraph(graph: PlanGraph, disabled: Set<NodeId>): PlanGraph {
  if (disabled.size === 0) return graph;
  return {
    nodes: graph.nodes.filter((n) => !disabled.has(n.id)),
    edges: graph.edges.filter((e) => !disabled.has(e.source) && !disabled.has(e.target)),
  };
}

function edgesFrom(
  edges: PlanEdge[],
  source: NodeId,
  target?: NodeId,
  sourceHandle?: string,
): PlanEdge[] {
  return edges.filter(
    (e) =>
      e.source === source &&
      (target === undefined || e.target === target) &&
      (sourceHandle === undefined || e.sourceHandle === sourceHandle),
  );
}

/** Split an income occurrence into visual transfers, mirroring the walk. */
function routeIncome(
  graph: PlanGraph,
  plan: AllocationPlan,
  incomeId: NodeId,
  amountCents: Cents,
  byName: Map<NodeId, string>,
): { transfers: FlowTransfer[]; pulses: FlowPulse[]; bits: string[] } {
  const transfers: FlowTransfer[] = [];
  const pulses: FlowPulse[] = [];
  const bits: string[] = [];
  const incomeName = byName.get(incomeId) ?? 'Income';

  const routed = plan.routedIncome.get(incomeId);
  if (routed) {
    const splitName = byName.get(routed.splitId) ?? 'Split';
    transfers.push({
      fromId: incomeId,
      toId: routed.splitId,
      edgeIds: edgesFrom(graph.edges, incomeId, routed.splitId).map((e) => e.id),
      amountCents,
      label: `${incomeName} → ${splitName}`,
    });
    const shares = splitShares(
      amountCents,
      routed.outputs.map((o) => o.percent),
    );
    let kept = 0;
    routed.outputs.forEach((o, i) => {
      const share = shares[i];
      if (share <= 0) return;
      if (o.sinks.length === 0) {
        kept += share; // unconnected output: the walk leaves it in the balance
        return;
      }
      const perSink = divideEqually(share, o.sinks.length);
      o.sinks.forEach((sink, j) => {
        const amt = perSink[j];
        const edgeIds = edgesFrom(graph.edges, routed.splitId, sink.nodeId, o.outputId).map(
          (e) => e.id,
        );
        transfers.push({
          fromId: routed.splitId,
          toId: sink.nodeId,
          edgeIds,
          amountCents: amt,
          label: `${o.percent}% → ${sink.name}`,
        });
        bits.push(`${o.percent}% (${money(amt)}) → ${sink.name}`);
      });
    });
    if (kept > 0) {
      pulses.push({
        nodeId: routed.splitId,
        amountCents: kept,
        kind: 'split',
        note: `${money(kept)} kept in balance`,
      });
      bits.push(`${money(kept)} kept in balance`);
    }
    bits.unshift(`${incomeName} ${money(amountCents)} → ${splitName}`);
  } else {
    const sinks = plan.directSinks.get(incomeId) ?? [];
    if (sinks.length > 0) {
      const perSink = divideEqually(amountCents, sinks.length);
      sinks.forEach((sink, j) => {
        transfers.push({
          fromId: incomeId,
          toId: sink.nodeId,
          edgeIds: edgesFrom(graph.edges, incomeId, sink.nodeId).map((e) => e.id),
          amountCents: perSink[j],
          label: `${incomeName} → ${sink.name}`,
        });
        bits.push(`${incomeName} ${money(perSink[j])} → ${sink.name}`);
      });
    }
  }
  return { transfers, pulses, bits };
}

/**
 * Build one frame per day for the first `windowDays` of the forecast.
 * Throws on an invalid graph (same as forecast) — the UI checks validity
 * before offering playback.
 */
export function flowFrames(
  graph: PlanGraph,
  assumptions: Assumptions,
  opts: FlowOptions = {},
): FlowFrame[] {
  const disabled = new Set(opts.disabledNodeIds ?? []);
  const active = activeGraph(graph, disabled);
  const validation = validateGraph(active);
  if (!validation.valid) {
    throw new Error(
      `Cannot play the money flow on an invalid graph: ${validation.errors.map((e) => e.message).join(' ')}`,
    );
  }

  const res = forecast(graph, assumptions, {
    disabledNodeIds: [...disabled],
    startDate: opts.startDate,
  });
  const plan = buildAllocationPlan(active);
  const balanceNode = active.nodes.find((n) => n.type === 'startingBalance');
  const byName = new Map<NodeId, string>(
    active.nodes.map((n) => [n.id, n.label || ('name' in n ? n.name : n.id)]),
  );
  const windowDays = Math.max(1, Math.min(opts.windowDays ?? 30, res.ledger.length));

  const frames: FlowFrame[] = [];
  for (let d = 0; d < windowDays; d++) {
    const day = res.ledger[d];
    const pulses: FlowPulse[] = [];
    // The bank-account node always shows the live end-of-day balance, so the
    // timelapse visibly moves money instead of leaving the card static.
    if (balanceNode) {
      pulses.push({ nodeId: balanceNode.id, amountCents: day.balanceCents, kind: 'balance' });
    }
    const transfers: FlowTransfer[] = [];
    const bits: string[] = [];

    for (const ev of day.events as LedgerEvent[]) {
      if (ev.kind === 'income') {
        pulses.push({ nodeId: ev.nodeId, amountCents: ev.amountCents, kind: 'income' });
        const r = routeIncome(active, plan, ev.nodeId, ev.amountCents, byName);
        transfers.push(...r.transfers);
        pulses.push(...r.pulses);
        bits.push(...r.bits);
        if (r.bits.length === 0) {
          // Unrouted income: it simply lands in the balance.
          bits.push(`${ev.name} +${money(ev.amountCents)}`);
        }
      } else if (ev.kind === 'expense') {
        pulses.push({ nodeId: ev.nodeId, amountCents: ev.amountCents, kind: 'expense' });
        const incoming = active.edges.filter((e) => e.target === ev.nodeId);
        if (incoming.length > 0) {
          // The user drew branches into this bill — follow them instead of
          // cutting a diagonal across the canvas. The forecast still pays the
          // bill from the balance; this is the visual route, not new math.
          transfers.push({
            fromId: incoming[0].source,
            toId: ev.nodeId,
            edgeIds: incoming.map((e) => e.id),
            amountCents: -ev.amountCents as Cents,
            label: `${ev.name}`,
          });
        } else if (balanceNode) {
          // Bills are paid straight out of the balance — no drawn edge exists,
          // so the timelapse draws a virtual route (edgeIds: []) from the
          // account to the bill. This is what the forecast walk computes.
          transfers.push({
            fromId: balanceNode.id,
            toId: ev.nodeId,
            edgeIds: [],
            amountCents: -ev.amountCents as Cents,
            label: `${ev.name}`,
          });
        }
        bits.push(`${ev.name} −${money(-ev.amountCents)}`);
      }
      // 'transfer' events are the walk's bookkeeping for the same money the
      // split outputs above already describe — skipping keeps the readout clean.
    }

    // Money leaving a node gets its own chip, so the timelapse shows cash
    // draining out of the source — not just arriving.
    for (const t of transfers) {
      pulses.push({
        nodeId: t.fromId,
        amountCents: -t.amountCents as Cents,
        kind: 'outflow',
        note: `→ ${byName.get(t.toId) ?? t.toId}`,
      });
    }

    const dateLabel = new Date(day.date + 'T12:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    frames.push({
      date: day.date,
      balanceCents: day.balanceCents,
      pulses,
      transfers,
      summary:
        bits.length > 0
          ? `${dateLabel} — ${bits.join('; ')}`
          : `${dateLabel} — no money moved`,
    });
  }
  return frames;
}
