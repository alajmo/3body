import type { PlayerId, PlanetPublic, Vec2, World } from "@3body/shared";
import {
  ROCKET_SPECS,
  add,
  len,
  normalize as normalizeVec2,
  scale,
} from "@3body/shared";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";

const DEFAULT_ROCKET_DIRECTION = { x: 1, y: 0 } satisfies Vec2;
const ROCKET_SPAWN_CLEARANCE = 10;

const findPlanetByPlayerId = (
  world: World | null | undefined,
  playerId: string,
): PlanetPublic | null =>
  world?.planets.find((planet) => planet.playerId === playerId) ?? null;

export const deriveAuthoritativeRocketLaunchBursts = ({
  currentPlayerId,
  previousWorld,
  snapshotReceivedAtSec,
  snapshotWorld,
}: {
  currentPlayerId: PlayerId | null;
  previousWorld: World;
  snapshotReceivedAtSec: number;
  snapshotWorld: World;
}): SharedCombatLaunchBurstState[] => {
  const previousRocketIds = new Set(
    previousWorld.rockets.map((rocket) => rocket.id),
  );
  const bursts: SharedCombatLaunchBurstState[] = [];

  for (const rocket of snapshotWorld.rockets) {
    if (previousRocketIds.has(rocket.id)) {
      continue;
    }
    if (currentPlayerId !== null && rocket.ownerId === currentPlayerId) {
      continue;
    }

    const speed = len(rocket.vel);
    const dir =
      speed > 0.001 ? normalizeVec2(rocket.vel) : DEFAULT_ROCKET_DIRECTION;
    const launchPlanet =
      findPlanetByPlayerId(snapshotWorld, rocket.ownerId) ??
      findPlanetByPlayerId(previousWorld, rocket.ownerId);
    const launchPlanetPos = launchPlanet
      ? {
          x: launchPlanet.pos.x,
          y: launchPlanet.pos.y,
        }
      : {
          x:
            rocket.pos.x -
            dir.x *
              (ROCKET_SPECS[rocket.rocketKind].radius + ROCKET_SPAWN_CLEARANCE),
          y:
            rocket.pos.y -
            dir.y *
              (ROCKET_SPECS[rocket.rocketKind].radius + ROCKET_SPAWN_CLEARANCE),
        };
    const launchPlanetRadius = launchPlanet?.radius ?? 0;
    const origin = add(
      launchPlanetPos,
      scale(
        dir,
        launchPlanetRadius +
          ROCKET_SPECS[rocket.rocketKind].radius +
          ROCKET_SPAWN_CLEARANCE,
      ),
    );
    const distanceAlongDirection = Math.max(
      0,
      (rocket.pos.x - origin.x) * dir.x + (rocket.pos.y - origin.y) * dir.y,
    );
    const startedAtSec =
      snapshotReceivedAtSec - (speed > 0 ? distanceAlongDirection / speed : 0);

    bursts.push({
      dir,
      launchPlanetPos,
      launchPlanetRadius,
      origin,
      ownerId: rocket.ownerId,
      rocketKind: rocket.rocketKind,
      speed,
      startedAtSec,
    });
  }

  return bursts;
};
