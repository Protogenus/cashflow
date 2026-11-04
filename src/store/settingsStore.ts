/**
 * store/settingsStore.ts — app settings (Zustand).
 *
 * Plain JSON throughout — serializes cleanly for localStorage (milestone 10).
 * Horizon / buffer / MC-run "defaults" are the user's preferred values: the
 * settings panel applies them to the live assumptions immediately, and they
 * persist as the standing preference.
 */
import { create } from 'zustand';
import { DEFAULT_ASSUMPTIONS } from '../engine';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ReducedMotionChoice = 'system' | 'reduce' | 'full';

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

/** Display-only presets — amounts are never converted, only re-prefixed. */
export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥)' },
  { code: 'custom', symbol: '', label: 'Custom symbol…' },
];

export interface SettingsState {
  onboardingComplete: boolean;
  theme: ThemeChoice;
  horizonDaysDefault: number;
  safetyBufferCentsDefault: number;
  mcTrialsDefault: number;
  currencyCode: string;
  /** Prefix used by money formatting. Never an exchange rate — display only. */
  currencySymbol: string;
  reducedMotion: ReducedMotionChoice;
}

export const DEFAULT_SETTINGS: SettingsState = {
  onboardingComplete: false,
  theme: 'system',
  horizonDaysDefault: DEFAULT_ASSUMPTIONS.horizonDays,
  safetyBufferCentsDefault: DEFAULT_ASSUMPTIONS.safetyBufferCents,
  mcTrialsDefault: DEFAULT_ASSUMPTIONS.mcTrials,
  currencyCode: 'USD',
  currencySymbol: '$',
  reducedMotion: 'system',
};

interface SettingsStore extends SettingsState {
  set: (patch: Partial<SettingsState>) => void;
  completeOnboarding: () => void;
  /** Re-run the guided onboarding from Settings. */
  reopenOnboarding: () => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  ...structuredClone(DEFAULT_SETTINGS),

  set: (patch) => set((s) => ({ ...s, ...patch })),
  completeOnboarding: () => set({ onboardingComplete: true }),
  reopenOnboarding: () => set({ onboardingComplete: false }),
  /** Defaults for every setting, but never re-triggers onboarding by itself. */
  resetSettings: () =>
    set((s) => ({ ...structuredClone(DEFAULT_SETTINGS), onboardingComplete: s.onboardingComplete })),
}));
