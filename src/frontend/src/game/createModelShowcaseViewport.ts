import {
  getNeutronStarMassAlpha,
  getSunVisualProfile,
  type RocketKind,
  type Vec2,
} from "@3body/shared";
import {
  type CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  type MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RenderPipeline,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  type SpriteMaterial,
  type WebGPURenderer,
} from "three/webgpu";
import { createSandboxState as createCombatSandboxState } from "./combatSandbox";
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
import {
  createShowcaseDisplayPipeline,
  type ShowcaseDisplayMode,
} from "./showcaseDisplayMode";
import {
  getShowcaseBoundsGridOffsets,
  getShowcaseGridPositions,
} from "./showcaseLayout";
import {
  createShowcaseOrbitOverviewSimulation,
  getShowcaseOrbitOverviewPosition,
  getShowcaseOrbitOverviewPositionScale,
  stepShowcaseOrbitOverviewSimulation,
} from "./showcaseOrbitOverview";
import {
  getNeutronStarVisualShape,
  NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
} from "./neutronStarVisuals";
import { getScaledRocketVisuals } from "./rocketVisualTuning";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import {
  disposeViewportDisposables,
  registerViewportDisposables,
} from "./viewport/disposables";
import {
  createBlackHoleCoreMaterial,
  createBlackHoleLensMaterial,
  createBlackHoleRingMaterial,
  createNeutronStarCoreMaterial,
  createNeutronStarHaloMaterial,
  createNeutronStarJetMaterial,
  createNeutronStarLensMaterial,
} from "./viewport/localViewportVisualFactories";
import {
  disposeViewportRendererSession,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";
import { createManagedViewportSession } from "./viewport/managedViewportSession";
import {
  createViewportRendererSizeState,
  getViewportHostSize,
  syncViewportRendererSize,
} from "./viewport/rendererSizing";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import { getCacheArenaBadgeSize } from "./viewport/cacheVisuals";

const CAMERA_DISTANCE = 100;
const MAX_PIXEL_RATIO = 2;
const SCENE_SSAA_LEVEL = 2;
const BACKDROP_OVERDRAW = 1.35;
const SHOWCASE_SECTION_COLUMNS = 3;
const SHOWCASE_PLANET_DISPLAY_RADIUS = 72;
const SHOWCASE_PLANET_GAP_X = 96;
const SHOWCASE_PLANET_GAP_Y = 88;
const SHOWCASE_SUN_BASE_RADIUS = 84;
const SHOWCASE_SUN_GAP_X = 180;
const SHOWCASE_ROCKET_RENDER_SCALE = 5;
const SHOWCASE_ROCKET_GAP_X = 150;
const SHOWCASE_ROCKET_GAP_Y = 120;
const SHOWCASE_CACHE_DISPLAY_SCALE = 1.35;
const SHOWCASE_CACHE_GAP_X = 120;
const SHOWCASE_CACHE_GAP_Y = 112;
const SHOWCASE_SECTION_GAP_X = 280;
const SHOWCASE_SECTION_GAP_Y = 340;
const SHOWCASE_BLACK_HOLE_CORE_RADIUS = 150;
const SHOWCASE_NEUTRON_STAR_CORE_RADIUS = 96;
const SHOWCASE_OVERVIEW_SAFE_PADDING = {
  bottom: 940,
  left: 640,
  right: 640,
  top: 380,
} as const;
const SECTION_PADDING = 220;
const SHOWCASE_ROCKET_KINDS = [
  "light",
  "heavy",
  "seeker",
] as const satisfies readonly RocketKind[];

export interface ModelShowcaseViewportOptions {
  displayMode?: ShowcaseDisplayMode;
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

type ShowcaseSectionId =
  | "orbits"
  | "planets"
  | "suns"
  | "blackHole"
  | "rockets"
  | "caches"
  | "neutronStar";

interface ShowcasePlanet {
  auraScale: number;
  basePosition: Vec2;
  glowMesh: Mesh;
  id: number;
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
  id: number;
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

interface ShowcaseBlackHole {
  basePosition: Vec2;
  core: Mesh;
  group: Group;
  lens: Mesh;
  ring: Mesh;
}

interface ShowcaseNeutronStar {
  basePosition: Vec2;
  coreMesh: Mesh;
  group: Group;
  haloMesh: Mesh;
  jetMeshA: Mesh;
  jetMeshB: Mesh;
  lensMesh: Mesh;
  massAlpha: number;
  phase: number;
  radius: number;
  spinSpeed: number;
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

const offsetPosition = (position: Vec2, offset: Vec2): Vec2 => ({
  x: position.x + offset.x,
  y: position.y + offset.y,
});

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
  const displayMode = options.displayMode ?? runtimeTuning.visuals.displayMode;
  const showPlanets = focus === "all" || focus === "planets";
  const showSuns = focus === "all" || focus === "suns";
  const showRockets = focus === "all" || focus === "rockets";
  const showCaches = focus === "all" || focus === "caches";
  const showBlackHole = focus === "all";
  const showNeutronStar = focus === "all";
  const useOrbitOverviewCluster = focus === "all" && showPlanets && showSuns;
  let hasLayoutContent = false;
  const rendererSizeState = createViewportRendererSizeState();
  const managedViewportSession = createManagedViewportSession({
    failureLogLabel: "showcase viewport",
    hostElement,
    isDisposed: () => disposed,
  });

  const applyCameraFrame = () => {
    if (camera === null) {
      return;
    }

    const { aspect } = getViewportHostSize(hostElement);
    const safePadding =
      focus === "all"
        ? SHOWCASE_OVERVIEW_SAFE_PADDING
        : { bottom: 0, left: 0, right: 0, top: 0 };
    const framedBounds = {
      maxX: layoutBounds.maxX + SECTION_PADDING + safePadding.right,
      maxY: layoutBounds.maxY + SECTION_PADDING + safePadding.top,
      minX: layoutBounds.minX - SECTION_PADDING - safePadding.left,
      minY: layoutBounds.minY - SECTION_PADDING - safePadding.bottom,
    };
    const layoutHalfWidth = (framedBounds.maxX - framedBounds.minX) / 2;
    const layoutHalfHeight = (framedBounds.maxY - framedBounds.minY) / 2;
    const minimumHalfHeight = Math.max(
      1,
      (options.minimumWorldHeight ?? 0) / 2,
    );

    sceneCenterX = (framedBounds.minX + framedBounds.maxX) / 2;
    sceneCenterY = (framedBounds.minY + framedBounds.maxY) / 2;
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
    managedViewportSession.invalidate();
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

          const sandboxState = createCombatSandboxState(DEFAULT_ORBIT_PRESET);
          const orbitOverviewSimulation = useOrbitOverviewCluster
            ? createShowcaseOrbitOverviewSimulation()
            : null;
          const orbitOverviewPositionScale =
            orbitOverviewSimulation === null
              ? 1
              : getShowcaseOrbitOverviewPositionScale(
                  orbitOverviewSimulation.currentState,
                );
          const orbitOverviewPlanetById =
            orbitOverviewSimulation === null
              ? null
              : new Map(
                  orbitOverviewSimulation.currentState.planets.map((planet) => [
                    planet.id,
                    planet,
                  ]),
                );
          const orbitOverviewSunById =
            orbitOverviewSimulation === null
              ? null
              : new Map(
                  orbitOverviewSimulation.currentState.suns.map((sun) => [
                    sun.id,
                    sun,
                  ]),
                );
          const planetDisplayScale =
            SHOWCASE_PLANET_DISPLAY_RADIUS /
            Math.max(DEFAULT_ORBIT_PRESET.planets[0]?.radius ?? 1, 1);
          const blackHoleScale =
            SHOWCASE_BLACK_HOLE_CORE_RADIUS /
            Math.max(runtimeTuning.visuals.blackHole.coreRadius, 1);
          const blackHoleVisualRadius =
            Math.max(
              runtimeTuning.visuals.blackHole.coreRadius,
              runtimeTuning.visuals.blackHole.lensRadius,
              runtimeTuning.visuals.blackHole.ringRadius,
            ) * blackHoleScale;
          const neutronStarMass =
            (runtimeTuning.gameplay.neutronStars.minMassKg +
              runtimeTuning.gameplay.neutronStars.maxMassKg) /
            2;
          const neutronStarMassAlpha = getNeutronStarMassAlpha(
            neutronStarMass,
            runtimeTuning.gameplay.neutronStars,
          );
          const neutronStarShape = getNeutronStarVisualShape({
            haloPulse: 1,
            massAlpha: neutronStarMassAlpha,
            pulse: 1,
            radius: SHOWCASE_NEUTRON_STAR_CORE_RADIUS,
            tuning: runtimeTuning.visuals.neutronStars,
          });
          const neutronStarHalfWidth = Math.max(
            neutronStarShape.haloRadius,
            neutronStarShape.lensRadius,
            neutronStarShape.jetWidth,
          );
          const neutronStarHalfHeight = Math.max(
            neutronStarShape.haloRadius,
            neutronStarShape.lensRadius,
            neutronStarShape.jetLength,
          );

          const planetSectionBounds = createInitialBounds();
          const planetEntriesBase = showPlanets
            ? sandboxState.planets.map((planet, index) => {
                const archetypeVisuals =
                  planetVisuals.archetypes[
                    planet.archetype as keyof typeof planetVisuals.archetypes
                  ];
                const visualStyle =
                  archetypeVisuals ?? planetVisuals.archetypes.terra;
                const renderRadius = planet.radius * planetDisplayScale;
                const renderExtent = renderRadius * visualStyle.auraScale;

                return {
                  index,
                  planet,
                  renderExtent,
                  renderRadius,
                  visualStyle,
                };
              })
            : [];
          const planetLocalPositions = useOrbitOverviewCluster
            ? planetEntriesBase.map((entry) =>
                getShowcaseOrbitOverviewPosition({
                  offset: { x: 0, y: 0 },
                  position: orbitOverviewPlanetById?.get(entry.planet.id)
                    ?.pos ?? {
                    x: 0,
                    y: 0,
                  },
                  scale: orbitOverviewPositionScale,
                }),
              )
            : getShowcaseGridPositions({
                cols: 4,
                gapX: SHOWCASE_PLANET_GAP_X,
                gapY: SHOWCASE_PLANET_GAP_Y,
                items: planetEntriesBase.map((entry) => ({
                  halfHeight: entry.renderExtent,
                  halfWidth: entry.renderExtent,
                })),
              });
          const planetEntries = planetEntriesBase.map((entry, index) => {
            const localPosition = planetLocalPositions[index] ?? { x: 0, y: 0 };

            expandBounds(
              planetSectionBounds,
              localPosition.x,
              localPosition.y,
              entry.renderExtent,
              entry.renderExtent,
            );

            return {
              ...entry,
              localPosition,
            };
          });

          const sunSectionBounds = createInitialBounds();
          const sunEntriesBase = showSuns
            ? sandboxState.suns.map((sun, index) => {
                const profile = getSunVisualProfile(sunVisuals, index);
                const defaultSun =
                  DEFAULT_ORBIT_PRESET.suns[
                    index % DEFAULT_ORBIT_PRESET.suns.length
                  ]!;
                const radius =
                  SHOWCASE_SUN_BASE_RADIUS *
                  (sun.radius / Math.max(defaultSun.radius, 1));
                const visualExtent = radius * profile.warpScale;

                return {
                  index,
                  profile,
                  radius,
                  sun,
                  visualExtent,
                };
              })
            : [];
          const sunLocalPositions = useOrbitOverviewCluster
            ? sunEntriesBase.map((entry) =>
                getShowcaseOrbitOverviewPosition({
                  offset: { x: 0, y: 0 },
                  position: orbitOverviewSunById?.get(entry.sun.id)?.pos ?? {
                    x: 0,
                    y: 0,
                  },
                  scale: orbitOverviewPositionScale,
                }),
              )
            : getShowcaseGridPositions({
                cols: 3,
                gapX: SHOWCASE_SUN_GAP_X,
                gapY: 0,
                items: sunEntriesBase.map((entry) => ({
                  halfHeight: entry.visualExtent,
                  halfWidth: entry.visualExtent,
                })),
              });
          const sunEntries = sunEntriesBase.map((entry, index) => {
            const localPosition = sunLocalPositions[index] ?? { x: 0, y: 0 };

            expandBounds(
              sunSectionBounds,
              localPosition.x,
              localPosition.y,
              entry.visualExtent,
              entry.visualExtent,
            );

            return {
              ...entry,
              localPosition,
            };
          });
          const orbitSectionBounds = createInitialBounds();
          if (useOrbitOverviewCluster) {
            for (const entry of planetEntries) {
              expandBounds(
                orbitSectionBounds,
                entry.localPosition.x,
                entry.localPosition.y,
                entry.renderExtent,
                entry.renderExtent,
              );
            }

            for (const entry of sunEntries) {
              expandBounds(
                orbitSectionBounds,
                entry.localPosition.x,
                entry.localPosition.y,
                entry.visualExtent,
                entry.visualExtent,
              );
            }
          }

          const rocketKinds = showRockets
            ? options.rocketKind === undefined
              ? [...SHOWCASE_ROCKET_KINDS]
              : [options.rocketKind]
            : [];
          const rocketSectionBounds = createInitialBounds();
          const rocketEntriesBase = rocketKinds.map((kind) => {
            const profile = rocketVisuals[kind];
            const bodyHalfLength =
              (profile.bodyScale.x * SHOWCASE_ROCKET_RENDER_SCALE) / 2;
            const trailHalfLength =
              (profile.trailScale.x * SHOWCASE_ROCKET_RENDER_SCALE) / 2;
            const flameHalfLength =
              (profile.flameScale.x * SHOWCASE_ROCKET_RENDER_SCALE) / 2;
            const bodyHalfHeight =
              (profile.bodyScale.y * SHOWCASE_ROCKET_RENDER_SCALE) / 2;
            const trailHalfHeight =
              (profile.trailScale.y * SHOWCASE_ROCKET_RENDER_SCALE) / 2;
            const flameHalfHeight =
              (profile.flameScale.y * SHOWCASE_ROCKET_RENDER_SCALE) / 2;
            const halfWidth = Math.max(
              bodyHalfLength,
              bodyHalfLength * 1.16 + trailHalfLength,
              bodyHalfLength * 1.04 + flameHalfLength,
            );
            const halfHeight =
              Math.max(bodyHalfHeight, trailHalfHeight, flameHalfHeight) + 18;

            return {
              halfHeight,
              halfWidth,
              kind,
            };
          });
          const rocketLocalPositions = getShowcaseGridPositions({
            cols: Math.min(3, Math.max(1, rocketEntriesBase.length)),
            gapX: SHOWCASE_ROCKET_GAP_X,
            gapY: SHOWCASE_ROCKET_GAP_Y,
            items: rocketEntriesBase,
          });
          const rocketEntries = rocketEntriesBase.map((entry, index) => {
            const localPosition = rocketLocalPositions[index] ?? { x: 0, y: 0 };

            expandBounds(
              rocketSectionBounds,
              localPosition.x,
              localPosition.y,
              entry.halfWidth,
              entry.halfHeight,
            );

            return {
              ...entry,
              localPosition,
            };
          });

          const cacheSectionBounds = createInitialBounds();
          const showcaseCacheDisplaySize =
            cacheBadgeSize * SHOWCASE_CACHE_DISPLAY_SCALE;
          const showcaseCacheHalfSize = showcaseCacheDisplaySize / 2;
          const cacheEntriesBase = showCaches
            ? CACHE_ICON_KEYS.map((key, index) => ({
                halfHeight: showcaseCacheHalfSize,
                halfWidth: showcaseCacheHalfSize,
                index,
                key,
              }))
            : [];
          const cacheLocalPositions = getShowcaseGridPositions({
            cols: 4,
            gapX: SHOWCASE_CACHE_GAP_X,
            gapY: SHOWCASE_CACHE_GAP_Y,
            items: cacheEntriesBase,
          });
          const cacheEntries = cacheEntriesBase.map((entry, index) => {
            const localPosition = cacheLocalPositions[index] ?? { x: 0, y: 0 };

            expandBounds(
              cacheSectionBounds,
              localPosition.x,
              localPosition.y,
              entry.halfWidth,
              entry.halfHeight,
            );

            return {
              ...entry,
              localPosition,
            };
          });

          const blackHoleSectionBounds = createInitialBounds();
          const blackHoleEntriesBase = showBlackHole
            ? [
                {
                  halfHeight: blackHoleVisualRadius,
                  halfWidth: blackHoleVisualRadius,
                },
              ]
            : [];
          const blackHoleLocalPositions = getShowcaseGridPositions({
            cols: 1,
            gapX: 0,
            gapY: 0,
            items: blackHoleEntriesBase,
          });
          const blackHoleEntries = blackHoleEntriesBase.map((entry, index) => {
            const localPosition = blackHoleLocalPositions[index] ?? {
              x: 0,
              y: 0,
            };

            expandBounds(
              blackHoleSectionBounds,
              localPosition.x,
              localPosition.y,
              entry.halfWidth,
              entry.halfHeight,
            );

            return {
              ...entry,
              localPosition,
            };
          });

          const neutronStarSectionBounds = createInitialBounds();
          const neutronStarEntriesBase = showNeutronStar
            ? [
                {
                  halfHeight: neutronStarHalfHeight,
                  halfWidth: neutronStarHalfWidth,
                  massAlpha: neutronStarMassAlpha,
                  radius: SHOWCASE_NEUTRON_STAR_CORE_RADIUS,
                },
              ]
            : [];
          const neutronStarLocalPositions = getShowcaseGridPositions({
            cols: 1,
            gapX: 0,
            gapY: 0,
            items: neutronStarEntriesBase,
          });
          const neutronStarEntries = neutronStarEntriesBase.map(
            (entry, index) => {
              const localPosition = neutronStarLocalPositions[index] ?? {
                x: 0,
                y: 0,
              };

              expandBounds(
                neutronStarSectionBounds,
                localPosition.x,
                localPosition.y,
                entry.halfWidth,
                entry.halfHeight,
              );

              return {
                ...entry,
                localPosition,
              };
            },
          );

          const sectionEntries = [
            ...(useOrbitOverviewCluster &&
            (planetEntries.length > 0 || sunEntries.length > 0)
              ? [{ bounds: orbitSectionBounds, id: "orbits" as const }]
              : []),
            ...(!useOrbitOverviewCluster && planetEntries.length > 0
              ? [{ bounds: planetSectionBounds, id: "planets" as const }]
              : []),
            ...(!useOrbitOverviewCluster && sunEntries.length > 0
              ? [{ bounds: sunSectionBounds, id: "suns" as const }]
              : []),
            ...(blackHoleEntries.length > 0
              ? [{ bounds: blackHoleSectionBounds, id: "blackHole" as const }]
              : []),
            ...(rocketEntries.length > 0
              ? [{ bounds: rocketSectionBounds, id: "rockets" as const }]
              : []),
            ...(cacheEntries.length > 0
              ? [{ bounds: cacheSectionBounds, id: "caches" as const }]
              : []),
            ...(neutronStarEntries.length > 0
              ? [
                  {
                    bounds: neutronStarSectionBounds,
                    id: "neutronStar" as const,
                  },
                ]
              : []),
          ] satisfies readonly {
            bounds: Bounds;
            id: ShowcaseSectionId;
          }[];
          const sectionOffsets = getShowcaseBoundsGridOffsets({
            cols:
              focus === "all"
                ? SHOWCASE_SECTION_COLUMNS
                : Math.max(1, sectionEntries.length),
            entries: sectionEntries,
            gapX: SHOWCASE_SECTION_GAP_X,
            gapY: SHOWCASE_SECTION_GAP_Y,
          });
          const getSectionOffset = (sectionId: ShowcaseSectionId): Vec2 =>
            sectionOffsets.get(sectionId) ?? { x: 0, y: 0 };
          const orbitSectionOffset = useOrbitOverviewCluster
            ? getSectionOffset("orbits")
            : null;

          const showcasePlanets = planetEntries.map(
            ({ index, localPosition, planet, renderRadius, visualStyle }) => {
              const basePosition = offsetPosition(
                localPosition,
                useOrbitOverviewCluster
                  ? (orbitSectionOffset ?? { x: 0, y: 0 })
                  : getSectionOffset("planets"),
              );
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
                id: planet.id,
                mesh,
                renderRadius,
                rotationSpeed: 0.28 + index * 0.045,
                spinAxis,
                spinPhase,
              } satisfies ShowcasePlanet;
            },
          );
          const showcaseSuns = sunEntries.map(
            ({ index, localPosition, profile, radius, sun }) => {
              const basePosition = offsetPosition(
                localPosition,
                useOrbitOverviewCluster
                  ? (orbitSectionOffset ?? { x: 0, y: 0 })
                  : getSectionOffset("suns"),
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
              const warpMaterial = createWarpMaterial(
                profile.glowColor,
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
                radius * profile.warpScale,
                radius * profile.warpScale,
              );
              hasLayoutContent = true;

              return {
                basePosition,
                coreMesh,
                glowMesh,
                id: sun.id,
                radius,
                rotationSpeed: 0.12 + index * 0.05,
                seedPhase: index * 0.91,
                warpMesh,
              } satisfies ShowcaseSun;
            },
          );
          const showcaseRockets = rocketEntries.map(
            ({ halfHeight, halfWidth, kind, localPosition }, index) => {
              const basePosition = offsetPosition(
                localPosition,
                getSectionOffset("rockets"),
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
                halfWidth,
                halfHeight,
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
            },
          );
          const showcaseCaches = cacheEntries.map(
            ({ index, key, localPosition }) => {
              const basePosition = offsetPosition(
                localPosition,
                getSectionOffset("caches"),
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
                showcaseCacheHalfSize,
                showcaseCacheHalfSize,
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
            },
          );
          const showcaseBlackHoles = blackHoleEntries.map(
            ({ localPosition }) => {
              const basePosition = offsetPosition(
                localPosition,
                getSectionOffset("blackHole"),
              );
              const group = new Group();
              const lens = new Mesh(
                glowGeometry,
                createBlackHoleLensMaterial(),
              );
              const ring = new Mesh(
                new RingGeometry(0.42, 1, 96),
                createBlackHoleRingMaterial(),
              );
              const core = new Mesh(
                glowGeometry,
                createBlackHoleCoreMaterial(),
              );

              group.position.set(basePosition.x, basePosition.y, 4);
              lens.scale.set(
                runtimeTuning.visuals.blackHole.lensRadius * blackHoleScale,
                runtimeTuning.visuals.blackHole.lensRadius * blackHoleScale,
                1,
              );
              ring.scale.set(
                runtimeTuning.visuals.blackHole.ringRadius * blackHoleScale,
                runtimeTuning.visuals.blackHole.ringRadius * blackHoleScale,
                1,
              );
              core.scale.set(
                runtimeTuning.visuals.blackHole.coreRadius * blackHoleScale,
                runtimeTuning.visuals.blackHole.coreRadius * blackHoleScale,
                1,
              );
              lens.position.z = -2;
              lens.renderOrder = 4;
              ring.renderOrder = 5;
              core.renderOrder = 6;
              group.add(lens, ring, core);
              scene.add(group);
              registerViewportDisposables(
                disposables,
                ring.geometry,
                lens.material as { dispose: () => void },
                ring.material as { dispose: () => void },
                core.material as { dispose: () => void },
              );
              expandBounds(
                layoutBounds,
                basePosition.x,
                basePosition.y,
                blackHoleVisualRadius,
                blackHoleVisualRadius,
              );
              hasLayoutContent = true;

              return {
                basePosition,
                core,
                group,
                lens,
                ring,
              } satisfies ShowcaseBlackHole;
            },
          );
          const showcaseNeutronStars = neutronStarEntries.map(
            ({ localPosition, massAlpha, radius }) => {
              const basePosition = offsetPosition(
                localPosition,
                getSectionOffset("neutronStar"),
              );
              const group = new Group();
              const seed = 80_001;
              const coreMesh = new Mesh(
                sunGeometry,
                createNeutronStarCoreMaterial(seed),
              );
              const haloMesh = new Mesh(
                glowGeometry,
                createNeutronStarHaloMaterial(seed),
              );
              const lensMesh = new Mesh(
                glowGeometry,
                createNeutronStarLensMaterial(seed),
              );
              const jetMeshA = new Mesh(
                ribbonGeometry,
                createNeutronStarJetMaterial(seed),
              );
              const jetMeshB = new Mesh(
                ribbonGeometry,
                createNeutronStarJetMaterial(seed + 0.37),
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
              registerViewportDisposables(
                disposables,
                coreMesh.material as { dispose: () => void },
                haloMesh.material as { dispose: () => void },
                lensMesh.material as { dispose: () => void },
                jetMeshA.material as { dispose: () => void },
                jetMeshB.material as { dispose: () => void },
              );
              expandBounds(
                layoutBounds,
                basePosition.x,
                basePosition.y,
                neutronStarHalfWidth,
                neutronStarHalfHeight,
              );
              hasLayoutContent = true;

              return {
                basePosition,
                coreMesh,
                group,
                haloMesh,
                jetMeshA,
                jetMeshB,
                lensMesh,
                massAlpha,
                phase: 0.41,
                radius,
                spinSpeed: 0.28,
              } satisfies ShowcaseNeutronStar;
            },
          );

          if (!hasLayoutContent) {
            expandBounds(layoutBounds, 0, 0, 320, 220);
          }

          resizeViewport();
          window.addEventListener("resize", resizeViewport);

          const { disposables: effectDisposables, outputNode } =
            createShowcaseDisplayPipeline({
              camera: nextCamera,
              mode: displayMode,
              renderer: nextRenderer,
              sampleLevel: SCENE_SSAA_LEVEL,
              scene,
            });
          const postProcessing = new RenderPipeline(nextRenderer, outputNode);
          postProcessing.outputColorTransform = false;
          registerViewportDisposables(disposables, ...effectDisposables);

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
              if (orbitOverviewSimulation !== null) {
                stepShowcaseOrbitOverviewSimulation({
                  nowSec,
                  simulationState: orbitOverviewSimulation,
                });
              }
              const orbitOverviewPlanetPositionsById =
                orbitOverviewSimulation === null || orbitSectionOffset === null
                  ? null
                  : new Map(
                      orbitOverviewSimulation.currentState.planets.map(
                        (planet) =>
                          [
                            planet.id,
                            getShowcaseOrbitOverviewPosition({
                              offset: orbitSectionOffset,
                              position: planet.pos,
                              scale: orbitOverviewPositionScale,
                            }),
                          ] as const,
                      ),
                    );
              const orbitOverviewSunPositionsById =
                orbitOverviewSimulation === null || orbitSectionOffset === null
                  ? null
                  : new Map(
                      orbitOverviewSimulation.currentState.suns.map(
                        (sun) =>
                          [
                            sun.id,
                            getShowcaseOrbitOverviewPosition({
                              offset: orbitSectionOffset,
                              position: sun.pos,
                              scale: orbitOverviewPositionScale,
                            }),
                          ] as const,
                      ),
                    );

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
                const planetPosition =
                  orbitOverviewPlanetPositionsById?.get(planet.id) ??
                  planet.basePosition;
                planet.mesh.position.set(planetPosition.x, planetPosition.y, 0);
                planet.glowMesh.position.set(
                  planetPosition.x,
                  planetPosition.y,
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
                const sunPosition =
                  orbitOverviewSunPositionsById?.get(sun.id) ??
                  sun.basePosition;
                sun.coreMesh.position.set(sunPosition.x, sunPosition.y, 0);
                sun.glowMesh.position.set(sunPosition.x, sunPosition.y, -2);
                sun.warpMesh.position.set(sunPosition.x, sunPosition.y, -4);
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
                rocket.mesh.scale.set(
                  profile.bodyScale.x * SHOWCASE_ROCKET_RENDER_SCALE,
                  profile.bodyScale.y * SHOWCASE_ROCKET_RENDER_SCALE,
                  1,
                );

                rocket.trailMesh.position.set(
                  rocket.basePosition.x -
                    Math.cos(angle) *
                      (profile.bodyScale.x *
                        SHOWCASE_ROCKET_RENDER_SCALE *
                        0.58),
                  rocket.basePosition.y -
                    Math.sin(angle) *
                      (profile.bodyScale.x *
                        SHOWCASE_ROCKET_RENDER_SCALE *
                        0.58),
                  2.75,
                );
                rocket.trailMesh.rotation.z = angle;
                rocket.trailMesh.scale.set(
                  profile.trailScale.x *
                    SHOWCASE_ROCKET_RENDER_SCALE *
                    trailPulse,
                  profile.trailScale.y * SHOWCASE_ROCKET_RENDER_SCALE,
                  1,
                );

                rocket.flameMesh.position.set(
                  rocket.basePosition.x -
                    Math.cos(angle) *
                      (profile.bodyScale.x *
                        SHOWCASE_ROCKET_RENDER_SCALE *
                        0.52),
                  rocket.basePosition.y -
                    Math.sin(angle) *
                      (profile.bodyScale.x *
                        SHOWCASE_ROCKET_RENDER_SCALE *
                        0.52),
                  2.9,
                );
                rocket.flameMesh.rotation.z = angle;
                rocket.flameMesh.scale.set(
                  profile.flameScale.x *
                    SHOWCASE_ROCKET_RENDER_SCALE *
                    flamePulse,
                  profile.flameScale.y * SHOWCASE_ROCKET_RENDER_SCALE,
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
                  showcaseCacheDisplaySize * pulse,
                  showcaseCacheDisplaySize * pulse,
                  1,
                );
              }

              for (const blackHole of showcaseBlackHoles) {
                blackHole.group.position.set(
                  blackHole.basePosition.x,
                  blackHole.basePosition.y,
                  4,
                );
                blackHole.ring.rotation.z = nowSec * 0.16;
                blackHole.lens.rotation.z = -nowSec * 0.08;
                blackHole.core.rotation.z = nowSec * 0.03;
              }

              for (const neutronStar of showcaseNeutronStars) {
                const pulse =
                  1 + Math.sin(nowSec * 6.4 + neutronStar.phase) * 0.04;
                const haloPulse =
                  1 + Math.sin(nowSec * 4.8 + neutronStar.phase * 1.7) * 0.08;
                const {
                  coreRadius,
                  haloRadius,
                  lensRadius,
                  jetLength,
                  jetWidth,
                } = getNeutronStarVisualShape({
                  haloPulse,
                  massAlpha: neutronStar.massAlpha,
                  pulse,
                  radius: neutronStar.radius,
                  tuning: runtimeTuning.visuals.neutronStars,
                });
                const coreMaterial = neutronStar.coreMesh
                  .material as MeshBasicNodeMaterial;
                const haloMaterial = neutronStar.haloMesh
                  .material as MeshBasicNodeMaterial;
                const lensMaterial = neutronStar.lensMesh
                  .material as MeshBasicNodeMaterial;
                const jetMaterialA = neutronStar.jetMeshA
                  .material as MeshBasicNodeMaterial;
                const jetMaterialB = neutronStar.jetMeshB
                  .material as MeshBasicNodeMaterial;

                neutronStar.group.position.set(
                  neutronStar.basePosition.x,
                  neutronStar.basePosition.y,
                  -1,
                );
                neutronStar.group.rotation.z =
                  nowSec * 0.06 + neutronStar.phase * 0.18;
                neutronStar.coreMesh.scale.set(
                  coreRadius,
                  coreRadius,
                  coreRadius,
                );
                neutronStar.haloMesh.scale.set(haloRadius, haloRadius, 1);
                neutronStar.lensMesh.scale.set(lensRadius, lensRadius, 1);
                neutronStar.jetMeshA.scale.set(jetWidth, jetLength, 1);
                neutronStar.jetMeshB.scale.set(
                  jetWidth * NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
                  jetLength * NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
                  1,
                );
                neutronStar.jetMeshA.rotation.z =
                  neutronStar.phase +
                  Math.sin(nowSec * 0.4 + neutronStar.phase) * 0.08;
                neutronStar.jetMeshB.rotation.z =
                  neutronStar.phase +
                  Math.PI / 2 -
                  Math.sin(nowSec * 0.36 + neutronStar.phase) * 0.06;
                neutronStar.haloMesh.rotation.z =
                  nowSec * 0.18 + neutronStar.phase * 0.4;
                neutronStar.lensMesh.rotation.z =
                  -nowSec * 0.12 - neutronStar.phase * 0.3;
                neutronStar.coreMesh.rotation.x = 0.44;
                neutronStar.coreMesh.rotation.y =
                  nowSec * neutronStar.spinSpeed;
                coreMaterial.opacity = 1;
                haloMaterial.opacity =
                  runtimeTuning.visuals.neutronStars.haloOpacity;
                lensMaterial.opacity =
                  runtimeTuning.visuals.neutronStars.lensOpacity;
                jetMaterialA.opacity =
                  runtimeTuning.visuals.neutronStars.jetOpacity;
                jetMaterialB.opacity =
                  runtimeTuning.visuals.neutronStars.jetOpacity *
                  NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR;
              }

              postProcessing.render();
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
