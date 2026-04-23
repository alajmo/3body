import type { NeutronStar, SunVisualProfile } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  type SharedCombatTrackedNeutronStarBody,
  type SharedCombatTrackedSunBody,
  syncSharedCombatDynamicPlanetPresentation,
  syncSharedCombatDynamicSunPresentation,
} from "./sharedCombatDynamicCelestialSync";

const TEST_SUN_PROFILE: SunVisualProfile = {
  bodyScale: 1,
  color: "#fff8d6",
  coreBrightness: 1,
  glowBrightness: 1,
  glowColor: "#ffd36f",
  glowScale: 1.4,
  warpScale: 1.8,
};

describe("syncSharedCombatDynamicSunPresentation", () => {
  it("queues a black-hole swallow when a tracked sun disappears inside the swallow band", () => {
    const sunVisuals = new Map<number, { disposed: boolean }>([
      [11, { disposed: false }],
    ]);
    const previousSunsById = new Map<number, SharedCombatTrackedSunBody>([
      [
        11,
        {
          color: "#ffd36f",
          pos: { x: 78, y: 0 },
          radius: 12,
          vel: { x: 0, y: 0 },
        },
      ],
    ]);
    const previousNeutronStarsById = new Map<
      number,
      SharedCombatTrackedNeutronStarBody
    >();
    const swallowedSunIds: number[] = [];
    const absorbedSunIds: number[] = [];

    syncSharedCombatDynamicSunPresentation({
      blackHole: {
        killRadius: 40,
        pos: { x: 0, y: 0 },
      },
      createVisual: () => ({ disposed: false }),
      currentNeutronStars: [],
      disposeVisual: (visual) => {
        visual.disposed = true;
      },
      nowSec: 4,
      onSunAbsorbedByNeutronStar: ({ sunId }) => {
        absorbedSunIds.push(sunId);
      },
      onSunSwallowedByBlackHole: ({ sunId }) => {
        swallowedSunIds.push(sunId);
      },
      previousNeutronStarsById,
      previousSunsById,
      resolveSunProfile: () => TEST_SUN_PROFILE,
      sunVisuals,
      suns: [],
      syncVisual: () => {},
    });

    expect(swallowedSunIds).toEqual([11]);
    expect(absorbedSunIds).toEqual([]);
    expect(sunVisuals.size).toBe(0);
    expect(previousSunsById.size).toBe(0);
  });

  it("queues a neutron-star absorption when a tracked sun disappears near a growing neutron star", () => {
    const sunVisuals = new Map<number, { disposed: boolean }>([
      [17, { disposed: false }],
    ]);
    const previousSunsById = new Map<number, SharedCombatTrackedSunBody>([
      [
        17,
        {
          color: "#ffd36f",
          pos: { x: 22, y: 0 },
          radius: 10,
          vel: { x: -3, y: 1 },
        },
      ],
    ]);
    const previousNeutronStarsById = new Map<
      number,
      SharedCombatTrackedNeutronStarBody
    >([
      [
        5,
        {
          mass: 12,
          pos: { x: 0, y: 0 },
          radius: 24,
        },
      ],
    ]);
    const currentNeutronStars: NeutronStar[] = [
      {
        id: 5,
        kind: "neutronStar",
        mass: 16,
        pos: { x: 10, y: 0 },
        radius: 34,
        vel: { x: 0, y: 0 },
      },
    ];
    const swallowedSunIds: number[] = [];
    const absorbedSunIds: number[] = [];

    syncSharedCombatDynamicSunPresentation({
      blackHole: null,
      createVisual: () => ({ disposed: false }),
      currentNeutronStars,
      disposeVisual: (visual) => {
        visual.disposed = true;
      },
      nowSec: 4,
      onSunAbsorbedByNeutronStar: ({ sunId }) => {
        absorbedSunIds.push(sunId);
      },
      onSunSwallowedByBlackHole: ({ sunId }) => {
        swallowedSunIds.push(sunId);
      },
      previousNeutronStarsById,
      previousSunsById,
      resolveSunProfile: () => TEST_SUN_PROFILE,
      sunVisuals,
      suns: [],
      syncVisual: () => {},
    });

    expect(swallowedSunIds).toEqual([]);
    expect(absorbedSunIds).toEqual([17]);
    expect(sunVisuals.size).toBe(0);
    expect(previousSunsById.size).toBe(0);
  });

  it("queues a swallow-start callback when an active sun first receives swallowedAtSec", () => {
    const previousSunSwallowedAtById = new Map<number, number | null>([
      [29, null],
    ]);
    const swallowedSunIds: number[] = [];
    const swallowedAtValues: number[] = [];
    const syncedSwallowedAt: Array<number | null> = [];

    syncSharedCombatDynamicSunPresentation({
      blackHole: {
        killRadius: 40,
        pos: { x: 0, y: 0 },
      },
      createVisual: () => ({ disposed: false }),
      currentNeutronStars: [],
      disposeVisual: () => {},
      nowSec: 8,
      onSunAbsorbedByNeutronStar: () => {},
      onSunStartedBlackHoleSwallow: ({ sunId, swallowedAtSec }) => {
        swallowedSunIds.push(sunId);
        swallowedAtValues.push(swallowedAtSec);
      },
      onSunSwallowedByBlackHole: () => {},
      previousNeutronStarsById: new Map(),
      previousSunSwallowedAtById,
      previousSunsById: new Map(),
      resolveSunProfile: () => TEST_SUN_PROFILE,
      resolveSwallowedAtSec: ({ sun }) => sun.swallowedAtSec,
      sunVisuals: new Map(),
      suns: [
        {
          id: 29,
          pos: { x: 6, y: -2 },
          radius: 9,
          swallowedAtSec: 7.25,
          vel: { x: 0, y: 0 },
        },
      ],
      syncVisual: ({ swallowedAtSec }) => {
        syncedSwallowedAt.push(swallowedAtSec);
      },
    });

    expect(swallowedSunIds).toEqual([29]);
    expect(swallowedAtValues).toEqual([7.25]);
    expect(syncedSwallowedAt).toEqual([7.25]);
    expect(previousSunSwallowedAtById.get(29)).toBe(7.25);
  });
});

describe("syncSharedCombatDynamicPlanetPresentation", () => {
  it("queues a black-hole swallow when a tracked planet transitions from alive to dead", () => {
    const previousPlanetAliveById = new Map<number, boolean>([[41, true]]);
    const swallowedPlanetIds: number[] = [];
    const syncVisualAliveStates: boolean[] = [];

    syncSharedCombatDynamicPlanetPresentation({
      createVisual: () => ({ id: "visual" }),
      disposeVisual: () => {},
      onPlanetStartedBlackHoleSwallow: ({ planetId }) => {
        swallowedPlanetIds.push(planetId);
      },
      planetVisuals: new Map(),
      planets: [
        {
          deathReason: "blackHole",
          id: 41,
          alive: false,
          pos: { x: 12, y: -8 },
        },
      ],
      previousPlanetAliveById,
      resolveAlive: ({ planet }) => planet.alive,
      shouldTriggerBlackHoleSwallow: ({ planet }) =>
        planet.deathReason === "blackHole",
      syncVisual: ({ alive }) => {
        syncVisualAliveStates.push(alive);
      },
    });

    expect(swallowedPlanetIds).toEqual([41]);
    expect(syncVisualAliveStates).toEqual([false]);
    expect(previousPlanetAliveById.get(41)).toBe(false);
  });
});
