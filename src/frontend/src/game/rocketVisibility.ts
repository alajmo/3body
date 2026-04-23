import {
  ROCKET_SPECS,
  type CannonVisualTuning,
  type RocketKind,
  type Vec2,
} from "@3body/shared";

export const ROCKET_RENDER_INSTANCE_LIMITS = {
  heavy: 48,
  light: 160,
  seeker: 64,
} as const satisfies Record<RocketKind, number>;

export const ROCKET_MIN_SCREEN_WIDTH_PX = {
  body: 1.8,
  flame: 2.2,
  launchBurst: 2.4,
  trail: 1.6,
} as const;

interface CannonWorldLayout {
  bandLenWorld: number;
  bandRadiusWorld: number;
  barrelLenWorld: number;
  barrelRadiusWorld: number;
  breechDepthWorld: number;
  breechLenWorld: number;
  breechWidthWorld: number;
  flashDurationSec: number;
  flashRadiusWorld: number;
  muzzleLenWorld: number;
  muzzleRadiusWorld: number;
  stemLenWorld: number;
  stemRadiusWorld: number;
}

export const getMinScreenAxisScale = (
  baseScale: Vec2,
  minWidthPx: number,
  worldUnitsPerPixel: number,
): Vec2 => ({
  x: baseScale.x,
  y: Math.max(baseScale.y, minWidthPx * worldUnitsPerPixel),
});

export const getCannonWorldLayout = (
  visuals: CannonVisualTuning,
  worldUnitsPerPixel: number,
): CannonWorldLayout => ({
  bandLenWorld: visuals.bandLength * worldUnitsPerPixel,
  bandRadiusWorld: visuals.bandWidth * 0.5 * worldUnitsPerPixel,
  barrelLenWorld: visuals.barrelLength * worldUnitsPerPixel,
  barrelRadiusWorld: visuals.barrelWidth * 0.5 * worldUnitsPerPixel,
  breechDepthWorld: visuals.breechDepth * worldUnitsPerPixel,
  breechLenWorld: visuals.breechLength * worldUnitsPerPixel,
  breechWidthWorld: visuals.breechWidth * worldUnitsPerPixel,
  flashDurationSec: visuals.flashDurationSec,
  flashRadiusWorld: visuals.flashRadius * worldUnitsPerPixel,
  muzzleLenWorld: visuals.muzzleLength * worldUnitsPerPixel,
  muzzleRadiusWorld: visuals.muzzleRadius * worldUnitsPerPixel,
  stemLenWorld: visuals.stemLength * worldUnitsPerPixel,
  stemRadiusWorld: visuals.stemWidth * 0.5 * worldUnitsPerPixel,
});

const getMaxConcurrentRocketsPerController = (rocketKind: RocketKind): number =>
  Math.floor(
    ROCKET_SPECS[rocketKind].ttlSec / ROCKET_SPECS[rocketKind].reloadSec,
  ) + 1;

export const getMaxConcurrentRocketsForControllers = (
  controllerCount: number,
  rocketKind: RocketKind,
): number =>
  Math.max(0, Math.floor(controllerCount)) *
  getMaxConcurrentRocketsPerController(rocketKind);

export const getCannonMuzzleDistance = (
  surfaceOffset: number,
  stemLenWorld: number,
  breechLenWorld: number,
  barrelLenWorld: number,
): number => surfaceOffset + stemLenWorld + breechLenWorld + barrelLenWorld;

export const getCannonMuzzleDistanceFromLayout = (
  surfaceOffset: number,
  layout: Pick<
    CannonWorldLayout,
    "stemLenWorld" | "breechLenWorld" | "barrelLenWorld"
  >,
): number =>
  getCannonMuzzleDistance(
    surfaceOffset,
    layout.stemLenWorld,
    layout.breechLenWorld,
    layout.barrelLenWorld,
  );

export const getCannonMuzzleOrigin = (
  origin: Vec2,
  dir: Vec2,
  muzzleDistance: number,
): Vec2 => ({
  x: origin.x + dir.x * muzzleDistance,
  y: origin.y + dir.y * muzzleDistance,
});

export const getRocketVisibleDistanceThreshold = (
  muzzleDistance: number,
  rocketBodyLength: number,
): number => Math.max(0, muzzleDistance - rocketBodyLength * 0.5);

export const isRocketPastVisibleMuzzle = (
  simDistance: number,
  muzzleDistance: number,
  rocketBodyLength: number,
): boolean =>
  simDistance >=
  getRocketVisibleDistanceThreshold(muzzleDistance, rocketBodyLength);

export const getLaunchBurstTravelDistance = (
  ageSec: number,
  speed: number,
): number => Math.max(0, ageSec) * Math.max(0, speed);

export const getLaunchBurstHandoffDuration = (
  spawnDistance: number,
  visibleDistance: number,
  speed: number,
): number => {
  if (speed <= 0) {
    return 0;
  }

  return Math.max(0, visibleDistance - spawnDistance) / speed;
};
