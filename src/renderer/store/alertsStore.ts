/**
 * store/alertsStore.ts — user-creatable alert rules (Zustand).
 *
 * Rules are plain JSON (engine AlertRule) and evaluate live in the UI via
 * evaluateAlerts() — the panel recomputes from the current graph +
 * assumptions + active scenario's disabled nodes, so alerts always reflect
 * the plan you're looking at. Persisted in milestone 10.
 */
import { create } from 'zustand';
import {
  DEFAULT_RULES,
  validateRule,
  type AlertRule,
  type AlertRuleType,
} from '../engine';

interface AlertsStore {
  rules: AlertRule[];
  addRule: (rule: Omit<AlertRule, 'id'>) => string[];
  updateRule: (id: string, patch: Partial<AlertRule>) => string[];
  deleteRule: (id: string) => void;
  toggleRule: (id: string) => void;
  /** Replace the whole rule list (import / reset paths). */
  setRules: (rules: AlertRule[]) => void;
  resetToDefaults: () => void;
}

function freshId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/** Fresh param defaults per rule type, so the editor shows a sane starting point. */
export function defaultParamsFor(type: AlertRuleType): AlertRule['params'] {
  switch (type) {
    case 'balanceBelow':
      return { thresholdCents: 0 };
    case 'billCoverage':
      return { minAmountCents: 100000 };
    case 'paydayGap':
      return { maxGapDays: 21 };
    case 'goalOffTrack':
      return {};
  }
}

export const useAlertsStore = create<AlertsStore>()((set, get) => ({
  rules: structuredClone(DEFAULT_RULES),

  addRule: (draft) => {
    const rule: AlertRule = { ...draft, id: freshId('rule') };
    const problems = validateRule(rule);
    if (problems.length > 0) return problems;
    set({ rules: [...get().rules, rule] });
    return [];
  },

  updateRule: (id, patch) => {
    const rules = get().rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
    const updated = rules.find((r) => r.id === id);
    const problems = updated ? validateRule(updated) : [`Rule not found: ${id}`];
    if (problems.length > 0) return problems;
    set({ rules });
    return [];
  },

  deleteRule: (id) => set({ rules: get().rules.filter((r) => r.id !== id) }),
  toggleRule: (id) =>
    set({ rules: get().rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) }),

  setRules: (rules) => set({ rules }),
  resetToDefaults: () => set({ rules: structuredClone(DEFAULT_RULES) }),
}));
