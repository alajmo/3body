import type { RocketKind, Vec2 } from "@3body/shared";
import { FIXED_STEP_SEC } from "@3body/shared";
import type { Group, Mesh } from "three/webgpu";
import type {
  CombatSandboxCache,
  CombatSandboxPlanet,
  CombatSandboxRocket,
  CombatSandboxState,
} from "../combatSandbox";
import { getRenderedPlanetRadius } from "../planetVisualTuning";
import { getCannonWorldLayout } from "../rocketVisibility";
import type { getRuntimeTuningDocument } from "../runtimeTuning";
import {
  queueBlackHoleSwallowEffect,
  type BlackHoleSwallowState,
  type BlackHoleSwallowVisual,
} from "./blackHoleVisuals";
import type {
  CacheIconKey,
  CacheSpriteAssets,
  CacheVisual,
} from "./cacheVisuals";
import type { LocalSandboxGravityPulseState } from "./localSandboxSimulation";
import { getLocalSandboxLockProgress } from "./localSandboxSimulation";
import {
  getLocalViewportControlledBody,
  type LocalViewportCameraState,
} from "./localViewportCamera";
import type { LocalViewportCombatBlackHoleSwallowTracker } from "./localViewportCelestialSync";
import { buildLocalViewportFrameBundle } from "./localViewportFrameAdapter";
import type { ViewportRenderQualityProfile } from "./renderQuality";
import type {
  SharedCombatBoostBurstState,
  SharedCombatBoostBurstVisual,
} from "./sharedCombatBoostVisuals";
import type { SharedCombatLaunchBurstPoolVisual } from "./sharedCombatLaunchBurstPools";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";
import type {
  SharedCombatPlanetExplosionState,
  SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";
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
import type {
  SharedCombatRocketPoolVisual,
  SharedCombatRocketTrailState,
} from "./sharedCombatRocketPools";

const LOCAL_VIEWPORT_BLACK_HOLE_ROCKET_SWALLOW_COLOR = "#ffd7ac";
const LOCAL_VIEWPORT_BLACK_HOLE_CACHE_SWALLOW_COLOR = "#fff0bb";

export interface LocalViewportCombatCannonFireState {
  flashStartSec: number;
  lastAmmo: Record<RocketKind, number>;
}

interface BuildLocalViewportCombatFrameBundleParams {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activeBoostBursts: SharedCombatBoostBurstState[];
  activeCacheIds: Set<number>;
  activeGravityPulse: LocalSandboxGravityPulseState | null;
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
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
  currentState: CombatSandboxState;
  disposeCacheVisual: (visual: CacheVisual) => void;
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
  nowSec: number;
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
  tuning: ReturnType<typeof getRuntimeTuningDocument>;
  updateCacheVisualBadge: (
    visual: CacheVisual,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
    key: CacheIconKey,
  ) => void;
  weaponKinds: readonly RocketKind[];
}

export const buildLocalViewportCombatFrameBundle = ({
  activeBlackHoleSwallowEffects,
  activeBoostBursts,
  activeCacheIds,
  activeGravityPulse,
  activePlanetExplosions,
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
  currentState,
  disposeCacheVisual,
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
  nowSec,
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
  tuning,
  updateCacheVisualBadge,
  weaponKinds,
}: BuildLocalViewportCombatFrameBundleParams) => {
  const blackHole = renderState.blackHole;
  const worldUnitsPerPixel =
    cameraState.visibleWorldHeight / Math.max(1, hostElement.clientHeight);
  const cannonLayout = getCannonWorldLayout(
    tuning.visuals.cannon,
    worldUnitsPerPixel,
  );
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

  return buildLocalViewportFrameBundle({
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
      renderElapsedSec: renderState.elapsedSec,
      renderPlanetsById,
      renderState,
      shieldActive,
      shieldRadius:
        playerPlanet === null ? 0 : getRenderedPlanetRadius(playerPlanet),
      visibleWorldHeight: cameraState.visibleWorldHeight,
      weaponFrame,
      worldUnitsPerPixel,
    },
    sync: {
      activeCacheIds,
      cacheBadgeBaseSize: tuning.visuals.caches.badgeBaseSize,
      cacheBadgeScale,
      cacheSpriteAssets,
      cacheVisuals,
      createCacheVisual,
      disposeCacheVisual,
      getCacheIconKey,
      launchBurstBudget: renderQuality.launchBurstBudget,
      maxRocketTrailSamples,
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
    transient: {
      blackHoleSwallows: {
        activeEffects: activeBlackHoleSwallowEffects,
        inactiveVisuals: inactiveBlackHoleSwallowVisuals,
      },
      impactBursts: {
        bursts: renderState.impactBursts,
        maxVisibleBursts: maxVisibleImpactBursts,
        nowSec: renderState.elapsedSec,
        resolveBurst: (burst) => {
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
        visuals: impactBurstVisuals,
        z: {
          core: 2.65,
          glow: 2.55,
          ring: 2.75,
        },
      },
      nowSec,
      planetExplosions: {
        activePlanetExplosions,
        inactivePlanetExplosionVisuals,
      },
    },
  });
};
