import {
  ARCHETYPES,
  ARCHETYPE_IDS,
  clamp,
  predictPath,
  type PlanetArchetypeVisualSpec,
  type RocketKind,
} from "@3body/shared";
import type { Sun, Vec2 } from "@3body/shared";
import {
  attribute,
  color,
  float,
  length,
  renderOutput,
  smoothstep,
  vec2,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { rgbShift } from "three/addons/tsl/display/RGBShiftNode.js";
import {
  AdditiveBlending,
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
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
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  WebGPURenderer,
} from "three/webgpu";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import { ROCKET_MESH_SILHOUETTES } from "./rocketMeshSilhouette";
import { getCannonWorldLayout } from "./rocketVisibility";
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
  tintColor,
  createWarpMaterial,
  wrapCentered,
} from "./showcaseVisuals";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import {
  createBlackHoleCoreMaterial,
  createBlackHoleLensMaterial,
  createBlackHoleRingMaterial,
  createBoostWakeMaterial,
  createForesightVisual,
} from "./viewport/localViewportVisualFactories";
import { createCompatibleScenePass } from "./viewport/postProcessingCompat";
import {
  clipForesightPathAtDistance,
  FORESIGHT_STEP_SEC,
  FORESIGHT_WINDOW_SEC,
  getForesightPointOpacity,
} from "./viewport/foresightShared";
import {
  disposeViewportRendererSession,
  initializeViewportRendererSession,
  reportViewportRendererFailure,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";

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
const CANNON_STAGE_PLANET_RADIUS = 38;
const ABILITY_STAGE_PLANET_RADIUS = 34;
const SUN_CARD_RADIUS = 10;
const SUN_STAGE_RADIUS = 74;
const SUNS_STAGE_RADIUS = 52;
const SHIELD_INNER_SCALE = 1.22;
const SHIELD_OUTER_SCALE = 1.7;
const SHIELD_GLOW_OUTER_SCALE = 2.06;
const CANNON_BAND_POSITION = 0.32;
const PLANETS_STAGE_GRID_COLUMNS = 4;
const PLANETS_STAGE_HORIZONTAL_SPACING = 104;
const PLANETS_STAGE_VERTICAL_SPACING = 96;
const PLANETS_STAGE_MIN_RADIUS = 18;
const PLANETS_STAGE_MAX_RADIUS = 24;
const PLANETS_STAGE_RADIUS_SCALE = 0.36;
const PLANETS_CARD_HORIZONTAL_SPACING = 12;
const PLANETS_CARD_VERTICAL_SPACING = 11;
const PLANETS_CARD_MIN_RADIUS = 5.5;
const PLANETS_CARD_MAX_RADIUS = 7.2;
const PLANETS_CARD_RADIUS_SCALE = 0.28;
const PLANET_LABEL_TEXTURE_HEIGHT = 96;
const PLANET_LABEL_FONT_SIZE = 34;
const PLANET_LABEL_HORIZONTAL_PADDING = 28;
const PLANET_LABEL_WORLD_HEIGHT = 13;
const PLANET_LABEL_WORLD_GAP = 8;
const CANNON_STAGE_WORLD_UNITS_PER_PIXEL = 1.02;
const FORESIGHT_CARD_SPAN = 40;
const FORESIGHT_STAGE_SPAN = 180;
const ROCKET_CARD_SCALE = 0.34;
const ROCKET_STAGE_SCALE = 1.3;
export type EditorPreviewViewportItemId =
  | "overview"
  | "hud"
  | "background"
  | "planets"
  | "suns"
  | "blackHole"
  | "cannon"
  | "rocketLight"
  | "rocketHeavy"
  | "rocketSeeker"
  | "foresight"
  | "shield"
  | "boost"
  | "cache";

export interface EditorItemPreviewViewportOptions {
  itemId: EditorPreviewViewportItemId;
  presentation?: "card" | "stage";
}

const registerDisposables = (
  disposables: Array<{ dispose: () => void }>,
  ...items: Array<{ dispose: () => void }>
) => {
  disposables.push(...items);
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
      case "blackHole":
        return 52;
      default:
        return 42;
    }
  }

  switch (itemId) {
    case "blackHole":
      return 220;
    case "planets":
      return 175;
    case "suns":
      return 168;
    case "cannon":
      return 185;
    case "foresight":
    case "shield":
    case "boost":
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
) => {
  const targetRadius =
    presentation === "card"
      ? PLANET_CARD_RADIUS
      : itemId === "planets"
        ? PLANETS_STAGE_RADIUS
        : itemId === "cannon"
          ? CANNON_STAGE_PLANET_RADIUS
          : itemId === "foresight" || itemId === "shield" || itemId === "boost"
            ? ABILITY_STAGE_PLANET_RADIUS
            : PLANET_STAGE_RADIUS;
  return targetRadius * (itemId === "cannon" ? 1.04 : 1);
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

const traceRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + clampedRadius, y);
  context.lineTo(x + width - clampedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  context.lineTo(x + width, y + height - clampedRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - clampedRadius,
    y + height,
  );
  context.lineTo(x + clampedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  context.lineTo(x, y + clampedRadius);
  context.quadraticCurveTo(x, y, x + clampedRadius, y);
  context.closePath();
};

const createPlanetNameLabelTexture = (
  document: Document,
  label: string,
  accent: string,
): {
  aspect: number;
  texture: CanvasTexture;
} => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2D canvas context unavailable.");
  }

  context.font = `700 ${PLANET_LABEL_FONT_SIZE}px "IBM Plex Sans", sans-serif`;
  const measuredWidth = Math.ceil(context.measureText(label).width);
  canvas.width = Math.max(
    192,
    Math.ceil(measuredWidth + PLANET_LABEL_HORIZONTAL_PADDING * 2),
  );
  canvas.height = PLANET_LABEL_TEXTURE_HEIGHT;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `700 ${PLANET_LABEL_FONT_SIZE}px "IBM Plex Sans", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  traceRoundedRect(context, 4, 6, canvas.width - 8, canvas.height - 12, 26);
  context.fillStyle = "rgba(5, 10, 18, 0.84)";
  context.shadowColor = accent;
  context.shadowBlur = 18;
  context.fill();
  context.shadowBlur = 0;

  traceRoundedRect(context, 4, 6, canvas.width - 8, canvas.height - 12, 26);
  context.lineWidth = 3;
  context.strokeStyle = accent;
  context.globalAlpha = 0.72;
  context.stroke();
  context.globalAlpha = 1;

  context.fillStyle = "#f8fbff";
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return {
    aspect: canvas.width / canvas.height,
    texture,
  };
};

const createPreviewPlanetLabel = ({
  accent,
  document,
  hostScene,
  label,
  position,
  radius,
}: {
  accent: string;
  document: Document;
  hostScene: Scene;
  label: string;
  position: Vec2;
  radius: number;
}) => {
  const { aspect, texture: map } = createPlanetNameLabelTexture(
    document,
    label,
    accent,
  );
  const material = new SpriteMaterial({
    alphaTest: 0.02,
    color: "#ffffff",
    depthWrite: false,
    map,
    transparent: true,
  });
  const sprite = new Sprite(material);
  sprite.center.set(0.5, 0);
  sprite.position.set(
    position.x,
    position.y + radius + PLANET_LABEL_WORLD_GAP,
    3.2,
  );
  sprite.renderOrder = 14;
  sprite.scale.set(
    PLANET_LABEL_WORLD_HEIGHT * aspect,
    PLANET_LABEL_WORLD_HEIGHT,
    1,
  );
  hostScene.add(sprite);

  return {
    dispose: () => {
      map.dispose();
      material.dispose();
    },
  };
};

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
    update(nowSec: number) {
      mesh.rotation.y = nowSec * 0.22 + seed * 0.7;
      mesh.rotation.x = Math.sin(nowSec * 0.17 + seed) * 0.08;
    },
  };
};

const createPreviewSun = ({
  color,
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
  const coreMaterial = createSunCoreMaterial(color, glowColor, seed, 1);
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

const createPreviewRocket = ({
  hostScene,
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
  const profile = tuning.visuals.rockets[rocketKind];
  const silhouette = ROCKET_MESH_SILHOUETTES[rocketKind];
  const scale =
    presentation === "card" ? ROCKET_CARD_SCALE : ROCKET_STAGE_SCALE;
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
      const length = profile.bodyScale.x * scale;
      const radius = profile.bodyScale.y * scale;
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
      trailMesh.scale.set(
        profile.trailScale.x * scale,
        profile.trailScale.y * scale * 0.84,
        1,
      );
      flameMesh.position.set(-length * silhouette.flameOffset, 0, 0.24);
      flameMesh.scale.set(
        profile.flameScale.x * scale * flicker,
        profile.flameScale.y * scale * flicker * 0.9,
        1,
      );
    },
  };
};

const createPreviewCache = ({
  hostElement,
  hostScene,
  presentation,
}: {
  hostElement: HTMLDivElement;
  hostScene: Scene;
  presentation: "card" | "stage";
}) => {
  const tuning = getRuntimeTuningDocument();
  const iconKey = CACHE_ICON_KEYS[5]!;
  const { map, material } = createCacheBadgeSpriteMaterial(
    hostElement.ownerDocument,
    iconKey,
  );
  const sprite = new Sprite(material);
  sprite.renderOrder = 7;
  hostScene.add(sprite);
  const baseScale =
    tuning.visuals.caches.badgeBaseSize *
    tuning.visuals.caches.badgeScale *
    (presentation === "card" ? 0.22 : 0.95);

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
  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.colorNode = color(colorHex);
  material.opacityNode = attribute("previewOpacity", "float");
  material.size = 10;
  material.alphaTest = 0.01;
  return material;
};

const createPreviewForesightPath = (targetSpan: number): readonly Vec2[] => {
  const sourcePlanet = DEFAULT_ORBIT_PRESET.planets[0]!;
  const sourceSuns: Sun[] = DEFAULT_ORBIT_PRESET.suns.map((sun) => ({
    ...sun,
    kind: "sun",
  }));
  const steps = Math.ceil(FORESIGHT_WINDOW_SEC / FORESIGHT_STEP_SEC);
  const worldPath = predictPath(
    sourcePlanet.pos,
    sourcePlanet.vel,
    sourceSuns,
    steps,
    FORESIGHT_STEP_SEC,
  );
  const start = worldPath[0]!;
  const minX = Math.min(...worldPath.map((point) => point.x));
  const maxX = Math.max(...worldPath.map((point) => point.x));
  const minY = Math.min(...worldPath.map((point) => point.y));
  const maxY = Math.max(...worldPath.map((point) => point.y));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const scale = targetSpan / span;

  return worldPath.map((point) => ({
    x: (point.x - start.x) * scale,
    y: (point.y - start.y) * scale,
  }));
};

const updatePreviewForesightVisual = (
  foresightVisual: ReturnType<typeof createForesightVisual>,
  pathPoints: readonly Vec2[],
) => {
  const tuning = getRuntimeTuningDocument().visuals.abilities.foresight;
  foresightVisual.lineMaterial.color.set(tuning.lineColor);
  foresightVisual.lineMaterial.opacity = tuning.lineOpacity;
  foresightVisual.pointColorUniform.value.set(tuning.dotColor);
  foresightVisual.pointOpacityUniform.value = tuning.dotOpacity;
  foresightVisual.pointMaterial.size = tuning.pointSize;

  const lineArray = foresightVisual.linePositionAttribute.array as Float32Array;
  const pointArray = foresightVisual.pointPositionAttribute
    .array as Float32Array;
  const opacityArray = foresightVisual.pointOpacityAttribute
    .array as Float32Array;
  const pointCount = Math.min(
    pathPoints.length,
    foresightVisual.pointPositionAttribute.count,
  );
  let visiblePointCount = 0;

  for (let index = 0; index < pointCount; index += 1) {
    const point = pathPoints[index]!;
    const offset = index * 3;
    const opacity = getForesightPointOpacity({
      index,
      pointCount,
      tuning,
    });
    lineArray[offset] = point.x;
    lineArray[offset + 1] = point.y;
    lineArray[offset + 2] = 0;
    pointArray[offset] = point.x;
    pointArray[offset + 1] = point.y;
    pointArray[offset + 2] = 0;
    opacityArray[index] = opacity;
    if (opacity > 0.01) {
      visiblePointCount += 1;
    }
  }

  foresightVisual.lineGeometry.setDrawRange(
    0,
    tuning.showLine ? pointCount : 0,
  );
  foresightVisual.pointGeometry.setDrawRange(0, pointCount);
  foresightVisual.linePositionAttribute.needsUpdate = true;
  foresightVisual.pointPositionAttribute.needsUpdate = true;
  foresightVisual.pointOpacityAttribute.needsUpdate = true;
  foresightVisual.line.visible =
    tuning.showLine && tuning.lineOpacity > 0.01 && pointCount > 1;
  foresightVisual.points.visible =
    tuning.showDots &&
    tuning.dotOpacity > 0.01 &&
    pointCount > 0 &&
    visiblePointCount > 0;
};

export function createEditorItemPreviewViewport(
  hostElement: HTMLDivElement,
  options: EditorItemPreviewViewportOptions,
): () => void {
  const presentation = options.presentation ?? "card";
  let disposed = false;
  let renderer: WebGPURenderer | null = null;
  let rendererBootstrap: ViewportRendererBootstrap | null = null;
  let animationLoopController: ReturnType<
    typeof createViewportAnimationLoopController
  > | null = null;
  let camera: OrthographicCamera | null = null;
  let backdropMesh: Mesh | null = null;
  let postProcessing: RenderPipeline | null = null;
  const disposables: Array<{ dispose: () => void }> = [];
  let cleanupComplete = false;
  let rendererSessionToken = 0;

  const resizeViewport = () => {
    if (renderer === null || camera === null) {
      return;
    }

    const maxPixelRatio =
      presentation === "card" ? CARD_MAX_PIXEL_RATIO : STAGE_MAX_PIXEL_RATIO;
    renderer.setPixelRatio(
      Math.min(
        hostElement.ownerDocument.defaultView?.devicePixelRatio || 1,
        maxPixelRatio,
      ),
    );
    renderer.setSize(
      Math.max(1, hostElement.clientWidth),
      Math.max(1, hostElement.clientHeight),
      false,
    );
    const aspect =
      Math.max(1, hostElement.clientWidth) /
      Math.max(1, hostElement.clientHeight);
    const halfHeight = getCameraHalfHeight({
      itemId: options.itemId,
      presentation,
    });
    const halfWidth = halfHeight * aspect;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    if (backdropMesh !== null) {
      backdropMesh.position.set(0, 0, -40);
      backdropMesh.scale.set(
        halfWidth * 2 * BACKDROP_OVERDRAW,
        halfHeight * 2 * BACKDROP_OVERDRAW,
        1,
      );
    }
  };

  const disposeViewportSession = () => {
    rendererSessionToken += 1;
    window.removeEventListener("resize", resizeViewport);
    for (let index = disposables.length - 1; index >= 0; index -= 1) {
      try {
        disposables[index]!.dispose();
      } catch (error) {
        console.warn(
          "[frontend] Failed to dispose editor preview resource.",
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
    postProcessing = null;
  };

  const handleViewportRenderError = (error: unknown) => {
    disposeViewportSession();
    reportViewportRendererFailure({
      error,
      failureLogLabel: "editor preview viewport",
      hostElement,
      isDisposed: () => disposed,
    });
  };

  const startViewport = async () => {
    const sessionToken = ++rendererSessionToken;
    try {
      const rendererSession = await initializeViewportRendererSession({
        antialias: presentation === "stage",
        failureLogLabel: "editor preview viewport",
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

      const tuning = getRuntimeTuningDocument();
      const scene = new Scene();
      scene.background = createSceneBackgroundColor(tuning.visuals.background);
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

      const sphereGeometry = new SphereGeometry(1, 96, 96);
      const circleGeometry = new CircleGeometry(1, 72);
      const ringGeometry = new CircleGeometry(1, 64);
      const warpGeometry = new RingGeometry(0.55, 1, 96);
      const rocketBodyGeometry = new CylinderGeometry(0.56, 0.92, 1, 18, 1);
      const rocketNoseGeometry = new ConeGeometry(1, 1, 18);
      const rocketEngineGeometry = new CylinderGeometry(0.78, 0.9, 1, 18, 1);
      const rocketFinGeometry = new BoxGeometry(1, 1, 0.18);
      const rocketCanardGeometry = new BoxGeometry(1, 1, 0.14);
      const rocketSensorGeometry = new SphereGeometry(1, 20, 14);
      const planeGeometry = new PlaneGeometry(1, 1);
      const cannonStemGeometry = new CylinderGeometry(1, 1, 1, 16).rotateZ(
        -Math.PI / 2,
      );
      const cannonBreechGeometry = new BoxGeometry(1, 1, 1);
      const cannonBarrelGeometry = new CylinderGeometry(1, 1, 1, 20).rotateZ(
        -Math.PI / 2,
      );
      const cannonBarrelBandGeometry = new CylinderGeometry(
        1,
        1,
        1,
        20,
      ).rotateZ(-Math.PI / 2);
      const cannonMuzzleGeometry = new CylinderGeometry(1, 1, 1, 22).rotateZ(
        -Math.PI / 2,
      );
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
        presentation === "card" ? CARD_BLOOM_STRENGTH : STAGE_BLOOM_STRENGTH,
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
      const planetRadius = getPreviewPlanetRadius(options.itemId, presentation);
      const sunRadius = getPreviewSunRadius(options.itemId, presentation);
      const focusScale = getPresentationScale(presentation);
      const terraVisuals = tuning.visuals.planets.archetypes.terra;
      const terraPlanetRadius = planetRadius * terraVisuals.bodyScale;

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
          color: DEFAULT_ORBIT_PRESET.suns[0]!.color,
          glowColor: DEFAULT_ORBIT_PRESET.suns[0]!.glowColor,
          glowScale: tuning.visuals.suns.glowScale,
          glowStrength: tuning.visuals.suns.glowBrightness,
          hostScene: scene,
          radius: sunRadius * 0.86,
          seed: DEFAULT_ORBIT_PRESET.suns[0]!.id,
          sunGeometry: sphereGeometry,
          warpGeometry,
          warpScale: tuning.visuals.suns.warpScale,
        });
        const rocket = createPreviewRocket({
          hostScene: scene,
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
            rocket.update(nowSec, { x: 14 * focusScale, y: -15 * focusScale }),
        );
      }

      if (options.itemId === "background") {
        // Background layers are already the preview content.
      }

      if (options.itemId === "planets") {
        const planetEntries = ARCHETYPE_IDS.map((archetype, index) => {
          const visuals = tuning.visuals.planets.archetypes[archetype];
          const position =
            presentation === "card"
              ? getPlanetGridPosition(
                  index,
                  ARCHETYPE_IDS.length,
                  PLANETS_CARD_HORIZONTAL_SPACING * focusScale,
                  PLANETS_CARD_VERTICAL_SPACING * focusScale,
                )
              : getPlanetGridPosition(
                  index,
                  ARCHETYPE_IDS.length,
                  PLANETS_STAGE_HORIZONTAL_SPACING,
                  PLANETS_STAGE_VERTICAL_SPACING,
                );
          const radius =
            presentation === "card"
              ? clamp(
                  planetRadius *
                    visuals.bodyScale *
                    PLANETS_CARD_RADIUS_SCALE,
                  PLANETS_CARD_MIN_RADIUS,
                  PLANETS_CARD_MAX_RADIUS,
                )
              : clamp(
                  planetRadius *
                    visuals.bodyScale *
                    PLANETS_STAGE_RADIUS_SCALE,
                  PLANETS_STAGE_MIN_RADIUS,
                  PLANETS_STAGE_MAX_RADIUS,
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
          const label =
            presentation === "stage"
              ? createPreviewPlanetLabel({
                  accent: visuals.color,
                  document: hostElement.ownerDocument,
                  hostScene: scene,
                  label: ARCHETYPES[archetype].name,
                  position,
                  radius,
                })
              : null;
          registerDisposables(disposables, planet);
          if (label !== null) {
            registerDisposables(disposables, label);
          }
          return { planet, phase: index * 0.5 };
        });
        updates.push((nowSec) => {
          for (const entry of planetEntries) {
            entry.planet.update(nowSec + entry.phase);
          }
        });
      }

      if (options.itemId === "suns") {
        const sun = createPreviewSun({
          color: DEFAULT_ORBIT_PRESET.suns[0]!.color,
          glowColor: DEFAULT_ORBIT_PRESET.suns[0]!.glowColor,
          glowScale: tuning.visuals.suns.glowScale,
          glowStrength: tuning.visuals.suns.glowBrightness,
          hostScene: scene,
          radius: sunRadius,
          seed: DEFAULT_ORBIT_PRESET.suns[0]!.id,
          sunGeometry: sphereGeometry,
          warpGeometry,
          warpScale: tuning.visuals.suns.warpScale,
        });
        registerDisposables(disposables, sun);
        updates.push((nowSec) => sun.update(nowSec, { x: 0, y: 0 }));
      }

      if (options.itemId === "cache") {
        const cache = createPreviewCache({
          hostElement,
          hostScene: scene,
          presentation,
        });
        registerDisposables(disposables, cache);
        updates.push((nowSec) => cache.update(nowSec, { x: 0, y: 0 }));
      }

      const rocketKind = getRocketKindFromItemId(options.itemId);
      if (rocketKind !== null) {
        const rocket = createPreviewRocket({
          hostScene: scene,
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
          tuning.visuals.abilities.foresightColor,
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
          Math.max(tuning.visuals.blackHole.lensRadius, 1);
        const blackHoleGroup = new Group();
        blackHoleGroup.position.set(0, 0, 4);
        const lens = new Mesh(circleGeometry, createBlackHoleLensMaterial());
        const ring = new Mesh(
          new RingGeometry(0.42, 1, 96),
          createBlackHoleRingMaterial(),
        );
        const core = new Mesh(circleGeometry, createBlackHoleCoreMaterial());
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
        const worldUnitsPerPixel =
          presentation === "card"
            ? 0.38 * focusScale
            : CANNON_STAGE_WORLD_UNITS_PER_PIXEL;
        const layout = getCannonWorldLayout(
          tuning.visuals.cannon,
          worldUnitsPerPixel,
        );
        const stemStart = terraPlanetRadius;
        const breechStart = stemStart + layout.stemLenWorld;
        const barrelStart = breechStart + layout.breechLenWorld;
        const barrelEnd = barrelStart + layout.barrelLenWorld;
        updates.push((nowSec) => {
          planet.update(nowSec);
          stemMesh.position.set(stemStart + layout.stemLenWorld * 0.5, 0, 0);
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
          const flashRadius = layout.flashRadiusWorld * (0.74 + pulse * 0.36);
          flashMesh.scale.set(flashRadius, flashRadius, flashRadius);
        });
      }

      if (options.itemId === "foresight") {
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
        const foresightVisual = createForesightVisual();
        scene.add(foresightVisual.line, foresightVisual.points);
        registerDisposables(
          disposables,
          foresightVisual.lineGeometry,
          foresightVisual.line.material as { dispose: () => void },
          foresightVisual.pointGeometry,
          foresightVisual.points.material as { dispose: () => void },
        );
        const targetSpan =
          presentation === "card" ? FORESIGHT_CARD_SPAN : FORESIGHT_STAGE_SPAN;
        const pathScale =
          targetSpan /
          Math.max(
            1,
            Math.max(
              ...createPreviewForesightPath(targetSpan).map((point) =>
                Math.max(Math.abs(point.x), Math.abs(point.y)),
              ),
            ) * 2,
          );
        const basePath = createPreviewForesightPath(targetSpan);
        const visiblePath = clipForesightPathAtDistance(
          basePath,
          terraPlanetRadius +
            tuning.visuals.abilities.foresight.leadGap * pathScale,
        );
        updatePreviewForesightVisual(foresightVisual, visiblePath);
        updates.push((nowSec) => {
          planet.update(nowSec);
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
        const shieldArcRadians =
          (tuning.gameplay.abilities.shield.arcDeg * Math.PI) / 180;
        const shieldGlowMaterial = new MeshBasicMaterial({
          color: tuning.visuals.abilities.shieldColor,
          depthWrite: false,
          opacity: 0.22,
          transparent: true,
          blending: AdditiveBlending,
        });
        const shieldGlowMesh = new Mesh(
          new RingGeometry(
            SHIELD_OUTER_SCALE * 0.84,
            SHIELD_GLOW_OUTER_SCALE,
            72,
            1,
            -shieldArcRadians / 2,
            shieldArcRadians,
          ),
          shieldGlowMaterial,
        );
        const shieldArcMaterial = new MeshBasicMaterial({
          color: tuning.visuals.abilities.shieldColor,
          depthWrite: false,
          opacity: 0.58,
          transparent: true,
        });
        const shieldArcMesh = new Mesh(
          new RingGeometry(
            SHIELD_INNER_SCALE,
            SHIELD_OUTER_SCALE,
            72,
            1,
            -shieldArcRadians / 2,
            shieldArcRadians,
          ),
          shieldArcMaterial,
        );
        shieldGlowMesh.renderOrder = 11;
        shieldArcMesh.renderOrder = 12;
        shieldGlowMesh.position.z = 2.6;
        shieldArcMesh.position.z = 2.8;
        const shieldGroup = new Group();
        shieldGroup.add(shieldGlowMesh, shieldArcMesh);
        scene.add(shieldGroup);
        registerDisposables(
          disposables,
          shieldGlowMesh.geometry,
          shieldArcMesh.geometry,
          shieldGlowMaterial,
          shieldArcMaterial,
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
          shieldGlowMaterial.opacity = 0.2 + Math.sin(nowSec * 9.4) * 0.04;
          shieldArcMaterial.opacity = 0.54 + Math.sin(nowSec * 7.6) * 0.05;
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
        const burstPoints = new Points(burstGeometry, burstMaterial);
        burstPoints.renderOrder = 13;
        burstPoints.position.z = 2.3;
        scene.add(burstPoints);
        registerDisposables(
          disposables,
          wakeGeometry,
          wake.material,
          ...(wake.texture === null ? [] : [wake.texture]),
          burstGeometry,
          burstMaterial,
        );
        const magnitudeScale =
          0.8 +
          clamp(tuning.gameplay.abilities.boost.magnitude / 4000, 0, 1) * 0.9;
        updates.push((nowSec) => {
          planet.update(nowSec);
          const pulse = 0.78 + Math.sin(nowSec * 4.2) * 0.18;
          wake.material.opacity = 0.58 + Math.sin(nowSec * 5.3) * 0.1;
          wakeMesh.position.set(-terraPlanetRadius * 0.18, 0, 2.2);
          wakeMesh.scale.set(
            terraPlanetRadius * magnitudeScale * 1.7,
            terraPlanetRadius * 1.22,
            1,
          );
          wakeMesh.rotation.z = Math.PI;
          burstPoints.position.set(-terraPlanetRadius * 0.44, 0, 2.3);
          burstPoints.scale.set(
            terraPlanetRadius * magnitudeScale * (0.72 + pulse * 0.1),
            terraPlanetRadius * magnitudeScale * (0.72 + pulse * 0.1),
            1,
          );
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
    } catch (error) {
      disposeViewportSession();
      reportViewportRendererFailure({
        error,
        failureLogLabel: "editor preview viewport",
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
