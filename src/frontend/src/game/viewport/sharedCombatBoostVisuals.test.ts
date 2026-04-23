import { describe, expect, it } from "vitest";
import {
  collectSharedCombatVisibleBoostWakeBursts,
  getSharedCombatBoostWakeBendAmount,
  getSharedCombatBoostWakeCurveOffset,
  getSharedCombatHeldBoostDirectionOverride,
  pruneSharedCombatBoostBursts,
  queueSharedCombatBoostBurst,
  syncSharedCombatBoostPresentation,
} from "./sharedCombatBoostVisuals";

describe("collectSharedCombatVisibleBoostWakeBursts", () => {
  it("keeps a single wake per planet and preserves the furthest progress", () => {
    const bursts = [
      {
        direction: { x: 1, y: 0 },
        origin: { x: 10, y: 0 },
        planetId: 101,
        radius: 18,
        startedAtSec: 0,
        tick: 10,
      },
      {
        direction: { x: 0, y: 1 },
        origin: { x: 24, y: 8 },
        planetId: 101,
        radius: 22,
        startedAtSec: 0.24,
        tick: 11,
      },
    ] as const;

    const visibleWakeBursts = collectSharedCombatVisibleBoostWakeBursts({
      bursts,
      getBodyById: () => null,
      nowSec: 0.3,
    });

    expect(visibleWakeBursts).toHaveLength(1);
    expect(visibleWakeBursts[0]!.progress).toBeCloseTo(0.625);
    expect(visibleWakeBursts[0]!.alpha).toBeCloseTo(0.875);
    expect(visibleWakeBursts[0]!.origin).toEqual({ x: 24, y: 8 });
    expect(visibleWakeBursts[0]!.burst.tick).toBe(11);
    expect(visibleWakeBursts[0]!.radius).toBe(22);
  });

  it("blends wake direction across overlapping bursts for the same planet", () => {
    const visibleWakeBursts = collectSharedCombatVisibleBoostWakeBursts({
      bursts: [
        {
          direction: { x: 1, y: 0 },
          origin: { x: 10, y: 0 },
          planetId: 101,
          radius: 18,
          startedAtSec: 0,
          tick: 10,
        },
        {
          direction: { x: 0, y: 1 },
          origin: { x: 24, y: 8 },
          planetId: 101,
          radius: 22,
          startedAtSec: 0.24,
          tick: 11,
        },
      ],
      getBodyById: () => null,
      nowSec: 0.3,
    });

    expect(visibleWakeBursts).toHaveLength(1);
    expect(visibleWakeBursts[0]!.direction.x).toBeCloseTo(0.394, 3);
    expect(visibleWakeBursts[0]!.direction.y).toBeCloseTo(0.919, 3);
    expect(visibleWakeBursts[0]!.direction.y).toBeGreaterThan(
      visibleWakeBursts[0]!.direction.x,
    );
  });

  it("uses the live direction override for the matching planet", () => {
    const visibleWakeBursts = collectSharedCombatVisibleBoostWakeBursts({
      bursts: [
        {
          direction: { x: 1, y: 0 },
          origin: { x: 10, y: 0 },
          planetId: 101,
          radius: 18,
          startedAtSec: 0.12,
          tick: 10,
        },
      ],
      directionOverride: {
        direction: { x: 0, y: 1 },
        planetId: 101,
      },
      getBodyById: () => null,
      nowSec: 0.24,
    });

    expect(visibleWakeBursts).toHaveLength(1);
    expect(visibleWakeBursts[0]!.direction).toEqual({ x: 0, y: 1 });
  });

  it("keeps separate wakes for different planets", () => {
    const visibleWakeBursts = collectSharedCombatVisibleBoostWakeBursts({
      bursts: [
        {
          direction: { x: 1, y: 0 },
          origin: { x: 0, y: 0 },
          planetId: 101,
          radius: 18,
          startedAtSec: 0.12,
          tick: 10,
        },
        {
          direction: { x: 0, y: 1 },
          origin: { x: 40, y: 20 },
          planetId: 202,
          radius: 20,
          startedAtSec: 0.18,
          tick: 11,
        },
      ],
      getBodyById: () => null,
      nowSec: 0.24,
    });

    expect(visibleWakeBursts).toHaveLength(2);
    expect(visibleWakeBursts.map((burst) => burst.burst.planetId)).toEqual([
      202, 101,
    ]);
  });
});

describe("getSharedCombatBoostWakeBendAmount", () => {
  it("returns negative bend for a left turn and positive bend for a right turn", () => {
    const leftTurnBend = getSharedCombatBoostWakeBendAmount({
      baseDirection: { x: 1, y: 0 },
      currentDirection: { x: 0, y: 1 },
      progress: 1,
    });
    const rightTurnBend = getSharedCombatBoostWakeBendAmount({
      baseDirection: { x: 1, y: 0 },
      currentDirection: { x: 0, y: -1 },
      progress: 1,
    });

    expect(leftTurnBend).toBeCloseTo(-1.18);
    expect(rightTurnBend).toBeCloseTo(1.18);
  });

  it("keeps the bend subtle early in the wake", () => {
    const earlyBend = getSharedCombatBoostWakeBendAmount({
      baseDirection: { x: 1, y: 0 },
      currentDirection: { x: 0, y: 1 },
      progress: 0,
    });

    expect(earlyBend).toBeCloseTo(-0.22);
  });
});

describe("getSharedCombatBoostWakeCurveOffset", () => {
  it("keeps the wake head fixed while the tail follows older aim", () => {
    const directionSamples = [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ] as const;

    expect(
      getSharedCombatBoostWakeCurveOffset({
        currentDirection: { x: 0, y: 1 },
        directionSamples,
        tailProgress: 0,
        wakeProgress: 1,
      }),
    ).toBe(0);

    expect(
      getSharedCombatBoostWakeCurveOffset({
        currentDirection: { x: 0, y: 1 },
        directionSamples,
        tailProgress: 1,
        wakeProgress: 1,
      }),
    ).toBeLessThan(-1);
  });
});

describe("boost burst queue and pruning", () => {
  it("caps the active burst list to the requested maximum", () => {
    const activeBursts = [] as Array<{
      direction: { x: number; y: number };
      origin: { x: number; y: number };
      planetId: number;
      radius: number;
      startedAtSec: number;
      tick: number;
    }>;

    queueSharedCombatBoostBurst({
      activeBursts,
      burst: {
        direction: { x: 1, y: 0 },
        origin: { x: 0, y: 0 },
        planetId: 1,
        radius: 10,
        startedAtSec: 0,
        tick: 1,
      },
      maxActiveBursts: 2,
    });
    queueSharedCombatBoostBurst({
      activeBursts,
      burst: {
        direction: { x: 0, y: 1 },
        origin: { x: 1, y: 1 },
        planetId: 2,
        radius: 10,
        startedAtSec: 0.1,
        tick: 2,
      },
      maxActiveBursts: 2,
    });
    queueSharedCombatBoostBurst({
      activeBursts,
      burst: {
        direction: { x: -1, y: 0 },
        origin: { x: 2, y: 2 },
        planetId: 3,
        radius: 10,
        startedAtSec: 0.2,
        tick: 3,
      },
      maxActiveBursts: 2,
    });

    expect(activeBursts.map((burst) => burst.planetId)).toEqual([2, 3]);
  });

  it("drops expired bursts from the front of the active list", () => {
    const activeBursts = [
      {
        direction: { x: 1, y: 0 },
        origin: { x: 0, y: 0 },
        planetId: 1,
        radius: 10,
        startedAtSec: 0,
        tick: 1,
      },
      {
        direction: { x: 0, y: 1 },
        origin: { x: 1, y: 1 },
        planetId: 2,
        radius: 10,
        startedAtSec: 0.3,
        tick: 2,
      },
    ];

    pruneSharedCombatBoostBursts({
      activeBursts,
      nowSec: 0.55,
    });

    expect(activeBursts.map((burst) => burst.planetId)).toEqual([2]);
  });
});

describe("shared boost presentation helpers", () => {
  it("derives a held-boost override from the focused living body", () => {
    expect(
      getSharedCombatHeldBoostDirectionOverride({
        aimTarget: { x: 22, y: 14 },
        body: {
          alive: true,
          id: 7,
          pos: { x: 10, y: 10 },
          radius: 18,
        },
        heldBoosting: true,
      }),
    ).toEqual({
      direction: {
        x: 12 / Math.hypot(12, 4),
        y: 4 / Math.hypot(12, 4),
      },
      planetId: 7,
    });
  });

  it("prunes expired bursts before syncing boost presentation", () => {
    const activeBursts = [
      {
        direction: { x: 1, y: 0 },
        origin: { x: 0, y: 0 },
        planetId: 1,
        radius: 10,
        startedAtSec: 0,
        tick: 1,
      },
      {
        direction: { x: 0, y: 1 },
        origin: { x: 1, y: 1 },
        planetId: 2,
        radius: 10,
        startedAtSec: 0.3,
        tick: 2,
      },
    ];

    const directionOverride = syncSharedCombatBoostPresentation({
      activeBursts,
      aimTarget: { x: 4, y: 1 },
      boostVisual: null,
      heldBoosting: true,
      maxParticlesPerBurst: 0,
      nowSec: 0.55,
      playerBody: {
        alive: true,
        id: 2,
        pos: { x: 1, y: 1 },
        radius: 10,
      },
    });

    expect(activeBursts.map((burst) => burst.planetId)).toEqual([2]);
    expect(directionOverride).toEqual({
      direction: { x: 1, y: 0 },
      planetId: 2,
    });
  });

  it("uses current aim for the focused player's active boost wake even after boost is released", () => {
    const directionOverride = syncSharedCombatBoostPresentation({
      activeBursts: [
        {
          direction: { x: -1, y: 0 },
          origin: { x: 0, y: 0 },
          planetId: 7,
          radius: 10,
          startedAtSec: 0.1,
          tick: 4,
        },
      ],
      aimTarget: { x: 10, y: 20 },
      boostVisual: null,
      heldBoosting: false,
      maxParticlesPerBurst: 0,
      nowSec: 0.2,
      playerBody: {
        alive: true,
        id: 7,
        pos: { x: 10, y: 10 },
        radius: 10,
      },
    });

    expect(directionOverride).toEqual({
      direction: { x: 0, y: 1 },
      planetId: 7,
    });
  });

  it("does not apply the focused player aim to remote boost wakes", () => {
    const directionOverride = syncSharedCombatBoostPresentation({
      activeBursts: [
        {
          direction: { x: -1, y: 0 },
          origin: { x: 0, y: 0 },
          planetId: 8,
          radius: 10,
          startedAtSec: 0.1,
          tick: 4,
        },
      ],
      aimTarget: { x: 10, y: 20 },
      boostVisual: null,
      heldBoosting: false,
      maxParticlesPerBurst: 0,
      nowSec: 0.2,
      playerBody: {
        alive: true,
        id: 7,
        pos: { x: 10, y: 10 },
        radius: 10,
      },
    });

    expect(directionOverride).toBeNull();
  });
});
