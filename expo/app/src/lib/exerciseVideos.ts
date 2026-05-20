import { getExerciseVideoSource } from "./exerciseVideoMap.generated";

export function getExerciseVideo(exerciseId: string): number | undefined {
  return getExerciseVideoSource(exerciseId);
}
