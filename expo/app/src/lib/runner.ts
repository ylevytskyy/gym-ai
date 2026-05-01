// Linearizes a session into an ordered list of "runner steps" so the runner
// UI can just walk through an array instead of juggling nested indices.

import type { Session } from "@src/types";
import { exerciseText } from "./catalog";

export type RunnerStep =
  | {
      kind: "countdown";
      // "About to start <exerciseName> — 3..2..1"
      exerciseName: string;
      blockIdx: number;
      exIdx: number;
    }
  | {
      kind: "set";
      blockIdx: number;
      exIdx: number;
      setIdx: number; // 0-based
      roundIdx: number; // 0-based
      totalSets: number;
      totalRounds: number;
      exerciseId: string;
      exerciseName: string;
      unit: "reps" | "seconds" | "meters_climbed";
      amount: number;
      restSeconds: number;
      instructions: string[];
      commonMistakes: string[];
      intensity: Session["intensity"];
    }
  | {
      kind: "rest";
      seconds: number;
      nextExerciseName: string | null;
    };

export function buildRunnerSteps(session: Session): RunnerStep[] {
  const steps: RunnerStep[] = [];
  const blocks = session.blocks;

  // We want a 3-2-1 countdown before the very first set, and before each
  // new exercise within a block (not between sets of the same exercise).
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    for (let r = 0; r < block.rounds; r++) {
      for (let ei = 0; ei < block.exercises.length; ei++) {
        const pe = block.exercises[ei];
        const text = exerciseText(pe.exercise_id);
        const exName = text.name;
        const instructions = text.instructions;
        const mistakes = text.common_mistakes;

        // Countdown only before the FIRST set of this exercise in this round
        steps.push({
          kind: "countdown",
          exerciseName: exName,
          blockIdx: bi,
          exIdx: ei,
        });

        for (let si = 0; si < pe.sets; si++) {
          steps.push({
            kind: "set",
            blockIdx: bi,
            exIdx: ei,
            setIdx: si,
            roundIdx: r,
            totalSets: pe.sets,
            totalRounds: block.rounds,
            exerciseId: pe.exercise_id,
            exerciseName: exName,
            unit: pe.unit,
            amount: pe.amount,
            restSeconds: pe.rest_seconds,
            instructions,
            commonMistakes: mistakes,
            intensity: session.intensity,
          });

          // Rest after each set except the very last step overall.
          const isLastSetOfExercise = si === pe.sets - 1;
          const isLastExInBlock = ei === block.exercises.length - 1;
          const isLastRound = r === block.rounds - 1;
          const isLastBlock = bi === blocks.length - 1;
          const isFinalSetEver =
            isLastSetOfExercise &&
            isLastExInBlock &&
            isLastRound &&
            isLastBlock;
          if (!isFinalSetEver) {
            // Compute next exercise name to show on the rest screen
            let nextName: string | null = null;
            if (isLastSetOfExercise && !isLastExInBlock) {
              nextName = exerciseText(block.exercises[ei + 1].exercise_id).name;
            } else if (isLastSetOfExercise && !isLastRound) {
              // loop back to the first exercise of this block
              nextName = exerciseText(block.exercises[0].exercise_id).name;
            } else if (isLastSetOfExercise && !isLastBlock) {
              const nb = blocks[bi + 1];
              nextName = exerciseText(nb.exercises[0].exercise_id).name;
            }
            steps.push({
              kind: "rest",
              seconds: pe.rest_seconds,
              nextExerciseName: nextName,
            });
          }
        }
      }
    }
  }

  return steps;
}

export function countSetSteps(steps: RunnerStep[]): number {
  return steps.filter((s) => s.kind === "set").length;
}
