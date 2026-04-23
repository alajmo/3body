import type { PlanetPrivateState, PlanetPublic, World } from "@3body/shared";
import { getShieldLoadCapacity } from "@3body/shared";
import { describe, expect, it } from "vitest";
import { createInitialHudState } from "../viewportHud";
import { buildAuthoritativeHudState } from "./authoritativeHud";

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
      networkDiagnostics: {
        inboundBytesPerSec: 225 * 1024,
        inboundByType: [
          {
            bytesPerSec: 225 * 1024,
            messagesPerSec: 60,
            type: "snapshotV2",
          },
        ],
        inboundMessagesPerSec: 60,
        outboundBytesPerSec: 58,
        outboundByType: [
          {
            bytesPerSec: 58,
            messagesPerSec: 30,
            type: "input",
          },
        ],
        outboundMessagesPerSec: 30,
        serverSnapshotGapAverageMs: 16.7,
        serverSnapshotGapMaxMs: 18.4,
        serverSnapshotGapP90Ms: 17.1,
        serverSnapshotLateCount: 0,
        snapshotGapAverageMs: 16.7,
        snapshotGapOver100Count: 0,
        snapshotGapOver50Count: 0,
        snapshotGapMaxMs: 24.5,
        snapshotGapP90Ms: 17.2,
        snapshotLastGapOver100AgeMs: null,
        snapshotLastGapOver50AgeMs: null,
        snapshotLateCount: 0,
        snapshotMessagesPerSec: 60,
        snapshotTickGapMax: 1,
        windowSec: 2,
      },
      playerId: "pilot-1",
      playerPlanet: createPlayerPlanet(),
      profilerSnapshot: {
        frameCpu: { averageMs: 5.5, latestMs: 5.8, maxMs: 8.3 },
        frameGap: { averageMs: 16.7, latestMs: 16.6, maxMs: 24.1 },
        frameGapSpikes: {
          count: 0,
          lastAgeSec: null,
          thresholdMs: 1000 / 30,
        },
        frames: 12,
        interpolation: { averageMs: 0.7, latestMs: 0.8, maxMs: 1.1 },
        renderCpu: { averageMs: 2.6, latestMs: 2.7, maxMs: 3.9 },
        sampledDurationSec: 0.2,
        simulation: { averageMs: 0, latestMs: 0, maxMs: 0 },
        steps: { average: 0, latest: 0, max: 0 },
        submit: { averageMs: 1.1, latestMs: 1.2, maxMs: 1.7 },
        submitSpikes: {
          count: 0,
          lastAgeSec: null,
          thresholdMs: 20,
        },
      },
      profilingEnabled: true,
      recentEventsNowMs: 1_000,
      renderDiagnostics: {
        bufferDepth: 4,
        desiredRenderTick: 117.5,
        interpolationAlpha: 0.5,
        latestSnapshotAgeMs: 34,
        renderTick: 117.5,
        tickBehindLatest: 2.5,
        visuallyExtrapolating: true,
      },
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
        expect.objectContaining({
          label: "Net RX",
          value: "225.0 KB/s · 60 msg/s",
        }),
        expect.objectContaining({
          label: "Net TX",
          value: "58 B/s · 30 msg/s",
        }),
        expect.objectContaining({
          label: "Snapshots",
          value: "60/s · gap 16.7/17.2/24.5 ms · late 0",
        }),
        expect.objectContaining({
          label: "Net Jitter",
          value: "gap>50 0 · last -- · gap>100 0 · last --",
        }),
        expect.objectContaining({
          label: "Server Snap",
          value: "gap 16.7/17.1/18.4 ms · late 0",
        }),
        expect.objectContaining({
          label: "Interp",
          value: "alpha 0.50 · depth 4 · behind 2.5t · extrapolating",
        }),
        expect.objectContaining({
          label: "Snap Age",
          value: "34.0 ms · desired 117.5 · render 117.5",
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

  it("shows readable held ability names without surfacing ability spam in the kill feed", () => {
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
    expect(hud.killFeed).toEqual([]);
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
