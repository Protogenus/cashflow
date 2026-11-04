/**
 * App.tsx — shell: header (undo/redo, validation badge, theme), palette,
 * canvas, inspector. Milestone 3 adds the forecast view as a right-panel tab.
 */
import { useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { validateGraph } from './engine';
import { useGraphStore } from './store/graphStore';
import { FlowCanvas } from './canvas/FlowCanvas';
import { Palette } from './canvas/Palette';
import { Inspector } from './canvas/Inspector';
import { ForecastView } from './panels/ForecastView';
import { ScenariosPanel } from './panels/ScenariosPanel';
import { OptimizerView } from './panels/OptimizerView';

type RightTab = 'forecast' | 'scenarios' | 'optimizer' | 'inspector';

function RightPanel() {
  const [tab, setTab] = useState<RightTab>('forecast');
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  // Selecting a node opens its editor; the forecast stays one click away.
  useEffect(() => {
    if (selectedNodeId) setTab('inspector');
  }, [selectedNodeId]);

  const tabBtn = (id: RightTab, label: string) => (
    <button
      key={id}
      className="flex-1 px-3 py-2 text-xs font-semibold"
      style={{
        color: tab === id ? 'var(--text)' : 'var(--text-muted)',
        borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
      }}
      onClick={() => setTab(id)}
      aria-selected={tab === id}
      role="tab"
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b" style={{ borderColor: 'var(--border)' }} role="tablist">
        {tabBtn('forecast', 'Forecast')}
        {tabBtn('scenarios', 'Scenarios')}
        {tabBtn('optimizer', 'Optimizer')}
        {tabBtn('inspector', 'Inspector')}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {tab === 'forecast' && <ForecastView />}
        {tab === 'scenarios' && <ScenariosPanel />}
        {tab === 'optimizer' && <OptimizerView />}
        {tab === 'inspector' && <Inspector />}
      </div>
    </div>
  );
}

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return { dark, setDark };
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

function Toast() {
  const toast = useGraphStore((s) => s.toast);
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
  const { dark, setDark } = useDarkMode();
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const pastLen = useGraphStore((s) => s.past.length);
  const futureLen = useGraphStore((s) => s.future.length);

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

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <header
          className="flex items-center gap-3 border-b px-4 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <div>
            <h1 className="text-base font-semibold leading-tight">Cash-Flow Planner</h1>
            <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              Based on your inputs — not financial advice.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ValidationBadge />
            <button className="cf-btn" onClick={undo} disabled={pastLen === 0} title="Undo (Ctrl+Z)">
              ↩ Undo
            </button>
            <button className="cf-btn" onClick={redo} disabled={futureLen === 0} title="Redo (Ctrl+Shift+Z)">
              ↪ Redo
            </button>
            <button
              className="cf-btn"
              onClick={() => setDark(!dark)}
              title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {dark ? '☀ Light' : '◐ Dark'}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="border-r" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <Palette />
          </div>
          <main className="min-w-0 flex-1" aria-label="Canvas">
            <FlowCanvas />
          </main>
          <aside
            className="w-80 shrink-0 border-l"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            aria-label="Inspector and forecast"
          >
            <RightPanel />
          </aside>
        </div>
        <Toast />
      </div>
    </ReactFlowProvider>
  );
}
