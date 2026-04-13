export type Rng = () => number;

export interface WeightedPickEntry<T> {
  item: T;
  weight: number;
}

export const mulberry32 = (seed: number): Rng => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const nextFloat = (rng: Rng, min = 0, max = 1): number => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new RangeError("nextFloat bounds must be finite numbers");
  }

  if (max < min) {
    throw new RangeError("nextFloat max must be greater than or equal to min");
  }

  return min + rng() * (max - min);
};

export const nextInt = (rng: Rng, min: number, max: number): number => {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new RangeError("nextInt bounds must be integers");
  }

  if (max < min) {
    throw new RangeError("nextInt max must be greater than or equal to min");
  }

  return Math.floor(nextFloat(rng, min, max + 1));
};

export const pick = <T>(rng: Rng, arr: readonly T[]): T => {
  if (arr.length === 0) {
    throw new RangeError("Cannot pick from an empty array");
  }

  return arr[nextInt(rng, 0, arr.length - 1)] as T;
};

export const weightedPick = <T>(
  rng: Rng,
  weightedArr: readonly WeightedPickEntry<T>[],
): T => {
  const candidates = weightedArr.filter((entry) => entry.weight > 0);
  if (candidates.length === 0) {
    throw new RangeError("weightedPick requires at least one positive weight");
  }

  const totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = nextFloat(rng, 0, totalWeight);

  for (const entry of candidates) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.item;
    }
  }

  return candidates[candidates.length - 1]!.item;
};
