import type {
  PlanetPublic,
  RocketKind,
  Vec2,
  World,
} from "@3body/shared";
import { getSunVisualProfile } from "@3body/shared";
import type {
  CircleGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
} from "three/webgpu";
import { getNeutronStarAbsorptionExplosionRadius } from "../neutronStarAbsorption";
import { getCannonWorldLayout } from "../rocketVisibility";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import {
  createPlanetGlowMaterial,
  createPlanetMaterial,
  createPlanetSpinAxis,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  getPlanetForestProfile,
} from "../showcaseVisuals";
import { buildAuthoritativeViewportFrameBundle } from "./authoritativeViewportFrameAdapter";
import type {
  AuthoritativeImpactBurstState,
  ImmediateCannonFlashState,
  ImmediateGravityPulseFeedbackState,
} from "./authoritativeCosmeticFeedback";
import {
  queueBlackHoleSwallowEffect,
  type BlackHoleSwallowState,
  type BlackHoleSwallowVisual,
} from "./blackHoleVisuals";
import {
  createCacheVisual as createSharedCacheVisual,
  getCacheIconKey as getSharedCacheIconKey,
  updateCacheVisualBadge as updateSharedCacheVisualBadge,
  type CacheSpriteAssets,
  type CacheVisual,
  type SharedCombatTrackedCacheBody,
} from "./cacheVisuals";
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
import type { SharedCombatTrackedRocketBody } from "./sharedCombatBlackHoleSwallowTracking";
import type {
  SharedCombatBoostBurstState,
  SharedCombatBoostBurstVisual,
} from "./sharedCombatBoostVisuals";
import type {
  SharedCombatTrackedNeutronStarBody,
  SharedCombatTrackedSunBody,
} from "./sharedCombatDynamicCelestialSync";
import {
  createNeutronStarCoreMaterial,
  createNeutronStarHaloMaterial,
  createNeutronStarJetMaterial,
  createNeutronStarLensMaterial,
} from "./localViewportVisualFactories";
import { pruneSharedCombatImpactBursts } from "./sharedCombatImpactBursts";
import type { SharedCombatLaunchBurstPoolVisual } from "./sharedCombatLaunchBurstPools";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";
import {
  queueSharedCombatPlanetExplosion,
  type SharedCombatPlanetExplosionState,
  type SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";
import {
  createSharedCombatPlanetTrailVisual,
  disposeSharedCombatPlanetTrailVisual,
  type SharedCombatPlanetTrailVisual as PlanetTrailVisual,
  pushSharedCombatPlanetTrailSample,
  updateSharedCombatPlanetTrailVisual,
} from "./sharedCombatPlanetTrails";
import {
  createSharedCombatPlanetVisual,
  disposeSharedCombatPlanetVisual,
  type SharedCombatPlanetVisual as PlanetVisual,
  syncSharedCombatPlanetVisual,
} from "./sharedCombatPlanetVisuals";
import type {
  SharedCombatPresentationFrameState,
} from "./sharedCombatPresentationFrame";
import type {
  SharedCombatRocketPoolVisual,
  SharedCombatRocketTrailState,
} from "./sharedCombatRocketPools";
import type {
  SharedCombatGravityPulseVisual as GravityPulseVisual,
  SharedCombatImpactBurstVisual as ImpactBurstVisual,
} from "./sharedCombatSceneResources";
import {
  syncSharedCombatScene,
  type SharedCombatSceneBackgroundSync,
} from "./sharedCombatSceneSync";
import type {
  SharedCombatCannonVisual,
  SharedCombatImmediateShieldFeedbackState,
  SharedCombatLockRingVisual,
  SharedCombatShieldVisual,
} from "./sharedCombatSupportVisuals";
import type { ViewportRenderQualityProfile } from "./renderQuality";

const AUTHORITATIVE_MAX_TRAIL_SAMPLES = 220;
const AUTHORITATIVE_TRAIL_POINT_SIZE = 12;
const AUTHORITATIVE_BLACK_HOLE_ROCKET_SWALLOW_COLOR = "#ffd7ac";
const AUTHORITATIVE_BLACK_HOLE_CACHE_SWALLOW_COLOR = "#fff0bb";
const AUTHORITATIVE_IMPACT_BURST_DURATION_SEC = 0.32;
const AUTHORITATIVE_IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC = 0.18;
const AUTHORITATIVE_IMMEDIATE_GRAVITY_PULSE_DURATION_SEC = 0.95;

interface AuthoritativeViewportSceneCameraState {
  visibleWorldHeight: number;
}

interface AuthoritativeViewportSceneGeometry {
  glowGeometry: CircleGeometry;
  planetGeometry: SphereGeometry;
  ribbonGeometry: PlaneGeometry;
  sunGeometry: SphereGeometry;
  warpGeometry: RingGeometry;
}

interface AuthoritativeViewportSceneMaps {
  neutronStarVisuals: Map<number, NeutronStarVisual>;
  planetTrails: Map<number, PlanetTrailVisual>;
  planetVisuals: Map<number, PlanetVisual>;
  sunVisuals: Map<number, SunVisual>;
}

interface AuthoritativeViewportScenePreviousState {
  previousCacheBodiesById: Map<number, SharedCombatTrackedCacheBody>;
  previousNeutronStarsById: Map<number, SharedCombatTrackedNeutronStarBody>;
  previousRocketBodiesById: Map<number, SharedCombatTrackedRocketBody>;
  previousSunBodiesById: Map<number, SharedCombatTrackedSunBody>;
}

interface AuthoritativeViewportSceneEffects {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activeBoostBursts: SharedCombatBoostBurstState[];
  activeCacheIds: Set<number>;
  activeImpactBursts: AuthoritativeImpactBurstState[];
  activeLaunchBurstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  impactBurstVisuals: readonly ImpactBurstVisual[];
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
}

interface AuthoritativeViewportSceneVisuals {
  blackHoleGroup: Group;
  blackHoleRing: Mesh;
  boostBurstVisual: SharedCombatBoostBurstVisual | null;
  cacheSpriteAssets: CacheSpriteAssets;
  cacheVisuals: Map<number, CacheVisual>;
  cannonVisual: SharedCombatCannonVisual | null;
  gravityPulseVisual: GravityPulseVisual | null;
  lockRingVisual: SharedCombatLockRingVisual | null;
  shieldVisual: SharedCombatShieldVisual | null;
}

interface AuthoritativeViewportSceneCombatState {
  boostHeld: boolean;
  controlsEnabled: boolean;
  currentSeekerLockProgress: number;
  currentSeekerLockTarget: PlanetPublic | null;
  gravityPulseFeedbackState: ImmediateGravityPulseFeedbackState | null;
  immediateCannonFlashState: ImmediateCannonFlashState | null;
  immediateShieldFeedbackState: SharedCombatImmediateShieldFeedbackState | null;
  playerId: string | null;
  playerPlanet: PlanetPublic | null;
  selectedRocketKind: RocketKind;
  viewportAimWorld: Vec2;
}

export interface UpdateAuthoritativeViewportSceneParams {
  authoritativePlanetsById: ReadonlyMap<number, PlanetPublic>;
  background: SharedCombatSceneBackgroundSync;
  cameraState: AuthoritativeViewportSceneCameraState;
  combat: AuthoritativeViewportSceneCombatState;
  effects: AuthoritativeViewportSceneEffects;
  geometries: AuthoritativeViewportSceneGeometry;
  hostElement: HTMLDivElement;
  maps: AuthoritativeViewportSceneMaps;
  previousState: AuthoritativeViewportScenePreviousState;
  renderQuality: ViewportRenderQualityProfile;
  rocketKinds: readonly RocketKind[];
  rocketLaunchBurstPools: Record<RocketKind, SharedCombatLaunchBurstPoolVisual> | null;
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual> | null;
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
  rocketsByKind: Record<RocketKind, Array<World["rockets"][number]>>;
  scene: Scene;
  tuning: ReturnType<typeof getRuntimeTuningDocument>;
  visuals: AuthoritativeViewportSceneVisuals;
  world: World | null;
}

export interface UpdateAuthoritativeViewportSceneResult {
  gravityPulse: ImmediateGravityPulseFeedbackState | null;
  immediateCannonFlashState: ImmediateCannonFlashState | null;
  shieldImmediateFeedback: SharedCombatImmediateShieldFeedbackState | null;
}

export const updateAuthoritativeViewportScene = ({
  authoritativePlanetsById,
  background,
  cameraState,
  combat,
  effects,
  geometries,
  hostElement,
  maps,
  previousState,
  renderQuality,
  rocketKinds,
  rocketLaunchBurstPools,
  rocketPools,
  rocketTrailStates,
  rocketsByKind,
  scene,
  tuning,
  visuals,
  world,
}: UpdateAuthoritativeViewportSceneParams): UpdateAuthoritativeViewportSceneResult => {
  const nowSec = background.nowSec;
  const worldUnitsPerPixel =
    cameraState.visibleWorldHeight / Math.max(1, hostElement.clientHeight);
  const cannonLayout = getCannonWorldLayout(
    tuning.visuals.cannon,
    worldUnitsPerPixel,
  );
  const authoritativeShieldActive =
    combat.playerPlanet?.shieldActive === true &&
    combat.playerPlanet.shieldLoad > 0;

  let immediateCannonFlashState = combat.immediateCannonFlashState;
  if (
    combat.controlsEnabled &&
    combat.playerPlanet !== null &&
    immediateCannonFlashState !== null &&
    nowSec - immediateCannonFlashState.startedAtSec >
      cannonLayout.flashDurationSec
  ) {
    immediateCannonFlashState = null;
  }

  let weaponFrame: SharedCombatPresentationFrameState["weapon"] = {
    cannon: null,
    lockRing: null,
  };
  if (
    combat.controlsEnabled &&
    combat.playerPlanet !== null &&
    !authoritativeShieldActive
  ) {
    weaponFrame = {
      cannon: {
        accent: tuning.visuals.rockets[combat.selectedRocketKind].hudAccent,
        aimTarget: combat.viewportAimWorld,
        flashAccent:
          immediateCannonFlashState === null
            ? null
            : tuning.visuals.rockets[immediateCannonFlashState.rocketKind]
                .hudAccent,
        flashAgeSec:
          immediateCannonFlashState === null
            ? null
            : nowSec - immediateCannonFlashState.startedAtSec,
        layout: cannonLayout,
        position: combat.playerPlanet.pos,
        surfaceOffset: combat.playerPlanet.radius,
        visible: true,
        z: 6,
      },
      lockRing:
        combat.selectedRocketKind === "seeker" &&
        combat.currentSeekerLockTarget !== null
          ? {
              baseRadius: combat.currentSeekerLockTarget.radius + 22,
              locked: combat.currentSeekerLockProgress >= 1,
              nowSec,
              position: combat.currentSeekerLockTarget.pos,
              progress: combat.currentSeekerLockProgress,
              z: 5.5,
            }
          : null,
    };
  }

  pruneSharedCombatImpactBursts({
    activeBursts: effects.activeImpactBursts,
    durationSec: AUTHORITATIVE_IMPACT_BURST_DURATION_SEC,
    nowSec,
  });

  const viewportFrameBundle = buildAuthoritativeViewportFrameBundle({
    runtime: {
      activeBoostBursts: effects.activeBoostBursts,
      activeImpactBursts: effects.activeImpactBursts,
      aimTarget: combat.viewportAimWorld,
      blackHole: world?.blackHole ?? null,
      boostBurstParticlesPerBurst: 32,
      boostHeld: combat.boostHeld,
      cannonLayout,
      currentPlayerId: combat.playerId,
      getPlanetById: (planetId: number) =>
        authoritativePlanetsById.get(planetId) ?? null,
      gravityPulseDurationSec:
        AUTHORITATIVE_IMMEDIATE_GRAVITY_PULSE_DURATION_SEC,
      gravityPulseState: combat.gravityPulseFeedbackState,
      immediateShieldFeedbackDurationSec:
        AUTHORITATIVE_IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC,
      nowSec,
      playerPlanet: combat.playerPlanet,
      previousCachesById: previousState.previousCacheBodiesById,
      previousRocketsById: previousState.previousRocketBodiesById,
      queueCacheSwallowEffect: (previousCache) => {
        queueBlackHoleSwallowEffect({
          activeEffects: effects.activeBlackHoleSwallowEffects,
          color: AUTHORITATIVE_BLACK_HOLE_CACHE_SWALLOW_COLOR,
          inactiveVisuals: effects.inactiveBlackHoleSwallowVisuals,
          radius: previousCache.radius * 1.25,
          startedAtSec: nowSec,
          startPos: previousCache.pos,
          targetPos: world!.blackHole!.pos,
        });
      },
      queueRocketSwallowEffect: (previousRocket) => {
        queueBlackHoleSwallowEffect({
          activeEffects: effects.activeBlackHoleSwallowEffects,
          color: AUTHORITATIVE_BLACK_HOLE_ROCKET_SWALLOW_COLOR,
          inactiveVisuals: effects.inactiveBlackHoleSwallowVisuals,
          radius: Math.max(previousRocket.radius * 2.8, 12),
          startedAtSec: nowSec,
          startPos: previousRocket.pos,
          targetPos: world!.blackHole!.pos,
        });
      },
      resolveImpactBurst: (burst) => {
        const targetPlanet = authoritativePlanetsById.get(burst.planetId) ?? null;
        const targetPos = targetPlanet?.pos ?? burst.targetPos;
        const targetRadius = targetPlanet?.radius ?? burst.radius;

        return {
          absorbedByShield: burst.absorbedByShield,
          durationSec: AUTHORITATIVE_IMPACT_BURST_DURATION_SEC,
          normal: burst.normal,
          startedAtSec: burst.startedAtSec,
          targetPos,
          targetRadius,
          targetRenderedRadius: targetRadius,
        };
      },
      shieldActive: authoritativeShieldActive,
      shieldImmediateFeedback: combat.immediateShieldFeedbackState,
      visibleWorldHeight: cameraState.visibleWorldHeight,
      weaponFrame,
      world,
      worldUnitsPerPixel,
    },
    sync: {
      activeBlackHoleSwallowEffects: effects.activeBlackHoleSwallowEffects,
      activeCacheIds: effects.activeCacheIds,
      activeLaunchBurstsByKind: effects.activeLaunchBurstsByKind,
      activePlanetExplosions: effects.activePlanetExplosions,
      badgeBaseSize: tuning.visuals.caches.badgeBaseSize,
      badgeMaterials: visuals.cacheSpriteAssets.badgeMaterials,
      badgeScale: tuning.visuals.caches.badgeScale,
      cacheVisuals: visuals.cacheVisuals,
      createCacheVisual: createSharedCacheVisual,
      getCacheIconKey: getSharedCacheIconKey,
      impactBurstVisuals: effects.impactBurstVisuals,
      inactiveBlackHoleSwallowVisuals: effects.inactiveBlackHoleSwallowVisuals,
      inactivePlanetExplosionVisuals:
        effects.inactivePlanetExplosionVisuals,
      launchBurstBudget: renderQuality.launchBurstBudget,
      launchBurstPools: rocketLaunchBurstPools,
      maxRocketTrailSamples: 9,
      presentationVisuals: {
        blackHole: {
          group: visuals.blackHoleGroup,
          ringMesh: visuals.blackHoleRing,
        },
        boost: visuals.boostBurstVisual,
        cannon: visuals.cannonVisual,
        gravityPulse: visuals.gravityPulseVisual,
        lockRing: visuals.lockRingVisual,
        shield: visuals.shieldVisual,
      },
      rocketKinds,
      rocketPools,
      rocketTrailBudget: renderQuality.rocketTrailBudget,
      rocketTrailStates,
      rocketsByKind,
      scene,
      updateCacheVisualBadge: updateSharedCacheVisualBadge,
    },
  });

  const presentationState = syncSharedCombatScene({
    background,
    celestial: {
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
            inactivePlanetExplosionVisuals:
              effects.inactivePlanetExplosionVisuals,
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
        createTrail: ({ planet }) => {
          const trail = createSharedCombatPlanetTrailVisual({
            maxTrailSamples: AUTHORITATIVE_MAX_TRAIL_SAMPLES,
            trailColor: tuning.visuals.planets.archetypes[planet.archetype]
              .trailColor,
            trailPointSize: AUTHORITATIVE_TRAIL_POINT_SIZE,
          });
          scene.add(trail.points);
          return trail;
        },
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
        disposeTrail: disposeSharedCombatPlanetTrailVisual,
        disposeVisual: disposeSharedCombatPlanetVisual,
        planetTrails: maps.planetTrails,
        planetVisuals: maps.planetVisuals,
        planets: world?.planets ?? [],
        syncTrail: ({ planet, trail }) => {
          pushSharedCombatPlanetTrailSample(
            trail,
            planet.pos,
            AUTHORITATIVE_MAX_TRAIL_SAMPLES,
          );
          updateSharedCombatPlanetTrailVisual(
            trail,
            AUTHORITATIVE_MAX_TRAIL_SAMPLES,
          );
        },
        syncVisual: ({ planet, visual }) => {
          syncSharedCombatPlanetVisual({
            archetypeVisuals: tuning.visuals.planets.archetypes[planet.archetype],
            nowSec,
            planetPosition: planet.pos,
            renderRadius: planet.radius,
            visual,
          });
        },
      },
    },
    viewport: {
      bundle: viewportFrameBundle,
      nowSec,
    },
  });

  return {
    gravityPulse: presentationState.gravityPulse,
    immediateCannonFlashState,
    shieldImmediateFeedback: presentationState.shieldImmediateFeedback,
  };
};
