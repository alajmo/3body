import type {
  ClientMsg,
  PlanetPublic,
  RocketKind,
  Vec2,
  World,
} from "@3body/shared";
import {
  BOOST_SPEC,
  clamp,
  getSunVisualProfile,
  len,
  lerp,
  normalize as normalizeVec2,
  ROCKET_SPECS,
  ROOM_CAPACITY,
  SHIELD_SPEC,
  SNAPSHOT_HZ,
  sub,
} from "@3body/shared";
import {
  AdditiveBlending,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  type WebGPURenderer,
} from "three/webgpu";
import type { AuthoritativeMatchRuntimeState } from "./authoritativeMatchRuntime";
import { getNeutronStarAbsorptionExplosionRadius } from "./neutronStarAbsorption";
import { getCannonWorldLayout } from "./rocketVisibility";
import { getScaledRocketVisuals } from "./rocketVisualTuning";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import {
  SHIELD_GLOW_OUTER_SCALE,
  SHIELD_INNER_SCALE,
  SHIELD_OUTER_SCALE,
} from "./shieldPresentation";
import type { ShowcaseDisplayMode } from "./showcaseDisplayMode";
import {
  createBackdropMaterial,
  createBackgroundLayer,
  createBackgroundLayerConfigs,
  createPlanetGlowMaterial,
  createPlanetMaterial,
  createPlanetSpinAxis,
  createRocketFlameMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
  createSceneBackgroundColor,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  getPlanetForestProfile,
  syncBackdropFrame,
} from "./showcaseVisuals";
import {
  getAmbientBoundaryDebrisRadii,
  updateAmbientBoundaryDebrisVisual,
} from "./viewport/ambientBoundaryDebris";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import {
  type AuthoritativeImpactBurstState,
  decayAuthoritativeFeedbackLevels,
  type ImmediateCannonFlashState,
  type ImmediateGravityPulseFeedbackState,
  queueAuthoritativeImmediateAbilityFeedback,
  queueAuthoritativeImmediateFireFeedback,
  syncAuthoritativeLaunchBurstFeedback,
  syncAuthoritativeRecentEventFeedback,
} from "./viewport/authoritativeCosmeticFeedback";
import { updateAuthoritativeDebrisVisual } from "./viewport/authoritativeDebrisVisual";
import { buildAuthoritativeHudState } from "./viewport/authoritativeHud";
import {
  createAuthoritativeInterpolationCache,
  syncAuthoritativeInterpolatedWorld,
} from "./viewport/authoritativeInterpolation";
import {
  getAuthoritativeInterpolationDelayMs,
  getAuthoritativeInterpolationMaxAlpha,
  getAuthoritativeLateSnapshotThresholdMs,
} from "./viewport/authoritativeLatency";
import { syncAuthoritativeLocalPlayerPrediction } from "./viewport/authoritativeLocalPlayerPrediction";
import {
  getAuthoritativeAbilitySlots,
  smoothAuthoritativeCameraAxis,
} from "./viewport/authoritativeViewportBehavior";
import {
  type BlackHoleSwallowState,
  createBlackHoleSwallowVisualPool,
  queueBlackHoleSwallowEffect,
} from "./viewport/blackHoleVisuals";
import {
  type CacheVisual,
  createCacheSpriteAssets,
  createCacheVisual as createSharedCacheVisual,
  disposeCacheSpriteAssets,
  getCacheIconKey as getSharedCacheIconKey,
  updateCacheVisualBadge as updateSharedCacheVisualBadge,
} from "./viewport/cacheVisuals";
import { getViewportCameraShakeOffsets } from "./viewport/cameraShake";
import { disposeViewportDisposables } from "./viewport/disposables";
import { createGameViewportInputController } from "./viewport/localInput";
import { createLocalViewportRenderShell } from "./viewport/localViewportRenderShell";
import {
  createBlackHoleCoreMaterial,
  createBlackHoleLensMaterial,
  createBlackHoleRingMaterial,
  createBoostWakeMaterial,
  createNeutronStarCoreMaterial,
  createNeutronStarHaloMaterial,
  createNeutronStarJetMaterial,
  createNeutronStarLensMaterial,
  createPlanetExplosionVisual,
  createRocketLaunchBurstMaterial,
} from "./viewport/localViewportVisualFactories";
import { createManagedViewportSession } from "./viewport/managedViewportSession";
import { createViewportPerformanceProfiler } from "./viewport/performanceProfiler";
import {
  disposeViewportRendererSession,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";
import {
  createViewportRendererSizeState,
  getViewportHostSize,
  syncViewportRendererSize,
} from "./viewport/rendererSizing";
import { DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE } from "./viewport/renderQuality";
import { createRuntimeStatsTracker } from "./viewport/runtimeStats";
import { syncSharedCombatBackgroundParallax } from "./viewport/sharedCombatBackgroundParallax";
import type { SharedCombatTrackedRocketBody } from "./viewport/sharedCombatBlackHoleSwallowTracking";
import {
  createSharedCombatBoostBurstVisual,
  type SharedCombatBoostBurstState,
  type SharedCombatBoostBurstVisual,
} from "./viewport/sharedCombatBoostVisuals";
import { createSharedCombatCannonVisual } from "./viewport/sharedCombatCannonVisual";
import {
  createSharedCombatNeutronStarVisual,
  createSharedCombatSunVisual,
  disposeSharedCombatNeutronStarVisual,
  disposeSharedCombatSunVisual,
  type SharedCombatNeutronStarVisual as NeutronStarVisual,
  type SharedCombatSunVisual as SunVisual,
  syncSharedCombatNeutronStarVisual,
  syncSharedCombatSunVisual,
} from "./viewport/sharedCombatCelestialVisuals";
import {
  type SharedCombatTrackedNeutronStarBody,
  type SharedCombatTrackedSunBody,
  syncSharedCombatDynamicNeutronStarPresentation,
  syncSharedCombatDynamicPlanetPresentation,
  syncSharedCombatDynamicSunPresentation,
} from "./viewport/sharedCombatDynamicCelestialSync";
import {
  hideSharedCombatImmediateFireFeedbackVisual,
  type SharedCombatImmediateFireBurstState,
  type SharedCombatImmediateFireFeedbackVisual,
  type SharedCombatImmediateGhostRocketState,
  syncSharedCombatImmediateFireFeedback,
} from "./viewport/sharedCombatImmediateFireVisuals";
import { pruneSharedCombatImpactBursts } from "./viewport/sharedCombatImpactBursts";
import {
  createSharedCombatLaunchBurstPools,
  type SharedCombatLaunchBurstPoolVisual,
} from "./viewport/sharedCombatLaunchBurstPools";
import type { SharedCombatLaunchBurstState } from "./viewport/sharedCombatLaunchBurstVisuals";
import {
  clearSharedCombatPlanetExplosions,
  queueSharedCombatPlanetExplosion,
  type SharedCombatPlanetExplosionState,
  type SharedCombatPlanetExplosionVisual,
} from "./viewport/sharedCombatPlanetExplosions";
import {
  createSharedCombatPlanetTrailVisual,
  disposeSharedCombatPlanetTrailVisual,
  type SharedCombatPlanetTrailVisual as PlanetTrailVisual,
  pushSharedCombatPlanetTrailSample,
  updateSharedCombatPlanetTrailVisual,
} from "./viewport/sharedCombatPlanetTrails";
import {
  createSharedCombatPlanetVisual,
  disposeSharedCombatPlanetVisual,
  type SharedCombatPlanetVisual as PlanetVisual,
  syncSharedCombatPlanetVisual,
} from "./viewport/sharedCombatPlanetVisuals";
import type { SharedCombatPresentationFrameState } from "./viewport/sharedCombatPresentationFrame";
import {
  createSharedCombatRocketPools,
  getSharedCombatRocketTrailInstanceLimits,
  type SharedCombatRocketPoolVisual,
  type SharedCombatRocketTrailState,
} from "./viewport/sharedCombatRocketPools";
import {
  createSharedCombatSceneResources,
  type SharedCombatGravityPulseVisual as GravityPulseVisual,
  type SharedCombatImpactBurstVisual as ImpactBurstVisual,
} from "./viewport/sharedCombatSceneResources";
import type {
  SharedCombatCannonVisual,
  SharedCombatImmediateShieldFeedbackState,
} from "./viewport/sharedCombatSupportVisuals";
import { syncSharedCombatViewportFrame } from "./viewport/sharedCombatViewportFrame";
import {
  areHudStatesEqual,
  createInitialHudState,
  type GameViewportHudState,
} from "./viewportHud";

const CAMERA_DISTANCE = 100;
const CAMERA_FOLLOW_LERP = 6.1;
const CAMERA_ZOOM_LERP = 5.2;
const BACKDROP_OVERDRAW = 1.35;
const MAX_FRAME_DELTA_SEC = 0.1;
const HUD_UPDATE_INTERVAL_SEC = 1 / 12;
const MAX_TRAIL_SAMPLES = 220;
const TRAIL_POINT_SIZE = 12;
const INPUT_SEND_INTERVAL_MS = 1000 / 30;
const SHIELD_AIM_SEND_INTERVAL_MS = 1000 / 30;
const MAX_ACTIVE_BLACK_HOLE_SWALLOWS = 24;
const MAX_ACTIVE_IMPACT_BURSTS = 16;
const MAX_ACTIVE_NEUTRON_STAR_ABSORPTION_EXPLOSIONS = 8;
const MAX_ACTIVE_BOOST_BURSTS = 4;
const BOOST_BURST_PARTICLES = 32;
const MAX_BOOST_BURST_SAMPLES = BOOST_BURST_PARTICLES * MAX_ACTIVE_BOOST_BURSTS;
const MAX_DEBRIS_SAMPLES = 512;
const MAX_ROCKET_TRAIL_SAMPLES = 9;
const MAX_ROCKET_TRAIL_INSTANCES = getSharedCombatRocketTrailInstanceLimits(
  MAX_ROCKET_TRAIL_SAMPLES,
);
const MAX_ROCKET_LAUNCH_BURST_INSTANCES = {
  heavy: 24,
  light: 24,
  seeker: 24,
} satisfies Record<RocketKind, number>;
const BLACK_HOLE_ROCKET_SWALLOW_COLOR = "#ffd7ac";
const BLACK_HOLE_CACHE_SWALLOW_COLOR = "#fff0bb";
const IMPACT_BURST_DURATION_SEC = 0.32;
const IMMEDIATE_FIRE_BURST_DURATION_SEC = 0.12;
const IMMEDIATE_GHOST_ROCKET_DURATION_SEC = 0.18;
const IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC = 0.18;
const IMMEDIATE_GRAVITY_PULSE_DURATION_SEC = 0.95;
const SEEKER_LOCK_SELECTION_DISTANCE = 96;
const AUTHORITATIVE_ROCKET_KINDS = [
  "heavy",
  "light",
  "seeker",
] as const satisfies readonly RocketKind[];

interface CreateAuthoritativeViewportOptions {
  dispatchMessage: (message: ClientMsg) => void;
  displayMode: ShowcaseDisplayMode;
  getPerformanceState: () => {
    profilingEnabled: boolean;
    resetToken: number;
  };
  getRuntimeState: () => AuthoritativeMatchRuntimeState;
  onHudStateChange?: (state: GameViewportHudState) => void;
}

const getGameplayCameraHeights = () => {
  const cameraTuning = getRuntimeTuningDocument().gameplay.camera;

  return {
    followWorldHeight: cameraTuning.gameplayCameraWorldHeight,
  };
};

const getCameraFrame = (
  world: World | null,
  playerPlanet: PlanetPublic | null,
): { centerX: number; centerY: number; visibleWorldHeight: number } => {
  const { followWorldHeight } = getGameplayCameraHeights();

  if (world === null) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: followWorldHeight,
    };
  }

  if (playerPlanet === null) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: followWorldHeight,
    };
  }

  return {
    centerX: playerPlanet.pos.x,
    centerY: playerPlanet.pos.y,
    visibleWorldHeight: followWorldHeight,
  };
};

const getBudgetedCount = (maxCount: number, budget: number): number =>
  budget <= 0 ? 0 : Math.max(1, Math.round(maxCount * budget));

const getAuthoritativeBoostRepeatIntervalSec = (): number =>
  Math.max(1 / SNAPSHOT_HZ, BOOST_SPEC.cooldownSec * 0.9);

const findAimLockTargetPlanet = (
  planets: readonly PlanetPublic[],
  playerPlanetId: number,
  aimWorld: Vec2,
): PlanetPublic | null => {
  let bestTarget: PlanetPublic | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const planet of planets) {
    if (planet.id === playerPlanetId) {
      continue;
    }

    const distance = len(sub(planet.pos, aimWorld)) - planet.radius;
    if (distance <= SEEKER_LOCK_SELECTION_DISTANCE && distance < bestDistance) {
      bestDistance = distance;
      bestTarget = planet;
    }
  }

  return bestTarget;
};

const getAuthoritativeSeekerLockProgress = (
  nowSec: number,
  lockStartedAtSec: number | null,
): number => {
  if (lockStartedAtSec === null) {
    return 0;
  }

  if (ROCKET_SPECS.seeker.lockSec <= 0) {
    return 1;
  }

  return clamp((nowSec - lockStartedAtSec) / ROCKET_SPECS.seeker.lockSec, 0, 1);
};

const findPlanetById = (
  world: World | null | undefined,
  planetId: number,
): PlanetPublic | null =>
  world?.planets.find((planet) => planet.id === planetId) ?? null;

export function createAuthoritativeViewport(
  hostElement: HTMLDivElement,
  options: CreateAuthoritativeViewportOptions,
): () => void {
  let disposed = false;
  let renderer: WebGPURenderer | null = null;
  let rendererBootstrap: ViewportRendererBootstrap | null = null;
  let animationLoopController: ReturnType<
    typeof createViewportAnimationLoopController
  > | null = null;
  let camera: OrthographicCamera | null = null;
  let backdropMesh: Mesh | null = null;
  let inputController: ReturnType<
    typeof createGameViewportInputController
  > | null = null;
  let syncAimWorldToPointer: (() => void) | null = null;
  let lastHudState = createInitialHudState();
  let lastHudUpdateSec = 0;
  let previousFrameTimeSec: number | null = null;
  let lastInputSentAtMs = 0;
  let lastShieldAimSentAtMs = 0;
  let nextClientTick = 1;
  let lastBoostAbilitySentAtSec = Number.NEGATIVE_INFINITY;
  let seekerLockTargetId: number | null = null;
  let seekerLockStartedAtSec: number | null = null;
  let lastProfilingResetToken = options.getPerformanceState().resetToken;
  const renderQuality = DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE;
  const currentMaxPixelRatio = renderQuality.maxPixelRatio;
  const performanceProfiler = createViewportPerformanceProfiler();
  const runtimeStatsTracker = createRuntimeStatsTracker();
  const runtimeStats = {
    fps: 0,
    frameTimeMs: 0,
  };
  const disposables: Array<{ dispose: () => void }> = [];
  let cleanupComplete = false;
  const sunVisuals = new Map<number, SunVisual>();
  const neutronStarVisuals = new Map<number, NeutronStarVisual>();
  const planetVisuals = new Map<number, PlanetVisual>();
  const planetTrails = new Map<number, PlanetTrailVisual>();
  let rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual> | null =
    null;
  let rocketLaunchBurstPools: Record<
    RocketKind,
    SharedCombatLaunchBurstPoolVisual
  > | null = null;
  const rocketTrailStates = new Map<number, SharedCombatRocketTrailState>();
  const rocketsByKind: Record<
    RocketKind,
    Array<{
      id: number;
      pos: Vec2;
      radius: number;
      rocketKind: RocketKind;
      vel: Vec2;
    }>
  > = {
    heavy: [],
    light: [],
    seeker: [],
  };
  const activeLaunchBurstsByKind: Record<
    RocketKind,
    SharedCombatLaunchBurstState[]
  > = {
    heavy: [],
    light: [],
    seeker: [],
  };
  const cacheVisuals = new Map<number, CacheVisual>();
  const activeCacheIds = new Set<number>();
  const activeBlackHoleSwallowEffects: BlackHoleSwallowState[] = [];
  const activeBoostBursts: SharedCombatBoostBurstState[] = [];
  const activeImpactBursts: AuthoritativeImpactBurstState[] = [];
  const activePlanetExplosions: SharedCombatPlanetExplosionState[] = [];
  const authoritativePlanetsById = new Map<number, PlanetPublic>();
  let shieldGroup: Group | null = null;
  let shieldArcOpacityUniform: { value: number } | null = null;
  let shieldPanelOpacityUniform: { value: number } | null = null;
  let shieldCrestOpacityUniform: { value: number } | null = null;
  let shieldGlowOpacityUniform: { value: number } | null = null;
  let lockRingMesh: Mesh | null = null;
  let lockRingProgressUniform: { value: number } | null = null;
  let lockRingLockedUniform: { value: number } | null = null;
  let lockRingTimeUniform: { value: number } | null = null;
  let cannonVisual: SharedCombatCannonVisual | null = null;
  let immediateCannonFlashState: ImmediateCannonFlashState | null = null;
  let boostBurstVisual: SharedCombatBoostBurstVisual | null = null;
  let gravityPulseVisual: GravityPulseVisual | null = null;
  const impactBurstVisuals: ImpactBurstVisual[] = [];
  let gravityPulseFeedbackState: ImmediateGravityPulseFeedbackState | null =
    null;
  const immediateFireFeedback = new Map<
    RocketKind,
    SharedCombatImmediateFireFeedbackVisual
  >();
  const immediateFireBurstState = new Map<
    RocketKind,
    SharedCombatImmediateFireBurstState
  >();
  const immediateGhostRocketState = new Map<
    RocketKind,
    SharedCombatImmediateGhostRocketState
  >();
  let immediateShieldFeedbackState: SharedCombatImmediateShieldFeedbackState | null =
    null;
  let inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[] = [];
  const previousCacheBodiesById = new Map<
    number,
    { pos: Vec2; radius: number }
  >();
  const previousRocketBodiesById = new Map<
    number,
    SharedCombatTrackedRocketBody
  >();
  const previousNeutronStarsById = new Map<
    number,
    SharedCombatTrackedNeutronStarBody
  >();
  const previousSunBodiesById = new Map<number, SharedCombatTrackedSunBody>();
  const authoritativeInterpolationCache =
    createAuthoritativeInterpolationCache();
  const cameraState = {
    centerX: 0,
    centerY: 0,
    renderCenterX: 0,
    renderCenterY: 0,
    shakeOffsetX: 0,
    shakeOffsetY: 0,
    visibleWorldHeight: getGameplayCameraHeights().followWorldHeight,
  };
  const rendererSizeState = createViewportRendererSizeState();
  const managedViewportSession = createManagedViewportSession({
    failureLogLabel: "authoritative viewport",
    hostElement,
    isDisposed: () => disposed,
  });
  const snapshotWindowMs = 1000 / SNAPSHOT_HZ;
  const authoritativeInterpolationDelayMs =
    getAuthoritativeInterpolationDelayMs({
      hostname: window.location.hostname,
      snapshotWindowMs,
    });
  const authoritativeInterpolationLeadMs = Math.max(
    0,
    snapshotWindowMs - authoritativeInterpolationDelayMs,
  );
  const authoritativeInterpolationMaxAlpha =
    getAuthoritativeInterpolationMaxAlpha({
      hostname: window.location.hostname,
      snapshotWindowMs,
    });
  const authoritativeLateSnapshotThresholdMs =
    getAuthoritativeLateSnapshotThresholdMs({
      snapshotWindowMs,
    });
  let cameraShake = 0;
  let damageFlash = 0;
  let hudFlicker = 0;
  let lastProcessedEventId: number | null = null;
  let lastProcessedLaunchBurstSnapshotTick: number | null = null;

  const emitHudState = (nextState: GameViewportHudState) => {
    if (areHudStatesEqual(lastHudState, nextState)) {
      return;
    }

    lastHudState = nextState;
    if (!disposed) {
      options.onHudStateChange?.(nextState);
    }
  };

  const applyCameraFrame = () => {
    if (camera === null) {
      return;
    }

    const { aspect } = getViewportHostSize(hostElement);
    const worldHalfHeight = cameraState.visibleWorldHeight / 2;
    const worldHalfWidth = worldHalfHeight * aspect;

    cameraState.renderCenterX = cameraState.centerX + cameraState.shakeOffsetX;
    cameraState.renderCenterY = cameraState.centerY + cameraState.shakeOffsetY;
    camera.left = -worldHalfWidth;
    camera.right = worldHalfWidth;
    camera.top = worldHalfHeight;
    camera.bottom = -worldHalfHeight;
    camera.position.set(
      cameraState.renderCenterX,
      cameraState.renderCenterY,
      CAMERA_DISTANCE,
    );
    camera.lookAt(cameraState.renderCenterX, cameraState.renderCenterY, 0);
    camera.updateProjectionMatrix();

    syncBackdropFrame({
      backdropMesh,
      centerX: cameraState.renderCenterX,
      centerY: cameraState.renderCenterY,
      height: worldHalfHeight * 2 * BACKDROP_OVERDRAW,
      width: worldHalfWidth * 2 * BACKDROP_OVERDRAW,
    });
  };

  const resizeViewport = () => {
    if (renderer === null) {
      return;
    }

    syncViewportRendererSize({
      hostElement,
      maxPixelRatio: currentMaxPixelRatio,
      renderer,
      sizeState: rendererSizeState,
    });
    applyCameraFrame();
    syncAimWorldToPointer?.();
  };

  const resetViewportProfilingState = (profilingEnabled: boolean) => {
    performanceProfiler.reset();
    lastHudUpdateSec = 0;
    emitHudState({
      ...lastHudState,
      debugItems: [],
      profilingEnabled,
    });
  };

  const disposeViewportSession = () => {
    managedViewportSession.invalidate();
    window.removeEventListener("resize", resizeViewport);
    inputController?.dispose();
    inputController = null;
    syncAimWorldToPointer = null;

    for (const visual of sunVisuals.values()) {
      disposeSharedCombatSunVisual(visual);
    }
    for (const visual of neutronStarVisuals.values()) {
      disposeSharedCombatNeutronStarVisual(visual);
    }
    for (const visual of planetVisuals.values()) {
      disposeSharedCombatPlanetVisual(visual);
    }
    for (const trail of planetTrails.values()) {
      disposeSharedCombatPlanetTrailVisual(trail);
    }
    for (const visual of cacheVisuals.values()) {
      sceneRemoveSafe(visual.group);
    }
    if (shieldGroup !== null) {
      sceneRemoveSafe(shieldGroup);
      shieldGroup = null;
    }
    if (lockRingMesh !== null) {
      sceneRemoveSafe(lockRingMesh);
      lockRingMesh = null;
    }
    if (cannonVisual !== null) {
      sceneRemoveSafe(cannonVisual.group);
      cannonVisual = null;
    }
    if (boostBurstVisual !== null) {
      sceneRemoveSafe(
        boostBurstVisual.points,
        ...boostBurstVisual.wakeVisuals.map((visual) => visual.mesh),
      );
      boostBurstVisual = null;
    }
    if (gravityPulseVisual !== null) {
      sceneRemoveSafe(
        gravityPulseVisual.coreMesh,
        gravityPulseVisual.ringMesh,
        gravityPulseVisual.echoMesh,
      );
      gravityPulseVisual = null;
    }
    for (const visual of impactBurstVisuals) {
      sceneRemoveSafe(visual.glowMesh, visual.ringMesh, visual.coreMesh);
    }
    for (const feedback of immediateFireFeedback.values()) {
      sceneRemoveSafe(feedback.burstMesh, feedback.ghost.group);
    }
    sunVisuals.clear();
    neutronStarVisuals.clear();
    planetVisuals.clear();
    planetTrails.clear();
    rocketPools = null;
    rocketLaunchBurstPools = null;
    rocketTrailStates.clear();
    for (const rocketKind of AUTHORITATIVE_ROCKET_KINDS) {
      rocketsByKind[rocketKind].length = 0;
      activeLaunchBurstsByKind[rocketKind].length = 0;
    }
    cacheVisuals.clear();
    immediateFireFeedback.clear();
    immediateFireBurstState.clear();
    immediateGhostRocketState.clear();
    activeBlackHoleSwallowEffects.length = 0;
    activeBoostBursts.length = 0;
    activeImpactBursts.length = 0;
    impactBurstVisuals.length = 0;
    clearSharedCombatPlanetExplosions({
      activePlanetExplosions,
      inactivePlanetExplosionVisuals,
    });
    activeCacheIds.clear();
    authoritativePlanetsById.clear();
    previousCacheBodiesById.clear();
    previousNeutronStarsById.clear();
    previousRocketBodiesById.clear();
    previousSunBodiesById.clear();
    shieldArcOpacityUniform = null;
    shieldPanelOpacityUniform = null;
    shieldCrestOpacityUniform = null;
    shieldGlowOpacityUniform = null;
    lockRingProgressUniform = null;
    lockRingLockedUniform = null;
    lockRingTimeUniform = null;
    lastBoostAbilitySentAtSec = Number.NEGATIVE_INFINITY;
    seekerLockTargetId = null;
    seekerLockStartedAtSec = null;
    immediateCannonFlashState = null;
    gravityPulseFeedbackState = null;
    immediateShieldFeedbackState = null;
    lastProcessedLaunchBurstSnapshotTick = null;

    disposeViewportDisposables(disposables, "authoritative viewport resource");

    disposeViewportRendererSession({
      animationLoopController,
      bootstrap: rendererBootstrap,
      hostElement,
      renderer,
    });
    animationLoopController = null;
    rendererBootstrap = null;
    renderer = null;
    camera = null;
    backdropMesh = null;
  };

  const handleViewportRenderError = (error: unknown) => {
    disposeViewportSession();
    managedViewportSession.reportFailure(error);
  };

  const startViewport = async () => {
    try {
      await managedViewportSession.start({
        onReady: ({ bootstrap, renderer: nextRenderer }) => {
          rendererBootstrap = bootstrap;
          renderer = nextRenderer;

          const backgroundVisuals =
            getRuntimeTuningDocument().visuals.background;
          const nextCamera = new OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
          nextCamera.position.set(0, 0, CAMERA_DISTANCE);
          nextCamera.lookAt(0, 0, 0);
          camera = nextCamera;

          const shell = createLocalViewportRenderShell({
            backdropMaterial: createBackdropMaterial(backgroundVisuals),
            backgroundLayers: createBackgroundLayerConfigs(backgroundVisuals),
            camera: nextCamera,
            cameraState,
            createBackgroundLayer,
            currentSsaaLevel: renderQuality.ssaaLevel,
            displayMode: options.displayMode,
            hostElement,
            renderer: nextRenderer,
            sceneBackground: createSceneBackgroundColor(backgroundVisuals),
          });
          const {
            backgroundLayers,
            backdropMesh: shellBackdropMesh,
            disposables: shellDisposables,
            postProcessing,
            scene,
          } = shell;
          backdropMesh = shellBackdropMesh;
          disposables.push(...shellDisposables);

          const sunGeometry = new SphereGeometry(1, 40, 40);
          const planetGeometry = new SphereGeometry(1, 56, 56);
          const glowGeometry = new CircleGeometry(1, 48);
          const warpGeometry = new RingGeometry(0.55, 1, 72);
          const rocketGeometry = new CylinderGeometry(0.58, 1, 1, 18, 1);
          const ribbonGeometry = new PlaneGeometry(1, 1);
          rocketGeometry.rotateZ(-Math.PI / 2);
          disposables.push(
            sunGeometry,
            planetGeometry,
            glowGeometry,
            warpGeometry,
            rocketGeometry,
            ribbonGeometry,
          );

          const inactiveBlackHoleSwallowVisuals =
            createBlackHoleSwallowVisualPool({
              capacity: MAX_ACTIVE_BLACK_HOLE_SWALLOWS,
              disposables,
              document: hostElement.ownerDocument,
              scene,
            });
          const initialTuning = getRuntimeTuningDocument();
          const abilityVisuals = initialTuning.visuals.abilities;
          const {
            blackHoleGroup,
            blackHoleRing,
            boundaryDebrisVisual,
            debrisVisual,
            disposables: sharedSceneDisposables,
            gravityPulseVisual: sharedGravityPulseVisual,
            impactBurstVisuals: sharedImpactBurstVisuals,
            inactivePlanetExplosionVisuals: nextInactivePlanetExplosionVisuals,
            lockRingLockedUniform: nextLockRingLockedUniform,
            lockRingMesh: nextLockRingMesh,
            lockRingProgressUniform: nextLockRingProgressUniform,
            lockRingTimeUniform: nextLockRingTimeUniform,
            shieldArcOpacityUniform: nextShieldArcOpacityUniform,
            shieldPanelOpacityUniform: nextShieldPanelOpacityUniform,
            shieldCrestOpacityUniform: nextShieldCrestOpacityUniform,
            shieldGlowOpacityUniform: nextShieldGlowOpacityUniform,
            shieldGroup: nextShieldGroup,
          } = createSharedCombatSceneResources({
            blackHoleDepthOffsets: {
              ring: -1,
            },
            boundaryAsteroidMeshNamePrefix: "authoritativeBoundaryAsteroid",
            createBlackHoleCoreMaterial,
            createBlackHoleLensMaterial,
            createBlackHoleRingMaterial,
            createPlanetExplosionVisual,
            debrisSampleLimit: MAX_DEBRIS_SAMPLES,
            getBlackHoleCoreRadius: () =>
              initialTuning.visuals.blackHole.coreRadius,
            getBlackHoleLensRadius: () =>
              initialTuning.visuals.blackHole.lensRadius,
            getBlackHoleRingRadius: () =>
              initialTuning.visuals.blackHole.ringRadius,
            gravityPulseColors: {
              core: abilityVisuals.wildcardColor,
              echo: abilityVisuals.wildcardColor,
              ring: abilityVisuals.wildcardColor,
            },
            gravityPulseRenderOrders: {
              core: 6,
              echo: 7,
              ring: 8,
            },
            impactBurstLimit: MAX_ACTIVE_IMPACT_BURSTS,
            lockRingAccentColor: initialTuning.visuals.rockets.seeker.hudAccent,
            planetExplosionLimit: MAX_ACTIVE_NEUTRON_STAR_ABSORPTION_EXPLOSIONS,
            scene,
            shieldArcDeg:
              initialTuning.gameplay.abilities.shield?.arcDeg ??
              SHIELD_SPEC.arcDeg,
            shieldColor: abilityVisuals.shieldColor,
            shieldGlowOuterScale: SHIELD_GLOW_OUTER_SCALE,
            shieldInnerScale: SHIELD_INNER_SCALE,
            shieldOuterScale: SHIELD_OUTER_SCALE,
          });
          inactivePlanetExplosionVisuals = nextInactivePlanetExplosionVisuals;
          impactBurstVisuals.push(...sharedImpactBurstVisuals);
          gravityPulseVisual = sharedGravityPulseVisual;
          shieldGroup = nextShieldGroup;
          shieldArcOpacityUniform = nextShieldArcOpacityUniform;
          shieldPanelOpacityUniform = nextShieldPanelOpacityUniform;
          shieldCrestOpacityUniform = nextShieldCrestOpacityUniform;
          shieldGlowOpacityUniform = nextShieldGlowOpacityUniform;
          lockRingMesh = nextLockRingMesh;
          lockRingProgressUniform = nextLockRingProgressUniform;
          lockRingLockedUniform = nextLockRingLockedUniform;
          lockRingTimeUniform = nextLockRingTimeUniform;
          disposables.push(...sharedSceneDisposables);

          const cacheSpriteAssets = createCacheSpriteAssets(
            hostElement.ownerDocument,
          );
          disposables.push({
            dispose: () => {
              disposeCacheSpriteAssets(cacheSpriteAssets);
            },
          });

          const cannonMetalMaterial = new MeshBasicMaterial({
            color: "#7c8ea8",
          });
          const cannonAccentMaterial = new MeshBasicMaterial({
            color: initialTuning.visuals.rockets.light.hudAccent,
          });
          const cannonFlashMaterial = new MeshBasicMaterial({
            blending: AdditiveBlending,
            color: "#fff1c2",
            depthWrite: false,
            opacity: 0,
            transparent: true,
          });
          const {
            disposables: sharedCannonDisposables,
            visual: nextCannonVisual,
          } = createSharedCombatCannonVisual({
            accentMaterial: cannonAccentMaterial,
            flashMaterial: cannonFlashMaterial,
            metalMaterial: cannonMetalMaterial,
            scene,
            setAccentColor: (value: string) => {
              cannonAccentMaterial.color.set(value);
            },
          });
          cannonVisual = nextCannonVisual;
          disposables.push(
            cannonMetalMaterial,
            cannonAccentMaterial,
            cannonFlashMaterial,
            ...sharedCannonDisposables,
          );

          const {
            disposables: sharedBoostBurstDisposables,
            visual: nextBoostBurstVisual,
          } = createSharedCombatBoostBurstVisual({
            boostColor: abilityVisuals.boostColor,
            createBoostWakeMaterial,
            sampleLimit: MAX_BOOST_BURST_SAMPLES,
            scene,
            wakeCount: ROOM_CAPACITY,
          });
          boostBurstVisual = nextBoostBurstVisual;
          disposables.push(...sharedBoostBurstDisposables);
          const initialScaledRocketVisualTuning = getScaledRocketVisuals(
            initialTuning.visuals.rockets,
          );
          const {
            disposables: sharedRocketPoolDisposables,
            rocketPools: nextRocketPools,
          } = createSharedCombatRocketPools({
            createRocketFlameMaterial,
            createRocketMaterial,
            createRocketTrailMaterial,
            rocketKinds: AUTHORITATIVE_ROCKET_KINDS,
            rocketRenderProfiles: initialScaledRocketVisualTuning,
            rocketTrailInstanceLimits: MAX_ROCKET_TRAIL_INSTANCES,
            scene,
          });
          rocketPools = nextRocketPools;
          disposables.push(...sharedRocketPoolDisposables);
          const {
            disposables: sharedLaunchBurstDisposables,
            launchBurstPools: nextRocketLaunchBurstPools,
          } = createSharedCombatLaunchBurstPools({
            createRocketLaunchBurstMaterial,
            launchBurstInstanceLimits: MAX_ROCKET_LAUNCH_BURST_INSTANCES,
            rocketKinds: AUTHORITATIVE_ROCKET_KINDS,
            rocketRenderProfiles: initialScaledRocketVisualTuning,
            scene,
          });
          rocketLaunchBurstPools = nextRocketLaunchBurstPools;
          disposables.push(...sharedLaunchBurstDisposables);

          for (const rocketKind of AUTHORITATIVE_ROCKET_KINDS) {
            const rocketAppearance =
              initialScaledRocketVisualTuning[rocketKind];
            const body = new Mesh(
              rocketGeometry,
              createRocketMaterial(
                rocketAppearance.core,
                rocketAppearance.trail,
              ),
            );
            const trail = new Mesh(
              ribbonGeometry,
              createRocketTrailMaterial(
                rocketAppearance.core,
                rocketAppearance.trail,
              ),
            );
            const flame = new Mesh(
              ribbonGeometry,
              createRocketFlameMaterial(
                rocketAppearance.core,
                rocketAppearance.trail,
              ),
            );
            const ghostGroup = new Group();
            ghostGroup.visible = false;
            body.renderOrder = 3;
            trail.renderOrder = 2;
            flame.renderOrder = 4;
            ghostGroup.add(trail, flame, body);
            const burstMesh = new Mesh(
              ribbonGeometry,
              createRocketLaunchBurstMaterial(
                rocketAppearance.core,
                rocketAppearance.trail,
              ),
            );
            burstMesh.renderOrder = 5;
            burstMesh.visible = false;
            const feedbackVisual = {
              burstMesh,
              ghost: {
                body,
                flame,
                group: ghostGroup,
                trail,
              },
            } satisfies SharedCombatImmediateFireFeedbackVisual;
            hideSharedCombatImmediateFireFeedbackVisual(feedbackVisual);
            scene.add(burstMesh, ghostGroup);
            immediateFireFeedback.set(rocketKind, feedbackVisual);
            disposables.push(
              burstMesh.material as { dispose: () => void },
              body.material as { dispose: () => void },
              trail.material as { dispose: () => void },
              flame.material as { dispose: () => void },
            );
          }

          const emitConnectionHud = (
            timeMs: number,
            extrapolating: boolean,
          ) => {
            const runtime = options.getRuntimeState();
            const snapshot = runtime.snapshot;
            const world = snapshot?.world ?? null;
            const self = snapshot?.self ?? null;
            const playerId = runtime.playerId;
            const playerPlanet =
              playerId === null || world === null
                ? null
                : (world.planets.find(
                    (planet) => planet.playerId === playerId,
                  ) ?? null);
            const controlsEnabled =
              runtime.phase === "combat" &&
              runtime.connectionState === "connected" &&
              world !== null &&
              self !== null &&
              playerId !== null;
            const connectionLabel = runtime.roomId
              ? `${runtime.roomId} · ${runtime.phase}`
              : runtime.phase;
            const rosterNameByPlayerId = new Map(
              runtime.roomRoster.map((entry) => [entry.playerId, entry.name]),
            );
            const performanceState = options.getPerformanceState();
            emitHudState(
              buildAuthoritativeHudState({
                connection: {
                  extrapolating,
                  fps: runtimeStats.fps,
                  frameTimeMs: runtimeStats.frameTimeMs,
                  label: connectionLabel,
                  rttMs: runtime.rttMs,
                  state:
                    runtime.connectionState === "connected"
                      ? "connected"
                      : "reconnecting",
                },
                controlsEnabled,
                currentEffectsQuality: renderQuality.effectsQuality,
                currentTick: snapshot?.tick ?? 0,
                currentMaxPixelRatio,
                damageFlash,
                eventLog: runtime.recentEvents,
                extrapolating,
                hudFlicker,
                playerId,
                playerPlanet,
                profilerSnapshot: performanceState.profilingEnabled
                  ? performanceProfiler.getSnapshot()
                  : null,
                profilingEnabled: performanceState.profilingEnabled,
                recentEventsNowMs: timeMs,
                rosterNameByPlayerId,
                runtimeStats,
                selectedWeapon:
                  inputController?.state.inputState.selectedRocketKind ??
                  "light",
                self,
                world,
              }),
            );
          };

          inputController = createGameViewportInputController({
            canvasElement: nextRenderer.domElement,
            isShieldActive: () => {
              const runtime = options.getRuntimeState();
              const world = runtime.snapshot?.world;
              const playerId = runtime.playerId;
              if (world === undefined || playerId === null) {
                return false;
              }

              return (
                world.planets.find((planet) => planet.playerId === playerId)
                  ?.shieldActive === true
              );
            },
            initialPlayer: {
              aimWorld: { x: 0, y: 0 },
              selectedRocketKind: "light",
            },
            isSandboxPaused: () => false,
            sandboxControlsEnabled: () => {
              const runtime = options.getRuntimeState();
              return (
                runtime.phase === "combat" &&
                runtime.connectionState === "connected"
              );
            },
            syncAimWorldToPointer: () => {
              syncAimWorldToPointer?.();
            },
            windowTarget: window,
          });
          const viewportInputController = inputController;

          const screenToWorld = (clientX: number, clientY: number): Vec2 => {
            const rect = nextRenderer.domElement.getBoundingClientRect();
            const width = Math.max(1, rect.width);
            const height = Math.max(1, rect.height);
            const aspect = width / height;
            const halfHeight = cameraState.visibleWorldHeight / 2;
            const halfWidth = halfHeight * aspect;
            const normalizedX = (clientX - rect.left) / width;
            const normalizedY = (clientY - rect.top) / height;

            return {
              x:
                cameraState.renderCenterX +
                lerp(-halfWidth, halfWidth, normalizedX),
              y:
                cameraState.renderCenterY +
                lerp(halfHeight, -halfHeight, normalizedY),
            };
          };

          syncAimWorldToPointer = () => {
            const pointerState = viewportInputController.state.pointerState;
            if (
              viewportInputController.state.keyboardAimActive ||
              !pointerState?.hasPointer
            ) {
              return;
            }

            viewportInputController.state.inputState.aimWorld = screenToWorld(
              pointerState.clientX,
              pointerState.clientY,
            );
          };

          resizeViewport();
          window.addEventListener("resize", resizeViewport);

          animationLoopController = createViewportAnimationLoopController({
            hostElement,
            onActiveChange: (active) => {
              previousFrameTimeSec = null;
              lastInputSentAtMs = 0;
              lastShieldAimSentAtMs = 0;
              lastBoostAbilitySentAtSec = Number.NEGATIVE_INFINITY;
              seekerLockTargetId = null;
              seekerLockStartedAtSec = null;
              if (active) {
                resizeViewport();
                syncAimWorldToPointer?.();
              } else {
                viewportInputController.clearPendingGameplayRequests();
              }
            },
            onRenderError: (error) => {
              handleViewportRenderError(error);
            },
            renderFrame: (timeMs = performance.now()) => {
              const performanceState = options.getPerformanceState();
              if (performanceState.resetToken !== lastProfilingResetToken) {
                resetViewportProfilingState(performanceState.profilingEnabled);
                resizeViewport();
                lastProfilingResetToken = performanceState.resetToken;
              }

              const profilingEnabled = performanceState.profilingEnabled;
              const frameProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;
              const nowSec = timeMs * 0.001;
              if (previousFrameTimeSec === null) {
                previousFrameTimeSec = nowSec;
              }

              const frameDeltaSec = clamp(
                nowSec - previousFrameTimeSec,
                0,
                MAX_FRAME_DELTA_SEC,
              );
              previousFrameTimeSec = nowSec;
              const sampledRuntimeStats =
                runtimeStatsTracker.sample(frameDeltaSec);
              runtimeStats.fps = sampledRuntimeStats.fps;
              runtimeStats.frameTimeMs = sampledRuntimeStats.frameTimeMs;
              const runtime = options.getRuntimeState();
              const snapshot = runtime.snapshot;
              const previousSnapshot = runtime.previousSnapshot ?? snapshot;

              const interpolationProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;
              const rawInterpolationAlpha =
                snapshot === null || previousSnapshot === null
                  ? 1
                  : (timeMs -
                      snapshot.receivedAtMs +
                      authoritativeInterpolationLeadMs) /
                    snapshotWindowMs;
              const interpolationAlpha =
                snapshot === null || previousSnapshot === null
                  ? 1
                  : clamp(
                      rawInterpolationAlpha,
                      0,
                      authoritativeInterpolationMaxAlpha,
                    );
              const extrapolating =
                snapshot !== null &&
                timeMs - snapshot.receivedAtMs >
                  authoritativeLateSnapshotThresholdMs;

              const world =
                snapshot === null
                  ? null
                  : syncAuthoritativeInterpolatedWorld(
                      authoritativeInterpolationCache,
                      previousSnapshot?.world ?? snapshot.world,
                      snapshot.world,
                      interpolationAlpha,
                    );
              const interpolationProfilerEndMs = profilingEnabled
                ? performance.now()
                : 0;
              const renderProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;

              const playerId = runtime.playerId;
              const playerPlanet =
                playerId === null || world === null || snapshot === null
                  ? null
                  : (syncAuthoritativeLocalPlayerPrediction({
                      playerId,
                      predictionMs: Math.max(0, timeMs - snapshot.receivedAtMs),
                      renderWorld: world,
                      snapshotTick: snapshot.tick,
                      snapshotWorld: snapshot.world,
                    }) ??
                    world.planets.find(
                      (planet) => planet.playerId === playerId,
                    ) ??
                    null);
              if (playerPlanet !== null) {
                viewportInputController.updateKeyboardAim(
                  playerPlanet.pos,
                  frameDeltaSec,
                );
              }
              ({ cameraShake, damageFlash, hudFlicker } =
                decayAuthoritativeFeedbackLevels({
                  cameraShake,
                  damageFlash,
                  frameDeltaSec,
                  hudFlicker,
                }));
              lastProcessedLaunchBurstSnapshotTick =
                syncAuthoritativeLaunchBurstFeedback({
                  activeLaunchBurstsByKind,
                  currentPlayerId: playerId,
                  currentSnapshot: snapshot,
                  lastProcessedSnapshotTick:
                    lastProcessedLaunchBurstSnapshotTick,
                  previousSnapshotWorld: previousSnapshot?.world,
                  rocketKinds: AUTHORITATIVE_ROCKET_KINDS,
                });
              ({ cameraShake, damageFlash, hudFlicker, lastProcessedEventId } =
                syncAuthoritativeRecentEventFeedback({
                  activeBoostBursts,
                  activeImpactBursts,
                  blackHoleSource:
                    snapshot?.world.blackHole ??
                    previousSnapshot?.world.blackHole ??
                    null,
                  lastProcessedEventId,
                  localAimWorld:
                    viewportInputController.state.inputState.aimWorld,
                  localPlayerPlanet: playerPlanet,
                  maxActiveBoostBursts: MAX_ACTIVE_BOOST_BURSTS,
                  maxActiveImpactBursts: MAX_ACTIVE_IMPACT_BURSTS,
                  nowSec,
                  queueBlackHoleSwallowEffect: ({
                    color,
                    radius,
                    startPos,
                    targetPos,
                  }) => {
                    queueBlackHoleSwallowEffect({
                      activeEffects: activeBlackHoleSwallowEffects,
                      color,
                      inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                      radius,
                      startedAtSec: nowSec,
                      startPos,
                      targetPos,
                    });
                  },
                  runtime,
                  screenEffects: {
                    cameraShake,
                    damageFlash,
                    hudFlicker,
                  },
                }));
              const frame = getCameraFrame(world, playerPlanet);
              const cameraZoomAlpha =
                1 - Math.exp(-CAMERA_ZOOM_LERP * frameDeltaSec);
              cameraState.centerX = smoothAuthoritativeCameraAxis({
                currentValue: cameraState.centerX,
                followLerp: CAMERA_FOLLOW_LERP,
                frameDeltaSec,
                targetValue: frame.centerX,
              });
              cameraState.centerY = smoothAuthoritativeCameraAxis({
                currentValue: cameraState.centerY,
                followLerp: CAMERA_FOLLOW_LERP,
                frameDeltaSec,
                targetValue: frame.centerY,
              });
              cameraState.visibleWorldHeight = lerp(
                cameraState.visibleWorldHeight,
                frame.visibleWorldHeight,
                cameraZoomAlpha,
              );
              const shakeOffsets = getViewportCameraShakeOffsets({
                cameraShake,
                followWorldHeight: getGameplayCameraHeights().followWorldHeight,
                nowSec,
                visibleWorldHeight: cameraState.visibleWorldHeight,
              });
              cameraState.shakeOffsetX = shakeOffsets.x;
              cameraState.shakeOffsetY = shakeOffsets.y;
              applyCameraFrame();
              syncAimWorldToPointer?.();

              syncSharedCombatBackgroundParallax({
                backgroundLayers,
                nowSec,
                renderCenterX: cameraState.renderCenterX,
                renderCenterY: cameraState.renderCenterY,
              });
              const selectedRocketKind =
                viewportInputController.state.inputState.selectedRocketKind;
              const arenaRadius =
                world?.arenaRadius ??
                getRuntimeTuningDocument().gameplay.arena.radius;
              authoritativePlanetsById.clear();
              for (const planet of world?.planets ?? []) {
                authoritativePlanetsById.set(planet.id, planet);
              }
              updateAmbientBoundaryDebrisVisual({
                blackHoleBody:
                  world?.blackHole === undefined
                    ? null
                    : {
                        pos: world.blackHole.pos,
                        radius: world.blackHole.killRadius,
                      },
                enableFallingDebris: false,
                nowSec,
                neutronStarBodies: world?.neutronStars,
                planetBodies: world?.planets,
                sunBodies: world?.suns,
                visual: boundaryDebrisVisual,
                ...getAmbientBoundaryDebrisRadii(arenaRadius),
              });
              const maxDebrisSamples = getBudgetedCount(
                MAX_DEBRIS_SAMPLES,
                renderQuality.debrisBudget,
              );
              updateAuthoritativeDebrisVisual({
                boundaryDebrisVisual,
                debris: world?.debris ?? [],
                maxSamples: maxDebrisSamples,
                nowSec,
                planets: world?.planets ?? [],
                visual: debrisVisual,
              });

              let currentSeekerLockTarget: PlanetPublic | null = null;
              if (
                selectedRocketKind === "seeker" &&
                playerPlanet !== null &&
                world !== null
              ) {
                currentSeekerLockTarget = findAimLockTargetPlanet(
                  world.planets,
                  playerPlanet.id,
                  viewportInputController.state.inputState.aimWorld,
                );
              }
              if (currentSeekerLockTarget === null) {
                seekerLockTargetId = null;
                seekerLockStartedAtSec = null;
              } else {
                if (seekerLockTargetId !== currentSeekerLockTarget.id) {
                  seekerLockStartedAtSec = nowSec;
                }
                seekerLockTargetId = currentSeekerLockTarget.id;
              }
              const currentSeekerLockProgress =
                getAuthoritativeSeekerLockProgress(
                  nowSec,
                  seekerLockStartedAtSec,
                );

              if (
                runtime.phase === "combat" &&
                runtime.connectionState === "connected" &&
                snapshot?.self !== null &&
                world !== null &&
                playerId !== null
              ) {
                if (playerPlanet !== null) {
                  const aimDelta = sub(
                    viewportInputController.state.inputState.aimWorld,
                    playerPlanet.pos,
                  );
                  const aimDir =
                    len(aimDelta) > 0
                      ? normalizeVec2(aimDelta)
                      : ({ x: 1, y: 0 } as Vec2);
                  const shieldActive =
                    playerPlanet.shieldActive && playerPlanet.shieldLoad > 0;

                  if (
                    !shieldActive &&
                    timeMs - lastInputSentAtMs >= INPUT_SEND_INTERVAL_MS
                  ) {
                    lastInputSentAtMs = timeMs;
                    options.dispatchMessage({
                      clientTick: nextClientTick,
                      mouseDir: aimDir,
                      type: "input",
                    });
                    nextClientTick += 1;
                  }
                  if (
                    shieldActive &&
                    timeMs - lastShieldAimSentAtMs >=
                      SHIELD_AIM_SEND_INTERVAL_MS
                  ) {
                    lastShieldAimSentAtMs = timeMs;
                    options.dispatchMessage({
                      dir: aimDir,
                      type: "shieldAim",
                    });
                  }

                  const fireRequested =
                    viewportInputController.consumeShotRequest();
                  if (fireRequested) {
                    const seekerTargetId =
                      selectedRocketKind === "seeker" &&
                      currentSeekerLockProgress >= 1
                        ? currentSeekerLockTarget?.id
                        : undefined;
                    if (
                      selectedRocketKind !== "seeker" ||
                      seekerTargetId !== undefined
                    ) {
                      options.dispatchMessage({
                        aimDir,
                        clientTick: nextClientTick,
                        kind: selectedRocketKind,
                        targetId: seekerTargetId,
                        type: "fireRocket",
                      });
                      ({
                        immediateCannonFlashState,
                        screenEffects: { cameraShake, damageFlash, hudFlicker },
                      } = queueAuthoritativeImmediateFireFeedback({
                        aimDir,
                        immediateFireBurstState,
                        immediateGhostRocketState,
                        nowSec,
                        playerPlanet,
                        rocketKind: selectedRocketKind,
                        screenEffects: {
                          cameraShake,
                          damageFlash,
                          hudFlicker,
                        },
                      }));
                      nextClientTick += 1;
                    }
                  }

                  const pendingAbilityRequests =
                    viewportInputController.state.pendingAbilityRequests;
                  const boostAvailable =
                    (runtime.snapshot?.self?.boostCharges ?? 0) > 0;
                  const nextAbilityRequests = {
                    ...pendingAbilityRequests,
                    boost:
                      pendingAbilityRequests.boost &&
                      boostAvailable &&
                      nowSec - lastBoostAbilitySentAtSec >=
                        getAuthoritativeBoostRepeatIntervalSec(),
                  };
                  for (const abilitySlot of getAuthoritativeAbilitySlots(
                    nextAbilityRequests,
                  )) {
                    if (abilitySlot === "w" && !boostAvailable) {
                      continue;
                    }

                    options.dispatchMessage({
                      aimDir,
                      slot: abilitySlot,
                      type: "ability",
                    });

                    if (abilitySlot === "w") {
                      lastBoostAbilitySentAtSec = nowSec;
                    }
                    ({
                      gravityPulseFeedbackState,
                      immediateShieldFeedbackState,
                      screenEffects: { cameraShake, damageFlash, hudFlicker },
                    } = queueAuthoritativeImmediateAbilityFeedback({
                      abilitySlot,
                      activeBoostBursts,
                      aimDir,
                      gravityPulseFeedbackState,
                      immediateShieldFeedbackState,
                      maxActiveBoostBursts: MAX_ACTIVE_BOOST_BURSTS,
                      nowSec,
                      playerPlanet,
                      screenEffects: {
                        cameraShake,
                        damageFlash,
                        hudFlicker,
                      },
                      snapshotTick: snapshot?.tick ?? null,
                    }));
                  }
                }
              }

              viewportInputController.clearStepScopedRequests();

              const tuning = getRuntimeTuningDocument();
              const planetVisualTuning = tuning.visuals.planets;
              const rocketVisualTuning = tuning.visuals.rockets;
              const scaledRocketVisualTuning =
                getScaledRocketVisuals(rocketVisualTuning);
              const suns = world?.suns ?? [];
              const neutronStars = world?.neutronStars ?? [];
              const planets = world?.planets ?? [];

              syncSharedCombatDynamicSunPresentation({
                blackHole: world?.blackHole ?? null,
                createVisual: ({ sun, sunProfile }) =>
                  createSharedCombatSunVisual({
                    createSunCoreMaterial,
                    createSunGlowMaterial,
                    createWarpMaterial,
                    scene,
                    sunGeometry,
                    sunId: sun.id,
                    sunProfile,
                    warpGeometry,
                  }),
                currentNeutronStars: neutronStars,
                disposeVisual: disposeSharedCombatSunVisual,
                nowSec,
                onSunAbsorbedByNeutronStar: ({ neutronStar, sun, sunId }) => {
                  queueSharedCombatPlanetExplosion({
                    activePlanetExplosions,
                    inactivePlanetExplosionVisuals,
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
                    activeEffects: activeBlackHoleSwallowEffects,
                    color: sun.color,
                    inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                    radius: sun.radius,
                    startedAtSec: nowSec,
                    startPos: sun.pos,
                    targetPos: world!.blackHole!.pos,
                  });
                },
                previousNeutronStarsById,
                previousSunsById: previousSunBodiesById,
                resolveSunProfile: ({ index }) =>
                  getSunVisualProfile(tuning.visuals.suns, index),
                sunVisuals,
                suns,
                syncVisual: ({ index, sun, sunProfile, visual }) => {
                  syncSharedCombatSunVisual({
                    index,
                    nowSec,
                    sun,
                    sunProfile,
                    visual,
                  });
                },
              });

              const neutronStarVisualTuning = tuning.visuals.neutronStars;
              syncSharedCombatDynamicNeutronStarPresentation({
                createVisual: ({ neutronStar }) =>
                  createSharedCombatNeutronStarVisual({
                    createNeutronStarCoreMaterial,
                    createNeutronStarHaloMaterial,
                    createNeutronStarJetMaterial,
                    createNeutronStarLensMaterial,
                    glowGeometry,
                    neutronStarId: neutronStar.id,
                    ribbonGeometry,
                    scene,
                    sunGeometry,
                  }),
                disposeVisual: disposeSharedCombatNeutronStarVisual,
                neutronStarVisuals,
                neutronStars,
                nowSec,
                previousNeutronStarsById,
                syncVisual: ({ index, neutronStar, visual }) => {
                  syncSharedCombatNeutronStarVisual({
                    gameplayTuning: tuning.gameplay.neutronStars,
                    index,
                    nowSec,
                    neutronStar,
                    visual,
                    visualTuning: neutronStarVisualTuning,
                  });
                },
              });

              syncSharedCombatDynamicPlanetPresentation({
                createTrail: ({ planet }) => {
                  const trail = createSharedCombatPlanetTrailVisual({
                    maxTrailSamples: MAX_TRAIL_SAMPLES,
                    trailColor:
                      planetVisualTuning.archetypes[planet.archetype]
                        .trailColor,
                    trailPointSize: TRAIL_POINT_SIZE,
                  });
                  scene.add(trail.points);
                  return trail;
                },
                createVisual: ({ index, planet }) =>
                  createSharedCombatPlanetVisual({
                    archetypeVisuals:
                      planetVisualTuning.archetypes[planet.archetype],
                    createPlanetGlowMaterial,
                    createPlanetMaterial,
                    createPlanetSpinAxis,
                    getPlanetForestProfile,
                    glowGeometry,
                    planet,
                    planetGeometry,
                    planetIndex: index,
                    scene,
                  }),
                disposeTrail: disposeSharedCombatPlanetTrailVisual,
                disposeVisual: disposeSharedCombatPlanetVisual,
                planetTrails,
                planetVisuals,
                planets,
                syncTrail: ({ planet, trail }) => {
                  pushSharedCombatPlanetTrailSample(
                    trail,
                    planet.pos,
                    MAX_TRAIL_SAMPLES,
                  );
                  updateSharedCombatPlanetTrailVisual(trail, MAX_TRAIL_SAMPLES);
                },
                syncVisual: ({ planet, visual }) => {
                  syncSharedCombatPlanetVisual({
                    archetypeVisuals:
                      planetVisualTuning.archetypes[planet.archetype],
                    nowSec,
                    planetPosition: planet.pos,
                    renderRadius: planet.radius,
                    visual,
                  });
                },
              });

              const worldUnitsPerPixel =
                cameraState.visibleWorldHeight /
                Math.max(1, hostElement.clientHeight);
              const cannonLayout = getCannonWorldLayout(
                tuning.visuals.cannon,
                worldUnitsPerPixel,
              );

              const authoritativeShieldActive =
                playerPlanet?.shieldActive === true &&
                playerPlanet.shieldLoad > 0;
              const shieldVisual =
                shieldGroup !== null &&
                shieldArcOpacityUniform !== null &&
                shieldPanelOpacityUniform !== null &&
                shieldCrestOpacityUniform !== null &&
                shieldGlowOpacityUniform !== null
                  ? {
                      arcOpacityUniform: shieldArcOpacityUniform,
                      crestOpacityUniform: shieldCrestOpacityUniform,
                      glowOpacityUniform: shieldGlowOpacityUniform,
                      group: shieldGroup,
                      panelOpacityUniform: shieldPanelOpacityUniform,
                    }
                  : null;
              const lockRingVisual =
                lockRingMesh !== null &&
                lockRingProgressUniform !== null &&
                lockRingLockedUniform !== null &&
                lockRingTimeUniform !== null
                  ? {
                      lockedUniform: lockRingLockedUniform,
                      mesh: lockRingMesh,
                      progressUniform: lockRingProgressUniform,
                      timeUniform: lockRingTimeUniform,
                    }
                  : null;
              const controlsEnabled =
                runtime.phase === "combat" &&
                runtime.connectionState === "connected";
              if (controlsEnabled && playerPlanet !== null) {
                if (
                  immediateCannonFlashState !== null &&
                  nowSec - immediateCannonFlashState.startedAtSec >
                    cannonLayout.flashDurationSec
                ) {
                  immediateCannonFlashState = null;
                }
              }
              let weaponFrame: SharedCombatPresentationFrameState["weapon"] = {
                cannon: null,
                lockRing: null,
              };
              if (
                controlsEnabled &&
                playerPlanet !== null &&
                !authoritativeShieldActive
              ) {
                weaponFrame = {
                  cannon: {
                    accent: rocketVisualTuning[selectedRocketKind].hudAccent,
                    aimTarget:
                      viewportInputController.state.inputState.aimWorld,
                    flashAccent:
                      immediateCannonFlashState === null
                        ? null
                        : rocketVisualTuning[
                            immediateCannonFlashState.rocketKind
                          ].hudAccent,
                    flashAgeSec:
                      immediateCannonFlashState === null
                        ? null
                        : nowSec - immediateCannonFlashState.startedAtSec,
                    layout: cannonLayout,
                    position: playerPlanet.pos,
                    surfaceOffset: playerPlanet.radius,
                    visible: true,
                    z: 6,
                  },
                  lockRing:
                    selectedRocketKind === "seeker" &&
                    currentSeekerLockTarget !== null
                      ? {
                          baseRadius: currentSeekerLockTarget.radius + 22,
                          locked: currentSeekerLockProgress >= 1,
                          nowSec,
                          position: currentSeekerLockTarget.pos,
                          progress: currentSeekerLockProgress,
                          z: 5.5,
                        }
                      : null,
                };
              }

              pruneSharedCombatImpactBursts({
                activeBursts: activeImpactBursts,
                durationSec: IMPACT_BURST_DURATION_SEC,
                nowSec,
              });

              ({
                gravityPulse: gravityPulseFeedbackState,
                shieldImmediateFeedback: immediateShieldFeedbackState,
              } = syncSharedCombatViewportFrame({
                frame: {
                  entity: {
                    caches: {
                      activeCacheIds,
                      badgeBaseSize: tuning.visuals.caches.badgeBaseSize,
                      badgeMaterials: cacheSpriteAssets.badgeMaterials,
                      badgeScale: tuning.visuals.caches.badgeScale,
                      blackHole: world?.blackHole ?? null,
                      cacheVisuals,
                      caches: world?.caches ?? [],
                      createCacheVisual: createSharedCacheVisual,
                      getCacheIconKey: getSharedCacheIconKey,
                      nowSec,
                      previousCachesById: previousCacheBodiesById,
                      queueSwallowEffect: (previousCache) => {
                        queueBlackHoleSwallowEffect({
                          activeEffects: activeBlackHoleSwallowEffects,
                          color: BLACK_HOLE_CACHE_SWALLOW_COLOR,
                          inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                          radius: previousCache.radius * 1.25,
                          startedAtSec: nowSec,
                          startPos: previousCache.pos,
                          targetPos: world!.blackHole!.pos,
                        });
                      },
                      scene,
                      updateCacheVisualBadge: updateSharedCacheVisualBadge,
                    },
                    launchBursts:
                      rocketPools !== null && rocketLaunchBurstPools !== null
                        ? {
                            burstsByKind: activeLaunchBurstsByKind,
                            cannonLayout,
                            currentPlayerId: playerId,
                            launchBurstBudget: renderQuality.launchBurstBudget,
                            launchBurstPools: rocketLaunchBurstPools,
                            nowSec,
                            pruneBeforeSync: true,
                            rocketKinds: AUTHORITATIVE_ROCKET_KINDS,
                            rocketPools,
                            worldUnitsPerPixel,
                          }
                        : null,
                    rockets:
                      rocketPools !== null
                        ? {
                            blackHole: world?.blackHole ?? null,
                            getSwallowMargin: (rocket) =>
                              Math.max(72, rocket.radius * 10),
                            maxRocketTrailSamples: MAX_ROCKET_TRAIL_SAMPLES,
                            nowSec,
                            previousRocketsById: previousRocketBodiesById,
                            queueSwallowEffect: (previousRocket) => {
                              queueBlackHoleSwallowEffect({
                                activeEffects: activeBlackHoleSwallowEffects,
                                color: BLACK_HOLE_ROCKET_SWALLOW_COLOR,
                                inactiveVisuals:
                                  inactiveBlackHoleSwallowVisuals,
                                radius: Math.max(
                                  previousRocket.radius * 2.8,
                                  12,
                                ),
                                startedAtSec: nowSec,
                                startPos: previousRocket.pos,
                                targetPos: world!.blackHole!.pos,
                              });
                            },
                            rocketKinds: AUTHORITATIVE_ROCKET_KINDS,
                            rocketPools,
                            rocketTrailBudget: renderQuality.rocketTrailBudget,
                            rocketTrailStates,
                            rockets: world?.rockets ?? [],
                            rocketsByKind,
                          }
                        : null,
                  },
                  presentation: {
                    blackHole:
                      world?.blackHole === undefined
                        ? null
                        : {
                            killRadius: world.blackHole.killRadius,
                            pos: world.blackHole.pos,
                            z: 5,
                          },
                    boost: {
                      activeBursts: activeBoostBursts,
                      aimTarget:
                        viewportInputController.state.inputState.aimWorld,
                      getBodyById: (planetId: number) =>
                        authoritativePlanetsById.get(planetId) ?? null,
                      heldBoosting:
                        playerPlanet !== null &&
                        controlsEnabled &&
                        (runtime.snapshot?.self?.boostCharges ?? 0) > 0 &&
                        viewportInputController.state.pendingAbilityRequests
                          .boost,
                      maxParticlesPerBurst: BOOST_BURST_PARTICLES,
                      playerBody: playerPlanet,
                    },
                    gravityPulse: {
                      durationSec: IMMEDIATE_GRAVITY_PULSE_DURATION_SEC,
                      pulse: gravityPulseFeedbackState,
                      visibleWorldHeight: cameraState.visibleWorldHeight,
                      z: {
                        core: 5.1,
                        echo: 5.2,
                        ring: 5.25,
                      },
                    },
                    shield: {
                      active: authoritativeShieldActive,
                      activeAimDir: playerPlanet?.shieldAimDir ?? null,
                      bursts: activeImpactBursts,
                      immediateFeedback: immediateShieldFeedbackState,
                      immediateFeedbackDurationSec:
                        IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC,
                      planet: playerPlanet,
                      shieldRadius: playerPlanet?.radius ?? 0,
                    },
                    weapon: weaponFrame,
                  },
                  transient: {
                    blackHoleSwallows: {
                      activeEffects: activeBlackHoleSwallowEffects,
                      inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                    },
                    impactBursts: {
                      bursts: activeImpactBursts,
                      maxVisibleBursts: impactBurstVisuals.length,
                      nowSec,
                      resolveBurst: (burst) => {
                        const targetPlanet = findPlanetById(
                          world,
                          burst.planetId,
                        );
                        const targetPos = targetPlanet?.pos ?? burst.targetPos;
                        const targetRadius =
                          targetPlanet?.radius ?? burst.radius;

                        return {
                          absorbedByShield: burst.absorbedByShield,
                          durationSec: IMPACT_BURST_DURATION_SEC,
                          normal: burst.normal,
                          startedAtSec: burst.startedAtSec,
                          targetPos,
                          targetRadius,
                          targetRenderedRadius: targetRadius,
                        };
                      },
                      visuals: impactBurstVisuals,
                      z: {
                        core: 5.15,
                        glow: 5.05,
                        ring: 5.25,
                      },
                    },
                    nowSec,
                    planetExplosions: {
                      activePlanetExplosions,
                      inactivePlanetExplosionVisuals,
                    },
                  },
                },
                nowSec,
                visuals: {
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
              }));

              syncSharedCombatImmediateFireFeedback({
                burstDurationSec: IMMEDIATE_FIRE_BURST_DURATION_SEC,
                burstStatesByKind: immediateFireBurstState,
                feedbackByKind: immediateFireFeedback,
                ghostDurationSec: IMMEDIATE_GHOST_ROCKET_DURATION_SEC,
                ghostStatesByKind: immediateGhostRocketState,
                nowSec,
                rocketAppearances: scaledRocketVisualTuning,
                rocketSpeeds: {
                  heavy: ROCKET_SPECS.heavy.speed,
                  light: ROCKET_SPECS.light.speed,
                  seeker: ROCKET_SPECS.seeker.speed,
                },
                shouldYieldGhost: ({ ghostPosition, rocketKind }) =>
                  playerId !== null &&
                  (world?.rockets.some((rocket) => {
                    if (
                      rocket.ownerId !== playerId ||
                      rocket.rocketKind !== rocketKind
                    ) {
                      return false;
                    }

                    return (
                      Math.hypot(
                        rocket.pos.x - ghostPosition.x,
                        rocket.pos.y - ghostPosition.y,
                      ) <=
                      Math.max(
                        42,
                        ROCKET_SPECS[rocketKind].speed * 0.04,
                        rocket.radius * 6,
                      )
                    );
                  }) ??
                    false),
              });

              if (nowSec >= lastHudUpdateSec) {
                lastHudUpdateSec = nowSec + HUD_UPDATE_INTERVAL_SEC;
                emitConnectionHud(timeMs, extrapolating);
              }

              const renderProfilerEndMs = profilingEnabled
                ? performance.now()
                : 0;
              const submitProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;
              postProcessing.render();
              if (profilingEnabled) {
                const submitProfilerEndMs = performance.now();
                performanceProfiler.record({
                  frameCpuMs: submitProfilerEndMs - frameProfilerStartMs,
                  frameDeltaSec,
                  interpolationMs:
                    interpolationProfilerEndMs - interpolationProfilerStartMs,
                  renderCpuMs: renderProfilerEndMs - renderProfilerStartMs,
                  simulationMs: 0,
                  stepCount: 0,
                  submitMs: submitProfilerEndMs - submitProfilerStartMs,
                });
              }
            },
            renderer: nextRenderer,
          });
        },
      });
    } catch (error) {
      disposeViewportSession();
      managedViewportSession.reportFailure(error);
    }
  };

  const disposeViewport = () => {
    if (cleanupComplete) {
      return;
    }

    cleanupComplete = true;
    disposeViewportSession();
  };

  void startViewport();

  return () => {
    disposed = true;
    disposeViewport();
  };
}

const sceneRemoveSafe = (...objects: Object3D[]) => {
  for (const object of objects) {
    object.parent?.remove(object);
  }
};
