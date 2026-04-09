import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  setLanguage: (l: LanguagePref) => void;
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
      setLanguage: (l) => set({ language: l }),
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
