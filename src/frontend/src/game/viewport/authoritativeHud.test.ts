import type { PlanetPrivateState, PlanetPublic, World } from "@3body/shared";
import { getShieldLoadCapacity } from "@3body/shared";
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
    neutronStars: [],
    planets: [
      {
        id: 1,
        kind: "planet",
        playerId: "pilot-1",
        archetype: "terra",
        debuffs: {},
        hp: 87,
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
        hp: 92,
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
      heavyReloadUntilTick: 0,
      lightReloadUntilTick: 0,
      nextBoostChargeAtTick: undefined,
      seekerReloadUntilTick: 0,
    },
    gravityPulseHeld: false,
    nextShieldExt: false,
  }) satisfies PlanetPrivateState;

const createPlayerPlanet = (): PlanetPublic =>
  ({
    debuffs: {},
    hp: 87,
    id: 1,
    kind: "planet",
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

describe("buildAuthoritativeHudState", () => {
  it("surfaces profiler debug items for the authoritative viewport", () => {
    const hud = buildAuthoritativeHudState({
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
      damageFlash: 0,
      eventLog: [],
      extrapolating: true,
      hudFlicker: 0,
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
    expect(
      Object.fromEntries(
        hud.abilities.map((ability) => [ability.id, ability.keyLabel]),
      ),
    ).toEqual({
      boost: "W",
      shield: "Q",
    });
    expect(hud.debugItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Frame CPU" }),
        expect.objectContaining({
          label: "Quality",
          value: "PR 1.5 · FX high",
        }),
        expect.objectContaining({
          label: "Entities",
          value: "P 2 · R 1 · C 1",
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
        (entity) =>
          entity.kind === "planet" && entity.id === 1 && entity.highlighted,
      ),
    ).toBe(true);
    expect(hud.minimap.entities.some((entity) => entity.kind === "sun")).toBe(
      true,
    );
  });

  it("omits profiler debug items when profiling is disabled", () => {
    const hud = buildAuthoritativeHudState({
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
      damageFlash: 0,
      eventLog: [],
      extrapolating: false,
      hudFlicker: 0,
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
      damageFlash: 0,
      eventLog: [],
      extrapolating: false,
      hudFlicker: 0,
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

  it("shows readable held ability names in the HUD and event feed", () => {
    const self = createSelf();
    self.gravityPulseHeld = true;

    const hud = buildAuthoritativeHudState({
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
      damageFlash: 0,
      eventLog: [
        {
          event: {
            kind: "cachePickup",
            tick: 118,
            playerId: "pilot-1",
            planetId: 1,
            contents: {
              kind: "wildcard",
              wildcard: { kind: "gravityPulse" },
            },
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
      hudFlicker: 0,
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
    expect(hud.killFeed.map((entry) => entry.text)).toEqual([
      "Pilot One collected Wildcard: Gravity Pulse",
      "Pilot One used Gravity Pulse",
    ]);
  });

  it("describes neutron star kills in the event feed", () => {
    const hud = buildAuthoritativeHudState({
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
      damageFlash: 0,
      eventLog: [
        {
          event: {
            kind: "kill",
            tick: 119,
            victimPlayerId: "pilot-2",
            victimPlanetId: 2,
            cause: "neutronStar",
          },
          id: 1,
          receivedAtMs: 1_750,
        },
      ],
      extrapolating: false,
      hudFlicker: 0,
      playerId: "pilot-1",
      playerPlanet: createPlayerPlanet(),
      profilerSnapshot: null,
      profilingEnabled: false,
      recentEventsNowMs: 2_000,
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

    expect(hud.killFeed.map((entry) => entry.text)).toEqual([
      "Pilot Two was crushed by a neutron star",
    ]);
  });
});
