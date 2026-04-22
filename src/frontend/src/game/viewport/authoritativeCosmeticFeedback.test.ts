import type {
  BlackHole,
  PlanetPublic,
  Rocket,
  RocketKind,
  World,
} from "@3body/shared";
import { GRAVITY_PULSE_SPEC, ROCKET_SPECS, SNAPSHOT_HZ } from "@3body/shared";
import { describe, expect, it } from "vitest";
import type {
  AuthoritativeMatchRuntimeState,
  AuthoritativeSnapshot,
} from "../authoritativeMatchRuntime";
import {
  type AuthoritativeImpactBurstState,
  decayAuthoritativeFeedbackLevels,
  queueAuthoritativeImmediateAbilityFeedback,
  queueAuthoritativeImmediateFireFeedback,
  syncAuthoritativeLaunchBurstFeedback,
  syncAuthoritativeRecentEventFeedback,
} from "./authoritativeCosmeticFeedback";
import type { SharedCombatBoostBurstState } from "./sharedCombatBoostVisuals";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";

const buildPlanet = (overrides: Partial<PlanetPublic> = {}): PlanetPublic => ({
  archetype: "terra",
  debuffs: {},
  hp: 100,
  id: 1,
  kind: "planet",
  playerId: "enemy",
  pos: { x: 0, y: 0 },
  radius: 20,
  shieldActive: false,
  shieldAimDir: { x: 1, y: 0 },
  shieldLoad: 0,
  shieldMaxLoad: 10,
  vel: { x: 0, y: 0 },
  ...overrides,
});

const buildRocket = (overrides: Partial<Rocket> = {}): Rocket => ({
  id: 4,
  kind: "rocket",
  ownerId: "enemy",
  pos: { x: 140, y: 0 },
  radius: ROCKET_SPECS.light.radius,
  rocketKind: "light",
  ttlUntilTick: 20,
  vel: { x: 300, y: 0 },
  ...overrides,
});

const buildBlackHole = (overrides: Partial<BlackHole> = {}): BlackHole => ({
  id: 30,
  kind: "blackHole",
  killRadius: 120,
  mass: 10_000,
  pos: { x: 180, y: -40 },
  radius: 90,
  vel: { x: 0, y: 0 },
  ...overrides,
});

const buildWorld = (overrides: Partial<World> = {}): World => ({
  arenaRadius: 2_000,
  blackHole: undefined,
  caches: [],
  debris: [],
  neutronStars: [],
  planets: [buildPlanet()],
  rockets: [],
  suns: [],
  ...overrides,
});

const buildSnapshot = (
  world: World,
  overrides: Partial<AuthoritativeSnapshot> = {},
): AuthoritativeSnapshot => ({
  receivedAtMs: 10_000,
  self: null,
  tick: 120,
  world,
  ...overrides,
});

const buildRuntime = ({
  playerId = "self",
  previousSnapshot = null,
  recentEvents = [],
  snapshot = null,
}: Partial<
  Pick<
    AuthoritativeMatchRuntimeState,
    "playerId" | "previousSnapshot" | "recentEvents" | "snapshot"
  >
> = {}): Pick<
  AuthoritativeMatchRuntimeState,
  "playerId" | "previousSnapshot" | "recentEvents" | "snapshot"
> => ({
  playerId,
  previousSnapshot,
  recentEvents,
  snapshot,
});

describe("authoritativeCosmeticFeedback", () => {
  it("decays and clamps screen feedback levels", () => {
    expect(
      decayAuthoritativeFeedbackLevels({
        cameraShake: 0.2,
        damageFlash: 0.1,
        frameDeltaSec: 1,
        hudFlicker: 0.15,
      }),
    ).toEqual({
      cameraShake: 0,
      damageFlash: 0,
      hudFlicker: 0,
    });
  });

  it("derives remote launch bursts once per newer snapshot tick", () => {
    const activeLaunchBurstsByKind: Record<
      RocketKind,
      SharedCombatLaunchBurstState[]
    > = {
      heavy: [],
      light: [],
      seeker: [],
    };
    const currentSnapshot = buildSnapshot(
      buildWorld({
        rockets: [buildRocket()],
      }),
      { tick: 140 },
    );

    const nextProcessedTick = syncAuthoritativeLaunchBurstFeedback({
      activeLaunchBurstsByKind,
      currentPlayerId: "self",
      currentSnapshot,
      lastProcessedSnapshotTick: 139,
      previousSnapshotWorld: buildWorld(),
      rocketKinds: ["heavy", "light", "seeker"],
    });

    expect(nextProcessedTick).toBe(140);
    expect(activeLaunchBurstsByKind.light).toHaveLength(1);

    const repeatedTick = syncAuthoritativeLaunchBurstFeedback({
      activeLaunchBurstsByKind,
      currentPlayerId: "self",
      currentSnapshot,
      lastProcessedSnapshotTick: nextProcessedTick,
      previousSnapshotWorld: buildWorld(),
      rocketKinds: ["heavy", "light", "seeker"],
    });

    expect(repeatedTick).toBe(140);
    expect(activeLaunchBurstsByKind.light).toHaveLength(1);
  });

  it("queues immediate local fire feedback without changing damage flash", () => {
    const playerPlanet = buildPlanet({
      pos: { x: 20, y: -10 },
      radius: 18,
    });
    const burstStates = new Map();
    const ghostStates = new Map();

    const result = queueAuthoritativeImmediateFireFeedback({
      aimDir: { x: 0, y: 1 },
      immediateFireBurstState: burstStates,
      immediateGhostRocketState: ghostStates,
      nowSec: 12,
      playerPlanet,
      rocketKind: "seeker",
      screenEffects: {
        cameraShake: 0.02,
        damageFlash: 0.4,
        hudFlicker: 0,
      },
    });

    expect(result.immediateCannonFlashState).toEqual({
      rocketKind: "seeker",
      startedAtSec: 12,
    });
    expect(result.screenEffects).toEqual({
      cameraShake: 0.12,
      damageFlash: 0.4,
      hudFlicker: 0.05,
    });
    expect(burstStates.get("seeker")).toMatchObject({
      direction: { x: 0, y: 1 },
      origin: {
        x: 20,
        y: 8 + ROCKET_SPECS.seeker.radius * 1.4,
      },
      radius: 18,
      startedAtSec: 12,
    });
    expect(ghostStates.get("seeker")).toMatchObject({
      direction: { x: 0, y: 1 },
      origin: {
        x: 20,
        y: 8 + ROCKET_SPECS.seeker.radius * 1.4,
      },
      startedAtSec: 12,
      velocity: { x: 0, y: ROCKET_SPECS.seeker.speed },
    });
  });

  it("queues immediate shield feedback when the authoritative adapter dispatches q", () => {
    const result = queueAuthoritativeImmediateAbilityFeedback({
      abilitySlot: "q",
      activeBoostBursts: [],
      aimDir: { x: 0, y: -1 },
      gravityPulseFeedbackState: null,
      immediateShieldFeedbackState: null,
      maxActiveBoostBursts: 4,
      nowSec: 9,
      playerPlanet: buildPlanet(),
      screenEffects: {
        cameraShake: 0.03,
        damageFlash: 0.2,
        hudFlicker: 0.01,
      },
      snapshotTick: 100,
    });

    expect(result.immediateShieldFeedbackState).toEqual({
      aimDir: { x: 0, y: -1 },
      startedAtSec: 9,
    });
    expect(result.gravityPulseFeedbackState).toBeNull();
    expect(result.screenEffects).toEqual({
      cameraShake: 0.03,
      damageFlash: 0.2,
      hudFlicker: 0.06,
    });
  });

  it("queues immediate boost feedback when the authoritative adapter dispatches w", () => {
    const playerPlanet = buildPlanet({
      id: 14,
      pos: { x: -6, y: 12 },
      radius: 24,
    });
    const activeBoostBursts: SharedCombatBoostBurstState[] = [];

    const result = queueAuthoritativeImmediateAbilityFeedback({
      abilitySlot: "w",
      activeBoostBursts,
      aimDir: { x: 1, y: 0 },
      gravityPulseFeedbackState: null,
      immediateShieldFeedbackState: null,
      maxActiveBoostBursts: 4,
      nowSec: 7.25,
      playerPlanet,
      screenEffects: {
        cameraShake: 0.02,
        damageFlash: 0.1,
        hudFlicker: 0.04,
      },
      snapshotTick: null,
    });

    expect(activeBoostBursts).toHaveLength(1);
    expect(activeBoostBursts[0]).toMatchObject({
      direction: { x: 1, y: 0 },
      origin: playerPlanet.pos,
      planetId: playerPlanet.id,
      radius: playerPlanet.radius,
      startedAtSec: 7.25,
      tick: Math.round(7.25 * SNAPSHOT_HZ),
    });
    expect(result.immediateShieldFeedbackState).toBeNull();
    expect(result.gravityPulseFeedbackState).toBeNull();
    expect(result.screenEffects).toEqual({
      cameraShake: 0.1,
      damageFlash: 0.1,
      hudFlicker: 0.04,
    });
  });

  it("queues immediate gravity-pulse feedback when the authoritative adapter dispatches g", () => {
    const playerPlanet = buildPlanet({
      pos: { x: 30, y: -14 },
      radius: 16,
    });

    const result = queueAuthoritativeImmediateAbilityFeedback({
      abilitySlot: "g",
      activeBoostBursts: [],
      aimDir: { x: 1, y: 0 },
      gravityPulseFeedbackState: null,
      immediateShieldFeedbackState: null,
      maxActiveBoostBursts: 4,
      nowSec: 3,
      playerPlanet,
      screenEffects: {
        cameraShake: 0.08,
        damageFlash: 0.3,
        hudFlicker: 0.02,
      },
      snapshotTick: 44,
    });

    expect(result.gravityPulseFeedbackState).toEqual({
      effectRadius: GRAVITY_PULSE_SPEC.radius,
      origin: playerPlanet.pos,
      planetRadius: playerPlanet.radius,
      startedAtSec: 3,
    });
    expect(result.immediateShieldFeedbackState).toBeNull();
    expect(result.screenEffects).toEqual({
      cameraShake: 0.18,
      damageFlash: 0.3,
      hudFlicker: 0.1,
    });
  });

  it("turns new hit events into impact bursts and player screen feedback", () => {
    const playerPlanet = buildPlanet({
      id: 7,
      playerId: "self",
    });
    const snapshot = buildSnapshot(
      buildWorld({
        planets: [playerPlanet],
      }),
    );
    const activeImpactBursts: AuthoritativeImpactBurstState[] = [];

    const result = syncAuthoritativeRecentEventFeedback({
      activeBoostBursts: [],
      activeImpactBursts,
      blackHoleSource: null,
      lastProcessedEventId: 0,
      localAimWorld: { x: 80, y: 20 },
      localPlayerPlanet: playerPlanet,
      maxActiveBoostBursts: 4,
      maxActiveImpactBursts: 16,
      nowSec: 12,
      queueBlackHoleSwallowEffect: () => {},
      runtime: buildRuntime({
        playerId: "self",
        previousSnapshot: snapshot,
        recentEvents: [
          {
            event: {
              absorbedByShield: false,
              attackerPlayerId: "enemy",
              damage: 35,
              hpAfter: 65,
              kind: "hit",
              rocketId: 99,
              rocketKind: "heavy",
              tick: 120,
              victimPlanetId: playerPlanet.id,
            },
            id: 7,
            receivedAtMs: 10_000,
          },
        ],
        snapshot,
      }),
      screenEffects: {
        cameraShake: 0,
        damageFlash: 0,
        hudFlicker: 0,
      },
    });

    expect(result.lastProcessedEventId).toBe(7);
    expect(result.cameraShake).toBeGreaterThan(0);
    expect(result.damageFlash).toBeGreaterThan(0);
    expect(result.hudFlicker).toBeGreaterThan(0);
    expect(activeImpactBursts).toHaveLength(1);
    expect(activeImpactBursts[0]).toMatchObject({
      absorbedByShield: false,
      planetId: playerPlanet.id,
      radius: playerPlanet.radius,
      targetPos: playerPlanet.pos,
    });
  });

  it("uses local aim as boost direction when the authoritative snapshot has no velocity delta", () => {
    const playerPlanet = buildPlanet({
      id: 11,
      playerId: "self",
      pos: { x: 4, y: -6 },
    });
    const snapshot = buildSnapshot(
      buildWorld({
        planets: [playerPlanet],
      }),
      { tick: 121 },
    );
    const activeBoostBursts: SharedCombatBoostBurstState[] = [];

    syncAuthoritativeRecentEventFeedback({
      activeBoostBursts,
      activeImpactBursts: [],
      blackHoleSource: null,
      lastProcessedEventId: 0,
      localAimWorld: { x: 4, y: 40 },
      localPlayerPlanet: playerPlanet,
      maxActiveBoostBursts: 4,
      maxActiveImpactBursts: 16,
      nowSec: 12,
      queueBlackHoleSwallowEffect: () => {},
      runtime: buildRuntime({
        playerId: "self",
        previousSnapshot: snapshot,
        recentEvents: [
          {
            event: {
              kind: "boost",
              planetId: playerPlanet.id,
              playerId: "self",
              tick: 121,
            },
            id: 5,
            receivedAtMs: 10_000,
          },
        ],
        snapshot,
      }),
      screenEffects: {
        cameraShake: 0,
        damageFlash: 0,
        hudFlicker: 0,
      },
    });

    expect(activeBoostBursts).toHaveLength(1);
    expect(activeBoostBursts[0]?.direction.x).toBeCloseTo(0);
    expect(activeBoostBursts[0]?.direction.y).toBeCloseTo(1);
  });

  it("queues a black-hole swallow effect when a planet kill event arrives", () => {
    const swallowedPlanet = buildPlanet({
      archetype: "volans",
      id: 22,
      pos: { x: -30, y: 70 },
      radius: 26,
    });
    const previousSnapshot = buildSnapshot(
      buildWorld({
        planets: [swallowedPlanet],
      }),
      { tick: 180 },
    );
    const blackHoleSource = buildBlackHole({
      pos: { x: 240, y: -100 },
    });
    const queuedEffects: Array<{
      color: string;
      radius: number;
      startPos: { x: number; y: number };
      targetPos: { x: number; y: number };
    }> = [];

    syncAuthoritativeRecentEventFeedback({
      activeBoostBursts: [],
      activeImpactBursts: [],
      blackHoleSource,
      lastProcessedEventId: 0,
      localAimWorld: { x: 0, y: 0 },
      localPlayerPlanet: null,
      maxActiveBoostBursts: 4,
      maxActiveImpactBursts: 16,
      nowSec: 18,
      queueBlackHoleSwallowEffect: (effect) => {
        queuedEffects.push(effect);
      },
      runtime: buildRuntime({
        playerId: "self",
        previousSnapshot,
        recentEvents: [
          {
            event: {
              cause: "blackHole",
              kind: "kill",
              killerPlayerId: undefined,
              tick: 181,
              victimPlanetId: swallowedPlanet.id,
              victimPlayerId: swallowedPlanet.playerId,
            },
            id: 9,
            receivedAtMs: 18_000,
          },
        ],
        snapshot: buildSnapshot(
          buildWorld({
            blackHole: blackHoleSource,
            planets: [],
          }),
          { tick: 181 },
        ),
      }),
      screenEffects: {
        cameraShake: 0,
        damageFlash: 0,
        hudFlicker: 0,
      },
    });

    expect(queuedEffects).toHaveLength(1);
    expect(queuedEffects[0]).toMatchObject({
      radius: swallowedPlanet.radius,
      startPos: swallowedPlanet.pos,
      targetPos: blackHoleSource.pos,
    });
    expect(queuedEffects[0]?.color).toEqual(expect.any(String));
  });
});
