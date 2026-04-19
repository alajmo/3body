import type { GameTuningDocument, RocketVisualTuning, Vec2 } from "@3body/shared";

const scaleVec2 = (value: Vec2, scale: number): Vec2 => ({
  x: value.x * scale,
  y: value.y * scale,
});

export const getScaledRocketVisualTuning = (
  profile: RocketVisualTuning,
): RocketVisualTuning => ({
  ...profile,
  bodyScale: scaleVec2(profile.bodyScale, profile.scale),
  flameScale: scaleVec2(profile.flameScale, profile.scale),
  trailScale: scaleVec2(profile.trailScale, profile.scale),
});

export const getScaledRocketVisuals = (
  rockets: GameTuningDocument["visuals"]["rockets"],
): GameTuningDocument["visuals"]["rockets"] => ({
  heavy: getScaledRocketVisualTuning(rockets.heavy),
  light: getScaledRocketVisualTuning(rockets.light),
  seeker: getScaledRocketVisualTuning(rockets.seeker),
});
