import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  ExerciseExecution,
  SessionExecution,
  WorkoutPlan,
} from "@src/types";
import { recomputeActuals } from "@src/lib/calorie";
import { addMinutesToTime, isTimeAfter } from "@src/lib/dates";

interface PlanState {
  plan: WorkoutPlan | null;

  setPlan: (p: WorkoutPlan) => void;
  clearPlan: () => void;

  markExerciseExecution: (
    sessionId: string,
    blockIndex: number,
    exerciseIndex: number,
    update: Partial<ExerciseExecution>,
  ) => void;

  markSessionExecution: (
    sessionId: string,
    update: Partial<SessionExecution>,
  ) => void;

  postponeSession: (sessionId: string, minutes: number) => void;
}

function mapSessionsByIdPlan(
  plan: WorkoutPlan,
  sessionId: string,
  updater: (
    plan: WorkoutPlan,
    dayIdx: number,
    sessIdx: number,
  ) => WorkoutPlan,
): WorkoutPlan {
  for (let d = 0; d < plan.plan.days.length; d++) {
    const day = plan.plan.days[d];
    for (let s = 0; s < day.sessions.length; s++) {
      if (day.sessions[s].session_id === sessionId) {
        return updater(plan, d, s);
      }
    }
  }
  return plan;
}

// Immutably deep-set an exercise's execution field inside the plan.
function setExerciseExecution(
  plan: WorkoutPlan,
  sessionId: string,
  blockIdx: number,
  exIdx: number,
  update: Partial<ExerciseExecution>,
): WorkoutPlan {
  return mapSessionsByIdPlan(plan, sessionId, (p, d, s) => {
    const day = p.plan.days[d];
    const session = day.sessions[s];
    const block = session.blocks[blockIdx];
    const ex = block.exercises[exIdx];
    const newEx = { ...ex, execution: { ...ex.execution, ...update } };
    const newBlock = {
      ...block,
      exercises: block.exercises.map((e, i) => (i === exIdx ? newEx : e)),
    };
    const newSession = {
      ...session,
      blocks: session.blocks.map((b, i) => (i === blockIdx ? newBlock : b)),
    };
    const newDay = {
      ...day,
      sessions: day.sessions.map((ss, i) => (i === s ? newSession : ss)),
    };
    return {
      ...p,
      plan: {
        ...p.plan,
        days: p.plan.days.map((dd, i) => (i === d ? newDay : dd)),
      },
    };
  });
}

function setSessionExecution(
  plan: WorkoutPlan,
  sessionId: string,
  update: Partial<SessionExecution>,
): WorkoutPlan {
  return mapSessionsByIdPlan(plan, sessionId, (p, d, s) => {
    const day = p.plan.days[d];
    const session = day.sessions[s];
    const newSession = {
      ...session,
      execution: { ...session.execution, ...update },
    };
    const newDay = {
      ...day,
      sessions: day.sessions.map((ss, i) => (i === s ? newSession : ss)),
    };
    return {
      ...p,
      plan: {
        ...p.plan,
        days: p.plan.days.map((dd, i) => (i === d ? newDay : dd)),
      },
    };
  });
}

function postponeSessionPlan(
  plan: WorkoutPlan,
  sessionId: string,
  minutes: number,
): WorkoutPlan {
  return mapSessionsByIdPlan(plan, sessionId, (p, d, s) => {
    const day = p.plan.days[d];
    const session = day.sessions[s];
    const newEarliest = addMinutesToTime(session.time_window.earliest, minutes);
    const finalEarliest = isTimeAfter(newEarliest, session.time_window.latest)
      ? session.time_window.latest
      : newEarliest;
    const newSession = {
      ...session,
      time_window: { ...session.time_window, earliest: finalEarliest },
    };
    const newDay = {
      ...day,
      sessions: day.sessions.map((ss, i) => (i === s ? newSession : ss)),
    };
    return {
      ...p,
      plan: {
        ...p.plan,
        days: p.plan.days.map((dd, i) => (i === d ? newDay : dd)),
      },
    };
  });
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => ({
      plan: null,

      setPlan: (p) => set({ plan: p }),
      clearPlan: () => set({ plan: null }),

      markExerciseExecution: (sessionId, blockIdx, exIdx, update) => {
        const curr = get().plan;
        if (!curr) return;
        const updated = setExerciseExecution(
          curr,
          sessionId,
          blockIdx,
          exIdx,
          update,
        );
        const weightKg = updated.plan.user_profile.weight_kg;
        set({ plan: recomputeActuals(updated, weightKg) });
      },

      markSessionExecution: (sessionId, update) => {
        const curr = get().plan;
        if (!curr) return;
        const updated = setSessionExecution(curr, sessionId, update);
        const weightKg = updated.plan.user_profile.weight_kg;
        set({ plan: recomputeActuals(updated, weightKg) });
      },

      postponeSession: (sessionId, minutes) => {
        const curr = get().plan;
        if (!curr) return;
        set({ plan: postponeSessionPlan(curr, sessionId, minutes) });
      },
    }),
    {
      name: "fitness.plan",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
