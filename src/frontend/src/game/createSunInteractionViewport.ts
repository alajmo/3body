import {
  FIXED_STEP_SEC,
  getOrbitSystemDriftVelocity,
  getSunVisualProfile,
  lerp,
  scale as scaleVec2,
  type Vec2,
} from "@3body/shared";
import { attribute, color, renderOutput } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { rgbShift } from "three/addons/tsl/display/RGBShiftNode.js";
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  RenderPipeline,
  RingGeometry,
  Scene,
  SphereGeometry,
  WebGPURenderer,
} from "three/webgpu";
import {
  createSandboxState as createCombatSandboxState,
  interpolateSandboxState as interpolateCombatSandboxState,
  stepSandbox as stepCombatSandbox,
  type CombatSandboxState,
  type CombatSandboxStepInput,
} from "./combatSandbox";
import { getPlanetArchetypeVisuals } from "./planetVisualTuning";
import {
  createBackgroundLayer,
  createBackgroundLayerConfigs,
  createBackdropMaterial,
  createPlanetGlowMaterial,
  createPlanetMaterial,
  createPlanetSpinAxis,
  createSceneBackgroundColor,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  getPlanetForestProfile,
  syncBackdropFrame,
  wrapCentered,
} from "./showcaseVisuals";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import {
  disposeViewportRendererSession,
  initializeViewportRendererSession,
  reportViewportRendererFailure,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";
import { createCompatibleScenePass } from "./viewport/postProcessingCompat";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import {
  createAmbientBoundaryDebrisVisual,
  getAmbientBoundaryDebrisRadii,
  updateAmbientBoundaryDebrisVisual,
} from "./viewport/ambientBoundaryDebris";

const CAMERA_DISTANCE = 100;
const MAX_PIXEL_RATIO = 2;
const SCENE_SSAA_LEVEL = 2;
const BLOOM_STRENGTH = 1.02;
const BLOOM_RADIUS = 0.18;
const BLOOM_THRESHOLD = 0.82;
const BACKDROP_OVERDRAW = 1.35;
const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_TRAIL_SAMPLES = 220;
const TRAIL_POINT_SIZE = 13;
const CAMERA_LERP = 0.08;
const MIN_CAMERA_HALF_HEIGHT = 760;
const FRAME_PADDING = 520;

interface SunVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  rotationSpeed: number;
  warpMesh: Mesh;
}

interface PlanetVisual {
  auraScale: number;
  glowMesh: Mesh;
  mesh: Mesh;
  rotationSpeed: number;
  spinAxis: ReturnType<typeof createPlanetSpinAxis>;
  spinPhase: number;
}

interface SunTrailVisual {
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  samples: Vec2[];
}

const registerDisposables = (
  disposables: Array<{ dispose: () => void }>,
  ...items: Array<{ dispose: () => void }>
) => {
  disposables.push(...items);
};

const createTrailVisual = (trailColor: string): SunTrailVisual => {
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
  points.position.z = -6;
  points.renderOrder = -14;

  return {
    geometry,
    opacityAttribute,
    points,
    positionAttribute,
    samples: [],
  };
};

const pushTrailSample = (trail: SunTrailVisual, pos: Vec2) => {
  trail.samples.push({ x: pos.x, y: pos.y });
  if (trail.samples.length > MAX_TRAIL_SAMPLES) {
    trail.samples.shift();
  }
};

const updateTrailVisual = (trail: SunTrailVisual) => {
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
    opacityArray[index] = progress * progress * 0.8;
  }

  trail.geometry.setDrawRange(0, sampleCount);
  trail.positionAttribute.needsUpdate = true;
  trail.opacityAttribute.needsUpdate = true;
  trail.points.visible = sampleCount > 1;
};

const createIdleSandboxInput = (
  state: CombatSandboxState,
): CombatSandboxStepInput => ({
  aimWorld: { x: state.player.aimWorld.x, y: state.player.aimWorld.y },
  boostRequested: false,
  droneLaunchRequested: false,
  droneTurnLeftHeld: false,
  droneTurnRightHeld: false,
  fireRequested: false,
  foresightRequested: false,
  gravityPulseRequested: false,
  cloakRequested: false,
  selectedRocketKind: state.player.selectedRocketKind,
  shieldRequested: false,
});

export function createSunInteractionViewport(
  hostElement: HTMLDivElement,
): () => void {
  let disposed = false;
  let renderer: WebGPURenderer | null = null;
  let rendererBootstrap: ViewportRendererBootstrap | null = null;
  let animationLoopController: ReturnType<
    typeof createViewportAnimationLoopController
  > | null = null;
  let camera: OrthographicCamera | null = null;
  let backdropMesh: Mesh | null = null;
  const disposables: Array<{ dispose: () => void }> = [];
  let cleanupComplete = false;
  const blackHoleTuning = getRuntimeTuningDocument().gameplay.blackHole;
  const sunTuning = getRuntimeTuningDocument().visuals.suns;
  const createSeedState = (): CombatSandboxState =>
    createCombatSandboxState(undefined, { botsEnabled: false });
  let previousState = createSeedState();
  let currentState = createSeedState();
  let accumulatedSec = 0;
  let lastFrameMs: number | null = null;
  const cameraState = {
    centerX: 0,
    centerY: 0,
    worldHalfHeight: MIN_CAMERA_HALF_HEIGHT,
  };
  let rendererSessionToken = 0;

  const applyCameraFrame = () => {
    if (camera === null) {
      return;
    }

    const width = Math.max(1, hostElement.clientWidth);
    const height = Math.max(1, hostElement.clientHeight);
    const aspect = width / height;
    const worldHalfWidth = cameraState.worldHalfHeight * aspect;

    camera.left = -worldHalfWidth;
    camera.right = worldHalfWidth;
    camera.top = cameraState.worldHalfHeight;
    camera.bottom = -cameraState.worldHalfHeight;
    camera.position.set(
      cameraState.centerX,
      cameraState.centerY,
      CAMERA_DISTANCE,
    );
    camera.lookAt(cameraState.centerX, cameraState.centerY, 0);
    camera.updateProjectionMatrix();

    syncBackdropFrame({
      backdropMesh,
      centerX: cameraState.centerX,
      centerY: cameraState.centerY,
      height: cameraState.worldHalfHeight * 2 * BACKDROP_OVERDRAW,
      width: worldHalfWidth * 2 * BACKDROP_OVERDRAW,
    });
  };

  const resizeViewport = () => {
    if (renderer === null) {
      return;
    }

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
    );
    renderer.setSize(
      Math.max(1, hostElement.clientWidth),
      Math.max(1, hostElement.clientHeight),
      false,
    );
    applyCameraFrame();
  };

  const disposeViewportSession = () => {
    rendererSessionToken += 1;
    window.removeEventListener("resize", resizeViewport);

    for (let index = disposables.length - 1; index >= 0; index -= 1) {
      try {
        disposables[index]!.dispose();
      } catch (error) {
        console.warn(
          "[frontend] Failed to dispose sun interaction resource.",
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
      failureLogLabel: "sun interaction viewport",
      hostElement,
      isDisposed: () => disposed,
    });
  };

  const startViewport = async () => {
    const sessionToken = ++rendererSessionToken;
    try {
      const rendererSession = await initializeViewportRendererSession({
        failureLogLabel: "sun interaction viewport",
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
      registerDisposables(disposables, backdropGeometry, backdropMaterial);

      const backgroundLayers = createBackgroundLayerConfigs(
        backgroundVisuals,
      ).map((layerConfig) => {
        const layer = createBackgroundLayer(layerConfig);
        scene.add(layer.group);
        registerDisposables(disposables, layer.geometry, layer.material);
        return layer;
      });
      const outerRingDebris = createAmbientBoundaryDebrisVisual({});
      scene.add(outerRingDebris.bandGroup, outerRingDebris.points);
      registerDisposables(
        disposables,
        ...outerRingDebris.bandGeometries,
        ...outerRingDebris.bandMaterials,
        outerRingDebris.geometry,
        outerRingDebris.points.material as { dispose: () => void },
      );

      const previewState = currentState;
      const boundaryGeometry = new RingGeometry(0.995, 1.005, 256);
      const boundaryMaterial = new MeshBasicMaterial({
        color: "#6988ad",
        depthWrite: false,
        opacity: 0.28,
        transparent: true,
      });
      const boundaryMesh = new Mesh(boundaryGeometry, boundaryMaterial);
      boundaryMesh.position.z = -16;
      boundaryMesh.renderOrder = -16;
      scene.add(boundaryMesh);
      const sunGeometry = new SphereGeometry(1, 48, 48);
      const planetGeometry = new SphereGeometry(1, 96, 96);
      const glowGeometry = new CircleGeometry(1, 64);
      const warpGeometry = new RingGeometry(0.55, 1, 96);
      registerDisposables(
        disposables,
        boundaryGeometry,
        boundaryMaterial,
        glowGeometry,
        planetGeometry,
        sunGeometry,
        warpGeometry,
      );

      const sunVisuals = previewState.suns.map((sun, index) => {
        const profile = getSunVisualProfile(sunTuning, index);
        const coreMaterial = createSunCoreMaterial(
          profile.color,
          profile.glowColor,
          sun.id,
          profile.coreBrightness,
        );
        const glowMaterial = createSunGlowMaterial(
          profile.glowColor,
          sun.id,
          profile.glowBrightness,
        );
        const warpMaterial = createWarpMaterial(profile.glowColor, sun.id);
        const coreMesh = new Mesh(sunGeometry, coreMaterial);
        const glowMesh = new Mesh(sunGeometry, glowMaterial);
        const warpMesh = new Mesh(warpGeometry, warpMaterial);

        coreMesh.renderOrder = -8;
        glowMesh.renderOrder = -10;
        warpMesh.renderOrder = -12;
        glowMesh.position.z = -2;
        warpMesh.position.z = -4;
        scene.add(warpMesh, glowMesh, coreMesh);
        registerDisposables(
          disposables,
          coreMaterial,
          glowMaterial,
          warpMaterial,
        );

        return {
          coreMesh,
          glowMesh,
          rotationSpeed: 0.12 + index * 0.05,
          warpMesh,
        } satisfies SunVisual;
      });

      const planetVisuals = previewState.planets.map((planet, index) => {
        const visualStyle = getPlanetArchetypeVisuals(planet.archetype);
        const forestProfile = getPlanetForestProfile(
          planet.archetype,
          planet.id,
        );
        const material = createPlanetMaterial(
          visualStyle,
          planet.id * 0.173,
          forestProfile,
        );
        const glowMaterial = createPlanetGlowMaterial(
          visualStyle.color,
          planet.id * 0.173,
          visualStyle.auraScale,
          visualStyle.auraGap,
        );
        const mesh = new Mesh(planetGeometry, material);
        const glowMesh = new Mesh(glowGeometry, glowMaterial.material);

        mesh.renderOrder = -2;
        glowMesh.position.z = 0.16;
        glowMesh.renderOrder = -1;
        scene.add(mesh, glowMesh);
        registerDisposables(disposables, material, glowMaterial.material);

        return {
          auraScale: visualStyle.auraScale,
          glowMesh,
          mesh,
          rotationSpeed: 0.24 + index * 0.035,
          spinAxis: createPlanetSpinAxis(planet.id),
          spinPhase: ((planet.id * 0.173) % 1) * Math.PI * 2 + index * 0.37,
        } satisfies PlanetVisual;
      });

      const trailVisuals = previewState.suns.map((sun, index) => {
        const trail = createTrailVisual(
          getSunVisualProfile(sunTuning, index).glowColor,
        );
        scene.add(trail.points);
        registerDisposables(
          disposables,
          trail.geometry,
          trail.points.material as { dispose: () => void },
        );
        pushTrailSample(trail, sun.pos);
        updateTrailVisual(trail);
        return trail;
      });

      resizeViewport();
      window.addEventListener("resize", resizeViewport);

      const scenePass = createCompatibleScenePass(
        nextRenderer,
        scene,
        nextCamera,
        SCENE_SSAA_LEVEL,
      );
      const bloomNode = bloom(
        scenePass,
        BLOOM_STRENGTH,
        BLOOM_RADIUS,
        BLOOM_THRESHOLD,
      );
      const outputFrame = renderOutput(
        rgbShift(scenePass.add(bloomNode), 0, 0),
        nextRenderer.toneMapping,
        nextRenderer.outputColorSpace,
      );
      const postProcessing = new RenderPipeline(nextRenderer, outputFrame);
      postProcessing.outputColorTransform = false;
      registerDisposables(disposables, scenePass, bloomNode);

      animationLoopController = createViewportAnimationLoopController({
        hostElement,
        onActiveChange: (active) => {
          if (active) {
            lastFrameMs = null;
            resizeViewport();
          }
        },
        onRenderError: (error) => {
          handleViewportRenderError(error);
        },
        renderFrame: () => {
          const nowMs = performance.now();
          const nowSec = nowMs / 1000;
          if (lastFrameMs === null) {
            lastFrameMs = nowMs;
          }

          const deltaSec = Math.min(
            MAX_FRAME_DELTA_SEC,
            Math.max(0, (nowMs - lastFrameMs) / 1000),
          );
          lastFrameMs = nowMs;

          accumulatedSec += deltaSec;

          while (accumulatedSec >= FIXED_STEP_SEC) {
            previousState = currentState;
            currentState = stepCombatSandbox(
              currentState,
              createIdleSandboxInput(currentState),
              blackHoleTuning,
            );
            accumulatedSec -= FIXED_STEP_SEC;

            for (const [index, trail] of trailVisuals.entries()) {
              pushTrailSample(trail, currentState.suns[index]!.pos);
              updateTrailVisual(trail);
            }
          }

          const alpha =
            FIXED_STEP_SEC > 0 ? accumulatedSec / FIXED_STEP_SEC : 0;
          const renderState = interpolateCombatSandboxState(
            previousState,
            currentState,
            alpha,
          );
          const arenaOffset = scaleVec2(
            getOrbitSystemDriftVelocity(
              getRuntimeTuningDocument().gameplay.orbits,
            ),
            renderState.elapsedSec,
          );
          const arenaRadius = Math.max(
            0,
            getRuntimeTuningDocument().gameplay.arena.radius,
          );

          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          boundaryMesh.visible = arenaRadius > 0;
          if (arenaRadius > 0) {
            const { outerRadius: debrisOuterRadius } =
              getAmbientBoundaryDebrisRadii(arenaRadius);
            boundaryMesh.position.set(arenaOffset.x, arenaOffset.y, -16);
            boundaryMesh.scale.set(arenaRadius, arenaRadius, 1);
            minX = Math.min(minX, arenaOffset.x - arenaRadius);
            maxX = Math.max(maxX, arenaOffset.x + arenaRadius);
            minY = Math.min(minY, arenaOffset.y - arenaRadius);
            maxY = Math.max(maxY, arenaOffset.y + arenaRadius);
            minX = Math.min(minX, arenaOffset.x - debrisOuterRadius);
            maxX = Math.max(maxX, arenaOffset.x + debrisOuterRadius);
            minY = Math.min(minY, arenaOffset.y - debrisOuterRadius);
            maxY = Math.max(maxY, arenaOffset.y + debrisOuterRadius);
          }

          for (const [index, sun] of renderState.suns.entries()) {
            const profile = getSunVisualProfile(sunTuning, index);
            const renderedRadius = sun.radius;
            const warpRadius = renderedRadius * profile.warpScale;
            minX = Math.min(minX, sun.pos.x - warpRadius);
            maxX = Math.max(maxX, sun.pos.x + warpRadius);
            minY = Math.min(minY, sun.pos.y - warpRadius);
            maxY = Math.max(maxY, sun.pos.y + warpRadius);

            const visual = sunVisuals[index]!;
            visual.coreMesh.position.set(sun.pos.x, sun.pos.y, 0);
            visual.glowMesh.position.set(sun.pos.x, sun.pos.y, -2);
            visual.warpMesh.position.set(sun.pos.x, sun.pos.y, -4);
            visual.coreMesh.scale.set(
              renderedRadius,
              renderedRadius,
              renderedRadius,
            );
            visual.glowMesh.scale.set(
              renderedRadius * profile.glowScale,
              renderedRadius * profile.glowScale,
              renderedRadius * profile.glowScale,
            );
            visual.warpMesh.scale.set(warpRadius, warpRadius, 1);
            visual.coreMesh.rotation.x = 0.38;
            visual.coreMesh.rotation.y = nowMs * 0.001 * visual.rotationSpeed;
            visual.glowMesh.rotation.z = nowMs * 0.00005 * (5 + index * 2);
            (visual.coreMesh.material as { opacity: number }).opacity = 1;
            (visual.glowMesh.material as { opacity: number }).opacity = 0.92;
            (visual.warpMesh.material as { opacity: number }).opacity = 0.78;
          }

          for (const [index, planet] of renderState.planets.entries()) {
            const visual = planetVisuals[index]!;
            if (!planet.alive) {
              visual.mesh.visible = false;
              visual.glowMesh.visible = false;
              continue;
            }

            const renderedRadius = planet.radius;
            const glowRadius = renderedRadius * visual.auraScale;
            minX = Math.min(minX, planet.pos.x - glowRadius);
            maxX = Math.max(maxX, planet.pos.x + glowRadius);
            minY = Math.min(minY, planet.pos.y - glowRadius);
            maxY = Math.max(maxY, planet.pos.y + glowRadius);
            visual.mesh.visible = true;
            visual.glowMesh.visible = true;
            visual.mesh.position.set(planet.pos.x, planet.pos.y, 0);
            visual.glowMesh.position.set(planet.pos.x, planet.pos.y, 0.16);
            visual.mesh.scale.set(
              renderedRadius,
              renderedRadius,
              renderedRadius,
            );
            visual.glowMesh.scale.set(glowRadius, glowRadius, 1);
            visual.mesh.setRotationFromAxisAngle(
              visual.spinAxis,
              nowMs * 0.001 * visual.rotationSpeed + visual.spinPhase,
            );
          }

          updateAmbientBoundaryDebrisVisual({
            ...getAmbientBoundaryDebrisRadii(arenaRadius),
            nowSec,
            offset: arenaOffset,
            visual: outerRingDebris,
          });

          const width = Math.max(1, hostElement.clientWidth);
          const height = Math.max(1, hostElement.clientHeight);
          const aspect = width / height;
          const targetCenterX = (minX + maxX) / 2;
          const targetCenterY = (minY + maxY) / 2;
          const targetHalfWidth = (maxX - minX) / 2 + FRAME_PADDING;
          const targetHalfHeight = (maxY - minY) / 2 + FRAME_PADDING;
          const nextHalfHeight = Math.max(
            MIN_CAMERA_HALF_HEIGHT,
            targetHalfHeight,
            targetHalfWidth / aspect,
          );

          cameraState.centerX = lerp(
            cameraState.centerX,
            targetCenterX,
            CAMERA_LERP,
          );
          cameraState.centerY = lerp(
            cameraState.centerY,
            targetCenterY,
            CAMERA_LERP,
          );
          cameraState.worldHalfHeight = lerp(
            cameraState.worldHalfHeight,
            nextHalfHeight,
            CAMERA_LERP,
          );
          applyCameraFrame();

          const orbitSystemDrift = getOrbitSystemDriftVelocity(
            getRuntimeTuningDocument().gameplay.orbits,
          );
          const orbitSystemDriftMagnitude = Math.hypot(
            orbitSystemDrift.x,
            orbitSystemDrift.y,
          );

          for (const layer of backgroundLayers) {
            const layerDriftMagnitude = Math.hypot(layer.driftX, layer.driftY);
            const layerDriftX =
              orbitSystemDriftMagnitude > Number.EPSILON &&
              layerDriftMagnitude > Number.EPSILON
                ? (orbitSystemDrift.x / orbitSystemDriftMagnitude) *
                  layerDriftMagnitude
                : layer.driftX;
            const layerDriftY =
              orbitSystemDriftMagnitude > Number.EPSILON &&
              layerDriftMagnitude > Number.EPSILON
                ? (orbitSystemDrift.y / orbitSystemDriftMagnitude) *
                  layerDriftMagnitude
                : layer.driftY;
            layer.group.position.x = wrapCentered(
              cameraState.centerX * layer.parallax + nowSec * layerDriftX,
              layer.tileSize,
            );
            layer.group.position.y = wrapCentered(
              cameraState.centerY * layer.parallax + nowSec * layerDriftY,
              layer.tileSize,
            );
          }

          postProcessing.render();
        },
        renderer: nextRenderer,
      });
    } catch (error) {
      disposeViewportSession();
      reportViewportRendererFailure({
        error,
        failureLogLabel: "sun interaction viewport",
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
