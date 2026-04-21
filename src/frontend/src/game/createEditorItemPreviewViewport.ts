import {
  ARCHETYPES,
  ARCHETYPE_IDS,
  clamp,
  createNeutronStars,
  getNeutronStarMassAlpha,
  getSunVisualProfile,
  lerp,
  mulberry32,
  type GameTuningDocument,
  type PlanetArchetypeVisualSpec,
  type RocketKind,
  type SunVisualProfile,
} from "@3body/shared";
import type { Sun, Vec2 } from "@3body/shared";
import { attribute, color, renderOutput, uniform } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { rgbShift } from "three/addons/tsl/display/RGBShiftNode.js";
import {
  AdditiveBlending,
  BufferGeometry,
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  RenderPipeline,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  type WebGPURenderer,
} from "three/webgpu";
import { DEFAULT_ORBIT_PRESET, getDefaultOrbitSunLabel } from "./orbitPresets";
import { getEditorPreviewCameraHalfHeight } from "./editorPreviewCamera";
import {
  getNeutronStarVisualShape,
  NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
} from "./neutronStarVisuals";
import { ROCKET_MESH_SILHOUETTES } from "./rocketMeshSilhouette";
import { getScaledRocketVisualTuning } from "./rocketVisualTuning";
import {
  getCannonWorldLayout,
  getMinScreenAxisScale,
  ROCKET_MIN_SCREEN_WIDTH_PX,
} from "./rocketVisibility";
import {
  CACHE_ICON_KEYS,
  createBackgroundLayer,
  createBackgroundLayerConfigs,
  createBackdropMaterial,
  createCacheBadgeSpriteMaterial,
  createPlanetGlowMaterial,
  createPlanetMaterial,
  createRocketFlameMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
  createSceneBackgroundColor,
  createSunCoreMaterial,
  createSunGlowMaterial,
  type CacheIconKey,
  syncBackdropFrame,
  tintColor,
  createWarpMaterial,
  wrapCentered,
} from "./showcaseVisuals";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import { getCacheArenaBadgeSize } from "./viewport/cacheVisuals";
import {
  disposeViewportDisposables,
  registerViewportDisposables,
} from "./viewport/disposables";
import {
  createBlackHoleCoreMaterial,
  createBlackHoleLensMaterial,
  createBlackHoleRingMaterial,
  createBoostWakeMaterial,
  createNeutronStarCoreMaterial,
  createNeutronStarHaloMaterial,
  createNeutronStarJetMaterial,
  createNeutronStarLensMaterial,
} from "./viewport/localViewportVisualFactories";
import { createCompatibleScenePass } from "./viewport/postProcessingCompat";
import {
  createAmbientBoundaryDebrisVisual,
  updateAmbientBoundaryDebrisVisual,
} from "./viewport/ambientBoundaryDebris";
import { createShieldVisual } from "./shieldVisuals";
import {
  disposeViewportRendererSession,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";
import { createManagedViewportSession } from "./viewport/managedViewportSession";
import {
  createViewportRendererSizeState,
  syncViewportRendererSize,
} from "./viewport/rendererSizing";

const CAMERA_DISTANCE = 100;
const CARD_MAX_PIXEL_RATIO = 1.25;
const STAGE_MAX_PIXEL_RATIO = 2;
const CARD_SSAA_LEVEL = 0;
const STAGE_SSAA_LEVEL = 1;
const CARD_BLOOM_STRENGTH = 0.5;
const STAGE_BLOOM_STRENGTH = 0.92;
const BLOOM_RADIUS = 0.18;
const BLOOM_THRESHOLD = 0.82;
const BACKDROP_OVERDRAW = 1.35;
const BLACK_HOLE_CARD_RADIUS = 18;
const BLACK_HOLE_STAGE_RADIUS = 150;
const PLANET_CARD_RADIUS = 11;
const PLANET_STAGE_RADIUS = 72;
const PLANETS_STAGE_RADIUS = 34;
const SUN_CARD_RADIUS = 10;
const SUN_STAGE_RADIUS = 74;
const SUNS_STAGE_RADIUS = 52;
const CANNON_BAND_POSITION = 0.32;
const PLANETS_STAGE_GRID_COLUMNS = 4;
const PLANETS_STAGE_HORIZONTAL_SPACING = 104;
const PLANETS_STAGE_VERTICAL_SPACING = 96;
const PLANETS_STAGE_LAYOUT_PADDING = 26;
const PLANETS_STAGE_GLOW_GUTTER = 18;
const SUNS_STAGE_HORIZONTAL_SPACING = 154;
const SUNS_STAGE_VERTICAL_SPACING = 132;
const SUNS_STAGE_LAYOUT_PADDING = 30;
const SUNS_STAGE_GLOW_GUTTER = 22;
const CACHE_STAGE_HORIZONTAL_SPACING = 172;
const CACHE_STAGE_VERTICAL_SPACING = 164;
const CACHE_STAGE_LAYOUT_PADDING = 30;
const CACHE_STAGE_BADGE_GUTTER = 48;
const CACHE_STAGE_BADGE_GUTTER_RATIO = 0.5;
const PLANETS_CARD_HORIZONTAL_SPACING = 12;
const PLANETS_CARD_VERTICAL_SPACING = 11;
const PLANETS_CARD_MIN_RADIUS = 5.5;
const PLANETS_CARD_MAX_RADIUS = 7.2;
const PLANETS_CARD_RADIUS_SCALE = 0.28;
const SUNS_CARD_HORIZONTAL_SPACING = 15;
const SUNS_CARD_VERTICAL_SPACING = 13;
const SUNS_CARD_MIN_RADIUS = 4.8;
const SUNS_CARD_MAX_RADIUS = 8.6;
const SUNS_CARD_RADIUS_SCALE = 0.34;
const PLANET_LABEL_SCREEN_MIN_FONT_PX = 11;
const PLANET_LABEL_SCREEN_MAX_FONT_PX = 24;
const PLANET_LABEL_SCREEN_FONT_SCALE = 0.021;
const PLANET_LABEL_SCREEN_MIN_PADDING_Y_PX = 2;
const PLANET_LABEL_SCREEN_MAX_PADDING_Y_PX = 5;
const PLANET_LABEL_SCREEN_PADDING_Y_SCALE = 0.1;
const PLANET_LABEL_SCREEN_MIN_PADDING_X_PX = 6;
const PLANET_LABEL_SCREEN_MAX_PADDING_X_PX = 10;
const PLANET_LABEL_SCREEN_PADDING_X_SCALE = 0.23;
const PLANET_LABEL_SCREEN_MIN_BORDER_PX = 1;
const PLANET_LABEL_SCREEN_MAX_BORDER_PX = 2;
const PLANET_LABEL_SCREEN_BORDER_SCALE = 0.03;
const PLANET_LABEL_MIN_WORLD_GAP = 4;
const PLANET_LABEL_MAX_WORLD_GAP = 7;
const PLANET_LABEL_WORLD_GAP_RATIO = 0.22;
const BOOST_PREVIEW_ACTIVE_SEC = 0.48;
const BOOST_PREVIEW_IDLE_SEC = 0.9;
const BOOST_PREVIEW_CYCLE_SEC =
  BOOST_PREVIEW_ACTIVE_SEC + BOOST_PREVIEW_IDLE_SEC;
const GRAVITY_PULSE_PREVIEW_CYCLE_SEC = 1.6;
const ROCKET_CARD_SCALE = 0.34;
export const getEditorPreviewGameplayPlanetRadius = (
  tuning: GameTuningDocument,
) =>
  (tuning.gameplay.orbits.planets[0]?.radius ??
    DEFAULT_ORBIT_PRESET.planets[0]!.radius) *
  tuning.visuals.planets.archetypes.terra.bodyScale;

export type EditorPreviewViewportItemId =
  | "overview"
  | "hud"
  | "background"
  | "planets"
  | "suns"
  | "neutronStars"
  | "blackHole"
  | "cannon"
  | "rocketLight"
  | "rocketHeavy"
  | "rocketSeeker"
  | "shield"
  | "boost"
  | "gravityPulse"
  | "cache";

interface EditorItemPreviewViewportOptions {
  itemId: EditorPreviewViewportItemId;
  presentation?: "card" | "stage";
}

interface PlanetStagePreviewEntry {
  archetype: (typeof ARCHETYPE_IDS)[number];
  labelWorldGap: number;
  position: Vec2;
  radius: number;
  visuals: PlanetArchetypeVisualSpec;
}

interface SunStagePreviewEntry {
  effectiveRadius: number;
  labelWorldGap: number;
  position: Vec2;
  profile: SunVisualProfile;
  radius: number;
}

interface CacheStagePreviewEntry {
  iconKey: CacheIconKey;
  position: Vec2;
  size: number;
}

interface StagePreviewLabelEntry {
  anchor: Vec2;
  color: string;
  label: string;
}

interface StagePreviewLabelOverlay {
  dispose: () => void;
  update: (camera: OrthographicCamera) => void;
}

const registerDisposables = (
  disposables: Array<{ dispose: () => void }>,
  ...items: Array<{ dispose: () => void }>
) => {
  registerViewportDisposables(disposables, ...items);
};

const getRocketKindFromItemId = (
  itemId: EditorPreviewViewportItemId,
): RocketKind | null => {
  switch (itemId) {
    case "rocketLight":
      return "light";
    case "rocketHeavy":
      return "heavy";
    case "rocketSeeker":
      return "seeker";
    default:
      return null;
  }
};

const isAbilityPreviewItem = (
  itemId: EditorPreviewViewportItemId,
): itemId is "shield" | "boost" | "gravityPulse" =>
  itemId === "shield" ||
  itemId === "boost" ||
  itemId === "gravityPulse";

const usesPlayerCameraStageView = (itemId: EditorPreviewViewportItemId) =>
  isAbilityPreviewItem(itemId) ||
  itemId === "cache" ||
  itemId === "blackHole" ||
  itemId === "neutronStars" ||
  itemId === "cannon" ||
  itemId === "rocketLight" ||
  itemId === "rocketHeavy" ||
  itemId === "rocketSeeker";

const usesGameplayPlanetPreview = (itemId: EditorPreviewViewportItemId) =>
  itemId === "cannon" || isAbilityPreviewItem(itemId);

export const getEditorPreviewPlayerCameraHalfHeight = ({
  itemId,
  tuning,
}: {
  itemId: EditorPreviewViewportItemId;
  tuning: GameTuningDocument;
}): number | null => {
  if (!usesPlayerCameraStageView(itemId)) {
    return null;
  }

  return getEditorPreviewCameraHalfHeight({ itemId, tuning });
};

export const getEditorPreviewStageWorldUnitsPerPixel = ({
  itemId,
  tuning,
  viewportHeight,
}: {
  itemId: EditorPreviewViewportItemId;
  tuning: GameTuningDocument;
  viewportHeight: number;
}): number => {
  const visibleWorldHeight =
    (getEditorPreviewPlayerCameraHalfHeight({
      itemId,
      tuning,
    }) ??
      getCameraHalfHeight({
        itemId,
        presentation: "stage",
      })) * 2;

  return visibleWorldHeight / Math.max(1, viewportHeight);
};

const getPresentationScale = (presentation: "card" | "stage") =>
  presentation === "card" ? 1 : 1.7;

const getCameraHalfHeight = ({
  itemId,
  presentation,
}: EditorItemPreviewViewportOptions): number => {
  if (presentation === "card") {
    switch (itemId) {
      case "background":
      case "overview":
      case "hud":
        return 46;
      case "neutronStars":
      case "blackHole":
        return 52;
      default:
        return 42;
    }
  }

  switch (itemId) {
    case "neutronStars":
      return 260;
    case "blackHole":
      return 220;
    case "planets":
      return 175;
    case "suns":
      return 168;
    case "cannon":
      return 185;
    case "shield":
    case "boost":
    case "gravityPulse":
      return 170;
    case "hud":
      return 160;
    default:
      return 150;
  }
};

const getPreviewPlanetRadius = (
  itemId: EditorPreviewViewportItemId,
  presentation: "card" | "stage",
  tuning: GameTuningDocument,
) => {
  const targetRadius =
    presentation === "card"
      ? PLANET_CARD_RADIUS
      : itemId === "planets"
        ? PLANETS_STAGE_RADIUS
        : isAbilityPreviewItem(itemId)
          ? getEditorPreviewGameplayPlanetRadius(tuning)
          : PLANET_STAGE_RADIUS;
  return targetRadius;
};

const getPreviewSunRadius = (
  itemId: EditorPreviewViewportItemId,
  presentation: "card" | "stage",
) => {
  const sourceRadius = DEFAULT_ORBIT_PRESET.suns[0]!.radius;
  const targetRadius =
    presentation === "card"
      ? SUN_CARD_RADIUS
      : itemId === "suns"
        ? SUNS_STAGE_RADIUS
        : SUN_STAGE_RADIUS;
  return sourceRadius * (targetRadius / Math.max(sourceRadius, 1));
};

const getPreviewCacheBadgeSize = (
  tuning: GameTuningDocument,
  presentation: "card" | "stage",
) =>
  presentation === "card"
    ? tuning.visuals.caches.badgeBaseSize *
      tuning.visuals.caches.badgeScale *
      0.22
    : getCacheArenaBadgeSize(
        tuning.visuals.caches.badgeBaseSize,
        tuning.visuals.caches.badgeScale,
      );

const getPlanetGridPosition = (
  index: number,
  total: number,
  horizontalSpacing: number,
  verticalSpacing: number,
): Vec2 => {
  const columns = Math.min(PLANETS_STAGE_GRID_COLUMNS, Math.max(total, 1));
  const row = Math.floor(index / columns);
  const rows = Math.ceil(total / columns);
  const rowStart = row * columns;
  const itemsInRow = Math.min(columns, total - rowStart);
  const column = index - rowStart;

  return {
    x: (column - (itemsInRow - 1) / 2) * horizontalSpacing,
    y: ((rows - 1) / 2 - row) * verticalSpacing,
  };
};

const getPlanetPreviewSeedRadius = (index: number): number =>
  DEFAULT_ORBIT_PRESET.planets[index]?.radius ??
  DEFAULT_ORBIT_PRESET.planets[0]!.radius;

const getStageLabelWorldGap = (radius: number): number =>
  clamp(
    radius * PLANET_LABEL_WORLD_GAP_RATIO,
    PLANET_LABEL_MIN_WORLD_GAP,
    PLANET_LABEL_MAX_WORLD_GAP,
  );

const createPlanetStagePreviewLayout = (
  tuning: GameTuningDocument,
): {
  entries: PlanetStagePreviewEntry[];
  requiredHalfHeight: number;
  requiredHalfWidth: number;
} => {
  const stageEntries = ARCHETYPE_IDS.map((archetype, index) => {
    const visuals = tuning.visuals.planets.archetypes[archetype];
    const radius = getPlanetPreviewSeedRadius(index) * visuals.bodyScale;
    const labelWorldGap = getStageLabelWorldGap(radius);

    return {
      archetype,
      auraRadius: radius * visuals.auraScale,
      labelWorldGap,
      radius,
      visuals,
    };
  });
  const maxAuraRadius = stageEntries.reduce(
    (largest, entry) => Math.max(largest, entry.auraRadius),
    0,
  );
  const maxLabelWorldGap = stageEntries.reduce(
    (largest, entry) => Math.max(largest, entry.labelWorldGap),
    0,
  );
  const horizontalSpacing = Math.max(
    PLANETS_STAGE_HORIZONTAL_SPACING,
    maxAuraRadius * 2 + PLANETS_STAGE_GLOW_GUTTER,
  );
  const verticalSpacing = Math.max(
    PLANETS_STAGE_VERTICAL_SPACING,
    maxAuraRadius * 2 + maxLabelWorldGap + 10,
  );
  const entries = stageEntries.map((entry, index) => ({
    archetype: entry.archetype,
    labelWorldGap: entry.labelWorldGap,
    position: getPlanetGridPosition(
      index,
      stageEntries.length,
      horizontalSpacing,
      verticalSpacing,
    ),
    radius: entry.radius,
    visuals: entry.visuals,
  }));
  let requiredHalfWidth = 0;
  let requiredHalfHeight = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const auraRadius = entry.radius * entry.visuals.auraScale;
    requiredHalfWidth = Math.max(
      requiredHalfWidth,
      Math.abs(entry.position.x) + auraRadius,
    );
    requiredHalfHeight = Math.max(
      requiredHalfHeight,
      Math.abs(entry.position.y) + auraRadius,
      entry.position.y + entry.radius + entry.labelWorldGap,
    );
  }

  return {
    entries,
    requiredHalfHeight: requiredHalfHeight + PLANETS_STAGE_LAYOUT_PADDING,
    requiredHalfWidth: requiredHalfWidth + PLANETS_STAGE_LAYOUT_PADDING,
  };
};

const createSunStagePreviewLayout = (
  tuning: GameTuningDocument,
  baseRadius: number,
): {
  entries: SunStagePreviewEntry[];
  requiredHalfHeight: number;
  requiredHalfWidth: number;
} => {
  const stageEntries = tuning.visuals.suns.profiles.map((profile, index) => {
    const defaultSun =
      DEFAULT_ORBIT_PRESET.suns[index % DEFAULT_ORBIT_PRESET.suns.length]!;
    const radius =
      baseRadius *
      (tuning.gameplay.orbits.suns[index]!.radius /
        Math.max(defaultSun.radius, 1));
    const effectiveRadius =
      radius * Math.max(1, profile.glowScale, profile.warpScale);
    const labelWorldGap = getStageLabelWorldGap(effectiveRadius);

    return {
      effectiveRadius,
      labelWorldGap,
      profile,
      radius,
    };
  });
  const maxEffectiveRadius = stageEntries.reduce(
    (largest, entry) => Math.max(largest, entry.effectiveRadius),
    0,
  );
  const maxLabelWorldGap = stageEntries.reduce(
    (largest, entry) => Math.max(largest, entry.labelWorldGap),
    0,
  );
  const horizontalSpacing = Math.max(
    SUNS_STAGE_HORIZONTAL_SPACING,
    maxEffectiveRadius * 2 + SUNS_STAGE_GLOW_GUTTER,
  );
  const verticalSpacing = Math.max(
    SUNS_STAGE_VERTICAL_SPACING,
    maxEffectiveRadius * 2 + maxLabelWorldGap + 10,
  );
  const entries = stageEntries.map((entry, index) => ({
    effectiveRadius: entry.effectiveRadius,
    labelWorldGap: entry.labelWorldGap,
    position: getPlanetGridPosition(
      index,
      stageEntries.length,
      horizontalSpacing,
      verticalSpacing,
    ),
    profile: entry.profile,
    radius: entry.radius,
  }));
  let requiredHalfWidth = 0;
  let requiredHalfHeight = 0;
  for (const entry of entries) {
    requiredHalfWidth = Math.max(
      requiredHalfWidth,
      Math.abs(entry.position.x) + entry.effectiveRadius,
    );
    requiredHalfHeight = Math.max(
      requiredHalfHeight,
      Math.abs(entry.position.y) + entry.effectiveRadius,
      entry.position.y + entry.effectiveRadius + entry.labelWorldGap,
    );
  }

  return {
    entries,
    requiredHalfHeight: requiredHalfHeight + SUNS_STAGE_LAYOUT_PADDING,
    requiredHalfWidth: requiredHalfWidth + SUNS_STAGE_LAYOUT_PADDING,
  };
};

const createCacheStagePreviewLayout = (
  tuning: GameTuningDocument,
): {
  entries: CacheStagePreviewEntry[];
  requiredHalfHeight: number;
  requiredHalfWidth: number;
} => {
  const badgeSize = getPreviewCacheBadgeSize(tuning, "stage");
  const badgeGutter = Math.max(
    CACHE_STAGE_BADGE_GUTTER,
    badgeSize * CACHE_STAGE_BADGE_GUTTER_RATIO,
  );
  const horizontalSpacing = Math.max(
    CACHE_STAGE_HORIZONTAL_SPACING,
    badgeSize + badgeGutter,
  );
  const verticalSpacing = Math.max(
    CACHE_STAGE_VERTICAL_SPACING,
    badgeSize + badgeGutter,
  );
  const entries = CACHE_ICON_KEYS.map((iconKey, index) => ({
    iconKey,
    position: getPlanetGridPosition(
      index,
      CACHE_ICON_KEYS.length,
      horizontalSpacing,
      verticalSpacing,
    ),
    size: badgeSize,
  }));
  let requiredHalfWidth = 0;
  let requiredHalfHeight = 0;
  for (const entry of entries) {
    const halfSize = entry.size * 0.5;
    requiredHalfWidth = Math.max(
      requiredHalfWidth,
      Math.abs(entry.position.x) + halfSize,
    );
    requiredHalfHeight = Math.max(
      requiredHalfHeight,
      Math.abs(entry.position.y) + halfSize,
    );
  }

  return {
    entries,
    requiredHalfHeight: requiredHalfHeight + CACHE_STAGE_LAYOUT_PADDING,
    requiredHalfWidth: requiredHalfWidth + CACHE_STAGE_LAYOUT_PADDING,
  };
};

const createStagePreviewLabelOverlay = ({
  hostElement,
  entries,
}: {
  hostElement: HTMLDivElement;
  entries: readonly StagePreviewLabelEntry[];
}): StagePreviewLabelOverlay => {
  const overlay = hostElement.ownerDocument.createElement("div");
  overlay.className = "editor-preview-planet-labels";
  const labels = entries.map((entry) => {
    const element = hostElement.ownerDocument.createElement("div");
    element.className = "editor-preview-planet-label";
    element.textContent = entry.label;
    element.style.borderColor = entry.color;
    element.style.boxShadow = `0 18px 44px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px ${entry.color}33`;
    overlay.append(element);
    return { element, entry };
  });
  hostElement.append(overlay);

  return {
    dispose: () => {
      overlay.remove();
    },
    update: (camera) => {
      const viewportWidth = Math.max(1, hostElement.clientWidth);
      const viewportHeight = Math.max(1, hostElement.clientHeight);
      const minViewportSize = Math.min(viewportWidth, viewportHeight);
      const fontSizePx = clamp(
        minViewportSize * PLANET_LABEL_SCREEN_FONT_SCALE,
        PLANET_LABEL_SCREEN_MIN_FONT_PX,
        PLANET_LABEL_SCREEN_MAX_FONT_PX,
      );
      const paddingYPx = clamp(
        fontSizePx * PLANET_LABEL_SCREEN_PADDING_Y_SCALE,
        PLANET_LABEL_SCREEN_MIN_PADDING_Y_PX,
        PLANET_LABEL_SCREEN_MAX_PADDING_Y_PX,
      );
      const paddingXPx = clamp(
        fontSizePx * PLANET_LABEL_SCREEN_PADDING_X_SCALE,
        PLANET_LABEL_SCREEN_MIN_PADDING_X_PX,
        PLANET_LABEL_SCREEN_MAX_PADDING_X_PX,
      );
      const borderWidthPx = clamp(
        fontSizePx * PLANET_LABEL_SCREEN_BORDER_SCALE,
        PLANET_LABEL_SCREEN_MIN_BORDER_PX,
        PLANET_LABEL_SCREEN_MAX_BORDER_PX,
      );
      const spanX = Math.max(0.001, camera.right - camera.left);
      const spanY = Math.max(0.001, camera.top - camera.bottom);

      for (const { element, entry } of labels) {
        const screenX =
          ((entry.anchor.x - camera.left) / spanX) * viewportWidth;
        const screenY =
          ((camera.top - entry.anchor.y) / spanY) * viewportHeight;
        element.style.left = `${screenX}px`;
        element.style.top = `${screenY}px`;
        element.style.fontSize = `${Math.round(fontSizePx)}px`;
        element.style.padding = `${Math.round(paddingYPx)}px ${Math.round(
          paddingXPx,
        )}px`;
        element.style.borderWidth = `${Math.round(borderWidthPx)}px`;
      }
    },
  };
};

const createPlanetStagePreviewLabelOverlay = ({
  hostElement,
  entries,
}: {
  hostElement: HTMLDivElement;
  entries: readonly PlanetStagePreviewEntry[];
}): StagePreviewLabelOverlay =>
  createStagePreviewLabelOverlay({
    hostElement,
    entries: entries.map((entry) => ({
      anchor: {
        x: entry.position.x,
        y: entry.position.y + entry.radius + entry.labelWorldGap,
      },
      color: entry.visuals.color,
      label: ARCHETYPES[entry.archetype].name,
    })),
  });

const createSunStagePreviewLabelOverlay = ({
  hostElement,
  entries,
}: {
  hostElement: HTMLDivElement;
  entries: readonly SunStagePreviewEntry[];
}): StagePreviewLabelOverlay =>
  createStagePreviewLabelOverlay({
    hostElement,
    entries: entries.map((entry, index) => ({
      anchor: {
        x: entry.position.x,
        y: entry.position.y + entry.effectiveRadius + entry.labelWorldGap,
      },
      color: entry.profile.color,
      label: getDefaultOrbitSunLabel(index),
    })),
  });

const createPreviewPlanet = ({
  hostScene,
  planetGeometry,
  position,
  radius,
  ringGeometry,
  seed,
  visuals,
}: {
  hostScene: Scene;
  planetGeometry: SphereGeometry;
  position: Vec2;
  radius: number;
  ringGeometry: CircleGeometry;
  seed: number;
  visuals: PlanetArchetypeVisualSpec;
}) => {
  const material = createPlanetMaterial(visuals, seed);
  const glow = createPlanetGlowMaterial(
    visuals.color,
    seed,
    visuals.auraScale,
    visuals.auraGap,
  );
  const mesh = new Mesh(planetGeometry, material);
  const glowMesh = new Mesh(ringGeometry, glow.material);
  mesh.position.set(position.x, position.y, 0);
  glowMesh.position.set(position.x, position.y, 0.16);
  mesh.scale.set(radius, radius, radius);
  glowMesh.scale.set(radius * visuals.auraScale, radius * visuals.auraScale, 1);
  mesh.renderOrder = -2;
  glowMesh.renderOrder = -1;
  hostScene.add(mesh, glowMesh);

  return {
    dispose: () => {
      material.dispose();
      glow.material.dispose();
    },
    setOpacity(opacity: number) {
      material.opacityUniform.value = opacity;
      glow.opacityUniform.value = opacity;
    },
    update(nowSec: number) {
      mesh.rotation.y = nowSec * 0.22 + seed * 0.7;
      mesh.rotation.x = Math.sin(nowSec * 0.17 + seed) * 0.08;
    },
  };
};

const createPreviewSun = ({
  color,
  coreBrightness,
  glowColor,
  glowScale,
  glowStrength,
  hostScene,
  radius,
  seed,
  sunGeometry,
  warpGeometry,
  warpScale,
}: {
  color: string;
  coreBrightness: number;
  glowColor: string;
  glowScale: number;
  glowStrength: number;
  hostScene: Scene;
  radius: number;
  seed: number;
  sunGeometry: SphereGeometry;
  warpGeometry: RingGeometry;
  warpScale: number;
}) => {
  const coreMaterial = createSunCoreMaterial(
    color,
    glowColor,
    seed,
    coreBrightness,
  );
  const glowMaterial = createSunGlowMaterial(glowColor, seed, glowStrength);
  const warpMaterial = createWarpMaterial(glowColor, seed);
  const coreMesh = new Mesh(sunGeometry, coreMaterial);
  const glowMesh = new Mesh(sunGeometry, glowMaterial);
  const warpMesh = new Mesh(warpGeometry, warpMaterial);

  coreMesh.scale.set(radius, radius, radius);
  glowMesh.scale.set(
    radius * glowScale,
    radius * glowScale,
    radius * glowScale,
  );
  warpMesh.scale.set(radius * warpScale, radius * warpScale, 1);
  coreMesh.renderOrder = -8;
  glowMesh.renderOrder = -10;
  warpMesh.renderOrder = -12;
  glowMesh.position.z = -2;
  warpMesh.position.z = -4;
  hostScene.add(warpMesh, glowMesh, coreMesh);

  return {
    dispose: () => {
      coreMaterial.dispose();
      glowMaterial.dispose();
      warpMaterial.dispose();
    },
    group: { coreMesh, glowMesh, warpMesh },
    update(nowSec: number, position: Vec2) {
      coreMesh.position.set(position.x, position.y, 0);
      glowMesh.position.set(position.x, position.y, -2);
      warpMesh.position.set(position.x, position.y, -4);
      coreMesh.rotation.y = nowSec * 0.2 + seed * 0.3;
      glowMesh.rotation.z = nowSec * 0.08 + seed * 0.2;
      warpMesh.rotation.z = nowSec * -0.12 - seed * 0.2;
    },
  };
};

const createPreviewNeutronStar = ({
  hostScene,
  jetGeometry,
  lensGeometry,
  massAlpha,
  radius,
  seed,
  sphereGeometry,
  tuning,
}: {
  hostScene: Scene;
  jetGeometry: PlaneGeometry;
  lensGeometry: CircleGeometry;
  massAlpha: number;
  radius: number;
  seed: number;
  sphereGeometry: SphereGeometry;
  tuning: GameTuningDocument["visuals"]["neutronStars"];
}) => {
  const group = new Group();
  const coreMesh = new Mesh(
    sphereGeometry,
    createNeutronStarCoreMaterial(seed),
  );
  const haloMesh = new Mesh(lensGeometry, createNeutronStarHaloMaterial(seed));
  const lensMesh = new Mesh(lensGeometry, createNeutronStarLensMaterial(seed));
  const jetMeshA = new Mesh(jetGeometry, createNeutronStarJetMaterial(seed));
  const jetMeshB = new Mesh(
    jetGeometry,
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
  hostScene.add(group);

  return {
    dispose: () => {
      (coreMesh.material as { dispose: () => void }).dispose();
      (haloMesh.material as { dispose: () => void }).dispose();
      (lensMesh.material as { dispose: () => void }).dispose();
      (jetMeshA.material as { dispose: () => void }).dispose();
      (jetMeshB.material as { dispose: () => void }).dispose();
    },
    update(nowSec: number, position: Vec2) {
      const pulse = 1 + Math.sin(nowSec * 6.4 + seed * 0.0007) * 0.04;
      const haloPulse =
        1 + Math.sin(nowSec * 4.8 + seed * 0.0011 + massAlpha) * 0.08;
      const { coreRadius, haloRadius, lensRadius, jetLength, jetWidth } =
        getNeutronStarVisualShape({
          haloPulse,
          massAlpha,
          pulse,
          radius,
          tuning,
        });

      group.position.set(position.x, position.y, -1);
      group.rotation.z = nowSec * 0.06 + seed * 0.0004;
      coreMesh.scale.set(coreRadius, coreRadius, coreRadius);
      haloMesh.scale.set(haloRadius, haloRadius, 1);
      lensMesh.scale.set(lensRadius, lensRadius, 1);
      jetMeshA.scale.set(jetWidth, jetLength, 1);
      jetMeshB.scale.set(
        jetWidth * NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
        jetLength * NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
        1,
      );
      jetMeshA.rotation.z =
        seed * 0.0003 + Math.sin(nowSec * 0.4 + seed * 0.0006) * 0.08;
      jetMeshB.rotation.z =
        seed * 0.0003 +
        Math.PI / 2 -
        Math.sin(nowSec * 0.36 + seed * 0.0005) * 0.06;
      haloMesh.rotation.z = nowSec * 0.18 + seed * 0.0004;
      lensMesh.rotation.z = -nowSec * 0.12 - seed * 0.0003;
      coreMesh.rotation.x = 0.44;
      coreMesh.rotation.y = nowSec * (0.24 + massAlpha * 0.08);
      const haloMaterial = haloMesh.material as MeshBasicNodeMaterial;
      const lensMaterial = lensMesh.material as MeshBasicNodeMaterial;
      const jetMaterialA = jetMeshA.material as MeshBasicNodeMaterial;
      const jetMaterialB = jetMeshB.material as MeshBasicNodeMaterial;
      haloMaterial.opacity = tuning.haloOpacity;
      lensMaterial.opacity = tuning.lensOpacity;
      jetMaterialA.opacity = tuning.jetOpacity;
      jetMaterialB.opacity =
        tuning.jetOpacity * NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR;
    },
  };
};

const createPreviewRocket = ({
  hostScene,
  hostElement,
  itemId,
  planeGeometry,
  presentation,
  rocketBodyGeometry,
  rocketCanardGeometry,
  rocketEngineGeometry,
  rocketFinGeometry,
  rocketNoseGeometry,
  rocketSensorGeometry,
}: {
  hostScene: Scene;
  hostElement: HTMLDivElement;
  itemId: EditorPreviewViewportItemId;
  planeGeometry: PlaneGeometry;
  presentation: "card" | "stage";
  rocketBodyGeometry: CylinderGeometry;
  rocketCanardGeometry: BoxGeometry;
  rocketEngineGeometry: CylinderGeometry;
  rocketFinGeometry: BoxGeometry;
  rocketNoseGeometry: ConeGeometry;
  rocketSensorGeometry: SphereGeometry;
}) => {
  const tuning = getRuntimeTuningDocument();
  const rocketKind = getRocketKindFromItemId(itemId) ?? "light";
  const profile = getScaledRocketVisualTuning(
    tuning.visuals.rockets[rocketKind],
  );
  const silhouette = ROCKET_MESH_SILHOUETTES[rocketKind];
  const bodyMaterial = createRocketMaterial(profile.core, profile.trail);
  const trailMaterial = createRocketTrailMaterial(profile.core, profile.trail);
  const flameMaterial = createRocketFlameMaterial(profile.core, profile.trail);
  const finMaterial = new MeshBasicMaterial({
    color: tintColor(profile.core, 0, -0.16, -0.24),
  });
  const canardMaterial = new MeshBasicMaterial({
    color: tintColor(profile.trail, -0.01, 0.02, 0.18),
  });
  const engineMaterial = new MeshBasicMaterial({
    color: tintColor(profile.core, 0, -0.24, -0.34),
  });
  const sensorMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: tintColor(profile.trail, -0.02, -0.04, 0.34),
    opacity: 0.86,
    transparent: true,
  });
  const group = new Group();
  const bodyMesh = new Mesh(rocketBodyGeometry, bodyMaterial);
  const noseMesh = new Mesh(rocketNoseGeometry, bodyMaterial);
  const engineMesh = new Mesh(rocketEngineGeometry, engineMaterial);
  const rearFinTopMesh = new Mesh(rocketFinGeometry, finMaterial);
  const rearFinBottomMesh = new Mesh(rocketFinGeometry, finMaterial);
  const canardTopMesh = new Mesh(rocketCanardGeometry, canardMaterial);
  const canardBottomMesh = new Mesh(rocketCanardGeometry, canardMaterial);
  const sensorMesh = new Mesh(rocketSensorGeometry, sensorMaterial);
  const trailMesh = new Mesh(planeGeometry, trailMaterial);
  const flameMesh = new Mesh(planeGeometry, flameMaterial);
  trailMesh.renderOrder = 5;
  flameMesh.renderOrder = 6;
  rearFinTopMesh.renderOrder = 7;
  rearFinBottomMesh.renderOrder = 7;
  canardTopMesh.renderOrder = 8;
  canardBottomMesh.renderOrder = 8;
  engineMesh.renderOrder = 9;
  bodyMesh.renderOrder = 10;
  sensorMesh.renderOrder = 11;
  noseMesh.renderOrder = 12;
  group.add(
    trailMesh,
    flameMesh,
    rearFinTopMesh,
    rearFinBottomMesh,
    canardTopMesh,
    canardBottomMesh,
    engineMesh,
    bodyMesh,
    sensorMesh,
    noseMesh,
  );
  hostScene.add(group);

  return {
    dispose: () => {
      bodyMaterial.dispose();
      trailMaterial.dispose();
      flameMaterial.dispose();
      finMaterial.dispose();
      canardMaterial.dispose();
      engineMaterial.dispose();
      sensorMaterial.dispose();
    },
    update(nowSec: number, position: Vec2) {
      const bob = Math.sin(nowSec * 1.5) * (presentation === "card" ? 1.2 : 5);
      const flicker = 0.9 + Math.sin(nowSec * 22) * 0.1;
      const stageWorldUnitsPerPixel =
        presentation === "stage"
          ? getEditorPreviewStageWorldUnitsPerPixel({
              itemId,
              tuning,
              viewportHeight: hostElement.clientHeight,
            })
          : null;
      const renderBodyScale =
        presentation === "card"
          ? {
              x: profile.bodyScale.x * ROCKET_CARD_SCALE,
              y: profile.bodyScale.y * ROCKET_CARD_SCALE,
            }
          : getMinScreenAxisScale(
              profile.bodyScale,
              ROCKET_MIN_SCREEN_WIDTH_PX.body,
              stageWorldUnitsPerPixel ?? 0,
            );
      const renderTrailScale =
        presentation === "card"
          ? {
              x: profile.trailScale.x * ROCKET_CARD_SCALE,
              y: profile.trailScale.y * ROCKET_CARD_SCALE * 0.84,
            }
          : getMinScreenAxisScale(
              profile.trailScale,
              ROCKET_MIN_SCREEN_WIDTH_PX.trail,
              stageWorldUnitsPerPixel ?? 0,
            );
      const renderFlameScale =
        presentation === "card"
          ? {
              x: profile.flameScale.x * ROCKET_CARD_SCALE,
              y: profile.flameScale.y * ROCKET_CARD_SCALE * 0.9,
            }
          : getMinScreenAxisScale(
              profile.flameScale,
              ROCKET_MIN_SCREEN_WIDTH_PX.flame,
              stageWorldUnitsPerPixel ?? 0,
            );
      const length = renderBodyScale.x;
      const radius = renderBodyScale.y;
      const x = position.x;
      const y = position.y + bob;
      const finYOffset = radius * 0.72;
      const canardYOffset = radius * 0.52;
      group.position.set(x, y, 0.5);
      group.rotation.z =
        Math.sin(nowSec * 0.9 + length * 0.01) *
        (presentation === "card" ? silhouette.roll * 0.7 : silhouette.roll);

      bodyMesh.scale.set(
        length * silhouette.bodyLength,
        radius * silhouette.bodyRadius,
        radius * silhouette.bodyRadius,
      );
      bodyMesh.position.set(-length * 0.02, 0, 0.6);
      noseMesh.position.set(length * 0.42, 0, 0.64);
      noseMesh.scale.set(
        length * silhouette.noseLength,
        radius * silhouette.noseRadius,
        radius * silhouette.noseRadius,
      );
      engineMesh.position.set(-length * 0.43, 0, 0.56);
      engineMesh.scale.set(length * 0.1, radius * 0.72, radius * 0.72);
      sensorMesh.position.set(length * silhouette.sensorX, 0, 0.84);
      sensorMesh.scale.setScalar(radius * silhouette.sensorScale);

      rearFinTopMesh.position.set(-length * silhouette.finX, finYOffset, 0.42);
      rearFinTopMesh.rotation.z = -silhouette.finAngle;
      rearFinTopMesh.scale.set(
        length * silhouette.finLength,
        radius * silhouette.finHeight,
        radius * 0.24,
      );
      rearFinBottomMesh.position.set(
        -length * silhouette.finX,
        -finYOffset,
        0.42,
      );
      rearFinBottomMesh.rotation.z = silhouette.finAngle;
      rearFinBottomMesh.scale.set(
        length * silhouette.finLength,
        radius * silhouette.finHeight,
        radius * 0.24,
      );

      canardTopMesh.position.set(
        length * silhouette.canardX,
        canardYOffset,
        0.5,
      );
      canardTopMesh.rotation.z = -silhouette.canardAngle;
      canardTopMesh.scale.set(
        length * silhouette.canardLength,
        radius * silhouette.canardHeight,
        radius * 0.18,
      );
      canardBottomMesh.position.set(
        length * silhouette.canardX,
        -canardYOffset,
        0.5,
      );
      canardBottomMesh.rotation.z = silhouette.canardAngle;
      canardBottomMesh.scale.set(
        length * silhouette.canardLength,
        radius * silhouette.canardHeight,
        radius * 0.18,
      );

      trailMesh.position.set(-length * silhouette.trailOffset, 0, 0.18);
      trailMesh.scale.set(renderTrailScale.x, renderTrailScale.y, 1);
      flameMesh.position.set(-length * silhouette.flameOffset, 0, 0.24);
      flameMesh.scale.set(
        renderFlameScale.x * flicker,
        renderFlameScale.y * flicker,
        1,
      );
    },
  };
};

const createPreviewCache = ({
  hostElement,
  hostScene,
  iconKey = "shieldExt",
  presentation,
}: {
  hostElement: HTMLDivElement;
  hostScene: Scene;
  iconKey?: CacheIconKey;
  presentation: "card" | "stage";
}) => {
  const tuning = getRuntimeTuningDocument();
  const { map, material } = createCacheBadgeSpriteMaterial(
    hostElement.ownerDocument,
    iconKey,
  );
  const sprite = new Sprite(material);
  sprite.renderOrder = 7;
  hostScene.add(sprite);
  const baseScale = getPreviewCacheBadgeSize(tuning, presentation);

  return {
    dispose: () => {
      map.dispose();
      material.dispose();
    },
    update(nowSec: number, position: Vec2) {
      const bob = Math.sin(nowSec * 2.2) * (presentation === "card" ? 1.4 : 5);
      const pulse = 1 + Math.sin(nowSec * 2.8) * 0.05;
      sprite.position.set(position.x, position.y + bob, 1);
      sprite.scale.set(baseScale * pulse, baseScale * pulse, 1);
      sprite.material.rotation = Math.sin(nowSec * 1.6) * 0.08;
    },
  };
};

const createHudPanelMaterial = (colorHex: string, opacity: number) =>
  new MeshBasicMaterial({
    color: colorHex,
    depthWrite: false,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
  });

const createBoostBurstMaterial = (colorHex: string) => {
  const opacityUniform = uniform(1);
  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.colorNode = color(colorHex);
  material.opacityNode = attribute<"float">("previewOpacity", "float").mul(
    opacityUniform,
  );
  material.size = 10;
  material.alphaTest = 0.01;
  return {
    material,
    opacityUniform,
  };
};

export function createEditorItemPreviewViewport(
  hostElement: HTMLDivElement,
  options: EditorItemPreviewViewportOptions,
): () => void {
  const presentation = options.presentation ?? "card";
  let tuning = getRuntimeTuningDocument();
  let disposed = false;

  let renderer: WebGPURenderer | null = null;
  let rendererBootstrap: ViewportRendererBootstrap | null = null;
  let animationLoopController: ReturnType<
    typeof createViewportAnimationLoopController
  > | null = null;
  let camera: OrthographicCamera | null = null;
  let backdropMesh: Mesh | null = null;
  let stageLabelOverlay: StagePreviewLabelOverlay | null = null;
  let postProcessing: RenderPipeline | null = null;
  let requiredCameraHalfHeight = 0;
  let requiredCameraHalfWidth = 0;
  const disposables: Array<{ dispose: () => void }> = [];
  let cleanupComplete = false;
  const rendererSizeState = createViewportRendererSizeState();
  const managedViewportSession = createManagedViewportSession({
    failureLogLabel: "editor preview viewport",
    hostElement,
    isDisposed: () => disposed,
  });

  const resizeViewport = () => {
    if (renderer === null || camera === null) {
      return;
    }

    const maxPixelRatio =
      presentation === "card" ? CARD_MAX_PIXEL_RATIO : STAGE_MAX_PIXEL_RATIO;
    const { aspect } = syncViewportRendererSize({
      hostElement,
      maxPixelRatio,
      renderer,
      sizeState: rendererSizeState,
    });
    const baseHalfHeight =
      presentation === "stage"
        ? getEditorPreviewCameraHalfHeight({
            itemId: options.itemId,
            tuning,
          })
        : getCameraHalfHeight({
            itemId: options.itemId,
            presentation,
          });
    const halfHeight = Math.max(
      baseHalfHeight,
      requiredCameraHalfHeight,
      requiredCameraHalfWidth / Math.max(aspect, 0.001),
    );
    const halfWidth = halfHeight * aspect;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    stageLabelOverlay?.update(camera);

    syncBackdropFrame({
      backdropMesh,
      centerX: 0,
      centerY: 0,
      height: halfHeight * 2 * BACKDROP_OVERDRAW,
      width: halfWidth * 2 * BACKDROP_OVERDRAW,
    });
  };

  const disposeViewportSession = () => {
    managedViewportSession.invalidate();
    window.removeEventListener("resize", resizeViewport);
    disposeViewportDisposables(disposables, "editor preview resource");
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
    stageLabelOverlay = null;
    postProcessing = null;
  };

  const handleViewportRenderError = (error: unknown) => {
    disposeViewportSession();
    managedViewportSession.reportFailure(error);
  };

  const startViewport = async () => {
    try {
      await managedViewportSession.start({
        initializeOptions: {
          antialias: presentation === "stage",
        },
        onReady: ({ bootstrap, renderer: nextRenderer }) => {
          rendererBootstrap = bootstrap;
          renderer = nextRenderer;

          tuning = getRuntimeTuningDocument();
          const scene = new Scene();
          scene.background = createSceneBackgroundColor(
            tuning.visuals.background,
          );
          const nextCamera = new OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
          camera = nextCamera;

          const backdropGeometry = new PlaneGeometry(1, 1);
          const backdropMaterial = createBackdropMaterial(
            tuning.visuals.background,
          );
          backdropMesh = new Mesh(backdropGeometry, backdropMaterial);
          backdropMesh.frustumCulled = false;
          backdropMesh.renderOrder = -40;
          scene.add(backdropMesh);
          registerDisposables(disposables, backdropGeometry, backdropMaterial);

          const backgroundLayers = createBackgroundLayerConfigs(
            tuning.visuals.background,
          ).map((layerConfig) => {
            const layer = createBackgroundLayer(layerConfig);
            scene.add(layer.group);
            registerDisposables(disposables, layer.geometry, layer.material);
            return layer;
          });
          const ambientBoundaryDebris = createAmbientBoundaryDebrisVisual({
            renderOrder: -11,
            z: -5,
          });
          scene.add(
            ambientBoundaryDebris.bandGroup,
            ambientBoundaryDebris.fallingGroup,
            ambientBoundaryDebris.points,
          );
          registerDisposables(
            disposables,
            ...ambientBoundaryDebris.bandGeometries,
            ...ambientBoundaryDebris.bandMaterials,
            ambientBoundaryDebris.geometry,
            ambientBoundaryDebris.points.material as { dispose: () => void },
          );

          const sphereGeometry = new SphereGeometry(1, 96, 96);
          const circleGeometry = new CircleGeometry(1, 72);
          const ringGeometry = new CircleGeometry(1, 64);
          const warpGeometry = new RingGeometry(0.55, 1, 96);
          const rocketBodyGeometry = new CylinderGeometry(0.56, 0.92, 1, 18, 1);
          const rocketNoseGeometry = new ConeGeometry(1, 1, 18);
          const rocketEngineGeometry = new CylinderGeometry(
            0.78,
            0.9,
            1,
            18,
            1,
          );
          const rocketFinGeometry = new BoxGeometry(1, 1, 0.18);
          const rocketCanardGeometry = new BoxGeometry(1, 1, 0.14);
          const rocketSensorGeometry = new SphereGeometry(1, 20, 14);
          const planeGeometry = new PlaneGeometry(1, 1);
          const cannonStemGeometry = new CylinderGeometry(1, 1, 1, 16).rotateZ(
            -Math.PI / 2,
          );
          const cannonBreechGeometry = new BoxGeometry(1, 1, 1);
          const cannonBarrelGeometry = new CylinderGeometry(
            1,
            1,
            1,
            20,
          ).rotateZ(-Math.PI / 2);
          const cannonBarrelBandGeometry = new CylinderGeometry(
            1,
            1,
            1,
            20,
          ).rotateZ(-Math.PI / 2);
          const cannonMuzzleGeometry = new CylinderGeometry(
            1,
            1,
            1,
            22,
          ).rotateZ(-Math.PI / 2);
          const cannonFlashGeometry = new SphereGeometry(1, 18, 12);
          rocketBodyGeometry.rotateZ(-Math.PI / 2);
          rocketNoseGeometry.rotateZ(-Math.PI / 2);
          rocketEngineGeometry.rotateZ(-Math.PI / 2);
          registerDisposables(
            disposables,
            sphereGeometry,
            circleGeometry,
            ringGeometry,
            warpGeometry,
            rocketBodyGeometry,
            rocketNoseGeometry,
            rocketEngineGeometry,
            rocketFinGeometry,
            rocketCanardGeometry,
            rocketSensorGeometry,
            planeGeometry,
            cannonStemGeometry,
            cannonBreechGeometry,
            cannonBarrelGeometry,
            cannonBarrelBandGeometry,
            cannonMuzzleGeometry,
            cannonFlashGeometry,
          );

          const stageEffectsEnabled = presentation === "stage";
          const scenePass = createCompatibleScenePass(
            nextRenderer,
            scene,
            nextCamera,
            presentation === "card" ? CARD_SSAA_LEVEL : STAGE_SSAA_LEVEL,
          );
          const bloomNode = bloom(
            scenePass,
            presentation === "card"
              ? CARD_BLOOM_STRENGTH
              : STAGE_BLOOM_STRENGTH,
            BLOOM_RADIUS,
            BLOOM_THRESHOLD,
          );
          const outputNode = renderOutput(
            rgbShift(
              stageEffectsEnabled ? scenePass.add(bloomNode) : scenePass,
              0,
              0,
            ),
            nextRenderer.toneMapping,
            nextRenderer.outputColorSpace,
          );
          postProcessing = new RenderPipeline(nextRenderer, outputNode);
          postProcessing.outputColorTransform = false;
          registerDisposables(disposables, scenePass, bloomNode);

          const updates: Array<(nowSec: number) => void> = [];
          const planetRadius = getPreviewPlanetRadius(
            options.itemId,
            presentation,
            tuning,
          );
          const sunRadius = getPreviewSunRadius(options.itemId, presentation);
          const focusScale = getPresentationScale(presentation);
          const terraVisuals = tuning.visuals.planets.archetypes.terra;
          const stageWorldUnitsPerPixel =
            presentation === "stage"
              ? getEditorPreviewStageWorldUnitsPerPixel({
                  itemId: options.itemId,
                  tuning,
                  viewportHeight: hostElement.clientHeight,
                })
              : null;
          const terraPlanetRadius = usesGameplayPlanetPreview(options.itemId)
            ? getEditorPreviewGameplayPlanetRadius(tuning)
            : planetRadius * terraVisuals.bodyScale;
          const overviewSunProfile = getSunVisualProfile(
            tuning.visuals.suns,
            0,
          );

          const playerCameraHalfHeight =
            presentation === "stage"
              ? getEditorPreviewPlayerCameraHalfHeight({
                  itemId: options.itemId,
                  tuning,
                })
              : null;

          if (playerCameraHalfHeight !== null) {
            requiredCameraHalfHeight = Math.max(
              requiredCameraHalfHeight,
              playerCameraHalfHeight,
            );
          }

          if (options.itemId === "overview") {
            const planet = createPreviewPlanet({
              hostScene: scene,
              planetGeometry: sphereGeometry,
              position: { x: -18 * focusScale, y: -6 * focusScale },
              radius: terraPlanetRadius * 0.96,
              ringGeometry,
              seed: 1,
              visuals: terraVisuals,
            });
            const sun = createPreviewSun({
              color: overviewSunProfile.color,
              coreBrightness: overviewSunProfile.coreBrightness,
              glowColor: overviewSunProfile.glowColor,
              glowScale: overviewSunProfile.glowScale,
              glowStrength: overviewSunProfile.glowBrightness,
              hostScene: scene,
              radius: sunRadius * 0.86,
              seed: DEFAULT_ORBIT_PRESET.suns[0]!.id,
              sunGeometry: sphereGeometry,
              warpGeometry,
              warpScale: overviewSunProfile.warpScale,
            });
            const rocket = createPreviewRocket({
              hostScene: scene,
              hostElement,
              itemId: "rocketLight",
              planeGeometry,
              presentation,
              rocketBodyGeometry,
              rocketCanardGeometry,
              rocketEngineGeometry,
              rocketFinGeometry,
              rocketNoseGeometry,
              rocketSensorGeometry,
            });
            registerDisposables(disposables, planet, sun, rocket);
            updates.push(
              (nowSec) => planet.update(nowSec),
              (nowSec) =>
                sun.update(nowSec, { x: 17 * focusScale, y: 11 * focusScale }),
              (nowSec) =>
                rocket.update(nowSec, {
                  x: 14 * focusScale,
                  y: -15 * focusScale,
                }),
            );
          }

          if (options.itemId === "background") {
            const previewCount = Math.min(
              tuning.gameplay.neutronStars.count,
              presentation === "stage" ? 4 : 2,
            );
            const previewRadiusScale = presentation === "stage" ? 0.12 : 0.085;
            const orbitRadius =
              (presentation === "stage" ? 28 : 16) * focusScale;
            const boundaryInnerRadius =
              orbitRadius * (presentation === "stage" ? 1.5 : 1.65);
            const boundaryOuterRadius =
              boundaryInnerRadius +
              (presentation === "stage" ? 7.5 : 4.2) * focusScale;
            const boundaryCameraPadding =
              (presentation === "stage" ? 10 : 5) * focusScale;
            requiredCameraHalfWidth = Math.max(
              requiredCameraHalfWidth,
              boundaryOuterRadius + boundaryCameraPadding,
            );
            requiredCameraHalfHeight = Math.max(
              requiredCameraHalfHeight,
              boundaryOuterRadius + boundaryCameraPadding,
            );
            const neutronStars = Array.from(
              { length: previewCount },
              (_, index) => {
                const alpha =
                  previewCount <= 1
                    ? 0.5
                    : index / Math.max(1, previewCount - 1);
                const mass = lerp(
                  tuning.gameplay.neutronStars.minMassKg,
                  tuning.gameplay.neutronStars.maxMassKg,
                  alpha,
                );
                const massAlpha = getNeutronStarMassAlpha(
                  mass,
                  tuning.gameplay.neutronStars,
                );
                const radius =
                  lerp(
                    tuning.gameplay.neutronStars.minSize,
                    tuning.gameplay.neutronStars.maxSize,
                    massAlpha,
                  ) *
                  previewRadiusScale *
                  focusScale;
                const angle =
                  (-0.95 + alpha * 1.9) * Math.PI * 0.42 +
                  (index % 2 === 0 ? 0 : 0.18);
                const distance = orbitRadius * (0.82 + alpha * 0.24);

                return {
                  position: {
                    x: Math.cos(angle) * distance,
                    y: Math.sin(angle) * distance * 0.68,
                  },
                  visualRadius: radius,
                  visual: createPreviewNeutronStar({
                    hostScene: scene,
                    jetGeometry: planeGeometry,
                    lensGeometry: circleGeometry,
                    massAlpha,
                    radius,
                    seed: 50_000 + index * 97,
                    sphereGeometry,
                    tuning: tuning.visuals.neutronStars,
                  }),
                };
              },
            );
            registerDisposables(
              disposables,
              ...neutronStars.map((entry) => entry.visual),
            );
            updates.push((nowSec) => {
              updateAmbientBoundaryDebrisVisual({
                innerRadius: boundaryInnerRadius,
                nowSec,
                neutronStarBodies: neutronStars.map((entry) => ({
                  pos: entry.position,
                  radius: entry.visualRadius,
                })),
                outerRadius: boundaryOuterRadius,
                visual: ambientBoundaryDebris,
              });
              for (const neutronStar of neutronStars) {
                neutronStar.visual.update(nowSec, neutronStar.position);
              }
            });
          }

          if (options.itemId === "neutronStars") {
            const previewCount = Math.max(
              1,
              tuning.gameplay.neutronStars.count,
            );
            const previewScale = presentation === "stage" ? 1 : 0.14;
            const previewArenaRadius = Math.max(
              presentation === "stage" ? 360 : 140,
              tuning.gameplay.neutronStars.maxSize *
                (presentation === "stage" ? 4.5 : 1.45) +
                previewCount * (presentation === "stage" ? 28 : 8),
            );
            let nextPreviewId = 1;
            const previewStars = createNeutronStars({
              arenaRadius: previewArenaRadius,
              createId: () => nextPreviewId++,
              rng: mulberry32(0x3b0d1e5),
              spec: {
                ...tuning.gameplay.neutronStars,
                count: previewCount,
              },
            });
            const previewCenter =
              previewStars.length === 0
                ? { x: 0, y: 0 }
                : previewStars.reduce(
                    (center, star) => ({
                      x: center.x + star.pos.x / previewStars.length,
                      y: center.y + star.pos.y / previewStars.length,
                    }),
                    { x: 0, y: 0 },
                  );
            const neutronStars = previewStars.map((star, index) => {
              const massAlpha = getNeutronStarMassAlpha(
                star.mass,
                tuning.gameplay.neutronStars,
              );
              const radius = star.radius * previewScale;
              const effectiveRadius = radius * (4.4 + massAlpha * 2.5);
              const position = {
                x: (star.pos.x - previewCenter.x) * previewScale,
                y: (star.pos.y - previewCenter.y) * previewScale,
              };

              requiredCameraHalfWidth = Math.max(
                requiredCameraHalfWidth,
                Math.abs(position.x) + effectiveRadius,
              );
              requiredCameraHalfHeight = Math.max(
                requiredCameraHalfHeight,
                Math.abs(position.y) + effectiveRadius,
              );

              return {
                phase: index * 0.37,
                position,
                visual: createPreviewNeutronStar({
                  hostScene: scene,
                  jetGeometry: planeGeometry,
                  lensGeometry: circleGeometry,
                  massAlpha,
                  radius,
                  seed: 80_000 + star.id * 137,
                  sphereGeometry,
                  tuning: tuning.visuals.neutronStars,
                }),
              };
            });
            const cameraPadding = presentation === "stage" ? 44 : 12;
            requiredCameraHalfWidth += cameraPadding;
            requiredCameraHalfHeight += cameraPadding;
            registerDisposables(
              disposables,
              ...neutronStars.map((entry) => entry.visual),
            );
            updates.push((nowSec) => {
              for (const neutronStar of neutronStars) {
                neutronStar.visual.update(
                  nowSec + neutronStar.phase,
                  neutronStar.position,
                );
              }
            });
          }

          if (options.itemId === "planets") {
            const stageLayout =
              presentation === "stage"
                ? createPlanetStagePreviewLayout(tuning)
                : null;
            if (stageLayout !== null) {
              requiredCameraHalfHeight = stageLayout.requiredHalfHeight;
              requiredCameraHalfWidth = stageLayout.requiredHalfWidth;
              stageLabelOverlay = createPlanetStagePreviewLabelOverlay({
                hostElement,
                entries: stageLayout.entries,
              });
              registerDisposables(disposables, stageLabelOverlay);
            }
            const planetEntries = ARCHETYPE_IDS.map((archetype, index) => {
              const visuals = tuning.visuals.planets.archetypes[archetype];
              const stageEntry = stageLayout?.entries[index] ?? null;
              const position =
                stageEntry?.position ??
                getPlanetGridPosition(
                  index,
                  ARCHETYPE_IDS.length,
                  PLANETS_CARD_HORIZONTAL_SPACING * focusScale,
                  PLANETS_CARD_VERTICAL_SPACING * focusScale,
                );
              const radius =
                stageEntry?.radius ??
                clamp(
                  planetRadius * visuals.bodyScale * PLANETS_CARD_RADIUS_SCALE,
                  PLANETS_CARD_MIN_RADIUS,
                  PLANETS_CARD_MAX_RADIUS,
                );
              const planet = createPreviewPlanet({
                hostScene: scene,
                planetGeometry: sphereGeometry,
                position,
                radius,
                ringGeometry,
                seed: index + 1,
                visuals,
              });
              registerDisposables(disposables, planet);
              return { planet, phase: index * 0.5 };
            });
            updates.push((nowSec) => {
              for (const entry of planetEntries) {
                entry.planet.update(nowSec + entry.phase);
              }
            });
          }

          if (options.itemId === "suns") {
            const stageLayout =
              presentation === "stage"
                ? createSunStagePreviewLayout(tuning, sunRadius)
                : null;
            if (stageLayout !== null) {
              requiredCameraHalfHeight = stageLayout.requiredHalfHeight;
              requiredCameraHalfWidth = stageLayout.requiredHalfWidth;
              stageLabelOverlay = createSunStagePreviewLabelOverlay({
                hostElement,
                entries: stageLayout.entries,
              });
              registerDisposables(disposables, stageLabelOverlay);
            }
            const sunEntries = tuning.visuals.suns.profiles.map(
              (profile, index) => {
                const stageEntry = stageLayout?.entries[index] ?? null;
                const position =
                  stageEntry?.position ??
                  getPlanetGridPosition(
                    index,
                    tuning.visuals.suns.profiles.length,
                    SUNS_CARD_HORIZONTAL_SPACING * focusScale,
                    SUNS_CARD_VERTICAL_SPACING * focusScale,
                  );
                const defaultSun =
                  DEFAULT_ORBIT_PRESET.suns[
                    index % DEFAULT_ORBIT_PRESET.suns.length
                  ]!;
                const radius =
                  stageEntry?.radius ??
                  clamp(
                    sunRadius *
                      (tuning.gameplay.orbits.suns[index]!.radius /
                        Math.max(defaultSun.radius, 1)) *
                      SUNS_CARD_RADIUS_SCALE,
                    SUNS_CARD_MIN_RADIUS,
                    SUNS_CARD_MAX_RADIUS,
                  );
                const sunSeed =
                  DEFAULT_ORBIT_PRESET.suns[
                    index % DEFAULT_ORBIT_PRESET.suns.length
                  ]!;
                const sun = createPreviewSun({
                  color: profile.color,
                  coreBrightness: profile.coreBrightness,
                  glowColor: profile.glowColor,
                  glowScale: profile.glowScale,
                  glowStrength: profile.glowBrightness,
                  hostScene: scene,
                  radius,
                  seed: sunSeed.id,
                  sunGeometry: sphereGeometry,
                  warpGeometry,
                  warpScale: profile.warpScale,
                });
                registerDisposables(disposables, sun);
                return {
                  phase: index * 0.43,
                  position,
                  sun,
                };
              },
            );
            updates.push((nowSec) => {
              for (const entry of sunEntries) {
                entry.sun.update(nowSec + entry.phase, entry.position);
              }
            });
          }

          if (options.itemId === "cache") {
            const stageLayout =
              presentation === "stage"
                ? createCacheStagePreviewLayout(tuning)
                : null;
            if (stageLayout !== null) {
              requiredCameraHalfHeight = Math.max(
                requiredCameraHalfHeight,
                stageLayout.requiredHalfHeight,
              );
              requiredCameraHalfWidth = Math.max(
                requiredCameraHalfWidth,
                stageLayout.requiredHalfWidth,
              );
            }
            const cacheEntries = stageLayout?.entries.map((entry, index) => {
              const cache = createPreviewCache({
                hostElement,
                hostScene: scene,
                iconKey: entry.iconKey,
                presentation,
              });
              registerDisposables(disposables, cache);
              return {
                cache,
                phase: index * 0.37,
                position: entry.position,
              };
            }) ?? [
              {
                cache: createPreviewCache({
                  hostElement,
                  hostScene: scene,
                  presentation,
                }),
                phase: 0,
                position: { x: 0, y: 0 } satisfies Vec2,
              },
            ];
            if (stageLayout === null) {
              registerDisposables(disposables, cacheEntries[0]!.cache);
            }
            updates.push((nowSec) => {
              for (const entry of cacheEntries) {
                entry.cache.update(nowSec + entry.phase, entry.position);
              }
            });
          }

          const rocketKind = getRocketKindFromItemId(options.itemId);
          if (rocketKind !== null) {
            const rocket = createPreviewRocket({
              hostScene: scene,
              hostElement,
              itemId: options.itemId,
              planeGeometry,
              presentation,
              rocketBodyGeometry,
              rocketCanardGeometry,
              rocketEngineGeometry,
              rocketFinGeometry,
              rocketNoseGeometry,
              rocketSensorGeometry,
            });
            registerDisposables(disposables, rocket);
            updates.push((nowSec) => rocket.update(nowSec, { x: 0, y: 0 }));
          }

          if (options.itemId === "hud") {
            const leftMaterial = createHudPanelMaterial(
              tuning.visuals.rockets.light.hudAccent,
              0.22,
            );
            const centerMaterial = createHudPanelMaterial(
              tuning.visuals.abilities.boostColor,
              0.18,
            );
            const rightMaterial = createHudPanelMaterial(
              tuning.visuals.abilities.shieldColor,
              0.2,
            );
            const panelGeometry = new PlaneGeometry(1, 1);
            const leftPanel = new Mesh(panelGeometry, leftMaterial);
            const centerPanel = new Mesh(panelGeometry, centerMaterial);
            const rightPanel = new Mesh(panelGeometry, rightMaterial);
            leftPanel.renderOrder = 4;
            centerPanel.renderOrder = 5;
            rightPanel.renderOrder = 6;
            scene.add(leftPanel, centerPanel, rightPanel);
            registerDisposables(
              disposables,
              panelGeometry,
              leftMaterial,
              centerMaterial,
              rightMaterial,
            );
            updates.push((nowSec) => {
              const pulse = 1 + Math.sin(nowSec * 2.8) * 0.04;
              leftPanel.position.set(-22 * focusScale, -4 * focusScale, 0.8);
              leftPanel.scale.set(26 * focusScale, 12 * focusScale, 1);
              leftPanel.rotation.z = -0.04;
              leftMaterial.opacity = 0.2 + Math.sin(nowSec * 1.8) * 0.02;

              centerPanel.position.set(0, 13 * focusScale, 0.7);
              centerPanel.scale.set(24 * focusScale, 8 * focusScale * pulse, 1);
              centerMaterial.opacity = 0.16 + Math.sin(nowSec * 2.2) * 0.02;

              rightPanel.position.set(21 * focusScale, -8 * focusScale, 0.9);
              rightPanel.scale.set(18 * focusScale, 10 * focusScale, 1);
              rightPanel.rotation.z = 0.06;
              rightMaterial.opacity = 0.18 + Math.cos(nowSec * 2.1) * 0.025;
            });
          }

          if (options.itemId === "blackHole") {
            const blackHoleRadiusTarget =
              presentation === "card"
                ? BLACK_HOLE_CARD_RADIUS
                : BLACK_HOLE_STAGE_RADIUS;
            const blackHoleScale =
              blackHoleRadiusTarget /
              Math.max(tuning.visuals.blackHole.coreRadius, 1);
            const blackHoleGroup = new Group();
            blackHoleGroup.position.set(0, 0, 4);
            const lens = new Mesh(
              circleGeometry,
              createBlackHoleLensMaterial(),
            );
            const ring = new Mesh(
              new RingGeometry(0.42, 1, 96),
              createBlackHoleRingMaterial(),
            );
            const core = new Mesh(
              circleGeometry,
              createBlackHoleCoreMaterial(),
            );
            lens.scale.set(
              tuning.visuals.blackHole.lensRadius * blackHoleScale,
              tuning.visuals.blackHole.lensRadius * blackHoleScale,
              1,
            );
            ring.scale.set(
              tuning.visuals.blackHole.ringRadius * blackHoleScale,
              tuning.visuals.blackHole.ringRadius * blackHoleScale,
              1,
            );
            core.scale.set(
              tuning.visuals.blackHole.coreRadius * blackHoleScale,
              tuning.visuals.blackHole.coreRadius * blackHoleScale,
              1,
            );
            lens.position.z = -2;
            lens.renderOrder = 4;
            ring.renderOrder = 5;
            core.renderOrder = 6;
            blackHoleGroup.add(lens, ring, core);
            scene.add(blackHoleGroup);
            registerDisposables(
              disposables,
              lens.geometry,
              lens.material as { dispose: () => void },
              ring.geometry,
              ring.material as { dispose: () => void },
              core.geometry,
              core.material as { dispose: () => void },
            );
            updates.push((nowSec) => {
              ring.rotation.z = nowSec * 0.16;
              lens.rotation.z = nowSec * -0.08;
            });
          }

          if (options.itemId === "cannon") {
            const planet = createPreviewPlanet({
              hostScene: scene,
              planetGeometry: sphereGeometry,
              position: { x: -24 * focusScale, y: -8 * focusScale },
              radius: terraPlanetRadius,
              ringGeometry,
              seed: 1,
              visuals: terraVisuals,
            });
            registerDisposables(disposables, planet);

            const metalMaterial = new MeshBasicNodeMaterial();
            metalMaterial.colorNode = color("#7a8aa2").mul(0.78);
            const accentMaterial = new MeshBasicNodeMaterial();
            accentMaterial.colorNode = color(
              tuning.visuals.rockets.light.hudAccent,
            ).mul(0.95);
            const flashMaterial = new MeshBasicMaterial({
              color: tuning.visuals.rockets.light.hudAccent,
              depthWrite: false,
              transparent: true,
              opacity: 0,
              blending: AdditiveBlending,
            });
            const stemMesh = new Mesh(cannonStemGeometry, metalMaterial);
            const breechMesh = new Mesh(cannonBreechGeometry, metalMaterial);
            const barrelMesh = new Mesh(cannonBarrelGeometry, metalMaterial);
            const bandMesh = new Mesh(cannonBarrelBandGeometry, accentMaterial);
            const muzzleMesh = new Mesh(cannonMuzzleGeometry, accentMaterial);
            const flashMesh = new Mesh(cannonFlashGeometry, flashMaterial);
            const cannonGroup = new Group();
            cannonGroup.position.set(-24 * focusScale, -8 * focusScale, 6);
            cannonGroup.rotation.z = 0.22;
            cannonGroup.add(
              stemMesh,
              breechMesh,
              barrelMesh,
              bandMesh,
              muzzleMesh,
              flashMesh,
            );
            scene.add(cannonGroup);
            registerDisposables(
              disposables,
              metalMaterial,
              accentMaterial,
              flashMaterial,
            );
            const stemStart = terraPlanetRadius;
            updates.push((nowSec) => {
              const layout = getCannonWorldLayout(
                tuning.visuals.cannon,
                presentation === "card"
                  ? 0.38 * focusScale
                  : (stageWorldUnitsPerPixel ?? 1),
              );
              const breechStart = stemStart + layout.stemLenWorld;
              const barrelStart = breechStart + layout.breechLenWorld;
              const barrelEnd = barrelStart + layout.barrelLenWorld;
              planet.update(nowSec);
              stemMesh.position.set(
                stemStart + layout.stemLenWorld * 0.5,
                0,
                0,
              );
              stemMesh.scale.set(
                layout.stemLenWorld,
                layout.stemRadiusWorld,
                layout.stemRadiusWorld,
              );
              breechMesh.position.set(
                breechStart + layout.breechLenWorld * 0.5,
                0,
                0,
              );
              breechMesh.scale.set(
                layout.breechLenWorld,
                layout.breechWidthWorld,
                layout.breechDepthWorld,
              );
              barrelMesh.position.set(
                barrelStart + layout.barrelLenWorld * 0.5,
                0,
                0,
              );
              barrelMesh.scale.set(
                layout.barrelLenWorld,
                layout.barrelRadiusWorld,
                layout.barrelRadiusWorld,
              );
              bandMesh.position.set(
                barrelStart + layout.barrelLenWorld * CANNON_BAND_POSITION,
                0,
                0,
              );
              bandMesh.scale.set(
                layout.bandLenWorld,
                layout.bandRadiusWorld,
                layout.bandRadiusWorld,
              );
              muzzleMesh.position.set(
                barrelEnd - layout.muzzleLenWorld * 0.5,
                0,
                0,
              );
              muzzleMesh.scale.set(
                layout.muzzleLenWorld,
                layout.muzzleRadiusWorld,
                layout.muzzleRadiusWorld,
              );
              const pulse = (Math.sin(nowSec * 6.4) + 1) * 0.5;
              flashMaterial.opacity = 0.2 + pulse * 0.42;
              flashMesh.position.set(
                barrelEnd + layout.muzzleRadiusWorld * 0.4,
                0,
                0,
              );
              const flashRadius =
                layout.flashRadiusWorld * (0.74 + pulse * 0.36);
              flashMesh.scale.set(flashRadius, flashRadius, flashRadius);
            });
          }

          if (options.itemId === "shield") {
            const planet = createPreviewPlanet({
              hostScene: scene,
              planetGeometry: sphereGeometry,
              position: { x: 0, y: 0 },
              radius: terraPlanetRadius,
              ringGeometry,
              seed: 1,
              visuals: terraVisuals,
            });
            registerDisposables(disposables, planet);
            const {
              shieldArcMaterial,
              shieldArcMesh,
              shieldArcOpacityUniform,
              shieldPanelMaterial,
              shieldPanelMesh,
              shieldPanelOpacityUniform,
              shieldCrestMaterial,
              shieldCrestMesh,
              shieldCrestOpacityUniform,
              shieldGlowMaterial,
              shieldGlowMesh,
              shieldGlowOpacityUniform,
              shieldGroup,
            } = createShieldVisual({
              arcDeg: tuning.gameplay.abilities.shield.arcDeg,
              shieldColor: tuning.visuals.abilities.shieldColor,
            });
            scene.add(shieldGroup);
            registerDisposables(
              disposables,
              shieldGlowMesh.geometry,
              shieldArcMesh.geometry,
              shieldPanelMesh.geometry,
              shieldCrestMesh.geometry,
              shieldGlowMaterial,
              shieldArcMaterial,
              shieldPanelMaterial,
              shieldCrestMaterial,
            );
            updates.push((nowSec) => {
              planet.update(nowSec);
              const pulse = 1 + Math.sin(nowSec * 8.2) * 0.035;
              shieldGroup.scale.set(
                terraPlanetRadius * pulse,
                terraPlanetRadius * pulse,
                1,
              );
              shieldGroup.rotation.z = Math.sin(nowSec * 0.7) * 0.22;
              shieldGlowOpacityUniform.value =
                0.14 + Math.sin(nowSec * 9.4) * 0.03;
              shieldArcOpacityUniform.value =
                0.4 + Math.sin(nowSec * 7.6) * 0.05;
              shieldPanelOpacityUniform.value =
                0.5 + Math.sin(nowSec * 9.8) * 0.06;
              shieldCrestOpacityUniform.value =
                0.46 + Math.sin(nowSec * 10.6) * 0.06;
            });
          }

          if (options.itemId === "boost") {
            const planet = createPreviewPlanet({
              hostScene: scene,
              planetGeometry: sphereGeometry,
              position: { x: 0, y: 0 },
              radius: terraPlanetRadius,
              ringGeometry,
              seed: 1,
              visuals: terraVisuals,
            });
            registerDisposables(disposables, planet);
            const wake = createBoostWakeMaterial();
            const wakeGeometry = new PlaneGeometry(1, 1);
            wakeGeometry.translate(0.5, 0, 0);
            const wakeMesh = new Mesh(wakeGeometry, wake.material);
            wakeMesh.frustumCulled = false;
            wakeMesh.renderOrder = 12;
            wakeMesh.position.z = 2.2;
            scene.add(wakeMesh);
            const burstGeometry = new BufferGeometry();
            const burstPositions = new Float32Array(18 * 3);
            const burstOpacity = new Float32Array(18);
            for (let index = 0; index < 18; index += 1) {
              const angle = -0.35 + ((index % 6) - 2.5) * 0.11;
              const row = Math.floor(index / 6);
              const distance = 0.25 + row * 0.18 + (index % 2) * 0.04;
              const offset = index * 3;
              burstPositions[offset] = -distance;
              burstPositions[offset + 1] = Math.sin(angle) * 0.22;
              burstPositions[offset + 2] = 0;
              burstOpacity[index] = 0.35 + row * 0.18;
            }
            burstGeometry.setAttribute(
              "position",
              new Float32BufferAttribute(burstPositions, 3),
            );
            burstGeometry.setAttribute(
              "previewOpacity",
              new Float32BufferAttribute(burstOpacity, 1),
            );
            const burstMaterial = createBoostBurstMaterial(
              tuning.visuals.abilities.boostColor,
            );
            const burstPoints = new Points(
              burstGeometry,
              burstMaterial.material,
            );
            burstPoints.frustumCulled = false;
            burstPoints.renderOrder = 13;
            burstPoints.position.z = 2.3;
            scene.add(burstPoints);
            registerDisposables(
              disposables,
              wakeGeometry,
              wake.material,
              ...(wake.texture === null ? [] : [wake.texture]),
              burstGeometry,
              burstMaterial.material,
            );
            updates.push((nowSec) => {
              planet.update(nowSec);
              const cycleTimeSec = nowSec % BOOST_PREVIEW_CYCLE_SEC;
              const burstActive = cycleTimeSec < BOOST_PREVIEW_ACTIVE_SEC;
              const burstProgress = burstActive
                ? clamp(cycleTimeSec / BOOST_PREVIEW_ACTIVE_SEC, 0, 1)
                : 1;
              const burstAlpha = burstActive ? 1 - burstProgress : 0;
              const wakeLength =
                terraPlanetRadius * lerp(2.3, 4.9, burstProgress);
              const wakeWidth =
                terraPlanetRadius * lerp(1.5, 0.82, burstProgress);
              const wakeOffset =
                terraPlanetRadius * lerp(0.46, 0.72, burstProgress);
              const particleScale =
                terraPlanetRadius * lerp(0.9, 1.45, burstProgress);
              wakeMesh.visible = burstActive;
              burstPoints.visible = burstActive;
              burstMaterial.opacityUniform.value = burstAlpha;
              wake.material.opacity = burstAlpha * lerp(1, 0.44, burstProgress);
              wakeMesh.position.set(-wakeOffset, 0, 2.2);
              wakeMesh.scale.set(wakeLength, wakeWidth, 1);
              wakeMesh.rotation.z = Math.PI;
              burstPoints.position.set(-terraPlanetRadius * 0.38, 0, 2.3);
              burstPoints.scale.set(particleScale, particleScale, 1);
            });
          }

          if (options.itemId === "gravityPulse") {
            const planet = createPreviewPlanet({
              hostScene: scene,
              planetGeometry: sphereGeometry,
              position: { x: 0, y: 0 },
              radius: terraPlanetRadius,
              ringGeometry,
              seed: 1,
              visuals: terraVisuals,
            });
            registerDisposables(disposables, planet);
            const wildcardColor = tuning.visuals.abilities.wildcardColor;
            const gravityPulseRadius =
              tuning.gameplay.abilities.gravityPulse.radius;
            const pulseCoreGeometry = new CircleGeometry(1, 64);
            const pulseCoreMaterial = new MeshBasicMaterial({
              blending: AdditiveBlending,
              color: tintColor(wildcardColor, 0.08, 0.18, 0.04),
              depthWrite: false,
              opacity: 0.2,
              transparent: true,
            });
            const pulseCoreMesh = new Mesh(
              pulseCoreGeometry,
              pulseCoreMaterial,
            );
            pulseCoreMesh.position.z = 1.95;
            scene.add(pulseCoreMesh);
            const pulseRingGeometry = new RingGeometry(0.9, 1, 96);
            const pulseRingMaterial = new MeshBasicMaterial({
              blending: AdditiveBlending,
              color: wildcardColor,
              depthWrite: false,
              opacity: 0,
              transparent: true,
            });
            const pulseRingMesh = new Mesh(
              pulseRingGeometry,
              pulseRingMaterial,
            );
            pulseRingMesh.position.z = 2.08;
            scene.add(pulseRingMesh);
            const pulseEchoMaterial = new MeshBasicMaterial({
              blending: AdditiveBlending,
              color: tintColor(wildcardColor, -0.04, 0.08, 0.08),
              depthWrite: false,
              opacity: 0,
              transparent: true,
            });
            const pulseEchoMesh = new Mesh(
              pulseRingGeometry,
              pulseEchoMaterial,
            );
            pulseEchoMesh.position.z = 2.04;
            scene.add(pulseEchoMesh);
            const helperRingGeometry =
              presentation === "stage" ? new RingGeometry(0.992, 1, 160) : null;
            const helperRingMaterial =
              helperRingGeometry === null
                ? null
                : new MeshBasicMaterial({
                    color: tintColor(wildcardColor, -0.03, 0.02, 0.18),
                    depthWrite: false,
                    opacity: 0.18,
                    transparent: true,
                  });
            const helperRingMesh =
              helperRingGeometry === null || helperRingMaterial === null
                ? null
                : new Mesh(helperRingGeometry, helperRingMaterial);
            if (helperRingMesh !== null) {
              helperRingMesh.position.z = 1.72;
              scene.add(helperRingMesh);
              requiredCameraHalfHeight = Math.max(
                requiredCameraHalfHeight,
                gravityPulseRadius * 1.12,
              );
              requiredCameraHalfWidth = Math.max(
                requiredCameraHalfWidth,
                gravityPulseRadius * 1.12,
              );
            }
            registerDisposables(
              disposables,
              pulseCoreGeometry,
              pulseCoreMaterial,
              pulseRingGeometry,
              pulseRingMaterial,
              pulseEchoMaterial,
              ...(helperRingGeometry === null || helperRingMaterial === null
                ? []
                : [helperRingGeometry, helperRingMaterial]),
            );
            updates.push((nowSec) => {
              planet.update(nowSec);
              const cycleSec = nowSec % GRAVITY_PULSE_PREVIEW_CYCLE_SEC;
              const primaryProgress = clamp(
                cycleSec / GRAVITY_PULSE_PREVIEW_CYCLE_SEC,
                0,
                1,
              );
              const echoProgress = clamp(
                ((cycleSec + GRAVITY_PULSE_PREVIEW_CYCLE_SEC * 0.38) %
                  GRAVITY_PULSE_PREVIEW_CYCLE_SEC) /
                  GRAVITY_PULSE_PREVIEW_CYCLE_SEC,
                0,
                1,
              );
              const corePulse = 0.5 + Math.sin(nowSec * 7.4) * 0.5;
              const primaryScale =
                presentation === "stage"
                  ? lerp(
                      terraPlanetRadius * 1.1,
                      gravityPulseRadius,
                      primaryProgress,
                    )
                  : terraPlanetRadius * lerp(1.1, 4.9, primaryProgress);
              const echoScale =
                presentation === "stage"
                  ? lerp(
                      terraPlanetRadius * 1.3,
                      gravityPulseRadius * 0.84,
                      echoProgress,
                    )
                  : terraPlanetRadius * lerp(1.3, 4.2, echoProgress);
              pulseCoreMesh.scale.set(
                terraPlanetRadius * lerp(1.04, 1.34, corePulse),
                terraPlanetRadius * lerp(1.04, 1.34, corePulse),
                1,
              );
              pulseCoreMaterial.opacity = 0.12 + corePulse * 0.12;
              pulseRingMesh.scale.set(primaryScale, primaryScale, 1);
              pulseRingMaterial.opacity = (1 - primaryProgress) ** 1.6 * 0.72;
              pulseEchoMesh.scale.set(echoScale, echoScale, 1);
              pulseEchoMaterial.opacity = (1 - echoProgress) ** 1.8 * 0.4;
              if (helperRingMesh !== null) {
                helperRingMesh.scale.set(
                  gravityPulseRadius,
                  gravityPulseRadius,
                  1,
                );
              }
            });
          }

          resizeViewport();
          window.addEventListener("resize", resizeViewport);

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
              const nowSec = performance.now() * 0.001;
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
              for (const update of updates) {
                update(nowSec);
              }
              postProcessing?.render();
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
