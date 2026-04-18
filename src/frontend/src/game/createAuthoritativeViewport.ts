import type {
  ClientMsg,
  Drone,
  PlanetPrivateState,
  PlanetPublic,
  Rocket,
  RocketKind,
  Vec2,
  World,
} from "@3body/shared";
import {
  ARENA_RADIUS,
  clamp,
  FIXED_STEP_SEC,
  getSunVisualProfile,
  len,
  lerp,
  normalize as normalizeVec2,
  SNAPSHOT_HZ,
  sub,
} from "@3body/shared";
import { attribute, color, float, length, smoothstep, vec2 } from "three/tsl";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  WebGPURenderer,
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
import { getCloakPlanetOpacity } from "./viewport/cloakVisual";
import { createGameViewportInputController } from "./viewport/localInput";
import { createViewportPerformanceProfiler } from "./viewport/performanceProfiler";
import { DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE } from "./viewport/renderQuality";
import {
  disposeViewportRendererSession,
  initializeViewportRendererSession,
  reportViewportRendererFailure,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";
import { createRuntimeStatsTracker } from "./viewport/runtimeStats";
import {
  areHudStatesEqual,
  createInitialHudState,
  type GameViewportHudState,
} from "./viewportHud";
import { getRuntimeTuningDocument } from "./runtimeTuning";
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

const CAMERA_DISTANCE = 100;
const CAMERA_FOLLOW_LERP = 6.1;
const CAMERA_ZOOM_LERP = 5.2;
const BACKDROP_OVERDRAW = 1.35;
const MAX_FRAME_DELTA_SEC = 0.1;
const HUD_UPDATE_INTERVAL_SEC = 1 / 12;
const MAX_TRAIL_SAMPLES = 220;
const TRAIL_POINT_SIZE = 12;
const INPUT_SEND_INTERVAL_MS = 1000 / 60;

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

interface PlanetTrailVisual {
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  samples: Vec2[];
}

interface RocketVisual {
  body: Mesh;
  flame: Mesh;
  group: Group;
  trail: Mesh;
}

interface SunVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  rotationSpeed: number;
  warpMesh: Mesh;
}

interface DroneVisual {
  finMesh: Mesh;
  glowMesh: Mesh;
  group: Group;
  hullMesh: Mesh;
  noseMesh: Mesh;
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

const interpolateVec2 = (
  previous: Vec2,
  current: Vec2,
  alpha: number,
): Vec2 => ({
  x: lerp(previous.x, current.x, alpha),
  y: lerp(previous.y, current.y, alpha),
});

const interpolateDynamicEntity = <
  T extends { id: number; pos: Vec2; vel: Vec2 },
>(
  current: T,
  previousById: ReadonlyMap<number, T>,
  alpha: number,
): T => {
  const previous = previousById.get(current.id);
  if (previous === undefined) {
    return current;
  }

  return {
    ...current,
    pos: interpolateVec2(previous.pos, current.pos, alpha),
    vel: interpolateVec2(previous.vel, current.vel, alpha),
  };
};

const getControlledBody = (
  playerPlanet: PlanetPublic | null,
  activeDrone: Drone | null,
) => activeDrone ?? playerPlanet;

const getGameplayCameraHeights = () => {
  const cameraTuning = getRuntimeTuningDocument().gameplay.camera;

  return {
    followWorldHeight: cameraTuning.viewportWorldHeight,
    readModeWorldHeight: cameraTuning.readModeWorldHeight,
  };
};

const getCameraFrame = (
  world: World | null,
  playerPlanet: PlanetPublic | null,
  activeDrone: Drone | null,
  readModeHeld: boolean,
): { centerX: number; centerY: number; visibleWorldHeight: number } => {
  const { followWorldHeight, readModeWorldHeight } = getGameplayCameraHeights();

  if (world === null) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: followWorldHeight,
    };
  }

  const controlledBody = getControlledBody(playerPlanet, activeDrone);
  if (controlledBody === null) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: readModeHeld
        ? readModeWorldHeight
        : followWorldHeight,
    };
  }

  return {
    centerX: controlledBody.pos.x,
    centerY: controlledBody.pos.y,
    visibleWorldHeight: readModeHeld ? readModeWorldHeight : followWorldHeight,
  };
};

const pushTrailSample = (trail: PlanetTrailVisual, position: Vec2) => {
  trail.samples.push({ x: position.x, y: position.y });
  if (trail.samples.length > MAX_TRAIL_SAMPLES) {
    trail.samples.shift();
  }
};

const updateTrailVisual = (trail: PlanetTrailVisual) => {
  const positionArray = trail.positionAttribute.array as Float32Array;
  const opacityArray = trail.opacityAttribute.array as Float32Array;
  const sampleCount = Math.min(trail.samples.length, MAX_TRAIL_SAMPLES);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = trail.samples[index]!;
    const offset = index * 3;
    const progress = sampleCount <= 1 ? 1 : index / (sampleCount - 1);
    positionArray[offset] = sample.x;
    positionArray[offset + 1] = sample.y;
    positionArray[offset + 2] = 0;
    opacityArray[index] = progress * progress * 0.75;
  }

  trail.geometry.setDrawRange(0, sampleCount);
  trail.positionAttribute.needsUpdate = true;
  trail.opacityAttribute.needsUpdate = true;
  trail.points.visible = sampleCount > 1;
};

const createPlanetTrailVisual = (trailColor: string): PlanetTrailVisual => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(MAX_TRAIL_SAMPLES * 3);
  const opacity = new Float32Array(MAX_TRAIL_SAMPLES);
  const positionAttribute = new Float32BufferAttribute(positions, 3);
  const opacityAttribute = new Float32BufferAttribute(opacity, 1);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("trailOpacity", opacityAttribute);
  geometry.setDrawRange(0, 0);

  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.colorNode = color(trailColor);
  material.opacityNode = attribute("trailOpacity", "float");
  material.size = TRAIL_POINT_SIZE;
  material.alphaTest = 0.01;

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.position.z = -2;
  points.renderOrder = -3;

  return {
    geometry,
    opacityAttribute,
    points,
    positionAttribute,
    samples: [],
  };
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
  const planetVisuals = new Map<number, PlanetVisual>();
  const planetTrails = new Map<number, PlanetTrailVisual>();
  const rocketVisuals = new Map<number, RocketVisual>();
  const droneVisuals = new Map<number, DroneVisual>();
  const cacheVisuals = new Map<number, CacheVisual>();
  const cameraState = {
    centerX: 0,
    centerY: 0,
    renderCenterX: 0,
    renderCenterY: 0,
    visibleWorldHeight: getGameplayCameraHeights().followWorldHeight,
  };
  let rendererSessionToken = 0;

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

    const width = Math.max(1, hostElement.clientWidth);
    const height = Math.max(1, hostElement.clientHeight);
    const aspect = width / height;
    const worldHalfHeight = cameraState.visibleWorldHeight / 2;
    const worldHalfWidth = worldHalfHeight * aspect;

    cameraState.renderCenterX = cameraState.centerX;
    cameraState.renderCenterY = cameraState.centerY;
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

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, currentMaxPixelRatio),
    );
    renderer.setSize(
      Math.max(1, hostElement.clientWidth),
      Math.max(1, hostElement.clientHeight),
      false,
    );
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
    rendererSessionToken += 1;
    window.removeEventListener("resize", resizeViewport);
    inputController?.dispose();
    inputController = null;
    syncAimWorldToPointer = null;

    for (const visual of sunVisuals.values()) {
      sceneRemoveSafe(visual.coreMesh, visual.glowMesh, visual.warpMesh);
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
    for (const visual of droneVisuals.values()) {
      sceneRemoveSafe(visual.group);
    }
    for (const visual of cacheVisuals.values()) {
      sceneRemoveSafe(visual.group);
    }
    sunVisuals.clear();
    planetVisuals.clear();
    planetTrails.clear();
    rocketVisuals.clear();
    droneVisuals.clear();
    cacheVisuals.clear();

    for (let index = disposables.length - 1; index >= 0; index -= 1) {
      try {
        disposables[index]!.dispose();
      } catch (error) {
        console.warn(
          "[frontend] Failed to dispose authoritative viewport resource.",
          error,
        );
      }
    }
    disposables.length = 0;

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
    reportViewportRendererFailure({
      error,
      failureLogLabel: "authoritative viewport",
      hostElement,
      isDisposed: () => disposed,
    });
  };

  const startViewport = async () => {
    const sessionToken = ++rendererSessionToken;
    try {
      const rendererSession = await initializeViewportRendererSession({
        failureLogLabel: "authoritative viewport",
        hostElement,
        isDisposed: () => disposed,
      });
      if (rendererSession === null || sessionToken !== rendererSessionToken) {
        if (rendererSession !== null) {
          disposeViewportRendererSession({
            bootstrap: rendererSession.bootstrap,
            hostElement,
            renderer: rendererSession.renderer,
          });
        }
        return;
      }

      const { bootstrap, renderer: nextRenderer } = rendererSession;
      rendererBootstrap = bootstrap;
      renderer = nextRenderer;

      const backgroundVisuals = getRuntimeTuningDocument().visuals.background;
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
      const droneHullGeometry = new BoxGeometry(1, 1, 1);
      const droneFinGeometry = new PlaneGeometry(1, 1);
      const droneNoseGeometry = new CylinderGeometry(0, 1, 1, 16, 1);
      const blackHoleCoreGeometry = new CircleGeometry(1, 64);
      const boundaryGeometry = new RingGeometry(0.995, 1.005, 256);
      rocketGeometry.rotateZ(-Math.PI / 2);
      droneNoseGeometry.rotateZ(-Math.PI / 2);
      disposables.push(
        sunGeometry,
        planetGeometry,
        glowGeometry,
        warpGeometry,
        rocketGeometry,
        ribbonGeometry,
        droneHullGeometry,
        droneFinGeometry,
        droneNoseGeometry,
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

      const blackHoleRingMaterial = new MeshBasicMaterial({
        color: "#b8dbff",
        depthWrite: false,
        opacity: 0.22,
        transparent: true,
      });
      const blackHoleCoreMaterial = new MeshBasicMaterial({
        color: "#03060b",
        depthWrite: false,
      });
      const blackHoleGroup = new Group();
      const blackHoleRing = new Mesh(glowGeometry, blackHoleRingMaterial);
      const blackHoleCore = new Mesh(
        blackHoleCoreGeometry,
        blackHoleCoreMaterial,
      );
      blackHoleRing.position.z = -1;
      blackHoleCore.position.z = 0;
      blackHoleGroup.visible = false;
      blackHoleGroup.add(blackHoleRing, blackHoleCore);
      scene.add(blackHoleGroup);
      disposables.push(blackHoleRingMaterial, blackHoleCoreMaterial);

      const cacheSpriteAssets = createCacheSpriteAssets(
        hostElement.ownerDocument,
      );
      disposables.push({
        dispose: () => {
          disposeCacheSpriteAssets(cacheSpriteAssets);
        },
      });

      const emitConnectionHud = (timeMs: number, extrapolating: boolean) => {
        const runtime = options.getRuntimeState();
        const snapshot = runtime.snapshot;
        const world = snapshot?.world ?? null;
        const self = snapshot?.self ?? null;
        const playerId = runtime.playerId;
        const playerPlanet =
          playerId === null || world === null
            ? null
            : (world.planets.find((planet) => planet.playerId === playerId) ??
              null);
        const activeDrone =
          playerId === null || world === null
            ? null
            : (world.drones.find((drone) => drone.ownerId === playerId) ??
              null);
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
            activeDrone,
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
            eventLog: runtime.recentEvents,
            extrapolating,
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
              inputController?.state.inputState.selectedRocketKind ?? "light",
            self,
            world,
          }),
        );
      };

      inputController = createGameViewportInputController({
        canvasElement: nextRenderer.domElement,
        getPlayerControlState: () => {
          const runtime = options.getRuntimeState();
          const world = runtime.snapshot?.world;
          const playerId = runtime.playerId;
          if (world === undefined || playerId === null) {
            return { activeDroneId: null, controlMode: "planet" } as const;
          }

          const activeDrone =
            world.drones.find((drone) => drone.ownerId === playerId) ?? null;
          return {
            activeDroneId: activeDrone?.id ?? null,
            controlMode: activeDrone === null ? "planet" : "drone",
          } as const;
        },
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
        if (!pointerState?.hasPointer) {
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
          const frameProfilerStartMs = profilingEnabled ? performance.now() : 0;
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
          const sampledRuntimeStats = runtimeStatsTracker.sample(frameDeltaSec);
          runtimeStats.fps = sampledRuntimeStats.fps;
          runtimeStats.frameTimeMs = sampledRuntimeStats.frameTimeMs;
          const runtime = options.getRuntimeState();
          const snapshot = runtime.snapshot;
          const previousSnapshot = runtime.previousSnapshot ?? snapshot;

          const interpolationWindowMs = 1000 / SNAPSHOT_HZ;
          const interpolationProfilerStartMs = profilingEnabled
            ? performance.now()
            : 0;
          const interpolationAlpha =
            snapshot === null || previousSnapshot === null
              ? 1
              : clamp(
                  (timeMs - snapshot.receivedAtMs) / interpolationWindowMs,
                  0,
                  1,
                );
          const extrapolating =
            snapshot !== null &&
            timeMs - snapshot.receivedAtMs > interpolationWindowMs * 1.35;

          const world =
            snapshot === null
              ? null
              : (() => {
                  const previousWorld =
                    previousSnapshot?.world ?? snapshot.world;
                  const previousSunsById = new Map(
                    previousWorld.suns.map((sun) => [sun.id, sun]),
                  );
                  const previousPlanetsById = new Map(
                    previousWorld.planets.map((planet) => [planet.id, planet]),
                  );
                  const previousRocketsById = new Map(
                    previousWorld.rockets.map((rocket) => [rocket.id, rocket]),
                  );
                  const previousDronesById = new Map(
                    previousWorld.drones.map((drone) => [drone.id, drone]),
                  );
                  const previousCachesById = new Map(
                    previousWorld.caches.map((cache) => [cache.id, cache]),
                  );
                  const previousDebrisById = new Map(
                    previousWorld.debris.map((debris) => [debris.id, debris]),
                  );

                  return {
                    ...snapshot.world,
                    suns: snapshot.world.suns.map((sun) =>
                      interpolateDynamicEntity(
                        sun,
                        previousSunsById,
                        interpolationAlpha,
                      ),
                    ),
                    planets: snapshot.world.planets.map((planet) =>
                      interpolateDynamicEntity(
                        planet,
                        previousPlanetsById,
                        interpolationAlpha,
                      ),
                    ),
                    rockets: snapshot.world.rockets.map((rocket) =>
                      interpolateDynamicEntity(
                        rocket,
                        previousRocketsById,
                        interpolationAlpha,
                      ),
                    ),
                    drones: snapshot.world.drones.map((drone) =>
                      interpolateDynamicEntity(
                        drone,
                        previousDronesById,
                        interpolationAlpha,
                      ),
                    ),
                    caches: snapshot.world.caches.map((cache) =>
                      interpolateDynamicEntity(
                        cache,
                        previousCachesById,
                        interpolationAlpha,
                      ),
                    ),
                    debris: snapshot.world.debris.map((debris) =>
                      interpolateDynamicEntity(
                        debris,
                        previousDebrisById,
                        interpolationAlpha,
                      ),
                    ),
                    blackHole:
                      snapshot.world.blackHole === undefined
                        ? undefined
                        : previousWorld.blackHole === undefined
                          ? snapshot.world.blackHole
                          : {
                              ...snapshot.world.blackHole,
                              pos: interpolateVec2(
                                previousWorld.blackHole.pos,
                                snapshot.world.blackHole.pos,
                                interpolationAlpha,
                              ),
                            },
                  } satisfies World;
                })();
          const interpolationProfilerEndMs = profilingEnabled
            ? performance.now()
            : 0;
          const renderProfilerStartMs = profilingEnabled
            ? performance.now()
            : 0;

          const playerId = runtime.playerId;
          const playerPlanet =
            playerId === null || world === null
              ? null
              : (world.planets.find((planet) => planet.playerId === playerId) ??
                null);
          const activeDrone =
            playerId === null || world === null
              ? null
              : (world.drones.find((drone) => drone.ownerId === playerId) ??
                null);

          const frame = getCameraFrame(
            world,
            playerPlanet,
            activeDrone,
            viewportInputController.state.readModeHeld,
          );
          const cameraMoveAlpha =
            1 - Math.exp(-CAMERA_FOLLOW_LERP * frameDeltaSec);
          const cameraZoomAlpha =
            1 - Math.exp(-CAMERA_ZOOM_LERP * frameDeltaSec);
          cameraState.centerX = lerp(
            cameraState.centerX,
            frame.centerX,
            cameraMoveAlpha,
          );
          cameraState.centerY = lerp(
            cameraState.centerY,
            frame.centerY,
            cameraMoveAlpha,
          );
          cameraState.visibleWorldHeight = lerp(
            cameraState.visibleWorldHeight,
            frame.visibleWorldHeight,
            cameraZoomAlpha,
          );
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
            const controlledBody = getControlledBody(playerPlanet, activeDrone);
            if (controlledBody !== null) {
              const aimDelta = sub(
                viewportInputController.state.inputState.aimWorld,
                controlledBody.pos,
              );
              const aimDir =
                len(aimDelta) > 0
                  ? normalizeVec2(aimDelta)
                  : ({ x: 1, y: 0 } as Vec2);

              if (timeMs - lastInputSentAtMs >= INPUT_SEND_INTERVAL_MS) {
                lastInputSentAtMs = timeMs;
                options.dispatchMessage({
                  clientTick: nextClientTick,
                  mouseDir: aimDir,
                  type: "input",
                });
                options.dispatchMessage({
                  dir: aimDir,
                  type: "shieldAim",
                });
                nextClientTick += 1;
              }

              const fireRequested =
                viewportInputController.consumeShotRequest();
              if (fireRequested) {
                options.dispatchMessage({
                  aimDir,
                  clientTick: nextClientTick,
                  kind: viewportInputController.state.inputState
                    .selectedRocketKind,
                  type: "fireRocket",
                });
                nextClientTick += 1;
              }

              const pendingAbilityRequests =
                viewportInputController.state.pendingAbilityRequests;
              if (pendingAbilityRequests.foresight) {
                options.dispatchMessage({ slot: "q", type: "ability" });
              }
              if (pendingAbilityRequests.shield) {
                options.dispatchMessage({ slot: "w", type: "ability" });
              }
              if (pendingAbilityRequests.boost) {
                options.dispatchMessage({ slot: "e", type: "ability" });
              }
              if (pendingAbilityRequests.gravityPulse) {
                options.dispatchMessage({ slot: "g", type: "ability" });
              }
              if (pendingAbilityRequests.cloak) {
                options.dispatchMessage({ slot: "c", type: "ability" });
              }
            }
          }

          viewportInputController.clearStepScopedRequests();

          const tuning = getRuntimeTuningDocument();
          const planetVisualTuning = tuning.visuals.planets;
          const rocketVisualTuning = tuning.visuals.rockets;
          const droneVisualTuning = tuning.visuals.drone;
          const renderTick = snapshot?.tick ?? 0;

          const activeSunIds = new Set<number>();
          for (const [index, sun] of (world?.suns ?? []).entries()) {
            activeSunIds.add(sun.id);
            const sunProfile = getSunVisualProfile(tuning.visuals.suns, index);
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
              scene.remove(visual.coreMesh, visual.glowMesh, visual.warpMesh);
              (visual.coreMesh.material as { dispose: () => void }).dispose();
              (visual.glowMesh.material as { dispose: () => void }).dispose();
              (visual.warpMesh.material as { dispose: () => void }).dispose();
              sunVisuals.delete(sunId);
            }
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
              const glowMesh = new Mesh(glowGeometry, glowMaterial.material);
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
              trail = createPlanetTrailVisual(archetypeVisual.trailColor);
              planetTrails.set(planet.id, trail);
              scene.add(trail.points);
            }

            visual.mesh.position.set(planet.pos.x, planet.pos.y, 0);
            visual.glowMesh.position.set(planet.pos.x, planet.pos.y, 0.16);
            const planetOpacity = getCloakPlanetOpacity(
              planet.hideTrailUntilTick,
              renderTick,
            );
            visual.material.opacityUniform.value = planetOpacity;
            visual.glowOpacityUniform.value = planetOpacity;
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

            pushTrailSample(trail, planet.pos);
            updateTrailVisual(trail);
          }
          for (const [planetId, visual] of planetVisuals) {
            if (!activePlanetIds.has(planetId)) {
              scene.remove(visual.mesh, visual.glowMesh);
              visual.material.dispose();
              (visual.glowMesh.material as { dispose: () => void }).dispose();
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
            const rocketAppearance = rocketVisualTuning[rocket.rocketKind];
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

            const angle = Math.atan2(rocket.vel.y, rocket.vel.x);
            visual.group.position.set(rocket.pos.x, rocket.pos.y, 3);
            visual.group.rotation.z = angle;
            visual.body.scale.set(
              rocketAppearance.bodyScale.x,
              rocketAppearance.bodyScale.y,
              rocketAppearance.bodyScale.y,
            );
            visual.trail.position.set(
              -rocketAppearance.bodyScale.x * 0.6,
              0,
              -0.1,
            );
            visual.trail.scale.set(
              rocketAppearance.trailScale.x,
              rocketAppearance.trailScale.y,
              1,
            );
            visual.flame.position.set(
              -rocketAppearance.bodyScale.x * 0.45,
              0,
              0.05,
            );
            visual.flame.scale.set(
              rocketAppearance.flameScale.x,
              rocketAppearance.flameScale.y,
              1,
            );
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

          const activeDroneIds = new Set<number>();
          for (const drone of world?.drones ?? []) {
            activeDroneIds.add(drone.id);
            let visual = droneVisuals.get(drone.id);
            if (visual === undefined) {
              const glowMaterial = new MeshBasicMaterial({
                blending: AdditiveBlending,
                color: droneVisualTuning.activeColor,
                depthWrite: false,
                opacity: 0.26,
                transparent: true,
              });
              const hullMaterial = new MeshBasicMaterial({
                color: droneVisualTuning.activeColor,
              });
              const finMaterial = new MeshBasicMaterial({
                color: droneVisualTuning.activeColor,
                depthWrite: false,
                opacity: 0.9,
                transparent: true,
              });
              const noseMaterial = new MeshBasicMaterial({
                color: "#f4fbff",
                depthWrite: false,
              });
              const glowMesh = new Mesh(glowGeometry, glowMaterial);
              const hullMesh = new Mesh(droneHullGeometry, hullMaterial);
              const finMesh = new Mesh(droneFinGeometry, finMaterial);
              const noseMesh = new Mesh(droneNoseGeometry, noseMaterial);
              const group = new Group();
              glowMesh.position.z = -0.1;
              finMesh.position.set(-7, 0, 0.1);
              noseMesh.position.set(12, 0, 0.2);
              group.add(glowMesh, finMesh, hullMesh, noseMesh);
              scene.add(group);
              visual = { finMesh, glowMesh, group, hullMesh, noseMesh };
              droneVisuals.set(drone.id, visual);
            }

            const accent = droneVisualTuning.activeColor;
            (visual.hullMesh.material as MeshBasicMaterial).color.set(accent);
            (visual.finMesh.material as MeshBasicMaterial).color.set(accent);
            (visual.glowMesh.material as MeshBasicMaterial).color.set(accent);
            visual.group.position.set(drone.pos.x, drone.pos.y, 4);
            visual.group.rotation.z =
              len(drone.vel) > 0 ? Math.atan2(drone.vel.y, drone.vel.x) : 0;
            visual.hullMesh.scale.set(22, 6, 6);
            visual.finMesh.scale.set(12, 10, 1);
            visual.noseMesh.scale.set(8, 6, 6);
            visual.glowMesh.scale.set(40, 24, 1);
          }
          for (const [droneId, visual] of droneVisuals) {
            if (!activeDroneIds.has(droneId)) {
              scene.remove(visual.group);
              (visual.finMesh.material as { dispose: () => void }).dispose();
              (visual.glowMesh.material as { dispose: () => void }).dispose();
              (visual.hullMesh.material as { dispose: () => void }).dispose();
              (visual.noseMesh.material as { dispose: () => void }).dispose();
              droneVisuals.delete(droneId);
            }
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
              1 + Math.sin(nowSec * visual.pulseRate + visual.bobPhase) * 0.04;
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

          blackHoleGroup.visible = world?.blackHole !== undefined;
          if (world?.blackHole !== undefined) {
            blackHoleGroup.position.set(
              world.blackHole.pos.x,
              world.blackHole.pos.y,
              5,
            );
            blackHoleRing.rotation.z = nowSec * 0.16;
            blackHoleRing.scale.set(
              world.blackHole.killRadius * 2.1,
              world.blackHole.killRadius * 2.1,
              1,
            );
            blackHoleCore.scale.set(
              world.blackHole.killRadius * 0.78,
              world.blackHole.killRadius * 0.78,
              1,
            );
          }

          if (nowSec >= lastHudUpdateSec) {
            lastHudUpdateSec = nowSec + HUD_UPDATE_INTERVAL_SEC;
            emitConnectionHud(timeMs, extrapolating);
          }

          const renderProfilerEndMs = profilingEnabled ? performance.now() : 0;
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
    } catch (error) {
      disposeViewportSession();
      reportViewportRendererFailure({
        error,
        failureLogLabel: "authoritative viewport",
        hostElement,
        isDisposed: () => disposed,
      });
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
