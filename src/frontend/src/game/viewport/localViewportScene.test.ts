import { describe, expect, it } from "vitest";
import {
  collectVisibleBoostWakeBursts,
  getBoostWakeBendAmount,
  getBoostWakeCurveOffset,
} from "./localViewportScene";

describe("collectVisibleBoostWakeBursts", () => {
  it("keeps a single wake per planet and preserves the furthest progress", () => {
    const bursts = [
      {
        direction: { x: 1, y: 0 },
        origin: { x: 10, y: 0 },
        planetArchetype: "terra",
        planetId: 101,
        radius: 18,
        startedAtSec: 0,
        tick: 10,
      },
      {
        direction: { x: 0, y: 1 },
        origin: { x: 24, y: 8 },
        planetArchetype: "terra",
        planetId: 101,
        radius: 22,
        startedAtSec: 0.24,
        tick: 11,
      },
    ] as const;

    const visibleWakeBursts = collectVisibleBoostWakeBursts({
      bursts,
      nowSec: 0.3,
      planetsById: new Map(),
    });

    expect(visibleWakeBursts).toHaveLength(1);
    expect(visibleWakeBursts[0]!.progress).toBeCloseTo(0.625);
    expect(visibleWakeBursts[0]!.alpha).toBeCloseTo(0.875);
    expect(visibleWakeBursts[0]!.origin).toEqual({ x: 24, y: 8 });
    expect(visibleWakeBursts[0]!.burst.tick).toBe(11);
    expect(visibleWakeBursts[0]!.radius).toBe(22);
  });

  it("blends wake direction across overlapping bursts for the same planet", () => {
    const visibleWakeBursts = collectVisibleBoostWakeBursts({
      bursts: [
        {
          direction: { x: 1, y: 0 },
          origin: { x: 10, y: 0 },
          planetArchetype: "terra",
          planetId: 101,
          radius: 18,
          startedAtSec: 0,
          tick: 10,
        },
        {
          direction: { x: 0, y: 1 },
          origin: { x: 24, y: 8 },
          planetArchetype: "terra",
          planetId: 101,
          radius: 22,
          startedAtSec: 0.24,
          tick: 11,
        },
      ],
      nowSec: 0.3,
      planetsById: new Map(),
    });

    expect(visibleWakeBursts).toHaveLength(1);
    expect(visibleWakeBursts[0]!.direction.x).toBeCloseTo(0.394, 3);
    expect(visibleWakeBursts[0]!.direction.y).toBeCloseTo(0.919, 3);
    expect(visibleWakeBursts[0]!.direction.y).toBeGreaterThan(
      visibleWakeBursts[0]!.direction.x,
    );
  });

  it("uses the live direction override for the matching planet", () => {
    const visibleWakeBursts = collectVisibleBoostWakeBursts({
      bursts: [
        {
          direction: { x: 1, y: 0 },
          origin: { x: 10, y: 0 },
          planetArchetype: "terra",
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
      nowSec: 0.24,
      planetsById: new Map(),
    });

    expect(visibleWakeBursts).toHaveLength(1);
    expect(visibleWakeBursts[0]!.direction).toEqual({ x: 0, y: 1 });
  });

  it("keeps separate wakes for different planets", () => {
    const visibleWakeBursts = collectVisibleBoostWakeBursts({
      bursts: [
        {
          direction: { x: 1, y: 0 },
          origin: { x: 0, y: 0 },
          planetArchetype: "terra",
          planetId: 101,
          radius: 18,
          startedAtSec: 0.12,
          tick: 10,
        },
        {
          direction: { x: 0, y: 1 },
          origin: { x: 40, y: 20 },
          planetArchetype: "ignis",
          planetId: 202,
          radius: 20,
          startedAtSec: 0.18,
          tick: 11,
        },
      ],
      nowSec: 0.24,
      planetsById: new Map(),
    });

    expect(visibleWakeBursts).toHaveLength(2);
    expect(visibleWakeBursts.map((burst) => burst.burst.planetId)).toEqual([
      202, 101,
    ]);
  });
});

describe("getBoostWakeBendAmount", () => {
  it("returns negative bend for a left turn and positive bend for a right turn", () => {
    const leftTurnBend = getBoostWakeBendAmount({
      baseDirection: { x: 1, y: 0 },
      currentDirection: { x: 0, y: 1 },
      progress: 1,
    });
    const rightTurnBend = getBoostWakeBendAmount({
      baseDirection: { x: 1, y: 0 },
      currentDirection: { x: 0, y: -1 },
      progress: 1,
    });

    expect(leftTurnBend).toBeCloseTo(-1.18);
    expect(rightTurnBend).toBeCloseTo(1.18);
  });

  it("keeps the bend subtle early in the wake", () => {
    const earlyBend = getBoostWakeBendAmount({
      baseDirection: { x: 1, y: 0 },
      currentDirection: { x: 0, y: 1 },
      progress: 0,
    });

    expect(earlyBend).toBeCloseTo(-0.22);
  });
});

describe("getBoostWakeCurveOffset", () => {
  it("keeps the wake head fixed while the tail follows older aim", () => {
    const directionSamples = [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ] as const;

    expect(
      getBoostWakeCurveOffset({
        currentDirection: { x: 0, y: 1 },
        directionSamples,
        tailProgress: 0,
        wakeProgress: 1,
      }),
    ).toBe(0);

    expect(
      getBoostWakeCurveOffset({
        currentDirection: { x: 0, y: 1 },
        directionSamples,
        tailProgress: 1,
        wakeProgress: 1,
      }),
    ).toBeLessThan(-1);
  });
});
