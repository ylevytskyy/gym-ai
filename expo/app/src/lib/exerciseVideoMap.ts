const map: Record<string, number> = {
  "bodyweight-squats": require("../../assets/exercise-renders/squat.mp4"),
  "standard-push-ups": require("../../assets/exercise-renders/pushup.mp4"),
  "forearm-plank":     require("../../assets/exercise-renders/plank.mp4"),
  "jumping-jacks":     require("../../assets/exercise-renders/jumping_jacks.mp4"),
  "high-knees":        require("../../assets/exercise-renders/high_knees.mp4"),
};

export function getExerciseVideoSource(exerciseId: string): number | undefined {
  return map[exerciseId];
}
