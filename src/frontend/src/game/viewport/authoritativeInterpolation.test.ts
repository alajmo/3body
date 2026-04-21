import type {
  BlackHole,
  Cache,
  Debris,
  NeutronStar,
  PlanetPublic,
  Rocket,
  Sun,
  World,
} from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  createAuthoritativeInterpolationCache,
  syncAuthoritativeInterpolatedWorld,
} from "./authoritativeInterpolation";

const buildSun = (overrides: Partial<Sun> = {}): Sun => ({
  id: 1,
  kind: "sun",
  mass: 100,
  pos: { x: 0, y: 0 },
  radius: 20,
  vel: { x: 0, y: 0 },
  ...overrides,
});

const buildNeutronStar = (
  overrides: Partial<NeutronStar> = {},
): NeutronStar => ({
  id: 2,
  kind: "neutronStar",
  mass: 200,
  pos: { x: 50, y: 60 },
  radius: 30,
  vel: { x: 3, y: 4 },
  ...overrides,
});

const buildPlanet = (overrides: Partial<PlanetPublic> = {}): PlanetPublic => ({
  archetype: "terra",
  debuffs: {},
  hp: 90,
  id: 3,
  kind: "planet",
  playerId: "player",
  pos: { x: 10, y: 20 },
  radius: 12,
  shieldActive: false,
  shieldAimDir: { x: 1, y: 0 },
  shieldLoad: 5,
  shieldMaxLoad: 10,
  vel: { x: 1, y: 2 },
  ...overrides,
});

const buildRocket = (overrides: Partial<Rocket> = {}): Rocket => ({
  id: 4,
  kind: "rocket",
  ownerId: "player",
  pos: { x: 30, y: 40 },
  radius: 5,
  rocketKind: "light",
  ttlUntilTick: 10,
  vel: { x: 4, y: 6 },
  ...overrides,
});

const buildCache = (overrides: Partial<Cache> = {}): Cache => ({
  contents: { kind: "repair" },
  id: 5,
  kind: "cache",
  pos: { x: -10, y: 12 },
  radius: 8,
  vel: { x: 2, y: -1 },
  ...overrides,
});

const buildDebris = (overrides: Partial<Debris> = {}): Debris => ({
  id: 6,
  kind: "debris",
  ownerPlayerId: "player",
  pos: { x: 5, y: 7 },
  radius: 3,
  ttlUntilTick: 20,
  vel: { x: -2, y: 1 },
  ...overrides,
});

const buildBlackHole = (overrides: Partial<BlackHole> = {}): BlackHole => ({
  id: 7,
  kind: "blackHole",
  killRadius: 40,
  mass: 900,
  pos: { x: 100, y: -50 },
  radius: 40,
  vel: { x: 0, y: 0 },
  ...overrides,
});

const buildWorld = (overrides: Partial<World> = {}): World => ({
  arenaRadius: 2_000,
  blackHole: buildBlackHole(),
  caches: [buildCache()],
  debris: [buildDebris()],
  neutronStars: [buildNeutronStar()],
  planets: [buildPlanet()],
  rockets: [buildRocket()],
  suns: [buildSun()],
  ...overrides,
});

describe("authoritativeInterpolation", () => {
  it("interpolates world entities into a reusable render world without aliasing snapshots", () => {
    const previousWorld = buildWorld();
    const currentWorld = buildWorld({
      arenaRadius: 2_400,
      blackHole: buildBlackHole({
        pos: { x: 120, y: -10 },
      }),
      caches: [
        buildCache({
          contents: {
            kind: "wildcard",
            wildcard: { kind: "gravityPulse" },
          },
          pos: { x: 10, y: 12 },
          vel: { x: 6, y: -1 },
        }),
      ],
      debris: [
        buildDebris({
          pos: { x: 15, y: 17 },
          vel: { x: 2, y: 5 },
        }),
      ],
      neutronStars: [
        buildNeutronStar({
          pos: { x: 150, y: 160 },
          vel: { x: 9, y: 8 },
        }),
      ],
      planets: [
        buildPlanet({
          debuffs: { dragUntilTick: 44 },
          hp: 70,
          pos: { x: 30, y: 60 },
          shieldAimDir: { x: 0, y: 1 },
          shieldActive: true,
          shieldLoad: 2,
          vel: { x: 5, y: 6 },
        }),
      ],
      rockets: [
        buildRocket({
          pos: { x: 50, y: 70 },
          vel: { x: 8, y: 10 },
        }),
      ],
      suns: [
        buildSun({
          pos: { x: 20, y: 40 },
          vel: { x: 6, y: 8 },
        }),
      ],
    });
    const cache = createAuthoritativeInterpolationCache();

    const interpolatedWorld = syncAuthoritativeInterpolatedWorld(
      cache,
      previousWorld,
      currentWorld,
      0.5,
    );

    expect(interpolatedWorld.arenaRadius).toBe(2_400);
    expect(interpolatedWorld.suns[0]!.pos).toEqual({ x: 10, y: 20 });
    expect(interpolatedWorld.suns[0]!.vel).toEqual({ x: 3, y: 4 });
    expect(interpolatedWorld.planets[0]!.pos).toEqual({ x: 20, y: 40 });
    expect(interpolatedWorld.planets[0]!.vel).toEqual({ x: 3, y: 4 });
    expect(interpolatedWorld.planets[0]!.shieldAimDir).toEqual({ x: 0, y: 1 });
    expect(interpolatedWorld.planets[0]!.debuffs).toEqual({
      dragUntilTick: 44,
    });
    expect(interpolatedWorld.rockets[0]!.pos).toEqual({ x: 40, y: 55 });
    expect(interpolatedWorld.rockets[0]!.vel).toEqual({ x: 6, y: 8 });
    expect(interpolatedWorld.caches[0]!.pos).toEqual({ x: 0, y: 12 });
    expect(interpolatedWorld.caches[0]!.contents).toEqual({
      kind: "wildcard",
      wildcard: { kind: "gravityPulse" },
    });
    expect(interpolatedWorld.debris[0]!.pos).toEqual({ x: 10, y: 12 });
    expect(interpolatedWorld.blackHole?.pos).toEqual({ x: 110, y: -30 });
    expect(interpolatedWorld.neutronStars[0]!.pos).toEqual({ x: 100, y: 110 });
    expect(interpolatedWorld.neutronStars[0]!.vel).toEqual({ x: 6, y: 6 });

    expect(interpolatedWorld.suns[0]).not.toBe(previousWorld.suns[0]);
    expect(interpolatedWorld.suns[0]).not.toBe(currentWorld.suns[0]);
    expect(interpolatedWorld.planets[0]).not.toBe(previousWorld.planets[0]);
    expect(interpolatedWorld.planets[0]).not.toBe(currentWorld.planets[0]);
    expect(interpolatedWorld.caches[0]).not.toBe(currentWorld.caches[0]);
    expect(interpolatedWorld.blackHole).not.toBe(currentWorld.blackHole);
  });

  it("reuses cached world objects across frames for matching ids", () => {
    const firstPreviousWorld = buildWorld();
    const firstCurrentWorld = buildWorld({
      blackHole: undefined,
      caches: [buildCache({ contents: { kind: "heavyAmmo" } })],
      suns: [buildSun({ pos: { x: 10, y: 10 } })],
    });
    const secondCurrentWorld = buildWorld({
      blackHole: undefined,
      caches: [buildCache({ contents: { kind: "seekerPack" } })],
      suns: [buildSun({ pos: { x: 30, y: 30 } })],
    });
    const cache = createAuthoritativeInterpolationCache();

    const firstInterpolatedWorld = syncAuthoritativeInterpolatedWorld(
      cache,
      firstPreviousWorld,
      firstCurrentWorld,
      1,
    );
    const cachedSun = firstInterpolatedWorld.suns[0]!;
    const cachedCache = firstInterpolatedWorld.caches[0]!;

    const secondInterpolatedWorld = syncAuthoritativeInterpolatedWorld(
      cache,
      firstCurrentWorld,
      secondCurrentWorld,
      1,
    );

    expect(secondInterpolatedWorld).toBe(firstInterpolatedWorld);
    expect(secondInterpolatedWorld.suns[0]).toBe(cachedSun);
    expect(secondInterpolatedWorld.caches[0]).toBe(cachedCache);
    expect(secondInterpolatedWorld.suns[0]!.pos).toEqual({ x: 30, y: 30 });
    expect(secondInterpolatedWorld.caches[0]!.contents).toEqual({
      kind: "seekerPack",
    });
  });
});
