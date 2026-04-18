import { FIXED_STEP_SEC, clamp, lerp } from "@3body/shared";

// Matches the fixed cloak duration applied in combatSandbox.ts.
export const CLOAK_DURATION_SEC = 5;
export const CLOAK_FADE_TAIL_SEC = 0.6;
export const CLOAK_PLANET_FADE_IN_SEC = 0.32;
export const CLOAK_PLANET_TARGET_OPACITY = 0.5;

export const getCloakRemainingSec = (
  hideTrailUntilTick: number,
  currentTick: number,
): number => Math.max(0, hideTrailUntilTick - currentTick) * FIXED_STEP_SEC;

export const getCloakPlanetOpacity = (
  hideTrailUntilTick: number,
  currentTick: number,
): number => {
  const remainingSec = getCloakRemainingSec(hideTrailUntilTick, currentTick);
  if (hideTrailUntilTick <= 0 || remainingSec <= 0) {
    return 1;
  }

  const fadeIn = clamp(
    (CLOAK_DURATION_SEC - remainingSec) / CLOAK_PLANET_FADE_IN_SEC,
    0,
    1,
  );
  const fadeOut = clamp(remainingSec / CLOAK_FADE_TAIL_SEC, 0, 1);

  return lerp(1, CLOAK_PLANET_TARGET_OPACITY, Math.min(fadeIn, fadeOut));
};
