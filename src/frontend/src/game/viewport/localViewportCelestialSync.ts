import type { SunVisualProfile } from "@3body/shared";
import { getSunVisualProfile } from "@3body/shared";
import type { CombatSandboxPlanet, CombatSandboxState } from "../combatSandbox";
import {
  getPlanetArchetypeVisuals,
  getRenderedPlanetRadius,
} from "../planetVisualTuning";
import type { getRuntimeTuningDocument } from "../runtimeTuning";
import type {
  BlackHoleSwallowState,
  BlackHoleSwallowVisual,
} from "./blackHoleVisuals";
import { queueBlackHoleSwallowEffect } from "./blackHoleVisuals";
import type { SharedCombatTrackedRocketBody } from "./sharedCombatBlackHoleSwallowTracking";
import type { SharedCombatTrackedCacheBody } from "./cacheVisuals";
import {
  type SharedCombatNeutronStarVisual as NeutronStarVisual,
  type SharedCombatSunVisual as SunVisual,
  syncSharedCombatNeutronStarVisual,
  syncSharedCombatSunVisual,
} from "./sharedCombatCelestialVisuals";
import type {
  SharedCombatDynamicNeutronStarPresentationArgs,
  SharedCombatDynamicPlanetPresentationArgs,
  SharedCombatDynamicSunPresentationArgs,
  SharedCombatTrackedNeutronStarBody,
  SharedCombatTrackedSunBody,
} from "./sharedCombatDynamicCelestialSync";
import {
  type SharedCombatPlanetVisual as PlanetVisual,
  syncSharedCombatPlanetVisual,
} from "./sharedCombatPlanetVisuals";

export interface LocalViewportCombatBlackHoleSwallowTracker {
  previousCachesById: Map<number, SharedCombatTrackedCacheBody>;
  previousNeutronStarsById: Map<number, SharedCombatTrackedNeutronStarBody>;
  previousPlanetAliveById: Map<number, boolean>;
  previousRocketsById: Map<number, SharedCombatTrackedRocketBody>;
  previousSunsById: Map<number, SharedCombatTrackedSunBody>;
  previousSunSwallowedAtById: Map<number, number | null>;
}

interface LocalViewportCelestialSync {
  neutronStar: SharedCombatDynamicNeutronStarPresentationArgs<
    CombatSandboxState["neutronStars"][number],
    NeutronStarVisual
  >;
  planet: SharedCombatDynamicPlanetPresentationArgs<
    CombatSandboxPlanet,
    PlanetVisual
  >;
  sun: SharedCombatDynamicSunPresentationArgs<
    CombatSandboxState["suns"][number],
    SunVisual
  >;
}

interface BuildLocalViewportCelestialSyncParams {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  blackHole: CombatSandboxState["blackHole"];
  blackHoleSwallowTracker: LocalViewportCombatBlackHoleSwallowTracker;
  createNeutronStarVisual: (args: {
    neutronStar: CombatSandboxState["neutronStars"][number];
  }) => NeutronStarVisual;
  createPlanetVisual: (args: {
    index: number;
    planet: CombatSandboxPlanet;
  }) => PlanetVisual;
  createSunVisual: (args: {
    index: number;
    sun: CombatSandboxState["suns"][number];
    sunProfile?: SunVisualProfile;
  }) => SunVisual;
  disposeNeutronStarVisual: (visual: NeutronStarVisual) => void;
  disposePlanetVisual: (visual: PlanetVisual) => void;
  disposeSunVisual: (visual: SunVisual) => void;
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  neutronStarVisuals: Map<number, NeutronStarVisual>;
  nowSec: number;
  planetVisuals: Map<number, PlanetVisual>;
  renderState: CombatSandboxState;
  tuning: ReturnType<typeof getRuntimeTuningDocument>;
  sunVisuals: Map<number, SunVisual>;
}

export const buildLocalViewportCelestialSync = ({
  activeBlackHoleSwallowEffects,
  blackHole,
  blackHoleSwallowTracker,
  createNeutronStarVisual,
  createPlanetVisual,
  createSunVisual,
  disposeNeutronStarVisual,
  disposePlanetVisual,
  disposeSunVisual,
  inactiveBlackHoleSwallowVisuals,
  neutronStarVisuals,
  nowSec,
  planetVisuals,
  renderState,
  tuning,
  sunVisuals,
}: BuildLocalViewportCelestialSyncParams): LocalViewportCelestialSync => ({
  sun: {
    blackHole,
    createVisual: ({ index, sun, sunProfile }) =>
      createSunVisual({
        index,
        sun,
        sunProfile,
      }),
    currentNeutronStars: renderState.neutronStars,
    disposeVisual: disposeSunVisual,
    nowSec,
    onSunAbsorbedByNeutronStar: () => {},
    onSunStartedBlackHoleSwallow: ({ sun, sunProfile }) => {
      if (blackHole === null) {
        return;
      }

      queueBlackHoleSwallowEffect({
        activeEffects: activeBlackHoleSwallowEffects,
        color: sunProfile.glowColor,
        inactiveVisuals: inactiveBlackHoleSwallowVisuals,
        radius: sun.radius,
        startedAtSec: nowSec,
        startPos: sun.pos,
        targetPos: blackHole.pos,
      });
    },
    onSunSwallowedByBlackHole: () => {},
    previousNeutronStarsById: blackHoleSwallowTracker.previousNeutronStarsById,
    previousSunSwallowedAtById:
      blackHoleSwallowTracker.previousSunSwallowedAtById,
    previousSunsById: blackHoleSwallowTracker.previousSunsById,
    resolveSunProfile: ({ index }) =>
      getSunVisualProfile(tuning.visuals.suns, index),
    resolveSwallowedAtSec: ({ sun }) => sun.swallowedAtSec,
    sunVisuals,
    suns: renderState.suns,
    syncVisual: ({ index, sun, sunProfile, swallowedAtSec, visual }) => {
      syncSharedCombatSunVisual({
        index,
        nowSec,
        sun,
        sunProfile,
        swallowedAtSec,
        visual,
      });
    },
  },
  neutronStar: {
    createVisual: ({ neutronStar }) =>
      createNeutronStarVisual({
        neutronStar,
      }),
    disposeVisual: disposeNeutronStarVisual,
    neutronStarVisuals,
    neutronStars: renderState.neutronStars,
    nowSec,
    previousNeutronStarsById: blackHoleSwallowTracker.previousNeutronStarsById,
    syncVisual: ({ index, neutronStar, visual }) => {
      syncSharedCombatNeutronStarVisual({
        gameplayTuning: tuning.gameplay.neutronStars,
        index,
        nowSec,
        neutronStar,
        visual,
        visualTuning: tuning.visuals.neutronStars,
      });
    },
  },
  planet: {
    createVisual: ({ index, planet }) =>
      createPlanetVisual({
        index,
        planet,
      }),
    disposeVisual: disposePlanetVisual,
    onPlanetStartedBlackHoleSwallow: ({ planet }) => {
      if (blackHole === null) {
        return;
      }

      queueBlackHoleSwallowEffect({
        activeEffects: activeBlackHoleSwallowEffects,
        color: planet.color,
        inactiveVisuals: inactiveBlackHoleSwallowVisuals,
        radius: getRenderedPlanetRadius(planet),
        startedAtSec: nowSec,
        startPos: planet.pos,
        targetPos: blackHole.pos,
      });
    },
    planetVisuals,
    planets: renderState.planets,
    previousPlanetAliveById: blackHoleSwallowTracker.previousPlanetAliveById,
    resolveAlive: ({ planet }) => planet.alive,
    shouldTriggerBlackHoleSwallow: ({ planet }) =>
      planet.deathReason === "blackHole",
    syncVisual: ({ alive, planet, visual }) => {
      const planetVisualTuning = getPlanetArchetypeVisuals(planet.archetype);
      syncSharedCombatPlanetVisual({
        archetypeVisuals: planetVisualTuning,
        nowSec,
        planetPosition: planet.pos,
        renderRadius: getRenderedPlanetRadius(planet),
        visual,
        visible: alive,
      });
    },
  },
});
