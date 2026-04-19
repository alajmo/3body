import {
  ARENA_RADIUS,
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  buildCombatAiPlan,
  cloneGameTuningDocument,
  DEFAULT_GAME_TUNING,
  FORESIGHT_SPEC,
  PLANET_HP,
  ROCKET_SPECS,
  SHIELD_SPEC,
  createCombatBotMemory,
  decideCombatAi,
  decideCombatBot,
  type CombatBotContext,
  type PlanetPrivateState,
  type PlanetPublic,
  type World,
} from "@3body/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createSandboxState,
  getSandboxDebugSnapshot,
  stepSandbox,
  type CombatSandboxStepInput,
} from "./combatSandbox";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import {
  applyRuntimeTuningDocument,
  getRuntimeTuningDocument,
} from "./runtimeTuning";
import { buildLocalSandboxHudState } from "./viewport/localHud";

const DISABLED_BLACK_HOLE_SPEC = {
  ...BLACK_HOLE_SPEC,
  spawnSec: Number.POSITIVE_INFINITY,
};

const createPlanet = (
  overrides: Partial<PlanetPublic> & Pick<PlanetPublic, "id" | "playerId">,
): PlanetPublic => ({
  id: overrides.id,
  kind: "planet",
  playerId: overrides.playerId,
  archetype: overrides.archetype ?? "terra",
  hp: overrides.hp ?? PLANET_HP,
  shieldAimDir: overrides.shieldAimDir ?? { x: 1, y: 0 },
  shieldActive: overrides.shieldActive ?? false,
  shieldLoad: overrides.shieldLoad ?? 100,
  shieldMaxLoad: overrides.shieldMaxLoad ?? 100,
  hideTrailUntilTick: overrides.hideTrailUntilTick ?? 0,
  pos: overrides.pos ?? { x: 0, y: 0 },
  vel: overrides.vel ?? { x: 0, y: 0 },
  radius: overrides.radius ?? 20,
  debuffs: overrides.debuffs ?? {},
});

const createPrivateState = (
  planetId: number,
  overrides: Partial<PlanetPrivateState> = {},
): PlanetPrivateState => ({
  planetId,
  ammo: {
    light: 6,
    heavy: 3,
    seeker: 2,
    ...overrides.ammo,
  },
  cooldowns: {
    lightReloadUntilTick: 0,
    heavyReloadUntilTick: 0,
    seekerReloadUntilTick: 0,
    foresightActiveUntilTick: 0,
    foresightCooldownUntilTick: 0,
    foresightDurationTicks: 0,
    droneCooldownUntilTick: 0,
    ...overrides.cooldowns,
  },
  boostCharges: overrides.boostCharges ?? 2,
  gravityPulseHeld: overrides.gravityPulseHeld ?? false,
  cloakHeld: overrides.cloakHeld ?? false,
  nextShieldExt: overrides.nextShieldExt ?? false,
  nextForesightExt: overrides.nextForesightExt ?? false,
});

const createWorld = (
  planets: PlanetPublic[],
  overrides: Partial<World> = {},
): World => ({
  suns: overrides.suns ?? [],
  neutronStars: overrides.neutronStars ?? [],
  planets,
  rockets: overrides.rockets ?? [],
  drones: overrides.drones ?? [],
  caches: overrides.caches ?? [],
  blackHole: overrides.blackHole,
  debris: overrides.debris ?? [],
  arenaRadius: overrides.arenaRadius ?? ARENA_RADIUS,
});

const createContext = ({
  difficulty = "hard",
  privateState,
  runtime,
  self,
  tick = 0,
  world,
}: {
  difficulty?: CombatBotContext["difficulty"];
  privateState: PlanetPrivateState;
  runtime?: CombatBotContext["runtime"];
  self: PlanetPublic;
  tick?: number;
  world: World;
}): CombatBotContext => ({
  difficulty,
  tick,
  tickHz: 120,
  world,
  self,
  privateState,
  runtime: runtime ?? {
    activeDroneId: null,
    controlMode: "planet",
  },
});

const createStepInput = (
  overrides: Partial<CombatSandboxStepInput> = {},
): CombatSandboxStepInput => ({
  aimWorld: { x: 240, y: 0 },
  selectedRocketKind: "light",
  fireRequested: false,
  foresightRequested: false,
  shieldRequested: false,
  boostRequested: false,
  gravityPulseRequested: false,
  cloakRequested: false,
  droneLaunchRequested: false,
  droneTurnLeftHeld: false,
  droneTurnRightHeld: false,
  ...overrides,
});

beforeEach(() => {
  applyRuntimeTuningDocument(cloneGameTuningDocument(DEFAULT_GAME_TUNING));
});

describe("AI mode", () => {
  it("uses boost in the opening window of an observer sandbox match", () => {
    let state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botDifficulty: "hard",
      participantCount: 7,
      playerBehavior: "bot",
    });

    for (let step = 0; step < 6 * 120; step += 1) {
      state = stepSandbox(state, createStepInput(), DISABLED_BLACK_HOLE_SPEC);
    }

    const boostedControllers = [
      ...(state.playerBot === null ? [] : [state.player]),
      ...state.bots,
    ].filter((controller) => controller.lastBoostTick !== null);
    const firstBoostTick = boostedControllers.reduce(
      (best, controller) =>
        controller.lastBoostTick === null
          ? best
          : Math.min(best, controller.lastBoostTick),
      Number.POSITIVE_INFINITY,
    );

    expect(boostedControllers.length).toBeGreaterThanOrEqual(2);
    expect(firstBoostTick).toBeLessThanOrEqual(240);
  });

  it("opens with offensive rocket pressure in the observer sandbox exchange", () => {
    let state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botDifficulty: "hard",
      participantCount: 7,
      playerBehavior: "bot",
    });
    const observedKinds = new Set<string>();

    for (let step = 0; step < 12 * 120; step += 1) {
      state = stepSandbox(state, createStepInput(), DISABLED_BLACK_HOLE_SPEC);
      for (const burst of state.launchBursts) {
        observedKinds.add(burst.rocketKind);
      }
    }

    expect(Array.from(observedKinds)).toEqual(
      expect.arrayContaining(["heavy"]),
    );
  });

  it("holds fire when a target is actively shielding the lane", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: 0, y: 0 },
      shieldLoad: 100,
      shieldMaxLoad: 100,
      shieldActive: false,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 420, y: 0 },
      shieldActive: true,
      shieldLoad: 100,
      shieldMaxLoad: 100,
      shieldAimDir: { x: -1, y: 0 },
    });
    const world = createWorld([self, target]);
    const memory = createCombatBotMemory();

    const commands = decideCombatBot(
      createContext({
        self,
        privateState: createPrivateState(self.id),
        tick: 8,
        world,
      }),
      memory,
    );

    expect(memory.blackboard.plan?.fireGate.allowFire).toBe(false);
    expect(commands.some((command) => command.type === "fireRocket")).toBe(
      false,
    );
  });

  it("switches to survive intent and an evade plan near the boundary", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: ARENA_RADIUS * 0.97, y: 0 },
      vel: { x: 180, y: 0 },
      shieldLoad: 40,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: -500, y: 0 },
    });
    const world = createWorld([self, target]);
    const memory = createCombatBotMemory();

    decideCombatAi(
      createContext({
        self,
        privateState: createPrivateState(self.id, {
          boostCharges: 2,
        }),
        world,
      }),
      memory,
    );

    expect(memory.blackboard.intent.kind).toBe("survive");
    expect(memory.blackboard.plan?.executionState).toBe("evade");
    expect(memory.blackboard.plan?.abilityPolicy.boost).toBe(true);
  });

  it("creates a cache run when ammo is low and a favorable cache is open", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: 0, y: 0 },
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 920, y: 120 },
      vel: { x: 30, y: 0 },
    });
    const world = createWorld([self, target], {
      caches: [
        {
          id: 301,
          kind: "cache",
          contents: { kind: "heavyAmmo" },
          pos: { x: 140, y: 0 },
          vel: { x: 0, y: 0 },
          radius: 24,
        },
      ],
    });
    const memory = createCombatBotMemory();

    decideCombatAi(
      createContext({
        self,
        privateState: createPrivateState(self.id, {
          ammo: {
            light: ROCKET_SPECS.light.startAmmo,
            heavy: 0,
            seeker: 0,
          },
        }),
        world,
      }),
      memory,
    );

    expect(memory.blackboard.perception.bestCacheId).toBe(301);
    expect(memory.blackboard.plan?.moveGoal?.targetCacheId).toBe(301);
    expect(
      memory.blackboard.intent.kind === "contestCache" ||
        memory.blackboard.plan?.executionState === "cacheRun",
    ).toBe(true);
  });

  it("commits a boost when a repair cache is the best survival play", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      hp: 24,
      pos: { x: -240, y: -80 },
      vel: { x: 70, y: 10 },
      shieldLoad: 0,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 1040, y: 360 },
      vel: { x: -40, y: 0 },
    });
    const world = createWorld([self, target], {
      caches: [
        {
          id: 401,
          kind: "cache",
          contents: { kind: "repair" },
          pos: { x: 220, y: -40 },
          vel: { x: 0, y: 0 },
          radius: 24,
        },
      ],
    });
    const memory = createCombatBotMemory();

    decideCombatAi(
      createContext({
        self,
        privateState: createPrivateState(self.id, {
          ammo: {
            light: 2,
            heavy: 0,
            seeker: 0,
          },
          boostCharges: 2,
        }),
        tick: 120,
        world,
      }),
      memory,
    );

    expect(memory.blackboard.intent.kind).toMatch(/recover|contestCache/);
    expect(memory.blackboard.plan?.moveGoal?.targetCacheId).toBe(401);
    expect(memory.blackboard.plan?.moveGoal?.usesBoost).toBe(true);
    expect(memory.blackboard.plan?.abilityPolicy.boost).toBe(true);
  });

  it("chooses an escape burn away from an incoming rocket", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: 0, y: 0 },
      vel: { x: 30, y: 0 },
      shieldLoad: 0,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 420, y: 0 },
      vel: { x: 0, y: 0 },
    });
    const world = createWorld([self, target], {
      rockets: [
        {
          id: 91,
          kind: "rocket",
          ownerId: target.playerId,
          rocketKind: "light",
          pos: { x: 320, y: 12 },
          vel: { x: -420, y: 0 },
          radius: 10,
          ttlUntilTick: 240,
        },
      ],
    });
    const memory = createCombatBotMemory();

    decideCombatAi(
      createContext({
        self,
        privateState: createPrivateState(self.id, {
          boostCharges: 2,
        }),
        tick: 60,
        world,
      }),
      memory,
    );

    expect(memory.blackboard.intent.kind).toBe("survive");
    expect(memory.blackboard.plan?.moveGoal?.kind).toBe("escape");
    expect(memory.blackboard.plan?.abilityPolicy.boost).toBe(true);
    expect(memory.blackboard.plan?.moveGoal?.dir.x).toBeLessThan(-0.2);
  });

  it("honors runtime AI tuning for boost commitment", () => {
    const tunedDocument = cloneGameTuningDocument(getRuntimeTuningDocument());
    tunedDocument.gameplay.ai.execution.boostCommitScoreDelta = 999;
    applyRuntimeTuningDocument(tunedDocument);

    const self = createPlanet({
      id: 1,
      playerId: "self",
      hp: 24,
      pos: { x: -240, y: -80 },
      vel: { x: 70, y: 10 },
      shieldLoad: 0,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 1040, y: 360 },
      vel: { x: -40, y: 0 },
    });
    const world = createWorld([self, target], {
      caches: [
        {
          id: 402,
          kind: "cache",
          contents: { kind: "repair" },
          pos: { x: 220, y: -40 },
          vel: { x: 0, y: 0 },
          radius: 24,
        },
      ],
    });
    const memory = createCombatBotMemory();

    decideCombatAi(
      createContext({
        self,
        privateState: createPrivateState(self.id, {
          ammo: {
            light: 2,
            heavy: 0,
            seeker: 0,
          },
          boostCharges: 2,
        }),
        tick: 120,
        world,
      }),
      memory,
    );

    expect(memory.blackboard.plan?.moveGoal?.targetCacheId).toBe(402);
    expect(memory.blackboard.plan?.moveGoal?.usesBoost).toBe(true);
    expect(memory.blackboard.plan?.abilityPolicy.boost).toBe(false);
  });

  it("executes a selected boost plan during pressure intent", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: -980, y: -160 },
      vel: { x: -30, y: -20 },
      shieldLoad: 100,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 940, y: 180 },
      vel: { x: 60, y: 10 },
      hp: 82,
      shieldLoad: 100,
      shieldMaxLoad: 100,
    });
    const world = createWorld([self, target]);
    const memory = createCombatBotMemory();
    const context = createContext({
      self,
      privateState: createPrivateState(self.id, {
        boostCharges: 1,
      }),
      tick: 120,
      world,
    });

    decideCombatAi(context, memory);

    const plan = buildCombatAiPlan({
      blackboard: memory.blackboard,
      difficulty: context.difficulty,
      intent: {
        kind: "pressure",
        score: 90,
        targetPlanetId: target.id,
        targetPlayerId: target.playerId,
        expiresAtTick: context.tick + 12,
        reason: "pressure lane test",
      },
      privateState: context.privateState,
      self: context.self,
      tick: context.tick,
      world: context.world,
    });

    expect(plan.moveGoal?.usesBoost).toBe(true);
    expect(plan.abilityPolicy.boost).toBe(true);
  });

  it("fires into a clean finish window instead of holding a loaded shot", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: 0, y: 0 },
      shieldLoad: 100,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 300, y: 0 },
      hp: 18,
      shieldActive: false,
      shieldLoad: 0,
      shieldMaxLoad: 0,
      vel: { x: 0, y: 0 },
    });
    const world = createWorld([self, target]);
    const memory = createCombatBotMemory();

    const commands = decideCombatBot(
      createContext({
        self,
        privateState: createPrivateState(self.id),
        tick: 8,
        world,
      }),
      memory,
    );

    expect(memory.blackboard.intent.kind).toBe("finish");
    expect(memory.blackboard.plan?.executionState).toBe("finishWindow");
    expect(commands.some((command) => command.type === "fireRocket")).toBe(
      true,
    );
  });

  it("chooses explore and emits a boost burn when combat pressure is weak", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: -1020, y: -620 },
      vel: { x: -20, y: 30 },
      shieldLoad: 100,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 1220, y: 760 },
      vel: { x: -10, y: 20 },
      shieldActive: true,
      shieldLoad: 100,
      shieldMaxLoad: 100,
      shieldAimDir: { x: -1, y: 0 },
    });
    const world = createWorld([self, target]);
    const memory = createCombatBotMemory();

    const commands = decideCombatBot(
      createContext({
        self,
        privateState: createPrivateState(self.id, {
          boostCharges: 2,
        }),
        tick: 480,
        world,
      }),
      memory,
    );

    expect(memory.blackboard.intent.kind).toBe("explore");
    expect(memory.blackboard.plan?.moveGoal?.label).toMatch(/explore/);
    expect(memory.blackboard.plan?.moveGoal?.usesBoost).toBe(true);
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ability",
          slot: "e",
        }),
      ]),
    );
  });

  it("switches to survive when another planet is on a collision course", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: -220, y: 0 },
      vel: { x: 180, y: 0 },
      shieldLoad: 0,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 220, y: 0 },
      vel: { x: -180, y: 0 },
    });
    const world = createWorld([self, target]);
    const memory = createCombatBotMemory();

    decideCombatAi(
      createContext({
        self,
        privateState: createPrivateState(self.id, {
          boostCharges: 2,
        }),
        tick: 60,
        world,
      }),
      memory,
    );

    expect(memory.blackboard.intent.kind).toBe("survive");
    expect(memory.blackboard.plan?.moveGoal?.kind).toBe("escape");
  });

  it("rejects a cache burn that would drift into the boundary", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: ARENA_RADIUS * 0.82, y: 0 },
      vel: { x: 140, y: 18 },
      shieldLoad: 100,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: -880, y: 360 },
      vel: { x: 20, y: 0 },
    });
    const cacheId = 777;
    const world = createWorld([self, target], {
      caches: [
        {
          id: cacheId,
          kind: "cache",
          contents: { kind: "repair" },
          pos: { x: ARENA_RADIUS * 0.91, y: 24 },
          vel: { x: 0, y: 0 },
          radius: 24,
        },
      ],
    });
    const memory = createCombatBotMemory();
    const context = createContext({
      self,
      privateState: createPrivateState(self.id, {
        boostCharges: 2,
      }),
      tick: 240,
      world,
    });

    decideCombatAi(context, memory);

    const plan = buildCombatAiPlan({
      blackboard: memory.blackboard,
      difficulty: context.difficulty,
      intent: {
        kind: "contestCache",
        score: 100,
        targetCacheId: cacheId,
        expiresAtTick: context.tick + 16,
        reason: "unsafe cache gate test",
      },
      privateState: context.privateState,
      self: context.self,
      tick: context.tick,
      world: context.world,
    });

    expect(plan.moveGoal?.targetCacheId).not.toBe(cacheId);
    expect(plan.moveGoal?.dir.x).toBeLessThan(0);
  });

  it("prefers committed pressure movement over passive orbit holding", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: -760, y: -260 },
      vel: { x: 110, y: 30 },
      shieldLoad: 100,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 620, y: 420 },
      vel: { x: -70, y: 25 },
      hp: 84,
      shieldLoad: 100,
      shieldMaxLoad: 100,
    });
    const world = createWorld([self, target]);
    const memory = createCombatBotMemory();
    const context = createContext({
      self,
      privateState: createPrivateState(self.id, {
        boostCharges: 2,
      }),
      tick: 240,
      world,
    });

    decideCombatAi(context, memory);

    const plan = buildCombatAiPlan({
      blackboard: memory.blackboard,
      difficulty: context.difficulty,
      intent: {
        kind: "pressure",
        score: 92,
        targetPlanetId: target.id,
        targetPlayerId: target.playerId,
        expiresAtTick: context.tick + 12,
        reason: "pressure flow test",
      },
      privateState: context.privateState,
      self: context.self,
      tick: context.tick,
      world: context.world,
    });

    expect(plan.moveGoal?.usesBoost).toBe(true);
    expect(plan.moveGoal?.label).toMatch(/intercept|orbit|arc|flank|sweep/);
  });

  it("refuses outward pressure movement near the outer boundary", () => {
    const self = createPlanet({
      id: 1,
      playerId: "self",
      pos: { x: ARENA_RADIUS * 0.84, y: -120 },
      vel: { x: 120, y: 28 },
      shieldLoad: 100,
      shieldMaxLoad: 100,
    });
    const target = createPlanet({
      id: 2,
      playerId: "enemy",
      pos: { x: 540, y: 420 },
      vel: { x: -30, y: 0 },
      hp: 78,
      shieldLoad: 100,
      shieldMaxLoad: 100,
    });
    const world = createWorld([self, target]);
    const memory = createCombatBotMemory();
    const context = createContext({
      self,
      privateState: createPrivateState(self.id, {
        boostCharges: 2,
      }),
      tick: 240,
      world,
    });

    decideCombatAi(context, memory);

    const plan = buildCombatAiPlan({
      blackboard: memory.blackboard,
      difficulty: context.difficulty,
      intent: {
        kind: "pressure",
        score: 90,
        targetPlanetId: target.id,
        targetPlayerId: target.playerId,
        expiresAtTick: context.tick + 12,
        reason: "boundary pressure test",
      },
      privateState: context.privateState,
      self: context.self,
      tick: context.tick,
      world: context.world,
    });

    expect(plan.moveGoal?.label).not.toBe("burn outward");
    expect(plan.moveGoal?.dir.x).toBeLessThan(0.1);
  });

  it("surfaces focused AI debug items in the local HUD without profiler data", () => {
    let state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      playerBehavior: "bot",
    });
    state = stepSandbox(state, createStepInput(), DISABLED_BLACK_HOLE_SPEC);
    const debug = getSandboxDebugSnapshot(state);
    const hud = buildLocalSandboxHudState({
      activeDrone: null,
      blackHoleRemainingSec: 30,
      blackHoleSettings: BLACK_HOLE_SPEC,
      botsEnabled: true,
      boostMode: "ready",
      boostRecoveryDurationSec: BOOST_SPEC.cooldownSec,
      boostRecoveryRemainingSec: 0,
      boostSettings: BOOST_SPEC,
      cacheBadgeScale: 1,
      colors: {
        boost: "#ff8d4a",
        drone: "#77d6ff",
        droneReturn: "#ffd166",
        foresight: "#7cf2ff",
        shield: "#7ab8ff",
        weapon: {
          heavy: { accent: "#ff7043" },
          light: { accent: "#dff3ff" },
          seeker: { accent: "#f564ff" },
        },
        wildcard: "#f5d76e",
      },
      controlsEnabled: false,
      currentEffectsQuality: "medium",
      currentMaxPixelRatio: 1,
      currentPresetId: DEFAULT_ORBIT_PRESET.id,
      currentSsaaLevel: 1,
      currentState: state,
      debug,
      droneTtlRemainingSec: 0,
      foresightActiveRemainingSec: 0,
      foresightCooldownRemainingSec: 0,
      foresightMode: "ready",
      foresightSettings: FORESIGHT_SPEC,
      fullViewEnabled: false,
      killFeed: [],
      planetAuraGap: 0.3,
      planetAuraScale: 1.8,
      planetBodyScale: 2,
      playerDamageFlash: 0,
      playerHpPulse: 0,
      playerLabel: "Observer",
      profilingEnabled: false,
      profilerSnapshot: null,
      runtimeStats: {
        fps: 60,
        frameTimeMs: 16.7,
      },
      sandboxPaused: false,
      selectedWeapon: state.player.selectedRocketKind,
      shieldLoad: state.player.shieldLoad,
      shieldMaxLoad: state.player.shieldMaxLoad,
      shieldMode: "ready",
      shieldSettings: SHIELD_SPEC,
    });

    expect(debug.aiFocused).not.toBeNull();
    expect(hud.debugItems.some((item) => item.label === "AI Intent")).toBe(
      true,
    );
  });
});
