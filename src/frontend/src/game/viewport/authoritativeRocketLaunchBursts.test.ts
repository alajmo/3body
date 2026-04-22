import type { PlanetPublic, Rocket, World } from "@3body/shared";
import { ROCKET_SPECS } from "@3body/shared";
import { describe, expect, it } from "vitest";
import { deriveAuthoritativeRocketLaunchBursts } from "./authoritativeRocketLaunchBursts";

const buildPlanet = (
  overrides: Partial<PlanetPublic> = {},
): PlanetPublic => ({
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

describe("deriveAuthoritativeRocketLaunchBursts", () => {
  it("derives shared launch-burst state for newly observed remote rockets", () => {
    const previousWorld = buildWorld();
    const snapshotWorld = buildWorld({
      rockets: [buildRocket()],
    });

    const bursts = deriveAuthoritativeRocketLaunchBursts({
      currentPlayerId: "self",
      previousWorld,
      snapshotReceivedAtSec: 10,
      snapshotWorld,
    });

    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toMatchObject({
      dir: { x: 1, y: 0 },
      launchPlanetPos: { x: 0, y: 0 },
      launchPlanetRadius: 20,
      ownerId: "enemy",
      rocketKind: "light",
      speed: 300,
    });
    expect(bursts[0]!.origin.x).toBeCloseTo(
      20 + ROCKET_SPECS.light.radius + 10,
    );
    expect(bursts[0]!.origin.y).toBe(0);
    expect(bursts[0]!.startedAtSec).toBeCloseTo(
      10 - (140 - bursts[0]!.origin.x) / 300,
    );
  });

  it("skips rockets that already existed or belong to the local player", () => {
    const existingRocket = buildRocket({ id: 8 });
    const previousWorld = buildWorld({
      rockets: [existingRocket],
    });
    const snapshotWorld = buildWorld({
      rockets: [
        existingRocket,
        buildRocket({
          id: 9,
          ownerId: "self",
        }),
      ],
    });

    const bursts = deriveAuthoritativeRocketLaunchBursts({
      currentPlayerId: "self",
      previousWorld,
      snapshotReceivedAtSec: 10,
      snapshotWorld,
    });

    expect(bursts).toHaveLength(0);
  });
});
