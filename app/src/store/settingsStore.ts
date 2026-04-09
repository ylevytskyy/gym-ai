import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { i18n, resolveLanguage } from "@src/i18n";
import { usePlanStore } from "@src/store/planStore";
import { rescheduleAll } from "@src/lib/scheduler";

export type ThemePreference = "system" | "light" | "dark";
export type LanguagePref = "system" | "en" | "uk";

interface SettingsState {
  theme: ThemePreference;
  language: LanguagePref;
  notificationsEnabled: boolean;
  hapticsEnabled: boolean;
  audioEnabled: boolean;
  keepAwakeEnabled: boolean;
  postponeMinutes: number;

  setTheme: (t: ThemePreference) => void;
  setLanguage: (l: LanguagePref) => Promise<void>;
  setNotificationsEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setAudioEnabled: (v: boolean) => void;
  setKeepAwakeEnabled: (v: boolean) => void;
  setPostponeMinutes: (m: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      language: "system",
      notificationsEnabled: true,
      hapticsEnabled: true,
      audioEnabled: true,
      keepAwakeEnabled: true,
      postponeMinutes: 15,

      setTheme: (t) => set({ theme: t }),
      setLanguage: async (l) => {
        set({ language: l });
        await i18n.changeLanguage(resolveLanguage(l));
        const plan = usePlanStore.getState().plan;
        if (plan) {
          rescheduleAll(plan).catch(() => {});
        }
      },
      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setAudioEnabled: (v) => set({ audioEnabled: v }),
      setKeepAwakeEnabled: (v) => set({ keepAwakeEnabled: v }),
      setPostponeMinutes: (m) => set({ postponeMinutes: m }),
    }),
    {
      name: "fitness.settings",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
