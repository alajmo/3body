import type {
  DeltaSnapshotMsg,
  PlanetPublic,
  SnapshotV2Msg,
  World,
} from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  applyDeltaSnapshotToWorld,
  applySnapshotV2ToWorld,
} from "./authoritativeMatchRuntime";

const buildPlanet = (overrides: Partial<PlanetPublic> = {}): PlanetPublic => ({
  archetype: "terra",
  debuffs: {},
  hp: 100,
  id: 1,
  kind: "planet",
  playerId: "player-1",
  pos: { x: 10, y: 20 },
  radius: 12,
  shieldActive: false,
  shieldAimDir: { x: 1, y: 0 },
  shieldLoad: 0,
  shieldMaxLoad: 0,
  vel: { x: 2, y: 3 },
  ...overrides,
});

const buildWorld = (overrides: Partial<World> = {}): World => ({
  arenaRadius: 2_000,
  caches: [],
  debris: [],
  neutronStars: [],
  planets: [buildPlanet()],
  rockets: [],
  suns: [],
  ...overrides,
});

describe("authoritativeMatchRuntime", () => {
  it("reuses the existing world when a delta has no entity changes", () => {
    const world = buildWorld();
    const deltaSnapshot: DeltaSnapshotMsg = {
      baseTick: 10,
      changed: {},
      removed: {},
      tick: 11,
      type: "deltaSnapshot",
    };

    expect(applyDeltaSnapshotToWorld(world, deltaSnapshot)).toBe(world);
  });

  it("reuses unchanged collections while patching only changed entities", () => {
    const world = buildWorld({
      caches: [
        {
          contents: { kind: "repair" },
          id: 7,
          kind: "cache",
          pos: { x: 40, y: 0 },
          radius: 10,
          vel: { x: 0, y: 0 },
        },
      ],
    });
    const deltaSnapshot: DeltaSnapshotMsg = {
      baseTick: 10,
      changed: {
        planets: [
          buildPlanet({
            hp: 72,
            pos: { x: 16, y: 24 },
          }),
        ],
      },
      removed: {},
      tick: 11,
      type: "deltaSnapshot",
    };

    const nextWorld = applyDeltaSnapshotToWorld(world, deltaSnapshot);

    expect(nextWorld).not.toBe(world);
    expect(nextWorld.caches).toBe(world.caches);
    expect(nextWorld.planets).not.toBe(world.planets);
    expect(nextWorld.planets[0]?.hp).toBe(72);
    expect(nextWorld.planets[0]?.pos).toEqual({ x: 16, y: 24 });
  });

  it("applies compact snapshot v2 updates, spawns, and removals", () => {
    const world = buildWorld({
      caches: [
        {
          contents: { kind: "repair" },
          id: 7,
          kind: "cache",
          pos: { x: 40, y: 0 },
          radius: 10,
          vel: { x: 0, y: 0 },
        },
      ],
      rockets: [
        {
          id: 9,
          kind: "rocket",
          ownerId: "player-1",
          pos: { x: 20, y: 20 },
          radius: 5,
          rocketKind: "light",
          ttlUntilTick: 120,
          vel: { x: 1, y: 0 },
        },
      ],
    });
    const snapshot: SnapshotV2Msg = {
      baseTick: 10,
      removed: {
        rockets: [9],
      },
      spawns: {
        caches: [
          {
            contents: { kind: "heavyAmmo" },
            id: 8,
            kind: "cache",
            pos: { x: 80, y: 0 },
            radius: 10,
            vel: { x: 0, y: 1 },
          },
        ],
      },
      tick: 11,
      type: "snapshotV2",
      updates: {
        planets: [[1, 18, 28, 4, 5, 71, 0, 1, 1, 14, 22, {}]],
      },
    };

    const nextWorld = applySnapshotV2ToWorld(world, snapshot);

    expect(nextWorld).not.toBe(world);
    expect(nextWorld.planets[0]).toEqual(
      expect.objectContaining({
        hp: 71,
        pos: { x: 18, y: 28 },
        shieldActive: true,
        shieldAimDir: { x: 0, y: 1 },
        shieldLoad: 14,
        shieldMaxLoad: 22,
        vel: { x: 4, y: 5 },
      }),
    );
    expect(nextWorld.rockets).toEqual([]);
    expect(nextWorld.caches.map((cache) => cache.id)).toEqual([7, 8]);
  });
});
