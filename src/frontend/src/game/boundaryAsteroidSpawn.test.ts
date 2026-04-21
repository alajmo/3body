import {
  createBoundaryAsteroidSpawn,
  dot,
  getBoundaryAsteroidDamage,
  len,
  sampleBoundaryAsteroidSpawnCount,
  type ArenaAsteroidFieldTuning,
} from "@3body/shared";
import { describe, expect, it } from "vitest";

const createFixedRng = (values: readonly number[]) => {
  let index = 0;

  return () => {
    const value = values[index];
    index = Math.min(index + 1, values.length - 1);
    return value ?? 0;
  };
};

const createAsteroidFieldTuning = ({
  randomization,
  spawnRatePerSec = 1,
}: {
  randomization: number;
  spawnRatePerSec?: number;
}): ArenaAsteroidFieldTuning => ({
  large: { damage: 1, randomization, spawnRatePerSec },
  micro: { damage: 1, randomization, spawnRatePerSec },
  small: { damage: 1, randomization, spawnRatePerSec },
});

const getRadialVelocityAlignment = (
  randomization: number,
  rngValues: readonly number[],
) => {
  const spawn = createBoundaryAsteroidSpawn({
    arenaRadius: 15000,
    rng: createFixedRng(rngValues),
    tier: "small",
    tuning: createAsteroidFieldTuning({ randomization }),
  });

  return dot(spawn.pos, spawn.vel) / (len(spawn.pos) * len(spawn.vel));
};

describe("createBoundaryAsteroidSpawn", () => {
  it("makes higher inward-drift tuning produce stronger inward motion", () => {
    const rngValues = [0, 0, 0.25, 0.5] as const;
    const lowRandomizationAlignment = getRadialVelocityAlignment(
      0.1,
      rngValues,
    );
    const highRandomizationAlignment = getRadialVelocityAlignment(1, rngValues);

    expect(lowRandomizationAlignment).toBeGreaterThan(-0.25);
    expect(highRandomizationAlignment).toBeLessThan(-0.95);
    expect(highRandomizationAlignment).toBeLessThan(lowRandomizationAlignment);
  });

  it("scales travel budget with the live arena size so asteroids can cross inward", () => {
    const spawn = createBoundaryAsteroidSpawn({
      arenaRadius: 15_000,
      rng: createFixedRng([0, 0, 0.25, 0.5]),
      tier: "small",
      tuning: createAsteroidFieldTuning({ randomization: 1 }),
    });

    expect(len(spawn.vel)).toBeGreaterThan(1_200);
    expect(len(spawn.vel) * spawn.ttlSec).toBeGreaterThan(15_000 * 2);
  });

  it("uses per-tier spawn-rate tuning without changing non-zero drift shape", () => {
    const lowRate = sampleBoundaryAsteroidSpawnCount({
      dtSec: 10,
      rng: createFixedRng([0]),
      tier: "small",
      tuning: createAsteroidFieldTuning({
        randomization: 0.25,
        spawnRatePerSec: 0.2,
      }),
    });
    const highRate = sampleBoundaryAsteroidSpawnCount({
      dtSec: 10,
      rng: createFixedRng([0]),
      tier: "small",
      tuning: createAsteroidFieldTuning({
        randomization: 0.25,
        spawnRatePerSec: 1.4,
      }),
    });

    expect(lowRate).toBe(2);
    expect(highRate).toBe(14);
  });
});

describe("getBoundaryAsteroidDamage", () => {
  it("applies damage for every asteroid tier", () => {
    const tuning: ArenaAsteroidFieldTuning = {
      large: { damage: 6.5, randomization: 1, spawnRatePerSec: 0.12 },
      micro: { damage: 0.4, randomization: 1, spawnRatePerSec: 2.8 },
      small: { damage: 1.6, randomization: 1, spawnRatePerSec: 0.55 },
    };

    expect(getBoundaryAsteroidDamage("micro", tuning)).toBe(1);
    expect(getBoundaryAsteroidDamage("small", tuning)).toBe(1.6);
    expect(getBoundaryAsteroidDamage("large", tuning)).toBe(6.5);
  });
});
