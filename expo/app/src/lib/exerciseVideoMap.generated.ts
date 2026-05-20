// AUTO-GENERATED from assets/exercise-renders/ by scripts/sync-exercise-videos.ts
// Do not edit by hand — re-run: pnpm sync-videos

const map: Record<string, number> = {
  "bicycle-crunches": require("../../assets/exercise-renders/bicycle_crunches.mp4"),
  "bird-dog": require("../../assets/exercise-renders/bird_dog.mp4"),
  "bodyweight-squats": require("../../assets/exercise-renders/bodyweight-squats.mp4"),
  "burpees": require("../../assets/exercise-renders/burpees.mp4"),
  "butt-kicks": require("../../assets/exercise-renders/butt_kicks.mp4"),
  "calf-raises": require("../../assets/exercise-renders/calf_raises.mp4"),
  "cat-cow": require("../../assets/exercise-renders/cat_cow.mp4"),
  "dead-bug": require("../../assets/exercise-renders/dead_bug.mp4"),
  "diamond-push-ups": require("../../assets/exercise-renders/diamond-push-ups.mp4"),
  "downward-dog": require("../../assets/exercise-renders/downward_dog.mp4"),
  "flutter-kicks": require("../../assets/exercise-renders/flutter_kicks.mp4"),
  "forearm-plank": require("../../assets/exercise-renders/forearm-plank.mp4"),
  "glute-bridges": require("../../assets/exercise-renders/glute_bridges.mp4"),
  "hamstring-stretch": require("../../assets/exercise-renders/hamstring_stretch.mp4"),
  "high-knees": require("../../assets/exercise-renders/high_knees.mp4"),
  "hollow-hold": require("../../assets/exercise-renders/hollow_hold.mp4"),
  "inchworms": require("../../assets/exercise-renders/inchworms.mp4"),
  "jumping-jacks": require("../../assets/exercise-renders/jumping_jacks.mp4"),
  "knee-push-ups": require("../../assets/exercise-renders/knee-push-ups.mp4"),
  "leg-raises": require("../../assets/exercise-renders/leg_raises.mp4"),
  "lunge-jumps": require("../../assets/exercise-renders/lunge_jumps.mp4"),
  "mountain-climbers": require("../../assets/exercise-renders/mountain_climbers.mp4"),
  "pike-push-ups": require("../../assets/exercise-renders/pike-push-ups.mp4"),
  "plank-jacks": require("../../assets/exercise-renders/plank_jacks.mp4"),
  "plank-shoulder-taps": require("../../assets/exercise-renders/plank_shoulder_taps.mp4"),
  "quad-stretch": require("../../assets/exercise-renders/quad_stretch.mp4"),
  "reverse-lunges": require("../../assets/exercise-renders/reverse_lunges.mp4"),
  "scissor-kicks": require("../../assets/exercise-renders/scissor_kicks.mp4"),
  "shadow-boxing": require("../../assets/exercise-renders/shadow_boxing.mp4"),
  "side-lunges": require("../../assets/exercise-renders/side_lunges.mp4"),
  "side-plank": require("../../assets/exercise-renders/side_plank.mp4"),
  "standard-push-ups": require("../../assets/exercise-renders/standard-push-ups.mp4"),
};

export function getExerciseVideoSource(exerciseId: string): number | undefined {
  return map[exerciseId];
}
