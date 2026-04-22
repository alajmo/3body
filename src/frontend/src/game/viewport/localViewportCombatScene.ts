import type { RocketKind, SunVisualProfile, Vec2 } from "@3body/shared";
import { FIXED_STEP_SEC, getSunVisualProfile } from "@3body/shared";
import type { Group, Mesh } from "three/webgpu";
import type {
  CombatSandboxCache,
  CombatSandboxPlanet,
  CombatSandboxRocket,
  CombatSandboxState,
} from "../combatSandbox";
import {
  getPlanetArchetypeVisuals,
  getRenderedPlanetRadius,
} from "../planetVisualTuning";
import { getCannonWorldLayout } from "../rocketVisibility";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import type {
  CacheIconKey,
  CacheSpriteAssets,
  CacheVisual,
  SharedCombatTrackedCacheBody,
} from "./cacheVisuals";
import { queueBlackHoleSwallowEffect, type BlackHoleSwallowState, type BlackHoleSwallowVisual } from "./blackHoleVisuals";
import type { LocalSandboxGravityPulseState } from "./localSandboxSimulation";
import { getLocalSandboxLockProgress } from "./localSandboxSimulation";
import { getLocalViewportControlledBody, type LocalViewportCameraState } from "./localViewportCamera";
import { buildLocalViewportFrameBundle } from "./localViewportFrameAdapter";
import type { ViewportRenderQualityProfile } from "./renderQuality";
import type { SharedCombatTrackedRocketBody } from "./sharedCombatBlackHoleSwallowTracking";
import type {
  SharedCombatBoostBurstState,
  SharedCombatBoostBurstVisual,
} from "./sharedCombatBoostVisuals";
import {
  type SharedCombatNeutronStarVisual as NeutronStarVisual,
  type SharedCombatSunVisual as SunVisual,
  syncSharedCombatNeutronStarVisual,
  syncSharedCombatSunVisual,
} from "./sharedCombatCelestialVisuals";
import type {
  SharedCombatTrackedNeutronStarBody,
  SharedCombatTrackedSunBody,
} from "./sharedCombatDynamicCelestialSync";
import type { SharedCombatLaunchBurstPoolVisual } from "./sharedCombatLaunchBurstPools";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";
import type {
  SharedCombatPlanetExplosionState,
  SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";
import type { SharedCombatPlanetTrailVisual as TrailVisual } from "./sharedCombatPlanetTrails";
import {
  type SharedCombatPlanetVisual as PlanetVisual,
  syncSharedCombatPlanetVisual,
} from "./sharedCombatPlanetVisuals";
import type { SharedCombatPresentationFrameState } from "./sharedCombatPresentationFrame";
import type {
  SharedCombatCannonVisual,
  SharedCombatLockRingVisual,
  SharedCombatShieldVisual,
} from "./sharedCombatSupportVisuals";
import type {
  SharedCombatGravityPulseVisual as GravityPulseVisual,
  SharedCombatImpactBurstVisual as ImpactBurstVisual,
} from "./sharedCombatSceneResources";
import {
  syncSharedCombatScene,
  type SharedCombatSceneBackgroundSync,
} from "./sharedCombatSceneSync";
import type { SharedCombatRocketPoolVisual, SharedCombatRocketTrailState } from "./sharedCombatRocketPools";

const LOCAL_VIEWPORT_BLACK_HOLE_ROCKET_SWALLOW_COLOR = "#ffd7ac";
const LOCAL_VIEWPORT_BLACK_HOLE_CACHE_SWALLOW_COLOR = "#fff0bb";

interface LocalViewportCombatCannonFireState {
  flashStartSec: number;
  lastAmmo: Record<RocketKind, number>;
}

interface LocalViewportCombatBlackHoleSwallowTracker {
  previousCachesById: Map<number, SharedCombatTrackedCacheBody>;
  previousNeutronStarsById: Map<number, SharedCombatTrackedNeutronStarBody>;
  previousPlanetAliveById: Map<number, boolean>;
  previousRocketsById: Map<number, SharedCombatTrackedRocketBody>;
  previousSunsById: Map<number, SharedCombatTrackedSunBody>;
  previousSunSwallowedAtById: Map<number, number | null>;
}

export interface UpdateLocalViewportCombatSceneParams {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activeBoostBursts: SharedCombatBoostBurstState[];
  activeCacheIds: Set<number>;
  activeGravityPulse: LocalSandboxGravityPulseState | null;
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  background: SharedCombatSceneBackgroundSync;
  blackHoleGroup: Group;
  blackHoleRing: Mesh;
  blackHoleSwallowTracker: LocalViewportCombatBlackHoleSwallowTracker;
  boostBurstParticlesPerBurst: number;
  boostBurstVisual: SharedCombatBoostBurstVisual;
  cacheBadgeScale: number;
  cacheSpriteAssets: CacheSpriteAssets;
  cacheVisuals: Map<number, CacheVisual>;
  cameraState: Pick<LocalViewportCameraState, "visibleWorldHeight">;
  cannonFireState: LocalViewportCombatCannonFireState;
  cannonVisual: SharedCombatCannonVisual;
  controlsEnabled: boolean;
  createCacheVisual: (
    cache: CombatSandboxCache,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
  ) => CacheVisual;
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
  createTrailVisual: (args: { planet: CombatSandboxPlanet }) => TrailVisual;
  currentState: CombatSandboxState;
  disposeCacheVisual: (visual: CacheVisual) => void;
  disposeNeutronStarVisual: (visual: NeutronStarVisual) => void;
  disposePlanetVisual: (visual: PlanetVisual) => void;
  disposeSunVisual: (visual: SunVisual) => void;
  disposeTrailVisual: (trail: TrailVisual) => void;
  getCacheIconKey: (contents: CombatSandboxCache["contents"]) => CacheIconKey;
  gravityPulseDurationSec: number;
  gravityPulseVisual: GravityPulseVisual;
  hostElement: HTMLDivElement;
  impactBurstVisuals: readonly ImpactBurstVisual[];
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
  inputState: {
    aimWorld: Vec2;
    selectedRocketKind: RocketKind;
  };
  launchBurstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  lockRingVisual: SharedCombatLockRingVisual;
  maxRocketTrailSamples: number;
  maxVisibleImpactBursts: number;
  playerBoostHeld: boolean;
  playerPlanet: CombatSandboxPlanet | null;
  renderPlanetsById: ReadonlyMap<number, CombatSandboxPlanet>;
  renderQuality: ViewportRenderQualityProfile;
  renderState: CombatSandboxState;
  renderedCacheKeysById: Map<number, CacheIconKey>;
  rocketLaunchBurstPools: Record<RocketKind, SharedCombatLaunchBurstPoolVisual>;
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual>;
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
  rocketsByKind: Record<RocketKind, CombatSandboxRocket[]>;
  scene: {
    add: (object: CacheVisual["group"]) => void;
    remove: (object: CacheVisual["group"]) => void;
  };
  shieldVisual: SharedCombatShieldVisual;
  sunVisuals: Map<number, SunVisual>;
  neutronStarVisuals: Map<number, NeutronStarVisual>;
  planetVisuals: Map<number, PlanetVisual>;
  trailVisuals: Map<number, TrailVisual>;
  updateCacheVisualBadge: (
    visual: CacheVisual,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
    key: CacheIconKey,
  ) => void;
  weaponKinds: readonly RocketKind[];
}

export const updateLocalViewportCombatScene = ({
  activeBlackHoleSwallowEffects,
  activeBoostBursts,
  activeCacheIds,
  activeGravityPulse,
  activePlanetExplosions,
  background,
  blackHoleGroup,
  blackHoleRing,
  blackHoleSwallowTracker,
  boostBurstParticlesPerBurst,
  boostBurstVisual,
  cacheBadgeScale,
  cacheSpriteAssets,
  cacheVisuals,
  cameraState,
  cannonFireState,
  cannonVisual,
  controlsEnabled,
  createCacheVisual,
  createNeutronStarVisual,
  createPlanetVisual,
  createSunVisual,
  createTrailVisual,
  currentState,
  disposeCacheVisual,
  disposeNeutronStarVisual,
  disposePlanetVisual,
  disposeSunVisual,
  disposeTrailVisual,
  getCacheIconKey,
  gravityPulseDurationSec,
  gravityPulseVisual,
  hostElement,
  impactBurstVisuals,
  inactiveBlackHoleSwallowVisuals,
  inactivePlanetExplosionVisuals,
  inputState,
  launchBurstsByKind,
  lockRingVisual,
  maxRocketTrailSamples,
  maxVisibleImpactBursts,
  playerBoostHeld,
  playerPlanet,
  renderPlanetsById,
  renderQuality,
  renderState,
  renderedCacheKeysById,
  rocketLaunchBurstPools,
  rocketPools,
  rocketTrailStates,
  rocketsByKind,
  scene,
  shieldVisual,
  sunVisuals,
  neutronStarVisuals,
  planetVisuals,
  trailVisuals,
  updateCacheVisualBadge,
  weaponKinds,
}: UpdateLocalViewportCombatSceneParams) => {
  const nowSec = background.nowSec;
  const blackHole = renderState.blackHole;
  const tuning = getRuntimeTuningDocument();
  const worldUnitsPerPixel =
    cameraState.visibleWorldHeight / Math.max(1, hostElement.clientHeight);
  const cannonLayout = getCannonWorldLayout(
    tuning.visuals.cannon,
    worldUnitsPerPixel,
  );
  const renderElapsedSec = renderState.elapsedSec;
  const shieldActive =
    currentState.player.shieldActive &&
    currentState.player.shieldLoad > 0 &&
    playerPlanet?.alive === true;
  const controlledBody = getLocalViewportControlledBody(renderState);
  const canPresentWeapons =
    controlledBody !== null &&
    controlsEnabled &&
    playerPlanet?.alive &&
    !shieldActive;

  let weaponFrame: SharedCombatPresentationFrameState["weapon"] = {
    cannon: null,
    lockRing: null,
  };

  if (canPresentWeapons) {
    const weaponAccent =
      tuning.visuals.rockets[inputState.selectedRocketKind].hudAccent;
    const aimSurfaceOffset =
      controlledBody.kind === "planet"
        ? getRenderedPlanetRadius(controlledBody)
        : controlledBody.radius;

    let firedThisFrame = false;
    for (const rocketKind of weaponKinds) {
      const currentAmmo = renderState.player.ammo[rocketKind];
      const previousAmmo = cannonFireState.lastAmmo[rocketKind];
      if (currentAmmo < previousAmmo) {
        firedThisFrame = true;
      }
      cannonFireState.lastAmmo[rocketKind] = currentAmmo;
    }
    if (firedThisFrame) {
      cannonFireState.flashStartSec = nowSec;
    }

    const lockTarget =
      renderState.player.lockTargetId === null
        ? null
        : (renderPlanetsById.get(renderState.player.lockTargetId) ?? null);
    const lockRingVisible =
      inputState.selectedRocketKind === "seeker" &&
      lockTarget !== null &&
      lockTarget.alive;
    const lockProgress = getLocalSandboxLockProgress({
      currentTick: currentState.tick,
      lockAcquiredTick: currentState.player.seekerLockAcquiredAtTick,
    });
    const lockRingState =
      lockTarget !== null && lockRingVisible
        ? {
            baseRadius: getRenderedPlanetRadius(lockTarget) + 22,
            locked: lockProgress >= 1,
            nowSec,
            position: lockTarget.pos,
            progress: lockProgress,
            z: 5.5,
          }
        : null;

    weaponFrame = {
      cannon: {
        accent: weaponAccent,
        aimTarget: inputState.aimWorld,
        flashAccent: weaponAccent,
        flashAgeSec: nowSec - cannonFireState.flashStartSec,
        layout: cannonLayout,
        position: controlledBody.pos,
        surfaceOffset: aimSurfaceOffset,
        visible: true,
        z: 6,
      },
      lockRing: lockRingState,
    };
  } else {
    for (const rocketKind of weaponKinds) {
      cannonFireState.lastAmmo[rocketKind] =
        renderState.player.ammo[rocketKind];
    }
  }

  const viewportFrameBundle = buildLocalViewportFrameBundle({
    runtime: {
      activeBoostBursts,
      activeGravityPulse,
      blackHole,
      boostBurstParticlesPerBurst,
      cannonLayout,
      gravityPulseDurationSec,
      inputAimWorld: inputState.aimWorld,
      launchBurstsByKind,
      nowSec,
      playerBoostHeld,
      playerPlanet,
      previousCachesById: blackHoleSwallowTracker.previousCachesById,
      previousRocketsById: blackHoleSwallowTracker.previousRocketsById,
      queueCacheSwallowEffect: (previousCache) => {
        queueBlackHoleSwallowEffect({
          activeEffects: activeBlackHoleSwallowEffects,
          color: LOCAL_VIEWPORT_BLACK_HOLE_CACHE_SWALLOW_COLOR,
          inactiveVisuals: inactiveBlackHoleSwallowVisuals,
          radius: previousCache.radius * 1.25,
          startedAtSec: nowSec,
          startPos: previousCache.pos,
          targetPos: blackHole!.pos,
        });
      },
      queueRocketSwallowEffect: (previousRocket) => {
        queueBlackHoleSwallowEffect({
          activeEffects: activeBlackHoleSwallowEffects,
          color: LOCAL_VIEWPORT_BLACK_HOLE_ROCKET_SWALLOW_COLOR,
          inactiveVisuals: inactiveBlackHoleSwallowVisuals,
          radius: Math.max(previousRocket.radius * 2.6, 12),
          startedAtSec: nowSec,
          startPos: previousRocket.pos,
          targetPos: blackHole!.pos,
        });
      },
      renderElapsedSec,
      renderPlanetsById,
      renderState,
      resolveImpactBurst: (burst) => {
        const planet = renderPlanetsById.get(burst.planetId) ?? null;
        if (planet === null) {
          return null;
        }

        return {
          absorbedByShield: burst.absorbedByShield,
          durationSec: Math.max(
            FIXED_STEP_SEC,
            (burst.ttlUntilTick - burst.startedAtTick) * FIXED_STEP_SEC,
          ),
          normal: burst.normal,
          startedAtSec: burst.startedAtSec,
          targetPos: planet.pos,
          targetRadius: planet.radius,
          targetRenderedRadius: getRenderedPlanetRadius(planet),
        };
      },
      shieldActive,
      shieldRadius:
        playerPlanet === null ? 0 : getRenderedPlanetRadius(playerPlanet),
      visibleWorldHeight: cameraState.visibleWorldHeight,
      weaponFrame,
      worldUnitsPerPixel,
    },
    sync: {
      activeBlackHoleSwallowEffects,
      activeCacheIds,
      activePlanetExplosions,
      cacheBadgeBaseSize: tuning.visuals.caches.badgeBaseSize,
      cacheBadgeScale,
      cacheSpriteAssets,
      cacheVisuals,
      createCacheVisual,
      disposeCacheVisual,
      getCacheIconKey,
      impactBurstVisuals,
      inactiveBlackHoleSwallowVisuals,
      inactivePlanetExplosionVisuals,
      launchBurstBudget: renderQuality.launchBurstBudget,
      maxRocketTrailSamples,
      maxVisibleImpactBursts,
      presentationVisuals: {
        blackHole: {
          group: blackHoleGroup,
          ringMesh: blackHoleRing,
        },
        boost: boostBurstVisual,
        cannon: cannonVisual,
        gravityPulse: gravityPulseVisual,
        lockRing: lockRingVisual,
        shield: shieldVisual,
      },
      renderedCacheKeysById,
      rocketKinds: weaponKinds,
      rocketLaunchBurstPools,
      rocketPools,
      rocketTrailBudget: renderQuality.rocketTrailBudget,
      rocketTrailStates,
      rocketsByKind,
      scene,
      updateCacheVisualBadge,
    },
  });

  syncSharedCombatScene({
    background,
    celestial: {
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
        previousNeutronStarsById:
          blackHoleSwallowTracker.previousNeutronStarsById,
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
        previousNeutronStarsById:
          blackHoleSwallowTracker.previousNeutronStarsById,
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
        createTrail: ({ planet }) =>
          createTrailVisual({
            planet,
          }),
        createVisual: ({ index, planet }) =>
          createPlanetVisual({
            index,
            planet,
          }),
        disposeTrail: disposeTrailVisual,
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
        planetTrails: trailVisuals,
        planetVisuals,
        planets: renderState.planets,
        previousPlanetAliveById:
          blackHoleSwallowTracker.previousPlanetAliveById,
        resolveAlive: ({ planet }) => planet.alive,
        shouldTriggerBlackHoleSwallow: ({ planet }) =>
          planet.deathReason === "blackHole",
        syncTrail: ({ trail }) => {
          trail.points.visible = false;
        },
        syncVisual: ({ alive, planet, visual }) => {
          const planetVisualTuning = getPlanetArchetypeVisuals(
            planet.archetype,
          );
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
    },
    viewport: {
      bundle: viewportFrameBundle,
      nowSec,
    },
  });
};
