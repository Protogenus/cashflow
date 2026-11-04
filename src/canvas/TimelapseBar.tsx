/**
 * canvas/TimelapseBar.tsx — play/stop transport for the money-flow timelapse.
 *
 * Collapsed: a single "Timelapse" button docked at the bottom of the canvas.
 * Playing: transport controls (stop, play/pause, day scrubber), the current
 * date + balance readout, a one-line summary of what moved that day, and
 * window/speed pickers. Frames come from engine/flow.ts — the same walk as
 * the forecast — so what you watch is what the chart computes.
 */
import { useEffect } from 'react';
import { currentFrame, FLOW_SPEEDS, FLOW_WINDOWS, useFlowStore } from '../store/flowStore';
import { formatMoney } from '../lib/format';

const TICK_MS = 400;

export function TimelapseBar() {
  const active = useFlowStore((s) => s.active);
  const playing = useFlowStore((s) => s.playing);
  const frameIndex = useFlowStore((s) => s.frameIndex);
  const frames = useFlowStore((s) => s.frames);
  const eventIndices = useFlowStore((s) => s.eventIndices);
  const pauseOnEvents = useFlowStore((s) => s.pauseOnEvents);
  const windowDays = useFlowStore((s) => s.windowDays);
  const speed = useFlowStore((s) => s.speed);
  const start = useFlowStore((s) => s.start);
  const stop = useFlowStore((s) => s.stop);
  const togglePlay = useFlowStore((s) => s.togglePlay);
  const setFrame = useFlowStore((s) => s.setFrame);
  const tick = useFlowStore((s) => s.tick);
  const jumpEvent = useFlowStore((s) => s.jumpEvent);
  const setPauseOnEvents = useFlowStore((s) => s.setPauseOnEvents);
  const setWindowDays = useFlowStore((s) => s.setWindowDays);
  const setSpeed = useFlowStore((s) => s.setSpeed);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(tick, TICK_MS / speed);
    return () => window.clearInterval(t);
  }, [playing, speed, tick]);

  if (!active) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
        <button
          className="cf-btn cf-btn-primary pointer-events-auto px-5 py-2.5 text-[13px] font-semibold shadow-md"
          onClick={start}
          title="Play a day-by-day timelapse of how money moves through your graph"
        >
          ▶ Timelapse
        </button>
      </div>
    );
  }

  const frame = currentFrame(useFlowStore.getState());
  const dateLabel = frame
    ? new Date(frame.date + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
      <div
        className="cf-panel pointer-events-auto w-full max-w-2xl px-4 py-3 shadow-lg"
        role="group"
        aria-label="Money flow timelapse controls"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1">
            <button
              className="cf-btn px-2.5 py-1.5 text-sm"
              onClick={stop}
              title="Stop and clear the timelapse"
              aria-label="Stop timelapse"
            >
              ⏹
            </button>
            <button
              className="cf-btn px-2 py-1.5 text-sm"
              onClick={() => jumpEvent(-1)}
              title="Jump to the previous day money moved"
              aria-label="Previous money event"
              disabled={eventIndices.length === 0}
            >
              ⏮
            </button>
            <button
              className="cf-btn cf-btn-primary px-3 py-1.5 text-sm font-semibold"
              onClick={togglePlay}
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause timelapse' : 'Play timelapse'}
            >
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              className="cf-btn px-2 py-1.5 text-sm"
              onClick={() => jumpEvent(1)}
              title="Jump to the next day money moved"
              aria-label="Next money event"
              disabled={eventIndices.length === 0}
            >
              ⏭
            </button>
            <button
              className={`cf-btn px-2 py-1.5 text-xs ${pauseOnEvents ? 'cf-btn-primary' : ''}`}
              onClick={() => setPauseOnEvents(!pauseOnEvents)}
              title={pauseOnEvents ? 'Playing pauses on every day money moves (on)' : 'Playing pauses on every day money moves (off)'}
              aria-pressed={pauseOnEvents}
              aria-label="Pause on money days"
            >
              ⏸💰
            </button>
          </div>
          <div className="min-w-32 flex-1">
            <input
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={frameIndex}
              onChange={(e) => setFrame(Number(e.target.value))}
              className="w-full"
              aria-label="Timelapse day"
            />
            {frames.length > 1 && (
              <div className="relative h-1.5" aria-hidden="true">
                {eventIndices.map((i) => (
                  <span
                    key={i}
                    className="absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                    style={{
                      left: `${(i / (frames.length - 1)) * 100}%`,
                      background: 'var(--accent)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="text-[13px] font-semibold" aria-live="polite">
            {dateLabel}
            <span className="money ml-2" style={{ color: 'var(--text-muted)' }}>
              {frame ? formatMoney(frame.balanceCents) : ''}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <label>
              Window{' '}
              <select
                className="rounded border px-1 py-0.5 text-xs"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                aria-label="Timelapse window in days"
              >
                {FLOW_WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {w}d
                  </option>
                ))}
              </select>
            </label>
            <label>
              Speed{' '}
              <select
                className="rounded border px-1 py-0.5 text-xs"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                aria-label="Timelapse speed"
              >
                {FLOW_SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }} aria-live="polite">
          {frame?.summary ?? ''}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Percentage-split routing only — priority and conditional nodes don&apos;t move money
          in the forecast yet.
        </p>
      </div>
    </div>
  );
}
