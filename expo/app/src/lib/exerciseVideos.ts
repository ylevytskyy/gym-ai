import { getExerciseVideoSource } from "./exerciseVideoMap";

export function getExerciseVideo(exerciseId: string): number | undefined {
  return getExerciseVideoSource(exerciseId);
}
