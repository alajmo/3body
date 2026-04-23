import type { ArchetypeId, PlanetArchetypeVisualSpec } from "@3body/shared";
import { getRuntimeTuningDocument } from "./runtimeTuning";

const getPlanetVisualTuning = () => getRuntimeTuningDocument().visuals.planets;

export const getPlanetArchetypeVisuals = (
  archetype: ArchetypeId,
): PlanetArchetypeVisualSpec => getPlanetVisualTuning().archetypes[archetype];

export const getPlanetBodyScaleForArchetype = (
  archetype: ArchetypeId,
): number => getPlanetArchetypeVisuals(archetype).bodyScale;

export const getRenderedPlanetRadius = <
  T extends {
    archetype: ArchetypeId;
    radius: number;
  },
>(
  planet: T,
): number => planet.radius;
