import type {
  ClientMsg,
  PlanetPublic,
  RocketKind,
  SnapshotEvent,
  Vec2,
  World,
} from "@3body/shared";
import {
  add,
  BOOST_SPEC,
  clamp,
  GRAVITY_PULSE_SPEC,
  getNeutronStarMassAlpha,
  ROOM_CAPACITY,
  getSunVisualProfile,
  len,
  lerp,
  normalize as normalizeVec2,
  ROCKET_SPECS,
  SHIELD_SPEC,
  SNAPSHOT_HZ,
  scale,
  sub,
} from "@3body/shared";
import {
  AdditiveBlending,
  BoxGeometry,
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
import {
  findAbsorbingNeutronStar,
  getNeutronStarAbsorptionExplosionRadius,
} from "./neutronStarAbsorption";
import {
  getNeutronStarVisualShape,
  NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
} from "./neutronStarVisuals";
import { getCannonWorldLayout } from "./rocketVisibility";
import { getScaledRocketVisuals } from "./rocketVisualTuning";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import {
  SHIELD_GLOW_OUTER_SCALE,
  SHIELD_INNER_SCALE,
  SHIELD_OUTER_SCALE,
} from "./shieldPresentation";
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
  wrapCentered,
} from "./showcaseVisuals";
import {
  getAmbientBoundaryDebrisRadii,
  updateAmbientBoundaryDebrisVisual,
} from "./viewport/ambientBoundaryDebris";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import { updateAuthoritativeDebrisVisual } from "./viewport/authoritativeDebrisVisual";
import { buildAuthoritativeHudState } from "./viewport/authoritativeHud";
import {
  createAuthoritativeInterpolationCache,
  syncAuthoritativeInterpolatedWorld,
} from "./viewport/authoritativeInterpolation";
import { deriveAuthoritativeRocketLaunchBursts } from "./viewport/authoritativeRocketLaunchBursts";
import {
  getAuthoritativeInterpolationDelayMs,
  getAuthoritativeInterpolationMaxAlpha,
  getAuthoritativeLateSnapshotThresholdMs,
} from "./viewport/authoritativeLatency";
import { syncAuthoritativeLocalPlayerPrediction } from "./viewport/authoritativeLocalPlayerPrediction";
import {
  createPlanetTrailVisual,
  type PlanetTrailVisual,
  pushPlanetTrailSample,
  updatePlanetTrailVisual,
} from "./viewport/authoritativeTrailVisual";
import {
  getAuthoritativeAbilitySlots,
  smoothAuthoritativeCameraAxis,
} from "./viewport/authoritativeViewportBehavior";
import {
  type BlackHoleSwallowState,
  createBlackHoleSwallowVisualPool,
  queueBlackHoleSwallowEffect,
  updateBlackHoleSwallowEffects,
} from "./viewport/blackHoleVisuals";
import {
  type CacheVisual,
  createCacheSpriteAssets,
  createCacheVisual as createSharedCacheVisual,
  disposeCacheSpriteAssets,
  getCacheIconKey as getSharedCacheIconKey,
  syncSharedCombatCacheVisuals,
  updateCacheVisualBadge as updateSharedCacheVisualBadge,
} from "./viewport/cacheVisuals";
import {
  CAMERA_SHAKE_DURATION_SEC,
  getRocketImpactCameraShake,
  getRocketImpactHudFlicker,
  getRocketImpactScreenFlash,
  getViewportCameraShakeOffsets,
  ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC,
  ROCKET_IMPACT_SCREEN_FLASH_DURATION_SEC,
} from "./viewport/cameraShake";
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
import {
  queueSharedCombatRemovedCacheSwallowEffects,
  queueSharedCombatRemovedRocketSwallowEffects,
  syncSharedCombatTrackedCaches,
  syncSharedCombatTrackedRockets,
  type SharedCombatTrackedRocketBody,
} from "./viewport/sharedCombatBlackHoleSwallowTracking";
import {
  createSharedCombatBoostBurstVisual,
  pruneSharedCombatBoostBursts,
  queueSharedCombatBoostBurst,
  type SharedCombatBoostBurstState,
  type SharedCombatBoostBurstVisual,
  type SharedCombatBoostDirectionOverride,
  syncSharedCombatBoostBurstVisual,
} from "./viewport/sharedCombatBoostVisuals";
import {
  createSharedCombatLaunchBurstPools,
  pruneSharedCombatLaunchBurstStates,
  resetSharedCombatLaunchBurstPools,
  syncSharedCombatLaunchBurstPools,
  type SharedCombatLaunchBurstPoolVisual,
} from "./viewport/sharedCombatLaunchBurstPools";
import {
  hideSharedCombatImmediateFireFeedbackVisual,
  syncSharedCombatImmediateFireFeedback,
  type SharedCombatImmediateFireBurstState,
  type SharedCombatImmediateFireFeedbackVisual,
  type SharedCombatImmediateGhostRocketState,
} from "./viewport/sharedCombatImmediateFireVisuals";
import type { SharedCombatLaunchBurstState } from "./viewport/sharedCombatLaunchBurstVisuals";
import {
  clearSharedCombatPlanetExplosions,
  queueSharedCombatPlanetExplosion,
  type SharedCombatPlanetExplosionState,
  type SharedCombatPlanetExplosionVisual,
  updateSharedCombatPlanetExplosions,
} from "./viewport/sharedCombatPlanetExplosions";
import {
  pruneSharedCombatImpactBursts,
  syncSharedCombatImpactBurstPool,
} from "./viewport/sharedCombatImpactBursts";
import {
  createSharedCombatSceneResources,
  type SharedCombatGravityPulseVisual as GravityPulseVisual,
  type SharedCombatImpactBurstVisual as ImpactBurstVisual,
} from "./viewport/sharedCombatSceneResources";
import {
  getSharedCombatShieldHitReact,
  hideSharedCombatLockRingVisual,
  syncSharedCombatCannonVisual,
  hideSharedCombatGravityPulseVisual as hideGravityPulseVisual,
  syncSharedCombatBlackHoleVisual,
  syncSharedCombatLockRingVisual,
  syncSharedCombatShieldVisual,
  updateSharedCombatGravityPulseVisual,
} from "./viewport/sharedCombatSupportVisuals";
import {
  areHudStatesEqual,
  createInitialHudState,
  type GameViewportHudState,
} from "./viewportHud";
import type { ShowcaseDisplayMode } from "./showcaseDisplayMode";
import {
  createSharedCombatRocketPools,
  getSharedCombatRocketTrailInstanceLimits,
  syncSharedCombatRocketPools,
  type SharedCombatRocketBody,
  type SharedCombatRocketPoolVisual,
  type SharedCombatRocketTrailState,
} from "./viewport/sharedCombatRocketPools";

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

interface AuthoritativeImpactBurstState {
  absorbedByShield: boolean;
  color: string;
  normal: Vec2;
  planetId: number;
  radius: number;
  startedAtSec: number;
  targetPos: Vec2;
}

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

const findPlanetById = (
  world: World | null | undefined,
  planetId: number,
): PlanetPublic | null =>
  world?.planets.find((planet) => planet.id === planetId) ?? null;

const findPlanetByPlayerId = (
  world: World | null | undefined,
  playerId: string,
): PlanetPublic | null =>
  world?.planets.find((planet) => planet.playerId === playerId) ?? null;

const findRocketById = (
  world: World | null | undefined,
  rocketId: number,
): World["rockets"][number] | null =>
  world?.rockets.find((rocket) => rocket.id === rocketId) ?? null;

const estimateImpactNormal = ({
  event,
  previousWorld,
  snapshotWorld,
}: {
  event: Extract<SnapshotEvent, { kind: "hit" }>;
  previousWorld: World | null | undefined;
  snapshotWorld: World | null | undefined;
}): Vec2 => {
  const victimPlanet =
    findPlanetById(snapshotWorld, event.victimPlanetId) ??
    findPlanetById(previousWorld, event.victimPlanetId);
  if (victimPlanet === null) {
    return { x: 1, y: 0 };
  }

  const impactRocket =
    findRocketById(snapshotWorld, event.rocketId) ??
    findRocketById(previousWorld, event.rocketId);
  if (impactRocket !== null) {
    const rocketDelta = sub(victimPlanet.pos, impactRocket.pos);
    if (len(rocketDelta) > 0.001) {
      return normalizeVec2(rocketDelta);
    }
  }

  if (event.attackerPlayerId !== undefined) {
    const attackerPlanet =
      findPlanetByPlayerId(snapshotWorld, event.attackerPlayerId) ??
      findPlanetByPlayerId(previousWorld, event.attackerPlayerId);
    if (attackerPlanet !== null) {
      const attackerDelta = sub(victimPlanet.pos, attackerPlanet.pos);
      if (len(attackerDelta) > 0.001) {
        return normalizeVec2(attackerDelta);
      }
    }
  }

  return { x: 1, y: 0 };
};

const estimateBoostDirection = ({
  fallbackDirection,
  planetId,
  previousWorld,
  snapshotWorld,
}: {
  fallbackDirection: Vec2 | null;
  planetId: number;
  previousWorld: World | null | undefined;
  snapshotWorld: World | null | undefined;
}): Vec2 => {
  const currentPlanet = findPlanetById(snapshotWorld, planetId);
  const previousPlanet = findPlanetById(previousWorld, planetId);
  if (currentPlanet !== null && previousPlanet !== null) {
    const velocityDelta = sub(currentPlanet.vel, previousPlanet.vel);
    if (len(velocityDelta) > 0.001) {
      return normalizeVec2(velocityDelta);
    }
  }

  if (fallbackDirection !== null && len(fallbackDirection) > 0.001) {
    return normalizeVec2(fallbackDirection);
  }

  return { x: 1, y: 0 };
};

const queueAuthoritativeBoostBurst = ({
  activeBursts,
  burst,
}: {
  activeBursts: SharedCombatBoostBurstState[];
  burst: SharedCombatBoostBurstState;
}) => {
  const lastBurst = activeBursts[activeBursts.length - 1] ?? null;
  if (
    lastBurst !== null &&
    lastBurst.planetId === burst.planetId &&
    Math.abs(burst.startedAtSec - lastBurst.startedAtSec) <= 0.12
  ) {
    lastBurst.direction = burst.direction;
    lastBurst.origin = burst.origin;
    lastBurst.radius = burst.radius;
    lastBurst.startedAtSec = Math.min(
      lastBurst.startedAtSec,
      burst.startedAtSec,
    );
    lastBurst.tick = burst.tick;
    return;
  }

  queueSharedCombatBoostBurst({
    activeBursts,
    burst,
    maxActiveBursts: MAX_ACTIVE_BOOST_BURSTS,
  });
};

const updateImpactBurstVisuals = ({
  activeBursts,
  nowSec,
  visuals,
  world,
}: {
  activeBursts: AuthoritativeImpactBurstState[];
  nowSec: number;
  visuals: readonly ImpactBurstVisual[];
  world: World | null;
}) => {
  pruneSharedCombatImpactBursts({
    activeBursts,
    durationSec: IMPACT_BURST_DURATION_SEC,
    nowSec,
  });

  syncSharedCombatImpactBurstPool({
    bursts: activeBursts,
    maxVisibleBursts: visuals.length,
    nowSec,
    resolveBurst: (burst) => {
      const targetPlanet = findPlanetById(world, burst.planetId);
      const targetPos = targetPlanet?.pos ?? burst.targetPos;
      const targetRadius = targetPlanet?.radius ?? burst.radius;

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
    styleBurstVisual: ({ burst, visual }) => {
      visual.glowMaterial.color.set(burst.color);
      visual.ringMaterial.color.set(burst.color);
      visual.coreMaterial.color.set("#fff5dd");
    },
    visuals,
    z: {
      core: 5.15,
      glow: 5.05,
      ring: 5.25,
    },
  });
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
  const rocketsByKind: Record<RocketKind, SharedCombatRocketBody[]> = {
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
  let cannonVisual: CannonVisual | null = null;
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
  let immediateShieldFeedbackState: ImmediateShieldFeedbackState | null = null;
  let inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[] = [];
  const previousCacheBodiesById = new Map<
    number,
    { pos: Vec2; radius: number }
  >();
  const previousRocketBodiesById = new Map<
    number,
    SharedCombatTrackedRocketBody
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
              const currentSnapshot = snapshot;
              const snapshotWorld = snapshot?.world;
              const previousSnapshotWorld = previousSnapshot?.world;
              const blackHoleSource =
                snapshotWorld?.blackHole ??
                previousSnapshotWorld?.blackHole ??
                null;
              const snapshotTick = snapshot?.tick ?? null;
              if (snapshotTick === null) {
                for (const rocketKind of AUTHORITATIVE_ROCKET_KINDS) {
                  activeLaunchBurstsByKind[rocketKind].length = 0;
                }
                lastProcessedLaunchBurstSnapshotTick = null;
              } else if (
                lastProcessedLaunchBurstSnapshotTick === null ||
                snapshotTick < lastProcessedLaunchBurstSnapshotTick
              ) {
                for (const rocketKind of AUTHORITATIVE_ROCKET_KINDS) {
                  activeLaunchBurstsByKind[rocketKind].length = 0;
                }
                lastProcessedLaunchBurstSnapshotTick = snapshotTick;
              } else if (snapshotTick > lastProcessedLaunchBurstSnapshotTick) {
                if (
                  currentSnapshot !== null &&
                  snapshotWorld !== undefined &&
                  snapshotWorld !== null &&
                  previousSnapshotWorld !== undefined &&
                  previousSnapshotWorld !== null
                ) {
                  const snapshotReceivedAtSec =
                    currentSnapshot.receivedAtMs * 0.001;
                  const derivedLaunchBursts =
                    deriveAuthoritativeRocketLaunchBursts({
                      currentPlayerId: playerId,
                      previousWorld: previousSnapshotWorld,
                      snapshotReceivedAtSec,
                      snapshotWorld,
                    });
                  for (const burst of derivedLaunchBursts) {
                    activeLaunchBurstsByKind[burst.rocketKind].push(burst);
                  }
                }

                lastProcessedLaunchBurstSnapshotTick = snapshotTick;
              }
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

                  if (eventRecord.event.kind === "hit") {
                    const hitEvent = eventRecord.event;
                    const hitPlanet =
                      findPlanetById(snapshotWorld, hitEvent.victimPlanetId) ??
                      findPlanetById(
                        previousSnapshotWorld,
                        hitEvent.victimPlanetId,
                      );
                    if (hitPlanet !== null) {
                      activeImpactBursts.push({
                        absorbedByShield: hitEvent.absorbedByShield,
                        color: hitEvent.absorbedByShield
                          ? getRuntimeTuningDocument().visuals.abilities
                              .shieldColor
                          : getRuntimeTuningDocument().visuals.rockets[
                              hitEvent.rocketKind
                            ].hudAccent,
                        normal: estimateImpactNormal({
                          event: hitEvent,
                          previousWorld: previousSnapshotWorld,
                          snapshotWorld,
                        }),
                        planetId: hitEvent.victimPlanetId,
                        radius: hitPlanet.radius,
                        startedAtSec: nowSec,
                        targetPos: { x: hitPlanet.pos.x, y: hitPlanet.pos.y },
                      });
                      while (
                        activeImpactBursts.length > MAX_ACTIVE_IMPACT_BURSTS
                      ) {
                        activeImpactBursts.shift();
                      }
                    }

                    if (isPlayerRocketHitEvent(runtime, hitEvent)) {
                      damageFlash = Math.max(
                        damageFlash,
                        hitEvent.hpAfter <= 0
                          ? 1
                          : getRocketImpactScreenFlash({
                              absorbedByShield: hitEvent.absorbedByShield,
                              rocketKind: hitEvent.rocketKind,
                            }),
                      );
                      hudFlicker = Math.max(
                        hudFlicker,
                        getRocketImpactHudFlicker({
                          absorbedByShield: hitEvent.absorbedByShield,
                          rocketKind: hitEvent.rocketKind,
                        }),
                      );
                      cameraShake = Math.max(
                        cameraShake,
                        hitEvent.hpAfter <= 0
                          ? 1
                          : getRocketImpactCameraShake({
                              absorbedByShield: hitEvent.absorbedByShield,
                              rocketKind: hitEvent.rocketKind,
                            }),
                      );
                    }
                  }

                  if (eventRecord.event.kind === "boost") {
                    const boostPlanet =
                      findPlanetById(
                        snapshotWorld,
                        eventRecord.event.planetId,
                      ) ??
                      findPlanetById(
                        previousSnapshotWorld,
                        eventRecord.event.planetId,
                      );
                    if (boostPlanet !== null) {
                      const fallbackDirection =
                        eventRecord.event.playerId === playerId &&
                        playerPlanet !== null
                          ? normalizeVec2(
                              sub(
                                viewportInputController.state.inputState
                                  .aimWorld,
                                playerPlanet.pos,
                              ),
                            )
                          : null;
                      queueAuthoritativeBoostBurst({
                        activeBursts: activeBoostBursts,
                        burst: {
                          direction: estimateBoostDirection({
                            fallbackDirection,
                            planetId: eventRecord.event.planetId,
                            previousWorld: previousSnapshotWorld,
                            snapshotWorld,
                          }),
                          origin: {
                            x: boostPlanet.pos.x,
                            y: boostPlanet.pos.y,
                          },
                          planetId: boostPlanet.id,
                          radius: boostPlanet.radius,
                          startedAtSec: nowSec,
                          tick: eventRecord.event.tick,
                        },
                      });
                    }
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
                        radius: swallowedPlanet.radius,
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

                    switch (abilitySlot) {
                      case "q":
                        immediateShieldFeedbackState = {
                          aimDir: { x: aimDir.x, y: aimDir.y },
                          startedAtSec: nowSec,
                        };
                        hudFlicker = Math.max(hudFlicker, 0.06);
                        break;
                      case "w":
                        lastBoostAbilitySentAtSec = nowSec;
                        queueAuthoritativeBoostBurst({
                          activeBursts: activeBoostBursts,
                          burst: {
                            direction: { x: aimDir.x, y: aimDir.y },
                            origin: {
                              x: playerPlanet.pos.x,
                              y: playerPlanet.pos.y,
                            },
                            planetId: playerPlanet.id,
                            radius: playerPlanet.radius,
                            startedAtSec: nowSec,
                            tick:
                              snapshot?.tick ??
                              Math.round(nowSec * SNAPSHOT_HZ),
                          },
                        });
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

                queueSharedCombatPlanetExplosion({
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
                  planet.radius,
                  planet.radius,
                  planet.radius,
                );
                visual.glowMesh.scale.set(
                  planet.radius * archetypeVisual.auraScale,
                  planet.radius * archetypeVisual.auraScale,
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

              const worldUnitsPerPixel =
                cameraState.visibleWorldHeight /
                Math.max(1, hostElement.clientHeight);
              const cannonLayout = getCannonWorldLayout(
                tuning.visuals.cannon,
                worldUnitsPerPixel,
              );
              const activeRocketIds = new Set<number>();
              for (const rocketKind of AUTHORITATIVE_ROCKET_KINDS) {
                rocketsByKind[rocketKind].length = 0;
              }
              for (const rocket of world?.rockets ?? []) {
                activeRocketIds.add(rocket.id);
                rocketsByKind[rocket.rocketKind].push(rocket);
              }
              if (rocketPools !== null) {
                syncSharedCombatRocketPools({
                  maxRocketTrailSamples: MAX_ROCKET_TRAIL_SAMPLES,
                  nowSec,
                  rocketKinds: AUTHORITATIVE_ROCKET_KINDS,
                  rocketPools,
                  rocketTrailBudget: renderQuality.rocketTrailBudget,
                  rocketTrailStates,
                  rocketsByKind,
                });
              }
              if (rocketPools !== null && rocketLaunchBurstPools !== null) {
                pruneSharedCombatLaunchBurstStates({
                  burstsByKind: activeLaunchBurstsByKind,
                  cannonLayout,
                  nowSec,
                  rocketKinds: AUTHORITATIVE_ROCKET_KINDS,
                  rocketPools,
                  worldUnitsPerPixel,
                });
                syncSharedCombatLaunchBurstPools({
                  burstsByKind: activeLaunchBurstsByKind,
                  cannonLayout,
                  currentPlayerId: playerId,
                  launchBurstBudget: renderQuality.launchBurstBudget,
                  launchBurstPools: rocketLaunchBurstPools,
                  nowSec,
                  rocketKinds: AUTHORITATIVE_ROCKET_KINDS,
                  rocketPools,
                  worldUnitsPerPixel,
                });
              }
              queueSharedCombatRemovedRocketSwallowEffects({
                activeRocketIds,
                blackHole: world?.blackHole ?? null,
                getMargin: (rocket) => Math.max(72, rocket.radius * 10),
                previousRocketsById: previousRocketBodiesById,
                queueEffect: (previousRocket) => {
                  queueBlackHoleSwallowEffect({
                    activeEffects: activeBlackHoleSwallowEffects,
                    color: BLACK_HOLE_ROCKET_SWALLOW_COLOR,
                    inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                    radius: Math.max(previousRocket.radius * 2.8, 12),
                    startedAtSec: nowSec,
                    startPos: previousRocket.pos,
                    targetPos: world!.blackHole!.pos,
                  });
                },
              });
              syncSharedCombatTrackedRockets({
                previousRocketsById: previousRocketBodiesById,
                rockets: world?.rockets ?? [],
              });

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
              if (shieldVisual !== null && playerPlanet !== null) {
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
                  const shieldHitReact = authoritativeShieldActive
                    ? getSharedCombatShieldHitReact({
                        bursts: activeImpactBursts,
                        nowSec,
                        planetId: playerPlanet.id,
                        shieldRadius: playerPlanet.radius,
                      })
                    : null;
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
                  syncSharedCombatShieldVisual({
                    state: {
                      arcOpacity: clamp(
                        authoritativeShieldActive
                          ? 0.16 +
                              shieldLoadRatio * 0.3 +
                              Math.sin(nowSec * 7.6) * 0.05 +
                              (shieldHitReact?.arcBoost ?? 0)
                          : 0.14 + immediateShieldFade * 0.34,
                        0,
                        1,
                      ),
                      center:
                        authoritativeShieldActive && shieldHitReact !== null
                          ? add(playerPlanet.pos, shieldHitReact.offset)
                          : playerPlanet.pos,
                      crestOpacity: clamp(
                        authoritativeShieldActive
                          ? 0.16 +
                              shieldLoadRatio * 0.36 +
                              Math.sin(nowSec * 10.8) * 0.06 +
                              (shieldHitReact?.arcBoost ?? 0) * 0.88
                          : 0.1 + immediateShieldFade * 0.3,
                        0,
                        1,
                      ),
                      glowOpacity: clamp(
                        authoritativeShieldActive
                          ? 0.05 +
                              shieldLoadRatio * 0.11 +
                              Math.sin(nowSec * 9.4) * 0.03 +
                              (shieldHitReact?.glowBoost ?? 0)
                          : 0.04 +
                              immediateShieldFade * 0.18 +
                              Math.sin(nowSec * 10.2) * 0.02,
                        0,
                        1,
                      ),
                      panelOpacity: clamp(
                        authoritativeShieldActive
                          ? 0.18 +
                              shieldLoadRatio * 0.42 +
                              Math.sin(nowSec * 9.8) * 0.05 +
                              (shieldHitReact?.arcBoost ?? 0) * 0.84
                          : 0.12 + immediateShieldFade * 0.28,
                        0,
                        1,
                      ),
                      radius:
                        playerPlanet.radius *
                        pulse *
                        (authoritativeShieldActive
                          ? (shieldHitReact?.scale ?? 1)
                          : 1 + immediateShieldFade * 0.06),
                      rotation:
                        shieldAngle +
                        (authoritativeShieldActive
                          ? (shieldHitReact?.rotation ?? 0)
                          : 0),
                      z: 0,
                    },
                    visual: shieldVisual,
                  });
                } else {
                  syncSharedCombatShieldVisual({
                    state: null,
                    visual: shieldVisual,
                  });
                  if (
                    immediateShieldAgeSec >
                    IMMEDIATE_SHIELD_FEEDBACK_DURATION_SEC
                  ) {
                    immediateShieldFeedbackState = null;
                  }
                }
              } else if (shieldVisual !== null) {
                syncSharedCombatShieldVisual({
                  state: null,
                  visual: shieldVisual,
                });
              }

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
              if (lockRingVisual !== null) {
                hideSharedCombatLockRingVisual(lockRingVisual);
              }
              if (cannonVisual !== null) {
                const cannonAccentMaterial = cannonVisual.accentMaterial;
                const sharedCannonVisual = {
                  barrelBandMesh: cannonVisual.barrelBandMesh,
                  barrelMesh: cannonVisual.barrelMesh,
                  breechMesh: cannonVisual.breechMesh,
                  flashMaterial: cannonVisual.flashMaterial,
                  flashMesh: cannonVisual.flashMesh,
                  group: cannonVisual.group,
                  muzzleMesh: cannonVisual.muzzleMesh,
                  setAccentColor: (value: string) => {
                    cannonAccentMaterial.color.set(value);
                  },
                  stemMesh: cannonVisual.stemMesh,
                };
                const controlsEnabled =
                  runtime.phase === "combat" &&
                  runtime.connectionState === "connected";
                if (!controlsEnabled || playerPlanet === null) {
                  syncSharedCombatCannonVisual({
                    state: {
                      accent: "#ffffff",
                      aimAngle: 0,
                      flashAccent: null,
                      flashAgeSec: null,
                      layout: cannonLayout,
                      position: { x: 0, y: 0 },
                      surfaceOffset: 0,
                      visible: false,
                      z: 6,
                    },
                    visual: sharedCannonVisual,
                  });
                } else {
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
                  if (
                    immediateCannonFlashState !== null &&
                    nowSec - immediateCannonFlashState.startedAtSec >
                      cannonLayout.flashDurationSec
                  ) {
                    immediateCannonFlashState = null;
                  }
                  syncSharedCombatCannonVisual({
                    state: {
                      accent: weaponAccent,
                      aimAngle,
                      flashAccent:
                        authoritativeShieldActive ||
                        immediateCannonFlashState === null
                          ? null
                          : rocketVisualTuning[
                              immediateCannonFlashState.rocketKind
                            ].hudAccent,
                      flashAgeSec:
                        authoritativeShieldActive ||
                        immediateCannonFlashState === null
                          ? null
                          : nowSec - immediateCannonFlashState.startedAtSec,
                      layout: cannonLayout,
                      position: playerPlanet.pos,
                      surfaceOffset: stemStart,
                      visible: !authoritativeShieldActive,
                      z: 6,
                    },
                    visual: sharedCannonVisual,
                  });

                  if (
                    lockRingVisual !== null &&
                    selectedRocketKind === "seeker" &&
                    currentSeekerLockTarget !== null &&
                    !authoritativeShieldActive
                  ) {
                    const lockProgress = currentSeekerLockProgress;
                    syncSharedCombatLockRingVisual({
                      state: {
                        baseRadius: currentSeekerLockTarget.radius + 22,
                        locked: lockProgress >= 1,
                        nowSec,
                        position: currentSeekerLockTarget.pos,
                        progress: lockProgress,
                        z: 5.5,
                      },
                      visual: lockRingVisual,
                    });
                  }
                }
              }

              updateImpactBurstVisuals({
                activeBursts: activeImpactBursts,
                nowSec,
                visuals: impactBurstVisuals,
                world,
              });

              if (boostBurstVisual !== null) {
                pruneSharedCombatBoostBursts({
                  activeBursts: activeBoostBursts,
                  nowSec,
                });
                const playerBoostDirectionOverride: SharedCombatBoostDirectionOverride | null =
                  playerPlanet !== null &&
                  runtime.phase === "combat" &&
                  runtime.connectionState === "connected" &&
                  (runtime.snapshot?.self?.boostCharges ?? 0) > 0 &&
                  viewportInputController.state.pendingAbilityRequests.boost
                    ? (() => {
                        const heldBoostAimDelta = sub(
                          viewportInputController.state.inputState.aimWorld,
                          playerPlanet.pos,
                        );
                        return len(heldBoostAimDelta) > 0.001
                          ? {
                              direction: normalizeVec2(heldBoostAimDelta),
                              planetId: playerPlanet.id,
                            }
                          : null;
                      })()
                    : null;
                syncSharedCombatBoostBurstVisual({
                  boostVisual: boostBurstVisual,
                  bursts: activeBoostBursts,
                  directionOverride: playerBoostDirectionOverride,
                  getBodyById: (planetId: number) =>
                    authoritativePlanetsById.get(planetId) ?? null,
                  maxParticlesPerBurst: BOOST_BURST_PARTICLES,
                  nowSec,
                });
              }

              if (
                gravityPulseVisual !== null &&
                gravityPulseFeedbackState !== null
              ) {
                if (
                  nowSec - gravityPulseFeedbackState.startedAtSec >
                  IMMEDIATE_GRAVITY_PULSE_DURATION_SEC
                ) {
                  gravityPulseFeedbackState = null;
                }
                updateSharedCombatGravityPulseVisual({
                  durationSec: IMMEDIATE_GRAVITY_PULSE_DURATION_SEC,
                  nowSec,
                  pulse: gravityPulseFeedbackState,
                  visibleWorldHeight: cameraState.visibleWorldHeight,
                  visual: gravityPulseVisual,
                  z: {
                    core: 5.1,
                    echo: 5.2,
                    ring: 5.25,
                  },
                });
              } else if (gravityPulseVisual !== null) {
                hideGravityPulseVisual(gravityPulseVisual);
              }

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

              syncSharedCombatCacheVisuals({
                activeCacheIds,
                badgeBaseSize: tuning.visuals.caches.badgeBaseSize,
                badgeMaterials: cacheSpriteAssets.badgeMaterials,
                badgeScale: tuning.visuals.caches.badgeScale,
                cacheVisuals,
                caches: world?.caches ?? [],
                createCacheVisual: createSharedCacheVisual,
                getCacheIconKey: getSharedCacheIconKey,
                nowSec,
                scene,
                updateCacheVisualBadge: updateSharedCacheVisualBadge,
              });
              queueSharedCombatRemovedCacheSwallowEffects({
                activeCacheIds,
                blackHole: world?.blackHole ?? null,
                previousCachesById: previousCacheBodiesById,
                queueEffect: (previousCache) => {
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
              });
              syncSharedCombatTrackedCaches({
                caches: world?.caches ?? [],
                previousCachesById: previousCacheBodiesById,
              });

              syncSharedCombatBlackHoleVisual({
                blackHole:
                  world?.blackHole === undefined
                    ? null
                    : {
                        killRadius: world.blackHole.killRadius,
                        pos: world.blackHole.pos,
                        z: 5,
                      },
                nowSec,
                visual: {
                  group: blackHoleGroup,
                  ringMesh: blackHoleRing,
                },
              });
              updateBlackHoleSwallowEffects({
                activeEffects: activeBlackHoleSwallowEffects,
                inactiveVisuals: inactiveBlackHoleSwallowVisuals,
                nowSec,
              });
              updateSharedCombatPlanetExplosions({
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
