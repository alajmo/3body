import {
  advanceWorldOrbitStarMotion,
  clampOrbitPatternDistanceScale,
  EDITOR_FIXED_ORBIT_PATTERNS,
  getOrbitPatternDistanceScaleAtElapsedSec,
  getOrbitPatternMinimumDistanceScale,
  getOrbitPatternTrack,
  sampleOrbitPatternTrack,
  stepSunsWithOrbitMotion,
} from "@3body/shared";
import { describe, expect, it } from "vitest";

describe("orbitPatternTracks", () => {
  it("builds looping tracks for every validated fixed pattern", () => {
    expect(EDITOR_FIXED_ORBIT_PATTERNS.length).toBeGreaterThan(2);

    for (const pattern of EDITOR_FIXED_ORBIT_PATTERNS) {
      const track = getOrbitPatternTrack(pattern.id);

      expect(track.patternId).toBe(pattern.id);
      expect(track.periodSec).toBeGreaterThan(1);
      expect(track.samples.length).toBeGreaterThan(8);

      const first = sampleOrbitPatternTrack(track, 0);
      const wrapped = sampleOrbitPatternTrack(track, track.periodSec);

      first.forEach((sun, index) => {
        expect(wrapped[index]!.pos.x).toBeCloseTo(sun.pos.x, 6);
        expect(wrapped[index]!.pos.y).toBeCloseTo(sun.pos.y, 6);
        expect(wrapped[index]!.vel.x).toBeCloseTo(sun.vel.x, 6);
        expect(wrapped[index]!.vel.y).toBeCloseTo(sun.vel.y, 6);
      });
    }
  });

  it("steps active suns from fixed-pattern world motion without respawning filtered ids", () => {
    const pattern = EDITOR_FIXED_ORBIT_PATTERNS[0]!;
    const track = getOrbitPatternTrack(pattern.id);
    const initial = sampleOrbitPatternTrack(track, 0);
    const suns = [
      {
        id: 101,
        kind: "sun" as const,
        mass: pattern.canonicalMass,
        radius: pattern.canonicalRadius,
        pos: { x: initial[0]!.pos.x, y: initial[0]!.pos.y },
        vel: { x: initial[0]!.vel.x, y: initial[0]!.vel.y },
      },
      {
        id: 303,
        kind: "sun" as const,
        mass: pattern.canonicalMass,
        radius: pattern.canonicalRadius,
        pos: { x: initial[2]!.pos.x, y: initial[2]!.pos.y },
        vel: { x: initial[2]!.vel.x, y: initial[2]!.vel.y },
      },
    ];
    const orbitStarMotion = {
      mode: "fixedPattern" as const,
      elapsedSec: 0,
      patternId: pattern.id,
      speed: 1,
      baseDistanceScale: 1.5,
      distanceScale: 1.5,
      sunIds: [101, 202, 303] as [number, number, number],
    };

    const nextSuns = stepSunsWithOrbitMotion(
      suns,
      track.sampleDtSec,
      undefined,
      orbitStarMotion,
    );
    const nextMotion = advanceWorldOrbitStarMotion(
      orbitStarMotion,
      track.sampleDtSec,
      suns,
    );

    expect(nextSuns).toHaveLength(2);
    expect(nextSuns.map((sun) => sun.id)).toEqual([101, 303]);
    const sampledScaled = sampleOrbitPatternTrack(
      track,
      track.sampleDtSec,
      1,
      1.5,
    );
    expect(nextSuns[0]!.pos.x).toBeCloseTo(sampledScaled[0]!.pos.x, 6);
    expect(nextSuns[0]!.pos.y).toBeCloseTo(sampledScaled[0]!.pos.y, 6);
    expect(nextMotion?.elapsedSec).toBeCloseTo(track.sampleDtSec, 6);
  });

  it("shrinks fixed-pattern distance scale all the way to the center after spawn", () => {
    const suns = [{ radius: 180 }, { radius: 180 }, { radius: 180 }] as const;
    const blackHoleSpec = {
      mass: 1,
      killRadius: 1,
      spawnSec: 12,
      rampSec: 18,
    };
    const baseDistanceScale =
      getOrbitPatternMinimumDistanceScale("equilateral-circle", suns) + 0.9;

    const beforeSpawn = getOrbitPatternDistanceScaleAtElapsedSec(
      "equilateral-circle",
      baseDistanceScale,
      suns,
      blackHoleSpec.spawnSec - 0.01,
      blackHoleSpec,
    );
    const midway = getOrbitPatternDistanceScaleAtElapsedSec(
      "equilateral-circle",
      baseDistanceScale,
      suns,
      blackHoleSpec.spawnSec + blackHoleSpec.rampSec / 2,
      blackHoleSpec,
    );
    const fullyCollapsed = getOrbitPatternDistanceScaleAtElapsedSec(
      "equilateral-circle",
      baseDistanceScale,
      suns,
      blackHoleSpec.spawnSec + blackHoleSpec.rampSec,
      blackHoleSpec,
    );

    expect(beforeSpawn).toBeCloseTo(baseDistanceScale, 6);
    expect(midway).toBeLessThan(baseDistanceScale);
    expect(midway).toBeGreaterThan(0);
    expect(fullyCollapsed).toBeCloseTo(0, 6);
  });

  it("builds a stable equilateral circle track", () => {
    const track = getOrbitPatternTrack("equilateral-circle");
    const start = sampleOrbitPatternTrack(track, 0);
    const quarterTurn = sampleOrbitPatternTrack(track, track.periodSec / 4);

    expect(track.periodSec).toBeGreaterThan(1);
    expect(start[0]!.pos.x).toBeCloseTo(quarterTurn[0]!.pos.y, 2);
    expect(start[0]!.pos.y).toBeCloseTo(-quarterTurn[0]!.pos.x, 2);
  });

  it("exposes the curated analytic fixed patterns in the editor set", () => {
    const patternIds = EDITOR_FIXED_ORBIT_PATTERNS.map((pattern) => pattern.id);

    expect(patternIds).toContain("figure-eight-v1a");
    expect(patternIds).toContain("equilateral-circle");
    expect(patternIds).toContain("lagrange-ellipse");
    expect(patternIds).toContain("clover-3");
    expect(patternIds).toContain("sunflower-5");
    expect(patternIds).toContain("daisy-6");
    expect(patternIds).toContain("lotus-twin");
    expect(patternIds).toContain("crown-orbit");
    expect(patternIds).not.toContain("euler-collinear");
    expect(patternIds).not.toContain("moth-i-iva2a");
    expect(patternIds).not.toContain("moth-ii-iva4a");
    expect(patternIds).not.toContain("dragonfly-ii4a");
  });

  it("clamps fixed-pattern distance scale high enough to prevent sun overlap", () => {
    const suns = [{ radius: 800 }, { radius: 800 }, { radius: 800 }] as const;
    const minimumScale = getOrbitPatternMinimumDistanceScale(
      "equilateral-circle",
      suns,
    );

    expect(minimumScale).toBeGreaterThan(0.5);
    expect(
      clampOrbitPatternDistanceScale("equilateral-circle", 0.5, suns),
    ).toBeCloseTo(minimumScale, 6);
  });

  it("keeps the synthetic flower loops separated at the default editor sun size", () => {
    const suns = [{ radius: 32 }, { radius: 32 }, { radius: 32 }] as const;

    for (const patternId of [
      "clover-3",
      "sunflower-5",
      "daisy-6",
      "lotus-twin",
      "crown-orbit",
    ] as const) {
      expect(
        getOrbitPatternMinimumDistanceScale(patternId, suns),
      ).toBeLessThanOrEqual(1);
    }
  });
});
