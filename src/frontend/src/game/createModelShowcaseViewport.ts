import { getSunVisualProfile, type RocketKind, type Vec2 } from "@3body/shared";
import { renderOutput } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { rgbShift } from "three/addons/tsl/display/RGBShiftNode.js";
import {
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RenderPipeline,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  WebGPURenderer,
} from "three/webgpu";
import { createSandboxState } from "./combatSandbox";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import {
  CACHE_ICON_KEYS,
  createBackgroundLayer,
  createBackgroundLayerConfigs,
  createBackdropMaterial,
  createCacheBadgeSpriteMaterial,
  createPlanetGlowMaterial,
  getPlanetForestProfile,
  createPlanetMaterial,
  createPlanetSpinAxis,
  createRocketFlameMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
  createSceneBackgroundColor,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  syncBackdropFrame,
  wrapCentered,
  type CacheIconKey,
} from "./showcaseVisuals";
import { getScaledRocketVisuals } from "./rocketVisualTuning";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import {
  disposeViewportDisposables,
  registerViewportDisposables,
} from "./viewport/disposables";
import {
  disposeViewportRendererSession,
  initializeViewportRendererSession,
  reportViewportRendererFailure,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";
import {
  createViewportRendererSizeState,
  getViewportHostSize,
  syncViewportRendererSize,
} from "./viewport/rendererSizing";
import { createCompatibleScenePass } from "./viewport/postProcessingCompat";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import { getCacheArenaBadgeSize } from "./viewport/cacheVisuals";

const CAMERA_DISTANCE = 100;
const MAX_PIXEL_RATIO = 2;
const SCENE_SSAA_LEVEL = 2;
const BLOOM_STRENGTH = 1.02;
const BLOOM_RADIUS = 0.18;
const BLOOM_THRESHOLD = 0.82;
const BACKDROP_OVERDRAW = 1.35;
const PLANET_SECTION_CENTER = { x: -780, y: 380 } as const;
const SUN_SECTION_CENTER = { x: 780, y: 380 } as const;
const SUN_SECTION_SPACING_X = 380;
const SUN_SECTION_SPACING_Y = 240;
const MISSILE_SECTION_CENTER = { x: -780, y: -390 } as const;
const CACHE_SECTION_CENTER = { x: 780, y: -390 } as const;
const SECTION_PADDING = 220;
const SHOWCASE_ROCKET_KINDS = [
  "light",
  "heavy",
  "seeker",
] as const satisfies readonly RocketKind[];

export interface ModelShowcaseViewportOptions {
  focus?: "all" | "caches" | "planets" | "rockets" | "suns";
  minimumWorldHeight?: number;
  rocketKind?: RocketKind;
}

interface Bounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

interface ShowcasePlanet {
  auraScale: number;
  basePosition: Vec2;
  glowMesh: Mesh;
  mesh: Mesh;
  renderRadius: number;
  rotationSpeed: number;
  spinAxis: ReturnType<typeof createPlanetSpinAxis>;
  spinPhase: number;
}

interface ShowcaseSun {
  basePosition: Vec2;
  coreMesh: Mesh;
  glowMesh: Mesh;
  radius: number;
  rotationSpeed: number;
  seedPhase: number;
  warpMesh: Mesh;
}

interface ShowcaseRocket {
  basePosition: Vec2;
  flameMesh: Mesh;
  kind: RocketKind;
  mesh: Mesh;
  phase: number;
  trailMesh: Mesh;
}

interface ShowcaseCache {
  badgeMap: CanvasTexture;
  badgeMaterial: SpriteMaterial;
  badgeSprite: Sprite;
  basePosition: Vec2;
  bobPhase: number;
  group: Group;
  key: CacheIconKey;
  pulseRate: number;
  wobbleRate: number;
}

const createInitialBounds = (): Bounds => ({
  maxX: -Infinity,
  maxY: -Infinity,
  minX: Infinity,
  minY: Infinity,
});

const expandBounds = (
  bounds: Bounds,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
) => {
  bounds.minX = Math.min(bounds.minX, x - radiusX);
  bounds.maxX = Math.max(bounds.maxX, x + radiusX);
  bounds.minY = Math.min(bounds.minY, y - radiusY);
  bounds.maxY = Math.max(bounds.maxY, y + radiusY);
};

const getGridPosition = (
  index: number,
  count: number,
  cols: number,
  spacingX: number,
  spacingY: number,
  center: Vec2,
): Vec2 => {
  const totalRows = Math.ceil(count / cols);
  const row = Math.floor(index / cols);
  const col = index % cols;
  const itemsInRow = Math.min(cols, count - row * cols);
  const rowWidth = (itemsInRow - 1) * spacingX;
  const totalHeight = (totalRows - 1) * spacingY;

  return {
    x: center.x - rowWidth / 2 + col * spacingX,
    y: center.y + totalHeight / 2 - row * spacingY,
  };
};

export function createModelShowcaseViewport(
  hostElement: HTMLDivElement,
  options: ModelShowcaseViewportOptions = {},
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
  const layoutBounds = createInitialBounds();
  let sceneCenterX = 0;
  let sceneCenterY = 0;
  let sceneHalfHeight = 1;
  const runtimeTuning = getRuntimeTuningDocument();
  const planetVisuals = runtimeTuning.visuals.planets;
  const sunVisuals = runtimeTuning.visuals.suns;
  const cacheVisuals = runtimeTuning.visuals.caches;
  const cacheBadgeSize = getCacheArenaBadgeSize(
    cacheVisuals.badgeBaseSize,
    cacheVisuals.badgeScale,
  );
  const rocketVisuals = getScaledRocketVisuals(runtimeTuning.visuals.rockets);
  const focus = options.focus ?? (options.rocketKind ? "rockets" : "all");
  const showPlanets = focus === "all" || focus === "planets";
  const showSuns = focus === "all" || focus === "suns";
  const showRockets = focus === "all" || focus === "rockets";
  const showCaches = focus === "all" || focus === "caches";
  let hasLayoutContent = false;
  const rendererSizeState = createViewportRendererSizeState();
  let rendererSessionToken = 0;

  const applyCameraFrame = () => {
    if (camera === null) {
      return;
    }

    const { aspect } = getViewportHostSize(hostElement);
    const layoutHalfWidth =
      (layoutBounds.maxX - layoutBounds.minX) / 2 + SECTION_PADDING;
    const layoutHalfHeight =
      (layoutBounds.maxY - layoutBounds.minY) / 2 + SECTION_PADDING;
    const minimumHalfHeight = Math.max(1, (options.minimumWorldHeight ?? 0) / 2);

    sceneCenterX = (layoutBounds.minX + layoutBounds.maxX) / 2;
    sceneCenterY = (layoutBounds.minY + layoutBounds.maxY) / 2;
    sceneHalfHeight = Math.max(
      minimumHalfHeight,
      layoutHalfHeight,
      layoutHalfWidth / aspect,
    );

    const worldHalfWidth = sceneHalfHeight * aspect;
    camera.left = -worldHalfWidth;
    camera.right = worldHalfWidth;
    camera.top = sceneHalfHeight;
    camera.bottom = -sceneHalfHeight;
    camera.position.set(sceneCenterX, sceneCenterY, CAMERA_DISTANCE);
    camera.lookAt(sceneCenterX, sceneCenterY, 0);
    camera.updateProjectionMatrix();

    syncBackdropFrame({
      backdropMesh,
      centerX: sceneCenterX,
      centerY: sceneCenterY,
      height: sceneHalfHeight * 2 * BACKDROP_OVERDRAW,
      width: worldHalfWidth * 2 * BACKDROP_OVERDRAW,
    });
  };

  const resizeViewport = () => {
    if (renderer === null) {
      return;
    }

    syncViewportRendererSize({
      hostElement,
      maxPixelRatio: MAX_PIXEL_RATIO,
      renderer,
      sizeState: rendererSizeState,
    });
    applyCameraFrame();
  };

  const disposeViewportSession = () => {
    rendererSessionToken += 1;
    window.removeEventListener("resize", resizeViewport);

    disposeViewportDisposables(disposables, "showcase resource");

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
      failureLogLabel: "showcase viewport",
      hostElement,
      isDisposed: () => disposed,
    });
  };

  const startViewport = async () => {
    const sessionToken = ++rendererSessionToken;
    try {
      const rendererSession = await initializeViewportRendererSession({
        failureLogLabel: "showcase viewport",
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
      registerViewportDisposables(
        disposables,
        backdropGeometry,
        backdropMaterial,
      );

      const backgroundLayers = createBackgroundLayerConfigs(
        backgroundVisuals,
      ).map((layerConfig) => {
        const layer = createBackgroundLayer(layerConfig);
        scene.add(layer.group);
        registerViewportDisposables(
          disposables,
          layer.geometry,
          layer.material,
        );
        return layer;
      });

      const planetGeometry = new SphereGeometry(1, 128, 128);
      const sunGeometry = new SphereGeometry(1, 48, 48);
      const glowGeometry = new CircleGeometry(1, 64);
      const warpGeometry = new RingGeometry(0.55, 1, 96);
      const rocketGeometry = new CylinderGeometry(0.58, 1, 1, 18, 1);
      const ribbonGeometry = new PlaneGeometry(1, 1);
      rocketGeometry.rotateZ(-Math.PI / 2);
      registerViewportDisposables(
        disposables,
        planetGeometry,
        sunGeometry,
        glowGeometry,
        warpGeometry,
        rocketGeometry,
        ribbonGeometry,
      );

      const sandboxState = createSandboxState(DEFAULT_ORBIT_PRESET);
      const showcasePlanets = showPlanets
        ? sandboxState.planets.map((planet, index) => {
            const basePosition = getGridPosition(
              index,
              sandboxState.planets.length,
              4,
              210,
              210,
              PLANET_SECTION_CENTER,
            );
            const archetypeVisuals =
              planetVisuals.archetypes[
                planet.archetype as keyof typeof planetVisuals.archetypes
              ];
            const visualStyle =
              archetypeVisuals ?? planetVisuals.archetypes.terra;
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
            const renderRadius = planet.radius;
            const spinAxis = createPlanetSpinAxis(planet.id);
            const spinPhase =
              ((planet.id * 0.173) % 1) * Math.PI * 2 + index * 0.37;

            mesh.renderOrder = -2;
            glowMesh.position.z = 0.16;
            glowMesh.renderOrder = -1;
            scene.add(mesh, glowMesh);
            registerViewportDisposables(
              disposables,
              material,
              glowMaterial.material,
            );
            expandBounds(
              layoutBounds,
              basePosition.x,
              basePosition.y,
              renderRadius * visualStyle.auraScale,
              renderRadius * visualStyle.auraScale,
            );
            hasLayoutContent = true;

            return {
              auraScale: visualStyle.auraScale,
              basePosition,
              glowMesh,
              mesh,
              renderRadius,
              rotationSpeed: 0.28 + index * 0.045,
              spinAxis,
              spinPhase,
            } satisfies ShowcasePlanet;
          })
        : [];

      const showcaseSuns = showSuns
        ? sandboxState.suns.map((sun, index) => {
            const profile = getSunVisualProfile(sunVisuals, index);
            const basePosition = getGridPosition(
              index,
              sandboxState.suns.length,
              3,
              SUN_SECTION_SPACING_X,
              SUN_SECTION_SPACING_Y,
              SUN_SECTION_CENTER,
            );
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
            registerViewportDisposables(
              disposables,
              coreMaterial,
              glowMaterial,
              warpMaterial,
            );
            expandBounds(
              layoutBounds,
              basePosition.x,
              basePosition.y,
              sun.radius * profile.warpScale,
              sun.radius * profile.warpScale,
            );
            hasLayoutContent = true;

            return {
              basePosition,
              coreMesh,
              glowMesh,
              radius: sun.radius,
              rotationSpeed: 0.12 + index * 0.05,
              seedPhase: index * 0.91,
              warpMesh,
            } satisfies ShowcaseSun;
          })
        : [];

      const rocketKinds = showRockets
        ? options.rocketKind === undefined
          ? [...SHOWCASE_ROCKET_KINDS]
          : [options.rocketKind]
        : [];
      const showcaseRockets = rocketKinds.map((kind, index) => {
        const basePosition = getGridPosition(
          index,
          rocketKinds.length,
          rocketKinds.length === 1 ? 1 : 3,
          310,
          220,
          MISSILE_SECTION_CENTER,
        );
        const profile = rocketVisuals[kind];
        const mesh = new Mesh(
          rocketGeometry,
          createRocketMaterial(profile.core, profile.trail),
        );
        const trailMesh = new Mesh(
          ribbonGeometry,
          createRocketTrailMaterial(profile.core, profile.trail),
        );
        const flameMesh = new Mesh(
          ribbonGeometry,
          createRocketFlameMaterial(profile.core, profile.trail),
        );

        trailMesh.renderOrder = 5;
        flameMesh.renderOrder = 6;
        mesh.renderOrder = 7;
        scene.add(trailMesh, flameMesh, mesh);
        registerViewportDisposables(
          disposables,
          mesh.material as { dispose: () => void },
          trailMesh.material as { dispose: () => void },
          flameMesh.material as { dispose: () => void },
        );
        expandBounds(
          layoutBounds,
          basePosition.x,
          basePosition.y,
          profile.trailScale.x + 120,
          90,
        );
        hasLayoutContent = true;

        return {
          basePosition,
          flameMesh,
          kind,
          mesh,
          phase: index * 1.23,
          trailMesh,
        } satisfies ShowcaseRocket;
      });

      const showcaseCaches = showCaches
        ? CACHE_ICON_KEYS.map((key, index) => {
            const basePosition = getGridPosition(
              index,
              CACHE_ICON_KEYS.length,
              4,
              210,
              210,
              CACHE_SECTION_CENTER,
            );
            const { map, material } = createCacheBadgeSpriteMaterial(
              hostElement.ownerDocument,
              key,
            );
            const badgeSprite = new Sprite(material);
            const group = new Group();
            badgeSprite.position.z = 0.35;
            badgeSprite.renderOrder = 7;
            group.add(badgeSprite);
            scene.add(group);
            registerViewportDisposables(disposables, map, material);
            expandBounds(
              layoutBounds,
              basePosition.x,
              basePosition.y,
              cacheBadgeSize,
              cacheBadgeSize,
            );
            hasLayoutContent = true;

            return {
              badgeMap: map,
              badgeMaterial: material,
              badgeSprite,
              basePosition,
              bobPhase: index * 0.71,
              group,
              key,
              pulseRate: 2.2 + (index % 4) * 0.25,
              wobbleRate: 1.1 + (index % 5) * 0.08,
            } satisfies ShowcaseCache;
          })
        : [];

      if (!hasLayoutContent) {
        expandBounds(layoutBounds, 0, 0, 320, 220);
      }

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
      registerViewportDisposables(disposables, scenePass, bloomNode);

      animationLoopController = createViewportAnimationLoopController({
        hostElement,
        onActiveChange: (active) => {
          if (active) {
            resizeViewport();
          }
        },
        onRenderError: (error) => {
          handleViewportRenderError(error);
        },
        renderFrame: () => {
          const nowSec = performance.now() / 1000;

          for (const layer of backgroundLayers) {
            layer.group.position.x = wrapCentered(
              Math.sin(nowSec * 0.04) * 180 * layer.parallax +
                nowSec * layer.driftX,
              layer.tileSize,
            );
            layer.group.position.y = wrapCentered(
              Math.cos(nowSec * 0.03) * 140 * layer.parallax +
                nowSec * layer.driftY,
              layer.tileSize,
            );
          }

          for (const [index, planet] of showcasePlanets.entries()) {
            planet.mesh.position.set(
              planet.basePosition.x,
              planet.basePosition.y,
              0,
            );
            planet.glowMesh.position.set(
              planet.basePosition.x,
              planet.basePosition.y,
              0.16,
            );
            planet.mesh.scale.set(
              planet.renderRadius,
              planet.renderRadius,
              planet.renderRadius,
            );
            planet.glowMesh.scale.set(
              planet.renderRadius * planet.auraScale,
              planet.renderRadius * planet.auraScale,
              1,
            );
            planet.mesh.quaternion.setFromAxisAngle(
              planet.spinAxis,
              planet.spinPhase + nowSec * planet.rotationSpeed,
            );
            planet.glowMesh.rotation.z = nowSec * (0.16 + index * 0.02);
          }

          for (const [index, sun] of showcaseSuns.entries()) {
            const profile = getSunVisualProfile(sunVisuals, index);
            sun.coreMesh.position.set(
              sun.basePosition.x,
              sun.basePosition.y,
              0,
            );
            sun.glowMesh.position.set(
              sun.basePosition.x,
              sun.basePosition.y,
              -2,
            );
            sun.warpMesh.position.set(
              sun.basePosition.x,
              sun.basePosition.y,
              -4,
            );
            sun.coreMesh.scale.set(sun.radius, sun.radius, sun.radius);
            sun.glowMesh.scale.set(
              sun.radius * profile.glowScale,
              sun.radius * profile.glowScale,
              sun.radius * profile.glowScale,
            );
            sun.warpMesh.scale.set(
              sun.radius * profile.warpScale,
              sun.radius * profile.warpScale,
              1,
            );
            sun.coreMesh.rotation.x = 0.38;
            sun.coreMesh.rotation.y = nowSec * sun.rotationSpeed;
            sun.glowMesh.rotation.z = nowSec * (0.05 + index * 0.02);
            (sun.coreMesh.material as { opacity: number }).opacity = 1;
            (sun.glowMesh.material as { opacity: number }).opacity = 0.92;
            (sun.warpMesh.material as { opacity: number }).opacity = 0.78;
          }

          for (const rocket of showcaseRockets) {
            const profile = rocketVisuals[rocket.kind];
            const angle =
              rocket.kind === "heavy"
                ? -0.14
                : rocket.kind === "seeker"
                  ? 0.12
                  : 0;
            const flamePulse =
              0.9 + Math.sin(nowSec * 18 + rocket.phase) * 0.08;
            const trailPulse =
              0.94 + Math.sin(nowSec * 7 + rocket.phase) * 0.06;

            rocket.mesh.position.set(
              rocket.basePosition.x,
              rocket.basePosition.y,
              3,
            );
            rocket.mesh.rotation.z = angle;
            rocket.mesh.scale.set(profile.bodyScale.x, profile.bodyScale.y, 1);

            rocket.trailMesh.position.set(
              rocket.basePosition.x -
                Math.cos(angle) * (profile.bodyScale.x * 0.58),
              rocket.basePosition.y -
                Math.sin(angle) * (profile.bodyScale.x * 0.58),
              2.75,
            );
            rocket.trailMesh.rotation.z = angle;
            rocket.trailMesh.scale.set(
              profile.trailScale.x * trailPulse,
              profile.trailScale.y,
              1,
            );

            rocket.flameMesh.position.set(
              rocket.basePosition.x -
                Math.cos(angle) * (profile.bodyScale.x * 0.52),
              rocket.basePosition.y -
                Math.sin(angle) * (profile.bodyScale.x * 0.52),
              2.9,
            );
            rocket.flameMesh.rotation.z = angle;
            rocket.flameMesh.scale.set(
              profile.flameScale.x * flamePulse,
              profile.flameScale.y,
              1,
            );
          }

          for (const cache of showcaseCaches) {
            const pulse = 0.94 + Math.sin(nowSec * cache.pulseRate) * 0.08;

            cache.group.position.set(
              cache.basePosition.x,
              cache.basePosition.y,
              0,
            );
            cache.group.rotation.z = 0;
            cache.badgeSprite.scale.set(
              cacheBadgeSize * pulse,
              cacheBadgeSize * pulse,
              1,
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
        failureLogLabel: "showcase viewport",
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
