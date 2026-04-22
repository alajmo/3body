import {
  ARCHETYPES,
  ARENA_RADIUS,
  type ArchetypeId,
  BOOST_SPEC,
  CACHE_RADIUS,
  CACHE_SPEC,
  CACHE_TANGENTIAL_SPEED_MAX,
  CACHE_TANGENTIAL_SPEED_MIN,
  type Cache,
  clampOrbitPatternDistanceScale,
  createInitialAmmo,
  createNeutronStars,
  fromAngle,
  type GameTuningDocument,
  getOrbitIndexForPlayerOrder,
  getOrbitGameplayPlanet,
  getOrbitGameplaySun,
  getOrbitPatternTrack,
  getOrbitPlanetCircleRadius,
  getOuterRingMax,
  getOuterRingMin,
  getShieldLoadCapacity,
  mulberry32,
  NEUTRON_STAR_SPEC,
  nextFloat,
  PLANET_HP,
  type PlanetPrivateState,
  type PlanetPublic,
  type PlayerId,
  resolveEditorFixedOrbitPatternId,
  rollCacheContents,
  type Sun,
  sampleOrbitPatternTrack,
  scale,
  type World,
} from "@3body/shared";
import { getRuntimeEditorTuningDocument } from "./editor-tuning";
import type { EntityIdSequence } from "./ids";

interface SpawnPlayer {
  playerId: PlayerId;
  archetypeId: ArchetypeId;
}

const createScaledSunSeeds = (
  tuning: GameTuningDocument["gameplay"]["orbits"],
): Array<Pick<Sun, "mass" | "pos" | "radius" | "vel">> => {
  const tunedSuns = tuning.suns.map((_, index) => {
    const tunedSun = getOrbitGameplaySun(tuning, index);

    return {
      mass: tunedSun.mass,
      pos: { x: tunedSun.pos.x, y: tunedSun.pos.y },
      radius: tunedSun.radius,
      vel: { x: tunedSun.vel.x, y: tunedSun.vel.y },
    };
  });

  if (tuning.sunStartDistanceScale === 1) {
    return tunedSuns;
  }

  const totalMass = tunedSuns.reduce((sum, sun) => sum + sun.mass, 0);
  const centerPosition =
    totalMass > 0
      ? tunedSuns.reduce(
          (center, sun) => ({
            x: center.x + (sun.pos.x * sun.mass) / totalMass,
            y: center.y + (sun.pos.y * sun.mass) / totalMass,
          }),
          { x: 0, y: 0 },
        )
      : { x: 0, y: 0 };
  const centerVelocity =
    totalMass > 0
      ? tunedSuns.reduce(
          (center, sun) => ({
            x: center.x + (sun.vel.x * sun.mass) / totalMass,
            y: center.y + (sun.vel.y * sun.mass) / totalMass,
          }),
          { x: 0, y: 0 },
        )
      : { x: 0, y: 0 };
  const velocityScale = 1 / Math.sqrt(tuning.sunStartDistanceScale);

  return tunedSuns.map((sun) => ({
    ...sun,
    pos: {
      x:
        centerPosition.x +
        (sun.pos.x - centerPosition.x) * tuning.sunStartDistanceScale,
      y:
        centerPosition.y +
        (sun.pos.y - centerPosition.y) * tuning.sunStartDistanceScale,
    },
    vel: {
      x: centerVelocity.x + (sun.vel.x - centerVelocity.x) * velocityScale,
      y: centerVelocity.y + (sun.vel.y - centerVelocity.y) * velocityScale,
    },
  }));
};

const createInitialSuns = (
  entityIds: EntityIdSequence,
  tuningDocument: GameTuningDocument,
): {
  orbitStarMotion: World["orbitStarMotion"];
  suns: [Sun, Sun, Sun];
} => {
  const orbitTuning = tuningDocument.gameplay.orbits;
  const resolvedPatternId = resolveEditorFixedOrbitPatternId(
    orbitTuning.starMotion.patternId,
  );
  const sunIds = [
    entityIds.nextEntityId(),
    entityIds.nextEntityId(),
    entityIds.nextEntityId(),
  ] as const;

  if (orbitTuning.starMotion.mode === "fixedPattern") {
    const fixedPatternSuns = orbitTuning.suns.map((_, index) => {
      const tunedSun = getOrbitGameplaySun(orbitTuning, index);

      return {
        mass: tunedSun.mass,
        radius: tunedSun.radius,
      };
    });
    const safeDistanceScale = clampOrbitPatternDistanceScale(
      resolvedPatternId,
      orbitTuning.starPatternDistanceScale,
      fixedPatternSuns,
    );
    const sampledSuns = sampleOrbitPatternTrack(
      getOrbitPatternTrack(resolvedPatternId),
      0,
      orbitTuning.starMotion.speed,
      safeDistanceScale,
    );

    return {
      orbitStarMotion: {
        mode: "fixedPattern",
        elapsedSec: 0,
        patternId: resolvedPatternId,
        speed: orbitTuning.starMotion.speed,
        baseDistanceScale: safeDistanceScale,
        distanceScale: safeDistanceScale,
        sunIds: [sunIds[0], sunIds[1], sunIds[2]],
      },
      suns: sunIds.map((sunId, index) => {
        const tunedSun = getOrbitGameplaySun(orbitTuning, index);
        const sampledSun = sampledSuns[index]!;

        return {
          id: sunId,
          kind: "sun",
          mass: tunedSun.mass,
          radius: tunedSun.radius,
          pos: {
            x: sampledSun.pos.x,
            y: sampledSun.pos.y,
          },
          vel: {
            x: sampledSun.vel.x,
            y: sampledSun.vel.y,
          },
        };
      }) as [Sun, Sun, Sun],
    };
  }

  const scaledSuns = createScaledSunSeeds(orbitTuning);

  return {
    orbitStarMotion: undefined,
    suns: sunIds.map((sunId, index) => ({
      id: sunId,
      kind: "sun",
      mass: scaledSuns[index]!.mass,
      radius: scaledSuns[index]!.radius,
      pos: {
        x: scaledSuns[index]!.pos.x,
        y: scaledSuns[index]!.pos.y,
      },
      vel: {
        x: scaledSuns[index]!.vel.x,
        y: scaledSuns[index]!.vel.y,
      },
    })) as [Sun, Sun, Sun],
  };
};

const createPlanet = (
  index: number,
  count: number,
  player: SpawnPlayer,
  entityIds: EntityIdSequence,
  tuningDocument: GameTuningDocument,
): { planet: PlanetPublic; privateState: PlanetPrivateState } => {
  const orbitTuning = tuningDocument.gameplay.orbits;
  const planetVisualTuning =
    tuningDocument.visuals.planets.archetypes[player.archetypeId];
  const leadPlanet = getOrbitGameplayPlanet(orbitTuning, 0);
  const leadAngle = Math.atan2(leadPlanet.pos.y, leadPlanet.pos.x);
  const angleStep = (Math.PI * 2) / Math.max(1, count);
  const orbitIndex = getOrbitIndexForPlayerOrder(index, count);
  const tunedPlanet = getOrbitGameplayPlanet(orbitTuning, orbitIndex);
  const resolvedAngle = leadAngle + angleStep * orbitIndex;
  const tangent = fromAngle(resolvedAngle + Math.PI / 2);
  const templateRadius = Math.max(
    Math.hypot(tunedPlanet.pos.x, tunedPlanet.pos.y),
    1,
  );
  const templateSpeed = Math.hypot(tunedPlanet.vel.x, tunedPlanet.vel.y);
  const planetRingRadius = Math.min(
    getOrbitPlanetCircleRadius(orbitTuning),
    ARENA_RADIUS,
  );
  const orbitalSpeed =
    templateSpeed *
    Math.sqrt(templateRadius / planetRingRadius) *
    orbitTuning.planetStartSpeedScale;
  const planetId = entityIds.nextEntityId();
  const boostCharges = Math.max(
    1,
    BOOST_SPEC.charges + ARCHETYPES[player.archetypeId].boostChargeBonus,
  );

  return {
    planet: {
      id: planetId,
      kind: "planet",
      playerId: player.playerId,
      archetype: player.archetypeId,
      hp: PLANET_HP,
      radius: tunedPlanet.radius * planetVisualTuning.bodyScale,
      pos: {
        x: Math.cos(resolvedAngle) * planetRingRadius,
        y: Math.sin(resolvedAngle) * planetRingRadius,
      },
      vel: scale(tangent, orbitalSpeed),
      shieldAimDir: { x: 1, y: 0 },
      shieldActive: false,
      shieldLoad: getShieldLoadCapacity(player.archetypeId),
      shieldMaxLoad: getShieldLoadCapacity(player.archetypeId),
      debuffs: {},
    },
    privateState: {
      planetId,
      ammo: createInitialAmmo(),
      cooldowns: {
        lightReloadUntilTick: 0,
        heavyReloadUntilTick: 0,
        seekerReloadUntilTick: 0,
      },
      boostCharges,
      gravityPulseHeld: false,
      nextShieldExt: false,
    },
  };
};

const createCache = (entityIds: EntityIdSequence, rng: () => number): Cache => {
  const angle = rng() * Math.PI * 2 + (rng() - 0.5) * 0.24;
  const radius = nextFloat(rng, getOuterRingMin(), getOuterRingMax());
  const tangent = fromAngle(angle + (Math.PI / 2) * (rng() < 0.5 ? -1 : 1));
  const speed = nextFloat(
    rng,
    CACHE_TANGENTIAL_SPEED_MIN,
    CACHE_TANGENTIAL_SPEED_MAX,
  );

  return {
    id: entityIds.nextEntityId(),
    kind: "cache",
    contents: rollCacheContents(rng),
    radius: CACHE_RADIUS,
    pos: {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    },
    vel: scale(tangent, speed),
  };
};

export const createInitialMatchState = (
  seed: number,
  players: SpawnPlayer[],
  entityIds: EntityIdSequence,
): {
  world: World;
  privateStates: Map<PlayerId, PlanetPrivateState>;
} => {
  const rng = mulberry32(seed);
  const tuningDocument = getRuntimeEditorTuningDocument();
  const { orbitStarMotion, suns } = createInitialSuns(
    entityIds,
    tuningDocument,
  );
  const privateStates = new Map<PlayerId, PlanetPrivateState>();
  const planets = players.map((player, index) => {
    const { planet, privateState } = createPlanet(
      index,
      players.length,
      player,
      entityIds,
      tuningDocument,
    );
    privateStates.set(player.playerId, privateState);
    return planet;
  });
  const neutronStars = createNeutronStars({
    arenaRadius: ARENA_RADIUS,
    blockedBodies: [...suns, ...planets],
    createId: () => entityIds.nextEntityId(),
    rng,
    spec: NEUTRON_STAR_SPEC,
  });
  const caches = Array.from({ length: CACHE_SPEC.count }, () =>
    createCache(entityIds, rng),
  );

  return {
    world: {
      suns,
      neutronStars,
      planets,
      rockets: [],
      caches,
      debris: [],
      arenaRadius: ARENA_RADIUS,
      orbitStarMotion,
    },
    privateStates,
  };
};
