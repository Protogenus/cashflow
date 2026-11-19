/**
 * canvas/TimelapseBar.tsx — play/stop transport for the money-flow timelapse.
 *
 * Collapsed: a docked bar with a play button, a title, and what it does.
 * Playing: a transport panel — date and day count, balance with its change
 * since day 1, a day scrubber with a tick on every day money moved, the
 * day's movements as labelled rows (not a paragraph), transport controls,
 * and the length/speed pickers. Frames come from engine/flow.ts — the same
 * walk as the forecast — so what you watch is what the chart computes.
 *
 * Transport icons are inline SVG, never emoji. All state and handlers come
 * from the flow store unchanged; this file only decides how they look.
 */
import { useEffect } from 'react';
import { currentFrame, FLOW_SPEEDS, FLOW_WINDOWS, useFlowStore } from '../store/flowStore';
import { formatMoney } from '../lib/format';

const TICK_MS = 400;

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 1.5v9l7-4.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path d="M1 1h9v9H1z" fill="currentColor" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg width="13" height="12" viewBox="0 0 13 12" aria-hidden="true">
      <path d="M2 1h1.6v10H2zM11.5 1v10L4.5 6z" fill="currentColor" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="13" height="12" viewBox="0 0 13 12" aria-hidden="true">
      <path d="M9.4 1H11v10H9.4zM1.5 1v10l7-5z" fill="currentColor" />
    </svg>
  );
}

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
          className="cf-tl-launch pointer-events-auto"
          onClick={start}
          title="Watch money move through your graph, day by day"
        >
          <span className="cf-tl-launch-icon" aria-hidden="true">
            <PlayIcon />
          </span>
          <span className="cf-tl-launch-text">
            <span className="cf-tl-launch-title">Timelapse</span>
            <span className="cf-tl-launch-sub">Watch money move, day by day</span>
          </span>
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
  const dayCount = frames.length;
  const dayNumber = Math.min(frameIndex + 1, dayCount);
  const startBalance = frames[0]?.balanceCents ?? frame?.balanceCents ?? 0;
  const balanceDelta = (frame?.balanceCents ?? 0) - startBalance;
  const moves = frame?.transfers ?? [];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
      <div
        className="cf-panel cf-timelapse pointer-events-auto"
        role="group"
        aria-label="Money flow timelapse controls"
      >
        <div className="cf-tl-head">
          <div className="cf-tl-title">
            <span className="cf-tl-eyebrow">Timelapse</span>
            <span className="cf-tl-date">
              {dateLabel} <span className="cf-tl-day">Day {dayNumber} of {dayCount}</span>
            </span>
          </div>
          <div className="cf-tl-balance">
            <span className="cf-tl-balance-label">Balance</span>
            <span className="cf-tl-balance-value money">
              {frame ? formatMoney(frame.balanceCents) : ''}
            </span>
            <span
              className={`cf-tl-delta money ${balanceDelta < 0 ? 'cf-tone-out' : balanceDelta > 0 ? 'cf-tone-in' : ''}`}
              aria-live="polite"
            >
              {balanceDelta < 0 ? '−' : balanceDelta > 0 ? '+' : ''}
              {formatMoney(Math.abs(balanceDelta))} since day 1
            </span>
          </div>
        </div>

        <div className="cf-tl-scrub">
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={frameIndex}
            onChange={(e) => setFrame(Number(e.target.value))}
            className="cf-tl-range w-full"
            aria-label="Timelapse day"
          />
          {frames.length > 1 && (
            <div className="cf-tl-ticks" aria-hidden="true">
              {eventIndices.map((i) => (
                <span
                  key={i}
                  className="cf-tl-tick"
                  style={{ left: `${(i / (frames.length - 1)) * 100}%` }}
                />
              ))}
            </div>
          )}
          <div className="cf-tl-scrub-labels" aria-hidden="true">
            <span>Day 1</span>
            <span>{eventIndices.length} money days</span>
            <span>Day {dayCount}</span>
          </div>
        </div>

        <div className="cf-tl-moves" aria-live="polite">
          <span className="cf-tl-moves-title">Today</span>
          {moves.length === 0 ? (
            <span className="cf-tl-move-empty">No money moved. Balance held.</span>
          ) : (
            moves.map((t, i) => (
              <div className="cf-tl-move" key={`${t.fromId}-${t.toId}-${i}`}>
                <span className="cf-tl-move-label">{t.label}</span>
                <span className="cf-tl-move-amount money">{formatMoney(t.amountCents)}</span>
              </div>
            ))
          )}
        </div>

        <div className="cf-tl-controls">
          <div className="cf-tl-transport">
            <button
              className="cf-btn cf-tl-btn"
              onClick={stop}
              title="Stop and clear the timelapse"
              aria-label="Stop timelapse"
            >
              <StopIcon />
            </button>
            <button
              className="cf-btn cf-tl-btn"
              onClick={() => jumpEvent(-1)}
              title="Jump to the previous day money moved"
              aria-label="Previous money event"
              disabled={eventIndices.length === 0}
            >
              <PrevIcon />
            </button>
            <button
              className="cf-btn cf-btn-primary cf-tl-btn cf-tl-play"
              onClick={togglePlay}
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause timelapse' : 'Play timelapse'}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
              <span>{playing ? 'Pause' : 'Play'}</span>
            </button>
            <button
              className="cf-btn cf-tl-btn"
              onClick={() => jumpEvent(1)}
              title="Jump to the next day money moved"
              aria-label="Next money event"
              disabled={eventIndices.length === 0}
            >
              <NextIcon />
            </button>
            <button
              className={`cf-btn cf-tl-btn cf-tl-pause-toggle ${pauseOnEvents ? 'cf-tl-pause-on' : ''}`}
              onClick={() => setPauseOnEvents(!pauseOnEvents)}
              title="Pause on days when money moves"
              aria-pressed={pauseOnEvents}
              aria-label="Pause on money days"
            >
              Pause on money days
              <span className="cf-tl-toggle-state">{pauseOnEvents ? 'On' : 'Off'}</span>
            </button>
          </div>
          <div className="cf-tl-pickers">
            <label>
              Days
              <select
                className="cf-tl-select"
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                aria-label="Timelapse length in days"
              >
                {FLOW_WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {w} days
                  </option>
                ))}
              </select>
            </label>
            <label>
              Speed
              <select
                className="cf-tl-select"
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

        <p className="cf-tl-note">
          Only percentage splits move money here. Priority and conditional nodes don&apos;t move
          money yet.
        </p>
      </div>
    </div>
  );
}
