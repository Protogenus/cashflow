import { describe, expect, it } from 'vitest';
import {
  CORRUPT_KEY,
  STORAGE_KEY,
  applyPersistedState,
  clearPersisted,
  collectPersistedState,
  defaultPersistedState,
  loadPersisted,
  migratePersisted,
  parseImportFile,
  savePersisted,
  type PersistedState,
  type StorageLike,
} from './persistence';
import { useSettingsStore } from './store/settingsStore';
import { useAlertsStore } from './store/alertsStore';

function memStore(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

function validState(): PersistedState {
  return defaultPersistedState();
}

describe('loadPersisted', () => {
  it('returns empty when nothing is stored', () => {
    expect(loadPersisted(memStore())).toEqual({ kind: 'empty' });
    expect(loadPersisted(null)).toEqual({ kind: 'empty' });
  });

  it('round-trips a saved state', () => {
    const s = memStore();
    const state = validState();
    expect(savePersisted(s, state)).toBe(true);
    const loaded = loadPersisted(s);
    expect(loaded.kind).toBe('ok');
    if (loaded.kind === 'ok') {
      expect(loaded.state.scenarios).toHaveLength(1);
      expect(loaded.state.activeScenarioId).toBe(state.activeScenarioId);
      expect(loaded.state.rules.length).toBeGreaterThan(0);
    }
  });

  it('backs up unparseable JSON to the corrupt key and reports corrupt', () => {
    const raw = '{not json';
    const s = memStore({ [STORAGE_KEY]: raw });
    const res = loadPersisted(s);
    expect(res.kind).toBe('corrupt');
    expect(s.data[CORRUPT_KEY]).toBe(raw);
    expect(STORAGE_KEY in s.data).toBe(false);
    if (res.kind === 'corrupt') expect(res.notice).toMatch(/backup/i);
  });

  it('backs up structurally invalid data instead of crashing', () => {
    const raw = JSON.stringify({ schemaVersion: 99, scenarios: [] });
    const s = memStore({ [STORAGE_KEY]: raw });
    const res = loadPersisted(s);
    expect(res.kind).toBe('corrupt');
    expect(s.data[CORRUPT_KEY]).toBe(raw);
  });

  it('a second corrupt load keeps the newest backup', () => {
    const s = memStore({ [STORAGE_KEY]: 'bad1' });
    loadPersisted(s);
    s.setItem(STORAGE_KEY, 'bad2');
    loadPersisted(s);
    expect(s.data[CORRUPT_KEY]).toBe('bad2');
  });
});

describe('migratePersisted', () => {
  it('accepts v1 and fills missing assumption/setting fields with defaults', () => {
    const partial = {
      schemaVersion: 1,
      scenarios: validState().scenarios,
      activeScenarioId: 'x',
      assumptions: { horizonDays: 60 },
      rules: [],
      settings: { theme: 'dark' },
      savedAt: '2026-11-03T00:00:00.000Z',
    };
    const out = migratePersisted(partial);
    expect(out.assumptions.horizonDays).toBe(60);
    expect(out.assumptions.mcTrials).toBe(2000); // default filled
    expect(out.settings.theme).toBe('dark');
    expect(out.settings.currencySymbol).toBe('$'); // default filled
  });

  it('rejects unknown schema versions without guessing', () => {
    expect(() => migratePersisted({ schemaVersion: 2, scenarios: [] })).toThrow(/unsupported/i);
    expect(() => migratePersisted({})).toThrow(/unsupported/i);
    expect(() => migratePersisted(null)).toThrow();
  });

  it('rejects a state with no scenarios', () => {
    expect(() =>
      migratePersisted({ ...validState(), scenarios: [] }),
    ).toThrow(/no scenarios/i);
  });
});

describe('parseImportFile', () => {
  it('accepts a valid export and summarizes it', () => {
    const state = validState();
    const { summary } = parseImportFile(JSON.stringify(state));
    expect(summary.scenarios).toBe(1);
    expect(summary.nodes).toBe(state.scenarios[0].graph.nodes.length);
    expect(summary.rules).toBe(state.rules.length);
  });

  it('rejects non-JSON with a clear error and no partial import', () => {
    expect(() => parseImportFile('nope')).toThrow(/not valid JSON/i);
  });

  it('rejects a wrong schema version', () => {
    expect(() => parseImportFile(JSON.stringify({ schemaVersion: 7 }))).toThrow(/rejected/i);
  });

  it('rejects an export whose scenario graph fails engine validation', () => {
    const state = validState();
    const g = state.scenarios[0].graph;
    // Two starting-balance nodes = invalid.
    g.nodes.push({ ...g.nodes.find((n) => n.type === 'startingBalance')! });
    expect(() => parseImportFile(JSON.stringify(state))).toThrow(/invalid graphs/i);
  });
});

describe('collect/apply round-trip', () => {
  it('snapshots live stores and restores them', () => {
    const settings = useSettingsStore.getState();
    const alerts = useAlertsStore.getState();
    settings.set({ theme: 'dark', currencySymbol: '€', currencyCode: 'EUR' });
    alerts.addRule({
      name: 'Test rule',
      type: 'paydayGap',
      params: { maxGapDays: 30 },
      severity: 'info',
      enabled: true,
    });

    const snap = collectPersistedState();
    expect(snap.settings.theme).toBe('dark');
    expect(snap.settings.currencySymbol).toBe('€');
    expect(snap.rules.some((r) => r.name === 'Test rule')).toBe(true);

    settings.set({ theme: 'light', currencySymbol: '$', currencyCode: 'USD' });
    applyPersistedState(snap);
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(useSettingsStore.getState().currencySymbol).toBe('€');
    expect(useAlertsStore.getState().rules.some((r) => r.name === 'Test rule')).toBe(true);

    // Restore defaults so other tests see a clean store.
    settings.resetSettings();
    alerts.resetToDefaults();
  });
});

describe('clearPersisted', () => {
  it('removes the autosave', () => {
    const s = memStore();
    savePersisted(s, validState());
    clearPersisted(s);
    expect(loadPersisted(s)).toEqual({ kind: 'empty' });
  });
});
