/**
 * store/settingsStore.ts — app settings (Zustand).
 *
 * Milestone 9 seeds this with the onboarding flag; milestone 10 extends it
 * with theme, defaults, currency display, reduced-motion, and persistence.
 * Plain JSON throughout — serializes cleanly for localStorage.
 */
import { create } from 'zustand';

interface SettingsStore {
  /** First-run onboarding finished (or was skipped). */
  onboardingComplete: boolean;
  completeOnboarding: () => void;
  /** Re-run the guided onboarding from Settings (milestone 10). */
  reopenOnboarding: () => void;
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  onboardingComplete: false,
  completeOnboarding: () => set({ onboardingComplete: true }),
  reopenOnboarding: () => set({ onboardingComplete: false }),
}));
