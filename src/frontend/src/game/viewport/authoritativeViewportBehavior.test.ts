import type { PlanetPublic } from "@3body/shared";
import { ROCKET_SPECS } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  getAuthoritativeAbilitySlots,
  resolveAuthoritativeCombatControlStep,
  smoothAuthoritativeCameraAxis,
} from "./authoritativeViewportBehavior";

describe("authoritativeViewportBehavior", () => {
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
      inputSendIntervalMs: 1000 / 30,
      inputState: {
        aimWorld: { x: 96, y: 0 },
        selectedRocketKind: "seeker",
      },
      lastBoostAbilitySentAtSec: Number.NEGATIVE_INFINITY,
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
      shieldAimSendIntervalMs: 1000 / 30,
      timeMs: 1000 / 30 + 1,
    });

    expect(resolution.dispatchEnabled).toBe(true);
    expect(resolution.aimDir).toEqual({ x: 1, y: 0 });
    expect(resolution.seekerLock.seekerLockTarget).toBe(targetPlanet);
    expect(resolution.seekerLock.progress).toBe(1);
    expect(resolution.fireTargetId).toBe(targetPlanet.id);
    expect(resolution.sendInput).toBe(true);
    expect(resolution.sendShieldAim).toBe(false);
    expect(resolution.queuedAbilitySlots).toEqual(["w", "g"]);
  });

  it("switches to shield aim throttling when the shield is active", () => {
    const playerPlanet = createPlanet({
      shieldActive: true,
      shieldLoad: 2,
    });

    const resolution = resolveAuthoritativeCombatControlStep({
      connectionState: "connected",
      inputSendIntervalMs: 1000 / 30,
      inputState: {
        aimWorld: { x: 30, y: 40 },
        selectedRocketKind: "light",
      },
      lastBoostAbilitySentAtSec: Number.NEGATIVE_INFINITY,
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
      shieldAimSendIntervalMs: 1000 / 30,
      timeMs: 1000 / 30 + 1,
    });

    expect(resolution.shieldActive).toBe(true);
    expect(resolution.sendInput).toBe(false);
    expect(resolution.sendShieldAim).toBe(true);
  });

  it("disables authoritative dispatch when self state is unavailable", () => {
    const playerPlanet = createPlanet();

    const resolution = resolveAuthoritativeCombatControlStep({
      connectionState: "connected",
      inputSendIntervalMs: 1000 / 30,
      inputState: {
        aimWorld: { x: 10, y: 0 },
        selectedRocketKind: "light",
      },
      lastBoostAbilitySentAtSec: Number.NEGATIVE_INFINITY,
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
      shieldAimSendIntervalMs: 1000 / 30,
      timeMs: 1000 / 30 + 1,
    });

    expect(resolution.dispatchEnabled).toBe(false);
    expect(resolution.aimDir).toBeNull();
    expect(resolution.fireTargetId).toBeUndefined();
    expect(resolution.queuedAbilitySlots).toEqual([]);
    expect(resolution.sendInput).toBe(false);
    expect(resolution.sendShieldAim).toBe(false);
  });
});
