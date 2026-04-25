import type { AbilitySpec, BlackHoleSpec, BoostSpec } from "@3body/shared";
import { BLACK_HOLE_SPEC, BOOST_SPEC, clamp, SHIELD_SPEC } from "@3body/shared";
import {
  DEFAULT_BOOST_SETTINGS,
  DEFAULT_CACHE_BADGE_SCALE,
} from "../viewportHud";

const PROFILING_ENABLED_STORAGE_KEY = "3body.profilingEnabled";

const BLACK_HOLE_SETTING_LIMITS = {
  killRadius: { max: 1_200, min: 1 },
  mass: { max: 50_000_000, min: 0 },
  rampSec: { max: 600, min: 1 },
  spawnSec: { max: 600, min: 0 },
} satisfies Record<keyof BlackHoleSpec, { min: number; max: number }>;

const CACHE_BADGE_SCALE_LIMITS = {
  max: 2.25,
  min: 0.5,
} as const;

const ABILITY_SETTING_LIMITS = {
  cooldownSec: { max: 60, min: 0 },
  durationSec: { max: 30, min: 0.25 },
} satisfies Record<keyof AbilitySpec, { min: number; max: number }>;

const BOOST_SETTING_LIMITS = {
  charges: { max: 5, min: 1 },
  cooldownSec: { max: 60, min: 0.25 },
  depleteSec: { max: 30, min: 0.05 },
  magnitude: { max: 4_000, min: 0 },
} satisfies Record<keyof BoostSpec, { min: number; max: number }>;

interface LoadedViewportSettings {
  profilingEnabled: boolean;
}

export const sanitizeProfilingEnabled = (value: unknown): boolean =>
  value === true;

const readStorageItem = (
  storage: Storage | null,
  key: string,
): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const persistStorageItem = (
  storage: Storage | null,
  key: string,
  value: string,
) => {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignore storage failures so the viewport still works in restricted contexts.
  }
};

export const sanitizeBlackHoleSettings = (
  value: Partial<BlackHoleSpec> | null | undefined,
): BlackHoleSpec => {
  const nextSettings = { ...BLACK_HOLE_SPEC };

  if (value === null || value === undefined) {
    return nextSettings;
  }

  for (const key of Object.keys(BLACK_HOLE_SETTING_LIMITS) as Array<
    keyof BlackHoleSpec
  >) {
    const candidate = value[key];
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
      continue;
    }

    const limits = BLACK_HOLE_SETTING_LIMITS[key];
    nextSettings[key] = clamp(candidate, limits.min, limits.max);
  }

  return nextSettings;
};

export const sanitizeAbilitySettings = (
  value: Partial<AbilitySpec> | null | undefined,
  defaults: AbilitySpec,
): AbilitySpec => {
  const nextSettings = { ...defaults };

  if (value === null || value === undefined) {
    return nextSettings;
  }

  for (const key of Object.keys(ABILITY_SETTING_LIMITS) as Array<
    keyof AbilitySpec
  >) {
    const candidate = value[key];
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
      continue;
    }

    const limits = ABILITY_SETTING_LIMITS[key];
    nextSettings[key] = clamp(candidate, limits.min, limits.max);
  }

  return nextSettings;
};

export const sanitizeBoostSettings = (
  value: Partial<BoostSpec> | null | undefined,
): BoostSpec => {
  const nextSettings = { ...DEFAULT_BOOST_SETTINGS };

  if (value === null || value === undefined) {
    return nextSettings;
  }

  for (const key of Object.keys(BOOST_SETTING_LIMITS) as Array<
    keyof BoostSpec
  >) {
    const candidate = value[key];
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
      continue;
    }

    const limits = BOOST_SETTING_LIMITS[key];
    nextSettings[key] =
      key === "charges"
        ? Math.round(clamp(candidate, limits.min, limits.max))
        : clamp(candidate, limits.min, limits.max);
  }

  return nextSettings;
};

export const sanitizeCacheBadgeScale = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? clamp(value, CACHE_BADGE_SCALE_LIMITS.min, CACHE_BADGE_SCALE_LIMITS.max)
    : DEFAULT_CACHE_BADGE_SCALE;

export const loadViewportSettings = (
  storage: Storage | null,
): LoadedViewportSettings => ({
  profilingEnabled: (() => {
    const storedValue = readStorageItem(storage, PROFILING_ENABLED_STORAGE_KEY);
    if (storedValue === null) {
      return false;
    }

    try {
      return sanitizeProfilingEnabled(JSON.parse(storedValue));
    } catch {
      return false;
    }
  })(),
});

export const persistProfilingEnabled = (
  storage: Storage | null,
  value: boolean,
) =>
  persistStorageItem(
    storage,
    PROFILING_ENABLED_STORAGE_KEY,
    JSON.stringify(value),
  );

export const applyAbilitySettingsToSpecs = (
  shieldSettings: AbilitySpec,
  boostSettings: BoostSpec,
) => {
  SHIELD_SPEC.cooldownSec = shieldSettings.cooldownSec;
  SHIELD_SPEC.durationSec = shieldSettings.durationSec;
  BOOST_SPEC.charges = boostSettings.charges;
  BOOST_SPEC.cooldownSec = boostSettings.cooldownSec;
  BOOST_SPEC.depleteSec = boostSettings.depleteSec;
  BOOST_SPEC.magnitude = boostSettings.magnitude;
};
