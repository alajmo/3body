import type { PlanetPublic, RocketKind, Vec2, World } from "@3body/shared";
import type { Group, Mesh, Scene } from "three/webgpu";
import { getCannonWorldLayout } from "../rocketVisibility";
import type { getRuntimeTuningDocument } from "../runtimeTuning";
import type {
  AuthoritativeImpactBurstState,
  ImmediateCannonFlashState,
  ImmediateGravityPulseFeedbackState,
} from "./authoritativeCosmeticFeedback";
import { buildAuthoritativeViewportFrameBundle } from "./authoritativeViewportFrameAdapter";
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
import type { ViewportRenderQualityProfile } from "./renderQuality";
import type { SharedCombatTrackedRocketBody } from "./sharedCombatBlackHoleSwallowTracking";
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
  SharedCombatRocketPoolVisual,
  SharedCombatRocketTrailState,
} from "./sharedCombatRocketPools";
import type {
  SharedCombatGravityPulseVisual as GravityPulseVisual,
  SharedCombatImpactBurstVisual as ImpactBurstVisual,
} from "./sharedCombatSceneResources";
import type {
  SharedCombatCannonVisual,
  SharedCombatImmediateShieldFeedbackState,
  SharedCombatLockRingVisual,
  SharedCombatShieldVisual,
} from "./sharedCombatSupportVisuals";

const AUTHORITATIVE_BLACK_HOLE_ROCKET_SWALLOW_COLOR = "#ffd7ac";
const AUTHORITATIVE_BLACK_HOLE_CACHE_SWALLOW_COLOR = "#fff0bb";
export const AUTHORITATIVE_VIEWPORT_IMPACT_BURST_DURATION_SEC = 0.55;
const AUTHORITATIVE_VIEWPORT_IMPACT_BURST_RADIUS_SCALE = 1.55;
const AUTHORITATIVE_IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC = 0.18;
const AUTHORITATIVE_IMMEDIATE_GRAVITY_PULSE_DURATION_SEC = 0.95;

export interface AuthoritativeViewportFrameCameraState {
  visibleWorldHeight: number;
}

export interface AuthoritativeViewportFramePreviousState {
  previousCacheBodiesById: Map<number, SharedCombatTrackedCacheBody>;
  previousRocketBodiesById: Map<number, SharedCombatTrackedRocketBody>;
}

export interface AuthoritativeViewportFrameEffects {
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

export interface AuthoritativeViewportFrameVisuals {
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

export interface AuthoritativeViewportFrameCombatState {
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

interface BuildAuthoritativeViewportCombatFrameBundleParams {
  authoritativePlanetsById: ReadonlyMap<number, PlanetPublic>;
  cameraState: AuthoritativeViewportFrameCameraState;
  combat: AuthoritativeViewportFrameCombatState;
  effects: AuthoritativeViewportFrameEffects;
  hostElement: HTMLDivElement;
  nowSec: number;
  previousState: AuthoritativeViewportFramePreviousState;
  renderQuality: ViewportRenderQualityProfile;
  rocketKinds: readonly RocketKind[];
  rocketLaunchBurstPools: Record<
    RocketKind,
    SharedCombatLaunchBurstPoolVisual
  > | null;
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual> | null;
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
  rocketsByKind: Record<RocketKind, Array<World["rockets"][number]>>;
  scene: Scene;
  tuning: ReturnType<typeof getRuntimeTuningDocument>;
  visuals: AuthoritativeViewportFrameVisuals;
  world: World | null;
}

export const buildAuthoritativeViewportCombatFrameBundle = ({
  authoritativePlanetsById,
  cameraState,
  combat,
  effects,
  hostElement,
  nowSec,
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
}: BuildAuthoritativeViewportCombatFrameBundleParams) => {
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

  return {
    immediateCannonFlashState,
    viewportFrameBundle: buildAuthoritativeViewportFrameBundle({
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
        shieldActive: authoritativeShieldActive,
        shieldImmediateFeedback: combat.immediateShieldFeedbackState,
        visibleWorldHeight: cameraState.visibleWorldHeight,
        weaponFrame,
        world,
        worldUnitsPerPixel,
      },
      sync: {
        activeCacheIds: effects.activeCacheIds,
        activeLaunchBurstsByKind: effects.activeLaunchBurstsByKind,
        badgeBaseSize: tuning.visuals.caches.badgeBaseSize,
        badgeMaterials: visuals.cacheSpriteAssets.badgeMaterials,
        badgeScale: tuning.visuals.caches.badgeScale,
        cacheVisuals: visuals.cacheVisuals,
        createCacheVisual: createSharedCacheVisual,
        getCacheIconKey: getSharedCacheIconKey,
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
      transient: {
        blackHoleSwallows: {
          activeEffects: effects.activeBlackHoleSwallowEffects,
          inactiveVisuals: effects.inactiveBlackHoleSwallowVisuals,
        },
        impactBursts: {
          bursts: effects.activeImpactBursts,
          maxVisibleBursts: effects.impactBurstVisuals.length,
          nowSec,
          resolveBurst: (burst) => {
            const targetPlanet =
              authoritativePlanetsById.get(burst.planetId) ?? null;
            const targetPos = targetPlanet?.pos ?? burst.targetPos;
            const targetRadius = targetPlanet?.radius ?? burst.radius;

            return {
              absorbedByShield: burst.absorbedByShield,
              durationSec: AUTHORITATIVE_VIEWPORT_IMPACT_BURST_DURATION_SEC,
              normal: burst.normal,
              startedAtSec: burst.startedAtSec,
              targetPos,
              targetRadius,
              targetRenderedRadius:
                targetRadius * AUTHORITATIVE_VIEWPORT_IMPACT_BURST_RADIUS_SCALE,
            };
          },
          visuals: effects.impactBurstVisuals,
          z: {
            core: 5.15,
            glow: 5.05,
            ring: 5.25,
          },
        },
        nowSec,
        planetExplosions: {
          activePlanetExplosions: effects.activePlanetExplosions,
          inactivePlanetExplosionVisuals:
            effects.inactivePlanetExplosionVisuals,
        },
      },
    }),
  };
};
