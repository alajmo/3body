import type {
  RocketKind,
  ClientMsg,
  PlanetPublic,
  SnapshotEvent,
  Vec2,
  World,
} from "@3body/shared";
import {
  ARENA_RADIUS,
  BOOST_SPEC,
  GRAVITY_PULSE_SPEC,
  ROCKET_SPECS,
  SHIELD_SPEC,
  add,
  clamp,
  getNeutronStarMassAlpha,
  getSunVisualProfile,
  len,
  lerp,
  normalize as normalizeVec2,
  scale,
  SNAPSHOT_HZ,
  sub,
} from "@3body/shared";
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  type WebGPURenderer,
} from "three/webgpu";
import type { AuthoritativeMatchRuntimeState } from "./authoritativeMatchRuntime";
import {
  createCacheSpriteAssets,
  createCacheVisual as createSharedCacheVisual,
  disposeCacheSpriteAssets,
  getCacheArenaBadgeSize,
  getCacheIconKey as getSharedCacheIconKey,
  updateCacheVisualBadge as updateSharedCacheVisualBadge,
  type CacheVisual,
} from "./viewport/cacheVisuals";
import { buildAuthoritativeHudState } from "./viewport/authoritativeHud";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import { createGameViewportInputController } from "./viewport/localInput";
import {
  clearLocalViewportPlanetExplosions,
  queueLocalViewportPlanetExplosion,
  updateLocalViewportPlanetExplosions,
} from "./viewport/localViewportScene";
import { createViewportPerformanceProfiler } from "./viewport/performanceProfiler";
import { DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE } from "./viewport/renderQuality";
import { disposeViewportDisposables } from "./viewport/disposables";
import {
  disposeViewportRendererSession,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";
import { createManagedViewportSession } from "./viewport/managedViewportSession";
import {
  createPlanetTrailVisual,
  type PlanetTrailVisual,
  pushPlanetTrailSample,
  updatePlanetTrailVisual,
} from "./viewport/authoritativeTrailVisual";
import {
  createViewportRendererSizeState,
  getViewportHostSize,
  syncViewportRendererSize,
} from "./viewport/rendererSizing";
import {
  createAuthoritativeInterpolationCache,
  syncAuthoritativeInterpolatedWorld,
} from "./viewport/authoritativeInterpolation";
import { syncAuthoritativeLocalPlayerPrediction } from "./viewport/authoritativeLocalPlayerPrediction";
import { getCannonWorldLayout } from "./rocketVisibility";
import { getScaledRocketVisuals } from "./rocketVisualTuning";
import {
  CAMERA_SHAKE_DURATION_SEC,
  getRocketImpactCameraShake,
  getRocketImpactHudFlicker,
  getRocketImpactScreenFlash,
  getViewportCameraShakeOffsets,
  ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC,
  ROCKET_IMPACT_SCREEN_FLASH_DURATION_SEC,
} from "./viewport/cameraShake";
import { createRuntimeStatsTracker } from "./viewport/runtimeStats";
import {
  areHudStatesEqual,
  createInitialHudState,
  type GameViewportHudState,
} from "./viewportHud";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import {
  getNeutronStarVisualShape,
  NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
} from "./neutronStarVisuals";
import {
  createBackgroundLayer,
  createBackgroundLayerConfigs,
  createBackdropMaterial,
  createSceneBackgroundColor,
  createPlanetGlowMaterial,
  createPlanetMaterial,
  createPlanetSpinAxis,
  createRocketFlameMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  getPlanetForestProfile,
  syncBackdropFrame,
  wrapCentered,
} from "./showcaseVisuals";
import { createShieldVisual } from "./shieldVisuals";
import {
  SHIELD_GLOW_OUTER_SCALE,
  SHIELD_INNER_SCALE,
  SHIELD_OUTER_SCALE,
} from "./shieldPresentation";
import {
  createPlanetExplosionVisual,
  createNeutronStarCoreMaterial,
  createNeutronStarHaloMaterial,
  createNeutronStarJetMaterial,
  createNeutronStarLensMaterial,
  createBlackHoleCoreMaterial,
  createBlackHoleLensMaterial,
  createBlackHoleRingMaterial,
  createRocketLaunchBurstMaterial,
} from "./viewport/localViewportVisualFactories";
import {
  getAuthoritativeInterpolationDelayMs,
  getAuthoritativeInterpolationMaxAlpha,
  getAuthoritativeLateSnapshotThresholdMs,
} from "./viewport/authoritativeLatency";
import {
  getAuthoritativeAbilitySlots,
  smoothAuthoritativeCameraAxis,
} from "./viewport/authoritativeViewportBehavior";
import {
  createBlackHoleSwallowVisualPool,
  getBlackHoleVisualScale,
  queueBlackHoleSwallowEffect,
  updateBlackHoleSwallowEffects,
  type BlackHoleSwallowState,
} from "./viewport/blackHoleVisuals";
import {
  findAbsorbingNeutronStar,
  getNeutronStarAbsorptionExplosionRadius,
} from "./neutronStarAbsorption";

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
const MAX_ACTIVE_NEUTRON_STAR_ABSORPTION_EXPLOSIONS = 8;
const BLACK_HOLE_ROCKET_SWALLOW_COLOR = "#ffd7ac";
const BLACK_HOLE_CACHE_SWALLOW_COLOR = "#fff0bb";
const CANNON_BAND_POSITION = 0.32;
const IMMEDIATE_FIRE_BURST_DURATION_SEC = 0.12;
const IMMEDIATE_GHOST_ROCKET_DURATION_SEC = 0.18;
const IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC = 0.18;
const IMMEDIATE_BOOST_FEEDBACK_DURATION_SEC = 0.42;
const IMMEDIATE_GRAVITY_PULSE_DURATION_SEC = 0.95;

interface PlanetVisual {
  glowMesh: Mesh;
  glowOpacityUniform: ReturnType<
    typeof createPlanetGlowMaterial
  >["opacityUniform"];
  material: ReturnType<typeof createPlanetMaterial>;
  mesh: Mesh;
  spinAxis: ReturnType<typeof createPlanetSpinAxis>;
  spinPhase: number;
}

interface RocketVisual {
  body: Mesh;
  flame: Mesh;
  group: Group;
  trail: Mesh;
}

interface CannonVisual {
  accentMaterial: MeshBasicMaterial;
  barrelBandMesh: Mesh;
  barrelMesh: Mesh;
  breechMesh: Mesh;
  flashMaterial: MeshBasicMaterial;
  flashMesh: Mesh;
  group: Group;
  muzzleMesh: Mesh;
  stemMesh: Mesh;
}

interface SunVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  rotationSpeed: number;
  warpMesh: Mesh;
}

interface NeutronStarVisual {
  coreMesh: Mesh;
  group: Group;
  haloMesh: Mesh;
  jetMeshA: Mesh;
  jetMeshB: Mesh;
  lensMesh: Mesh;
  phase: number;
  spinSpeed: number;
}

interface BlackHoleSwallowTrackedBody {
  color: string;
  pos: Vec2;
  radius: number;
}

interface TrackedNeutronStarBody {
  mass: number;
  pos: Vec2;
  radius: number;
}

interface TrackedSunBody extends BlackHoleSwallowTrackedBody {
  vel: Vec2;
}

interface ImmediateFireBurstState {
  direction: Vec2;
  origin: Vec2;
  radius: number;
  startedAtSec: number;
}

interface ImmediateGhostRocketState {
  direction: Vec2;
  origin: Vec2;
  startedAtSec: number;
  velocity: Vec2;
}

interface ImmediateBoostFeedbackState {
  direction: Vec2;
  startedAtSec: number;
}

interface ImmediateGravityPulseFeedbackState {
  effectRadius: number;
  origin: Vec2;
  planetRadius: number;
  startedAtSec: number;
}

interface ImmediateShieldFeedbackState {
  aimDir: Vec2;
  startedAtSec: number;
}

interface ImmediateCannonFlashState {
  rocketKind: RocketKind;
  startedAtSec: number;
}

interface ImmediateFireFeedbackVisual {
  burstMesh: Mesh;
  ghost: RocketVisual;
}

interface GravityPulseVisual {
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  echoMaterial: MeshBasicMaterial;
  echoMesh: Mesh;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
}

interface CreateAuthoritativeViewportOptions {
  dispatchMessage: (message: ClientMsg) => void;
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

const worldContainsPlayerPlanet = (
  world: World | null | undefined,
  playerId: string,
  planetId: number,
): boolean =>
  world?.planets.some(
    (planet) => planet.id === planetId && planet.playerId === playerId,
  ) ?? false;

const isPlayerRocketHitEvent = (
  runtime: AuthoritativeMatchRuntimeState,
  event: Extract<SnapshotEvent, { kind: "hit" }>,
): boolean => {
  if (runtime.playerId === null) {
    return false;
  }

  return (
    worldContainsPlayerPlanet(
      runtime.snapshot?.world ?? null,
      runtime.playerId,
      event.victimPlanetId,
    ) ||
    worldContainsPlayerPlanet(
      runtime.previousSnapshot?.world ?? null,
      runtime.playerId,
      event.victimPlanetId,
    )
  );
};

const hideRocketVisual = (visual: RocketVisual) => {
  visual.group.visible = false;
};

const hideImmediateFireFeedbackVisual = (
  visual: ImmediateFireFeedbackVisual,
) => {
  visual.burstMesh.visible = false;
  hideRocketVisual(visual.ghost);
};

const syncRocketVisualTransform = ({
  appearance,
  position,
  velocity,
  visual,
  z = 3,
}: {
  appearance: ReturnType<typeof getScaledRocketVisuals>[RocketKind];
  position: Vec2;
  velocity: Vec2;
  visual: RocketVisual;
  z?: number;
}) => {
  const angle = Math.atan2(velocity.y, velocity.x);
  visual.group.visible = true;
  visual.group.position.set(position.x, position.y, z);
  visual.group.rotation.z = angle;
  visual.body.scale.set(
    appearance.bodyScale.x,
    appearance.bodyScale.y,
    appearance.bodyScale.y,
  );
  visual.trail.position.set(-appearance.bodyScale.x * 0.6, 0, -0.1);
  visual.trail.scale.set(appearance.trailScale.x, appearance.trailScale.y, 1);
  visual.flame.position.set(-appearance.bodyScale.x * 0.45, 0, 0.05);
  visual.flame.scale.set(appearance.flameScale.x, appearance.flameScale.y, 1);
};

const hideGravityPulseVisual = (visual: GravityPulseVisual) => {
  visual.coreMesh.visible = false;
  visual.ringMesh.visible = false;
  visual.echoMesh.visible = false;
  visual.coreMaterial.opacity = 0;
  visual.ringMaterial.opacity = 0;
  visual.echoMaterial.opacity = 0;
};

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
  const rocketVisuals = new Map<number, RocketVisual>();
  const cacheVisuals = new Map<number, CacheVisual>();
  const activeBlackHoleSwallowEffects: BlackHoleSwallowState[] = [];
  const activePlanetExplosions: Parameters<
    typeof queueLocalViewportPlanetExplosion
  >[0]["activePlanetExplosions"] = [];
  let shieldGroup: Group | null = null;
  let shieldArcOpacityUniform: { value: number } | null = null;
  let shieldPanelOpacityUniform: { value: number } | null = null;
  let shieldCrestOpacityUniform: { value: number } | null = null;
  let shieldGlowOpacityUniform: { value: number } | null = null;
  let cannonVisual: CannonVisual | null = null;
  let immediateCannonFlashState: ImmediateCannonFlashState | null = null;
  let boostFeedbackMesh: Mesh | null = null;
  let boostFeedbackState: ImmediateBoostFeedbackState | null = null;
  let gravityPulseVisual: GravityPulseVisual | null = null;
  let gravityPulseFeedbackState: ImmediateGravityPulseFeedbackState | null =
    null;
  const immediateFireFeedback = new Map<
    RocketKind,
    ImmediateFireFeedbackVisual
  >();
  const immediateFireBurstState = new Map<
    RocketKind,
    ImmediateFireBurstState
  >();
  const immediateGhostRocketState = new Map<
    RocketKind,
    ImmediateGhostRocketState
  >();
  let immediateShieldFeedbackState: ImmediateShieldFeedbackState | null = null;
  let inactivePlanetExplosionVisuals: Parameters<
    typeof updateLocalViewportPlanetExplosions
  >[0]["inactivePlanetExplosionVisuals"] = [];
  const previousCacheBodiesById = new Map<
    number,
    BlackHoleSwallowTrackedBody
  >();
  const previousRocketBodiesById = new Map<
    number,
    BlackHoleSwallowTrackedBody
  >();
  const previousNeutronStarsById = new Map<number, TrackedNeutronStarBody>();
  const previousSunBodiesById = new Map<number, TrackedSunBody>();
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
      sceneRemoveSafe(visual.coreMesh, visual.glowMesh, visual.warpMesh);
    }
    for (const visual of neutronStarVisuals.values()) {
      sceneRemoveSafe(visual.group);
    }
    for (const visual of planetVisuals.values()) {
      sceneRemoveSafe(visual.mesh, visual.glowMesh);
    }
    for (const trail of planetTrails.values()) {
      sceneRemoveSafe(trail.points);
    }
    for (const visual of rocketVisuals.values()) {
      sceneRemoveSafe(visual.group);
    }
    for (const visual of cacheVisuals.values()) {
      sceneRemoveSafe(visual.group);
    }
    if (shieldGroup !== null) {
      sceneRemoveSafe(shieldGroup);
      shieldGroup = null;
    }
    if (cannonVisual !== null) {
      sceneRemoveSafe(cannonVisual.group);
      cannonVisual = null;
    }
    if (boostFeedbackMesh !== null) {
      sceneRemoveSafe(boostFeedbackMesh);
      boostFeedbackMesh = null;
    }
    if (gravityPulseVisual !== null) {
      sceneRemoveSafe(
        gravityPulseVisual.coreMesh,
        gravityPulseVisual.ringMesh,
        gravityPulseVisual.echoMesh,
      );
      gravityPulseVisual = null;
    }
    for (const feedback of immediateFireFeedback.values()) {
      sceneRemoveSafe(feedback.burstMesh, feedback.ghost.group);
    }
    sunVisuals.clear();
    neutronStarVisuals.clear();
    planetVisuals.clear();
    planetTrails.clear();
    rocketVisuals.clear();
    cacheVisuals.clear();
    immediateFireFeedback.clear();
    immediateFireBurstState.clear();
    immediateGhostRocketState.clear();
    activeBlackHoleSwallowEffects.length = 0;
    clearLocalViewportPlanetExplosions({
      activePlanetExplosions,
      inactivePlanetExplosionVisuals,
    });
    previousCacheBodiesById.clear();
    previousNeutronStarsById.clear();
    previousRocketBodiesById.clear();
    previousSunBodiesById.clear();
    shieldArcOpacityUniform = null;
    shieldPanelOpacityUniform = null;
    shieldCrestOpacityUniform = null;
    shieldGlowOpacityUniform = null;
    immediateCannonFlashState = null;
    boostFeedbackState = null;
    gravityPulseFeedbackState = null;
    immediateShieldFeedbackState = null;

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
          const scene = new Scene();
          scene.background = createSceneBackgroundColor(backgroundVisuals);

          const nextCamera = new OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
          nextCamera.position.set(0, 0, CAMERA_DISTANCE);
          nextCamera.lookAt(0, 0, 0);
          camera = nextCamera;

          const backdropGeometry = new PlaneGeometry(1, 1);
          const backdropMaterial = createBackdropMaterial(backgroundVisuals);
          backdropMesh = new Mesh(backdropGeometry, backdropMaterial);
          backdropMesh.frustumCulled = false;
          backdropMesh.renderOrder = -40;
          scene.add(backdropMesh);
          disposables.push(backdropGeometry, backdropMaterial);

          const backgroundLayers = createBackgroundLayerConfigs(
            backgroundVisuals,
          ).map((layerConfig) => {
            const layer = createBackgroundLayer(layerConfig);
            scene.add(layer.group);
            disposables.push(layer.geometry, layer.material);
            return layer;
          });

          const sunGeometry = new SphereGeometry(1, 40, 40);
          const planetGeometry = new SphereGeometry(1, 56, 56);
          const glowGeometry = new CircleGeometry(1, 48);
          const warpGeometry = new RingGeometry(0.55, 1, 72);
          const rocketGeometry = new CylinderGeometry(0.58, 1, 1, 18, 1);
          const ribbonGeometry = new PlaneGeometry(1, 1);
          const blackHoleCoreGeometry = new CircleGeometry(1, 64);
          const boundaryGeometry = new RingGeometry(0.995, 1.005, 256);
          rocketGeometry.rotateZ(-Math.PI / 2);
          disposables.push(
            sunGeometry,
            planetGeometry,
            glowGeometry,
            warpGeometry,
            rocketGeometry,
            ribbonGeometry,
            blackHoleCoreGeometry,
            boundaryGeometry,
          );

          const boundaryMaterial = new MeshBasicMaterial({
            color: "#6988ad",
            depthWrite: false,
            opacity: 0.28,
            transparent: true,
          });
          const boundaryMesh = new Mesh(boundaryGeometry, boundaryMaterial);
          boundaryMesh.position.z = -6;
          boundaryMesh.scale.set(ARENA_RADIUS, ARENA_RADIUS, 1);
          scene.add(boundaryMesh);
          disposables.push(boundaryMaterial);

          const inactiveBlackHoleSwallowVisuals =
            createBlackHoleSwallowVisualPool({
              capacity: MAX_ACTIVE_BLACK_HOLE_SWALLOWS,
              disposables,
              document: hostElement.ownerDocument,
              scene,
            });

          const impactFlashGeometry = new CircleGeometry(1, 48);
          const impactRingGeometry = new RingGeometry(0.72, 1, 56);
          const planetExplosionFragmentGeometries = [
            new BoxGeometry(1, 1, 1, 3, 3, 3),
            new BoxGeometry(1, 1, 1, 2, 3, 2),
            new SphereGeometry(1, 10, 10),
          ] satisfies readonly BufferGeometry[];
          const planetExplosionVisuals = Array.from(
            { length: MAX_ACTIVE_NEUTRON_STAR_ABSORPTION_EXPLOSIONS },
            () =>
              createPlanetExplosionVisual(
                scene,
                impactFlashGeometry,
                impactRingGeometry,
                planetExplosionFragmentGeometries,
              ),
          );
          inactivePlanetExplosionVisuals = [...planetExplosionVisuals];
          disposables.push(impactFlashGeometry, impactRingGeometry);
          disposables.push(...planetExplosionFragmentGeometries);
          disposables.push(
            ...planetExplosionVisuals.flatMap((visual) => [
              visual.coreMaterial,
              visual.glowMaterial,
              visual.ringMaterial,
              visual.shockwaveMaterial,
              ...visual.chunkMaterials,
            ]),
          );

          const blackHoleGroup = new Group();
          const blackHoleVisualTuning =
            getRuntimeTuningDocument().visuals.blackHole;
          const blackHoleLens = new Mesh(
            new CircleGeometry(1, 72),
            createBlackHoleLensMaterial(),
          );
          const blackHoleRing = new Mesh(
            new RingGeometry(0.42, 1, 96),
            createBlackHoleRingMaterial(),
          );
          const blackHoleCore = new Mesh(
            blackHoleCoreGeometry,
            createBlackHoleCoreMaterial(),
          );
          blackHoleLens.scale.set(
            blackHoleVisualTuning.lensRadius,
            blackHoleVisualTuning.lensRadius,
            1,
          );
          blackHoleRing.scale.set(
            blackHoleVisualTuning.ringRadius,
            blackHoleVisualTuning.ringRadius,
            1,
          );
          blackHoleCore.scale.set(
            blackHoleVisualTuning.coreRadius,
            blackHoleVisualTuning.coreRadius,
            1,
          );
          blackHoleLens.position.z = -2;
          blackHoleRing.position.z = -1;
          blackHoleCore.position.z = 0;
          blackHoleGroup.visible = false;
          blackHoleLens.renderOrder = 4;
          blackHoleRing.renderOrder = 5;
          blackHoleCore.renderOrder = 6;
          blackHoleGroup.add(blackHoleLens, blackHoleRing, blackHoleCore);
          scene.add(blackHoleGroup);
          disposables.push(
            blackHoleLens.geometry,
            blackHoleLens.material as { dispose: () => void },
            blackHoleRing.geometry,
            blackHoleRing.material as { dispose: () => void },
            blackHoleCore.material as { dispose: () => void },
          );

          const cacheSpriteAssets = createCacheSpriteAssets(
            hostElement.ownerDocument,
          );
          disposables.push({
            dispose: () => {
              disposeCacheSpriteAssets(cacheSpriteAssets);
            },
          });
          const initialTuning = getRuntimeTuningDocument();
          const abilityVisuals = initialTuning.visuals.abilities;
          const shieldVisual = createShieldVisual({
            arcDeg:
              initialTuning.gameplay.abilities.shield?.arcDeg ??
              SHIELD_SPEC.arcDeg,
            glowOuterScale: SHIELD_GLOW_OUTER_SCALE,
            innerScale: SHIELD_INNER_SCALE,
            outerScale: SHIELD_OUTER_SCALE,
            shieldColor: abilityVisuals.shieldColor,
          });
          shieldGroup = shieldVisual.shieldGroup;
          shieldArcOpacityUniform = shieldVisual.shieldArcOpacityUniform;
          shieldPanelOpacityUniform = shieldVisual.shieldPanelOpacityUniform;
          shieldCrestOpacityUniform = shieldVisual.shieldCrestOpacityUniform;
          shieldGlowOpacityUniform = shieldVisual.shieldGlowOpacityUniform;
          shieldGroup.visible = false;
          scene.add(shieldGroup);
          disposables.push(
            shieldVisual.shieldGlowMesh.geometry,
            shieldVisual.shieldGlowMaterial,
            shieldVisual.shieldArcMesh.geometry,
            shieldVisual.shieldArcMaterial,
            shieldVisual.shieldPanelMesh.geometry,
            shieldVisual.shieldPanelMaterial,
            shieldVisual.shieldCrestMesh.geometry,
            shieldVisual.shieldCrestMaterial,
          );

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
          const cannonStemGeometry = new CylinderGeometry(1, 1, 1, 16);
          const cannonBarrelGeometry = new CylinderGeometry(1, 1, 1, 20);
          const cannonBarrelBandGeometry = new CylinderGeometry(1, 1, 1, 20);
          const cannonMuzzleGeometry = new CylinderGeometry(1, 1, 1, 22);
          const cannonBreechGeometry = new BoxGeometry(1, 1, 1);
          const cannonFlashGeometry = new SphereGeometry(1, 18, 12);
          cannonStemGeometry.rotateZ(-Math.PI / 2);
          cannonBarrelGeometry.rotateZ(-Math.PI / 2);
          cannonBarrelBandGeometry.rotateZ(-Math.PI / 2);
          cannonMuzzleGeometry.rotateZ(-Math.PI / 2);
          const cannonStemMesh = new Mesh(
            cannonStemGeometry,
            cannonMetalMaterial,
          );
          cannonStemMesh.renderOrder = 14;
          const cannonBreechMesh = new Mesh(
            cannonBreechGeometry,
            cannonMetalMaterial,
          );
          cannonBreechMesh.renderOrder = 15;
          const cannonBarrelMesh = new Mesh(
            cannonBarrelGeometry,
            cannonMetalMaterial,
          );
          cannonBarrelMesh.renderOrder = 16;
          const cannonBarrelBandMesh = new Mesh(
            cannonBarrelBandGeometry,
            cannonAccentMaterial,
          );
          cannonBarrelBandMesh.renderOrder = 17;
          const cannonMuzzleMesh = new Mesh(
            cannonMuzzleGeometry,
            cannonAccentMaterial,
          );
          cannonMuzzleMesh.renderOrder = 18;
          const cannonFlashMesh = new Mesh(
            cannonFlashGeometry,
            cannonFlashMaterial,
          );
          cannonFlashMesh.renderOrder = 20;
          cannonFlashMesh.visible = false;
          const cannonGroup = new Group();
          cannonGroup.visible = false;
          cannonGroup.position.z = 6;
          cannonGroup.add(
            cannonStemMesh,
            cannonBreechMesh,
            cannonBarrelMesh,
            cannonBarrelBandMesh,
            cannonMuzzleMesh,
            cannonFlashMesh,
          );
          scene.add(cannonGroup);
          cannonVisual = {
            accentMaterial: cannonAccentMaterial,
            barrelBandMesh: cannonBarrelBandMesh,
            barrelMesh: cannonBarrelMesh,
            breechMesh: cannonBreechMesh,
            flashMaterial: cannonFlashMaterial,
            flashMesh: cannonFlashMesh,
            group: cannonGroup,
            muzzleMesh: cannonMuzzleMesh,
            stemMesh: cannonStemMesh,
          };
          disposables.push(
            cannonMetalMaterial,
            cannonAccentMaterial,
            cannonFlashMaterial,
            cannonStemGeometry,
            cannonBreechGeometry,
            cannonBarrelGeometry,
            cannonBarrelBandGeometry,
            cannonMuzzleGeometry,
            cannonFlashGeometry,
          );

          const boostBurstMaterial = createRocketLaunchBurstMaterial(
            abilityVisuals.boostColor,
            abilityVisuals.boostColor,
          );
          boostFeedbackMesh = new Mesh(ribbonGeometry, boostBurstMaterial);
          boostFeedbackMesh.renderOrder = 6;
          boostFeedbackMesh.visible = false;
          scene.add(boostFeedbackMesh);
          disposables.push(boostBurstMaterial);

          const gravityPulseCoreMaterial = new MeshBasicMaterial({
            blending: AdditiveBlending,
            color: abilityVisuals.wildcardColor,
            depthWrite: false,
            opacity: 0,
            transparent: true,
          });
          const gravityPulseRingMaterial = new MeshBasicMaterial({
            blending: AdditiveBlending,
            color: abilityVisuals.wildcardColor,
            depthWrite: false,
            opacity: 0,
            transparent: true,
          });
          const gravityPulseEchoMaterial = new MeshBasicMaterial({
            blending: AdditiveBlending,
            color: abilityVisuals.wildcardColor,
            depthWrite: false,
            opacity: 0,
            transparent: true,
          });
          gravityPulseVisual = {
            coreMaterial: gravityPulseCoreMaterial,
            coreMesh: new Mesh(impactFlashGeometry, gravityPulseCoreMaterial),
            echoMaterial: gravityPulseEchoMaterial,
            echoMesh: new Mesh(impactRingGeometry, gravityPulseEchoMaterial),
            ringMaterial: gravityPulseRingMaterial,
            ringMesh: new Mesh(impactRingGeometry, gravityPulseRingMaterial),
          };
          gravityPulseVisual.coreMesh.renderOrder = 6;
          gravityPulseVisual.echoMesh.renderOrder = 7;
          gravityPulseVisual.ringMesh.renderOrder = 8;
          hideGravityPulseVisual(gravityPulseVisual);
          scene.add(
            gravityPulseVisual.coreMesh,
            gravityPulseVisual.echoMesh,
            gravityPulseVisual.ringMesh,
          );
          disposables.push(
            gravityPulseCoreMaterial,
            gravityPulseRingMaterial,
            gravityPulseEchoMaterial,
          );

          for (const rocketKind of Object.keys(ROCKET_SPECS) as RocketKind[]) {
            const rocketAppearance = getScaledRocketVisuals(
              initialTuning.visuals.rockets,
            )[rocketKind];
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
            } satisfies ImmediateFireFeedbackVisual;
            hideImmediateFireFeedbackVisual(feedbackVisual);
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
              cameraShake = Math.max(
                0,
                cameraShake - frameDeltaSec / CAMERA_SHAKE_DURATION_SEC,
              );
              damageFlash = Math.max(
                0,
                damageFlash -
                  frameDeltaSec / ROCKET_IMPACT_SCREEN_FLASH_DURATION_SEC,
              );
              hudFlicker = Math.max(
                0,
                hudFlicker -
                  frameDeltaSec / ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC,
              );
              const latestEventId =
                runtime.recentEvents[runtime.recentEvents.length - 1]?.id ?? 0;
              const blackHoleSource =
                snapshot?.world.blackHole ??
                previousSnapshot?.world.blackHole ??
                null;
              if (
                lastProcessedEventId === null ||
                latestEventId < lastProcessedEventId
              ) {
                lastProcessedEventId = latestEventId;
              } else {
                for (const eventRecord of runtime.recentEvents) {
                  if (eventRecord.id <= lastProcessedEventId) {
                    continue;
                  }

                  if (
                    eventRecord.event.kind === "hit" &&
                    isPlayerRocketHitEvent(runtime, eventRecord.event)
                  ) {
                    damageFlash = Math.max(
                      damageFlash,
                      eventRecord.event.hpAfter <= 0
                        ? 1
                        : getRocketImpactScreenFlash({
                            absorbedByShield:
                              eventRecord.event.absorbedByShield,
                            rocketKind: eventRecord.event.rocketKind,
                          }),
                    );
                    hudFlicker = Math.max(
                      hudFlicker,
                      getRocketImpactHudFlicker({
                        absorbedByShield: eventRecord.event.absorbedByShield,
                        rocketKind: eventRecord.event.rocketKind,
                      }),
                    );
                    cameraShake = Math.max(
                      cameraShake,
                      eventRecord.event.hpAfter <= 0
                        ? 1
                        : getRocketImpactCameraShake({
                            absorbedByShield:
                              eventRecord.event.absorbedByShield,
                            rocketKind: eventRecord.event.rocketKind,
                          }),
                    );
                  }

                  if (
                    eventRecord.event.kind === "kill" &&
                    eventRecord.event.cause === "blackHole" &&
                    blackHoleSource !== null
                  ) {
                    const blackHoleKillEvent = eventRecord.event;
                    const swallowedPlanet =
                      previousSnapshot?.world.planets.find(
                        (planet) =>
                          planet.id === blackHoleKillEvent.victimPlanetId,
                      ) ??
                      snapshot?.world.planets.find(
                        (planet) =>
                          planet.id === blackHoleKillEvent.victimPlanetId,
                      ) ??
                      null;

                    if (swallowedPlanet !== null) {
                      const archetypeVisual =
                        getRuntimeTuningDocument().visuals.planets.archetypes[
                          swallowedPlanet.archetype
                        ];
                      queueBlackHoleSwallowEffect({
                        activeEffects: activeBlackHoleSwallowEffects,
                        color: archetypeVisual.color,
                        inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                        radius:
                          swallowedPlanet.radius * archetypeVisual.bodyScale,
                        startedAtSec: nowSec,
                        startPos: swallowedPlanet.pos,
                        targetPos: blackHoleSource.pos,
                      });
                    }
                  }
                }
                lastProcessedEventId = latestEventId;
              }
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

              for (const layer of backgroundLayers) {
                layer.group.position.x = wrapCentered(
                  cameraState.renderCenterX * layer.parallax +
                    nowSec * layer.driftX,
                  layer.tileSize,
                );
                layer.group.position.y = wrapCentered(
                  cameraState.renderCenterY * layer.parallax +
                    nowSec * layer.driftY,
                  layer.tileSize,
                );
              }

              const boundaryRadius = world?.arenaRadius ?? ARENA_RADIUS;
              boundaryMesh.scale.set(boundaryRadius, boundaryRadius, 1);

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
                    const selectedRocketKind =
                      viewportInputController.state.inputState
                        .selectedRocketKind;
                    options.dispatchMessage({
                      aimDir,
                      clientTick: nextClientTick,
                      kind: selectedRocketKind,
                      type: "fireRocket",
                    });
                    const rocketSpec = ROCKET_SPECS[selectedRocketKind];
                    const fireOrigin = add(
                      playerPlanet.pos,
                      scale(
                        aimDir,
                        playerPlanet.radius + rocketSpec.radius * 1.4,
                      ),
                    );
                    immediateFireBurstState.set(selectedRocketKind, {
                      direction: { x: aimDir.x, y: aimDir.y },
                      origin: fireOrigin,
                      radius: playerPlanet.radius,
                      startedAtSec: nowSec,
                    });
                    immediateCannonFlashState = {
                      rocketKind: selectedRocketKind,
                      startedAtSec: nowSec,
                    };
                    immediateGhostRocketState.set(selectedRocketKind, {
                      direction: { x: aimDir.x, y: aimDir.y },
                      origin: fireOrigin,
                      startedAtSec: nowSec,
                      velocity: scale(aimDir, rocketSpec.speed),
                    });
                    cameraShake = Math.max(cameraShake, 0.12);
                    hudFlicker = Math.max(hudFlicker, 0.05);
                    nextClientTick += 1;
                  }

                  const pendingAbilityRequests =
                    viewportInputController.state.pendingAbilityRequests;
                  const boostAvailable =
                    (runtime.snapshot?.self?.boostCharges ?? 0) > 0;
                  for (const abilitySlot of getAuthoritativeAbilitySlots(
                    pendingAbilityRequests,
                  )) {
                    if (abilitySlot === "w" && !boostAvailable) {
                      continue;
                    }

                    options.dispatchMessage({
                      aimDir,
                      slot: abilitySlot,
                      type: "ability",
                    });

                    switch (abilitySlot) {
                      case "q":
                        immediateShieldFeedbackState = {
                          aimDir: { x: aimDir.x, y: aimDir.y },
                          startedAtSec: nowSec,
                        };
                        hudFlicker = Math.max(hudFlicker, 0.06);
                        break;
                      case "w":
                        boostFeedbackState = {
                          direction: { x: aimDir.x, y: aimDir.y },
                          startedAtSec: nowSec,
                        };
                        cameraShake = Math.max(cameraShake, 0.1);
                        break;
                      case "g":
                        gravityPulseFeedbackState = {
                          effectRadius: GRAVITY_PULSE_SPEC.radius,
                          origin: {
                            x: playerPlanet.pos.x,
                            y: playerPlanet.pos.y,
                          },
                          planetRadius: playerPlanet.radius,
                          startedAtSec: nowSec,
                        };
                        cameraShake = Math.max(cameraShake, 0.18);
                        hudFlicker = Math.max(hudFlicker, 0.1);
                        break;
                    }
                  }
                }
              }

              viewportInputController.clearStepScopedRequests();

              const tuning = getRuntimeTuningDocument();
              const planetVisualTuning = tuning.visuals.planets;
              const rocketVisualTuning = tuning.visuals.rockets;
              const scaledRocketVisualTuning =
                getScaledRocketVisuals(rocketVisualTuning);

              const activeSunIds = new Set<number>();
              for (const [index, sun] of (world?.suns ?? []).entries()) {
                activeSunIds.add(sun.id);
                const sunProfile = getSunVisualProfile(
                  tuning.visuals.suns,
                  index,
                );
                let visual = sunVisuals.get(sun.id);
                if (visual === undefined) {
                  const coreMaterial = createSunCoreMaterial(
                    sunProfile.color,
                    sunProfile.glowColor,
                    sun.id,
                    sunProfile.coreBrightness,
                  );
                  const glowMaterial = createSunGlowMaterial(
                    sunProfile.glowColor,
                    sun.id,
                    sunProfile.glowBrightness,
                  );
                  const warpMaterial = createWarpMaterial(
                    sunProfile.glowColor,
                    sun.id,
                  );
                  const coreMesh = new Mesh(sunGeometry, coreMaterial);
                  const glowMesh = new Mesh(sunGeometry, glowMaterial);
                  const warpMesh = new Mesh(warpGeometry, warpMaterial);
                  coreMesh.renderOrder = -8;
                  glowMesh.renderOrder = -10;
                  warpMesh.renderOrder = -12;
                  glowMesh.position.z = -2;
                  warpMesh.position.z = -4;
                  scene.add(warpMesh, glowMesh, coreMesh);
                  visual = {
                    coreMesh,
                    glowMesh,
                    rotationSpeed: 0.12 + (sun.id % 3) * 0.04,
                    warpMesh,
                  };
                  sunVisuals.set(sun.id, visual);
                }

                visual.coreMesh.visible = true;
                visual.glowMesh.visible = true;
                visual.warpMesh.visible = true;
                visual.coreMesh.position.set(sun.pos.x, sun.pos.y, 0);
                visual.glowMesh.position.set(sun.pos.x, sun.pos.y, -2);
                visual.warpMesh.position.set(sun.pos.x, sun.pos.y, -4);
                const renderedRadius = sun.radius;
                visual.coreMesh.scale.set(
                  renderedRadius,
                  renderedRadius,
                  renderedRadius,
                );
                visual.glowMesh.scale.set(
                  renderedRadius * sunProfile.glowScale,
                  renderedRadius * sunProfile.glowScale,
                  renderedRadius * sunProfile.glowScale,
                );
                visual.warpMesh.scale.set(
                  renderedRadius * sunProfile.warpScale,
                  renderedRadius * sunProfile.warpScale,
                  1,
                );
                visual.coreMesh.rotation.x = 0.38;
                visual.coreMesh.rotation.y = nowSec * visual.rotationSpeed;
                visual.glowMesh.rotation.z = nowSec * 0.08;
              }
              for (const [sunId, visual] of sunVisuals) {
                if (!activeSunIds.has(sunId)) {
                  scene.remove(
                    visual.coreMesh,
                    visual.glowMesh,
                    visual.warpMesh,
                  );
                  (
                    visual.coreMesh.material as { dispose: () => void }
                  ).dispose();
                  (
                    visual.glowMesh.material as { dispose: () => void }
                  ).dispose();
                  (
                    visual.warpMesh.material as { dispose: () => void }
                  ).dispose();
                  sunVisuals.delete(sunId);
                }
              }
              if (world?.blackHole !== undefined) {
                for (const [sunId, previousSun] of previousSunBodiesById) {
                  if (
                    activeSunIds.has(sunId) ||
                    Math.hypot(
                      previousSun.pos.x - world.blackHole.pos.x,
                      previousSun.pos.y - world.blackHole.pos.y,
                    ) >
                      world.blackHole.killRadius +
                        Math.max(120, previousSun.radius * 3)
                  ) {
                    continue;
                  }

                  queueBlackHoleSwallowEffect({
                    activeEffects: activeBlackHoleSwallowEffects,
                    color: previousSun.color,
                    inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                    radius: previousSun.radius,
                    startedAtSec: nowSec,
                    startPos: previousSun.pos,
                    targetPos: world.blackHole.pos,
                  });
                }
              }
              for (const [sunId, previousSun] of previousSunBodiesById) {
                if (activeSunIds.has(sunId)) {
                  continue;
                }

                if (
                  world?.blackHole !== undefined &&
                  Math.hypot(
                    previousSun.pos.x - world.blackHole.pos.x,
                    previousSun.pos.y - world.blackHole.pos.y,
                  ) <=
                    world.blackHole.killRadius +
                      Math.max(120, previousSun.radius * 3)
                ) {
                  continue;
                }

                const absorbingNeutronStar = findAbsorbingNeutronStar({
                  currentNeutronStars: world?.neutronStars ?? [],
                  previousNeutronStarsById,
                  sun: previousSun,
                });
                if (absorbingNeutronStar === null) {
                  continue;
                }

                queueLocalViewportPlanetExplosion({
                  activePlanetExplosions,
                  inactivePlanetExplosionVisuals,
                  planet: {
                    color: previousSun.color,
                    deathReason: "sunCollision",
                    id: sunId,
                    pos: { x: previousSun.pos.x, y: previousSun.pos.y },
                    radius: getNeutronStarAbsorptionExplosionRadius({
                      neutronStarRadius: absorbingNeutronStar.radius,
                      sunRadius: previousSun.radius,
                    }),
                    vel: { x: previousSun.vel.x, y: previousSun.vel.y },
                  },
                  startedAtSec: nowSec,
                });
              }
              previousSunBodiesById.clear();
              for (const [index, sun] of (world?.suns ?? []).entries()) {
                const sunProfile = getSunVisualProfile(
                  tuning.visuals.suns,
                  index,
                );
                previousSunBodiesById.set(sun.id, {
                  color: sunProfile.glowColor,
                  pos: { ...sun.pos },
                  radius: sun.radius,
                  vel: { ...sun.vel },
                });
              }

              const activeNeutronStarIds = new Set<number>();
              const neutronStarVisualTuning = tuning.visuals.neutronStars;
              for (const [index, neutronStar] of (
                world?.neutronStars ?? []
              ).entries()) {
                activeNeutronStarIds.add(neutronStar.id);
                const massAlpha = getNeutronStarMassAlpha(
                  neutronStar.mass,
                  tuning.gameplay.neutronStars,
                );
                let visual = neutronStarVisuals.get(neutronStar.id);
                if (visual === undefined) {
                  const group = new Group();
                  const coreMesh = new Mesh(
                    sunGeometry,
                    createNeutronStarCoreMaterial(neutronStar.id),
                  );
                  const haloMesh = new Mesh(
                    glowGeometry,
                    createNeutronStarHaloMaterial(neutronStar.id),
                  );
                  const lensMesh = new Mesh(
                    glowGeometry,
                    createNeutronStarLensMaterial(neutronStar.id),
                  );
                  const jetMeshA = new Mesh(
                    ribbonGeometry,
                    createNeutronStarJetMaterial(neutronStar.id),
                  );
                  const jetMeshB = new Mesh(
                    ribbonGeometry,
                    createNeutronStarJetMaterial(neutronStar.id + 0.37),
                  );
                  coreMesh.renderOrder = -6;
                  haloMesh.renderOrder = -7;
                  lensMesh.renderOrder = -8;
                  jetMeshA.renderOrder = -7;
                  jetMeshB.renderOrder = -7;
                  haloMesh.position.z = -1.6;
                  lensMesh.position.z = -2.4;
                  jetMeshA.position.z = -1.2;
                  jetMeshB.position.z = -1.2;
                  group.add(lensMesh, haloMesh, jetMeshA, jetMeshB, coreMesh);
                  scene.add(group);
                  visual = {
                    coreMesh,
                    group,
                    haloMesh,
                    jetMeshA,
                    jetMeshB,
                    lensMesh,
                    phase: index * 0.91 + neutronStar.id * 0.0008,
                    spinSpeed: 0.22 + index * 0.04,
                  };
                  neutronStarVisuals.set(neutronStar.id, visual);
                }

                const pulse = 1 + Math.sin(nowSec * 6.4 + visual.phase) * 0.04;
                const haloPulse =
                  1 + Math.sin(nowSec * 4.8 + visual.phase * 1.7) * 0.08;
                const {
                  coreRadius,
                  haloRadius,
                  lensRadius,
                  jetLength,
                  jetWidth,
                } = getNeutronStarVisualShape({
                  haloPulse,
                  massAlpha,
                  pulse,
                  radius: neutronStar.radius,
                  tuning: neutronStarVisualTuning,
                });
                const haloMaterial = visual.haloMesh.material as ReturnType<
                  typeof createNeutronStarHaloMaterial
                >;
                const lensMaterial = visual.lensMesh.material as ReturnType<
                  typeof createNeutronStarLensMaterial
                >;
                const jetMaterialA = visual.jetMeshA.material as ReturnType<
                  typeof createNeutronStarJetMaterial
                >;
                const jetMaterialB = visual.jetMeshB.material as ReturnType<
                  typeof createNeutronStarJetMaterial
                >;

                visual.group.visible = true;
                visual.group.position.set(
                  neutronStar.pos.x,
                  neutronStar.pos.y,
                  -1,
                );
                visual.group.rotation.z = nowSec * 0.06 + visual.phase * 0.18;
                visual.coreMesh.scale.set(coreRadius, coreRadius, coreRadius);
                visual.haloMesh.scale.set(haloRadius, haloRadius, 1);
                visual.lensMesh.scale.set(lensRadius, lensRadius, 1);
                visual.jetMeshA.scale.set(jetWidth, jetLength, 1);
                visual.jetMeshB.scale.set(
                  jetWidth * NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
                  jetLength * NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
                  1,
                );
                visual.jetMeshA.rotation.z =
                  visual.phase + Math.sin(nowSec * 0.4 + visual.phase) * 0.08;
                visual.jetMeshB.rotation.z =
                  visual.phase +
                  Math.PI / 2 -
                  Math.sin(nowSec * 0.36 + visual.phase) * 0.06;
                visual.haloMesh.rotation.z = nowSec * 0.18 + visual.phase * 0.4;
                visual.lensMesh.rotation.z =
                  -nowSec * 0.12 - visual.phase * 0.3;
                visual.coreMesh.rotation.x = 0.44;
                visual.coreMesh.rotation.y = nowSec * visual.spinSpeed;
                haloMaterial.opacity = neutronStarVisualTuning.haloOpacity;
                lensMaterial.opacity = neutronStarVisualTuning.lensOpacity;
                jetMaterialA.opacity = neutronStarVisualTuning.jetOpacity;
                jetMaterialB.opacity =
                  neutronStarVisualTuning.jetOpacity *
                  NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR;
              }
              for (const [neutronStarId, visual] of neutronStarVisuals) {
                if (!activeNeutronStarIds.has(neutronStarId)) {
                  scene.remove(visual.group);
                  (
                    visual.coreMesh.material as { dispose: () => void }
                  ).dispose();
                  (
                    visual.haloMesh.material as { dispose: () => void }
                  ).dispose();
                  (
                    visual.lensMesh.material as { dispose: () => void }
                  ).dispose();
                  (
                    visual.jetMeshA.material as { dispose: () => void }
                  ).dispose();
                  (
                    visual.jetMeshB.material as { dispose: () => void }
                  ).dispose();
                  neutronStarVisuals.delete(neutronStarId);
                }
              }
              previousNeutronStarsById.clear();
              for (const neutronStar of world?.neutronStars ?? []) {
                previousNeutronStarsById.set(neutronStar.id, {
                  mass: neutronStar.mass,
                  pos: { ...neutronStar.pos },
                  radius: neutronStar.radius,
                });
              }

              const activePlanetIds = new Set<number>();
              for (const planet of world?.planets ?? []) {
                activePlanetIds.add(planet.id);
                let visual = planetVisuals.get(planet.id);
                let trail = planetTrails.get(planet.id);
                const archetypeVisual =
                  planetVisualTuning.archetypes[planet.archetype];
                if (visual === undefined) {
                  const forestProfile = getPlanetForestProfile(
                    planet.archetype,
                    planet.id,
                  );
                  const material = createPlanetMaterial(
                    archetypeVisual,
                    planet.id * 0.173,
                    forestProfile,
                  );
                  const glowMaterial = createPlanetGlowMaterial(
                    archetypeVisual.color,
                    planet.id * 0.173,
                    archetypeVisual.auraScale,
                    archetypeVisual.auraGap,
                  );
                  const mesh = new Mesh(planetGeometry, material);
                  const glowMesh = new Mesh(
                    glowGeometry,
                    glowMaterial.material,
                  );
                  mesh.renderOrder = -2;
                  glowMesh.position.z = 0.16;
                  glowMesh.renderOrder = -1;
                  scene.add(mesh, glowMesh);
                  visual = {
                    glowMesh,
                    glowOpacityUniform: glowMaterial.opacityUniform,
                    material,
                    mesh,
                    spinAxis: createPlanetSpinAxis(planet.id),
                    spinPhase: ((planet.id * 0.173) % 1) * Math.PI * 2,
                  };
                  planetVisuals.set(planet.id, visual);
                }
                if (trail === undefined) {
                  trail = createPlanetTrailVisual({
                    maxTrailSamples: MAX_TRAIL_SAMPLES,
                    trailColor: archetypeVisual.trailColor,
                    trailPointSize: TRAIL_POINT_SIZE,
                  });
                  planetTrails.set(planet.id, trail);
                  scene.add(trail.points);
                }

                visual.mesh.position.set(planet.pos.x, planet.pos.y, 0);
                visual.glowMesh.position.set(planet.pos.x, planet.pos.y, 0.16);
                visual.material.opacityUniform.value = 1;
                visual.glowOpacityUniform.value = 1;
                visual.mesh.scale.set(
                  planet.radius * archetypeVisual.bodyScale,
                  planet.radius * archetypeVisual.bodyScale,
                  planet.radius * archetypeVisual.bodyScale,
                );
                visual.glowMesh.scale.set(
                  planet.radius *
                    archetypeVisual.bodyScale *
                    archetypeVisual.auraScale,
                  planet.radius *
                    archetypeVisual.bodyScale *
                    archetypeVisual.auraScale,
                  1,
                );
                visual.mesh.setRotationFromAxisAngle(
                  visual.spinAxis,
                  nowSec * 0.28 + visual.spinPhase,
                );

                pushPlanetTrailSample(trail, planet.pos, MAX_TRAIL_SAMPLES);
                updatePlanetTrailVisual(trail, MAX_TRAIL_SAMPLES);
              }
              for (const [planetId, visual] of planetVisuals) {
                if (!activePlanetIds.has(planetId)) {
                  scene.remove(visual.mesh, visual.glowMesh);
                  visual.material.dispose();
                  (
                    visual.glowMesh.material as { dispose: () => void }
                  ).dispose();
                  planetVisuals.delete(planetId);
                }
              }
              for (const [planetId, trail] of planetTrails) {
                if (!activePlanetIds.has(planetId)) {
                  scene.remove(trail.points);
                  trail.geometry.dispose();
                  (trail.points.material as { dispose: () => void }).dispose();
                  planetTrails.delete(planetId);
                }
              }

              const activeRocketIds = new Set<number>();
              for (const rocket of world?.rockets ?? []) {
                activeRocketIds.add(rocket.id);
                let visual = rocketVisuals.get(rocket.id);
                const rocketAppearance =
                  scaledRocketVisualTuning[rocket.rocketKind];
                if (visual === undefined) {
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
                  const group = new Group();
                  group.add(trail, flame, body);
                  body.renderOrder = 3;
                  trail.renderOrder = 2;
                  flame.renderOrder = 4;
                  scene.add(group);
                  visual = { body, flame, group, trail };
                  rocketVisuals.set(rocket.id, visual);
                }

                syncRocketVisualTransform({
                  appearance: rocketAppearance,
                  position: rocket.pos,
                  velocity: rocket.vel,
                  visual,
                });
              }
              for (const [rocketId, visual] of rocketVisuals) {
                if (!activeRocketIds.has(rocketId)) {
                  scene.remove(visual.group);
                  (visual.body.material as { dispose: () => void }).dispose();
                  (visual.trail.material as { dispose: () => void }).dispose();
                  (visual.flame.material as { dispose: () => void }).dispose();
                  rocketVisuals.delete(rocketId);
                }
              }
              if (world?.blackHole !== undefined) {
                for (const [
                  rocketId,
                  previousRocket,
                ] of previousRocketBodiesById) {
                  if (
                    activeRocketIds.has(rocketId) ||
                    Math.hypot(
                      previousRocket.pos.x - world.blackHole.pos.x,
                      previousRocket.pos.y - world.blackHole.pos.y,
                    ) >
                      world.blackHole.killRadius +
                        Math.max(72, previousRocket.radius * 10)
                  ) {
                    continue;
                  }

                  queueBlackHoleSwallowEffect({
                    activeEffects: activeBlackHoleSwallowEffects,
                    color: BLACK_HOLE_ROCKET_SWALLOW_COLOR,
                    inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                    radius: Math.max(previousRocket.radius * 2.8, 12),
                    startedAtSec: nowSec,
                    startPos: previousRocket.pos,
                    targetPos: world.blackHole.pos,
                  });
                }
              }
              previousRocketBodiesById.clear();
              for (const rocket of world?.rockets ?? []) {
                previousRocketBodiesById.set(rocket.id, {
                  color: BLACK_HOLE_ROCKET_SWALLOW_COLOR,
                  pos: { ...rocket.pos },
                  radius: rocket.radius,
                });
              }

              const authoritativeShieldActive =
                playerPlanet?.shieldActive === true &&
                playerPlanet.shieldLoad > 0;
              if (
                shieldGroup !== null &&
                shieldArcOpacityUniform !== null &&
                shieldPanelOpacityUniform !== null &&
                shieldCrestOpacityUniform !== null &&
                shieldGlowOpacityUniform !== null &&
                playerPlanet !== null
              ) {
                if (authoritativeShieldActive) {
                  immediateShieldFeedbackState = null;
                }

                const immediateShieldAgeSec =
                  immediateShieldFeedbackState === null
                    ? Number.POSITIVE_INFINITY
                    : nowSec - immediateShieldFeedbackState.startedAtSec;
                const immediateShieldVisible =
                  immediateShieldFeedbackState !== null &&
                  immediateShieldAgeSec >= 0 &&
                  immediateShieldAgeSec <=
                    IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC;

                if (authoritativeShieldActive || immediateShieldVisible) {
                  const shieldAimDir = authoritativeShieldActive
                    ? playerPlanet.shieldAimDir
                    : immediateShieldFeedbackState!.aimDir;
                  const shieldLoadRatio =
                    playerPlanet.shieldMaxLoad > 0
                      ? clamp(
                          playerPlanet.shieldLoad / playerPlanet.shieldMaxLoad,
                          0,
                          1,
                        )
                      : 0;
                  const immediateShieldFade = immediateShieldVisible
                    ? 1 -
                      clamp(
                        immediateShieldAgeSec /
                          IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC,
                        0,
                        1,
                      )
                    : 0;
                  const pulse = 1 + Math.sin(nowSec * 8.2) * 0.035;
                  const shieldAngle = Math.atan2(
                    shieldAimDir.y,
                    shieldAimDir.x,
                  );
                  const shieldScale =
                    playerPlanet.radius *
                    pulse *
                    (authoritativeShieldActive
                      ? 1
                      : 1 + immediateShieldFade * 0.06);
                  shieldGroup.visible = true;
                  shieldGroup.position.set(
                    playerPlanet.pos.x,
                    playerPlanet.pos.y,
                    0,
                  );
                  shieldGroup.scale.set(shieldScale, shieldScale, 1);
                  shieldGroup.rotation.z = shieldAngle;
                  shieldGlowOpacityUniform.value = clamp(
                    authoritativeShieldActive
                      ? 0.05 +
                          shieldLoadRatio * 0.11 +
                          Math.sin(nowSec * 9.4) * 0.03
                      : 0.04 +
                          immediateShieldFade * 0.18 +
                          Math.sin(nowSec * 10.2) * 0.02,
                    0,
                    1,
                  );
                  shieldArcOpacityUniform.value = clamp(
                    authoritativeShieldActive
                      ? 0.16 +
                          shieldLoadRatio * 0.3 +
                          Math.sin(nowSec * 7.6) * 0.05
                      : 0.14 + immediateShieldFade * 0.34,
                    0,
                    1,
                  );
                  shieldPanelOpacityUniform.value = clamp(
                    authoritativeShieldActive
                      ? 0.18 +
                          shieldLoadRatio * 0.42 +
                          Math.sin(nowSec * 9.8) * 0.05
                      : 0.12 + immediateShieldFade * 0.28,
                    0,
                    1,
                  );
                  shieldCrestOpacityUniform.value = clamp(
                    authoritativeShieldActive
                      ? 0.16 +
                          shieldLoadRatio * 0.36 +
                          Math.sin(nowSec * 10.8) * 0.06
                      : 0.1 + immediateShieldFade * 0.3,
                    0,
                    1,
                  );
                } else {
                  shieldGroup.visible = false;
                  shieldGlowOpacityUniform.value = 0;
                  shieldArcOpacityUniform.value = 0;
                  shieldPanelOpacityUniform.value = 0;
                  shieldCrestOpacityUniform.value = 0;
                  if (
                    immediateShieldAgeSec >
                    IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC
                  ) {
                    immediateShieldFeedbackState = null;
                  }
                }
              } else if (
                shieldGroup !== null &&
                shieldArcOpacityUniform !== null &&
                shieldPanelOpacityUniform !== null &&
                shieldCrestOpacityUniform !== null &&
                shieldGlowOpacityUniform !== null
              ) {
                shieldGroup.visible = false;
                shieldGlowOpacityUniform.value = 0;
                shieldArcOpacityUniform.value = 0;
                shieldPanelOpacityUniform.value = 0;
                shieldCrestOpacityUniform.value = 0;
              }

              if (cannonVisual !== null) {
                const controlsEnabled =
                  runtime.phase === "combat" &&
                  runtime.connectionState === "connected";
                if (!controlsEnabled || playerPlanet === null) {
                  cannonVisual.group.visible = false;
                  cannonVisual.flashMesh.visible = false;
                  cannonVisual.flashMaterial.opacity = 0;
                } else {
                  const worldUnitsPerPixel =
                    cameraState.visibleWorldHeight /
                    Math.max(1, hostElement.clientHeight);
                  const cannonLayout = getCannonWorldLayout(
                    tuning.visuals.cannon,
                    worldUnitsPerPixel,
                  );
                  const selectedRocketKind =
                    viewportInputController.state.inputState.selectedRocketKind;
                  const weaponAccent =
                    rocketVisualTuning[selectedRocketKind].hudAccent;
                  const aimDelta = sub(
                    viewportInputController.state.inputState.aimWorld,
                    playerPlanet.pos,
                  );
                  const aimDir =
                    len(aimDelta) > 0.001
                      ? normalizeVec2(aimDelta)
                      : { x: 1, y: 0 };
                  const aimAngle = Math.atan2(aimDir.y, aimDir.x);
                  const stemStart = playerPlanet.radius;
                  const breechStart = stemStart + cannonLayout.stemLenWorld;
                  const barrelStart = breechStart + cannonLayout.breechLenWorld;
                  const barrelEnd = barrelStart + cannonLayout.barrelLenWorld;

                  cannonVisual.group.visible = !authoritativeShieldActive;
                  cannonVisual.group.position.set(
                    playerPlanet.pos.x,
                    playerPlanet.pos.y,
                    6,
                  );
                  cannonVisual.group.rotation.z = aimAngle;
                  cannonVisual.accentMaterial.color.set(weaponAccent);
                  cannonVisual.stemMesh.position.set(
                    stemStart + cannonLayout.stemLenWorld * 0.5,
                    0,
                    0,
                  );
                  cannonVisual.stemMesh.scale.set(
                    cannonLayout.stemLenWorld,
                    cannonLayout.stemRadiusWorld,
                    cannonLayout.stemRadiusWorld,
                  );
                  cannonVisual.breechMesh.position.set(
                    breechStart + cannonLayout.breechLenWorld * 0.5,
                    0,
                    0,
                  );
                  cannonVisual.breechMesh.scale.set(
                    cannonLayout.breechLenWorld,
                    cannonLayout.breechWidthWorld,
                    cannonLayout.breechDepthWorld,
                  );
                  cannonVisual.barrelMesh.position.set(
                    barrelStart + cannonLayout.barrelLenWorld * 0.5,
                    0,
                    0,
                  );
                  cannonVisual.barrelMesh.scale.set(
                    cannonLayout.barrelLenWorld,
                    cannonLayout.barrelRadiusWorld,
                    cannonLayout.barrelRadiusWorld,
                  );
                  cannonVisual.barrelBandMesh.position.set(
                    barrelStart +
                      cannonLayout.barrelLenWorld * CANNON_BAND_POSITION,
                    0,
                    0,
                  );
                  cannonVisual.barrelBandMesh.scale.set(
                    cannonLayout.bandLenWorld,
                    cannonLayout.bandRadiusWorld,
                    cannonLayout.bandRadiusWorld,
                  );
                  cannonVisual.muzzleMesh.position.set(
                    barrelEnd - cannonLayout.muzzleLenWorld * 0.5,
                    0,
                    0,
                  );
                  cannonVisual.muzzleMesh.scale.set(
                    cannonLayout.muzzleLenWorld,
                    cannonLayout.muzzleRadiusWorld,
                    cannonLayout.muzzleRadiusWorld,
                  );

                  if (
                    authoritativeShieldActive ||
                    immediateCannonFlashState === null
                  ) {
                    cannonVisual.flashMesh.visible = false;
                    cannonVisual.flashMaterial.opacity = 0;
                  } else {
                    const flashAgeSec =
                      nowSec - immediateCannonFlashState.startedAtSec;
                    if (
                      flashAgeSec < 0 ||
                      flashAgeSec > cannonLayout.flashDurationSec
                    ) {
                      cannonVisual.flashMesh.visible = false;
                      cannonVisual.flashMaterial.opacity = 0;
                      immediateCannonFlashState = null;
                    } else {
                      const flashProgress = clamp(
                        flashAgeSec / cannonLayout.flashDurationSec,
                        0,
                        1,
                      );
                      const flashOpacity = (1 - flashProgress) ** 2.1;
                      const flashLength =
                        cannonLayout.flashRadiusWorld *
                        (1.15 + (1 - flashProgress) * 1.35);
                      const flashWidth =
                        cannonLayout.flashRadiusWorld *
                        (0.3 + (1 - flashProgress) * 0.42);
                      cannonVisual.flashMesh.visible = true;
                      cannonVisual.flashMaterial.opacity = flashOpacity;
                      cannonVisual.flashMaterial.color.set(
                        rocketVisualTuning[
                          immediateCannonFlashState.rocketKind
                        ].hudAccent,
                      );
                      cannonVisual.flashMesh.position.set(
                        barrelEnd + flashLength * 0.26,
                        0,
                        0,
                      );
                      cannonVisual.flashMesh.scale.set(
                        flashLength,
                        flashWidth,
                        flashWidth,
                      );
                    }
                  }
                }
              }

              if (boostFeedbackMesh !== null && boostFeedbackState !== null) {
                const boostAgeSec = nowSec - boostFeedbackState.startedAtSec;
                if (playerPlanet === null || boostAgeSec < 0) {
                  boostFeedbackMesh.visible = false;
                } else if (
                  boostAgeSec > IMMEDIATE_BOOST_FEEDBACK_DURATION_SEC
                ) {
                  boostFeedbackState = null;
                  boostFeedbackMesh.visible = false;
                } else {
                  const progress = clamp(
                    boostAgeSec / IMMEDIATE_BOOST_FEEDBACK_DURATION_SEC,
                    0,
                    1,
                  );
                  const exhaustDir = scale(boostFeedbackState.direction, -1);
                  const boostLength = Math.max(
                    playerPlanet.radius * (2.3 - progress * 0.2),
                    BOOST_SPEC.magnitude * 0.05,
                  );
                  const boostWidth =
                    playerPlanet.radius * (1.2 - progress * 0.36);
                  const exhaustOffset =
                    playerPlanet.radius * 0.64 +
                    progress * Math.min(playerPlanet.radius * 1.1, 18);
                  boostFeedbackMesh.visible = true;
                  boostFeedbackMesh.position.set(
                    playerPlanet.pos.x + exhaustDir.x * exhaustOffset,
                    playerPlanet.pos.y + exhaustDir.y * exhaustOffset,
                    5.8,
                  );
                  boostFeedbackMesh.rotation.z = Math.atan2(
                    exhaustDir.y,
                    exhaustDir.x,
                  );
                  boostFeedbackMesh.scale.set(boostLength, boostWidth, 1);
                }
              } else if (boostFeedbackMesh !== null) {
                boostFeedbackMesh.visible = false;
              }

              if (
                gravityPulseVisual !== null &&
                gravityPulseFeedbackState !== null
              ) {
                const gravityPulseAgeSec =
                  nowSec - gravityPulseFeedbackState.startedAtSec;
                if (gravityPulseAgeSec < 0) {
                  hideGravityPulseVisual(gravityPulseVisual);
                } else if (
                  gravityPulseAgeSec > IMMEDIATE_GRAVITY_PULSE_DURATION_SEC
                ) {
                  gravityPulseFeedbackState = null;
                  hideGravityPulseVisual(gravityPulseVisual);
                } else {
                  const progress = clamp(
                    gravityPulseAgeSec / IMMEDIATE_GRAVITY_PULSE_DURATION_SEC,
                    0,
                    1,
                  );
                  const fade = (1 - progress) ** 1.6;
                  const visiblePulseRadius = Math.min(
                    gravityPulseFeedbackState.effectRadius,
                    Math.max(
                      gravityPulseFeedbackState.planetRadius * 6,
                      cameraState.visibleWorldHeight * 0.42,
                    ),
                  );
                  const primaryRadius = lerp(
                    gravityPulseFeedbackState.planetRadius * 1.25,
                    visiblePulseRadius,
                    progress,
                  );
                  const echoRadius = lerp(
                    gravityPulseFeedbackState.planetRadius * 1.55,
                    visiblePulseRadius * 0.88,
                    progress,
                  );
                  const coreRadius = lerp(
                    gravityPulseFeedbackState.planetRadius * 1.2,
                    gravityPulseFeedbackState.planetRadius * 3.6,
                    Math.min(1, progress * 1.6),
                  );

                  gravityPulseVisual.coreMesh.visible = true;
                  gravityPulseVisual.ringMesh.visible = true;
                  gravityPulseVisual.echoMesh.visible = true;
                  gravityPulseVisual.coreMesh.position.set(
                    gravityPulseFeedbackState.origin.x,
                    gravityPulseFeedbackState.origin.y,
                    5.1,
                  );
                  gravityPulseVisual.ringMesh.position.set(
                    gravityPulseFeedbackState.origin.x,
                    gravityPulseFeedbackState.origin.y,
                    5.25,
                  );
                  gravityPulseVisual.echoMesh.position.set(
                    gravityPulseFeedbackState.origin.x,
                    gravityPulseFeedbackState.origin.y,
                    5.2,
                  );
                  gravityPulseVisual.coreMesh.scale.set(
                    coreRadius,
                    coreRadius,
                    1,
                  );
                  gravityPulseVisual.ringMesh.scale.set(
                    primaryRadius,
                    primaryRadius,
                    1,
                  );
                  gravityPulseVisual.echoMesh.scale.set(
                    echoRadius,
                    echoRadius,
                    1,
                  );
                  gravityPulseVisual.ringMesh.rotation.z = progress * 0.42;
                  gravityPulseVisual.echoMesh.rotation.z = -progress * 0.28;
                  gravityPulseVisual.coreMaterial.opacity =
                    fade * (0.28 + (1 - progress) * 0.3);
                  gravityPulseVisual.ringMaterial.opacity = fade * 0.96;
                  gravityPulseVisual.echoMaterial.opacity = fade * 0.56;
                }
              } else if (gravityPulseVisual !== null) {
                hideGravityPulseVisual(gravityPulseVisual);
              }

              for (const [
                rocketKind,
                feedbackVisual,
              ] of immediateFireFeedback) {
                const burstState =
                  immediateFireBurstState.get(rocketKind) ?? null;
                if (burstState === null) {
                  feedbackVisual.burstMesh.visible = false;
                } else {
                  const burstAgeSec = nowSec - burstState.startedAtSec;
                  if (
                    burstAgeSec < 0 ||
                    burstAgeSec > IMMEDIATE_FIRE_BURST_DURATION_SEC
                  ) {
                    feedbackVisual.burstMesh.visible = false;
                    immediateFireBurstState.delete(rocketKind);
                  } else {
                    const burstProgress = clamp(
                      burstAgeSec / IMMEDIATE_FIRE_BURST_DURATION_SEC,
                      0,
                      1,
                    );
                    const rocketAppearance =
                      scaledRocketVisualTuning[rocketKind];
                    const burstLength =
                      rocketAppearance.bodyScale.x *
                      (1.08 - burstProgress * 0.18);
                    const burstWidth =
                      rocketAppearance.bodyScale.y *
                      (1.18 - burstProgress * 0.42);
                    const burstTravel =
                      burstAgeSec * ROCKET_SPECS[rocketKind].speed;
                    const burstCenter = add(
                      burstState.origin,
                      scale(
                        burstState.direction,
                        burstTravel + burstLength * 0.5,
                      ),
                    );
                    feedbackVisual.burstMesh.visible = true;
                    feedbackVisual.burstMesh.position.set(
                      burstCenter.x,
                      burstCenter.y,
                      6.2,
                    );
                    feedbackVisual.burstMesh.rotation.z = Math.atan2(
                      burstState.direction.y,
                      burstState.direction.x,
                    );
                    feedbackVisual.burstMesh.scale.set(
                      burstLength,
                      burstWidth,
                      1,
                    );
                  }
                }

                const ghostState =
                  immediateGhostRocketState.get(rocketKind) ?? null;
                if (ghostState === null) {
                  hideRocketVisual(feedbackVisual.ghost);
                  continue;
                }

                const ghostAgeSec = nowSec - ghostState.startedAtSec;
                if (
                  ghostAgeSec < 0 ||
                  ghostAgeSec > IMMEDIATE_GHOST_ROCKET_DURATION_SEC
                ) {
                  hideRocketVisual(feedbackVisual.ghost);
                  immediateGhostRocketState.delete(rocketKind);
                  continue;
                }

                const ghostPosition = add(
                  ghostState.origin,
                  scale(ghostState.velocity, ghostAgeSec),
                );
                const shouldYieldToAuthoritativeRocket =
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
                    false);
                if (shouldYieldToAuthoritativeRocket) {
                  hideRocketVisual(feedbackVisual.ghost);
                  immediateGhostRocketState.delete(rocketKind);
                  continue;
                }

                syncRocketVisualTransform({
                  appearance: scaledRocketVisualTuning[rocketKind],
                  position: ghostPosition,
                  velocity: ghostState.velocity,
                  visual: feedbackVisual.ghost,
                  z: 5.9,
                });
              }

              const activeCacheIds = new Set<number>();
              for (const cache of world?.caches ?? []) {
                activeCacheIds.add(cache.id);
                let visual = cacheVisuals.get(cache.id);
                if (visual === undefined) {
                  visual = createSharedCacheVisual(
                    cache as never,
                    cacheSpriteAssets.badgeMaterials,
                  );
                  cacheVisuals.set(cache.id, visual);
                  scene.add(visual.group);
                }

                const key = getSharedCacheIconKey(cache.contents);
                updateSharedCacheVisualBadge(
                  visual,
                  cacheSpriteAssets.badgeMaterials,
                  key,
                );
                visual.group.position.set(
                  cache.pos.x,
                  cache.pos.y + Math.sin(nowSec * 1.8 + visual.bobPhase) * 6,
                  3.5,
                );
                visual.group.rotation.z =
                  Math.sin(nowSec * visual.wobbleRate + visual.bobPhase) * 0.08;
                const pulse =
                  1 +
                  Math.sin(nowSec * visual.pulseRate + visual.bobPhase) * 0.04;
                const badgeSize =
                  getCacheArenaBadgeSize(
                    tuning.visuals.caches.badgeBaseSize,
                    tuning.visuals.caches.badgeScale,
                  ) * pulse;
                visual.badgeSprite.scale.set(badgeSize, badgeSize, 1);
              }
              for (const [cacheId, visual] of cacheVisuals) {
                if (!activeCacheIds.has(cacheId)) {
                  scene.remove(visual.group);
                  cacheVisuals.delete(cacheId);
                }
              }
              if (world?.blackHole !== undefined) {
                for (const [
                  cacheId,
                  previousCache,
                ] of previousCacheBodiesById) {
                  if (
                    activeCacheIds.has(cacheId) ||
                    Math.hypot(
                      previousCache.pos.x - world.blackHole.pos.x,
                      previousCache.pos.y - world.blackHole.pos.y,
                    ) >
                      world.blackHole.killRadius +
                        Math.max(84, previousCache.radius * 5)
                  ) {
                    continue;
                  }

                  queueBlackHoleSwallowEffect({
                    activeEffects: activeBlackHoleSwallowEffects,
                    color: BLACK_HOLE_CACHE_SWALLOW_COLOR,
                    inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                    radius: previousCache.radius * 1.25,
                    startedAtSec: nowSec,
                    startPos: previousCache.pos,
                    targetPos: world.blackHole.pos,
                  });
                }
              }
              previousCacheBodiesById.clear();
              for (const cache of world?.caches ?? []) {
                previousCacheBodiesById.set(cache.id, {
                  color: BLACK_HOLE_CACHE_SWALLOW_COLOR,
                  pos: { ...cache.pos },
                  radius: cache.radius,
                });
              }

              blackHoleGroup.visible = world?.blackHole !== undefined;
              if (world?.blackHole !== undefined) {
                blackHoleGroup.position.set(
                  world.blackHole.pos.x,
                  world.blackHole.pos.y,
                  5,
                );
                blackHoleRing.rotation.z = nowSec * 0.16;
                const blackHoleScale = getBlackHoleVisualScale(
                  world.blackHole.killRadius,
                );
                blackHoleGroup.scale.set(blackHoleScale, blackHoleScale, 1);
              } else {
                blackHoleGroup.scale.set(1, 1, 1);
              }
              updateBlackHoleSwallowEffects({
                activeEffects: activeBlackHoleSwallowEffects,
                inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                nowSec,
              });
              updateLocalViewportPlanetExplosions({
                activePlanetExplosions,
                elapsedSec: nowSec,
                inactivePlanetExplosionVisuals,
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
              nextRenderer.render(scene, nextCamera);
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
