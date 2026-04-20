import {
  ARENA_RADIUS,
  BLACK_HOLE_SPEC,
  CURRENT_GAME_TUNING,
  FIXED_STEP_SEC,
  consumeBlackHoleBodies,
  GRAVITY_PULSE_RADIUS,
  getSeekerLockTicks,
  type BlackHoleSpec,
  PLANET_HP,
  ROCKET_SPECS,
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
  getSandboxResetReason,
  interpolateSandboxState,
  stepSandbox,
} from "./combatSandbox";
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

beforeEach(() => {
  applyRuntimeTuningDocument(CURRENT_GAME_TUNING);
});

const createStepInput = (
  overrides: Partial<CombatSandboxStepInput> = {},
): CombatSandboxStepInput => ({
  aimWorld: { x: 220, y: 0 },
  selectedRocketKind: "light",
  fireRequested: false,
  foresightRequested: false,
  shieldRequested: false,
  boostRequested: false,
  gravityPulseRequested: false,
  cloakRequested: false,
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

    expect(playerPlanet?.label).toBe(DEFAULT_ORBIT_PRESET.planets[4]!.label);
    expect(state.player.selectedRocketKind).toBe("light");
    expect(state.player.ammo).toEqual({
      heavy: ROCKET_SPECS.heavy.startAmmo,
      light: ROCKET_SPECS.light.startAmmo,
      seeker: ROCKET_SPECS.seeker.startAmmo,
    });
    expect(state.caches.length).toBeGreaterThan(0);
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
    expect(state.playerLossResetsEnabled).toBe(false);
    expect(state.planets).toHaveLength(7);
    expect(state.bots).toHaveLength(6);
    expect(focusedPlanet?.displayName).toBe("Atlas");
  });

  it("uses runtime orbit tuning for the default sandbox seeds", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
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
    expect(next.playerLostAtSec).toBe(next.elapsedSec);
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
    expect(next.playerLostAtSec).toBeNull();
  });

  it("assigns local pilot display names for the player and bots", () => {
    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      playerName: "Samir",
    });
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    );
    const botDisplayNames = state.planets
      .filter((planet) => planet.id !== state.player.planetId)
      .map((planet) => planet.displayName);

    expect(playerPlanet?.displayName).toBe("Samir");
    expect(new Set(botDisplayNames).size).toBe(botDisplayNames.length);
    expect(botDisplayNames.some((name) => /^[IVX]+$/.test(name))).toBe(false);
  });

  it("fires a light rocket and starts its reload timer", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
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
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const enemyBot = state.bots.find((bot) => bot.planetId === enemyPlanetId)!;
    enemyBot.difficulty = "hard";

    let current = state;
    for (let step = 0; step < 20; step += 1) {
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

  it("lets foresight reactivate from partial charge instead of waiting for full refill", () => {
    const { state } = createLinearCombatState();

    const activated = stepSandbox(
      state,
      createStepInput({ foresightRequested: true }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    expect(activated.player.foresightActiveUntilTick).toBeGreaterThan(
      activated.tick,
    );
    const fullDurationRemaining =
      activated.player.foresightActiveUntilTick - activated.tick;
    let partiallyDrained = activated;
    for (let index = 0; index < 12; index += 1) {
      partiallyDrained = stepSandbox(
        partiallyDrained,
        createStepInput(),
        DISABLED_BLACK_HOLE_SPEC,
      );
    }

    const toggledOff = stepSandbox(
      partiallyDrained,
      createStepInput({ foresightRequested: true }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    expect(toggledOff.player.foresightActiveUntilTick).toBeLessThanOrEqual(
      toggledOff.tick,
    );
    expect(toggledOff.player.foresightCooldownUntilTick).toBeGreaterThan(
      toggledOff.tick,
    );

    const reactivated = stepSandbox(
      toggledOff,
      createStepInput({ foresightRequested: true }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    expect(reactivated.player.foresightActiveUntilTick).toBeGreaterThan(
      reactivated.tick,
    );
    expect(
      reactivated.player.foresightActiveUntilTick - reactivated.tick,
    ).toBeLessThan(fullDurationRemaining);
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

  it("refills foresight to a full extended charge when the foresight cache is delivered", () => {
    const { state } = createLinearCombatState();
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;
    const baseDurationTicks = state.player.foresightDurationTicks;

    state.player.foresightCooldownUntilTick =
      state.tick + baseDurationTicks * 4;
    state.caches = [
      {
        id: 602,
        kind: "cache",
        contents: { kind: "foresightExt" },
        pos: { x: playerPlanet.pos.x, y: playerPlanet.pos.y },
        vel: { x: 0, y: 0 },
        radius: 24,
      },
    ];

    const delivered = stepSandbox(
      state,
      createStepInput(),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(delivered.player.nextForesightExt).toBe(true);
    expect(delivered.player.foresightCooldownUntilTick).toBeLessThanOrEqual(
      delivered.tick,
    );

    const activated = stepSandbox(
      delivered,
      createStepInput({ foresightRequested: true }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(activated.player.nextForesightExt).toBe(false);
    expect(
      activated.player.foresightActiveUntilTick - activated.tick,
    ).toBeGreaterThan(baseDurationTicks);
  });

  it("does not mutate the prior state when repair caches are collected", () => {
    const { state } = createLinearCombatState();
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
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

  it("cloaks the player planet when cloak is activated", () => {
    const { state } = createLinearCombatState();
    state.player.cloakHeld = true;

    const next = stepSandbox(
      state,
      createStepInput({
        cloakRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const playerPlanetAfter = next.planets.find(
      (planet) => planet.id === next.player.planetId,
    )!;

    expect(next.player.cloakHeld).toBe(false);
    expect(playerPlanetAfter.hideTrailUntilTick).toBeGreaterThan(next.tick);
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
        pos: { x: 200, y: 140 },
        vel: { x: 0, y: 0 },
        radius: 24,
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

  it("consumes cloak and gravity pulse independently in the same step", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    state.player.gravityPulseHeld = true;
    state.player.cloakHeld = true;
    const playerPlanetBefore = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;
    const enemyPlanetBefore = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const playerHideTrailBefore = playerPlanetBefore.hideTrailUntilTick;
    const enemyVelBefore = { ...enemyPlanetBefore.vel };

    const next = stepSandbox(
      state,
      createStepInput({
        gravityPulseRequested: true,
        cloakRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const playerPlanetAfter = next.planets.find(
      (planet) => planet.id === next.player.planetId,
    )!;
    const enemyPlanetAfter = next.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    expect(next.player.gravityPulseHeld).toBe(false);
    expect(next.player.cloakHeld).toBe(false);
    expect(playerPlanetAfter.hideTrailUntilTick).toBeGreaterThan(next.tick);
    expect(enemyPlanetAfter.vel.x).toBeGreaterThan(0);
    expect(state.player.gravityPulseHeld).toBe(true);
    expect(state.player.cloakHeld).toBe(true);
    expect(
      state.planets.find((planet) => planet.id === state.player.planetId)!
        .hideTrailUntilTick,
    ).toBe(playerHideTrailBefore);
    expect(
      state.planets.find((planet) => planet.id === enemyPlanetId)!.vel,
    ).toEqual(enemyVelBefore);
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

    const interpolated = interpolateSandboxState(previous, current, 0.25);

    expect(interpolated.rockets[0]!.pos.x).toBeCloseTo(30);
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
    state.player.cloakHeld = true;
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
    expect(snapshot.cloakHeld).toBe(true);
    expect(
      describeCacheContents({ kind: "wildcard", wildcard: { kind: "cloak" } }),
    ).toBe("Wildcard: Cloak");
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
          pos: { x: 60, y: 0 },
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
        pos: { x: 60, y: 0 },
        vel: { x: 0, y: 0 },
        swallowedAtSec: null,
      },
    ];

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

  it("filters swallowed suns and reports player-loss resets after the timeout", () => {
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
    state.playerLostAtSec = 0;
    state.elapsedSec = 6.1;

    expect(getActiveCombatSuns(state.suns)).toHaveLength(1);
    expect(getSandboxResetReason(state)).toBe("playerLost");
  });

  it("does not reset the sandbox when active suns collide", () => {
    const { state } = createLinearCombatState();

    state.suns = [
      {
        id: 801,
        kind: "sun",
        mass: 100,
        radius: 30,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        swallowedAtSec: null,
      },
      {
        id: 802,
        kind: "sun",
        mass: 100,
        radius: 30,
        pos: { x: 20, y: 0 },
        vel: { x: 0, y: 0 },
        swallowedAtSec: null,
      },
    ];

    expect(getActiveCombatSuns(state.suns)).toHaveLength(2);
    expect(getSandboxResetReason(state)).toBeNull();
  });

  it("does not reset observer-mode sandboxes when the focused bot is destroyed", () => {
    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      playerBehavior: "bot",
    });
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );

    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      alive: false,
      hp: 0,
      deathReason: "rocket",
    };
    state.playerLostAtSec = 0;
    state.elapsedSec = 12;

    expect(getSandboxResetReason(state)).toBeNull();
  });
});
