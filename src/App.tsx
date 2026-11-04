/**
 * App.tsx — shell: header (undo/redo, validation badge, templates), palette,
 * canvas, right-panel tabs. Milestone 10 owns boot hydration, the debounced
 * autosave, theme, and reduced-motion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { validateGraph } from './engine';
import { useGraphStore } from './store/graphStore';
import { useScenarioStore } from './store/scenarioStore';
import { useAssumptionsStore } from './store/assumptionsStore';
import { useAlertsStore } from './store/alertsStore';
import { FlowCanvas } from './canvas/FlowCanvas';
import { Palette } from './canvas/Palette';
import { Inspector } from './canvas/Inspector';
import { ForecastView } from './panels/ForecastView';
import { AlertsPanel } from './panels/AlertsPanel';
import { ScenariosPanel } from './panels/ScenariosPanel';
import { OptimizerView } from './panels/OptimizerView';
import { MonteCarloView } from './panels/MonteCarloView';
import { TradeoffView } from './panels/TradeoffView';
import { AssumptionsPanel } from './panels/AssumptionsPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { Onboarding } from './components/Onboarding';
import { TemplatePicker } from './components/TemplatePicker';
import { useSettingsStore } from './store/settingsStore';
import { useIsMobile } from './lib/useIsMobile';
import { NodeListView } from './canvas/NodeListView';
import {
  applyPersistedState,
  browserStorage,
  collectPersistedState,
  loadPersisted,
  savePersisted,
} from './persistence';

type RightTab =
  | 'forecast' | 'alerts' | 'scenarios' | 'optimizer' | 'montecarlo'
  | 'tradeoff' | 'inspector' | 'assumptions' | 'settings';

function RightPanel({ tab, setTab }: { tab: RightTab; setTab: (t: RightTab) => void }) {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  // Selecting a node opens its editor; the forecast stays one click away.
  useEffect(() => {
    if (selectedNodeId) setTab('inspector');
  }, [selectedNodeId, setTab]);

  const tabBtn = (id: RightTab, label: string) => (
    <button
      key={id}
      className="whitespace-nowrap px-2 py-2.5 text-[13px] font-semibold"
      style={{
        color: tab === id ? 'var(--text)' : 'var(--text-muted)',
        borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
        background: tab === id ? 'var(--surface-2)' : 'transparent',
      }}
      onClick={() => setTab(id)}
      aria-selected={tab === id}
      role="tab"
      title={label}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 border-b" style={{ borderColor: 'var(--border)' }} role="tablist" aria-label="Results panels">
        {tabBtn('forecast', 'Forecast')}
        {tabBtn('alerts', 'Alerts')}
        {tabBtn('scenarios', 'Scenarios')}
        {tabBtn('optimizer', 'Optimizer')}
        {tabBtn('montecarlo', 'Monte Carlo')}
        {tabBtn('tradeoff', 'Trade-off')}
        {tabBtn('inspector', 'Inspector')}
        {tabBtn('assumptions', 'Assumptions')}
        {tabBtn('settings', 'Settings')}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {tab === 'forecast' && <ForecastView onOpenAssumptions={() => setTab('assumptions')} />}
        {tab === 'alerts' && <AlertsPanel />}
        {tab === 'scenarios' && <ScenariosPanel />}
        {tab === 'optimizer' && <OptimizerView />}
        {tab === 'montecarlo' && <MonteCarloView onOpenAssumptions={() => setTab('assumptions')} />}
        {tab === 'tradeoff' && <TradeoffView />}
        {tab === 'inspector' && <Inspector />}
        {tab === 'assumptions' && <AssumptionsPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
}

function ValidationBadge() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const setSelected = useGraphStore((s) => s.setSelected);
  const validation = useMemo(() => validateGraph({ nodes, edges }), [nodes, edges]);
  const { errors, warnings } = validation;
  if (errors.length === 0 && warnings.length === 0) {
    return (
      <span className="text-xs font-semibold" style={{ color: 'var(--income)' }} title="Graph is valid">
        ✓ valid
      </span>
    );
  }
  const first = errors[0] ?? warnings[0];
  return (
    <button
      className="cf-btn"
      title={first.message}
      onClick={() => {
        if (first.nodeId) setSelected(first.nodeId);
      }}
    >
      {errors.length > 0 && (
        <span className="font-semibold" style={{ color: 'var(--danger)' }}>
          {errors.length} error{errors.length === 1 ? '' : 's'}
        </span>
      )}
      {warnings.length > 0 && (
        <span className="font-semibold" style={{ color: 'var(--warning)' }}>
          {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        </span>
      )}
    </button>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Tab / Shift+Tab', 'Move focus between nodes, edges, and controls'],
  ['Enter (on a node)', 'Select the node and open its editor'],
  ['Delete / Backspace', 'Delete the selected node or edge'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['Esc', 'Clear selection, close dialogs'],
  ['?', 'Open this shortcut list'],
];

/** Keyboard-shortcut reference (DESIGN.md §9: `?` opens the shortcut list). */
function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className="cf-panel w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button className="cf-btn px-2 py-1 text-xs" onClick={onClose} aria-label="Close shortcut list">
            ×
          </button>
        </div>
        <dl className="mt-3 flex flex-col gap-2 text-[13px]">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="flex items-center gap-3">
              <dt
                className="shrink-0 rounded border px-2 py-0.5 font-mono text-xs"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                {keys}
              </dt>
              <dd style={{ color: 'var(--text-muted)' }}>{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          On small screens the plan also works as a node list — every action above
          has a button equivalent there.
        </p>
      </div>
    </div>
  );
}

function Toast() {  const toast = useGraphStore((s) => s.toast);
  const dismissToast = useGraphStore((s) => s.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(dismissToast, 3500);
    return () => window.clearTimeout(t);
  }, [toast, dismissToast]);
  if (!toast) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg"
      style={{ background: 'var(--text)', color: 'var(--bg)' }}
      role="alert"
    >
      {toast}
    </div>
  );
}

export function App() {
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const pastLen = useGraphStore((s) => s.past.length);
  const futureLen = useGraphStore((s) => s.future.length);
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);
  const theme = useSettingsStore((s) => s.theme);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  // Subscribe so every panel re-renders when the currency symbol changes.
  useSettingsStore((s) => s.currencySymbol);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tab, setTab] = useState<RightTab>('forecast');
  const [corruptNotice, setCorruptNotice] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const isMobile = useIsMobile();
  const mobilePlanView = useSettingsStore((s) => s.mobilePlanView);
  const setSettings = useSettingsStore((s) => s.set);
  const [mobileSection, setMobileSection] = useState<'plan' | 'results'>('plan');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Theme: light / dark / system (follows the OS setting).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // Reduced motion: reduce / full / system (follows the OS setting).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const reduce = reducedMotion === 'reduce' || (reducedMotion === 'system' && mq.matches);
      document.documentElement.classList.toggle('reduce-motion', reduce);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [reducedMotion]);

  // Boot: hydrate stores from the autosave (once). Corrupt data is backed up
  // by loadPersisted and reported — the app never crashes on load.
  useEffect(() => {
    const res = loadPersisted(browserStorage());
    if (res.kind === 'ok') {
      applyPersistedState(res.state);
    } else if (res.kind === 'corrupt') {
      setCorruptNotice(res.notice);
    }
    hydratedRef.current = true;
  }, []);

  // Autosave: debounced 500ms after any store change (skipped until hydrated
  // so the seed state never overwrites a real save).
  useEffect(() => {
    const storage = browserStorage();
    let timer: number | undefined;
    const schedule = () => {
      if (!hydratedRef.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const ok = savePersisted(storage, collectPersistedState());
        if (!ok) {
          useGraphStore.setState({
            toast: "Couldn't save to this browser's storage — export JSON to back up your plan.",
          });
        }
      }, 500);
    };
    const unsubs = [
      useGraphStore.subscribe(schedule),
      useScenarioStore.subscribe(schedule),
      useAssumptionsStore.subscribe(schedule),
      useAlertsStore.subscribe(schedule),
      useSettingsStore.subscribe(schedule),
    ];
    return () => {
      window.clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, []);

  // Global undo/redo shortcuts (canvas Delete handling lives in FlowCanvas).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      const ae = document.activeElement as HTMLElement | null;
      const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      // Let text fields keep their native undo.
      if (typing) return;
      e.preventDefault();
      if (e.shiftKey) useGraphStore.getState().redo();
      else useGraphStore.getState().undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Esc: close dialogs first, then clear the node selection.
  // `?` opens the keyboard-shortcut list (DESIGN.md §9).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      if (e.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (showTemplates) {
          setShowTemplates(false);
          return;
        }
        const st = useGraphStore.getState();
        if (st.selectedNodeId) st.setSelected(null);
        return;
      }
      if (e.key === '?' && !typing) {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTemplates, showShortcuts]);

  const sectionBtn = (id: 'plan' | 'results', label: string) => (
    <button
      key={id}
      className={`cf-btn px-4 py-1.5 text-[13px] ${mobileSection === id ? 'cf-btn-primary' : ''}`}
      onClick={() => setMobileSection(id)}
      aria-pressed={mobileSection === id}
    >
      {label}
    </button>
  );

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <a href="#cf-results" className="cf-skip-link">
          Skip to results
        </a>
        <header
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <div>
            <h1 className="text-base font-semibold leading-tight">Cash-Flow Planner</h1>
            <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              Based on your inputs — not financial advice.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ValidationBadge />
            <button className="cf-btn" onClick={undo} disabled={pastLen === 0} title="Undo (Ctrl+Z)">
              ↩ Undo
            </button>
            <button className="cf-btn" onClick={redo} disabled={futureLen === 0} title="Redo (Ctrl+Shift+Z)">
              ↪ Redo
            </button>
            <button
              className="cf-btn"
              onClick={() => setShowShortcuts(true)}
              title="Keyboard shortcuts (?)"
              aria-label="Open keyboard shortcut list"
            >
              ?
            </button>
            <button
              className="cf-btn"
              onClick={() => setShowTemplates(true)}
              title="Load a starter template or clear the canvas"
            >
              Templates
            </button>
            <button
              className="cf-btn"
              onClick={() => setTab('settings')}
              title="Settings"
            >
              ⚙ Settings
            </button>
          </div>
        </header>
        {corruptNotice && (
          <div
            className="border-b px-4 py-2 text-xs"
            style={{ borderColor: 'var(--warning)', background: 'var(--surface-2)' }}
            role="alert"
          >
            <span className="font-semibold">Heads up: </span>
            {corruptNotice}
            <button className="cf-btn ml-2 px-2 py-0.5 text-xs" onClick={() => setCorruptNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {isMobile ? (
          /* Small screens (DESIGN.md §8): Plan / Results sections stacked;
             the plan is a node list by default with a manual canvas toggle. */
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <div className="flex gap-1" role="group" aria-label="App sections">
                {sectionBtn('plan', 'Plan')}
                {sectionBtn('results', 'Results')}
              </div>
              {mobileSection === 'plan' && (
                <div className="ml-auto flex gap-1" role="group" aria-label="Plan view: list or canvas">
                  {(['list', 'canvas'] as const).map((v) => (
                    <button
                      key={v}
                      className={`cf-btn px-3 py-1.5 text-xs ${mobilePlanView === v ? 'cf-btn-primary' : ''}`}
                      onClick={() => setSettings({ mobilePlanView: v })}
                      aria-pressed={mobilePlanView === v}
                      title={v === 'list' ? 'Node list (easier on small screens)' : 'Graph canvas'}
                    >
                      {v === 'list' ? '☰ List' : '⤢ Canvas'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1">
              {mobileSection === 'plan' ? (
                mobilePlanView === 'list' ? (
                  <NodeListView />
                ) : (
                  <main className="h-full" aria-label="Canvas">
                    <FlowCanvas />
                  </main>
                )
              ) : (
                <div id="cf-results" tabIndex={-1} className="h-full">
                  <RightPanel tab={tab} setTab={setTab} />
                </div>
              )}
            </div>
          </div>
        ) : (
        <div className="flex min-h-0 flex-1">
          <div className="border-r" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <Palette />
          </div>
          <main className="min-w-0 flex-1" aria-label="Canvas">
            <FlowCanvas />
          </main>
          <aside
            id="cf-results"
            tabIndex={-1}
            className="w-[24rem] shrink-0 border-l"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            aria-label="Inspector and forecast"
          >
            <RightPanel tab={tab} setTab={setTab} />
          </aside>
        </div>
        )}
        <Toast />
        {!onboardingComplete && <Onboarding />}
        {showTemplates && <TemplatePicker onClose={() => setShowTemplates(false)} />}
        {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      </div>
    </ReactFlowProvider>
  );
}
