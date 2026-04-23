import type {
  NeutronStar,
  PlanetPublic,
  PlayerId,
  Sun,
  Vec2,
  World,
  WorldOrbitStarMotion,
} from "@3body/shared";
import {
  advanceWorldOrbitStarMotion,
  clamp,
  FIXED_STEP_SEC,
  getUmbraDragStepMultiplier,
  lerp,
  scale,
  SIM_HZ,
  stepBody,
  stepNeutronStars,
  stepSunsWithOrbitMotion,
} from "@3body/shared";

const MAX_LOCAL_PLAYER_PREDICTION_MS = 50;
const LOCAL_PLAYER_CORRECTION_LERP = 22;
const LOCAL_PLAYER_CORRECTION_SNAP_RADIUS_MULTIPLIER = 8;
const LOCAL_PLAYER_CORRECTION_SNAP_DISTANCE = 120;
const UMBRA_DRAG_STEP_MULTIPLIER = getUmbraDragStepMultiplier(SIM_HZ);

interface AuthoritativeLocalPlayerPredictionSmoothingState {
  planetId: number | null;
  playerId: PlayerId | null;
  snapshotTick: number | null;
  pos: Vec2;
  vel: Vec2;
}

export const createAuthoritativeLocalPlayerPredictionSmoothingState =
  (): AuthoritativeLocalPlayerPredictionSmoothingState => ({
    planetId: null,
    playerId: null,
    pos: { x: 0, y: 0 },
    snapshotTick: null,
    vel: { x: 0, y: 0 },
  });

const clonePredictedPlanet = (planet: PlanetPublic): PlanetPublic => ({
  ...planet,
  debuffs: { ...planet.debuffs },
  pos: {
    x: planet.pos.x,
    y: planet.pos.y,
  },
  shieldAimDir: {
    x: planet.shieldAimDir.x,
    y: planet.shieldAimDir.y,
  },
  vel: {
    x: planet.vel.x,
    y: planet.vel.y,
  },
});

const normalizePredictionDebuffs = (
  debuffs: PlanetPublic["debuffs"],
  nextTick: number,
): PlanetPublic["debuffs"] =>
  debuffs.dragUntilTick !== undefined && debuffs.dragUntilTick <= nextTick
    ? {}
    : { ...debuffs };

const getPredictionDragMultiplier = (dtSec: number): number =>
  UMBRA_DRAG_STEP_MULTIPLIER ** (dtSec / FIXED_STEP_SEC);

const stepPredictedPlanet = ({
  blackHole,
  dtSec,
  neutronStars,
  orbitStarMotion,
  planet,
  suns,
  nextTick,
}: {
  blackHole: World["blackHole"];
  dtSec: number;
  neutronStars: readonly NeutronStar[];
  orbitStarMotion: WorldOrbitStarMotion | undefined;
  planet: PlanetPublic;
  suns: readonly Sun[];
  nextTick: number;
}): {
  neutronStars: NeutronStar[];
  orbitStarMotion: WorldOrbitStarMotion | undefined;
  planet: PlanetPublic;
  suns: Sun[];
} => {
  const nextSuns = stepSunsWithOrbitMotion(
    suns,
    dtSec,
    blackHole,
    orbitStarMotion,
  );
  const nextNeutronStars = stepNeutronStars(neutronStars, dtSec, blackHole);
  const nextOrbitStarMotion = advanceWorldOrbitStarMotion(
    orbitStarMotion,
    dtSec,
    nextSuns,
  );
  const normalizedDebuffs = normalizePredictionDebuffs(
    planet.debuffs,
    nextTick,
  );
  const steppedPlanet = stepBody(
    {
      ...planet,
      debuffs: normalizedDebuffs,
    },
    nextSuns,
    dtSec,
    blackHole,
    nextNeutronStars,
  );
  const dragActive =
    planet.debuffs.dragUntilTick !== undefined &&
    planet.debuffs.dragUntilTick > nextTick;

  return {
    neutronStars: nextNeutronStars,
    orbitStarMotion: nextOrbitStarMotion,
    planet: dragActive
      ? {
          ...steppedPlanet,
          vel: scale(steppedPlanet.vel, getPredictionDragMultiplier(dtSec)),
        }
      : steppedPlanet,
    suns: nextSuns,
  };
};

const syncPredictedPlanetInto = (
  target: PlanetPublic,
  predicted: PlanetPublic,
): PlanetPublic => {
  target.pos.x = predicted.pos.x;
  target.pos.y = predicted.pos.y;
  target.vel.x = predicted.vel.x;
  target.vel.y = predicted.vel.y;
  target.shieldAimDir.x = predicted.shieldAimDir.x;
  target.shieldAimDir.y = predicted.shieldAimDir.y;
  target.hp = predicted.hp;
  target.radius = predicted.radius;
  target.shieldActive = predicted.shieldActive;
  target.shieldLoad = predicted.shieldLoad;
  target.shieldMaxLoad = predicted.shieldMaxLoad;
  target.debuffs = { ...predicted.debuffs };
  return target;
};

const getDistance = (a: Vec2, b: Vec2): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const syncSmoothingStateToPlanet = (
  state: AuthoritativeLocalPlayerPredictionSmoothingState,
  playerId: PlayerId,
  predicted: PlanetPublic,
  snapshotTick: number,
) => {
  state.planetId = predicted.id;
  state.playerId = playerId;
  state.snapshotTick = snapshotTick;
  state.pos.x = predicted.pos.x;
  state.pos.y = predicted.pos.y;
  state.vel.x = predicted.vel.x;
  state.vel.y = predicted.vel.y;
};

const smoothPredictedPlanet = ({
  frameDeltaSec,
  playerId,
  predicted,
  snapshotTick,
  state,
}: {
  frameDeltaSec: number;
  playerId: PlayerId;
  predicted: PlanetPublic;
  snapshotTick: number;
  state: AuthoritativeLocalPlayerPredictionSmoothingState;
}): PlanetPublic => {
  const snapDistance = Math.max(
    LOCAL_PLAYER_CORRECTION_SNAP_DISTANCE,
    predicted.radius * LOCAL_PLAYER_CORRECTION_SNAP_RADIUS_MULTIPLIER,
  );
  const shouldSnap =
    state.planetId !== predicted.id ||
    state.playerId !== playerId ||
    state.snapshotTick === null ||
    snapshotTick < state.snapshotTick ||
    getDistance(state.pos, predicted.pos) > snapDistance;

  if (shouldSnap) {
    syncSmoothingStateToPlanet(state, playerId, predicted, snapshotTick);
  } else {
    const alpha =
      1 -
      Math.exp(-LOCAL_PLAYER_CORRECTION_LERP * clamp(frameDeltaSec, 0, 0.1));
    state.snapshotTick = snapshotTick;
    state.pos.x = lerp(state.pos.x, predicted.pos.x, alpha);
    state.pos.y = lerp(state.pos.y, predicted.pos.y, alpha);
    state.vel.x = lerp(state.vel.x, predicted.vel.x, alpha);
    state.vel.y = lerp(state.vel.y, predicted.vel.y, alpha);
  }

  return {
    ...predicted,
    pos: {
      x: state.pos.x,
      y: state.pos.y,
    },
    vel: {
      x: state.vel.x,
      y: state.vel.y,
    },
  };
};

export const predictAuthoritativeLocalPlayerPlanet = ({
  playerId,
  predictionMs,
  snapshotTick,
  world,
}: {
  playerId: PlayerId;
  predictionMs: number;
  snapshotTick: number;
  world: World;
}): PlanetPublic | null => {
  const playerPlanet =
    world.planets.find((planet) => planet.playerId === playerId) ?? null;
  if (playerPlanet === null) {
    return null;
  }

  const predictionSec =
    clamp(predictionMs, 0, MAX_LOCAL_PLAYER_PREDICTION_MS) * 0.001;
  let predictedPlanet = clonePredictedPlanet(playerPlanet);
  let predictedSuns = world.suns;
  let predictedNeutronStars = world.neutronStars;
  let orbitStarMotion = world.orbitStarMotion;
  let simulatedTick = snapshotTick;
  let remainingPredictionSec = predictionSec;

  while (remainingPredictionSec > 1e-6) {
    const stepSec = Math.min(FIXED_STEP_SEC, remainingPredictionSec);
    simulatedTick += 1;
    const nextPredictionState = stepPredictedPlanet({
      blackHole: world.blackHole,
      dtSec: stepSec,
      neutronStars: predictedNeutronStars,
      orbitStarMotion,
      planet: predictedPlanet,
      suns: predictedSuns,
      nextTick: simulatedTick,
    });
    predictedPlanet = nextPredictionState.planet;
    predictedSuns = nextPredictionState.suns;
    predictedNeutronStars = nextPredictionState.neutronStars;
    orbitStarMotion = nextPredictionState.orbitStarMotion;
    remainingPredictionSec -= stepSec;
  }

  return predictedPlanet;
};

export const syncAuthoritativeLocalPlayerPrediction = ({
  playerId,
  predictionMs,
  renderWorld,
  smoothing,
  snapshotTick,
  snapshotWorld,
}: {
  playerId: PlayerId;
  predictionMs: number;
  renderWorld: World;
  smoothing?: {
    frameDeltaSec: number;
    state: AuthoritativeLocalPlayerPredictionSmoothingState;
  };
  snapshotTick: number;
  snapshotWorld: World;
}): PlanetPublic | null => {
  const rawPredicted = predictAuthoritativeLocalPlayerPlanet({
    playerId,
    predictionMs,
    snapshotTick,
    world: snapshotWorld,
  });
  if (rawPredicted === null) {
    return null;
  }
  const predicted =
    smoothing === undefined
      ? rawPredicted
      : smoothPredictedPlanet({
          frameDeltaSec: smoothing.frameDeltaSec,
          playerId,
          predicted: rawPredicted,
          snapshotTick,
          state: smoothing.state,
        });

  const renderPlayerPlanet =
    renderWorld.planets.find((planet) => planet.playerId === playerId) ?? null;
  if (renderPlayerPlanet === null) {
    return predicted;
  }

  return syncPredictedPlanetInto(renderPlayerPlanet, predicted);
};
