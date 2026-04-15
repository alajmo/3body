import {
  FIXED_STEP_SEC,
  lerp,
  stepSuns,
  type Sun,
  type Vec2,
} from "@3body/shared";
import {
  attribute,
  bloom,
  color,
  float,
  length,
  pointUV,
  type pass,
  renderOutput,
  rgbShift,
  smoothstep,
  ssaaPass,
  vec2,
} from "three/tsl";
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  PostProcessing,
  RingGeometry,
  Scene,
  SphereGeometry,
  WebGPURenderer,
} from "three/webgpu";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import {
  createBackdropMaterial,
  createStarfieldLayer,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  SCENE_BACKGROUND,
  STARFIELD_LAYERS,
  wrapCentered,
} from "./showcaseVisuals";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import {
  createViewportRendererBootstrap,
  showViewportRendererFailure,
} from "./viewport/rendererBootstrap";

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
const SUN_PADDING = 260;
const RESET_AFTER_SEC = 90;
const RESET_MAX_DISTANCE = 4400;

interface SunVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  radius: number;
  rotationSpeed: number;
  warpMesh: Mesh;
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

const cloneSuns = (suns: readonly Sun[]): Sun[] =>
  suns.map((sun) => ({
    ...sun,
    pos: { x: sun.pos.x, y: sun.pos.y },
    vel: { x: sun.vel.x, y: sun.vel.y },
  }));

const interpolateSun = (
  previousSun: Sun,
  currentSun: Sun,
  alpha: number,
): Sun => ({
  ...currentSun,
  pos: {
    x: lerp(previousSun.pos.x, currentSun.pos.x, alpha),
    y: lerp(previousSun.pos.y, currentSun.pos.y, alpha),
  },
  vel: {
    x: lerp(previousSun.vel.x, currentSun.vel.x, alpha),
    y: lerp(previousSun.vel.y, currentSun.vel.y, alpha),
  },
});

const getSeedSuns = (): Sun[] =>
  DEFAULT_ORBIT_PRESET.suns.map((sun) => ({
    id: sun.id,
    kind: "sun",
    mass: sun.mass,
    pos: { x: sun.pos.x, y: sun.pos.y },
    radius: sun.radius,
    vel: { x: sun.vel.x, y: sun.vel.y },
  }));

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
  material.opacityNode = attribute("trailOpacity", "float").mul(
    float(1).sub(smoothstep(0.12, 0.48, length(pointUV.sub(vec2(0.5, 0.5))))),
  );
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

const shouldResetSimulation = (
  suns: readonly Sun[],
  elapsedSec: number,
): boolean => {
  if (elapsedSec >= RESET_AFTER_SEC) {
    return true;
  }

  for (const sun of suns) {
    if (Math.hypot(sun.pos.x, sun.pos.y) > RESET_MAX_DISTANCE) {
      return true;
    }
  }

  return false;
};

export function createSunInteractionViewport(
  hostElement: HTMLDivElement,
): () => void {
  let disposed = false;
  let renderer: WebGPURenderer | null = null;
  let rendererBootstrap:
    | Awaited<ReturnType<typeof createViewportRendererBootstrap>>
    | null = null;
  let camera: OrthographicCamera | null = null;
  let backdropMesh: Mesh | null = null;
  const disposables: Array<{ dispose: () => void }> = [];
  const sunTuning = getRuntimeTuningDocument().visuals.suns;
  const seedSuns = getSeedSuns();
  let previousSuns = cloneSuns(seedSuns);
  let currentSuns = cloneSuns(seedSuns);
  let accumulatedSec = 0;
  let simulationElapsedSec = 0;
  let lastFrameMs: number | null = null;
  const cameraState = {
    centerX: 0,
    centerY: 0,
    worldHalfHeight: MIN_CAMERA_HALF_HEIGHT,
  };

  const resetSimulation = (trailVisuals: readonly SunTrailVisual[]) => {
    previousSuns = cloneSuns(seedSuns);
    currentSuns = cloneSuns(seedSuns);
    accumulatedSec = 0;
    simulationElapsedSec = 0;
    lastFrameMs = null;
    for (const [index, trail] of trailVisuals.entries()) {
      trail.samples.length = 0;
      pushTrailSample(trail, seedSuns[index]!.pos);
      updateTrailVisual(trail);
    }
  };

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

    if (backdropMesh !== null) {
      backdropMesh.position.set(cameraState.centerX, cameraState.centerY, -40);
      backdropMesh.scale.set(
        worldHalfWidth * 2 * BACKDROP_OVERDRAW,
        cameraState.worldHalfHeight * 2 * BACKDROP_OVERDRAW,
        1,
      );
    }
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

  void (async () => {
    try {
      const bootstrap = await createViewportRendererBootstrap({
        hostElement,
        target: "sunInteraction",
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
      registerDisposables(disposables, backdropGeometry, backdropMaterial);

      const starfieldLayers = STARFIELD_LAYERS.map((layerConfig) => {
        const layer = createStarfieldLayer(
          layerConfig.count,
          layerConfig.size,
          layerConfig.alphaScale,
          layerConfig.z,
          layerConfig.parallax,
        );
        scene.add(layer.group);
        registerDisposables(disposables, layer.geometry, layer.material);
        return layer;
      });

      const sunGeometry = new SphereGeometry(1, 48, 48);
      const glowGeometry = new CircleGeometry(1, 64);
      const warpGeometry = new RingGeometry(0.55, 1, 96);
      registerDisposables(disposables, sunGeometry, glowGeometry, warpGeometry);

      const sunVisuals = DEFAULT_ORBIT_PRESET.suns.map((sun, index) => {
        const coreMaterial = createSunCoreMaterial(
          sun.color,
          sun.glowColor,
          sun.id,
        );
        const glowMaterial = createSunGlowMaterial(sun.glowColor, sun.id);
        const warpMaterial = createWarpMaterial(sun.glowColor, sun.id);
        const coreMesh = new Mesh(sunGeometry, coreMaterial);
        const glowMesh = new Mesh(glowGeometry, glowMaterial);
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
          radius: sun.radius,
          rotationSpeed: 0.12 + index * 0.05,
          warpMesh,
        } satisfies SunVisual;
      });

      const trailVisuals = DEFAULT_ORBIT_PRESET.suns.map((sun) => {
        const trail = createTrailVisual(sun.glowColor);
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

      hostElement.replaceChildren(nextRenderer.domElement);
      resizeViewport();
      window.addEventListener("resize", resizeViewport);

      const scenePass = ssaaPass(scene, nextCamera) as ReturnType<
        typeof pass
      > & { sampleLevel: number };
      scenePass.sampleLevel = SCENE_SSAA_LEVEL;
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
      const postProcessing = new PostProcessing(nextRenderer, outputFrame);
      postProcessing.outputColorTransform = false;
      registerDisposables(disposables, scenePass, bloomNode);

      nextRenderer.setAnimationLoop(() => {
        const nowMs = performance.now();
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
          previousSuns = cloneSuns(currentSuns);
          currentSuns = stepSuns(currentSuns, FIXED_STEP_SEC);
          simulationElapsedSec += FIXED_STEP_SEC;
          accumulatedSec -= FIXED_STEP_SEC;

          for (const [index, trail] of trailVisuals.entries()) {
            pushTrailSample(trail, currentSuns[index]!.pos);
            updateTrailVisual(trail);
          }

          if (shouldResetSimulation(currentSuns, simulationElapsedSec)) {
            resetSimulation(trailVisuals);
            break;
          }
        }

        const alpha = FIXED_STEP_SEC > 0 ? accumulatedSec / FIXED_STEP_SEC : 0;
        const renderSuns = currentSuns.map((sun, index) =>
          interpolateSun(previousSuns[index]!, sun, alpha),
        );

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const [index, sun] of renderSuns.entries()) {
          const radius = sun.radius * sunTuning.warpScale;
          minX = Math.min(minX, sun.pos.x - radius);
          maxX = Math.max(maxX, sun.pos.x + radius);
          minY = Math.min(minY, sun.pos.y - radius);
          maxY = Math.max(maxY, sun.pos.y + radius);

          const visual = sunVisuals[index]!;
          visual.coreMesh.position.set(sun.pos.x, sun.pos.y, 0);
          visual.glowMesh.position.set(sun.pos.x, sun.pos.y, -2);
          visual.warpMesh.position.set(sun.pos.x, sun.pos.y, -4);
          visual.coreMesh.scale.set(sun.radius, sun.radius, sun.radius);
          visual.glowMesh.scale.set(
            sun.radius * sunTuning.glowScale,
            sun.radius * sunTuning.glowScale,
            1,
          );
          visual.warpMesh.scale.set(
            sun.radius * sunTuning.warpScale,
            sun.radius * sunTuning.warpScale,
            1,
          );
          visual.coreMesh.rotation.x = 0.38;
          visual.coreMesh.rotation.y = nowMs * 0.001 * visual.rotationSpeed;
          visual.glowMesh.rotation.z = nowMs * 0.00005 * (5 + index * 2);
          (visual.coreMesh.material as { opacity: number }).opacity = 1;
          (visual.glowMesh.material as { opacity: number }).opacity = 0.92;
          (visual.warpMesh.material as { opacity: number }).opacity = 0.78;
        }

        const width = Math.max(1, hostElement.clientWidth);
        const height = Math.max(1, hostElement.clientHeight);
        const aspect = width / height;
        const targetCenterX = (minX + maxX) / 2;
        const targetCenterY = (minY + maxY) / 2;
        const targetHalfWidth = (maxX - minX) / 2 + SUN_PADDING;
        const targetHalfHeight = (maxY - minY) / 2 + SUN_PADDING;
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

        for (const layer of starfieldLayers) {
          layer.group.position.x = wrapCentered(
            cameraState.centerX * layer.parallax,
            layer.tileSize,
          );
          layer.group.position.y = wrapCentered(
            cameraState.centerY * layer.parallax,
            layer.tileSize,
          );
        }

        postProcessing.render();
      });
    } catch (error) {
      console.error(
        "[frontend] Failed to initialize sun interaction viewport.",
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

    if (renderer !== null) {
      renderer.setAnimationLoop(null);
      renderer.dispose();
    }

    rendererBootstrap?.dispose();

    hostElement.replaceChildren();
  };
}
