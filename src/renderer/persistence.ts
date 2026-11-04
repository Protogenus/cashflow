/**
 * persistence.ts — versioned localStorage persistence + JSON export/import.
 *
 * Local-only by design (DECISIONS.md): the full app state serializes to
 * tens of KB of JSON. No backend, no network, no analytics.
 *
 * - STORAGE_KEY `cashflow-planner/v1` holds the debounced autosave.
 * - On boot, loadPersisted() returns the saved state, `{ empty: true }` on
 *   first run, or `{ corrupt: true }` when the stored JSON can't be read —
 *   in which case the raw string is backed up to `cashflow-planner/v1.corrupt`
 *   and the app starts fresh instead of crashing.
 * - Schema migrations are pure functions chained by version (the v1→v2
 *   pattern is documented in migratePersisted even though only v1 exists).
 * - Export downloads a versioned JSON file; import validates schema version
 *   AND node integrity via the engine validator before anything is applied —
 *   an invalid file produces a clear error and no partial import.
 *
 * Storage access goes through the StorageLike interface (default: the
 * browser's localStorage) so the logic is unit-testable without a DOM.
 */
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_RULES,
  validateGraph,
  type AlertRule,
  type Assumptions,
  type Scenario,
} from './engine';
import { createStarterGraph } from './canvas/templates';
import { DEFAULT_SETTINGS, type SettingsState } from './store/settingsStore';
import { useScenarioStore } from './store/scenarioStore';
import { useAssumptionsStore } from './store/assumptionsStore';
import { useAlertsStore } from './store/alertsStore';
import { useSettingsStore } from './store/settingsStore';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'cashflow-planner/v1';
export const CORRUPT_KEY = 'cashflow-planner/v1.corrupt';

export interface PersistedState {
  schemaVersion: 1;
  scenarios: Scenario[];
  activeScenarioId: string;
  assumptions: Assumptions;
  rules: AlertRule[];
  settings: SettingsState;
  savedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Fresh state for first run / after corruption / after "reset all data". */
export function defaultPersistedState(): PersistedState {
  const g = createStarterGraph();
  const now = new Date().toISOString();
  const base: Scenario = {
    id: `scn_${crypto.randomUUID()}`,
    name: 'Base',
    graph: { nodes: g.nodes, edges: g.edges },
    disabledNodeIds: [],
    isBaseline: true,
    createdAt: now,
    updatedAt: now,
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    scenarios: [base],
    activeScenarioId: base.id,
    assumptions: structuredClone(DEFAULT_ASSUMPTIONS),
    rules: structuredClone(DEFAULT_RULES),
    settings: structuredClone(DEFAULT_SETTINGS),
    savedAt: now,
  };
}

// ---------- migrations ----------

/**
 * Migration pattern (only v1 exists today):
 *
 *   1. Write `migrateV1ToV2(v1: PersistedV1): PersistedV2` as a pure function.
 *   2. In migratePersisted(), chain: `while (state.schemaVersion < SCHEMA_VERSION)
 *      state = MIGRATIONS[state.schemaVersion](state)`.
 *   3. STORAGE_KEY stays versioned by the *current* version; old exports
 *      import through the same chain, so export files never go stale.
 *
 * Unknown future versions are rejected, never guessed at.
 */
export function migratePersisted(data: unknown): PersistedState {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Saved data is not an object.');
  }
  const rec = data as Record<string, unknown>;
  if (rec.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema version ${String(rec.schemaVersion)} — this version of the app reads v${SCHEMA_VERSION}.`,
    );
  }
  const s = rec as Partial<PersistedState>;
  if (!Array.isArray(s.scenarios) || s.scenarios.length === 0) {
    throw new Error('Saved data has no scenarios.');
  }
  if (typeof s.activeScenarioId !== 'string') throw new Error('Saved data has no active scenario.');
  if (!s.assumptions || typeof s.assumptions !== 'object') throw new Error('Saved data has no assumptions.');
  if (!Array.isArray(s.rules)) throw new Error('Saved data has no alert rules.');
  if (!s.settings || typeof s.settings !== 'object') throw new Error('Saved data has no settings.');
  return {
    schemaVersion: SCHEMA_VERSION,
    scenarios: s.scenarios as Scenario[],
    activeScenarioId: s.activeScenarioId,
    assumptions: { ...structuredClone(DEFAULT_ASSUMPTIONS), ...(s.assumptions as Assumptions) },
    rules: s.rules as AlertRule[],
    settings: { ...structuredClone(DEFAULT_SETTINGS), ...(s.settings as SettingsState) },
    savedAt: typeof s.savedAt === 'string' ? s.savedAt : new Date().toISOString(),
  };
}

export type LoadResult =
  | { kind: 'ok'; state: PersistedState }
  | { kind: 'empty' }
  | { kind: 'corrupt'; notice: string };

/**
 * Read the autosave. Never throws: unparseable or invalid data is backed up
 * to CORRUPT_KEY (latest copy wins) and reported as corrupt so the app can
 * start fresh with a notice.
 */
export function loadPersisted(storage: StorageLike | null): LoadResult {
  if (!storage) return { kind: 'empty' };
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { kind: 'empty' };
  }
  if (raw == null) return { kind: 'empty' };

  const backUpAndReport = (why: string): LoadResult => {
    try {
      storage.setItem(CORRUPT_KEY, raw as string);
    } catch {
      // Even the backup can fail (private mode quotas) — still start fresh.
    }
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return {
      kind: 'corrupt',
      notice: `${why} A backup of the unreadable data was kept in this browser's storage (${CORRUPT_KEY}). Starting fresh.`,
    };
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return backUpAndReport('Saved data could not be parsed as JSON.');
  }
  try {
    return { kind: 'ok', state: migratePersisted(parsed) };
  } catch (e) {
    return backUpAndReport(
      `Saved data failed validation (${e instanceof Error ? e.message : 'unknown reason'}).`,
    );
  }
}

/** Write the autosave. Returns false when storage is unavailable/full. */
export function savePersisted(storage: StorageLike | null, state: PersistedState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Remove the autosave entirely (used by "Reset all data"). */
export function clearPersisted(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------- export / import ----------

export interface ImportSummary {
  scenarios: number;
  nodes: number;
  rules: number;
  savedAt: string;
}

export interface ParsedImport {
  state: PersistedState;
  summary: ImportSummary;
}

/**
 * Validate an imported file completely BEFORE anything is applied.
 * Checks: JSON parses, schema version migrates, every scenario graph
 * passes the engine validator. Returns a summary for the confirm UI.
 * Throws with a human-readable message on any problem — no partial import.
 */
export function parseImportFile(text: string): ParsedImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON — nothing was imported.');
  }
  let state: PersistedState;
  try {
    state = migratePersisted(parsed);
  } catch (e) {
    throw new Error(
      `Import rejected: ${e instanceof Error ? e.message : 'unrecognized format'} Nothing was imported.`,
    );
  }
  const problems: string[] = [];
  state.scenarios.forEach((scn, i) => {
    const v = validateGraph(scn.graph);
    if (!v.valid) {
      problems.push(
        `Scenario "${scn.name || `#${i + 1}`}": ${v.errors.map((e) => e.message).join(' ')}`,
      );
    }
  });
  if (problems.length > 0) {
    throw new Error(`Import rejected — invalid graphs:\n${problems.join('\n')}\nNothing was imported.`);
  }
  return {
    state,
    summary: {
      scenarios: state.scenarios.length,
      nodes: state.scenarios.reduce((n, s) => n + s.graph.nodes.length, 0),
      rules: state.rules.length,
      savedAt: state.savedAt,
    },
  };
}

/**
 * Snapshot the live stores into a PersistedState (autosave + export share this).
 */
export function collectPersistedState(): PersistedState {
  const scn = useScenarioStore.getState();
  const settings = useSettingsStore.getState();
  return {
    schemaVersion: SCHEMA_VERSION,
    scenarios: structuredClone(scn.scenarios),
    activeScenarioId: scn.activeScenarioId,
    assumptions: structuredClone(useAssumptionsStore.getState().assumptions),
    rules: structuredClone(useAlertsStore.getState().rules),
    settings: {
      onboardingComplete: settings.onboardingComplete,
      theme: settings.theme,
      horizonDaysDefault: settings.horizonDaysDefault,
      safetyBufferCentsDefault: settings.safetyBufferCentsDefault,
      mcTrialsDefault: settings.mcTrialsDefault,
      currencyCode: settings.currencyCode,
      currencySymbol: settings.currencySymbol,
      reducedMotion: settings.reducedMotion,
      mobilePlanView: settings.mobilePlanView,
    },
    savedAt: new Date().toISOString(),
  };
}

/** Apply a loaded/imported state to every store (boot, import-replace). */
export function applyPersistedState(state: PersistedState): void {
  useAssumptionsStore.getState().set(structuredClone(state.assumptions));
  useAlertsStore.getState().setRules(structuredClone(state.rules));
  useSettingsStore.getState().set(structuredClone(state.settings));
  // Last: loads the active scenario's graph into the editor.
  useScenarioStore.getState().hydrate(state.scenarios, state.activeScenarioId);
}

/** Trigger a download of the versioned export JSON (DOM only — called from UI). */
export function downloadExport(state: PersistedState): void {
  const stamp = state.savedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cashflow-planner-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
