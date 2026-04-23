import type { PlanetPublic, World } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  createAuthoritativeLocalPlanetPresentationState,
  reconcileAuthoritativeLocalPlanetPresentation,
} from "./authoritativeLocalPlanetReconciliation";

const buildPlanet = (overrides: Partial<PlanetPublic> = {}): PlanetPublic => ({
  archetype: "terra",
  debuffs: {},
  hp: 100,
  id: 1,
  kind: "planet",
  playerId: "self",
  pos: { x: 0, y: 0 },
  radius: 22,
  shieldActive: false,
  shieldAimDir: { x: 1, y: 0 },
  shieldLoad: 0,
  shieldMaxLoad: 0,
  vel: { x: 0, y: 0 },
  ...overrides,
});

const buildWorld = (planet: PlanetPublic): World =>
  ({
    arenaRadius: 10_000,
    caches: [],
    debris: [],
    neutronStars: [],
    planets: [planet],
    rockets: [],
    suns: [],
  }) satisfies World;

describe("authoritativeLocalPlanetReconciliation", () => {
  it("initializes the local presentation state from the authoritative planet", () => {
    const state = createAuthoritativeLocalPlanetPresentationState();
    const planet = buildPlanet({ pos: { x: 25, y: -40 } });

    const playerPlanet = reconcileAuthoritativeLocalPlanetPresentation({
      frameDeltaSec: 1 / 60,
      playerId: "self",
      state,
      world: buildWorld(planet),
    });

    expect(playerPlanet).toBe(planet);
    expect(planet.pos).toEqual({ x: 25, y: -40 });
  });

  it("predicts steady local motion without adding presentation lag", () => {
    const state = createAuthoritativeLocalPlanetPresentationState();
    reconcileAuthoritativeLocalPlanetPresentation({
      frameDeltaSec: 0,
      playerId: "self",
      state,
      world: buildWorld(buildPlanet()),
    });
    const planet = buildPlanet({
      pos: { x: 10, y: 0 },
      vel: { x: 100, y: 0 },
    });

    reconcileAuthoritativeLocalPlanetPresentation({
      frameDeltaSec: 0.1,
      playerId: "self",
      state,
      world: buildWorld(planet),
    });

    expect(planet.pos.x).toBeCloseTo(10);
  });

  it("smooths small authoritative corrections instead of snapping", () => {
    const state = createAuthoritativeLocalPlanetPresentationState();
    reconcileAuthoritativeLocalPlanetPresentation({
      frameDeltaSec: 0,
      playerId: "self",
      state,
      world: buildWorld(buildPlanet()),
    });
    const planet = buildPlanet({ pos: { x: 30, y: 0 } });

    reconcileAuthoritativeLocalPlanetPresentation({
      frameDeltaSec: 1 / 60,
      playerId: "self",
      state,
      world: buildWorld(planet),
    });

    expect(planet.pos.x).toBeGreaterThan(0);
    expect(planet.pos.x).toBeLessThan(30);
  });

  it("snaps large discontinuities such as respawns", () => {
    const state = createAuthoritativeLocalPlanetPresentationState();
    reconcileAuthoritativeLocalPlanetPresentation({
      frameDeltaSec: 0,
      playerId: "self",
      state,
      world: buildWorld(buildPlanet()),
    });
    const planet = buildPlanet({ pos: { x: 10_000, y: 0 } });

    reconcileAuthoritativeLocalPlanetPresentation({
      frameDeltaSec: 1 / 60,
      playerId: "self",
      state,
      world: buildWorld(planet),
    });

    expect(planet.pos.x).toBe(10_000);
  });
});
