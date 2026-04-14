import {
  BLACK_HOLE_SPEC,
  PLANET_HP,
  ROCKET_SPECS,
  type BlackHoleSpec,
} from "@3body/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import {
  SEEKER_LOCK_TICKS,
  createSandboxState,
  describeCacheContents,
  describeWildcard,
  getActiveCombatSuns,
  getSandboxDebugSnapshot,
  getSandboxResetReason,
  interpolateSandboxState,
  stepSandbox,
  type CombatSandboxRocket,
  type CombatSandboxState,
  type CombatSandboxStepInput,
} from "./combatSandbox";

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
  droneBurstRequested: false,
  droneAutoReturnRequested: false,
  droneRecallRequested: false,
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
  turnRateMultiplier: 1,
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

  it("lets the player's shield absorb rockets from the protected arc", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const playerPlanet = state.planets.find(
      (planet) => planet.id === state.player.planetId,
    )!;

    state.player.shieldActiveUntilTick = 100;
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
  });

  it("blocks weapon fire while the player's shield is active", () => {
    const { state, enemyPlanetId } = createLinearCombatState();
    const enemyPlanet = state.planets.find(
      (planet) => planet.id === enemyPlanetId,
    )!;
    const lightAmmoBefore = state.player.ammo.light;

    state.player.shieldActiveUntilTick = 20;

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

  it("launches a drone and recalls it back into planet control", () => {
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

    const recalled = stepSandbox(
      launched,
      createStepInput({
        aimWorld: { x: 220, y: 0 },
        droneRecallRequested: true,
      }),
      DISABLED_BLACK_HOLE_SPEC,
    );

    expect(recalled.drones).toHaveLength(0);
    expect(recalled.player.controlMode).toBe("planet");
    expect(recalled.player.activeDroneId).toBeNull();
    expect(recalled.debris.length).toBeGreaterThan(0);
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
        fuel: 2,
        ttlUntilTick: 40,
        mode: "piloted",
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
        fuel: 2,
        ttlUntilTick: 20,
        mode: "piloted",
        cargo: { kind: "shieldExt" },
      },
    ];
    state.player.activeDroneId = 502;

    const snapshot = getSandboxDebugSnapshot(state);

    expect(snapshot.selectedRocketKind).toBe("heavy");
    expect(snapshot.lockTargetLabel).toBe(enemyPlanet.label);
    expect(snapshot.blackHoleActive).toBe(true);
    expect(snapshot.cacheCount).toBe(1);
    expect(snapshot.droneMode).toBe("piloting");
    expect(snapshot.droneCargoLabel).toBe("Shield Ext");
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
