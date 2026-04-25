import type { PlanetPrivateState, PlanetPublic } from "@3body/shared";
import { ROCKET_SPECS, SIM_HZ } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  canDispatchAuthoritativeRocketFire,
  getAuthoritativeAbilitySlots,
  getAuthoritativeRocketReloadTicks,
  resolveAuthoritativeCombatControlStep,
  smoothAuthoritativeCameraAxis,
} from "./authoritativeViewportBehavior";

describe("authoritativeViewportBehavior", () => {
  const inputSendIntervalMs = 1000 / SIM_HZ;

  const createPlanet = (
    overrides: Partial<PlanetPublic> = {},
  ): PlanetPublic => ({
    archetype: "terra",
    debuffs: {},
    hp: 100,
    id: 1,
    kind: "planet",
    playerId: "player-1",
    pos: { x: 0, y: 0 },
    radius: 24,
    shieldActive: false,
    shieldAimDir: { x: 1, y: 0 },
    shieldLoad: 3,
    shieldMaxLoad: 3,
    vel: { x: 0, y: 0 },
    ...overrides,
  });
  const createSelf = (
    overrides: Partial<PlanetPrivateState> = {},
  ): PlanetPrivateState => ({
    ammo: {
      heavy: 1,
      light: 1,
      seeker: 1,
    },
    boostCharges: 1,
    cooldowns: {
      heavyReloadUntilTick: 0,
      lightReloadUntilTick: 0,
      seekerReloadUntilTick: 0,
    },
    gravityPulseHeld: false,
    nextShieldExt: false,
    planetId: 1,
    ...overrides,
  });

  it("keeps held boost active on every sampled frame", () => {
    const pendingAbilityRequests = {
      boost: true,
      gravityPulse: false,
      shield: false,
    };

    const firstFrameSlots = getAuthoritativeAbilitySlots(
      pendingAbilityRequests,
    );
    const secondFrameSlots = getAuthoritativeAbilitySlots(
      pendingAbilityRequests,
    );

    expect(firstFrameSlots).toBe(secondFrameSlots);
    expect(secondFrameSlots).toEqual(["w"]);
  });

  it("preserves shield, boost, then gravity pulse ordering", () => {
    expect(
      getAuthoritativeAbilitySlots({
        boost: true,
        gravityPulse: true,
        shield: true,
      }),
    ).toEqual(["q", "w", "g"]);
  });

  it("smooths camera motion toward the target instead of snapping", () => {
    const nextCenter = smoothAuthoritativeCameraAxis({
      currentValue: 0,
      followLerp: 6.1,
      frameDeltaSec: 1 / 60,
      targetValue: 240,
    });

    expect(nextCenter).toBeGreaterThan(0);
    expect(nextCenter).toBeLessThan(240);
  });

  it("leaves the camera in place when no frame time has elapsed", () => {
    expect(
      smoothAuthoritativeCameraAxis({
        currentValue: 48,
        followLerp: 6.1,
        frameDeltaSec: 0,
        targetValue: 240,
      }),
    ).toBe(48);
  });

  it("resolves combat input with seeker lock, fire target, and queued abilities", () => {
    const playerPlanet = createPlanet();
    const targetPlanet = createPlanet({
      id: 2,
      playerId: "player-2",
      pos: { x: 96, y: 0 },
      radius: 20,
    });

    const resolution = resolveAuthoritativeCombatControlStep({
      connectionState: "connected",
      inputSendIntervalMs,
      inputState: {
        aimWorld: { x: 96, y: 0 },
        selectedRocketKind: "seeker",
      },
      lastBoostHeldSent: false,
      lastInputSentAtMs: 0,
      lastShieldAimSentAtMs: 0,
      nowSec: ROCKET_SPECS.seeker.lockSec + 0.2,
      pendingAbilityRequests: {
        boost: true,
        gravityPulse: true,
        shield: false,
      },
      phase: "combat",
      planets: [playerPlanet, targetPlanet],
      playerId: playerPlanet.playerId,
      playerPlanet,
      previousSeekerLockStartedAtSec: 0,
      previousSeekerLockTargetId: targetPlanet.id,
      self: {
        ammo: {
          heavy: 1,
          light: 1,
          seeker: 1,
        },
        boostCharges: 1,
        cooldowns: {
          heavyReloadUntilTick: 0,
          lightReloadUntilTick: 0,
          seekerReloadUntilTick: 0,
        },
        gravityPulseHeld: false,
        nextShieldExt: false,
        planetId: playerPlanet.id,
      },
      shieldAimSendIntervalMs: inputSendIntervalMs,
      timeMs: inputSendIntervalMs + 1,
    });

    expect(resolution.dispatchEnabled).toBe(true);
    expect(resolution.aimDir).toEqual({ x: 1, y: 0 });
    expect(resolution.seekerLock.seekerLockTarget).toBe(targetPlanet);
    expect(resolution.seekerLock.progress).toBe(1);
    expect(resolution.fireTargetId).toBe(targetPlanet.id);
    expect(resolution.sendInput).toBe(true);
    expect(resolution.sendShieldAim).toBe(false);
    expect(resolution.boostHeld).toBe(true);
    expect(resolution.queuedAbilitySlots).toEqual(["g"]);
  });

  it("switches to shield aim throttling when the shield is active", () => {
    const playerPlanet = createPlanet({
      shieldActive: true,
      shieldLoad: 2,
    });

    const resolution = resolveAuthoritativeCombatControlStep({
      connectionState: "connected",
      inputSendIntervalMs,
      inputState: {
        aimWorld: { x: 30, y: 40 },
        selectedRocketKind: "light",
      },
      lastBoostHeldSent: false,
      lastInputSentAtMs: 0,
      lastShieldAimSentAtMs: 0,
      nowSec: 1,
      pendingAbilityRequests: {
        boost: false,
        gravityPulse: false,
        shield: false,
      },
      phase: "combat",
      planets: [playerPlanet],
      playerId: playerPlanet.playerId,
      playerPlanet,
      previousSeekerLockStartedAtSec: null,
      previousSeekerLockTargetId: null,
      self: {
        ammo: {
          heavy: 1,
          light: 1,
          seeker: 1,
        },
        boostCharges: 0,
        cooldowns: {
          heavyReloadUntilTick: 0,
          lightReloadUntilTick: 0,
          seekerReloadUntilTick: 0,
        },
        gravityPulseHeld: false,
        nextShieldExt: false,
        planetId: playerPlanet.id,
      },
      shieldAimSendIntervalMs: inputSendIntervalMs,
      timeMs: inputSendIntervalMs + 1,
    });

    expect(resolution.shieldActive).toBe(true);
    expect(resolution.sendInput).toBe(false);
    expect(resolution.sendShieldAim).toBe(true);
  });

  it("still sends held boost changes while the shield is active", () => {
    const playerPlanet = createPlanet({
      shieldActive: true,
      shieldLoad: 2,
    });

    const resolution = resolveAuthoritativeCombatControlStep({
      connectionState: "connected",
      inputSendIntervalMs,
      inputState: {
        aimWorld: { x: 30, y: 40 },
        selectedRocketKind: "light",
      },
      lastBoostHeldSent: false,
      lastInputSentAtMs: 0,
      lastShieldAimSentAtMs: 0,
      nowSec: 1,
      pendingAbilityRequests: {
        boost: true,
        gravityPulse: false,
        shield: false,
      },
      phase: "combat",
      planets: [playerPlanet],
      playerId: playerPlanet.playerId,
      playerPlanet,
      previousSeekerLockStartedAtSec: null,
      previousSeekerLockTargetId: null,
      self: createSelf(),
      shieldAimSendIntervalMs: inputSendIntervalMs,
      timeMs: 1,
    });

    expect(resolution.shieldActive).toBe(true);
    expect(resolution.boostHeld).toBe(true);
    expect(resolution.sendInput).toBe(true);
  });

  it("keeps boost held at empty meter so the server waits for release before recharge", () => {
    const playerPlanet = createPlanet();

    const resolution = resolveAuthoritativeCombatControlStep({
      connectionState: "connected",
      inputSendIntervalMs,
      inputState: {
        aimWorld: { x: 30, y: 0 },
        selectedRocketKind: "light",
      },
      lastBoostHeldSent: false,
      lastInputSentAtMs: 1000,
      lastShieldAimSentAtMs: 0,
      nowSec: 1,
      pendingAbilityRequests: {
        boost: true,
        gravityPulse: false,
        shield: false,
      },
      phase: "combat",
      planets: [playerPlanet],
      playerId: playerPlanet.playerId,
      playerPlanet,
      previousSeekerLockStartedAtSec: null,
      previousSeekerLockTargetId: null,
      self: createSelf({
        boostCharges: 0,
      }),
      shieldAimSendIntervalMs: inputSendIntervalMs,
      timeMs: 1000,
    });

    expect(resolution.boostAvailable).toBe(false);
    expect(resolution.boostHeld).toBe(true);
    expect(resolution.sendInput).toBe(true);
    expect(resolution.queuedAbilitySlots).toEqual([]);
  });

  it("sends input immediately when held boost is released", () => {
    const playerPlanet = createPlanet();

    const resolution = resolveAuthoritativeCombatControlStep({
      connectionState: "connected",
      inputSendIntervalMs,
      inputState: {
        aimWorld: { x: 30, y: 0 },
        selectedRocketKind: "light",
      },
      lastBoostHeldSent: true,
      lastInputSentAtMs: 1000,
      lastShieldAimSentAtMs: 0,
      nowSec: 1,
      pendingAbilityRequests: {
        boost: false,
        gravityPulse: false,
        shield: false,
      },
      phase: "combat",
      planets: [playerPlanet],
      playerId: playerPlanet.playerId,
      playerPlanet,
      previousSeekerLockStartedAtSec: null,
      previousSeekerLockTargetId: null,
      self: createSelf(),
      shieldAimSendIntervalMs: inputSendIntervalMs,
      timeMs: 1000,
    });

    expect(resolution.boostHeld).toBe(false);
    expect(resolution.sendInput).toBe(true);
  });

  it("disables authoritative dispatch when self state is unavailable", () => {
    const playerPlanet = createPlanet();

    const resolution = resolveAuthoritativeCombatControlStep({
      connectionState: "connected",
      inputSendIntervalMs,
      inputState: {
        aimWorld: { x: 10, y: 0 },
        selectedRocketKind: "light",
      },
      lastBoostHeldSent: false,
      lastInputSentAtMs: 0,
      lastShieldAimSentAtMs: 0,
      nowSec: 1,
      pendingAbilityRequests: {
        boost: true,
        gravityPulse: true,
        shield: true,
      },
      phase: "combat",
      planets: [playerPlanet],
      playerId: playerPlanet.playerId,
      playerPlanet,
      previousSeekerLockStartedAtSec: null,
      previousSeekerLockTargetId: null,
      self: null,
      shieldAimSendIntervalMs: inputSendIntervalMs,
      timeMs: inputSendIntervalMs + 1,
    });

    expect(resolution.dispatchEnabled).toBe(false);
    expect(resolution.aimDir).toBeNull();
    expect(resolution.fireTargetId).toBeUndefined();
    expect(resolution.queuedAbilitySlots).toEqual([]);
    expect(resolution.sendInput).toBe(false);
    expect(resolution.sendShieldAim).toBe(false);
  });

  it("allows authoritative fire only when ammo, cooldown, and shield state permit it", () => {
    const playerPlanet = createPlanet();
    const self = createSelf();

    expect(
      canDispatchAuthoritativeRocketFire({
        actionTick: 24,
        lastFireSentAtTick: Number.NEGATIVE_INFINITY,
        playerPlanet,
        rocketKind: "light",
        self,
      }),
    ).toBe(true);
    expect(
      canDispatchAuthoritativeRocketFire({
        actionTick: 24,
        lastFireSentAtTick: Number.NEGATIVE_INFINITY,
        playerPlanet,
        rocketKind: "heavy",
        self: createSelf({
          ammo: {
            ...self.ammo,
            heavy: 0,
          },
        }),
      }),
    ).toBe(false);
    expect(
      canDispatchAuthoritativeRocketFire({
        actionTick: 24,
        lastFireSentAtTick: Number.NEGATIVE_INFINITY,
        playerPlanet,
        rocketKind: "light",
        self: createSelf({
          cooldowns: {
            ...self.cooldowns,
            lightReloadUntilTick: 30,
          },
        }),
      }),
    ).toBe(false);
    expect(
      canDispatchAuthoritativeRocketFire({
        actionTick: 24,
        lastFireSentAtTick: Number.NEGATIVE_INFINITY,
        playerPlanet: createPlanet({
          shieldActive: true,
          shieldLoad: 1,
        }),
        rocketKind: "light",
        self,
      }),
    ).toBe(false);
  });

  it("suppresses repeated local fire feedback until the sent shot reload window has elapsed", () => {
    const playerPlanet = createPlanet();
    const reloadTicks = getAuthoritativeRocketReloadTicks(
      "light",
      playerPlanet.archetype,
    );

    expect(
      canDispatchAuthoritativeRocketFire({
        actionTick: 100 + reloadTicks - 1,
        lastFireSentAtTick: 100,
        playerPlanet,
        rocketKind: "light",
        self: createSelf(),
      }),
    ).toBe(false);
    expect(
      canDispatchAuthoritativeRocketFire({
        actionTick: 100 + reloadTicks,
        lastFireSentAtTick: 100,
        playerPlanet,
        rocketKind: "light",
        self: createSelf(),
      }),
    ).toBe(true);
  });
});
