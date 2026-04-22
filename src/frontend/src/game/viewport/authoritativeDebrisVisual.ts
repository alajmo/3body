import type { AsteroidTier, Debris, PlanetPublic } from "@3body/shared";
import { getPlanetArchetypeVisuals } from "../planetVisualTuning";
import type { AmbientBoundaryDebrisVisual } from "./ambientBoundaryDebris";
import {
  syncSharedCombatDebrisPresentation,
  type SharedCombatDebrisVisualHost,
} from "./sharedCombatDebrisVisualSync";

const DEFAULT_DEBRIS_COLOR = "#d7f1ff";
const AUTHORITATIVE_BOUNDARY_ASTEROID_FALLOUT_TIERS = [
  "large",
  "small",
] as const satisfies readonly AsteroidTier[];

export const updateAuthoritativeDebrisVisual = ({
  boundaryDebrisVisual,
  debris,
  maxSamples,
  nowSec,
  planets,
  visual,
}: {
  boundaryDebrisVisual: AmbientBoundaryDebrisVisual;
  debris: readonly Debris[];
  maxSamples: number;
  nowSec: number;
  planets: readonly PlanetPublic[];
  visual: SharedCombatDebrisVisualHost;
}) => {
  const ownerColorByPlayerId = new Map(
    planets.map((planet) => [
      planet.playerId,
      getPlanetArchetypeVisuals(planet.archetype).color,
    ]),
  );

  syncSharedCombatDebrisPresentation({
    boundaryDebrisVisual,
    debris,
    falloutTiers: AUTHORITATIVE_BOUNDARY_ASTEROID_FALLOUT_TIERS,
    maxSamples,
    nowSec,
    resolvePointColor: (piece) =>
      piece.ownerPlayerId === undefined
        ? DEFAULT_DEBRIS_COLOR
        : (ownerColorByPlayerId.get(piece.ownerPlayerId) ??
          DEFAULT_DEBRIS_COLOR),
    visual,
  });
};
