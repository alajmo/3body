import type { PlanetPublic, World } from "@3body/shared";
import { getSunVisualProfile } from "@3body/shared";
import type {
  CircleGeometry,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
} from "three/webgpu";
import { getNeutronStarAbsorptionExplosionRadius } from "../neutronStarAbsorption";
import type { getRuntimeTuningDocument } from "../runtimeTuning";
import {
  createPlanetGlowMaterial,
  createPlanetMaterial,
  createPlanetSpinAxis,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  getPlanetForestProfile,
} from "../showcaseVisuals";
import {
  type BlackHoleSwallowState,
  type BlackHoleSwallowVisual,
  queueBlackHoleSwallowEffect,
} from "./blackHoleVisuals";
import {
  createNeutronStarCoreMaterial,
  createNeutronStarHaloMaterial,
  createNeutronStarJetMaterial,
  createNeutronStarLensMaterial,
} from "./localViewportVisualFactories";
import {
  createSharedCombatNeutronStarVisual,
  createSharedCombatSunVisual,
  disposeSharedCombatNeutronStarVisual,
  disposeSharedCombatSunVisual,
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
  queueSharedCombatPlanetExplosion,
  type SharedCombatPlanetExplosionState,
  type SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";
import {
  createSharedCombatPlanetVisual,
  disposeSharedCombatPlanetVisual,
  type SharedCombatPlanetVisual as PlanetVisual,
  syncSharedCombatPlanetVisual,
} from "./sharedCombatPlanetVisuals";

interface AuthoritativeViewportCelestialSync {
  neutronStar: SharedCombatDynamicNeutronStarPresentationArgs<
    World["neutronStars"][number],
    NeutronStarVisual
  >;
  planet: SharedCombatDynamicPlanetPresentationArgs<PlanetPublic, PlanetVisual>;
  sun: SharedCombatDynamicSunPresentationArgs<World["suns"][number], SunVisual>;
}

export interface AuthoritativeViewportCelestialGeometry {
  glowGeometry: CircleGeometry;
  planetGeometry: SphereGeometry;
  ribbonGeometry: PlaneGeometry;
  sunGeometry: SphereGeometry;
  warpGeometry: RingGeometry;
}

interface AuthoritativeViewportCelestialMaps {
  neutronStarVisuals: Map<number, NeutronStarVisual>;
  planetVisuals: Map<number, PlanetVisual>;
  sunVisuals: Map<number, SunVisual>;
}

export interface AuthoritativeViewportCelestialPreviousState {
  previousNeutronStarsById: Map<number, SharedCombatTrackedNeutronStarBody>;
  previousSunBodiesById: Map<number, SharedCombatTrackedSunBody>;
}

interface AuthoritativeViewportCelestialEffects {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
}

interface BuildAuthoritativeViewportCelestialSyncParams {
  effects: AuthoritativeViewportCelestialEffects;
  geometries: AuthoritativeViewportCelestialGeometry;
  maps: AuthoritativeViewportCelestialMaps;
  nowSec: number;
  previousState: AuthoritativeViewportCelestialPreviousState;
  scene: Scene;
  tuning: ReturnType<typeof getRuntimeTuningDocument>;
  world: World | null;
}

export const buildAuthoritativeViewportCelestialSync = ({
  effects,
  geometries,
  maps,
  nowSec,
  previousState,
  scene,
  tuning,
  world,
}: BuildAuthoritativeViewportCelestialSyncParams): AuthoritativeViewportCelestialSync => ({
  sun: {
    blackHole: world?.blackHole ?? null,
    createVisual: ({ sun, sunProfile }) =>
      createSharedCombatSunVisual({
        createSunCoreMaterial,
        createSunGlowMaterial,
        createWarpMaterial,
        scene,
        sunGeometry: geometries.sunGeometry,
        sunId: sun.id,
        sunProfile,
        warpGeometry: geometries.warpGeometry,
      }),
    currentNeutronStars: world?.neutronStars ?? [],
    disposeVisual: disposeSharedCombatSunVisual,
    nowSec,
    onSunAbsorbedByNeutronStar: ({ neutronStar, sun, sunId }) => {
      queueSharedCombatPlanetExplosion({
        activePlanetExplosions: effects.activePlanetExplosions,
        inactivePlanetExplosionVisuals: effects.inactivePlanetExplosionVisuals,
        planet: {
          color: sun.color,
          deathReason: "sunCollision",
          id: sunId,
          pos: { x: sun.pos.x, y: sun.pos.y },
          radius: getNeutronStarAbsorptionExplosionRadius({
            neutronStarRadius: neutronStar.radius,
            sunRadius: sun.radius,
          }),
          vel: { x: sun.vel.x, y: sun.vel.y },
        },
        startedAtSec: nowSec,
      });
    },
    onSunSwallowedByBlackHole: ({ sun }) => {
      queueBlackHoleSwallowEffect({
        activeEffects: effects.activeBlackHoleSwallowEffects,
        color: sun.color,
        inactiveVisuals: effects.inactiveBlackHoleSwallowVisuals,
        radius: sun.radius,
        startedAtSec: nowSec,
        startPos: sun.pos,
        targetPos: world!.blackHole!.pos,
      });
    },
    previousNeutronStarsById: previousState.previousNeutronStarsById,
    previousSunsById: previousState.previousSunBodiesById,
    resolveSunProfile: ({ index }) =>
      getSunVisualProfile(tuning.visuals.suns, index),
    sunVisuals: maps.sunVisuals,
    suns: world?.suns ?? [],
    syncVisual: ({ index, sun, sunProfile, visual }) => {
      syncSharedCombatSunVisual({
        index,
        nowSec,
        sun,
        sunProfile,
        visual,
      });
    },
  },
  neutronStar: {
    createVisual: ({ neutronStar }) =>
      createSharedCombatNeutronStarVisual({
        createNeutronStarCoreMaterial,
        createNeutronStarHaloMaterial,
        createNeutronStarJetMaterial,
        createNeutronStarLensMaterial,
        glowGeometry: geometries.glowGeometry,
        neutronStarId: neutronStar.id,
        ribbonGeometry: geometries.ribbonGeometry,
        scene,
        sunGeometry: geometries.sunGeometry,
      }),
    disposeVisual: disposeSharedCombatNeutronStarVisual,
    neutronStarVisuals: maps.neutronStarVisuals,
    neutronStars: world?.neutronStars ?? [],
    nowSec,
    previousNeutronStarsById: previousState.previousNeutronStarsById,
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
      createSharedCombatPlanetVisual({
        archetypeVisuals: tuning.visuals.planets.archetypes[planet.archetype],
        createPlanetGlowMaterial,
        createPlanetMaterial,
        createPlanetSpinAxis,
        getPlanetForestProfile,
        glowGeometry: geometries.glowGeometry,
        planet,
        planetGeometry: geometries.planetGeometry,
        planetIndex: index,
        scene,
      }),
    disposeVisual: disposeSharedCombatPlanetVisual,
    planetVisuals: maps.planetVisuals,
    planets: world?.planets ?? [],
    syncVisual: ({ planet, visual }) => {
      syncSharedCombatPlanetVisual({
        archetypeVisuals: tuning.visuals.planets.archetypes[planet.archetype],
        invulnerable: (planet.invulnerableUntilTick ?? 0) > 0,
        nowSec,
        planetPosition: planet.pos,
        renderRadius: planet.radius,
        visual,
      });
    },
  },
});
