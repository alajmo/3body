import type { PlanetPublic, PlayerId, Vec2, World } from "@3body/shared";

const LOCAL_PLANET_RECONCILIATION_RATE = 32;
const LOCAL_PLANET_RECONCILIATION_SNAP_DISTANCE = 1_200;

export interface AuthoritativeLocalPlanetPresentationState {
  planetId: number | null;
  pos: Vec2;
}

export const createAuthoritativeLocalPlanetPresentationState =
  (): AuthoritativeLocalPlanetPresentationState => ({
    planetId: null,
    pos: { x: 0, y: 0 },
  });

const resetAuthoritativeLocalPlanetPresentationState = (
  state: AuthoritativeLocalPlanetPresentationState,
) => {
  state.planetId = null;
  state.pos.x = 0;
  state.pos.y = 0;
};

const syncAuthoritativeLocalPlanetPresentationState = (
  state: AuthoritativeLocalPlanetPresentationState,
  planet: PlanetPublic,
) => {
  state.planetId = planet.id;
  state.pos.x = planet.pos.x;
  state.pos.y = planet.pos.y;
};

export const reconcileAuthoritativeLocalPlanetPresentation = ({
  frameDeltaSec,
  playerId,
  state,
  world,
}: {
  frameDeltaSec: number;
  playerId: PlayerId | null;
  state: AuthoritativeLocalPlanetPresentationState;
  world: World | null;
}): PlanetPublic | null => {
  if (playerId === null || world === null) {
    resetAuthoritativeLocalPlanetPresentationState(state);
    return null;
  }

  const playerPlanet =
    world.planets.find((planet) => planet.playerId === playerId) ?? null;
  if (playerPlanet === null) {
    resetAuthoritativeLocalPlanetPresentationState(state);
    return null;
  }

  if (state.planetId !== playerPlanet.id) {
    syncAuthoritativeLocalPlanetPresentationState(state, playerPlanet);
    return playerPlanet;
  }

  const safeFrameDeltaSec = Number.isFinite(frameDeltaSec)
    ? Math.max(0, frameDeltaSec)
    : 0;
  const targetX = playerPlanet.pos.x;
  const targetY = playerPlanet.pos.y;
  const predictedX = state.pos.x + playerPlanet.vel.x * safeFrameDeltaSec;
  const predictedY = state.pos.y + playerPlanet.vel.y * safeFrameDeltaSec;
  const correctionX = targetX - predictedX;
  const correctionY = targetY - predictedY;
  const correctionDistanceSq =
    correctionX * correctionX + correctionY * correctionY;

  if (
    correctionDistanceSq >=
    LOCAL_PLANET_RECONCILIATION_SNAP_DISTANCE *
      LOCAL_PLANET_RECONCILIATION_SNAP_DISTANCE
  ) {
    syncAuthoritativeLocalPlanetPresentationState(state, playerPlanet);
    return playerPlanet;
  }

  const correctionAlpha =
    1 - Math.exp(-LOCAL_PLANET_RECONCILIATION_RATE * safeFrameDeltaSec);
  state.pos.x = predictedX + correctionX * correctionAlpha;
  state.pos.y = predictedY + correctionY * correctionAlpha;
  playerPlanet.pos.x = state.pos.x;
  playerPlanet.pos.y = state.pos.y;

  return playerPlanet;
};
