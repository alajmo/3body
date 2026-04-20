import type { RocketKind } from "@3body/shared";

export const CAMERA_SHAKE_DURATION_SEC = 0.3;
export const ROCKET_IMPACT_SCREEN_FLASH_DURATION_SEC = 0.24;
export const ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC = 0.32;

const MAX_CAMERA_SHAKE_WORLD_OFFSET = 34;

const ROCKET_IMPACT_CAMERA_SHAKE_BY_KIND = {
  heavy: 0.62,
  light: 0.44,
  seeker: 0.5,
} as const satisfies Record<RocketKind, number>;

const ROCKET_IMPACT_SCREEN_FLASH_BY_KIND = {
  heavy: 0.58,
  light: 0.42,
  seeker: 0.48,
} as const satisfies Record<RocketKind, number>;

const ROCKET_IMPACT_HUD_FLICKER_BY_KIND = {
  heavy: 0.72,
  light: 0.52,
  seeker: 0.6,
} as const satisfies Record<RocketKind, number>;

export const getRocketImpactCameraShake = ({
  absorbedByShield,
  rocketKind,
}: {
  absorbedByShield: boolean;
  rocketKind: RocketKind;
}): number => {
  const baseShake = ROCKET_IMPACT_CAMERA_SHAKE_BY_KIND[rocketKind];

  return absorbedByShield ? baseShake * 0.72 : baseShake;
};

export const getRocketImpactScreenFlash = ({
  absorbedByShield,
  rocketKind,
}: {
  absorbedByShield: boolean;
  rocketKind: RocketKind;
}): number => {
  const baseFlash = ROCKET_IMPACT_SCREEN_FLASH_BY_KIND[rocketKind];

  return absorbedByShield ? baseFlash * 0.76 : baseFlash;
};

export const getRocketImpactHudFlicker = ({
  absorbedByShield,
  rocketKind,
}: {
  absorbedByShield: boolean;
  rocketKind: RocketKind;
}): number => {
  const baseFlicker = ROCKET_IMPACT_HUD_FLICKER_BY_KIND[rocketKind];

  return absorbedByShield ? baseFlicker * 0.78 : baseFlicker;
};

export const getViewportCameraShakeOffsets = ({
  cameraShake,
  followWorldHeight,
  nowSec,
  visibleWorldHeight,
}: {
  cameraShake: number;
  followWorldHeight: number;
  nowSec: number;
  visibleWorldHeight: number;
}): { x: number; y: number } => {
  if (cameraShake <= 0) {
    return { x: 0, y: 0 };
  }

  const shakeMagnitude =
    MAX_CAMERA_SHAKE_WORLD_OFFSET *
    (visibleWorldHeight / Math.max(followWorldHeight, Number.EPSILON)) *
    cameraShake *
    cameraShake;

  return {
    x:
      shakeMagnitude *
      (Math.sin(nowSec * 64 + 0.4) * 0.68 +
        Math.sin(nowSec * 117 + 1.7) * 0.32),
    y:
      shakeMagnitude *
      (Math.cos(nowSec * 73 + 0.8) * 0.62 +
        Math.sin(nowSec * 109 + 2.1) * 0.38),
  };
};
