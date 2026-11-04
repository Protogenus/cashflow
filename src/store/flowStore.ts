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
  windowDays: number;
  speed: number;
  start: () => void;
  stop: () => void;
  togglePlay: () => void;
  setFrame: (i: number) => void;
  /** Advance one frame; pauses at the end of the window. */
  tick: () => void;
  setWindowDays: (d: number) => void;
  setSpeed: (s: number) => void;
}

function buildFrames(windowDays: number): FlowFrame[] | null {
  const g = useGraphStore.getState();
  const assumptions = useAssumptionsStore.getState().assumptions;
  const scn = useScenarioStore.getState();
  const activeScenario =
    scn.scenarios.find((x) => x.id === scn.activeScenarioId) ?? scn.scenarios[0];
  try {
    return flowFrames(
      { nodes: g.nodes, edges: g.edges },
      assumptions,
      { windowDays, disabledNodeIds: activeScenario?.disabledNodeIds ?? [] },
    );
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
  windowDays: 30,
  speed: 1,

  start: () => {
    const frames = buildFrames(get().windowDays);
    if (!frames || frames.length === 0) return;
    set({ frames, frameIndex: 0, active: true, playing: true });
  },
  stop: () => set({ active: false, playing: false, frameIndex: 0, frames: [] }),
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
    const { frameIndex, frames } = get();
    if (frameIndex + 1 >= frames.length) {
      set({ playing: false });
      return;
    }
    set({ frameIndex: frameIndex + 1 });
  },
  setWindowDays: (d) => {
    set({ windowDays: d });
    if (get().active) {
      const frames = buildFrames(d);
      if (frames) set({ frames, frameIndex: 0, playing: true });
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
