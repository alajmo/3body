import type { CacheContents } from "@3body/shared";
import type { CombatSandboxCache } from "../combatSandbox";
import {
  CanvasTexture,
  Group,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from "three/webgpu";

export const CACHE_BADGE_BASE_SIZE = 80;

export type CacheIconKey =
  | "heavyAmmo"
  | "seekerPack"
  | "repair"
  | "boostCharge"
  | "shieldExt"
  | "foresightExt"
  | "wildcard";

type CacheBadgeShape =
  | "hex"
  | "diamond"
  | "octagon"
  | "bolt"
  | "shield"
  | "chevron"
  | "star";

export interface CacheSpriteMaterial {
  map: CanvasTexture;
  material: SpriteMaterial;
}

export type CacheSpriteMaterialMap = Record<CacheIconKey, CacheSpriteMaterial>;

export interface CacheSpriteAssets {
  badgeMaterials: CacheSpriteMaterialMap;
  iconMaterials: CacheSpriteMaterialMap;
}

export interface CacheVisual {
  badgeSprite: Sprite;
  bobPhase: number;
  group: Group;
  key: CacheIconKey;
  pulseRate: number;
  wobbleRate: number;
}

const CACHE_ICON_LAYOUT = {
  cellSize: 64,
  cols: 4,
  rows: 2,
} as const;

const CACHE_ICON_KEYS = [
  "heavyAmmo",
  "seekerPack",
  "repair",
  "boostCharge",
  "shieldExt",
  "foresightExt",
  "wildcard",
] as const satisfies readonly CacheIconKey[];

const CACHE_BADGE_LAYOUT = {
  cellSize: 160,
  cols: 4,
  rows: 2,
} as const;

const CACHE_ICON_PRESENTATION: Record<
  CacheIconKey,
  {
    accent: string;
    label: string;
    shape: CacheBadgeShape;
  }
> = {
  heavyAmmo: {
    accent: "#ff8b49",
    label: "HEAVY",
    shape: "hex",
  },
  seekerPack: {
    accent: "#ff61eb",
    label: "SEEKER",
    shape: "diamond",
  },
  repair: {
    accent: "#88f1b6",
    label: "REPAIR",
    shape: "octagon",
  },
  boostCharge: {
    accent: "#82c8ff",
    label: "BOOST",
    shape: "bolt",
  },
  shieldExt: {
    accent: "#86ecff",
    label: "SHIELD",
    shape: "shield",
  },
  foresightExt: {
    accent: "#ffe28b",
    label: "SIGHT",
    shape: "chevron",
  },
  wildcard: {
    accent: "#ffd37a",
    label: "WILD",
    shape: "star",
  },
};

export const getCacheIconKey = (contents: CacheContents): CacheIconKey =>
  contents.kind === "wildcard" ? "wildcard" : contents.kind;

const fillRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
};

const tracePolygon = (
  context: CanvasRenderingContext2D,
  radius: number,
  sides: number,
  rotation = -Math.PI / 2,
) => {
  context.beginPath();
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (index / sides) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.closePath();
};

const traceStar = (
  context: CanvasRenderingContext2D,
  outerRadius: number,
  innerRadius: number,
  points: number,
  rotation = -Math.PI / 2,
) => {
  context.beginPath();
  const vertexCount = points * 2;
  for (let index = 0; index < vertexCount; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotation + (index / vertexCount) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.closePath();
};

const traceCacheBadgeShape = (
  context: CanvasRenderingContext2D,
  shape: CacheBadgeShape,
  size: number,
) => {
  switch (shape) {
    case "hex":
      tracePolygon(context, size * 0.34, 6);
      break;
    case "diamond":
      tracePolygon(context, size * 0.34, 4);
      break;
    case "octagon":
      tracePolygon(context, size * 0.34, 8);
      break;
    case "bolt":
      context.beginPath();
      context.moveTo(-size * 0.12, -size * 0.34);
      context.lineTo(size * 0.02, -size * 0.08);
      context.lineTo(-size * 0.08, -size * 0.08);
      context.lineTo(size * 0.12, size * 0.34);
      context.lineTo(-size * 0.02, size * 0.06);
      context.lineTo(size * 0.08, size * 0.06);
      context.closePath();
      break;
    case "shield":
      context.beginPath();
      context.moveTo(0, -size * 0.36);
      context.lineTo(size * 0.28, -size * 0.22);
      context.lineTo(size * 0.23, size * 0.15);
      context.lineTo(0, size * 0.34);
      context.lineTo(-size * 0.23, size * 0.15);
      context.lineTo(-size * 0.28, -size * 0.22);
      context.closePath();
      break;
    case "chevron":
      context.beginPath();
      context.moveTo(-size * 0.32, -size * 0.24);
      context.lineTo(0, size * 0.34);
      context.lineTo(size * 0.32, -size * 0.24);
      context.lineTo(size * 0.14, -size * 0.24);
      context.lineTo(0, size * 0.02);
      context.lineTo(-size * 0.14, -size * 0.24);
      context.closePath();
      break;
    case "star":
      traceStar(context, size * 0.34, size * 0.16, 5);
      break;
  }
};

const drawCacheIconGlyph = (
  context: CanvasRenderingContext2D,
  key: CacheIconKey,
  size: number,
  accent: string,
) => {
  context.save();
  context.strokeStyle = accent;
  context.fillStyle = accent;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = size * 0.08;

  switch (key) {
    case "heavyAmmo":
      context.strokeRect(-size * 0.28, -size * 0.18, size * 0.56, size * 0.36);
      context.fillRect(-size * 0.18, -size * 0.09, size * 0.36, size * 0.18);
      break;
    case "seekerPack":
      traceStar(context, size * 0.3, size * 0.14, 4, Math.PI / 4);
      context.stroke();
      break;
    case "repair":
      context.fillRect(-size * 0.08, -size * 0.28, size * 0.16, size * 0.56);
      context.fillRect(-size * 0.28, -size * 0.08, size * 0.56, size * 0.16);
      break;
    case "boostCharge":
      traceCacheBadgeShape(context, "bolt", size);
      context.fill();
      break;
    case "shieldExt":
      traceCacheBadgeShape(context, "shield", size * 0.95);
      context.stroke();
      break;
    case "foresightExt":
      context.beginPath();
      context.arc(0, 0, size * 0.22, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, size * 0.08, 0, Math.PI * 2);
      context.fill();
      break;
    case "wildcard":
      traceStar(context, size * 0.3, size * 0.13, 5);
      context.fill();
      break;
  }

  context.restore();
};

const drawCacheIconTile = (
  context: CanvasRenderingContext2D,
  key: CacheIconKey,
  x: number,
  y: number,
  size: number,
) => {
  const accent = CACHE_ICON_PRESENTATION[key].accent;
  const centerX = x + size / 2;
  const centerY = y + size / 2;

  context.save();
  context.translate(centerX, centerY);
  context.shadowColor = accent;
  context.shadowBlur = size * 0.18;
  context.fillStyle = "rgba(7, 13, 21, 0.95)";
  context.beginPath();
  context.arc(0, 0, size * 0.34, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  drawCacheIconGlyph(context, key, size * 0.54, accent);
  context.restore();
};

const createCacheIconTexture = (
  document: Document,
  key: CacheIconKey,
): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = CACHE_ICON_LAYOUT.cellSize;
  canvas.height = CACHE_ICON_LAYOUT.cellSize;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2D canvas context unavailable.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawCacheIconTile(context, key, 0, 0, CACHE_ICON_LAYOUT.cellSize);

  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.generateMipmaps = false;
  atlas.needsUpdate = true;
  return atlas;
};

const getCacheBadgeFontSize = (size: number, label: string): number =>
  label.length >= 7
    ? size * 0.145
    : label.length >= 6
      ? size * 0.16
      : size * 0.18;

const drawCacheBadgeTile = (
  context: CanvasRenderingContext2D,
  key: CacheIconKey,
  x: number,
  y: number,
  size: number,
) => {
  const { accent, label, shape } = CACHE_ICON_PRESENTATION[key];
  const centerX = x + size / 2;
  const centerY = y + size / 2;

  context.save();
  context.translate(centerX, centerY);
  context.shadowColor = accent;
  context.shadowBlur = size * 0.16;
  context.fillStyle = "rgba(7, 12, 18, 0.96)";
  traceCacheBadgeShape(context, shape, size);
  context.fill();
  context.shadowBlur = 0;
  context.lineWidth = size * 0.03;
  context.strokeStyle = accent;
  traceCacheBadgeShape(context, shape, size);
  context.stroke();

  context.save();
  context.globalAlpha = 0.12;
  context.scale(0.82, 0.82);
  context.fillStyle = accent;
  traceCacheBadgeShape(context, shape, size);
  context.fill();
  context.restore();

  context.save();
  context.translate(0, -size * 0.14);
  drawCacheIconGlyph(context, key, size * 0.44, accent);
  context.restore();

  context.fillStyle = "rgba(3, 7, 12, 0.84)";
  fillRoundedRect(
    context,
    -size * 0.28,
    size * 0.14,
    size * 0.56,
    size * 0.16,
    size * 0.05,
  );
  context.fillStyle = "#f7fbff";
  context.font = `700 ${getCacheBadgeFontSize(size, label)}px "IBM Plex Sans", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 0, size * 0.22);
  context.restore();
};

const createCacheBadgeTexture = (
  document: Document,
  key: CacheIconKey,
): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = CACHE_BADGE_LAYOUT.cellSize;
  canvas.height = CACHE_BADGE_LAYOUT.cellSize;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2D canvas context unavailable.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawCacheBadgeTile(context, key, 0, 0, CACHE_BADGE_LAYOUT.cellSize);

  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.generateMipmaps = false;
  atlas.needsUpdate = true;
  return atlas;
};

const createSpriteMaterial = (map: CanvasTexture, alphaTest?: number) =>
  new SpriteMaterial({
    ...(alphaTest === undefined ? {} : { alphaTest }),
    color: "#ffffff",
    depthWrite: false,
    map,
    transparent: true,
  });

const createMaterialSet = (
  document: Document,
  createTexture: (doc: Document, key: CacheIconKey) => CanvasTexture,
  alphaTest?: number,
): CacheSpriteMaterialMap =>
  CACHE_ICON_KEYS.reduce((materials, key) => {
    const map = createTexture(document, key);
    materials[key] = {
      map,
      material: createSpriteMaterial(map, alphaTest),
    };
    return materials;
  }, {} as CacheSpriteMaterialMap);

export const createCacheSpriteAssets = (
  document: Document,
): CacheSpriteAssets => ({
  badgeMaterials: createMaterialSet(document, createCacheBadgeTexture, 0.02),
  iconMaterials: createMaterialSet(document, createCacheIconTexture),
});

export const disposeCacheSpriteAssets = (assets: CacheSpriteAssets) => {
  for (const materialSet of [assets.badgeMaterials, assets.iconMaterials]) {
    for (const { map, material } of Object.values(materialSet)) {
      material.dispose();
      map.dispose();
    }
  }
};

export const createCacheVisual = (
  cache: CombatSandboxCache,
  badgeMaterials: CacheSpriteMaterialMap,
): CacheVisual => {
  const key = getCacheIconKey(cache.contents);
  const group = new Group();
  const badgeSprite = new Sprite(badgeMaterials[key].material);
  badgeSprite.position.z = 0.35;
  badgeSprite.renderOrder = 7;
  badgeSprite.scale.set(CACHE_BADGE_BASE_SIZE, CACHE_BADGE_BASE_SIZE, 1);
  group.add(badgeSprite);

  return {
    badgeSprite,
    bobPhase: cache.id * 0.71,
    group,
    key,
    pulseRate: 2.2 + (cache.id % 4) * 0.25,
    wobbleRate: 1.1 + (cache.id % 5) * 0.08,
  };
};

export const updateCacheVisualBadge = (
  visual: CacheVisual,
  badgeMaterials: CacheSpriteMaterialMap,
  key: CacheIconKey,
) => {
  if (visual.key === key) {
    return;
  }

  visual.badgeSprite.material = badgeMaterials[key].material;
  visual.key = key;
};
