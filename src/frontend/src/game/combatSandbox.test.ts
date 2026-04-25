import {
  ARCHETYPES,
  ARENA_RADIUS,
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  type BlackHoleSpec,
  CURRENT_GAME_TUNING,
  DEFAULT_GAME_TUNING,
  consumeBlackHoleBodies,
  FIXED_STEP_SEC,
  GRAVITY_PULSE_RADIUS,
  getBlackHoleKillRadiusAtElapsedSec,
  getBlackHoleMassAtElapsedSec,
  getOrbitPatternTrack,
  getPreferredLocalPlayerOrbitIndex,
  getSeekerLockTicks,
  mulberry32,
  PLANET_HP,
  ROCKET_SPECS,
  sampleOrbitPatternTrack,
} from "@3body/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type CombatSandboxRocket,
  type CombatSandboxState,
  type CombatSandboxStepInput,
  createSandboxState,
  describeCacheContents,
  describeWildcard,
  getActiveCombatSuns,
  getSandboxDebugSnapshot,
  interpolateSandboxState,
  stepSandbox,
} from "./combatSandbox";
import { getPlanetNameForSeat } from "../planetNames";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import { applyRuntimeTuningDocument } from "./runtimeTuning";
import { SHIELD_OUTER_SCALE } from "./shieldPresentation";

const DISABLED_BLACK_HOLE_SPEC: BlackHoleSpec = {
  ...BLACK_HOLE_SPEC,
  spawnSec: Number.POSITIVE_INFINITY,
};

const GROWING_BLACK_HOLE_SPEC: BlackHoleSpec = {
  spawnSec: 0,
  mass: 500,
  killRadius: 50,
  rampSec: 0.1,
};

const ACTIVE_BLACK_HOLE_SPEC: BlackHoleSpec = {
  spawnSec: 0,
  mass: 50_000_000,
  killRadius: 150,
  rampSec: 0,
};

beforeEach(() => {
  applyRuntimeTuningDocument(CURRENT_GAME_TUNING);
});

const createStepInput = (
  overrides: Partial<CombatSandboxStepInput> = {},
): CombatSandboxStepInput => ({
  aimWorld: { x: 220, y: 0 },
  selectedRocketKind: "light",
  fireRequested: false,
  shieldRequested: false,
  boostRequested: false,
  gravityPulseRequested: false,
  ...overrides,
});

const createLinearCombatState = (): {
  state: CombatSandboxState;
  enemyPlanetId: number;
} => {
  const state = createSandboxState(DEFAULT_ORBIT_PRESET);
  const playerPlanetId = state.player.planetId;
  let enemyAssigned = false;

  state.suns = [];
  state.caches = [];
  state.cacheRespawnAtTicks = [];
  state.debris = [];
  state.impactBursts = [];
  state.planets = state.planets.map((planet) => {
    if (planet.id === playerPlanetId) {
      return {
        ...planet,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        radius: 20,
        alive: true,
        hp: PLANET_HP,
        deathReason: undefined,
        debuffs: {},
      };
    }

    if (!enemyAssigned) {
      enemyAssigned = true;
      return {
        ...planet,
        pos: { x: 220, y: 0 },
        vel: { x: 0, y: 0 },
        radius: 20,
        alive: true,
        hp: PLANET_HP,
        deathReason: undefined,
        debuffs: {},
      };
    }

    return {
      ...planet,
      pos: { x: 5_000 + planet.id, y: 0 },
      vel: { x: 0, y: 0 },
      alive: false,
      hp: 0,
      deathReason: "rocket",
      debuffs: {},
    };
  });

  const enemyPlanetId = state.planets.find(
    (planet) => planet.id !== playerPlanetId && planet.alive,
  )!.id;
  const enemyPlanet = state.planets.find(
    (planet) => planet.id === enemyPlanetId,
  )!;
  state.player.aimWorld = { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y };
  state.player.lockTargetId = null;
  state.player.seekerLockAcquiredAtTick = null;

  return {
    state,
    enemyPlanetId,
  };
};

const buildRocket = (
  overrides: Partial<CombatSandboxRocket> = {},
): CombatSandboxRocket => ({
  id: 99_001,
  kind: "rocket",
  ownerId: "player",
  rocketKind: "light",
  targetId: undefined,
  ttlUntilTick: 10,
  pos: { x: 0, y: 0 },
  vel: { x: 0, y: 0 },
  radius: ROCKET_SPECS.light.radius,
  damage: ROCKET_SPECS.light.damage,
  color: "#ffffff",
  trailColor: "#b7e6ff",
  dragOnHit: false,
  launchPlanetArchetype: "terra",
  turnRateMultiplier: 1,
  launchPlanetPos: { x: 0, y: 0 },
  launchPlanetRadius: 20,
  ...overrides,
});

describe("combatSandbox", () => {
  it("anchors the player to the current frontend sandbox preset", () => {
    const state = createSandboxState(DEFAULT_ORBIT_PRESET);
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    );
    const playerPlanetIndex = getPreferredLocalPlayerOrbitIndex(
      DEFAULT_ORBIT_PRESET.planets.length,
    );

    expect(playerPlanet?.label).toBe(
      DEFAULT_ORBIT_PRESET.planets[playerPlanetIndex]!.label,
    );
    expect(state.player.selectedRocketKind).toBe("light");
    expect(state.player.ammo).toEqual({
      heavy: ROCKET_SPECS.heavy.startAmmo,
      light: ROCKET_SPECS.light.startAmmo,
      seeker: ROCKET_SPECS.seeker.startAmmo,
    });
    expect(state.caches.length).toBeGreaterThan(0);
  });

  it("uses runtime cache pickup radius for sandbox caches", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.cache.pickupRadius = 150;
    applyRuntimeTuningDocument(tunedDocument);

    const state = createSandboxState(DEFAULT_ORBIT_PRESET);

    expect(state.caches.length).toBeGreaterThan(0);
    expect(state.caches.every((cache) => cache.radius === 150)).toBe(true);
  });

  it("can seed the focused planet as a bot for observer-only matches", () => {
    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botDifficulty: "hard",
      participantCount: 7,
      playerBehavior: "bot",
    });
    const focusedPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    );

    expect(state.playerBot).toMatchObject({
      difficulty: "hard",
    });
    expect(state.planets).toHaveLength(7);
    expect(state.bots).toHaveLength(6);
    const focusedIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );
    expect(focusedPlanet?.displayName).toBe(
      getPlanetNameForSeat(focusedIndex),
    );
  });

  it("uses runtime orbit tuning for the default sandbox seeds", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.starMotion.mode = "physicsSeed";
    tunedDocument.gameplay.orbits.planetCircleRadius = 1800;
    tunedDocument.visuals.planets.archetypes.terra.bodyScale = 1.5;
    tunedDocument.gameplay.orbits.suns[0] = {
      ...tunedDocument.gameplay.orbits.suns[0]!,
      pos: { x: -2400, y: 320 },
      radius: 96,
      vel: { x: 84, y: 126 },
    };
    tunedDocument.gameplay.orbits.planets[0] = {
      ...tunedDocument.gameplay.orbits.planets[0]!,
      pos: { x: 640, y: -512 },
      radius: 31,
      vel: { x: 210, y: 470 },
    };
    applyRuntimeTuningDocument(tunedDocument);

    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });

    const totalSunMass = tunedDocument.gameplay.orbits.suns.reduce(
      (sum, sun) => sum + sun.mass,
      0,
    );
    const sunCenterPosition = tunedDocument.gameplay.orbits.suns.reduce(
      (center, sun) => ({
        x: center.x + (sun.pos.x * sun.mass) / totalSunMass,
        y: center.y + (sun.pos.y * sun.mass) / totalSunMass,
      }),
      { x: 0, y: 0 },
    );
    const sunCenterVelocity = tunedDocument.gameplay.orbits.suns.reduce(
      (center, sun) => ({
        x: center.x + (sun.vel.x * sun.mass) / totalSunMass,
        y: center.y + (sun.vel.y * sun.mass) / totalSunMass,
      }),
      { x: 0, y: 0 },
    );
    const sunDistanceScale =
      tunedDocument.gameplay.orbits.sunStartDistanceScale;
    const sunVelocityScale = 1 / Math.sqrt(sunDistanceScale);
    const tunedSun = tunedDocument.gameplay.orbits.suns[0]!;

    expect(state.suns[0]!.radius).toBe(96);
    expect(state.suns[0]!.pos.x).toBeCloseTo(
      sunCenterPosition.x +
        (tunedSun.pos.x - sunCenterPosition.x) * sunDistanceScale,
      6,
    );
    expect(state.suns[0]!.pos.y).toBeCloseTo(
      sunCenterPosition.y +
        (tunedSun.pos.y - sunCenterPosition.y) * sunDistanceScale,
      6,
    );
    expect(state.suns[0]!.vel.x).toBeCloseTo(
      sunCenterVelocity.x +
        (tunedSun.vel.x - sunCenterVelocity.x) * sunVelocityScale,
      6,
    );
    expect(state.suns[0]!.vel.y).toBeCloseTo(
      sunCenterVelocity.y +
        (tunedSun.vel.y - sunCenterVelocity.y) * sunVelocityScale,
      6,
    );
    expect(state.planets[0]!.archetype).toBe("terra");
    expect(state.planets[0]!.radius).toBeCloseTo(31 * 1.5, 6);

    const leadAngle = Math.atan2(
      tunedDocument.gameplay.orbits.planets[0]!.pos.y,
      tunedDocument.gameplay.orbits.planets[0]!.pos.x,
    );
    const angleStep = (Math.PI * 2) / state.planets.length;

    state.planets.forEach((planet, index) => {
      const expectedAngle = leadAngle + angleStep * index;
      expect(Math.hypot(planet.pos.x, planet.pos.y)).toBeCloseTo(
        Math.min(
          tunedDocument.gameplay.orbits.planetCircleRadius,
          ARENA_RADIUS,
        ),
        6,
      );
      expect(planet.pos.x).toBeCloseTo(
        Math.cos(expectedAngle) *
          Math.min(
            tunedDocument.gameplay.orbits.planetCircleRadius,
            ARENA_RADIUS,
          ),
        6,
      );
      expect(planet.pos.y).toBeCloseTo(
        Math.sin(expectedAngle) *
          Math.min(
            tunedDocument.gameplay.orbits.planetCircleRadius,
            ARENA_RADIUS,
          ),
        6,
      );
    });
  });

  it("scales default sun start spacing and derived velocity around the system center", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.starMotion.mode = "physicsSeed";
    tunedDocument.gameplay.orbits.sunStartDistanceScale = 1.5;
    applyRuntimeTuningDocument(tunedDocument);

    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });
    const totalMass = tunedDocument.gameplay.orbits.suns.reduce(
      (sum, sun) => sum + sun.mass,
      0,
    );
    const centerPosition = tunedDocument.gameplay.orbits.suns.reduce(
      (center, sun) => ({
        x: center.x + (sun.pos.x * sun.mass) / totalMass,
        y: center.y + (sun.pos.y * sun.mass) / totalMass,
      }),
      { x: 0, y: 0 },
    );
    const centerVelocity = tunedDocument.gameplay.orbits.suns.reduce(
      (center, sun) => ({
        x: center.x + (sun.vel.x * sun.mass) / totalMass,
        y: center.y + (sun.vel.y * sun.mass) / totalMass,
      }),
      { x: 0, y: 0 },
    );
    const velocityScale =
      1 / Math.sqrt(tunedDocument.gameplay.orbits.sunStartDistanceScale);

    state.suns.forEach((sun, index) => {
      const tunedSun = tunedDocument.gameplay.orbits.suns[index]!;

      expect(sun.pos.x).toBeCloseTo(
        centerPosition.x +
          (tunedSun.pos.x - centerPosition.x) *
            tunedDocument.gameplay.orbits.sunStartDistanceScale,
        6,
      );
      expect(sun.pos.y).toBeCloseTo(
        centerPosition.y +
          (tunedSun.pos.y - centerPosition.y) *
            tunedDocument.gameplay.orbits.sunStartDistanceScale,
        6,
      );
      expect(sun.vel.x).toBeCloseTo(
        centerVelocity.x + (tunedSun.vel.x - centerVelocity.x) * velocityScale,
        6,
      );
      expect(sun.vel.y).toBeCloseTo(
        centerVelocity.y + (tunedSun.vel.y - centerVelocity.y) * velocityScale,
        6,
      );
    });
  });

  it("clamps oversized runtime orbit tuning to the arena killzone", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.planetCircleRadius = ARENA_RADIUS + 600;
    applyRuntimeTuningDocument(tunedDocument);

    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });

    state.planets.forEach((planet) => {
      expect(Math.hypot(planet.pos.x, planet.pos.y)).toBeCloseTo(
        ARENA_RADIUS,
        6,
      );
    });
  });

  it("uses sampled fixed-pattern suns and a separate planet start speed scale", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.starMotion = {
      mode: "fixedPattern",
      patternId: "equilateral-circle",
      speed: 0,
    };
    tunedDocument.gameplay.orbits.starPatternDistanceScale = 1.5;
    tunedDocument.gameplay.orbits.planetStartSpeedScale = 0.5;
    tunedDocument.gameplay.orbits.suns[0] = {
      ...tunedDocument.gameplay.orbits.suns[0]!,
      pos: { x: 8_000, y: -8_000 },
      vel: { x: 4_000, y: -4_000 },
    };
    applyRuntimeTuningDocument(tunedDocument);

    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });
    const circleRadius = Math.min(
      tunedDocument.gameplay.orbits.planetCircleRadius,
      ARENA_RADIUS,
    );
    const tunedPlanet = tunedDocument.gameplay.orbits.planets[0]!;
    const templateRadius = Math.max(
      Math.hypot(tunedPlanet.pos.x, tunedPlanet.pos.y),
      1,
    );
    const templateSpeed = Math.hypot(tunedPlanet.vel.x, tunedPlanet.vel.y);
    const expectedSpeed =
      templateSpeed *
      Math.sqrt(templateRadius / circleRadius) *
      tunedDocument.gameplay.orbits.planetStartSpeedScale;
    const sampledSuns = sampleOrbitPatternTrack(
      getOrbitPatternTrack("equilateral-circle"),
      0,
      0,
      tunedDocument.gameplay.orbits.starPatternDistanceScale,
    );

    expect(state.suns[0]!.pos.x).not.toBeCloseTo(
      tunedDocument.gameplay.orbits.suns[0]!.pos.x,
      2,
    );
    expect(state.suns[0]!.pos.x).toBeCloseTo(sampledSuns[0]!.pos.x, 6);
    expect(state.suns[0]!.pos.y).toBeCloseTo(sampledSuns[0]!.pos.y, 6);
    expect(
      Math.hypot(state.planets[0]!.vel.x, state.planets[0]!.vel.y),
    ).toBeCloseTo(expectedSpeed, 6);
  });

  it("can start the local sandbox with bot AI disabled", () => {
    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });

    expect(state.bots).toEqual([]);
    expect(state.planets).toHaveLength(DEFAULT_ORBIT_PRESET.planets.length);
  });

  it("keeps the player alive through the opening seconds of the default preset", () => {
    let state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });
    const openingStepCount = Math.ceil(2 / FIXED_STEP_SEC);

    for (let step = 0; step < openingStepCount; step += 1) {
      state = stepSandbox(state, createStepInput(), DISABLED_BLACK_HOLE_SPEC);
    }

    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    );

    expect(playerPlanet?.alive).toBe(true);
    expect(playerPlanet?.deathReason).toBeUndefined();
  });

  it("kills the player immediately after crossing the arena boundary", () => {
    const { state } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );

    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      pos: { x: ARENA_RADIUS + 1, y: 0 },
      vel: { x: 0, y: 0 },
    };

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const playerPlanet = next.planets.find(
      (planet) => planet.id === state.player.planetId,
    );

    expect(playerPlanet?.alive).toBe(false);
    expect(playerPlanet?.deathReason).toBe("boundary");
  });

  it("applies boundary damage instead of instant death when killzone is disabled", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.arena.instantDeath = false;
    applyRuntimeTuningDocument(tunedDocument);

    const { state } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );

    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      pos: { x: ARENA_RADIUS + 1, y: 0 },
      vel: { x: 0, y: 0 },
    };

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const playerPlanet = next.planets.find(
      (planet) => planet.id === state.player.planetId,
    );

    expect(playerPlanet?.alive).toBe(true);
    expect(playerPlanet?.hp).toBeLessThan(PLANET_HP);
    expect(playerPlanet?.deathReason).toBeUndefined();
  });

  it("applies size-based damage when inward-drifting boundary debris hits a planet", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.arena.asteroidField = {
      large: { damage: 12, randomization: 0, spawnRatePerSec: 0.12 },
      micro: { damage: 0.6, randomization: 0, spawnRatePerSec: 2.8 },
      small: { damage: 3, randomization: 0, spawnRatePerSec: 0.55 },
    };
    applyRuntimeTuningDocument(tunedDocument);

    const { state } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );
    state.debris = [
      {
        asteroidTier: "small",
        color: "#ffd98f",
        id: state.nextEntityId,
        kind: "debris",
        ownerPlayerId: undefined,
        pos: { x: 19, y: 0 },
        radius: 4,
        ttlUntilTick: state.tick + 12,
        vel: { x: 0, y: 0 },
      },
    ];
    state.nextEntityId += 1;

    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
    };
    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const playerPlanet = next.planets.find(
      (planet) => planet.id === state.player.planetId,
    );

    expect(playerPlanet?.alive).toBe(true);
    expect(playerPlanet?.hp).toBeCloseTo(PLANET_HP - 3, 6);
    expect(playerPlanet?.deathReason).toBeUndefined();
    expect(next.impactBursts).toHaveLength(1);
    expect(next.debris.some((piece) => piece.asteroidTier === "small")).toBe(
      false,
    );
    expect(next.debris.length).toBeGreaterThan(0);
  });

  it("applies large asteroid damage across the visible large-rock impact radius", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.arena.asteroidField = {
      large: { damage: 12, randomization: 0, spawnRatePerSec: 0.12 },
      micro: { damage: 0.6, randomization: 0, spawnRatePerSec: 2.8 },
      small: { damage: 3, randomization: 0, spawnRatePerSec: 0.55 },
    };
    applyRuntimeTuningDocument(tunedDocument);

    const { state } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );
    state.debris = [
      {
        asteroidTier: "large",
        color: "#ffb87a",
        id: state.nextEntityId,
        kind: "debris",
        ownerPlayerId: undefined,
        pos: { x: 50, y: 0 },
        radius: 16,
        ttlUntilTick: state.tick + 12,
        vel: { x: 0, y: 0 },
      },
    ];
    state.nextEntityId += 1;

    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
    };
    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const playerPlanet = next.planets.find(
      (planet) => planet.id === state.player.planetId,
    );

    expect(playerPlanet?.alive).toBe(true);
    expect(playerPlanet?.hp).toBeCloseTo(PLANET_HP - 12, 6);
    expect(next.impactBursts).toHaveLength(1);
    expect(next.debris.some((piece) => piece.asteroidTier === "large")).toBe(
      false,
    );
  });

  it("lets spawned boundary asteroids reach and damage a central target in the live arena", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.arena.instantDeath = false;
    applyRuntimeTuningDocument(tunedDocument);

    const { state } = createLinearCombatState();
    const playerPlanetId = state.player.planetId;

    state.rng = mulberry32(0x1badf00d);
    state.suns = [];
    state.caches = [];
    state.cacheRespawnAtTicks = [];
    state.debris = [];
    state.impactBursts = [];
    state.planets = state.planets.map((planet) =>
      planet.id === playerPlanetId
        ? {
            ...planet,
            pos: { x: 0, y: 0 },
            vel: { x: 0, y: 0 },
            radius: 1300,
            alive: true,
            hp: PLANET_HP,
            deathReason: undefined,
            debuffs: {},
          }
        : {
            ...planet,
            pos: { x: 50_000 + planet.id, y: 0 },
            vel: { x: 0, y: 0 },
            alive: false,
            hp: 0,
            deathReason: "rocket",
            debuffs: {},
          },
    );

    let current = state;
    let tookDamage = false;
    const maxSteps = Math.round(20 / FIXED_STEP_SEC);

    for (let step = 0; step < maxSteps; step += 1) {
      current = stepSandbox(
        current,
        createStepInput(),
        DISABLED_BLACK_HOLE_SPEC,
      );
      const playerPlanet = current.planets.find(
        (planet) => planet.id === playerPlanetId,
      );
      if (playerPlanet === undefined || playerPlanet.hp < PLANET_HP) {
        tookDamage = true;
        break;
      }
    }

    expect(tookDamage).toBe(true);
  });

  it("assigns a unique planet name to every participant", () => {
    const state = createSandboxState(DEFAULT_ORBIT_PRESET);
    const displayNames = state.planets.map((planet) => planet.displayName);

    expect(new Set(displayNames).size).toBe(displayNames.length);
    expect(displayNames.every((name) => name.length > 0)).toBe(true);
  });

  it("fires a light rocket and starts its reload timer", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === enemyPlanetId,
    );
    const enemyPlanet = {
      ...state.planets[enemyPlanetIndex]!,
      pos: { x: 900, y: 0 },
    };
    state.planets[enemyPlanetIndex] = enemyPlanet;
    const lightAmmoBefore = state.player.ammo.light;

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
        selectedRocketKind: "light",
        fireRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(1);
    expect(next.rockets[0]!.rocketKind).toBe("light");
    expect(next.rockets[0]!.ownerId).toBe("player");
    expect(next.rockets[0]!.pos.x).toBeGreaterThan(0);
    expect(next.player.ammo.light).toBe(lightAmmoBefore - 1);
    expect(next.player.reloadUntilTick.light).toBeGreaterThan(next.tick);
  });

  it("adds the firing planet velocity to rocket launch speed", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      vel: { x: 180, y: 0 },
    };

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
        selectedRocketKind: "light",
        fireRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(1);
    expect(next.rockets[0]!.vel.x).toBeCloseTo(
      180 + ROCKET_SPECS.light.speed,
      6,
    );
    expect(next.rockets[0]!.vel.y).toBeCloseTo(0, 6);
  });

  it("keeps downward shots moving downward while the player is moving down", () => {
    const { state } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );

    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      vel: { x: 0, y: -1_200 },
    };

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: 0, y: -10 },
        selectedRocketKind: "light",
        fireRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(1);
    expect(next.rockets[0]!.vel.x).toBeCloseTo(0, 6);
    expect(next.rockets[0]!.vel.y).toBeLessThan(-1_200);
  });

  it("lets offline bot planets acquire the player and fire back", () => {
    applyRuntimeTuningDocument(DEFAULT_GAME_TUNING);
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const enemyBot = state.bots.find((bot) => bot.planetId === enemyPlanetId)!;
    enemyBot.difficulty = "hard";
    state.caches = [];

    let current = state;
    for (let step = 0; step < 120; step += 1) {
      current = stepSandbox(
        current,
        createStepInput({
          aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
        }),
        DISABLED_BLACK_HOLE_SPEC,
      );
      if (
        current.rockets.some(
          (rocket) => rocket.ownerId === enemyPlanet.playerId,
        )
      ) {
        break;
      }
    }

    expect(
      current.rockets.some((rocket) => rocket.ownerId === enemyPlanet.playerId),
    ).toBe(true);
  });

  it("recharges one light rocket when its reload timer completes", () => {
    const { state } = createLinearCombatState();
    state.player.ammo.light = 0;
    state.player.reloadUntilTick.light = 1;

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.player.ammo.light).toBe(1);
    expect(next.player.reloadUntilTick.light).toBeGreaterThan(next.tick);
  });

  it("requires a full seeker lock before it will fire", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
        selectedRocketKind: "seeker",
        fireRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(0);
    expect(next.player.ammo.seeker).toBe(state.player.ammo.seeker);
    expect(next.player.lockTargetId).toBe(enemyPlanet.id);
    expect(next.player.seekerLockAcquiredAtTick).toBe(next.tick);
  });

  it("fires seeker rockets once the lock duration has elapsed", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const seekerAmmoBefore = state.player.ammo.seeker;
    state.player.lockTargetId = enemyPlanet.id;
    state.player.seekerLockAcquiredAtTick = 1 - getSeekerLockTicks();

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
        selectedRocketKind: "seeker",
        fireRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(1);
    expect(next.rockets[0]!.rocketKind).toBe("seeker");
    expect(next.rockets[0]!.targetId).toBe(enemyPlanet.id);
    expect(next.player.ammo.seeker).toBe(seekerAmmoBefore - 1);
  });

  it("uses the tuned seeker lock duration", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.rockets.seeker.lockSec = 0.05;
    applyRuntimeTuningDocument(tunedDocument);

    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const seekerAmmoBefore = state.player.ammo.seeker;
    state.player.lockTargetId = enemyPlanet.id;
    state.player.seekerLockAcquiredAtTick = 1 - getSeekerLockTicks();

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
        selectedRocketKind: "seeker",
        fireRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(getSeekerLockTicks()).toBe(
      Math.round(
        tunedDocument.gameplay.rockets.seeker.lockSec / FIXED_STEP_SEC,
      ),
    );
    expect(next.rockets).toHaveLength(1);
    expect(next.player.ammo.seeker).toBe(seekerAmmoBefore - 1);
  });

  it("applies heavy rocket impacts to enemy planets and removes the rocket", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    state.rockets = [
      buildRocket({
        rocketKind: "heavy",
        radius: ROCKET_SPECS.heavy.radius,
        damage: ROCKET_SPECS.heavy.damage,
        pos: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
      }),
    ];

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const updatedEnemy = next.planets.find(
      (planet) => planet.id === enemyPlanet.id,
    )!;

    expect(updatedEnemy.hp).toBe(PLANET_HP - ROCKET_SPECS.heavy.damage);
    expect(next.rockets).toHaveLength(0);
    expect(next.impactBursts).toHaveLength(1);
    expect(next.debris.length).toBeGreaterThan(0);
  });

  it("detonates both rockets when missiles touch", () => {
    const { state } = createLinearCombatState();
    state.rockets = [
      buildRocket({
        id: 501,
        ownerId: "player",
        pos: { x: 640, y: 0 },
      }),
      buildRocket({
        id: 502,
        ownerId: "bot-2",
        pos: { x: 640, y: 0 },
      }),
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(0);
    expect(next.debris.length).toBeGreaterThan(0);
    expect(next.impactBursts).toHaveLength(0);
  });

  it("detonates rockets when they hit neutron stars", () => {
    const { state } = createLinearCombatState();
    state.neutronStars = [
      {
        id: 601,
        kind: "neutronStar",
        mass: 4_000_000,
        pos: { x: 640, y: 0 },
        vel: { x: 0, y: 0 },
        radius: 40,
      },
    ];
    state.rockets = [
      buildRocket({
        id: 602,
        pos: { x: 640, y: 0 },
      }),
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(0);
    expect(next.debris.length).toBeGreaterThan(0);
  });

  it("detonates rockets on the arena boundary debris ring", () => {
    const { state } = createLinearCombatState();
    state.rockets = [
      buildRocket({
        id: 603,
        pos: {
          x: ARENA_RADIUS - ROCKET_SPECS.light.radius + 1,
          y: 0,
        },
      }),
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(0);
    expect(next.debris.length).toBeGreaterThan(0);
  });

  it("detonates rockets when missile ttl expires", () => {
    const { state } = createLinearCombatState();
    state.rockets = [
      buildRocket({
        id: 604,
        ttlUntilTick: state.tick + 1,
        pos: { x: 640, y: 0 },
      }),
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(0);
    expect(next.debris.length).toBeGreaterThan(0);
    expect(next.impactBursts).toHaveLength(0);
  });

  it("lets player-owned rockets hit the player planet", () => {
    const { state } = createLinearCombatState();
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;
    state.rockets = [
      buildRocket({
        ownerId: playerPlanet.playerId,
        pos: { x: playerPlanet.pos.x, y: playerPlanet.pos.y },
      }),
    ];

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: 220, y: 0 },
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const updatedPlayer = next.planets.find(
      (planet) => planet.id === playerPlanet.id,
    )!;

    expect(updatedPlayer.hp).toBe(PLANET_HP - ROCKET_SPECS.light.damage);
    expect(next.rockets).toHaveLength(0);
    expect(next.impactBursts).toHaveLength(1);
  });

  it("keeps a launch burst even when a fired rocket hits during the same simulation step", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;
    const enemyPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === enemyPlanetId,
    );
    const instantHitX = playerPlanet.radius + ROCKET_SPECS.light.radius + 14;
    state.planets[enemyPlanetIndex] = {
      ...state.planets[enemyPlanetIndex]!,
      pos: { x: instantHitX, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 20,
      hp: PLANET_HP,
      alive: true,
      deathReason: undefined,
      debuffs: {},
    };

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: instantHitX, y: 0 },
        selectedRocketKind: "light",
        fireRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const updatedEnemy = next.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    expect(next.launchBursts).toHaveLength(1);
    expect(next.launchBursts[0]!.rocketKind).toBe("light");
    expect(next.launchBursts[0]!.ownerId).toBe("player");
    expect(next.launchBursts[0]!.launchPlanetPos).toEqual({ x: 0, y: 0 });
    expect(next.rockets).toHaveLength(0);
    expect(next.impactBursts).toHaveLength(1);
    expect(updatedEnemy.hp).toBe(PLANET_HP - ROCKET_SPECS.light.damage);
  });

  it("matches rocket impact range to the configured rendered planet body scale", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const rocket = buildRocket({
      pos: {
        x:
          enemyPlanet.pos.x +
          enemyPlanet.radius +
          ROCKET_SPECS.light.radius +
          1,
        y: enemyPlanet.pos.y,
      },
    });

    state.rockets = [rocket];

    const defaultScaleNext = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const defaultScaleEnemy = defaultScaleNext.planets.find(
      (planet) => planet.id === enemyPlanet.id,
    )!;

    expect(defaultScaleEnemy.hp).toBe(PLANET_HP);
    expect(defaultScaleNext.rockets).toHaveLength(1);

    const enlargedVisualNext = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
      }),
      DISABLED_BLACK_HOLE_SPEC,
      {
        planetImpactRadiusMultiplier: 3,
      },
    );
    const enlargedVisualEnemy = enlargedVisualNext.planets.find(
      (planet) => planet.id === enemyPlanet.id,
    )!;

    expect(enlargedVisualEnemy.hp).toBe(PLANET_HP - ROCKET_SPECS.light.damage);
    expect(enlargedVisualNext.rockets).toHaveLength(0);
  });

  it("lets the player's shield absorb rockets from the protected arc", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;

    state.player.shieldActive = true;
    state.player.shieldAimDir = { x: 1, y: 0 };
    state.rockets = [
      buildRocket({
        ownerId: enemyPlanet.playerId,
        targetId: playerPlanet.id,
        pos: { x: 40, y: 0 },
      }),
    ];

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: 100, y: 0 },
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const nextPlayerPlanet = next.planets.find(
      (planet) => planet.id === playerPlanet.id,
    )!;

    expect(nextPlayerPlanet.hp).toBe(PLANET_HP);
    expect(next.rockets).toHaveLength(0);
    expect(next.impactBursts).toHaveLength(1);
    expect(next.impactBursts[0]?.absorbedByShield).toBe(true);
    expect(next.player.shieldMaxLoad).toBe(
      state.player.shieldMaxLoad - ROCKET_SPECS.light.damage,
    );
    expect(next.player.shieldLoad).toBeLessThanOrEqual(
      state.player.shieldLoad - ROCKET_SPECS.light.damage,
    );
  });

  it("blocks rockets at the shield surface before they reach the planet body", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;
    const planetImpactRadiusMultiplier = 2;
    const bodyImpactDistance =
      ROCKET_SPECS.light.radius +
      playerPlanet.radius * planetImpactRadiusMultiplier;
    const shieldImpactDistance =
      ROCKET_SPECS.light.radius +
      playerPlanet.radius * planetImpactRadiusMultiplier * SHIELD_OUTER_SCALE;

    state.player.shieldActive = true;
    state.player.shieldAimDir = { x: 1, y: 0 };
    state.rockets = [
      buildRocket({
        ownerId: enemyPlanet.playerId,
        targetId: playerPlanet.id,
        pos: {
          x: (bodyImpactDistance + shieldImpactDistance) / 2,
          y: 0,
        },
      }),
    ];

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: 100, y: 0 },
      }),
      DISABLED_BLACK_HOLE_SPEC,
      {
        planetImpactRadiusMultiplier,
      },
    );
    const nextPlayerPlanet = next.planets.find(
      (planet) => planet.id === playerPlanet.id,
    )!;

    expect(nextPlayerPlanet.hp).toBe(PLANET_HP);
    expect(next.rockets).toHaveLength(0);
    expect(next.impactBursts[0]?.absorbedByShield).toBe(true);
  });

  it("blocks weapon fire while the player's shield is active", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const lightAmmoBefore = state.player.ammo.light;

    state.player.shieldActive = true;

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanet.pos.x, y: enemyPlanet.pos.y },
        selectedRocketKind: "light",
        fireRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.rockets).toHaveLength(0);
    expect(next.player.ammo.light).toBe(lightAmmoBefore);
  });

  it("lets the player toggle the shield off and back on without a cooldown lock", () => {
    const { state } = createLinearCombatState();
    state.player.shieldActive = true;
    state.player.shieldLoad = state.player.shieldMaxLoad / 2;

    const toggledOff = stepSandbox(
      state,
      createStepInput({ shieldRequested: true }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    expect(toggledOff.player.shieldActive).toBe(false);

    const toggledOn = stepSandbox(
      toggledOff,
      createStepInput({ shieldRequested: true }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    expect(toggledOn.player.shieldActive).toBe(true);
  });

  it("drains shield load while it is active", () => {
    const { state } = createLinearCombatState();
    state.player.shieldActive = true;
    const startingLoad = state.player.shieldLoad;

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.player.shieldActive).toBe(true);
    expect(next.player.shieldLoad).toBeLessThan(startingLoad);
  });

  it("applies one continuous boost tick on tap and drains boost load", () => {
    const { state: boostState } = createLinearCombatState();
    const playerPlanet = boostState.planets.find(
      (planet) => planet.id === boostState.player.planetId,
    )!;
    const startingBoostLoad = boostState.player.boostCharges;
    const startingVelocityX = playerPlanet.vel.x;
    expect(startingBoostLoad).toBeGreaterThanOrEqual(BOOST_SPEC.charges);

    const boosted = stepSandbox(
      boostState,
      createStepInput({
        aimWorld: { x: 100, y: 0 },
        boostRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    const { state: shieldState } = createLinearCombatState();
    shieldState.player.shieldActive = true;
    const startingShieldLoad = shieldState.player.shieldLoad;
    const shielded = stepSandbox(
      shieldState,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    const boostDrainRatio =
      (startingBoostLoad - boosted.player.boostCharges) / startingBoostLoad;
    const shieldDrainRatio =
      (startingShieldLoad - shielded.player.shieldLoad) / startingShieldLoad;
    const boostedPlanet = boosted.planets.find(
      (planet) => planet.id === boosted.player.planetId,
    )!;
    const expectedBoostBurn =
      FIXED_STEP_SEC / Math.max(FIXED_STEP_SEC, BOOST_SPEC.depleteSec);
    const expectedBoostImpulse = BOOST_SPEC.magnitude * FIXED_STEP_SEC;

    expect(boosted.player.boostCharges).toBeLessThan(startingBoostLoad);
    expect(boosted.player.nextBoostChargeAtTick).toBe(0);
    expect(startingBoostLoad - boosted.player.boostCharges).toBeCloseTo(
      expectedBoostBurn,
      5,
    );
    expect(boostDrainRatio).toBeGreaterThan(shieldDrainRatio);
    expect(boostedPlanet.vel.x - startingVelocityX).toBeGreaterThan(
      expectedBoostImpulse * 0.95,
    );
  });

  it("keeps applying boost force while the request is held", () => {
    const { state } = createLinearCombatState();
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;
    const initialVelocityX = playerPlanet.vel.x;

    let next = state;
    for (let step = 0; step < 5; step += 1) {
      next = stepSandbox(
        next,
        createStepInput({
          aimWorld: { x: 100, y: 0 },
          boostRequested: true,
        }),
        DISABLED_BLACK_HOLE_SPEC,
      );
    }

    const boostedPlanet = next.planets.find(
      (planet) => planet.id === next.player.planetId,
    )!;
    const boostImpulsePerStep = BOOST_SPEC.magnitude * FIXED_STEP_SEC;
    const boostVelocityDelta = boostedPlanet.vel.x - initialVelocityX;

    expect(boostVelocityDelta).toBeGreaterThan(boostImpulsePerStep * 4);
    expect(boostVelocityDelta).toBeLessThan(BOOST_SPEC.magnitude * 0.25);
    expect(boostVelocityDelta).toBeLessThan(BOOST_SPEC.magnitude);
    expect(next.player.boostCharges).toBeLessThan(state.player.boostCharges);
  });

  it("applies boost whenever W is held, even while shield is active", () => {
    const { state } = createLinearCombatState();
    state.player.shieldActive = true;
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;
    const startingBoostLoad = state.player.boostCharges;
    const startingVelocityX = playerPlanet.vel.x;

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: 100, y: 0 },
        boostRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    const boostedPlanet = next.planets.find(
      (planet) => planet.id === next.player.planetId,
    )!;

    expect(next.player.boostCharges).toBeLessThan(startingBoostLoad);
    expect(boostedPlanet.vel.x).toBeGreaterThan(startingVelocityX);
  });

  it("recharges boost load after the player releases boost", () => {
    const { state } = createLinearCombatState();
    const startingBoostLoad = state.player.boostCharges;

    let next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: 100, y: 0 },
        boostRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const drainedBoostLoad = next.player.boostCharges;

    for (let step = 0; step < 3; step += 1) {
      next = stepSandbox(next, createStepInput(), DISABLED_BLACK_HOLE_SPEC);
    }

    expect(drainedBoostLoad).toBeLessThan(startingBoostLoad);
    expect(next.player.boostCharges).toBeGreaterThan(drainedBoostLoad);
    expect(next.player.boostCharges).toBeLessThanOrEqual(startingBoostLoad);
  });

  it("recharges boost from empty to full capacity over the recharge duration", () => {
    const { state } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );
    const boostCapacity =
      BOOST_SPEC.charges + ARCHETYPES.volans.boostChargeBonus;
    state.bots = [];
    state.player.boostCharges = 0;
    state.player.boostActive = false;
    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      archetype: "volans",
    };

    let next = state;
    for (
      let step = 0;
      step < Math.ceil(BOOST_SPEC.cooldownSec / FIXED_STEP_SEC);
      step += 1
    ) {
      next = stepSandbox(next, createStepInput(), DISABLED_BLACK_HOLE_SPEC);
    }

    expect(next.player.boostCharges).toBeCloseTo(boostCapacity, 5);
  });

  it("recharges shield load back up to the current max while inactive", () => {
    const { state } = createLinearCombatState();
    state.player.shieldActive = false;
    state.player.shieldLoad = 0;
    state.player.shieldMaxLoad = 40;

    let next = state;
    for (let step = 0; step < 2000; step += 1) {
      next = stepSandbox(next, createStepInput(), DISABLED_BLACK_HOLE_SPEC);
    }

    expect(next.player.shieldLoad).toBeGreaterThan(0);
    expect(next.player.shieldLoad).toBeCloseTo(next.player.shieldMaxLoad, 5);
    expect(next.player.shieldMaxLoad).toBe(40);
  });

  it("delivers caches collected by the player planet into ammo and respawn timers", () => {
    const { state } = createLinearCombatState();
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;
    state.planets = state.planets.map((planet) =>
      planet.id === state.player.planetId
        ? planet
        : {
            ...planet,
            pos: { x: 5_000 + planet.id, y: 0 },
            alive: false,
            hp: 0,
          },
    );

    state.player.ammo.heavy = 0;
    state.caches = [
      {
        id: 601,
        kind: "cache",
        contents: { kind: "heavyAmmo" },
        pos: { x: playerPlanet.pos.x, y: playerPlanet.pos.y },
        vel: { x: 0, y: 0 },
        radius: 24,
      },
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.player.ammo.heavy).toBe(1);
    expect(next.caches).toHaveLength(0);
    expect(next.cacheRespawnAtTicks).toHaveLength(1);
    expect(next.cacheRespawnAtTicks[0]).toBeGreaterThan(next.tick);
  });

  it("uses the current cache pickup radius for already-spawned caches", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.cache.pickupRadius = 70;
    applyRuntimeTuningDocument(tunedDocument);

    const { state } = createLinearCombatState();
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;

    state.player.ammo.heavy = 0;
    state.caches = [
      {
        id: 602,
        kind: "cache",
        contents: { kind: "heavyAmmo" },
        pos: { x: playerPlanet.pos.x + 80, y: playerPlanet.pos.y },
        vel: { x: 0, y: 0 },
        radius: 24,
      },
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.player.ammo.heavy).toBe(1);
    expect(next.caches).toHaveLength(0);
  });

  it("collects caches swept through the pickup radius between fixed ticks", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.cache.pickupRadius = 70;
    applyRuntimeTuningDocument(tunedDocument);

    const { state } = createLinearCombatState();
    const playerPlanetId = state.player.planetId;
    state.planets = state.planets.map((planet) =>
      planet.id === playerPlanetId
        ? {
            ...planet,
            alive: true,
            hp: PLANET_HP,
            pos: { x: -300, y: 85 },
            radius: 20,
            vel: { x: 600 / FIXED_STEP_SEC, y: 0 },
          }
        : {
            ...planet,
            alive: false,
            hp: 0,
            pos: { x: 5_000 + planet.id, y: 0 },
            vel: { x: 0, y: 0 },
          },
    );
    state.player.ammo.heavy = 0;
    state.caches = [
      {
        id: 603,
        kind: "cache",
        contents: { kind: "heavyAmmo" },
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        radius: 24,
      },
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.player.ammo.heavy).toBe(1);
    expect(next.caches).toHaveLength(0);
  });

  it("normalizes existing cache entities to the current pickup radius", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.cache.pickupRadius = 90;
    applyRuntimeTuningDocument(tunedDocument);

    const { state } = createLinearCombatState();

    state.caches = [
      {
        id: 604,
        kind: "cache",
        contents: { kind: "repair" },
        pos: { x: 900, y: 0 },
        vel: { x: 0, y: 0 },
        radius: 24,
      },
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.caches).toHaveLength(1);
    expect(next.caches[0]!.radius).toBe(90);
  });

  it("does not mutate the prior state when repair caches are collected", () => {
    const { state } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );
    state.planets = state.planets.map((planet, index) =>
      index === playerPlanetIndex
        ? planet
        : {
            ...planet,
            pos: { x: 5_000 + planet.id, y: 0 },
            alive: false,
            hp: 0,
          },
    );
    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      hp: PLANET_HP - 50,
    };
    state.caches = [
      {
        id: 603,
        kind: "cache",
        contents: { kind: "repair" },
        pos: {
          x: state.planets[playerPlanetIndex]!.pos.x,
          y: state.planets[playerPlanetIndex]!.pos.y,
        },
        vel: { x: 0, y: 0 },
        radius: 24,
      },
    ];
    const hpBefore = state.planets[playerPlanetIndex]!.hp;

    const delivered = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(state.planets[playerPlanetIndex]!.hp).toBe(hpBefore);
    expect(delivered.planets[playerPlanetIndex]!.hp).toBeGreaterThan(hpBefore);
  });

  it("pushes nearby entities outward when gravity pulse is activated", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    state.player.gravityPulseHeld = true;
    state.rockets = [
      buildRocket({
        id: 701,
        pos: { x: 60, y: 80 },
      }),
    ];
    state.caches = [
      {
        id: 702,
        kind: "cache",
        contents: { kind: "repair" },
        pos: { x: 320, y: 300 },
        vel: { x: 0, y: 0 },
        radius: 24,
      },
    ];
    state.debris = [
      {
        asteroidTier: "small",
        color: "#94a3b8",
        id: 703,
        kind: "debris",
        ownerPlayerId: undefined,
        pos: { x: 640, y: 320 },
        radius: 18,
        ttlUntilTick: state.tick + 120,
        vel: { x: 0, y: 0 },
      },
      {
        color: "#facc15",
        id: 704,
        kind: "debris",
        ownerPlayerId: undefined,
        pos: { x: 640, y: 352 },
        radius: 8,
        ttlUntilTick: state.tick + 120,
        vel: { x: 0, y: 0 },
      },
    ];

    const next = stepSandbox(
      state,
      createStepInput({
        gravityPulseRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const pushedEnemy = next.planets.find(
      (planet) => planet.id === enemyPlanet.id,
    )!;

    expect(next.player.gravityPulseHeld).toBe(false);
    expect(pushedEnemy.vel.x).toBeGreaterThan(0);
    expect(
      Math.hypot(next.rockets[0]!.vel.x, next.rockets[0]!.vel.y),
    ).toBeGreaterThan(0);
    expect(
      Math.hypot(next.caches[0]!.vel.x, next.caches[0]!.vel.y),
    ).toBeGreaterThan(0);
    const pushedAsteroid = next.debris.find((piece) => piece.id === 703)!;
    const cosmeticShard = next.debris.find((piece) => piece.id === 704)!;
    expect(
      Math.hypot(pushedAsteroid.vel.x, pushedAsteroid.vel.y),
    ).toBeGreaterThan(0);
    expect(cosmeticShard.vel).toEqual({ x: 0, y: 0 });
  });

  it("reaches adjacent planets at default sandbox orbit spacing", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === enemyPlanetId,
    );
    state.planets[enemyPlanetIndex] = {
      ...state.planets[enemyPlanetIndex]!,
      pos: { x: GRAVITY_PULSE_RADIUS * 0.85, y: 0 },
      vel: { x: 0, y: 0 },
    };
    state.player.gravityPulseHeld = true;

    const next = stepSandbox(
      state,
      createStepInput({
        gravityPulseRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const pushedEnemy = next.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    expect(next.player.gravityPulseHeld).toBe(false);
    expect(pushedEnemy.vel.x).toBeGreaterThan(0);
  });

  it("creates a visible outward drift after the pulse fires", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === enemyPlanetId,
    );
    state.planets[enemyPlanetIndex] = {
      ...state.planets[enemyPlanetIndex]!,
      pos: { x: GRAVITY_PULSE_RADIUS * 0.8, y: 0 },
      vel: { x: 0, y: 0 },
    };
    state.player.gravityPulseHeld = true;
    const playerPlanetBefore = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;

    const distanceBefore = Math.hypot(
      state.planets[enemyPlanetIndex]!.pos.x - playerPlanetBefore.pos.x,
      state.planets[enemyPlanetIndex]!.pos.y - playerPlanetBefore.pos.y,
    );
    let next = stepSandbox(
      state,
      createStepInput({
        gravityPulseRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    for (let step = 0; step < 12; step += 1) {
      next = stepSandbox(next, createStepInput(), DISABLED_BLACK_HOLE_SPEC);
    }

    const playerPlanet = next.planets.find(
      (planet) => planet.id === next.player.planetId,
    )!;
    const enemyPlanet = next.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const distanceAfter = Math.hypot(
      enemyPlanet.pos.x - playerPlanet.pos.x,
      enemyPlanet.pos.y - playerPlanet.pos.y,
    );

    expect(distanceAfter).toBeGreaterThan(distanceBefore + 20);
  });

  it("interpolates rockets by id but keeps dead planets on their current frame", () => {
    const previous = createLinearCombatState().state;
    const current = createLinearCombatState().state;
    const currentEnemy = current.planets.find(
      (planet) => planet.id !== current.player.planetId && planet.alive,
    )!;
    const previousEnemyIndex = previous.planets.findIndex(
      (planet) => planet.id === currentEnemy.id,
    );

    previous.rockets = [
      buildRocket({
        id: 7,
        pos: { x: 20, y: 0 },
      }),
    ];
    current.rockets = [
      buildRocket({
        id: 7,
        pos: { x: 60, y: 0 },
      }),
    ];
    previous.planets[previousEnemyIndex] = {
      ...previous.planets[previousEnemyIndex]!,
      pos: { x: 180, y: -24 },
      vel: { x: -20, y: 0 },
    };
    current.planets[previousEnemyIndex] = {
      ...currentEnemy,
      alive: false,
      deathReason: "rocket",
      pos: { x: 260, y: 24 },
      vel: { x: 20, y: 0 },
    };
    previous.neutronStars = [
      {
        id: 17,
        kind: "neutronStar",
        mass: 4_000_000,
        pos: { x: 120, y: -40 },
        radius: 36,
        vel: { x: -12, y: 4 },
      },
    ];
    current.neutronStars = [
      {
        id: 17,
        kind: "neutronStar",
        mass: 4_000_000,
        pos: { x: 200, y: 40 },
        radius: 36,
        vel: { x: 20, y: 28 },
      },
    ];

    const interpolated = interpolateSandboxState(previous, current, 0.25);

    expect(interpolated.rockets[0]!.pos.x).toBeCloseTo(30);
    expect(interpolated.neutronStars[0]!.pos).toEqual({ x: 140, y: -20 });
    expect(interpolated.neutronStars[0]!.vel).toEqual({ x: -4, y: 10 });
    expect(interpolated.planets[previousEnemyIndex]!.pos).toEqual(
      current.planets[previousEnemyIndex]!.pos,
    );
    expect(interpolated.planets[previousEnemyIndex]!.vel).toEqual(
      current.planets[previousEnemyIndex]!.vel,
    );
    expect(interpolated.rockets[0]).not.toBe(previous.rockets[0]);
    expect(interpolated.rockets[0]).not.toBe(current.rockets[0]);
    expect(interpolated.planets[previousEnemyIndex]).not.toBe(
      previous.planets[previousEnemyIndex],
    );
    expect(interpolated.planets[previousEnemyIndex]).not.toBe(
      current.planets[previousEnemyIndex],
    );
    expect(previous.rockets[0]!.pos).toEqual({ x: 20, y: 0 });
    expect(current.rockets[0]!.pos).toEqual({ x: 60, y: 0 });
    expect(previous.planets[previousEnemyIndex]!.pos).toEqual({
      x: 180,
      y: -24,
    });
    expect(current.planets[previousEnemyIndex]!.pos).toEqual({
      x: 260,
      y: 24,
    });
  });

  it("surfaces debug labels for caches, wildcards, and locks", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    state.player.selectedRocketKind = "heavy";
    state.player.lockTargetId = enemyPlanet.id;
    state.blackHole = {
      id: 9_001,
      kind: "blackHole",
      mass: 1,
      killRadius: 10,
      pos: { x: 0, y: 0 },
      radius: 10,
      vel: { x: 0, y: 0 },
    };
    state.caches = [
      {
        id: 501,
        kind: "cache",
        contents: { kind: "repair" },
        pos: { x: 400, y: 0 },
        vel: { x: 0, y: 0 },
        radius: 24,
      },
    ];

    const snapshot = getSandboxDebugSnapshot(state);

    expect(snapshot.selectedRocketKind).toBe("heavy");
    expect(snapshot.lockTargetLabel).toBe(enemyPlanet.label);
    expect(snapshot.blackHoleActive).toBe(true);
    expect(snapshot.cacheCount).toBe(1);
    expect(snapshot.gravityPulseHeld).toBe(false);
    expect(
      describeCacheContents({
        kind: "wildcard",
        wildcard: { kind: "gravityPulse" },
      }),
    ).toBe("Wildcard: Gravity Pulse");
    expect(describeWildcard("gravityPulse")).toBe("Gravity Pulse");
  });

  it("grows the black hole after it consumes a planet", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const playerPlanetId = state.player.planetId;

    state.elapsedSec = 1;
    state.blackHole = {
      id: 9_001,
      kind: "blackHole",
      mass: GROWING_BLACK_HOLE_SPEC.mass,
      killRadius: GROWING_BLACK_HOLE_SPEC.killRadius,
      pos: { x: 0, y: 0 },
      radius: GROWING_BLACK_HOLE_SPEC.killRadius,
      vel: { x: 0, y: 0 },
    };
    state.planets = state.planets.map((planet) => {
      if (planet.id === playerPlanetId) {
        return {
          ...planet,
          pos: { x: 220, y: 0 },
          vel: { x: 0, y: 0 },
        };
      }

      if (planet.id === enemyPlanetId) {
        return {
          ...planet,
          pos: { x: 40, y: 0 },
          vel: { x: 0, y: 0 },
          alive: true,
          hp: PLANET_HP,
          deathReason: undefined,
        };
      }

      return planet;
    });

    const swallowedPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const expectedBlackHole = consumeBlackHoleBodies(state.blackHole, [
      swallowedPlanet,
    ]);

    const next = stepSandbox(state, createStepInput(), GROWING_BLACK_HOLE_SPEC);

    const nextEnemy = next.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    expect(nextEnemy.alive).toBe(false);
    expect(nextEnemy.deathReason).toBe("blackHole");
    expect(next.blackHole).toEqual(expectedBlackHole);
  });

  it("waits for the planet center to cross the black-hole horizon", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const playerPlanetId = state.player.planetId;
    const centerCrossingSpec: BlackHoleSpec = {
      ...GROWING_BLACK_HOLE_SPEC,
      mass: 0,
    };

    state.elapsedSec = 1;
    state.blackHole = {
      id: 9_001,
      kind: "blackHole",
      mass: centerCrossingSpec.mass,
      killRadius: centerCrossingSpec.killRadius,
      pos: { x: 0, y: 0 },
      radius: centerCrossingSpec.killRadius,
      vel: { x: 0, y: 0 },
    };
    state.planets = state.planets.map((planet) => {
      if (planet.id === playerPlanetId) {
        return {
          ...planet,
          pos: { x: 220, y: 0 },
          vel: { x: 0, y: 0 },
        };
      }

      if (planet.id === enemyPlanetId) {
        return {
          ...planet,
          pos: { x: 60, y: 0 },
          vel: { x: 0, y: 0 },
          alive: true,
          hp: PLANET_HP,
          deathReason: undefined,
        };
      }

      return planet;
    });

    const next = stepSandbox(state, createStepInput(), centerCrossingSpec);
    const nextEnemy = next.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    expect(nextEnemy.alive).toBe(true);
    expect(nextEnemy.deathReason).toBeUndefined();
  });

  it("ramps the black hole kill radius gradually over the collapse window", () => {
    const { state } = createLinearCombatState();

    state.elapsedSec = GROWING_BLACK_HOLE_SPEC.rampSec / 2;
    state.planets = state.planets.map((planet) =>
      planet.alive
        ? {
            ...planet,
            pos: { x: 260 + planet.id, y: 0 },
            vel: { x: 0, y: 0 },
          }
        : planet,
    );

    const next = stepSandbox(state, createStepInput(), GROWING_BLACK_HOLE_SPEC);
    const expectedKillRadius = getBlackHoleKillRadiusAtElapsedSec(
      state.elapsedSec,
      GROWING_BLACK_HOLE_SPEC,
    );
    const expectedMass = getBlackHoleMassAtElapsedSec(
      state.elapsedSec,
      GROWING_BLACK_HOLE_SPEC,
    );

    expect(next.blackHole).not.toBeNull();
    expect(next.blackHole?.killRadius).toBeCloseTo(expectedKillRadius, 6);
    expect(next.blackHole?.radius).toBeCloseTo(expectedKillRadius, 6);
    expect(next.blackHole?.mass).toBeCloseTo(expectedMass, 6);
    expect(next.blackHole?.killRadius).toBeGreaterThan(0);
    expect(next.blackHole?.killRadius).toBeLessThan(
      GROWING_BLACK_HOLE_SPEC.killRadius,
    );
  });

  it("pulls fixed-pattern suns inward as the black hole collapse starts", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.starMotion = {
      mode: "fixedPattern",
      patternId: "equilateral-circle",
      speed: 0,
    };
    tunedDocument.gameplay.orbits.starPatternDistanceScale = 1.8;
    applyRuntimeTuningDocument(tunedDocument);

    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });
    state.elapsedSec = GROWING_BLACK_HOLE_SPEC.rampSec / 2;

    const next = stepSandbox(state, createStepInput(), GROWING_BLACK_HOLE_SPEC);
    expect(state.starMotion.mode).toBe("fixedPattern");
    expect(next.starMotion.mode).toBe("fixedPattern");
    if (
      state.starMotion.mode !== "fixedPattern" ||
      next.starMotion.mode !== "fixedPattern"
    ) {
      throw new Error("expected fixed-pattern star motion");
    }

    expect(next.starMotion.distanceScale).toBeLessThan(
      state.starMotion.distanceScale,
    );
    expect(Math.hypot(next.suns[0]!.pos.x, next.suns[0]!.pos.y)).toBeLessThan(
      Math.hypot(state.suns[0]!.pos.x, state.suns[0]!.pos.y),
    );
    expect(next.suns[0]!.vel.x).not.toBeCloseTo(state.suns[0]!.vel.x, 6);
    expect(
      Math.hypot(next.suns[0]!.vel.x, next.suns[0]!.vel.y),
    ).toBeGreaterThan(Math.hypot(state.suns[0]!.vel.x, state.suns[0]!.vel.y));
  });

  it("swallows fixed-pattern suns once the collapse finishes", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.starMotion = {
      mode: "fixedPattern",
      patternId: "equilateral-circle",
      speed: 0,
    };
    tunedDocument.gameplay.orbits.starPatternDistanceScale = 1.8;
    applyRuntimeTuningDocument(tunedDocument);

    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });
    state.elapsedSec = GROWING_BLACK_HOLE_SPEC.rampSec;

    const next = stepSandbox(state, createStepInput(), GROWING_BLACK_HOLE_SPEC);

    expect(getActiveCombatSuns(next.suns)).toHaveLength(0);
    expect(next.blackHole).not.toBeNull();
    expect(next.blackHole!.mass).toBeGreaterThan(
      getBlackHoleMassAtElapsedSec(state.elapsedSec, GROWING_BLACK_HOLE_SPEC),
    );
  });

  it("keeps swallowed-body growth on top of the current ramped black hole size", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const playerPlanetId = state.player.planetId;

    state.bots = [];
    state.elapsedSec = GROWING_BLACK_HOLE_SPEC.rampSec / 2;
    state.planets = state.planets.map((planet) => {
      if (planet.id === playerPlanetId) {
        return {
          ...planet,
          pos: { x: 220, y: 0 },
          vel: { x: 0, y: 0 },
        };
      }

      if (planet.id === enemyPlanetId) {
        return {
          ...planet,
          pos: { x: 20, y: 0 },
          vel: { x: 0, y: 0 },
          alive: true,
          hp: PLANET_HP,
          deathReason: undefined,
        };
      }

      return planet;
    });

    const expectedBlackHole = consumeBlackHoleBodies(
      {
        id: 9_001,
        kind: "blackHole" as const,
        mass: getBlackHoleMassAtElapsedSec(
          state.elapsedSec,
          GROWING_BLACK_HOLE_SPEC,
        ),
        killRadius: getBlackHoleKillRadiusAtElapsedSec(
          state.elapsedSec,
          GROWING_BLACK_HOLE_SPEC,
        ),
        pos: { x: 0, y: 0 },
        radius: getBlackHoleKillRadiusAtElapsedSec(
          state.elapsedSec,
          GROWING_BLACK_HOLE_SPEC,
        ),
        vel: { x: 0, y: 0 },
      },
      [state.planets.find((planet) => planet.id === enemyPlanetId)!],
    );

    const next = stepSandbox(state, createStepInput(), GROWING_BLACK_HOLE_SPEC);

    expect(next.blackHole).toEqual(expectedBlackHole);
  });

  it("destroys planets when they touch a neutron star", () => {
    const { state, enemyPlanetId } = createLinearCombatState();

    state.neutronStars = [
      {
        id: 70_001,
        kind: "neutronStar",
        mass: 1_000_000,
        pos: { x: 220, y: 0 },
        radius: 40,
        vel: { x: 0, y: 0 },
      },
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    const nextEnemy = next.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    expect(nextEnemy.alive).toBe(false);
    expect(nextEnemy.deathReason).toBe("neutronStar");
  });

  it("lets neutron stars absorb suns and grow", () => {
    const { state } = createLinearCombatState();

    state.starMotion = { mode: "physicsSeed" };
    state.planets = state.planets.map((planet) => ({
      ...planet,
      alive: false,
      deathReason: "rocket",
      hp: 0,
      debuffs: {},
      pos: { x: 5_000 + planet.id, y: 0 },
      vel: { x: 0, y: 0 },
    }));
    state.suns = [
      {
        id: 70_020,
        kind: "sun",
        mass: 220_000,
        radius: 72,
        pos: { x: 240, y: 0 },
        vel: { x: 18, y: 0 },
        swallowedAtSec: null,
      },
    ];
    state.neutronStars = [
      {
        id: 70_021,
        kind: "neutronStar",
        mass: 1_000_000,
        pos: { x: 240, y: 0 },
        radius: 60,
        vel: { x: 0, y: 0 },
      },
    ];

    const next = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(next.suns).toHaveLength(0);
    expect(next.neutronStars).toHaveLength(1);
    expect(next.neutronStars[0]!.mass).toBe(1_220_000);
    expect(next.neutronStars[0]!.radius).toBeGreaterThan(
      state.neutronStars[0]!.radius,
    );
    expect(next.neutronStars[0]!.vel.x).toBeGreaterThan(0);
  });

  it("pulls neutron stars toward an active black hole", () => {
    const { state } = createLinearCombatState();

    state.elapsedSec = 1;
    state.suns = [];
    state.planets = state.planets.map((planet) => ({
      ...planet,
      alive: false,
      deathReason: "rocket",
      hp: 0,
      debuffs: {},
      pos: { x: 5_000 + planet.id, y: 0 },
      vel: { x: 0, y: 0 },
    }));
    state.neutronStars = [
      {
        id: 70_010,
        kind: "neutronStar",
        mass: 4_000_000,
        pos: { x: 300, y: 0 },
        radius: 40,
        vel: { x: 0, y: 0 },
      },
    ];

    const next = stepSandbox(state, createStepInput(), ACTIVE_BLACK_HOLE_SPEC);

    expect(next.neutronStars).toHaveLength(1);
    expect(next.neutronStars[0]!.pos.x).toBeLessThan(
      state.neutronStars[0]!.pos.x,
    );
    expect(next.neutronStars[0]!.vel.x).toBeLessThan(0);
  });

  it("lets black holes swallow neutron stars", () => {
    const { state } = createLinearCombatState();

    state.elapsedSec = 1;
    state.suns = [];
    state.planets = state.planets.map((planet) => ({
      ...planet,
      alive: false,
      deathReason: "rocket",
      hp: 0,
      debuffs: {},
      pos: { x: 5_000 + planet.id, y: 0 },
      vel: { x: 0, y: 0 },
    }));
    state.neutronStars = [
      {
        id: 70_011,
        kind: "neutronStar",
        mass: 4_000_000,
        pos: { x: 140, y: 0 },
        radius: 40,
        vel: { x: 0, y: 0 },
      },
    ];

    const next = stepSandbox(state, createStepInput(), ACTIVE_BLACK_HOLE_SPEC);

    expect(next.neutronStars).toHaveLength(0);
    expect(next.blackHole?.mass).toBe(
      ACTIVE_BLACK_HOLE_SPEC.mass + state.neutronStars[0]!.mass,
    );
    expect(next.blackHole?.killRadius).toBeCloseTo(
      Math.hypot(
        ACTIVE_BLACK_HOLE_SPEC.killRadius,
        state.neutronStars[0]!.radius,
      ),
    );
  });

  it("grows the black hole once when it swallows a sun", () => {
    const { state } = createLinearCombatState();
    const playerPlanetId = state.player.planetId;

    state.elapsedSec = 1;
    state.blackHole = {
      id: 9_001,
      kind: "blackHole",
      mass: GROWING_BLACK_HOLE_SPEC.mass,
      killRadius: GROWING_BLACK_HOLE_SPEC.killRadius,
      pos: { x: 0, y: 0 },
      radius: GROWING_BLACK_HOLE_SPEC.killRadius,
      vel: { x: 0, y: 0 },
    };
    state.planets = state.planets.map((planet) =>
      planet.alive
        ? {
            ...planet,
            pos: {
              x: planet.id === playerPlanetId ? 240 : 320 + planet.id,
              y: 0,
            },
            vel: { x: 0, y: 0 },
          }
        : planet,
    );
    state.suns = [
      {
        id: 901,
        kind: "sun",
        mass: 180,
        radius: 36,
        pos: { x: 40, y: 0 },
        vel: { x: 0, y: 0 },
        swallowedAtSec: null,
      },
    ];
    state.starMotion = { mode: "physicsSeed" };

    const expectedBlackHole = consumeBlackHoleBodies(state.blackHole, [
      state.suns[0]!,
    ]);

    const first = stepSandbox(
      state,
      createStepInput(),
      GROWING_BLACK_HOLE_SPEC,
    );

    expect(first.suns[0]!.swallowedAtSec).not.toBeNull();
    expect(first.blackHole).toEqual(expectedBlackHole);

    const second = stepSandbox(
      first,
      createStepInput(),
      GROWING_BLACK_HOLE_SPEC,
    );

    expect(second.blackHole).toEqual(first.blackHole);
  });

  it("filters swallowed suns without resetting the sandbox", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    state.suns = [
      {
        id: 801,
        kind: "sun",
        mass: 100,
        radius: 30,
        pos: { x: -100, y: 0 },
        vel: { x: 0, y: 0 },
        swallowedAtSec: null,
      },
      {
        id: 802,
        kind: "sun",
        mass: 0,
        radius: 30,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        swallowedAtSec: 2,
      },
    ];
    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      alive: false,
      hp: 0,
      deathReason: "rocket",
    };
    state.planets = state.planets.map((planet) =>
      planet.id === enemyPlanet.id
        ? {
            ...planet,
            alive: true,
            hp: PLANET_HP,
          }
        : planet,
    );
    state.elapsedSec = 6.1;

    expect(getActiveCombatSuns(state.suns)).toHaveLength(1);
  });
});
