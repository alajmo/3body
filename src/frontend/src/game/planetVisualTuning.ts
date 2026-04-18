import type { ArchetypeId, PlanetArchetypeVisualSpec } from "@3body/shared";
import { getRuntimeTuningDocument } from "./runtimeTuning";

export const getPlanetVisualTuning = () => getRuntimeTuningDocument().visuals.planets;

export const getPlanetArchetypeVisuals = (
  archetype: ArchetypeId,
): PlanetArchetypeVisualSpec =>
  getPlanetVisualTuning().archetypes[archetype];

export const getPlanetBodyScaleForArchetype = (
  archetype: ArchetypeId,
): number => getPlanetArchetypeVisuals(archetype).bodyScale;

export const getPlanetAuraScaleForArchetype = (
  archetype: ArchetypeId,
): number => getPlanetArchetypeVisuals(archetype).auraScale;

export const getPlanetAuraGapForArchetype = (
  archetype: ArchetypeId,
): number => getPlanetArchetypeVisuals(archetype).auraGap;

export const getRenderedPlanetRadius = <T extends {
  archetype: ArchetypeId;
  radius: number;
}>(
  planet: T,
): number => planet.radius;
