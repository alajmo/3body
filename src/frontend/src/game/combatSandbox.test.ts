import {
  BLACK_HOLE_SPEC,
  type BlackHoleSpec,
  PLANET_HP,
  ROCKET_SPECS,
} from "@3body/shared";
import { describe, expect, it } from "vitest";
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
  SEEKER_LOCK_TICKS,
  stepSandbox,
} from "./combatSandbox";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import { SHIELD_OUTER_SCALE } from "./shieldPresentation";

const DISABLED_BLACK_HOLE_SPEC: BlackHoleSpec = {
  ...BLACK_HOLE_SPEC,
  spawnSec: Number.POSITIVE_INFINITY,
};

const createStepInput = (
  overrides: Partial<CombatSandboxStepInput> = {},
): CombatSandboxStepInput => ({
  aimWorld: { x: 220, y: 0 },
  selectedRocketKind: "light",
  fireRequested: false,
  foresightRequested: false,
  shieldRequested: false,
  boostRequested: false,
  wildcardRequested: false,
  droneLaunchRequested: false,
  droneTurnLeftHeld: false,
  droneTurnRightHeld: false,
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

  it("can start the local sandbox with bot AI disabled", () => {
    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });

    expect(state.bots).toEqual([]);
    expect(state.planets).toHaveLength(DEFAULT_ORBIT_PRESET.planets.length);
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
    state.player.seekerLockAcquiredAtTick = 1 - SEEKER_LOCK_TICKS;

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

  it("keeps a launch burst even when a fired rocket hits during the same simulation step", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === enemyPlanetId,
    );
    state.planets[enemyPlanetIndex] = {
      ...state.planets[enemyPlanetIndex]!,
      pos: { x: 95, y: 0 },
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
        aimWorld: { x: 95, y: 0 },
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
      pos: { x: enemyPlanet.pos.x + 60, y: enemyPlanet.pos.y },
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

  it("launches a drone and detonates it when the fuse expires", () => {
    const { state } = createLinearCombatState();

    const launched = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: 220, y: 0 },
        droneLaunchRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(launched.drones).toHaveLength(1);
    expect(launched.player.controlMode).toBe("drone");
    expect(launched.player.activeDroneId).toBe(launched.drones[0]!.id);

    const armed = {
      ...launched,
      drones: [
        {
          ...launched.drones[0]!,
          ttlUntilTick: launched.tick + 1,
        },
      ],
    };

    const detonated = stepSandbox(
      armed,
      createStepInput({
        aimWorld: { x: 220, y: 0 },
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(detonated.drones).toHaveLength(0);
    expect(detonated.player.controlMode).toBe("planet");
    expect(detonated.player.activeDroneId).toBeNull();
    expect(detonated.debris.length).toBeGreaterThan(0);
  });

  it("consumes a teleport-swap wildcard only when a target is aligned", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const playerPlanetBefore = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;
    const enemyPlanetBefore = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const playerStartPos = { ...playerPlanetBefore.pos };
    const enemyStartPos = { ...enemyPlanetBefore.pos };

    state.player.wildcardSlot = "teleportSwap";

    const next = stepSandbox(
      state,
      createStepInput({
        aimWorld: { x: enemyPlanetBefore.pos.x, y: enemyPlanetBefore.pos.y },
        wildcardRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const playerPlanetAfter = next.planets.find(
      (planet) => planet.id === next.player.planetId,
    )!;
    const enemyPlanetAfter = next.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    expect(next.player.wildcardSlot).toBeNull();
    expect(playerPlanetAfter.pos).toEqual(enemyStartPos);
    expect(enemyPlanetAfter.pos).toEqual(playerStartPos);
  });

  it("pushes nearby entities outward when gravity pulse is activated", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    state.player.wildcardSlot = "gravityPulse";
    state.rockets = [
      buildRocket({
        id: 701,
        pos: { x: 60, y: 80 },
      }),
    ];
    state.drones = [
      {
        id: 702,
        kind: "drone",
        ownerId: "bot-drone",
        pos: { x: 120, y: -100 },
        vel: { x: 0, y: 0 },
        radius: 18,
        ttlUntilTick: 40,
      },
    ];
    state.caches = [
      {
        id: 703,
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
        wildcardRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );
    const pushedEnemy = next.planets.find(
      (planet) => planet.id === enemyPlanet.id,
    )!;

    expect(next.player.wildcardSlot).toBeNull();
    expect(pushedEnemy.vel.x).toBeGreaterThan(0);
    expect(
      Math.hypot(next.rockets[0]!.vel.x, next.rockets[0]!.vel.y),
    ).toBeGreaterThan(0);
    expect(
      Math.hypot(next.drones[0]!.vel.x, next.drones[0]!.vel.y),
    ).toBeGreaterThan(0);
    expect(
      Math.hypot(next.caches[0]!.vel.x, next.caches[0]!.vel.y),
    ).toBeGreaterThan(0);
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
  });

  it("surfaces debug labels for caches, wildcards, locks, and active drones", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;

    state.player.selectedRocketKind = "heavy";
    state.player.lockTargetId = enemyPlanet.id;
    state.player.wildcardSlot = "teleportSwap";
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
    state.drones = [
      {
        id: 502,
        kind: "drone",
        ownerId: "player",
        pos: { x: 10, y: 0 },
        vel: { x: 0, y: 0 },
        radius: 18,
        ttlUntilTick: 20,
      },
    ];
    state.player.activeDroneId = 502;

    const snapshot = getSandboxDebugSnapshot(state);

    expect(snapshot.selectedRocketKind).toBe("heavy");
    expect(snapshot.lockTargetLabel).toBe(enemyPlanet.label);
    expect(snapshot.blackHoleActive).toBe(true);
    expect(snapshot.cacheCount).toBe(1);
    expect(snapshot.droneMode).toBe("active");
    expect(snapshot.wildcardLabel).toBe("Teleport Swap");
    expect(
      describeCacheContents({ kind: "wildcard", wildcard: { kind: "cloak" } }),
    ).toBe("Wildcard: Cloak");
    expect(describeWildcard("gravityPulse")).toBe("Gravity Pulse");
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
});
