/**
 * components/TemplatePicker.tsx — modal listing the 3 starter templates
 * (one-line descriptions), plus a clear-canvas action.
 *
 * Used by the onboarding overlay ("start from a template instead") and the
 * header Templates button. Loading a template replaces the whole graph via
 * loadGraph (history resets — same rule as scenario switches); the scenario
 * mirror persists it into the active scenario automatically.
 */
import { useState } from 'react';
import { STARTER_TEMPLATES, type StarterTemplate } from '../templates/starterTemplates';
import { useGraphStore } from '../store/graphStore';

export function TemplatePicker({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  /** Called after a template load or canvas clear (e.g. to finish onboarding). */
  onApplied?: () => void;
}) {
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const nodeCount = useGraphStore((s) => s.nodes.length);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const apply = (t: StarterTemplate) => {
    const { nodes, edges } = t.build();
    loadGraph(nodes, edges);
    onApplied?.();
    onClose();
  };

  const clear = () => {
    loadGraph([], []);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a starter template"
      onClick={onClose}
    >
      <div
        className="cf-panel w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Start from a template</h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Templates are editable starting points — your own numbers go in after.
          Loading one replaces the current canvas.
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {STARTER_TEMPLATES.map((t) => (
            <li key={t.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t.title}</div>
                  <div className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t.description}
                  </div>
                </div>
                {confirmId === t.id ? (
                  <div className="flex shrink-0 flex-col gap-1">
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--warning)' }}>
                      {nodeCount > 0 ? 'Replace current plan?' : 'Load this template?'}
                    </span>
                    <div className="flex gap-1">
                      <button className="cf-btn cf-btn-primary px-2 py-0.5 text-xs" onClick={() => apply(t)}>
                        Replace
                      </button>
                      <button className="cf-btn px-2 py-0.5 text-xs" onClick={() => setConfirmId(null)}>
                        Keep
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="cf-btn shrink-0 px-3 py-1 text-xs"
                    onClick={() => setConfirmId(t.id)}
                  >
                    Use template
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          {confirmClear ? (
            <>
              <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
                Remove every node from the canvas?
              </span>
              <button className="cf-btn px-2 py-1 text-xs" style={{ color: 'var(--danger)' }} onClick={clear}>
                Clear canvas
              </button>
              <button className="cf-btn px-2 py-1 text-xs" onClick={() => setConfirmClear(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="cf-btn px-2 py-1 text-xs" onClick={() => setConfirmClear(true)}>
              Clear canvas
            </button>
          )}
          <button className="cf-btn ml-auto px-3 py-1 text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
