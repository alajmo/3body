import type { RocketKind } from "@3body/shared";
import { add, clamp, scale, type Vec2 } from "@3body/shared";
import {
  getCannonMuzzleDistanceFromLayout,
  getCannonWorldLayout,
  getLaunchBurstHandoffDuration,
  getRocketVisibleDistanceThreshold,
} from "../rocketVisibility";

export interface SharedCombatLaunchBurstState {
  dir: Vec2;
  launchPlanetPos: Vec2;
  launchPlanetRadius: number;
  origin: Vec2;
  ownerId: string;
  rocketKind: RocketKind;
  speed: number;
  startedAtSec: number;
}

export interface SharedCombatLaunchBurstLayout {
  angle: number;
  center: Vec2;
  length: number;
  width: number;
}

export interface SharedCombatLaunchBurstScale {
  x: number;
  y: number;
}

export const getSharedCombatLaunchBurstDuration = ({
  bodyScale,
  burst,
  cannonLayout,
}: {
  bodyScale: SharedCombatLaunchBurstScale;
  burst: Pick<
    SharedCombatLaunchBurstState,
    "launchPlanetPos" | "launchPlanetRadius" | "origin" | "speed"
  >;
  cannonLayout: ReturnType<typeof getCannonWorldLayout>;
}): number => {
  const burstMuzzleDistance = getCannonMuzzleDistanceFromLayout(
    burst.launchPlanetRadius,
    cannonLayout,
  );
  const burstVisibleDistance = getRocketVisibleDistanceThreshold(
    burstMuzzleDistance,
    bodyScale.x,
  );
  const spawnDistance = Math.hypot(
    burst.origin.x - burst.launchPlanetPos.x,
    burst.origin.y - burst.launchPlanetPos.y,
  );

  return getLaunchBurstHandoffDuration(
    spawnDistance,
    burstVisibleDistance,
    burst.speed,
  );
};

export const getSharedCombatLaunchBurstLayout = ({
  ageSec,
  baseScale,
  direction,
  durationSec,
  lengthMultiplierEnd,
  lengthMultiplierStart,
  origin,
  speed,
  widthMultiplierEnd,
  widthMultiplierStart,
}: {
  ageSec: number;
  baseScale: SharedCombatLaunchBurstScale;
  direction: Vec2;
  durationSec: number;
  lengthMultiplierEnd: number;
  lengthMultiplierStart: number;
  origin: Vec2;
  speed: number;
  widthMultiplierEnd: number;
  widthMultiplierStart: number;
}): SharedCombatLaunchBurstLayout | null => {
  if (ageSec < 0 || ageSec > durationSec) {
    return null;
  }

  const progress = clamp(ageSec / Math.max(durationSec, 1e-6), 0, 1);
  const length =
    baseScale.x *
    (lengthMultiplierStart +
      (lengthMultiplierEnd - lengthMultiplierStart) * progress);
  const width =
    baseScale.y *
    (widthMultiplierStart +
      (widthMultiplierEnd - widthMultiplierStart) * progress);
  const travel = Math.max(0, ageSec) * speed;

  return {
    angle: Math.atan2(direction.y, direction.x),
    center: add(origin, scale(direction, travel + length * 0.5)),
    length,
    width,
  };
};
