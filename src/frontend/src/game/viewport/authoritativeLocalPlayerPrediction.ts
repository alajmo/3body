import type {
  NeutronStar,
  PlanetPublic,
  PlayerId,
  Sun,
  World,
  WorldOrbitStarMotion,
} from "@3body/shared";
import {
  advanceWorldOrbitStarMotion,
  clamp,
  FIXED_STEP_SEC,
  getUmbraDragStepMultiplier,
  scale,
  SIM_HZ,
  stepBody,
  stepNeutronStars,
  stepSunsWithOrbitMotion,
} from "@3body/shared";

const MAX_LOCAL_PLAYER_PREDICTION_MS = 50;
const UMBRA_DRAG_STEP_MULTIPLIER = getUmbraDragStepMultiplier(SIM_HZ);

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
  snapshotTick,
  snapshotWorld,
}: {
  playerId: PlayerId;
  predictionMs: number;
  renderWorld: World;
  snapshotTick: number;
  snapshotWorld: World;
}): PlanetPublic | null => {
  const predicted = predictAuthoritativeLocalPlayerPlanet({
    playerId,
    predictionMs,
    snapshotTick,
    world: snapshotWorld,
  });
  if (predicted === null) {
    return null;
  }

  const renderPlayerPlanet =
    renderWorld.planets.find((planet) => planet.playerId === playerId) ?? null;
  if (renderPlayerPlanet === null) {
    return predicted;
  }

  return syncPredictedPlanetInto(renderPlayerPlanet, predicted);
};
