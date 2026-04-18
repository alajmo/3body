import type {
  Drone,
  PlanetPrivateState,
  PlanetPublic,
  World,
} from "@3body/shared";
import {
  FIXED_STEP_SEC,
  FORESIGHT_SPEC,
  getShieldLoadCapacity,
} from "@3body/shared";
import { describe, expect, it } from "vitest";
import { buildAuthoritativeHudState } from "./authoritativeHud";
import { createInitialHudState } from "../viewportHud";

const createWorld = (): World =>
  ({
    arenaRadius: 2500,
    blackHole: undefined,
    caches: [
      {
        id: 4,
        kind: "cache",
        contents: { kind: "repair" },
        pos: { x: -480, y: 220 },
        radius: 36,
        vel: { x: 0, y: 0 },
      },
    ],
    debris: [],
    drones: [
      {
        id: 3,
        kind: "drone",
        ownerId: "pilot-1",
        pos: { x: 360, y: -120 },
        radius: 24,
        ttlUntilTick: 24,
        vel: { x: 0, y: 0 },
      },
    ],
    planets: [
      {
        id: 1,
        kind: "planet",
        playerId: "pilot-1",
        archetype: "terra",
        debuffs: {},
        hideTrailUntilTick: 0,
        hp: 87,
        pilotingDroneId: undefined,
        pos: { x: 220, y: 140 },
        radius: 68,
        shieldActive: false,
        shieldAimDir: { x: 1, y: 0 },
        shieldLoad: 100,
        shieldMaxLoad: 100,
        vel: { x: 300, y: 300 },
      },
      {
        id: 2,
        kind: "planet",
        playerId: "pilot-2",
        archetype: "ignis",
        debuffs: {},
        hideTrailUntilTick: 0,
        hp: 92,
        pilotingDroneId: undefined,
        pos: { x: -180, y: -260 },
        radius: 72,
        shieldActive: false,
        shieldAimDir: { x: 1, y: 0 },
        shieldLoad: 100,
        shieldMaxLoad: 100,
        vel: { x: -120, y: 80 },
      },
    ],
    rockets: [
      {
        id: 5,
        kind: "rocket",
        ownerId: "pilot-2",
        pos: { x: 520, y: 80 },
        radius: 12,
        rocketKind: "light",
        ttlUntilTick: 30,
        vel: { x: 420, y: 30 },
      },
    ],
    suns: [
      {
        id: 6,
        kind: "sun",
        mass: 400_000,
        pos: { x: 0, y: 0 },
        radius: 180,
        vel: { x: 0, y: 0 },
      },
    ],
  }) satisfies World;

const createSelf = (): PlanetPrivateState =>
  ({
    planetId: 1,
    ammo: {
      heavy: 2,
      light: 4,
      seeker: 1,
    },
    boostCharges: 1,
    cooldowns: {
      droneCooldownUntilTick: 0,
      foresightActiveUntilTick: 0,
      foresightCooldownUntilTick: 0,
      foresightDurationTicks: 0,
      heavyReloadUntilTick: 0,
      lightReloadUntilTick: 0,
      nextBoostChargeAtTick: undefined,
      seekerReloadUntilTick: 0,
    },
    gravityPulseHeld: false,
    cloakHeld: false,
    nextShieldExt: false,
    nextForesightExt: false,
  }) satisfies PlanetPrivateState;

const createPlayerPlanet = (): PlanetPublic =>
  ({
    debuffs: {},
    hideTrailUntilTick: 0,
    hp: 87,
    id: 1,
    kind: "planet",
    pilotingDroneId: undefined,
    pos: {
      x: 220,
      y: 140,
    },
    radius: 68,
    archetype: "terra",
    playerId: "pilot-1",
    shieldActive: false,
    shieldAimDir: { x: 1, y: 0 },
    shieldLoad: 100,
    shieldMaxLoad: 100,
    vel: {
      x: 300,
      y: 300,
    },
  }) satisfies PlanetPublic;

const createActiveDrone = (): Drone =>
  ({
    id: 3,
    kind: "drone",
    ownerId: "pilot-1",
    pos: { x: 360, y: -120 },
    radius: 24,
    ttlUntilTick: 24,
    vel: { x: 0, y: 0 },
  }) satisfies Drone;

describe("buildAuthoritativeHudState", () => {
  it("surfaces profiler debug items for the authoritative viewport", () => {
    const hud = buildAuthoritativeHudState({
      activeDrone: createActiveDrone(),
      connection: {
        extrapolating: true,
        fps: 58,
        frameTimeMs: 16.4,
        label: "room-1 · combat",
        rttMs: 24,
        state: "connected",
      },
      controlsEnabled: true,
      currentEffectsQuality: "high",
      currentMaxPixelRatio: 1.5,
      currentTick: 120,
      eventLog: [],
      extrapolating: true,
      playerId: "pilot-1",
      playerPlanet: createPlayerPlanet(),
      profilerSnapshot: {
        frameCpu: { averageMs: 5.5, latestMs: 5.8, maxMs: 8.3 },
        frames: 12,
        interpolation: { averageMs: 0.7, latestMs: 0.8, maxMs: 1.1 },
        renderCpu: { averageMs: 2.6, latestMs: 2.7, maxMs: 3.9 },
        sampledDurationSec: 0.2,
        simulation: { averageMs: 0, latestMs: 0, maxMs: 0 },
        steps: { average: 0, latest: 0, max: 0 },
        submit: { averageMs: 1.1, latestMs: 1.2, maxMs: 1.7 },
      },
      profilingEnabled: true,
      recentEventsNowMs: 1_000,
      rosterNameByPlayerId: new Map([
        ["pilot-1", "Pilot One"],
        ["pilot-2", "Pilot Two"],
      ]),
      runtimeStats: {
        fps: 58,
        frameTimeMs: 16.4,
      },
      selectedWeapon: "light",
      self: createSelf(),
      world: createWorld(),
    });

    expect(hud.profilingEnabled).toBe(true);
    expect(hud.debugItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Frame CPU" }),
        expect.objectContaining({
          label: "Quality",
          value: "PR 1.5 · FX high",
        }),
        expect.objectContaining({
          label: "Entities",
          value: "P 2 · R 1 · D 1 · C 1",
        }),
        expect.objectContaining({
          label: "Net State",
          value: "connected · extrapolating",
        }),
      ]),
    );
    expect(hud.playerSpeed).toBeCloseTo(Math.sqrt(180_000));
    expect(hud.playerHeadingDeg).toBeCloseTo(45);
    expect(
      hud.minimap.entities.some(
        (entity) => entity.kind === "drone" && entity.highlighted,
      ),
    ).toBe(true);
    expect(hud.minimap.entities.some((entity) => entity.kind === "sun")).toBe(
      true,
    );
  });

  it("omits profiler debug items when profiling is disabled", () => {
    const hud = buildAuthoritativeHudState({
      activeDrone: null,
      connection: {
        extrapolating: false,
        fps: 0,
        frameTimeMs: 0,
        label: "combat",
        rttMs: null,
        state: "reconnecting",
      },
      controlsEnabled: false,
      currentEffectsQuality: "low",
      currentMaxPixelRatio: 1.1,
      currentTick: 0,
      eventLog: [],
      extrapolating: false,
      playerId: null,
      playerPlanet: null,
      profilerSnapshot: null,
      profilingEnabled: false,
      recentEventsNowMs: 0,
      rosterNameByPlayerId: new Map(),
      runtimeStats: {
        fps: 0,
        frameTimeMs: 0,
      },
      selectedWeapon: "light",
      self: null,
      world: null,
    });

    expect(hud.debugItems).toEqual([]);
    expect(hud.profilingEnabled).toBe(false);
    expect(hud.minimap).toEqual(createInitialHudState().minimap);
  });

  it("shows depleted shield capacity against the full shield baseline", () => {
    const baseShieldCapacity = getShieldLoadCapacity("terra");
    const depletedShieldCapacity = baseShieldCapacity - 15;
    const hud = buildAuthoritativeHudState({
      activeDrone: null,
      connection: {
        extrapolating: false,
        fps: 58,
        frameTimeMs: 16.4,
        label: "room-1 · combat",
        rttMs: 24,
        state: "connected",
      },
      controlsEnabled: true,
      currentEffectsQuality: "high",
      currentMaxPixelRatio: 1.5,
      currentTick: 120,
      eventLog: [],
      extrapolating: false,
      playerId: "pilot-1",
      playerPlanet: {
        ...createPlayerPlanet(),
        shieldLoad: depletedShieldCapacity,
        shieldMaxLoad: depletedShieldCapacity,
      },
      profilerSnapshot: null,
      profilingEnabled: false,
      recentEventsNowMs: 0,
      rosterNameByPlayerId: new Map([["pilot-1", "Pilot One"]]),
      runtimeStats: {
        fps: 58,
        frameTimeMs: 16.4,
      },
      selectedWeapon: "light",
      self: createSelf(),
      world: createWorld(),
    });

    expect(hud.abilities.find((ability) => ability.id === "shield")).toEqual(
      expect.objectContaining({
        fill: 0.85,
        valueText: "85%",
      }),
    );
  });

  it("keeps the remaining foresight charge when toggled off", () => {
    const extendedDurationTicks = Math.round(
      (FORESIGHT_SPEC.durationSec * 2) / FIXED_STEP_SEC,
    );
    const fullRechargeTicks = Math.max(
      0,
      Math.round(FORESIGHT_SPEC.cooldownSec / FIXED_STEP_SEC) -
        extendedDurationTicks,
    );
    const cooldownStartTick = 840;
    const cooldownUntilTick =
      cooldownStartTick + Math.round(fullRechargeTicks / 4);
    const self = createSelf();
    self.cooldowns.foresightActiveUntilTick = cooldownStartTick;
    self.cooldowns.foresightCooldownUntilTick = cooldownUntilTick;
    self.cooldowns.foresightDurationTicks = extendedDurationTicks;

    const cooldownHud = buildAuthoritativeHudState({
      activeDrone: null,
      connection: {
        extrapolating: false,
        fps: 58,
        frameTimeMs: 16.4,
        label: "room-1 · combat",
        rttMs: 24,
        state: "connected",
      },
      controlsEnabled: true,
      currentEffectsQuality: "high",
      currentMaxPixelRatio: 1.5,
      currentTick: cooldownStartTick,
      eventLog: [],
      extrapolating: false,
      playerId: "pilot-1",
      playerPlanet: {
        ...createPlayerPlanet(),
        archetype: "oculus",
      },
      profilerSnapshot: null,
      profilingEnabled: false,
      recentEventsNowMs: 0,
      rosterNameByPlayerId: new Map([["pilot-1", "Pilot One"]]),
      runtimeStats: {
        fps: 58,
        frameTimeMs: 16.4,
      },
      selectedWeapon: "light",
      self,
      world: createWorld(),
    });

    expect(
      cooldownHud.abilities.find((ability) => ability.id === "foresight"),
    ).toEqual(
      expect.objectContaining({
        progress: 0.75,
      }),
    );

    const rechargingHud = buildAuthoritativeHudState({
      activeDrone: null,
      connection: {
        extrapolating: false,
        fps: 58,
        frameTimeMs: 16.4,
        label: "room-1 · combat",
        rttMs: 24,
        state: "connected",
      },
      controlsEnabled: true,
      currentEffectsQuality: "high",
      currentMaxPixelRatio: 1.5,
      currentTick: cooldownStartTick + Math.round(fullRechargeTicks / 8),
      eventLog: [],
      extrapolating: false,
      playerId: "pilot-1",
      playerPlanet: {
        ...createPlayerPlanet(),
        archetype: "oculus",
      },
      profilerSnapshot: null,
      profilingEnabled: false,
      recentEventsNowMs: 0,
      rosterNameByPlayerId: new Map([["pilot-1", "Pilot One"]]),
      runtimeStats: {
        fps: 58,
        frameTimeMs: 16.4,
      },
      selectedWeapon: "light",
      self,
      world: createWorld(),
    });

    expect(
      rechargingHud.abilities.find((ability) => ability.id === "foresight"),
    ).toEqual(
      expect.objectContaining({
        progress: 0.875,
      }),
    );
  });

  it("shows readable held ability names in the HUD and event feed", () => {
    const self = createSelf();
    self.gravityPulseHeld = true;
    self.cloakHeld = true;

    const hud = buildAuthoritativeHudState({
      activeDrone: null,
      connection: {
        extrapolating: false,
        fps: 58,
        frameTimeMs: 16.4,
        label: "room-1 · combat",
        rttMs: 24,
        state: "connected",
      },
      controlsEnabled: true,
      currentEffectsQuality: "high",
      currentMaxPixelRatio: 1.5,
      currentTick: 120,
      eventLog: [
        {
          event: {
            kind: "cachePickup",
            tick: 118,
            playerId: "pilot-1",
            droneId: 3,
            contents: { kind: "wildcard", wildcard: { kind: "cloak" } },
          },
          id: 1,
          receivedAtMs: 1_500,
        },
        {
          event: {
            kind: "wildcardUse",
            tick: 119,
            playerId: "pilot-1",
            wildcard: "gravityPulse",
          },
          id: 2,
          receivedAtMs: 1_750,
        },
      ],
      extrapolating: false,
      playerId: "pilot-1",
      playerPlanet: createPlayerPlanet(),
      profilerSnapshot: null,
      profilingEnabled: false,
      recentEventsNowMs: 2_000,
      rosterNameByPlayerId: new Map([["pilot-1", "Pilot One"]]),
      runtimeStats: {
        fps: 58,
        frameTimeMs: 16.4,
      },
      selectedWeapon: "light",
      self,
      world: createWorld(),
    });

    expect(
      hud.abilities.find((ability) => ability.id === "gravityPulse"),
    ).toEqual(
      expect.objectContaining({
        keyLabel: "G",
        label: "Gravity Pulse",
        statusText: "Gravity Pulse",
      }),
    );
    expect(hud.abilities.find((ability) => ability.id === "cloak")).toEqual(
      expect.objectContaining({
        keyLabel: "C",
        label: "Cloak",
        statusText: "Cloak",
      }),
    );
    expect(hud.killFeed.map((entry) => entry.text)).toEqual([
      "Pilot One collected Wildcard: Cloak",
      "Pilot One used Gravity Pulse",
    ]);
  });
});
