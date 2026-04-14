import { CACHE_SPEC, ROCKET_SPECS, WILDCARD_KINDS } from "./constants";
import type {
  CacheContents,
  PlanetPrivateAmmo,
  WildcardKind,
} from "./entities";

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
