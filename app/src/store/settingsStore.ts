import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemePreference = "system" | "light" | "dark";

interface SettingsState {
  theme: ThemePreference;
  notificationsEnabled: boolean;
  hapticsEnabled: boolean;
  audioEnabled: boolean;
  keepAwakeEnabled: boolean;
  postponeMinutes: number;

  setTheme: (t: ThemePreference) => void;
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
      notificationsEnabled: true,
      hapticsEnabled: true,
      audioEnabled: true,
      keepAwakeEnabled: true,
      postponeMinutes: 15,

      setTheme: (t) => set({ theme: t }),
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
