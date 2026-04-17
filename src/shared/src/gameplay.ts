import { ARCHETYPES } from "./archetypes";
import {
  CACHE_SPEC,
  PLANET_HP,
  ROCKET_SPECS,
  SHIELD_EXT_MULTIPLIER,
  SHIELD_SPEC,
  WILDCARD_KINDS,
} from "./constants";
import type {
  ArchetypeId,
  CacheContents,
  PlanetPrivateAmmo,
  WildcardKind,
} from "./entities";

const SHIELD_LOAD_REFERENCE_DURATION_SEC = 4;

export const createInitialAmmo = (): PlanetPrivateAmmo => ({
  light: ROCKET_SPECS.light.startAmmo,
  heavy: ROCKET_SPECS.heavy.startAmmo,
  seeker: ROCKET_SPECS.seeker.startAmmo,
});

export const cloneCacheContents = (contents: CacheContents): CacheContents =>
  contents.kind === "wildcard"
    ? {
        kind: "wildcard",
        wildcard: { kind: contents.wildcard.kind },
      }
    : { kind: contents.kind };

export const rollWildcardKind = (rng: () => number): WildcardKind =>
  WILDCARD_KINDS[Math.floor(rng() * WILDCARD_KINDS.length)]!;

export const getBaseShieldLoad = (
  durationSec = SHIELD_SPEC.durationSec,
): number =>
  PLANET_HP * Math.max(0, durationSec / SHIELD_LOAD_REFERENCE_DURATION_SEC);

export const getShieldLoadCapacity = (
  archetypeId: ArchetypeId,
  extended = false,
  durationSec = SHIELD_SPEC.durationSec,
): number =>
  getBaseShieldLoad(durationSec) *
  ARCHETYPES[archetypeId].shieldDurationMultiplier *
  (extended ? SHIELD_EXT_MULTIPLIER : 1);

const SIMPLE_CACHE_KINDS: readonly CacheContents[] = [
  { kind: "heavyAmmo" },
  { kind: "seekerPack" },
  { kind: "repair" },
  { kind: "boostCharge" },
  { kind: "shieldExt" },
  { kind: "foresightExt" },
];

export const rollCacheContents = (rng: () => number): CacheContents => {
  if (rng() < CACHE_SPEC.wildcardChance) {
    return {
      kind: "wildcard",
      wildcard: { kind: rollWildcardKind(rng) },
    };
  }

  return cloneCacheContents(
    SIMPLE_CACHE_KINDS[Math.floor(rng() * SIMPLE_CACHE_KINDS.length)]!,
  );
};
