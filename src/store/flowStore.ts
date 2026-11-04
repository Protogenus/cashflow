/**
 * store/flowStore.ts — canvas money-flow timelapse playback state.
 *
 * Frames are a snapshot built from the live graph + assumptions + scenario
 * toggles when playback starts (engine/flow.ts). The canvas reads the current
 * frame to light up edges and pulse nodes; TimelapseBar owns the transport
 * controls and the tick timer.
 */
import { create } from 'zustand';
import { flowFrames, type FlowFrame } from '../engine/flow';
import { useAssumptionsStore } from './assumptionsStore';
import { useGraphStore } from './graphStore';
import { useScenarioStore } from './scenarioStore';

export const FLOW_WINDOWS = [14, 30, 60, 90] as const;
export const FLOW_SPEEDS = [1, 2, 4] as const;

interface FlowStore {
  active: boolean;
  playing: boolean;
  frameIndex: number;
  frames: FlowFrame[];
  /** Frame indices where money actually moves (transfers or non-balance pulses). */
  eventIndices: number[];
  /** When true, playback auto-pauses on event frames so they can be inspected. */
  pauseOnEvents: boolean;
  windowDays: number;
  speed: number;
  start: () => void;
  stop: () => void;
  togglePlay: () => void;
  setFrame: (i: number) => void;
  /** Advance one frame; auto-pauses on event frames when pauseOnEvents is on. */
  tick: () => void;
  /** Jump to the next/previous event frame relative to the current one. */
  jumpEvent: (dir: 1 | -1) => void;
  setPauseOnEvents: (v: boolean) => void;
  setWindowDays: (d: number) => void;
  setSpeed: (s: number) => void;
}

/** Indices of frames where money moves — balance-only pulses don't count. */
function findEventIndices(frames: FlowFrame[]): number[] {
  const out: number[] = [];
  frames.forEach((f, i) => {
    const moves =
      f.transfers.length > 0 || f.pulses.some((p) => p.kind !== 'balance');
    if (moves) out.push(i);
  });
  return out;
}

function buildFrames(windowDays: number): { frames: FlowFrame[]; eventIndices: number[] } | null {
  const g = useGraphStore.getState();
  const assumptions = useAssumptionsStore.getState().assumptions;
  const scn = useScenarioStore.getState();
  const activeScenario =
    scn.scenarios.find((x) => x.id === scn.activeScenarioId) ?? scn.scenarios[0];
  try {
    const frames = flowFrames(
      { nodes: g.nodes, edges: g.edges },
      assumptions,
      { windowDays, disabledNodeIds: activeScenario?.disabledNodeIds ?? [] },
    );
    return { frames, eventIndices: findEventIndices(frames) };
  } catch (e) {
    useGraphStore.setState({
      toast: e instanceof Error ? e.message : 'Could not build the money flow.',
    });
    return null;
  }
}

export const useFlowStore = create<FlowStore>()((set, get) => ({
  active: false,
  playing: false,
  frameIndex: 0,
  frames: [],
  eventIndices: [],
  pauseOnEvents: true,
  windowDays: 30,
  speed: 1,

  start: () => {
    const built = buildFrames(get().windowDays);
    if (!built || built.frames.length === 0) return;
    set({
      frames: built.frames,
      eventIndices: built.eventIndices,
      frameIndex: 0,
      active: true,
      playing: true,
    });
  },
  stop: () =>
    set({ active: false, playing: false, frameIndex: 0, frames: [], eventIndices: [] }),
  togglePlay: () => {
    const { active, playing, frameIndex, frames } = get();
    if (!active) {
      get().start();
      return;
    }
    // Re-play from the start when pressing play at the last frame.
    if (!playing && frameIndex >= frames.length - 1) {
      set({ frameIndex: 0, playing: true });
      return;
    }
    set({ playing: !playing });
  },
  setFrame: (i) => {
    const { frames } = get();
    set({
      frameIndex: Math.max(0, Math.min(frames.length - 1, i)),
      playing: false,
    });
  },
  tick: () => {
    const { frameIndex, frames, eventIndices, pauseOnEvents } = get();
    if (frameIndex + 1 >= frames.length) {
      set({ playing: false });
      return;
    }
    const next = frameIndex + 1;
    // Hold on money days so the visuals don't flash by — the user inspects,
    // then presses play to continue.
    const hitEvent = pauseOnEvents && eventIndices.includes(next);
    set({ frameIndex: next, playing: hitEvent ? false : get().playing });
  },
  jumpEvent: (dir) => {
    const { eventIndices, frameIndex } = get();
    if (eventIndices.length === 0) return;
    const target =
      dir === 1
        ? eventIndices.find((i) => i > frameIndex) ?? eventIndices[eventIndices.length - 1]
        : [...eventIndices].reverse().find((i) => i < frameIndex) ?? eventIndices[0];
    set({ frameIndex: target, playing: false });
  },
  setPauseOnEvents: (v) => set({ pauseOnEvents: v }),
  setWindowDays: (d) => {
    set({ windowDays: d });
    if (get().active) {
      const built = buildFrames(d);
      if (built)
        set({
          frames: built.frames,
          eventIndices: built.eventIndices,
          frameIndex: 0,
          playing: true,
        });
      else set({ active: false, playing: false });
    }
  },
  setSpeed: (s) => set({ speed: s }),
}));

/** The frame the canvas should render right now (null when idle). */
export function currentFrame(s: FlowStore): FlowFrame | null {
  if (!s.active || s.frames.length === 0) return null;
  return s.frames[Math.min(s.frameIndex, s.frames.length - 1)];
}
