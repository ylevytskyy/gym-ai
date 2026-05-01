import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UserProfile } from "@src/types";

interface ProfileState {
  profile: UserProfile | null;
  setProfile: (p: UserProfile) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (p) => set({ profile: p }),
      updateProfile: (patch) =>
        set((state) => ({
          profile: state.profile ? { ...state.profile, ...patch } : state.profile,
        })),
      clearProfile: () => set({ profile: null }),
    }),
    {
      name: "fitness.profile",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
