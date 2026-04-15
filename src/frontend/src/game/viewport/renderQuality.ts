export interface ViewportRenderQualityProfile {
  maxPixelRatio: number;
  ssaaLevel: number;
}

const QUALITY_PROFILES = [
  {
    maxPixelRatio: 1.1,
    ssaaLevel: 0,
  },
  {
    maxPixelRatio: 1.5,
    ssaaLevel: 1,
  },
  {
    maxPixelRatio: 2.1,
    ssaaLevel: 2,
  },
] as const satisfies readonly ViewportRenderQualityProfile[];

const DOWNGRADE_FRAME_TIME_MS = 19.5;
const UPGRADE_FRAME_TIME_MS = 13;
const DOWNGRADE_HOLD_SEC = 0.75;
const UPGRADE_HOLD_SEC = 2.5;
const ADJUSTMENT_COOLDOWN_SEC = 1.25;

export const createAdaptiveQualityController = (
  initialIndex = QUALITY_PROFILES.length - 1,
): {
  getProfile: () => ViewportRenderQualityProfile;
  update: (
    nowSec: number,
    frameTimeMs: number,
  ) => { changed: boolean; profile: ViewportRenderQualityProfile };
} => {
  let profileIndex = initialIndex;
  let downgradePressureSec = 0;
  let upgradePressureSec = 0;
  let lastAdjustedAtSec = Number.NEGATIVE_INFINITY;

  return {
    getProfile() {
      return QUALITY_PROFILES[profileIndex]!;
    },
    update(nowSec, frameTimeMs) {
      if (!(frameTimeMs > 0)) {
        return {
          changed: false,
          profile: QUALITY_PROFILES[profileIndex]!,
        };
      }

      if (frameTimeMs >= DOWNGRADE_FRAME_TIME_MS) {
        downgradePressureSec += frameTimeMs * 0.001;
        upgradePressureSec = 0;
      } else if (frameTimeMs <= UPGRADE_FRAME_TIME_MS) {
        upgradePressureSec += frameTimeMs * 0.001;
        downgradePressureSec = 0;
      } else {
        downgradePressureSec = 0;
        upgradePressureSec = 0;
      }

      if (nowSec - lastAdjustedAtSec < ADJUSTMENT_COOLDOWN_SEC) {
        return {
          changed: false,
          profile: QUALITY_PROFILES[profileIndex]!,
        };
      }

      if (downgradePressureSec >= DOWNGRADE_HOLD_SEC && profileIndex > 0) {
        profileIndex -= 1;
        downgradePressureSec = 0;
        upgradePressureSec = 0;
        lastAdjustedAtSec = nowSec;
        return {
          changed: true,
          profile: QUALITY_PROFILES[profileIndex]!,
        };
      }

      if (
        upgradePressureSec >= UPGRADE_HOLD_SEC &&
        profileIndex < QUALITY_PROFILES.length - 1
      ) {
        profileIndex += 1;
        downgradePressureSec = 0;
        upgradePressureSec = 0;
        lastAdjustedAtSec = nowSec;
        return {
          changed: true,
          profile: QUALITY_PROFILES[profileIndex]!,
        };
      }

      return {
        changed: false,
        profile: QUALITY_PROFILES[profileIndex]!,
      };
    },
  };
};
