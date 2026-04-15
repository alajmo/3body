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
  len,
  lerp,
  normalize as normalizeVec2,
  SNAPSHOT_HZ,
  sub,
} from "@3body/shared";
import {
  attribute,
  color,
  float,
  length,
  pointUV,
  smoothstep,
  vec2,
} from "three/tsl";
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
  getCacheIconKey as getSharedCacheIconKey,
  updateCacheVisualBadge as updateSharedCacheVisualBadge,
  type CacheVisual,
} from "./viewport/cacheVisuals";
import { buildAuthoritativeHudState } from "./viewport/authoritativeHud";
import { createGameViewportInputController } from "./viewport/localInput";
import { createAdaptiveQualityController } from "./viewport/renderQuality";
import {
  createViewportRendererBootstrap,
  showViewportRendererFailure,
} from "./viewport/rendererBootstrap";
import { createRuntimeStatsTracker } from "./viewport/runtimeStats";
import {
  areHudStatesEqual,
  createInitialHudState,
  type GameViewportHudState,
} from "./viewportHud";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import {
  createBackdropMaterial,
  createPlanetGlowMaterial,
  createPlanetMaterial,
  createPlanetSpinAxis,
  createRocketFlameMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
  createStarfieldLayer,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  getPlanetForestProfile,
  SCENE_BACKGROUND,
  STARFIELD_LAYERS,
  wrapCentered,
} from "./showcaseVisuals";

const CAMERA_DISTANCE = 100;
const FOLLOW_VIEW_WORLD_HEIGHT = ARENA_RADIUS * 0.92;
const READ_MODE_WORLD_HEIGHT = ARENA_RADIUS * 1.52;
const FULL_VIEW_WORLD_HEIGHT = ARENA_RADIUS * 2.3;
const FULL_VIEW_PADDING = 260;
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
  glowMesh: Mesh;
  group: Group;
  hullMesh: Mesh;
}

interface CreateAuthoritativeViewportOptions {
  dispatchMessage: (message: ClientMsg) => void;
  getRuntimeState: () => AuthoritativeMatchRuntimeState;
  onHudStateChange?: (state: GameViewportHudState) => void;
}

const interpolateVec2 = (previous: Vec2, current: Vec2, alpha: number): Vec2 => ({
  x: lerp(previous.x, current.x, alpha),
  y: lerp(previous.y, current.y, alpha),
});

const interpolateDynamicEntity = <T extends { id: number; pos: Vec2; vel: Vec2 }>(
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
  playerId: string | null,
  playerPlanet: PlanetPublic | null,
  activeDrone: Drone | null,
) => {
  if (playerId === null) {
    return null;
  }

  return activeDrone ?? playerPlanet;
};

const getCameraFrame = (
  aspect: number,
  world: World | null,
  playerPlanet: PlanetPublic | null,
  activeDrone: Drone | null,
  fullViewEnabled: boolean,
  readModeHeld: boolean,
  planetBodyScale: number,
): { centerX: number; centerY: number; visibleWorldHeight: number } => {
  if (world === null) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: FOLLOW_VIEW_WORLD_HEIGHT,
    };
  }

  if (!fullViewEnabled) {
    const controlledBody = getControlledBody(null, playerPlanet, activeDrone);
    if (controlledBody === null) {
      return {
        centerX: 0,
        centerY: 0,
        visibleWorldHeight: readModeHeld
          ? READ_MODE_WORLD_HEIGHT
          : FOLLOW_VIEW_WORLD_HEIGHT,
      };
    }

    return {
      centerX: controlledBody.pos.x,
      centerY: controlledBody.pos.y,
      visibleWorldHeight: readModeHeld
        ? READ_MODE_WORLD_HEIGHT
        : FOLLOW_VIEW_WORLD_HEIGHT,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includeCircle = (x: number, y: number, radius: number) => {
    minX = Math.min(minX, x - radius);
    maxX = Math.max(maxX, x + radius);
    minY = Math.min(minY, y - radius);
    maxY = Math.max(maxY, y + radius);
  };

  for (const sun of world.suns) {
    includeCircle(sun.pos.x, sun.pos.y, sun.radius);
  }
  for (const planet of world.planets) {
    includeCircle(planet.pos.x, planet.pos.y, planet.radius * planetBodyScale);
  }
  for (const drone of world.drones) {
    includeCircle(drone.pos.x, drone.pos.y, drone.radius);
  }
  if (world.blackHole !== undefined) {
    includeCircle(
      world.blackHole.pos.x,
      world.blackHole.pos.y,
      world.blackHole.killRadius,
    );
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: FULL_VIEW_WORLD_HEIGHT,
    };
  }

  const paddedWidth = maxX - minX + FULL_VIEW_PADDING * 2;
  const paddedHeight = maxY - minY + FULL_VIEW_PADDING * 2;
  const safeAspect = Math.max(0.5, aspect);

  return {
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
    visibleWorldHeight: Math.max(
      FULL_VIEW_WORLD_HEIGHT,
      paddedHeight,
      paddedWidth / safeAspect,
    ),
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
  material.opacityNode = attribute("trailOpacity", "float").mul(
    float(1).sub(smoothstep(0.12, 0.48, length(pointUV.sub(vec2(0.5, 0.5))))),
  );
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
  let rendererBootstrap:
    | Awaited<ReturnType<typeof createViewportRendererBootstrap>>
    | null = null;
  let camera: OrthographicCamera | null = null;
  let backdropMesh: Mesh | null = null;
  let inputController: ReturnType<typeof createGameViewportInputController> | null =
    null;
  let syncAimWorldToPointer: (() => void) | null = null;
  let lastHudState = createInitialHudState();
  let lastHudUpdateSec = 0;
  let previousFrameTimeSec: number | null = null;
  let lastInputSentAtMs = 0;
  let nextClientTick = 1;
  const qualityController = createAdaptiveQualityController();
  let renderQuality = qualityController.getProfile();
  let currentMaxPixelRatio = renderQuality.maxPixelRatio;
  const runtimeStatsTracker = createRuntimeStatsTracker();
  const runtimeStats = {
    fps: 0,
    frameTimeMs: 0,
  };
  const disposables: Array<{ dispose: () => void }> = [];
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
    visibleWorldHeight: FOLLOW_VIEW_WORLD_HEIGHT,
  };

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

    if (backdropMesh !== null) {
      backdropMesh.position.set(
        cameraState.renderCenterX,
        cameraState.renderCenterY,
        -40,
      );
      backdropMesh.scale.set(
        worldHalfWidth * 2 * BACKDROP_OVERDRAW,
        worldHalfHeight * 2 * BACKDROP_OVERDRAW,
        1,
      );
    }
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

  void (async () => {
    try {
      const bootstrap = await createViewportRendererBootstrap({
        hostElement,
        target: "authoritativeMatch",
      });
      const nextRenderer = bootstrap.renderer;
      if (disposed) {
        bootstrap.dispose();
        nextRenderer.dispose();
        return;
      }

      rendererBootstrap = bootstrap;
      renderer = nextRenderer;

      const scene = new Scene();
      scene.background = SCENE_BACKGROUND.clone();

      const nextCamera = new OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
      nextCamera.position.set(0, 0, CAMERA_DISTANCE);
      nextCamera.lookAt(0, 0, 0);
      camera = nextCamera;

      const backdropGeometry = new PlaneGeometry(1, 1);
      const backdropMaterial = createBackdropMaterial();
      backdropMesh = new Mesh(backdropGeometry, backdropMaterial);
      backdropMesh.frustumCulled = false;
      backdropMesh.renderOrder = -40;
      scene.add(backdropMesh);
      disposables.push(backdropGeometry, backdropMaterial);

      const starfieldLayers = STARFIELD_LAYERS.map((layerConfig) => {
        const layer = createStarfieldLayer(
          layerConfig.count,
          layerConfig.size,
          layerConfig.alphaScale,
          layerConfig.z,
          layerConfig.parallax,
        );
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
        droneHullGeometry,
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
      const blackHoleCore = new Mesh(blackHoleCoreGeometry, blackHoleCoreMaterial);
      blackHoleRing.position.z = -1;
      blackHoleCore.position.z = 0;
      blackHoleGroup.visible = false;
      blackHoleGroup.add(blackHoleRing, blackHoleCore);
      scene.add(blackHoleGroup);
      disposables.push(blackHoleRingMaterial, blackHoleCoreMaterial);

      const cacheSpriteAssets = createCacheSpriteAssets(hostElement.ownerDocument);
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
            : (world.planets.find((planet) => planet.playerId === playerId) ?? null);
        const activeDrone =
          playerId === null || world === null
            ? null
            : (world.drones.find(
                (drone) => drone.ownerId === playerId && drone.mode === "piloted",
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
            currentTick: snapshot?.tick ?? 0,
            eventLog: runtime.recentEvents,
            extrapolating,
            playerId,
            playerPlanet,
            recentEventsNowMs: timeMs,
            rosterNameByPlayerId,
            runtimeStats,
            selectedWeapon: inputController?.state.inputState.selectedRocketKind ?? "light",
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
            world.drones.find(
              (drone) => drone.ownerId === playerId && drone.mode === "piloted",
            ) ?? null;
          return {
            activeDroneId: activeDrone?.id ?? null,
            controlMode: activeDrone === null ? "planet" : "drone",
          } as const;
        },
        initialPlayer: {
          aimWorld: { x: 0, y: 0 },
          selectedRocketKind: "light",
        },
        isSandboxPaused: () => false,
        sandboxControlsEnabled: () => {
          const runtime = options.getRuntimeState();
          return runtime.phase === "combat" && runtime.connectionState === "connected";
        },
        syncAimWorldToPointer: () => {
          syncAimWorldToPointer?.();
        },
        windowTarget: window,
      });

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
        const pointerState = inputController?.state.pointerState;
        if (!pointerState?.hasPointer) {
          return;
        }

        inputController.state.inputState.aimWorld = screenToWorld(
          pointerState.clientX,
          pointerState.clientY,
        );
      };

      resizeViewport();
      window.addEventListener("resize", resizeViewport);

      nextRenderer.setAnimationLoop((timeMs = performance.now()) => {
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
        const nextRenderQuality = qualityController.update(
          nowSec,
          runtimeStats.frameTimeMs,
        );
        if (nextRenderQuality.changed) {
          renderQuality = nextRenderQuality.profile;
          currentMaxPixelRatio = renderQuality.maxPixelRatio;
          resizeViewport();
        }

        const runtime = options.getRuntimeState();
        const snapshot = runtime.snapshot;
        const previousSnapshot = runtime.previousSnapshot ?? snapshot;
        const interpolationWindowMs = 1000 / SNAPSHOT_HZ;
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
                const previousWorld = previousSnapshot?.world ?? snapshot.world;
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
                    interpolateDynamicEntity(sun, previousSunsById, interpolationAlpha),
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
                    interpolateDynamicEntity(drone, previousDronesById, interpolationAlpha),
                  ),
                  caches: snapshot.world.caches.map((cache) =>
                    interpolateDynamicEntity(cache, previousCachesById, interpolationAlpha),
                  ),
                  debris: snapshot.world.debris.map((debris) =>
                    interpolateDynamicEntity(debris, previousDebrisById, interpolationAlpha),
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

        const playerId = runtime.playerId;
        const playerPlanet =
          playerId === null || world === null
            ? null
            : (world.planets.find((planet) => planet.playerId === playerId) ?? null);
        const activeDrone =
          playerId === null || world === null
            ? null
            : (world.drones.find(
                (drone) => drone.ownerId === playerId && drone.mode === "piloted",
              ) ?? null);

        const aspect =
          Math.max(1, hostElement.clientWidth) /
          Math.max(1, hostElement.clientHeight);
        const planetBodyScale = getRuntimeTuningDocument().visuals.planets.bodyScale;
        const frame = getCameraFrame(
          aspect,
          world,
          playerPlanet,
          activeDrone,
          inputController.state.fullViewEnabled,
          inputController.state.readModeHeld,
          planetBodyScale,
        );
        const cameraMoveAlpha = 1 - Math.exp(-CAMERA_FOLLOW_LERP * frameDeltaSec);
        const cameraZoomAlpha = 1 - Math.exp(-CAMERA_ZOOM_LERP * frameDeltaSec);
        cameraState.centerX = lerp(cameraState.centerX, frame.centerX, cameraMoveAlpha);
        cameraState.centerY = lerp(cameraState.centerY, frame.centerY, cameraMoveAlpha);
        cameraState.visibleWorldHeight = lerp(
          cameraState.visibleWorldHeight,
          frame.visibleWorldHeight,
          cameraZoomAlpha,
        );
        applyCameraFrame();
        syncAimWorldToPointer?.();

        for (const layer of starfieldLayers) {
          layer.group.position.x = wrapCentered(
            cameraState.renderCenterX * layer.parallax,
            layer.tileSize,
          );
          layer.group.position.y = wrapCentered(
            cameraState.renderCenterY * layer.parallax,
            layer.tileSize,
          );
        }

        if (
          runtime.phase === "combat" &&
          runtime.connectionState === "connected" &&
          world !== null &&
          playerId !== null
        ) {
          const controlledBody = getControlledBody(playerId, playerPlanet, activeDrone);
          if (controlledBody !== null) {
            const aimDelta = sub(
              inputController.state.inputState.aimWorld,
              controlledBody.pos,
            );
            const aimDir =
              len(aimDelta) > 0 ? normalizeVec2(aimDelta) : ({ x: 1, y: 0 } as Vec2);

            if (timeMs - lastInputSentAtMs >= INPUT_SEND_INTERVAL_MS) {
              lastInputSentAtMs = timeMs;
              if (activeDrone !== null) {
                options.dispatchMessage({
                  aimDir,
                  burst: false,
                  type: "droneInput",
                });
              } else {
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
            }

            const fireRequested = inputController.consumeShotRequest();
            if (fireRequested) {
              if (activeDrone !== null) {
                options.dispatchMessage({
                  aimDir,
                  burst: true,
                  type: "droneInput",
                });
              } else {
                options.dispatchMessage({
                  aimDir,
                  clientTick: nextClientTick,
                  kind: inputController.state.inputState.selectedRocketKind,
                  type: "fireRocket",
                });
                nextClientTick += 1;
              }
            }

            const pendingAbilityRequests =
              inputController.state.pendingAbilityRequests;
            if (pendingAbilityRequests.foresight) {
              options.dispatchMessage({ slot: "q", type: "ability" });
            }
            if (pendingAbilityRequests.shield) {
              options.dispatchMessage({ slot: "w", type: "ability" });
            }
            if (pendingAbilityRequests.boost) {
              options.dispatchMessage({ slot: "e", type: "ability" });
            }
            if (pendingAbilityRequests.wildcard) {
              options.dispatchMessage({ slot: "r", type: "ability" });
            }

            const pendingDroneRequests = inputController.state.pendingDroneRequests;
            if (pendingDroneRequests.launch) {
              options.dispatchMessage({
                aimDir,
                type: "launchDrone",
              });
            }
            if (pendingDroneRequests.recall) {
              options.dispatchMessage({ type: "droneRecall" });
            }
            if (pendingDroneRequests.autoReturn) {
              options.dispatchMessage({ type: "droneAutoReturn" });
            }
            if (pendingDroneRequests.burst && activeDrone !== null) {
              options.dispatchMessage({
                aimDir,
                burst: true,
                type: "droneInput",
              });
            }
          }
        }

        inputController.clearStepScopedRequests();

        const tuning = getRuntimeTuningDocument();
        const planetVisualTuning = tuning.visuals.planets;
        const rocketVisualTuning = tuning.visuals.rockets;
        const droneVisualTuning = tuning.visuals.drone;

        const activeSunIds = new Set<number>();
        for (const sun of world?.suns ?? []) {
          activeSunIds.add(sun.id);
          let visual = sunVisuals.get(sun.id);
          if (visual === undefined) {
            const coreMaterial = createSunCoreMaterial("#ffd78a", "#ffd78a", sun.id);
            const glowMaterial = createSunGlowMaterial("#ffd78a", sun.id);
            const warpMaterial = createWarpMaterial("#ffd78a", sun.id);
            const coreMesh = new Mesh(sunGeometry, coreMaterial);
            const glowMesh = new Mesh(glowGeometry, glowMaterial);
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
          visual.coreMesh.scale.set(sun.radius, sun.radius, sun.radius);
          visual.glowMesh.scale.set(
            sun.radius * tuning.visuals.suns.glowScale,
            sun.radius * tuning.visuals.suns.glowScale,
            1,
          );
          visual.warpMesh.scale.set(
            sun.radius * tuning.visuals.suns.warpScale,
            sun.radius * tuning.visuals.suns.warpScale,
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
          const archetypeVisual = planetVisualTuning.archetypes[planet.archetype];
          if (visual === undefined) {
            const forestProfile = getPlanetForestProfile(planet.archetype, planet.id);
            const material = createPlanetMaterial(
              archetypeVisual.color,
              planet.id * 0.173,
              forestProfile.density,
              forestProfile.color,
            );
            const glowMaterial = createPlanetGlowMaterial(
              archetypeVisual.color,
              planet.id * 0.173,
              planetVisualTuning.auraScale,
              planetVisualTuning.auraGap,
            );
            const mesh = new Mesh(planetGeometry, material);
            const glowMesh = new Mesh(glowGeometry, glowMaterial.material);
            mesh.renderOrder = -2;
            glowMesh.position.z = 0.16;
            glowMesh.renderOrder = -1;
            scene.add(mesh, glowMesh);
            visual = {
              glowMesh,
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
          visual.mesh.scale.set(
            planet.radius * planetVisualTuning.bodyScale,
            planet.radius * planetVisualTuning.bodyScale,
            planet.radius * planetVisualTuning.bodyScale,
          );
          visual.glowMesh.scale.set(
            planet.radius * planetVisualTuning.bodyScale * planetVisualTuning.auraScale,
            planet.radius * planetVisualTuning.bodyScale * planetVisualTuning.auraScale,
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
              createRocketMaterial(rocketAppearance.core),
            );
            const trail = new Mesh(
              ribbonGeometry,
              createRocketTrailMaterial(rocketAppearance.trail),
            );
            const flame = new Mesh(ribbonGeometry, createRocketFlameMaterial());
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
          visual.trail.position.set(-rocketAppearance.bodyScale.x * 0.6, 0, -0.1);
          visual.trail.scale.set(
            rocketAppearance.trailScale.x,
            rocketAppearance.trailScale.y,
            1,
          );
          visual.flame.position.set(-rocketAppearance.bodyScale.x * 0.45, 0, 0.05);
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
            const glowMesh = new Mesh(glowGeometry, glowMaterial);
            const hullMesh = new Mesh(droneHullGeometry, hullMaterial);
            const group = new Group();
            glowMesh.position.z = -0.1;
            group.add(glowMesh, hullMesh);
            scene.add(group);
            visual = { glowMesh, group, hullMesh };
            droneVisuals.set(drone.id, visual);
          }

          const accent =
            drone.mode === "return"
              ? droneVisualTuning.returnColor
              : droneVisualTuning.activeColor;
          (visual.hullMesh.material as MeshBasicMaterial).color.set(accent);
          (visual.glowMesh.material as MeshBasicMaterial).color.set(accent);
          visual.group.position.set(drone.pos.x, drone.pos.y, 4);
          visual.group.rotation.z =
            len(drone.vel) > 0 ? Math.atan2(drone.vel.y, drone.vel.x) : 0;
          visual.hullMesh.scale.set(16, 10, 8);
          visual.glowMesh.scale.set(34, 34, 1);
        }
        for (const [droneId, visual] of droneVisuals) {
          if (!activeDroneIds.has(droneId)) {
            scene.remove(visual.group);
            (visual.glowMesh.material as { dispose: () => void }).dispose();
            (visual.hullMesh.material as { dispose: () => void }).dispose();
            droneVisuals.delete(droneId);
          }
        }

        const activeCacheIds = new Set<number>();
        for (const cache of world?.caches ?? []) {
          activeCacheIds.add(cache.id);
          let visual = cacheVisuals.get(cache.id);
          if (visual === undefined) {
            visual = createSharedCacheVisual(cache as never, cacheSpriteAssets.badgeMaterials);
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
          const pulse = 1 + Math.sin(nowSec * visual.pulseRate + visual.bobPhase) * 0.04;
          const badgeSize =
            tuning.visuals.caches.badgeBaseSize * tuning.visuals.caches.badgeScale * pulse;
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

        nextRenderer.render(scene, nextCamera);
      });
    } catch (error) {
      console.error(
        "[frontend] Failed to initialize authoritative viewport.",
        error,
      );
      if (!disposed) {
        showViewportRendererFailure(
          hostElement,
          "Renderer initialization failed.",
        );
      }
    }
  })();

  return () => {
    disposed = true;
    window.removeEventListener("resize", resizeViewport);
    inputController?.dispose();
    syncAimWorldToPointer = null;
    if (renderer !== null) {
      renderer.setAnimationLoop(null);
    }

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

    if (renderer !== null) {
      renderer.dispose();
    }
    rendererBootstrap?.dispose();
    hostElement.replaceChildren();
  };
}

const sceneRemoveSafe = (...objects: Array<{ parent: Group | Scene | null }>) => {
  for (const object of objects) {
    object.parent?.remove(object as never);
  }
};
