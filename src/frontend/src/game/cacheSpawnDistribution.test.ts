import {
  getOuterRingMax,
  getOuterRingMin,
  len,
  sampleCacheSpawnKinematics,
} from "@3body/shared";
import { describe, expect, it } from "vitest";

const TEST_ARENA_RADIUS = 2_000;

const createFixedRng = (values: readonly number[]) => {
  let index = 0;

  return () => {
    const value = values[index];
    index = Math.min(index + 1, values.length - 1);
    return value ?? 0;
  };
};

describe("sampleCacheSpawnKinematics", () => {
  it("splits cache spawns 50/50 between the center band and outer edge band", () => {
    const centerSpawn = sampleCacheSpawnKinematics({
      arenaRadius: TEST_ARENA_RADIUS,
      preferredAngleRad: 0,
      rng: createFixedRng([0.499, 0.5, 0.5, 0.5]),
    });
    const outerSpawn = sampleCacheSpawnKinematics({
      arenaRadius: TEST_ARENA_RADIUS,
      preferredAngleRad: 0,
      rng: createFixedRng([0.5, 0.5, 0.5, 0.5]),
    });

    expect(centerSpawn.band).toBe("center");
    expect(len(centerSpawn.pos)).toBeGreaterThanOrEqual(
      TEST_ARENA_RADIUS * 0.12,
    );
    expect(len(centerSpawn.pos)).toBeLessThanOrEqual(TEST_ARENA_RADIUS * 0.36);
    expect(len(centerSpawn.pos)).toBeLessThan(
      getOuterRingMin(TEST_ARENA_RADIUS),
    );

    expect(outerSpawn.band).toBe("outer");
    expect(len(outerSpawn.pos)).toBeGreaterThanOrEqual(
      getOuterRingMin(TEST_ARENA_RADIUS),
    );
    expect(len(outerSpawn.pos)).toBeLessThanOrEqual(
      getOuterRingMax(TEST_ARENA_RADIUS),
    );
  });

  it("preserves preferred initial cache angles while sampling the radial band", () => {
    const spawn = sampleCacheSpawnKinematics({
      arenaRadius: TEST_ARENA_RADIUS,
      preferredAngleRad: Math.PI / 2,
      rng: createFixedRng([0.25, 0, 0.5, 0.5]),
    });

    expect(spawn.angle).toBe(Math.PI / 2);
    expect(spawn.band).toBe("center");
    expect(spawn.pos.x).toBeCloseTo(0, 6);
    expect(spawn.pos.y).toBeGreaterThan(0);
  });
});
