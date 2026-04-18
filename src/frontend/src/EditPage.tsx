import {
  ARENA_RADIUS_MIN,
  ARCHETYPE_IDS,
  ARCHETYPES,
  DEFAULT_GAME_TUNING,
  clamp,
  cloneGameTuningDocument,
  sanitizeGameTuning,
  type GameTuningDocument,
  type PlanetTintOffsetTuning,
  type RocketKind,
} from "@3body/shared";
import {
  type MouseEvent as ReactMouseEvent,
  startTransition,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { EditorPreviewStage } from "./EditorPreviewStage";
import { getDefaultOrbitSunLabel } from "./game/orbitPresets";
import {
  applyRuntimeTuningDocument,
  getRuntimeTuningDocument,
} from "./game/runtimeTuning";
import {
  CACHE_ICON_KEYS,
  getCacheIconAccent,
  getCacheIconLabel,
  type CacheIconKey,
} from "./game/showcaseVisuals";
import {
  CACHE_ARENA_BADGE_SIZE_FACTOR,
  getCacheArenaBadgeSize,
} from "./game/viewport/cacheVisuals";

type EditorItemId =
  | "overview"
  | "hud"
  | "orbits"
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
  | "gravityPulse"
  | "cloak"
  | "cache";

type EditorItemMeta = {
  id: EditorItemId;
  label: string;
  note: string;
};

const EDITOR_ITEM_QUERY_PARAM = "item";

const EDITOR_VIEW_ITEMS = [
  { id: "overview", label: "Overview", note: "Showcase + HUD" },
  { id: "hud", label: "HUD", note: "HUD only" },
  { id: "orbits", label: "Orbits", note: "Orbit seed tuning" },
] as const;

const EDITOR_GROUPS = [
  {
    label: "World",
    items: [
      { id: "background", label: "Background", note: "Backdrop and starfield" },
      { id: "planets", label: "Planets", note: "Scale and archetype colors" },
      { id: "suns", label: "Suns", note: "Per-sun size and glow" },
      { id: "blackHole", label: "Black Hole", note: "Gameplay and visuals" },
      { id: "cache", label: "Caches", note: "Spawn and badge size" },
    ],
  },
  {
    label: "Missiles",
    items: [
      { id: "cannon", label: "Turret", note: "Gun size and flash" },
      { id: "rocketLight", label: "Light", note: "Ammo, reload, look" },
      { id: "rocketHeavy", label: "Heavy", note: "Damage and silhouette" },
      { id: "rocketSeeker", label: "Seeker", note: "Lock-on profile" },
    ],
  },
  {
    label: "Abilities",
    items: [
      { id: "foresight", label: "Foresight", note: "Path style and timing" },
      { id: "shield", label: "Shield", note: "Arc and active tint" },
      { id: "boost", label: "Boost", note: "Charges and impulse" },
      {
        id: "gravityPulse",
        label: "Gravity Pulse",
        note: "Wildcard shockwave",
      },
      { id: "cloak", label: "Cloak", note: "Wildcard concealment" },
    ],
  },
] as const satisfies readonly {
  label: string;
  items: readonly EditorItemMeta[];
}[];

const ROCKET_KIND_BY_ITEM: Record<
  Extract<EditorItemId, "rocketLight" | "rocketHeavy" | "rocketSeeker">,
  RocketKind
> = {
  rocketLight: "light",
  rocketHeavy: "heavy",
  rocketSeeker: "seeker",
};

const CACHE_EFFECT_COPY: Record<
  CacheIconKey,
  {
    description: string;
    title: string;
  }
> = {
  heavyAmmo: {
    title: "Heavy Ammo",
    description: "Delivery grants +1 heavy rocket ammo.",
  },
  seekerPack: {
    title: "Seeker Pack",
    description: "Delivery grants +2 seeker rockets.",
  },
  repair: {
    title: "Repair",
    description: "Restores 40 HP, capped at full health.",
  },
  shieldExt: {
    title: "Shield Ext",
    description: "Extends the next shield to double capacity.",
  },
  foresightExt: {
    title: "Foresight Max",
    description:
      "Refills foresight to full and doubles the next foresight use.",
  },
  wildcardGravityPulse: {
    title: "Gravity Pulse",
    description:
      "Wildcard cache. Press G to emit a pulse that blasts planets, rockets, drones, and caches within its blast radius away from your planet. Force falls off linearly with distance.",
  },
  wildcardCloak: {
    title: "Cloak",
    description: "Wildcard cache. Press C to hide your trail for 5 seconds.",
  },
};

const WILDCARD_ABILITY_COPY = {
  gravityPulse: {
    description:
      "Press G to emit a pulse that shoves planets, rockets, drones, and caches within its blast radius away from you. Force falls off linearly with distance.",
    title: "Gravity Pulse",
  },
  cloak: {
    description:
      "Press C to cloak your planet for 5 seconds, hiding its trail while the effect lasts.",
    title: "Cloak",
  },
} as const;

const getDisplayedCacheBadgeSize = (
  documentValue: GameTuningDocument,
): number =>
  Math.round(
    getCacheArenaBadgeSize(
      documentValue.visuals.caches.badgeBaseSize,
      documentValue.visuals.caches.badgeScale,
    ),
  );

const setDisplayedCacheBadgeSize = (
  draft: GameTuningDocument,
  value: number,
) => {
  draft.visuals.caches.badgeBaseSize = Math.max(
    16,
    Math.min(
      400,
      Math.round(Math.round(value) / CACHE_ARENA_BADGE_SIZE_FACTOR),
    ),
  );
  draft.visuals.caches.badgeScale = 1;
};

type PlanetMaterialNumberKey = Exclude<
  keyof GameTuningDocument["visuals"]["planets"]["material"],
  | "forestLightTint"
  | "highlandTint"
  | "lightDirection"
  | "lowlandTint"
  | "oceanDeepTint"
  | "oceanShallowTint"
  | "rockTint"
  | "snowTint"
>;
type PlanetMaterialTintKey = Extract<
  keyof GameTuningDocument["visuals"]["planets"]["material"],
  | "forestLightTint"
  | "highlandTint"
  | "lowlandTint"
  | "oceanDeepTint"
  | "oceanShallowTint"
  | "rockTint"
  | "snowTint"
>;
type PlanetLightDirectionKey =
  keyof GameTuningDocument["visuals"]["planets"]["material"]["lightDirection"];
type PlanetAuraNumberKey = Exclude<
  keyof GameTuningDocument["visuals"]["planets"]["aura"],
  "glowInnerTint" | "glowOuterTint"
>;
type PlanetAuraTintKey = Extract<
  keyof GameTuningDocument["visuals"]["planets"]["aura"],
  "glowInnerTint" | "glowOuterTint"
>;
type PlanetVariationKey =
  keyof GameTuningDocument["visuals"]["planets"]["variation"];
type SunProfileNumberKey = Exclude<
  keyof GameTuningDocument["visuals"]["suns"]["profiles"][number],
  "color" | "glowColor"
>;
type SunProfileColorKey = Extract<
  keyof GameTuningDocument["visuals"]["suns"]["profiles"][number],
  "color" | "glowColor"
>;
type OrbitSunNumberKey = Exclude<
  keyof GameTuningDocument["gameplay"]["orbits"]["suns"][number],
  "pos" | "vel"
>;
type OrbitSunVectorKey = Extract<
  keyof GameTuningDocument["gameplay"]["orbits"]["suns"][number],
  "pos" | "vel"
>;
type OrbitVectorComponentKey =
  keyof GameTuningDocument["gameplay"]["orbits"]["suns"][number]["pos"];
type OrbitBoundaryDebrisNumberKey = Exclude<
  keyof GameTuningDocument["visuals"]["orbits"]["boundaryDebris"],
  "coolColor" | "warmColor"
>;
type OrbitBoundaryDebrisColorKey = Extract<
  keyof GameTuningDocument["visuals"]["orbits"]["boundaryDebris"],
  "coolColor" | "warmColor"
>;

const ARENA_RADIUS_STEP = 10;
const ORBIT_PLANET_CIRCLE_RADIUS_MIN = 400;
const ORBIT_PLANET_CIRCLE_RADIUS_STEP = 10;
const ORBIT_BOUNDARY_DEBRIS_DENSITY_MIN = 0.25;
const ORBIT_BOUNDARY_DEBRIS_DENSITY_STEP = 0.05;
const ORBIT_BOUNDARY_DEBRIS_DUST_SIZE_MIN = 1;
const ORBIT_BOUNDARY_DEBRIS_DUST_SIZE_STEP = 0.1;
const ORBIT_BOUNDARY_DEBRIS_SCALE_MIN = 0.25;
const ORBIT_BOUNDARY_DEBRIS_SCALE_STEP = 0.05;
const ORBIT_BOUNDARY_DEBRIS_SPEED_MIN = 0.1;
const ORBIT_BOUNDARY_DEBRIS_SPEED_STEP = 0.05;
const ORBIT_BOUNDARY_DEBRIS_THICKNESS_MIN = 24;
const ORBIT_BOUNDARY_DEBRIS_THICKNESS_STEP = 2;
const ORBIT_SUN_DISTANCE_SCALE_MIN = 0.5;
const ORBIT_SUN_DISTANCE_SCALE_MAX = 2.5;
const ORBIT_SUN_DISTANCE_SCALE_STEP = 0.05;
const ORBIT_SYSTEM_DRIFT_DIRECTION_MAX = 360;
const ORBIT_SYSTEM_DRIFT_DIRECTION_STEP = 1;
const ORBIT_SYSTEM_DRIFT_SPEED_STEP = 10;
const ORBIT_START_POSITION_MIN = -10000;
const ORBIT_START_POSITION_MAX = 10000;
const ORBIT_START_POSITION_STEP = 10;

type NumericFieldConfig<Key extends string> = {
  key: Key;
  label: string;
  max: number;
  min: number;
  step: number;
};

const PLANET_MATERIAL_TINT_FIELDS = [
  { key: "lowlandTint", label: "Lowland" },
  { key: "highlandTint", label: "Highland" },
  { key: "rockTint", label: "Rock" },
  { key: "snowTint", label: "Snow" },
  { key: "oceanShallowTint", label: "Ocean shallow" },
  { key: "oceanDeepTint", label: "Ocean deep" },
  { key: "forestLightTint", label: "Forest light" },
] as const satisfies readonly { key: PlanetMaterialTintKey; label: string }[];

const PLANET_SURFACE_GEOMETRY_FIELDS = [
  { key: "baseRadius", label: "Base radius", min: 0.25, max: 1.5, step: 0.01 },
  {
    key: "displacementBudget",
    label: "Displacement budget",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "continentsScale",
    label: "Continents scale",
    min: 0.1,
    max: 64,
    step: 0.1,
  },
  {
    key: "continentsOctaves",
    label: "Continents octaves",
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: "continentsLacunarity",
    label: "Continents lacunarity",
    min: 1,
    max: 4,
    step: 0.01,
  },
  {
    key: "continentsGain",
    label: "Continents gain",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "mountainsScale",
    label: "Mountains scale",
    min: 0.1,
    max: 128,
    step: 0.1,
  },
  {
    key: "mountainsOctaves",
    label: "Mountains octaves",
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: "mountainsLacunarity",
    label: "Mountains lacunarity",
    min: 1,
    max: 4,
    step: 0.01,
  },
  {
    key: "mountainsGain",
    label: "Mountains gain",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "detailScale",
    label: "Detail scale",
    min: 0.1,
    max: 128,
    step: 0.1,
  },
  {
    key: "forestClumpScale",
    label: "Forest clump scale",
    min: 0.1,
    max: 128,
    step: 0.1,
  },
  {
    key: "forestSpeckleScale",
    label: "Forest speckle scale",
    min: 0.1,
    max: 256,
    step: 0.1,
  },
] as const satisfies readonly NumericFieldConfig<PlanetMaterialNumberKey>[];

const PLANET_SURFACE_RAMP_FIELDS = [
  {
    key: "landMaskStart",
    label: "Land mask start",
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: "landMaskEnd", label: "Land mask end", min: 0, max: 1, step: 0.01 },
  {
    key: "heightOceanScale",
    label: "Ocean height scale",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "heightLandScale",
    label: "Land height scale",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "mountainHeightContribution",
    label: "Mountain contribution",
    min: 0,
    max: 2,
    step: 0.01,
  },
  { key: "seaLevel", label: "Sea level", min: 0, max: 1, step: 0.01 },
  {
    key: "landElevationStart",
    label: "Land elevation start",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "landElevationEnd",
    label: "Land elevation end",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "oceanDepthStart",
    label: "Ocean depth start",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "oceanDepthEnd",
    label: "Ocean depth end",
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: "coastStart", label: "Coast start", min: 0, max: 1, step: 0.01 },
  { key: "coastEnd", label: "Coast end", min: 0, max: 1, step: 0.01 },
  {
    key: "highlandStart",
    label: "Highland start",
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: "highlandEnd", label: "Highland end", min: 0, max: 1, step: 0.01 },
  { key: "rockStart", label: "Rock start", min: 0, max: 1, step: 0.01 },
  { key: "rockEnd", label: "Rock end", min: 0, max: 1, step: 0.01 },
  { key: "snowStart", label: "Snow start", min: 0, max: 1, step: 0.01 },
  { key: "snowEnd", label: "Snow end", min: 0, max: 1, step: 0.01 },
  {
    key: "forestBandStart",
    label: "Forest band start",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "forestBandEnd",
    label: "Forest band end",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "forestFadeStart",
    label: "Forest fade start",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "forestFadeEnd",
    label: "Forest fade end",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "forestClumpStart",
    label: "Forest clump start",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "forestClumpEnd",
    label: "Forest clump end",
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: "polarStart", label: "Polar start", min: 0, max: 1, step: 0.01 },
  { key: "polarEnd", label: "Polar end", min: 0, max: 1, step: 0.01 },
  {
    key: "polarMountainInfluence",
    label: "Polar mountain influence",
    min: 0,
    max: 1,
    step: 0.01,
  },
] as const satisfies readonly NumericFieldConfig<PlanetMaterialNumberKey>[];

const PLANET_LIGHTING_FIELDS = [
  { key: "lambertMin", label: "Lambert min", min: 0, max: 2, step: 0.01 },
  { key: "lambertMax", label: "Lambert max", min: 0, max: 2, step: 0.01 },
  { key: "aoMin", label: "AO min", min: 0, max: 2, step: 0.01 },
  { key: "aoMax", label: "AO max", min: 0, max: 2, step: 0.01 },
  { key: "rimPower", label: "Rim power", min: 0.1, max: 8, step: 0.01 },
  { key: "rimStrength", label: "Rim strength", min: 0, max: 1, step: 0.01 },
  { key: "rimTintBlend", label: "Rim tint blend", min: 0, max: 1, step: 0.01 },
  {
    key: "edgeOutlineStrength",
    label: "Edge outline",
    min: 0,
    max: 1,
    step: 0.01,
  },
] as const satisfies readonly NumericFieldConfig<PlanetMaterialNumberKey>[];

const PLANET_AURA_TINT_FIELDS = [
  { key: "glowOuterTint", label: "Glow outer" },
  { key: "glowInnerTint", label: "Glow inner" },
] as const satisfies readonly { key: PlanetAuraTintKey; label: string }[];

const PLANET_AURA_SHAPE_FIELDS = [
  {
    key: "bodyBoundaryMin",
    label: "Body boundary min",
    min: 0,
    max: 1,
    step: 0.001,
  },
  {
    key: "bodyBoundaryMax",
    label: "Body boundary max",
    min: 0,
    max: 1,
    step: 0.001,
  },
  { key: "innerEdgeMax", label: "Inner edge max", min: 0, max: 1, step: 0.001 },
  {
    key: "innerFeatherBase",
    label: "Inner feather base",
    min: 0,
    max: 1,
    step: 0.001,
  },
  {
    key: "innerFeatherMin",
    label: "Inner feather min",
    min: 0,
    max: 1,
    step: 0.001,
  },
  {
    key: "innerFeatherMax",
    label: "Inner feather max",
    min: 0,
    max: 1,
    step: 0.001,
  },
  {
    key: "riseStartFeatherScale",
    label: "Rise feather scale",
    min: 0,
    max: 4,
    step: 0.01,
  },
  {
    key: "contactFeatherScale",
    label: "Contact feather scale",
    min: 0,
    max: 4,
    step: 0.01,
  },
  { key: "minRemaining", label: "Min remaining", min: 0, max: 1, step: 0.001 },
  {
    key: "fadeStartMinOffset",
    label: "Fade min offset",
    min: 0,
    max: 1,
    step: 0.001,
  },
  {
    key: "fadeStartRemainingScale",
    label: "Fade remaining scale",
    min: 0,
    max: 1,
    step: 0.001,
  },
  { key: "fadeStartMax", label: "Fade start max", min: 0, max: 1, step: 0.001 },
] as const satisfies readonly NumericFieldConfig<PlanetAuraNumberKey>[];

const PLANET_AURA_PULSE_FIELDS = [
  {
    key: "pulseFrequency",
    label: "Pulse frequency",
    min: 0,
    max: 4,
    step: 0.01,
  },
  {
    key: "pulseAmplitude",
    label: "Pulse amplitude",
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: "pulseBase", label: "Pulse base", min: 0, max: 2, step: 0.01 },
  {
    key: "pulseSeedPhase",
    label: "Pulse seed phase",
    min: 0,
    max: 8,
    step: 0.01,
  },
  {
    key: "haloEnvelopePower",
    label: "Envelope power",
    min: 0.1,
    max: 8,
    step: 0.01,
  },
  {
    key: "haloTailScale",
    label: "Tail scale",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "haloTailBias",
    label: "Tail bias",
    min: 0,
    max: 2,
    step: 0.01,
  },
  { key: "brightness", label: "Brightness", min: 0, max: 4, step: 0.01 },
  { key: "alpha", label: "Alpha", min: 0, max: 1, step: 0.01 },
] as const satisfies readonly NumericFieldConfig<PlanetAuraNumberKey>[];

const PLANET_LIGHT_DIRECTION_FIELDS = [
  { key: "x", label: "Light X", min: -2, max: 2, step: 0.01 },
  { key: "y", label: "Light Y", min: -2, max: 2, step: 0.01 },
  { key: "z", label: "Light Z", min: -2, max: 2, step: 0.01 },
] as const satisfies readonly NumericFieldConfig<PlanetLightDirectionKey>[];

const PLANET_VARIATION_FIELDS = [
  {
    key: "forestDensityJitterMin",
    label: "Forest jitter min",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "forestDensityJitterMax",
    label: "Forest jitter max",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "spinTiltMinY",
    label: "Spin tilt min Y",
    min: -1,
    max: 1,
    step: 0.01,
  },
  {
    key: "spinTiltMaxY",
    label: "Spin tilt max Y",
    min: -1,
    max: 1,
    step: 0.01,
  },
] as const satisfies readonly NumericFieldConfig<PlanetVariationKey>[];

const EDITOR_ITEM_QUERY_VALUES = {
  overview: "overview",
  hud: "hud",
  orbits: "orbits",
  background: "background",
  planets: "planets",
  suns: "suns",
  blackHole: "black-hole",
  cannon: "turret",
  rocketLight: "light",
  rocketHeavy: "heavy",
  rocketSeeker: "seeker",
  foresight: "foresight",
  shield: "shield",
  boost: "boost",
  gravityPulse: "gravity-pulse",
  cloak: "cloak",
  cache: "cache",
} as const satisfies Record<EditorItemId, string>;

const EDITOR_ITEM_ID_BY_QUERY_VALUE = new Map<string, EditorItemId>(
  (
    Object.entries(EDITOR_ITEM_QUERY_VALUES) as [
      EditorItemId,
      (typeof EDITOR_ITEM_QUERY_VALUES)[EditorItemId],
    ][]
  ).map(([itemId, queryValue]) => [queryValue, itemId]),
);

EDITOR_ITEM_ID_BY_QUERY_VALUE.set("blackhole", "blackHole");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("cannon", "cannon");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("rocketlight", "rocketLight");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("rocketheavy", "rocketHeavy");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("rocketseeker", "rocketSeeker");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("light-missile", "rocketLight");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("heavy-missile", "rocketHeavy");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("seeker-missile", "rocketSeeker");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("gravitypulse", "gravityPulse");

const DEFAULT_EDITOR_ITEM_ID: EditorItemId = "overview";

const getEditorItemSelectionFromLocation = (): {
  itemId: EditorItemId;
  shouldNormalizeUrl: boolean;
} => {
  const rawQueryValue = new URLSearchParams(window.location.search).get(
    EDITOR_ITEM_QUERY_PARAM,
  );

  if (rawQueryValue === null) {
    return {
      itemId: DEFAULT_EDITOR_ITEM_ID,
      shouldNormalizeUrl: false,
    };
  }

  const normalizedQueryValue = rawQueryValue.trim().toLowerCase();
  if (normalizedQueryValue.length === 0) {
    return {
      itemId: DEFAULT_EDITOR_ITEM_ID,
      shouldNormalizeUrl: true,
    };
  }

  const itemId = EDITOR_ITEM_ID_BY_QUERY_VALUE.get(normalizedQueryValue);
  if (itemId === undefined) {
    return {
      itemId: DEFAULT_EDITOR_ITEM_ID,
      shouldNormalizeUrl: true,
    };
  }

  return {
    itemId,
    shouldNormalizeUrl:
      EDITOR_ITEM_QUERY_VALUES[itemId] !== normalizedQueryValue,
  };
};

const getEditPageUrlForItem = (itemId: EditorItemId): string => {
  const url = new URL(window.location.href);
  url.searchParams.set(
    EDITOR_ITEM_QUERY_PARAM,
    EDITOR_ITEM_QUERY_VALUES[itemId],
  );
  return `${url.pathname}${url.search}${url.hash}`;
};

const syncEditorItemToLocation = (
  itemId: EditorItemId,
  historyMethod: "pushState" | "replaceState",
) => {
  const nextUrl = getEditPageUrlForItem(itemId);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl === currentUrl) {
    return;
  }

  window.history[historyMethod](window.history.state, "", nextUrl);
};

const getEditorItemMeta = (itemId: EditorItemId): EditorItemMeta | null => {
  const previewItem = (EDITOR_VIEW_ITEMS as readonly EditorItemMeta[]).find(
    (item) => item.id === itemId,
  );
  if (previewItem !== undefined) {
    return previewItem;
  }

  for (const group of EDITOR_GROUPS as readonly {
    label: string;
    items: readonly EditorItemMeta[];
  }[]) {
    const found = group.items.find((item) => item.id === itemId);
    if (found !== undefined) {
      return found;
    }
  }

  return null;
};

const createDocumentSnapshot = () =>
  cloneGameTuningDocument(getRuntimeTuningDocument());

const createDefaultDocumentSnapshot = () =>
  cloneGameTuningDocument(DEFAULT_GAME_TUNING);

const replaceDocumentContents = (
  draft: GameTuningDocument,
  nextDocument: GameTuningDocument,
) => {
  draft.gameplay = nextDocument.gameplay;
  draft.version = nextDocument.version;
  draft.visuals = nextDocument.visuals;
};

const resetObjectFields = <T extends object, K extends keyof T>(
  target: T,
  defaults: T,
  keys: readonly K[],
) => {
  for (const key of keys) {
    target[key] = defaults[key];
  }
};

const canResetItem = (itemId: EditorItemId): boolean => itemId !== "cloak";
const canRestartPreview = (itemId: EditorItemId): boolean =>
  itemId === "orbits";

const getResetLabel = (itemId: EditorItemId): string =>
  itemId === "overview" ? "Reset all" : "Reset item";

const resetItemToDefaults = (
  draft: GameTuningDocument,
  itemId: EditorItemId,
) => {
  const defaults = createDefaultDocumentSnapshot();

  switch (itemId) {
    case "overview":
      replaceDocumentContents(draft, defaults);
      return;
    case "hud":
      draft.visuals.hud = defaults.visuals.hud;
      return;
    case "background":
      draft.visuals.background = defaults.visuals.background;
      return;
    case "planets":
      draft.visuals.planets = defaults.visuals.planets;
      return;
    case "suns":
      draft.visuals.suns = defaults.visuals.suns;
      return;
    case "blackHole":
      draft.gameplay.blackHole = defaults.gameplay.blackHole;
      draft.visuals.blackHole = defaults.visuals.blackHole;
      return;
    case "cannon":
      draft.visuals.cannon = defaults.visuals.cannon;
      return;
    case "rocketLight":
    case "rocketHeavy":
    case "rocketSeeker": {
      const rocketKind = ROCKET_KIND_BY_ITEM[itemId];
      draft.gameplay.rockets[rocketKind] =
        defaults.gameplay.rockets[rocketKind];
      draft.visuals.rockets[rocketKind] = defaults.visuals.rockets[rocketKind];
      return;
    }
    case "foresight":
      draft.gameplay.abilities.foresight =
        defaults.gameplay.abilities.foresight;
      draft.visuals.abilities.foresight = defaults.visuals.abilities.foresight;
      draft.visuals.abilities.foresightColor =
        defaults.visuals.abilities.foresightColor;
      return;
    case "shield":
      draft.gameplay.abilities.shield = defaults.gameplay.abilities.shield;
      draft.visuals.abilities.shieldColor =
        defaults.visuals.abilities.shieldColor;
      return;
    case "boost":
      draft.gameplay.abilities.boost = defaults.gameplay.abilities.boost;
      draft.visuals.abilities.boostColor =
        defaults.visuals.abilities.boostColor;
      return;
    case "gravityPulse":
      draft.gameplay.abilities.gravityPulse =
        defaults.gameplay.abilities.gravityPulse;
      return;
    case "cloak":
      return;
    case "cache":
      draft.gameplay.cache = defaults.gameplay.cache;
      draft.visuals.caches = defaults.visuals.caches;
      return;
    case "orbits":
      draft.gameplay.arena = defaults.gameplay.arena;
      draft.gameplay.orbits = defaults.gameplay.orbits;
      draft.visuals.orbits = defaults.visuals.orbits;
      return;
  }
};

const serializeEditorTuningDocument = (value: GameTuningDocument): unknown => {
  const { drone: _visualDrone, ...visuals } = value.visuals;
  const { drone: _gameplayDrone, ...gameplay } = value.gameplay;

  return {
    ...value,
    gameplay,
    visuals,
  };
};

const getPreviewMode = (
  itemId: EditorItemId,
): {
  showHud: boolean;
} => {
  switch (itemId) {
    case "overview":
      return {
        showHud: true,
      };
    case "hud":
      return {
        showHud: true,
      };
    case "orbits":
      return {
        showHud: false,
      };
    case "background":
      return {
        showHud: false,
      };
    case "planets":
      return {
        showHud: false,
      };
    case "suns":
      return {
        showHud: false,
      };
    case "blackHole":
      return {
        showHud: false,
      };
    case "cannon":
      return {
        showHud: false,
      };
    case "cache":
      return {
        showHud: false,
      };
    case "rocketLight":
      return {
        showHud: false,
      };
    case "rocketHeavy":
      return {
        showHud: false,
      };
    case "rocketSeeker":
      return {
        showHud: false,
      };
    case "foresight":
      return {
        showHud: false,
      };
    case "shield":
      return {
        showHud: false,
      };
    case "boost":
    case "gravityPulse":
    case "cloak":
      return {
        showHud: false,
      };
    default:
      return {
        showHud: false,
      };
  }
};

const describeSaveState = (
  status: "idle" | "loading" | "saving" | "saved" | "error",
): string => {
  switch (status) {
    case "loading":
      return "Loading tuning document";
    case "saving":
      return "Saving tuning document";
    case "saved":
      return "Saved to backend editor tuning store";
    case "error":
      return "Save failed";
    default:
      return "Editing runtime tuning";
  }
};

const updateDocument = (
  source: GameTuningDocument,
  updater: (draft: GameTuningDocument) => void,
): GameTuningDocument => {
  const nextDocument = cloneGameTuningDocument(source);
  updater(nextDocument);
  return nextDocument;
};

function InspectorSection({
  title,
  note,
  children,
  collapsible = false,
  defaultOpen = true,
  onReset,
  resetDisabled = false,
}: {
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  note?: string;
  onReset?: () => void;
  resetDisabled?: boolean;
  title: string;
}) {
  const resetLabel = `Reset ${title}`;
  const handleResetClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onReset?.();
  };
  const headerContent = (
    <div className="edit-inspector__section-header">
      <div className="edit-inspector__section-header-row">
        <div className="edit-inspector__section-heading">
          <div className="edit-inspector__section-title">{title}</div>
          {note ? (
            <div className="edit-inspector__section-note">{note}</div>
          ) : null}
        </div>
        {onReset ? (
          <button
            type="button"
            className="edit-action-button edit-inspector__section-reset"
            disabled={resetDisabled}
            onClick={handleResetClick}
          >
            {resetLabel}
          </button>
        ) : null}
        {collapsible ? (
          <span
            aria-hidden="true"
            className="edit-inspector__section-disclosure"
          />
        ) : null}
      </div>
    </div>
  );

  if (collapsible) {
    return (
      <details
        className="edit-inspector__section edit-inspector__section--collapsible"
        open={defaultOpen}
      >
        <summary className="edit-inspector__section-summary">
          {headerContent}
        </summary>
        <div className="edit-inspector__field-grid">{children}</div>
      </details>
    );
  }

  return (
    <section className="edit-inspector__section">
      {headerContent}
      <div className="edit-inspector__field-grid">{children}</div>
    </section>
  );
}

function NumberField({
  label,
  max,
  min,
  onCommit,
  onPreviewChange,
  step,
  value,
}: {
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  onPreviewChange: (value: number) => void;
  step: number;
  value: number;
}) {
  const [draft, setDraft] = useState(value.toString());

  useEffect(() => {
    setDraft(value.toString());
  }, [value]);

  const commit = () => {
    const nextValue = Number(draft);
    if (!Number.isFinite(nextValue)) {
      setDraft(value.toString());
      return;
    }

    onCommit(nextValue);
  };

  return (
    <label className="edit-field">
      <span className="edit-field__label">{label}</span>
      <input
        type="number"
        className="edit-field__input"
        min={min}
        max={max}
        step={step}
        value={draft}
        onBlur={commit}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value;
          setDraft(nextDraft);
          const nextValue = Number(nextDraft);
          if (Number.isFinite(nextValue)) {
            onPreviewChange(nextValue);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function ColorField({
  label,
  onCommit,
  onPreviewChange,
  value,
}: {
  label: string;
  onCommit: (value: string) => void;
  onPreviewChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="edit-field">
      <span className="edit-field__label">{label}</span>
      <input
        type="color"
        className="edit-field__input edit-field__input--color"
        value={value}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onChange={(event) => onPreviewChange(event.currentTarget.value)}
      />
    </label>
  );
}

function PlanetTintOffsetFields({
  label,
  onCommit,
  onPreviewChange,
  value,
}: {
  label: string;
  onCommit: (channel: keyof PlanetTintOffsetTuning, value: number) => void;
  onPreviewChange: (
    channel: keyof PlanetTintOffsetTuning,
    value: number,
  ) => void;
  value: PlanetTintOffsetTuning;
}) {
  return (
    <>
      <NumberField
        label={`${label} hue`}
        min={-1}
        max={1}
        step={0.01}
        value={value.hue}
        onPreviewChange={(nextValue) => onPreviewChange("hue", nextValue)}
        onCommit={(nextValue) => onCommit("hue", nextValue)}
      />
      <NumberField
        label={`${label} sat`}
        min={-1}
        max={1}
        step={0.01}
        value={value.saturation}
        onPreviewChange={(nextValue) =>
          onPreviewChange("saturation", nextValue)
        }
        onCommit={(nextValue) => onCommit("saturation", nextValue)}
      />
      <NumberField
        label={`${label} light`}
        min={-1}
        max={1}
        step={0.01}
        value={value.lightness}
        onPreviewChange={(nextValue) => onPreviewChange("lightness", nextValue)}
        onCommit={(nextValue) => onCommit("lightness", nextValue)}
      />
    </>
  );
}

function ToggleField({
  label,
  onCommit,
  value,
}: {
  label: string;
  onCommit: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <label className="edit-toggle-field">
      <span className="edit-field__label">{label}</span>
      <input
        type="checkbox"
        className="edit-toggle-field__input"
        checked={value}
        onChange={(event) => onCommit(event.currentTarget.checked)}
      />
    </label>
  );
}

function EditorItemPreview({
  documentValue,
  itemId,
}: {
  documentValue: GameTuningDocument;
  itemId: EditorItemId;
}) {
  switch (itemId) {
    case "overview":
      return (
        <div className="edit-object-preview edit-object-preview--all">
          <span
            className="edit-object-preview__all-planet"
            style={{
              background: documentValue.visuals.planets.archetypes.terra.color,
            }}
          />
          <span className="edit-object-preview__all-sun" />
          <span
            className="edit-object-preview__all-rocket"
            style={{ background: documentValue.visuals.rockets.light.core }}
          />
        </div>
      );
    case "orbits":
      return (
        <div className="edit-object-preview edit-object-preview--orbits">
          <span className="edit-object-preview__orbit-ring" />
          <span className="edit-object-preview__orbit-ring edit-object-preview__orbit-ring--inner" />
          <span className="edit-object-preview__orbit-sun edit-object-preview__orbit-sun--a" />
          <span className="edit-object-preview__orbit-sun edit-object-preview__orbit-sun--b" />
          <span className="edit-object-preview__orbit-sun edit-object-preview__orbit-sun--c" />
        </div>
      );
    case "background": {
      const background = documentValue.visuals.background;
      const starOpacity = background.starsEnabled
        ? Math.max(
            0.16,
            Math.min(0.92, 0.34 + background.starBrightness * 0.28),
          )
        : 0;
      const starSize = 1.6 + background.starSize * 1.4;
      const hazeOpacity = background.nebulaEnabled
        ? 0.18 + background.nebulaStrength * 0.42
        : 0;
      const bodyOpacity = background.distantBodiesEnabled
        ? 0.16 + background.distantBodiesOpacity * 0.5
        : 0;
      return (
        <div
          className="edit-object-preview edit-object-preview--background"
          style={{
            background: `radial-gradient(circle at 50% -10%, ${background.glowColor}, transparent 62%), linear-gradient(180deg, ${background.baseColor}, #010203)`,
          }}
        >
          <span
            className="edit-object-preview__background-haze"
            style={{
              background: `radial-gradient(circle, ${background.nebulaColor}, transparent)`,
              opacity: hazeOpacity,
            }}
          />
          <span
            className="edit-object-preview__background-body"
            style={{
              background: background.distantBodiesColor,
              opacity: bodyOpacity,
            }}
          />
          <span
            className="edit-object-preview__background-star edit-object-preview__background-star--a"
            style={{
              height: `${starSize}px`,
              opacity: starOpacity,
              width: `${starSize}px`,
            }}
          />
          <span
            className="edit-object-preview__background-star edit-object-preview__background-star--b"
            style={{
              height: `${starSize * 0.85}px`,
              opacity: starOpacity * 0.8,
              width: `${starSize * 0.85}px`,
            }}
          />
          <span
            className="edit-object-preview__background-star edit-object-preview__background-star--c"
            style={{
              height: `${starSize * 1.15}px`,
              opacity: starOpacity * 0.94,
              width: `${starSize * 1.15}px`,
            }}
          />
        </div>
      );
    }
    case "planets":
      return (
        <div className="edit-object-preview edit-object-preview--planets">
          {ARCHETYPE_IDS.map((archetype) => (
            <span
              key={archetype}
              className="edit-object-preview__planet"
              style={{
                background:
                  documentValue.visuals.planets.archetypes[archetype].color,
              }}
            />
          ))}
        </div>
      );
    case "suns":
      return (
        <div className="edit-object-preview edit-object-preview--suns">
          {documentValue.visuals.suns.profiles.map((sunVisuals, index) => (
            <span
              key={getDefaultOrbitSunLabel(index)}
              className="edit-object-preview__sun-swatch"
              style={{
                background: `radial-gradient(circle, ${sunVisuals.color} 0%, ${sunVisuals.color} 40%, ${sunVisuals.glowColor} 72%, rgba(255, 255, 255, 0) 100%)`,
                height: `${clamp(
                  8 *
                    (documentValue.gameplay.orbits.suns[index]!.radius /
                      DEFAULT_GAME_TUNING.gameplay.orbits.suns[index]!.radius),
                  6,
                  13,
                )}px`,
                width: `${clamp(
                  8 *
                    (documentValue.gameplay.orbits.suns[index]!.radius /
                      DEFAULT_GAME_TUNING.gameplay.orbits.suns[index]!.radius),
                  6,
                  13,
                )}px`,
              }}
            />
          ))}
        </div>
      );
    case "blackHole":
      return (
        <div className="edit-object-preview edit-object-preview--black-hole">
          <span className="edit-object-preview__black-hole-ring" />
          <span className="edit-object-preview__black-hole-core" />
        </div>
      );
    case "cannon":
      return (
        <div className="edit-object-preview edit-object-preview--cannon">
          <span className="edit-object-preview__cannon-breech" />
          <span className="edit-object-preview__cannon-barrel" />
          <span className="edit-object-preview__cannon-flash" />
        </div>
      );
    case "rocketLight":
    case "rocketHeavy":
    case "rocketSeeker": {
      const rocketKind = ROCKET_KIND_BY_ITEM[itemId];
      const rocket = documentValue.visuals.rockets[rocketKind];
      return (
        <div className="edit-object-preview edit-object-preview--rocket">
          <span
            className="edit-object-preview__rocket-trail"
            style={{
              background: `linear-gradient(90deg, transparent, ${rocket.trail})`,
            }}
          />
          <span
            className="edit-object-preview__rocket-flame"
            style={{
              background: `radial-gradient(circle at 70% 50%, ${rocket.core}, ${rocket.trail} 56%, transparent 86%)`,
            }}
          />
          <span
            className="edit-object-preview__rocket-body"
            style={{
              background: `linear-gradient(90deg, rgba(255, 255, 255, 0.24), ${rocket.core} 34%, ${rocket.core} 72%)`,
            }}
          >
            <span
              className="edit-object-preview__rocket-band"
              style={{ background: rocket.trail }}
            />
            <span
              className="edit-object-preview__rocket-nose"
              style={{ background: rocket.core }}
            />
          </span>
        </div>
      );
    }
    case "foresight":
      return (
        <div
          className="edit-object-preview edit-object-preview--ability"
          style={{
            background: documentValue.visuals.abilities.foresight.dotColor,
          }}
        />
      );
    case "shield":
      return (
        <div
          className="edit-object-preview edit-object-preview--shield"
          style={{ color: documentValue.visuals.abilities.shieldColor }}
        >
          <span className="edit-object-preview__shield-glow" />
          <span className="edit-object-preview__shield-arc" />
          <span className="edit-object-preview__shield-core" />
        </div>
      );
    case "boost":
      return (
        <div className="edit-object-preview edit-object-preview--boost">
          <span
            className="edit-object-preview__boost-wave"
            style={{ background: documentValue.visuals.abilities.boostColor }}
          />
        </div>
      );
    case "gravityPulse":
      return (
        <div
          className="edit-object-preview edit-object-preview--gravity-pulse"
          style={{ color: documentValue.visuals.abilities.wildcardColor }}
        >
          <span className="edit-object-preview__gravity-core" />
          <span className="edit-object-preview__gravity-ring" />
          <span className="edit-object-preview__gravity-ring edit-object-preview__gravity-ring--outer" />
        </div>
      );
    case "cloak":
      return (
        <div
          className="edit-object-preview edit-object-preview--cloak"
          style={{ color: documentValue.visuals.abilities.wildcardColor }}
        >
          <span className="edit-object-preview__cloak-core" />
          <span className="edit-object-preview__cloak-halo" />
          <span className="edit-object-preview__cloak-sheen" />
        </div>
      );
    case "cache":
      return (
        <div className="edit-object-preview edit-object-preview--caches">
          {CACHE_ICON_KEYS.map((iconKey) => (
            <span
              key={iconKey}
              className="edit-object-preview__cache-chip"
              style={{
                background: `linear-gradient(180deg, ${getCacheIconAccent(iconKey)}66, ${getCacheIconAccent(iconKey)}22)`,
                boxShadow: `0 0 10px ${getCacheIconAccent(iconKey)}44`,
              }}
            />
          ))}
        </div>
      );
    case "hud":
      return (
        <div className="edit-object-preview edit-object-preview--hud">
          <span className="edit-object-preview__hud-panel" />
          <span className="edit-object-preview__hud-panel" />
          <span className="edit-object-preview__hud-pill" />
        </div>
      );
  }
}

export function EditPage() {
  const [documentValue, setDocumentValue] = useState(createDocumentSnapshot);
  const [selectedItemId, setSelectedItemId] = useState<EditorItemId>(() =>
    typeof window === "undefined"
      ? DEFAULT_EDITOR_ITEM_ID
      : getEditorItemSelectionFromLocation().itemId,
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "loading" | "saving" | "saved" | "error"
  >("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewResetRevision, setPreviewResetRevision] = useState(0);
  const documentRef = useRef(documentValue);

  useEffect(() => {
    documentRef.current = documentValue;
  }, [documentValue]);

  useEffect(() => {
    const syncSelectedItemFromLocation = () => {
      const nextSelection = getEditorItemSelectionFromLocation();

      startTransition(() => {
        setSelectedItemId(nextSelection.itemId);
      });

      if (nextSelection.shouldNormalizeUrl) {
        syncEditorItemToLocation(nextSelection.itemId, "replaceState");
      }
    };

    syncSelectedItemFromLocation();
    window.addEventListener("popstate", syncSelectedItemFromLocation);
    return () => {
      window.removeEventListener("popstate", syncSelectedItemFromLocation);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/editor/tuning");
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const nextDocument = sanitizeGameTuning(await response.json());
        if (!active) {
          return;
        }

        applyRuntimeTuningDocument(nextDocument);
        documentRef.current = nextDocument;
        startTransition(() => {
          setDocumentValue(nextDocument);
          setSaveStatus("idle");
          setSaveError(null);
        });
      } catch (error) {
        if (!active) {
          return;
        }

        startTransition(() => {
          setSaveStatus("error");
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to load tuning document.",
          );
        });
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const applyPreviewChange = (updater: (draft: GameTuningDocument) => void) => {
    const nextDocument = updateDocument(documentRef.current, updater);
    documentRef.current = nextDocument;
    applyRuntimeTuningDocument(nextDocument);
    setDocumentValue(nextDocument);
  };

  const saveDocument = async (nextDocument: GameTuningDocument) => {
    startTransition(() => {
      setSaveStatus("saving");
      setSaveError(null);
    });

    try {
      const response = await fetch("/api/editor/tuning", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(serializeEditorTuningDocument(nextDocument)),
      });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const savedDocument = sanitizeGameTuning(await response.json());
      applyRuntimeTuningDocument(savedDocument);
      documentRef.current = savedDocument;
      startTransition(() => {
        setDocumentValue(savedDocument);
        setSaveStatus("saved");
        setSaveError(null);
      });
    } catch (error) {
      startTransition(() => {
        setSaveStatus("error");
        setSaveError(
          error instanceof Error ? error.message : "Unable to save tuning.",
        );
      });
    }
  };

  const commitChange = (updater: (draft: GameTuningDocument) => void) => {
    const nextDocument = updateDocument(documentRef.current, updater);
    documentRef.current = nextDocument;
    applyRuntimeTuningDocument(nextDocument);
    setDocumentValue(nextDocument);
    void saveDocument(nextDocument);
  };

  const resetSelectedItem = () => {
    if (!canResetItem(selectedItemId)) {
      return;
    }

    commitChange((draft) => {
      resetItemToDefaults(draft, selectedItemId);
    });
  };
  const resetInspectorSection = (
    resetter: (draft: GameTuningDocument, defaults: GameTuningDocument) => void,
  ) => {
    commitChange((draft) => {
      resetter(draft, createDefaultDocumentSnapshot());
    });
  };
  const sectionResetDisabled =
    saveStatus === "loading" || saveStatus === "saving";

  const restartSelectedPreview = () => {
    if (!canRestartPreview(selectedItemId)) {
      return;
    }

    setPreviewResetRevision((current) => current + 1);
  };

  const renderRocketInspector = (rocketKind: RocketKind) => {
    const rocket = documentValue.gameplay.rockets[rocketKind];
    const visuals = documentValue.visuals.rockets[rocketKind];

    return (
      <>
        <InspectorSection
          title="Gameplay"
          note="Match rules and ammo flow"
          resetDisabled={sectionResetDisabled}
          onReset={() =>
            resetInspectorSection((draft, defaults) => {
              draft.gameplay.rockets[rocketKind] =
                defaults.gameplay.rockets[rocketKind];
            })
          }
        >
          <NumberField
            label="Damage"
            min={0}
            max={500}
            step={1}
            value={rocket.damage}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].damage = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].damage = value;
              })
            }
          />
          <NumberField
            label="Speed"
            min={10}
            max={4000}
            step={10}
            value={rocket.speed}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].speed = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].speed = value;
              })
            }
          />
          <NumberField
            label="Reload"
            min={0.05}
            max={120}
            step={0.05}
            value={rocket.reloadSec}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].reloadSec = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].reloadSec = value;
              })
            }
          />
          <NumberField
            label="TTL"
            min={0.1}
            max={120}
            step={0.1}
            value={rocket.ttlSec}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].ttlSec = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].ttlSec = value;
              })
            }
          />
          <NumberField
            label="Radius"
            min={1}
            max={128}
            step={1}
            value={rocket.radius}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].radius = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].radius = value;
              })
            }
          />
          <NumberField
            label="Start ammo"
            min={0}
            max={32}
            step={1}
            value={rocket.startAmmo}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].startAmmo = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].startAmmo = value;
              })
            }
          />
          <NumberField
            label="Max ammo"
            min={1}
            max={32}
            step={1}
            value={rocket.maxAmmo}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].maxAmmo = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].maxAmmo = value;
              })
            }
          />
          <NumberField
            label="Turn rate"
            min={0}
            max={25}
            step={0.05}
            value={rocket.turnRate}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].turnRate = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].turnRate = value;
              })
            }
          />
        </InspectorSection>

        <InspectorSection
          title="Visuals"
          note="Mesh silhouette and HUD accent"
          resetDisabled={sectionResetDisabled}
          onReset={() =>
            resetInspectorSection((draft, defaults) => {
              draft.visuals.rockets[rocketKind] =
                defaults.visuals.rockets[rocketKind];
            })
          }
        >
          <ColorField
            label="Core"
            value={visuals.core}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].core = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].core = value;
              })
            }
          />
          <ColorField
            label="Trail"
            value={visuals.trail}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].trail = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].trail = value;
              })
            }
          />
          <ColorField
            label="HUD accent"
            value={visuals.hudAccent}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].hudAccent = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].hudAccent = value;
              })
            }
          />
          <NumberField
            label="Body X"
            min={1}
            max={256}
            step={0.1}
            value={visuals.bodyScale.x}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].bodyScale.x = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].bodyScale.x = value;
              })
            }
          />
          <NumberField
            label="Body Y"
            min={1}
            max={256}
            step={0.1}
            value={visuals.bodyScale.y}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].bodyScale.y = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].bodyScale.y = value;
              })
            }
          />
          <NumberField
            label="Flame X"
            min={1}
            max={256}
            step={0.1}
            value={visuals.flameScale.x}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].flameScale.x = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].flameScale.x = value;
              })
            }
          />
          <NumberField
            label="Flame Y"
            min={1}
            max={256}
            step={0.1}
            value={visuals.flameScale.y}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].flameScale.y = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].flameScale.y = value;
              })
            }
          />
          <NumberField
            label="Trail X"
            min={1}
            max={256}
            step={0.1}
            value={visuals.trailScale.x}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].trailScale.x = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].trailScale.x = value;
              })
            }
          />
          <NumberField
            label="Trail Y"
            min={1}
            max={256}
            step={0.1}
            value={visuals.trailScale.y}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].trailScale.y = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].trailScale.y = value;
              })
            }
          />
        </InspectorSection>
      </>
    );
  };

  const renderCannonInspector = () => {
    const cannon = documentValue.visuals.cannon;
    const previewCannonValue = (key: keyof typeof cannon, value: number) => {
      applyPreviewChange((draft) => {
        draft.visuals.cannon[key] = value;
      });
    };
    const commitCannonValue = (key: keyof typeof cannon, value: number) => {
      commitChange((draft) => {
        draft.visuals.cannon[key] = value;
      });
    };

    return (
      <>
        <InspectorSection
          title="Mount"
          note="Stem and breech proportions"
          resetDisabled={sectionResetDisabled}
          onReset={() =>
            resetInspectorSection((draft, defaults) => {
              resetObjectFields(draft.visuals.cannon, defaults.visuals.cannon, [
                "stemLength",
                "stemWidth",
                "breechLength",
                "breechWidth",
                "breechDepth",
              ]);
            })
          }
        >
          <NumberField
            label="Stem length"
            min={0.5}
            max={64}
            step={0.1}
            value={cannon.stemLength}
            onPreviewChange={(value) => previewCannonValue("stemLength", value)}
            onCommit={(value) => commitCannonValue("stemLength", value)}
          />
          <NumberField
            label="Stem width"
            min={0.5}
            max={64}
            step={0.1}
            value={cannon.stemWidth}
            onPreviewChange={(value) => previewCannonValue("stemWidth", value)}
            onCommit={(value) => commitCannonValue("stemWidth", value)}
          />
          <NumberField
            label="Breech length"
            min={1}
            max={96}
            step={0.1}
            value={cannon.breechLength}
            onPreviewChange={(value) =>
              previewCannonValue("breechLength", value)
            }
            onCommit={(value) => commitCannonValue("breechLength", value)}
          />
          <NumberField
            label="Breech width"
            min={1}
            max={96}
            step={0.1}
            value={cannon.breechWidth}
            onPreviewChange={(value) =>
              previewCannonValue("breechWidth", value)
            }
            onCommit={(value) => commitCannonValue("breechWidth", value)}
          />
          <NumberField
            label="Breech depth"
            min={1}
            max={96}
            step={0.1}
            value={cannon.breechDepth}
            onPreviewChange={(value) =>
              previewCannonValue("breechDepth", value)
            }
            onCommit={(value) => commitCannonValue("breechDepth", value)}
          />
        </InspectorSection>

        <InspectorSection
          title="Barrel"
          note="Main silhouette and muzzle"
          resetDisabled={sectionResetDisabled}
          onReset={() =>
            resetInspectorSection((draft, defaults) => {
              resetObjectFields(draft.visuals.cannon, defaults.visuals.cannon, [
                "barrelLength",
                "barrelWidth",
                "bandLength",
                "bandWidth",
                "muzzleLength",
                "muzzleRadius",
              ]);
            })
          }
        >
          <NumberField
            label="Barrel length"
            min={1}
            max={128}
            step={0.1}
            value={cannon.barrelLength}
            onPreviewChange={(value) =>
              previewCannonValue("barrelLength", value)
            }
            onCommit={(value) => commitCannonValue("barrelLength", value)}
          />
          <NumberField
            label="Barrel width"
            min={0.5}
            max={64}
            step={0.1}
            value={cannon.barrelWidth}
            onPreviewChange={(value) =>
              previewCannonValue("barrelWidth", value)
            }
            onCommit={(value) => commitCannonValue("barrelWidth", value)}
          />
          <NumberField
            label="Band length"
            min={0.5}
            max={64}
            step={0.1}
            value={cannon.bandLength}
            onPreviewChange={(value) => previewCannonValue("bandLength", value)}
            onCommit={(value) => commitCannonValue("bandLength", value)}
          />
          <NumberField
            label="Band width"
            min={0.5}
            max={64}
            step={0.1}
            value={cannon.bandWidth}
            onPreviewChange={(value) => previewCannonValue("bandWidth", value)}
            onCommit={(value) => commitCannonValue("bandWidth", value)}
          />
          <NumberField
            label="Muzzle length"
            min={0.5}
            max={64}
            step={0.1}
            value={cannon.muzzleLength}
            onPreviewChange={(value) =>
              previewCannonValue("muzzleLength", value)
            }
            onCommit={(value) => commitCannonValue("muzzleLength", value)}
          />
          <NumberField
            label="Muzzle radius"
            min={0.5}
            max={64}
            step={0.1}
            value={cannon.muzzleRadius}
            onPreviewChange={(value) =>
              previewCannonValue("muzzleRadius", value)
            }
            onCommit={(value) => commitCannonValue("muzzleRadius", value)}
          />
        </InspectorSection>

        <InspectorSection
          title="Flash"
          note="Muzzle bloom size and timing"
          resetDisabled={sectionResetDisabled}
          onReset={() =>
            resetInspectorSection((draft, defaults) => {
              resetObjectFields(draft.visuals.cannon, defaults.visuals.cannon, [
                "flashRadius",
                "flashDurationSec",
              ]);
            })
          }
        >
          <NumberField
            label="Flash radius"
            min={0.5}
            max={128}
            step={0.1}
            value={cannon.flashRadius}
            onPreviewChange={(value) =>
              previewCannonValue("flashRadius", value)
            }
            onCommit={(value) => commitCannonValue("flashRadius", value)}
          />
          <NumberField
            label="Flash duration"
            min={0.02}
            max={2}
            step={0.01}
            value={cannon.flashDurationSec}
            onPreviewChange={(value) =>
              previewCannonValue("flashDurationSec", value)
            }
            onCommit={(value) => commitCannonValue("flashDurationSec", value)}
          />
        </InspectorSection>
      </>
    );
  };

  const renderInspector = () => {
    switch (selectedItemId) {
      case "overview":
        return (
          <>
            <InspectorSection
              title="Gameplay camera"
              note="Fixed gameplay zoom. Set read mode equal to viewport height to remove the extra Shift zoom."
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.camera = defaults.gameplay.camera;
                })
              }
            >
              <NumberField
                label="Viewport world height"
                min={100}
                max={10000}
                step={10}
                value={documentValue.gameplay.camera.viewportWorldHeight}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.camera.viewportWorldHeight = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.camera.viewportWorldHeight = value;
                  })
                }
              />
              <NumberField
                label="Read mode world height"
                min={100}
                max={10000}
                step={10}
                value={documentValue.gameplay.camera.readModeWorldHeight}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.camera.readModeWorldHeight = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.camera.readModeWorldHeight = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "hud":
        return (
          <>
            <InspectorSection
              title="HUD layout"
              note="Outer placement and widths"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(draft.visuals.hud, defaults.visuals.hud, [
                    "topInset",
                    "sideInset",
                    "bottomInset",
                    "leftColumnWidth",
                    "timerWidth",
                    "connectionWidth",
                    "panelGap",
                    "dockGap",
                    "shortcutsSectionGap",
                  ]);
                })
              }
            >
              <NumberField
                label="Top inset"
                min={0}
                max={120}
                step={1}
                value={documentValue.visuals.hud.topInset}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.topInset = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.topInset = value;
                  })
                }
              />
              <NumberField
                label="Side inset"
                min={0}
                max={120}
                step={1}
                value={documentValue.visuals.hud.sideInset}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.sideInset = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.sideInset = value;
                  })
                }
              />
              <NumberField
                label="Bottom inset"
                min={0}
                max={120}
                step={1}
                value={documentValue.visuals.hud.bottomInset}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.bottomInset = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.bottomInset = value;
                  })
                }
              />
              <NumberField
                label="Left column width"
                min={180}
                max={520}
                step={1}
                value={documentValue.visuals.hud.leftColumnWidth}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.leftColumnWidth = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.leftColumnWidth = value;
                  })
                }
              />
              <NumberField
                label="Timer width"
                min={120}
                max={480}
                step={1}
                value={documentValue.visuals.hud.timerWidth}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.timerWidth = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.timerWidth = value;
                  })
                }
              />
              <NumberField
                label="Connection width"
                min={120}
                max={480}
                step={1}
                value={documentValue.visuals.hud.connectionWidth}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.connectionWidth = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.connectionWidth = value;
                  })
                }
              />
              <NumberField
                label="Panel gap"
                min={0}
                max={32}
                step={1}
                value={documentValue.visuals.hud.panelGap}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.panelGap = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.panelGap = value;
                  })
                }
              />
              <NumberField
                label="Dock gap"
                min={0}
                max={32}
                step={1}
                value={documentValue.visuals.hud.dockGap}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.dockGap = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.dockGap = value;
                  })
                }
              />
              <NumberField
                label="Shortcuts gap"
                min={0}
                max={64}
                step={1}
                value={documentValue.visuals.hud.shortcutsSectionGap}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.shortcutsSectionGap = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.shortcutsSectionGap = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="HUD panels"
              note="Radius and glass treatment"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(draft.visuals.hud, defaults.visuals.hud, [
                    "panelRadius",
                    "pillRadius",
                    "cardRadius",
                    "compactCardRadius",
                    "killFeedEntryRadius",
                    "panelBlurPx",
                  ]);
                })
              }
            >
              <NumberField
                label="Panel radius"
                min={4}
                max={40}
                step={1}
                value={documentValue.visuals.hud.panelRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.panelRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.panelRadius = value;
                  })
                }
              />
              <NumberField
                label="Pill radius"
                min={4}
                max={40}
                step={1}
                value={documentValue.visuals.hud.pillRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.pillRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.pillRadius = value;
                  })
                }
              />
              <NumberField
                label="Card radius"
                min={4}
                max={40}
                step={1}
                value={documentValue.visuals.hud.cardRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.cardRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.cardRadius = value;
                  })
                }
              />
              <NumberField
                label="Compact card radius"
                min={4}
                max={32}
                step={1}
                value={documentValue.visuals.hud.compactCardRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.compactCardRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.compactCardRadius = value;
                  })
                }
              />
              <NumberField
                label="Kill feed radius"
                min={4}
                max={32}
                step={1}
                value={documentValue.visuals.hud.killFeedEntryRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.killFeedEntryRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.killFeedEntryRadius = value;
                  })
                }
              />
              <NumberField
                label="Panel blur"
                min={0}
                max={48}
                step={1}
                value={documentValue.visuals.hud.panelBlurPx}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.panelBlurPx = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.panelBlurPx = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "orbits": {
        const orbitPlanetCircleRadiusMax = Math.max(
          documentValue.gameplay.arena.radius,
          documentValue.gameplay.orbits.planetCircleRadius,
        );
        const debrisVisuals = documentValue.visuals.orbits.boundaryDebris;
        const previewDebrisNumber = (
          key: OrbitBoundaryDebrisNumberKey,
          value: number,
        ) =>
          applyPreviewChange((draft) => {
            draft.visuals.orbits.boundaryDebris[key] = value;
          });
        const commitDebrisNumber = (
          key: OrbitBoundaryDebrisNumberKey,
          value: number,
        ) =>
          commitChange((draft) => {
            draft.visuals.orbits.boundaryDebris[key] = value;
          });
        const previewDebrisColor = (
          key: OrbitBoundaryDebrisColorKey,
          value: string,
        ) =>
          applyPreviewChange((draft) => {
            draft.visuals.orbits.boundaryDebris[key] = value;
          });
        const commitDebrisColor = (
          key: OrbitBoundaryDebrisColorKey,
          value: string,
        ) =>
          commitChange((draft) => {
            draft.visuals.orbits.boundaryDebris[key] = value;
          });
        return (
          <>
            <InspectorSection
              title="Arena"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.arena = defaults.gameplay.arena;
                })
              }
            >
              <NumberField
                label="Arena radius"
                min={ARENA_RADIUS_MIN}
                step={ARENA_RADIUS_STEP}
                value={documentValue.gameplay.arena.radius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.radius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.radius = value;
                  })
                }
              />
              <ToggleField
                label="Instant death outside arena"
                value={documentValue.gameplay.arena.instantDeath}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.instantDeath = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Sun system"
              note="Distance keeps the stable orbit ratio and derives starting speed automatically"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.orbits.sunStartDistanceScale =
                    defaults.gameplay.orbits.sunStartDistanceScale;
                })
              }
            >
              <NumberField
                label="Start distance scale"
                min={ORBIT_SUN_DISTANCE_SCALE_MIN}
                max={ORBIT_SUN_DISTANCE_SCALE_MAX}
                step={ORBIT_SUN_DISTANCE_SCALE_STEP}
                value={documentValue.gameplay.orbits.sunStartDistanceScale}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.orbits.sunStartDistanceScale = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.orbits.sunStartDistanceScale = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="System drift"
              note="Applies to suns, caches, and debris. Planets keep their seeded motion. Direction is in deg: 0 east/right, 90 north/up, 180 west/left, 270 south/down."
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.orbits.systemDrift =
                    defaults.gameplay.orbits.systemDrift;
                })
              }
            >
              <NumberField
                label="Direction (deg)"
                min={0}
                max={ORBIT_SYSTEM_DRIFT_DIRECTION_MAX}
                step={ORBIT_SYSTEM_DRIFT_DIRECTION_STEP}
                value={documentValue.gameplay.orbits.systemDrift.directionDeg}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.orbits.systemDrift.directionDeg = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.orbits.systemDrift.directionDeg = value;
                  })
                }
              />
              <NumberField
                label="Drift speed"
                min={0}
                step={ORBIT_SYSTEM_DRIFT_SPEED_STEP}
                value={documentValue.gameplay.orbits.systemDrift.speed}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.orbits.systemDrift.speed = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.orbits.systemDrift.speed = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Planet ring"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.orbits.planetCircleRadius =
                    defaults.gameplay.orbits.planetCircleRadius;
                })
              }
            >
              <NumberField
                label="Planet Orbit Radius"
                min={ORBIT_PLANET_CIRCLE_RADIUS_MIN}
                max={orbitPlanetCircleRadiusMax}
                step={ORBIT_PLANET_CIRCLE_RADIUS_STEP}
                value={documentValue.gameplay.orbits.planetCircleRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.orbits.planetCircleRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.orbits.planetCircleRadius = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Boundary debris"
              note="3D rocks orbiting just outside the arena edge"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.visuals.orbits.boundaryDebris =
                    defaults.visuals.orbits.boundaryDebris;
                })
              }
            >
              <NumberField
                label="Debris density"
                min={ORBIT_BOUNDARY_DEBRIS_DENSITY_MIN}
                step={ORBIT_BOUNDARY_DEBRIS_DENSITY_STEP}
                value={debrisVisuals.density}
                onPreviewChange={(value) =>
                  previewDebrisNumber("density", value)
                }
                onCommit={(value) => commitDebrisNumber("density", value)}
              />
              <NumberField
                label="Debris speed"
                min={ORBIT_BOUNDARY_DEBRIS_SPEED_MIN}
                step={ORBIT_BOUNDARY_DEBRIS_SPEED_STEP}
                value={debrisVisuals.speed}
                onPreviewChange={(value) => previewDebrisNumber("speed", value)}
                onCommit={(value) => commitDebrisNumber("speed", value)}
              />
              <NumberField
                label="Large rock scale"
                min={ORBIT_BOUNDARY_DEBRIS_SCALE_MIN}
                step={ORBIT_BOUNDARY_DEBRIS_SCALE_STEP}
                value={debrisVisuals.largeRockScale}
                onPreviewChange={(value) =>
                  previewDebrisNumber("largeRockScale", value)
                }
                onCommit={(value) =>
                  commitDebrisNumber("largeRockScale", value)
                }
              />
              <NumberField
                label="Small rock scale"
                min={ORBIT_BOUNDARY_DEBRIS_SCALE_MIN}
                step={ORBIT_BOUNDARY_DEBRIS_SCALE_STEP}
                value={debrisVisuals.smallRockScale}
                onPreviewChange={(value) =>
                  previewDebrisNumber("smallRockScale", value)
                }
                onCommit={(value) =>
                  commitDebrisNumber("smallRockScale", value)
                }
              />
              <NumberField
                label="Dust size"
                min={ORBIT_BOUNDARY_DEBRIS_DUST_SIZE_MIN}
                step={ORBIT_BOUNDARY_DEBRIS_DUST_SIZE_STEP}
                value={debrisVisuals.dustSize}
                onPreviewChange={(value) =>
                  previewDebrisNumber("dustSize", value)
                }
                onCommit={(value) => commitDebrisNumber("dustSize", value)}
              />
              <NumberField
                label="Thickness"
                min={ORBIT_BOUNDARY_DEBRIS_THICKNESS_MIN}
                step={ORBIT_BOUNDARY_DEBRIS_THICKNESS_STEP}
                value={debrisVisuals.thickness}
                onPreviewChange={(value) =>
                  previewDebrisNumber("thickness", value)
                }
                onCommit={(value) => commitDebrisNumber("thickness", value)}
              />
              <ColorField
                label="Cool rim color"
                value={debrisVisuals.coolColor}
                onPreviewChange={(value) =>
                  previewDebrisColor("coolColor", value)
                }
                onCommit={(value) => commitDebrisColor("coolColor", value)}
              />
              <ColorField
                label="Warm rim color"
                value={debrisVisuals.warmColor}
                onPreviewChange={(value) =>
                  previewDebrisColor("warmColor", value)
                }
                onCommit={(value) => commitDebrisColor("warmColor", value)}
              />
            </InspectorSection>
            {documentValue.gameplay.orbits.suns.map((sunOrbit, index) => {
              const sunLabel = getDefaultOrbitSunLabel(index);
              const previewOrbitNumber = (
                key: OrbitSunNumberKey,
                value: number,
              ) =>
                applyPreviewChange((draft) => {
                  draft.gameplay.orbits.suns[index]![key] = value;
                });
              const commitOrbitNumber = (
                key: OrbitSunNumberKey,
                value: number,
              ) =>
                commitChange((draft) => {
                  draft.gameplay.orbits.suns[index]![key] = value;
                });
              const previewOrbitVector = (
                key: OrbitSunVectorKey,
                component: OrbitVectorComponentKey,
                value: number,
              ) =>
                applyPreviewChange((draft) => {
                  draft.gameplay.orbits.suns[index]![key][component] = value;
                });
              const commitOrbitVector = (
                key: OrbitSunVectorKey,
                component: OrbitVectorComponentKey,
                value: number,
              ) =>
                commitChange((draft) => {
                  draft.gameplay.orbits.suns[index]![key][component] = value;
                });

              return (
                <InspectorSection
                  key={sunLabel}
                  title={sunLabel}
                  note="Mass, radius, and initial orbit state"
                  collapsible
                  defaultOpen={index === 0}
                  resetDisabled={sectionResetDisabled}
                  onReset={() =>
                    resetInspectorSection((draft, defaults) => {
                      draft.gameplay.orbits.suns[index] =
                        defaults.gameplay.orbits.suns[index];
                    })
                  }
                >
                  <NumberField
                    label="Mass"
                    min={1000}
                    max={5000000}
                    step={1000}
                    value={sunOrbit.mass}
                    onPreviewChange={(value) =>
                      previewOrbitNumber("mass", value)
                    }
                    onCommit={(value) => commitOrbitNumber("mass", value)}
                  />
                  <NumberField
                    label="Radius"
                    min={8}
                    max={500}
                    step={1}
                    value={sunOrbit.radius}
                    onPreviewChange={(value) =>
                      previewOrbitNumber("radius", value)
                    }
                    onCommit={(value) => commitOrbitNumber("radius", value)}
                  />
                  <NumberField
                    label="Start X"
                    min={ORBIT_START_POSITION_MIN}
                    max={ORBIT_START_POSITION_MAX}
                    step={ORBIT_START_POSITION_STEP}
                    value={sunOrbit.pos.x}
                    onPreviewChange={(value) =>
                      previewOrbitVector("pos", "x", value)
                    }
                    onCommit={(value) => commitOrbitVector("pos", "x", value)}
                  />
                  <NumberField
                    label="Start Y"
                    min={ORBIT_START_POSITION_MIN}
                    max={ORBIT_START_POSITION_MAX}
                    step={ORBIT_START_POSITION_STEP}
                    value={sunOrbit.pos.y}
                    onPreviewChange={(value) =>
                      previewOrbitVector("pos", "y", value)
                    }
                    onCommit={(value) => commitOrbitVector("pos", "y", value)}
                  />
                </InspectorSection>
              );
            })}
          </>
        );
      }
      case "background":
        return (
          <>
            <InspectorSection
              title="Backdrop"
              note="Scene clear color, upper glow wash, and broad sky color"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(
                    draft.visuals.background,
                    defaults.visuals.background,
                    ["baseColor", "glowColor"],
                  );
                })
              }
            >
              <ColorField
                label="Base color"
                value={documentValue.visuals.background.baseColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.baseColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.baseColor = value;
                  })
                }
              />
              <ColorField
                label="Glow color"
                value={documentValue.visuals.background.glowColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.glowColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.glowColor = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Stars"
              note="Primary star system, color spread, and twinkle strength"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(
                    draft.visuals.background,
                    defaults.visuals.background,
                    [
                      "starsEnabled",
                      "starDensity",
                      "starBrightness",
                      "starSize",
                      "starTwinkleEnabled",
                      "starTwinkleAmount",
                      "starColorVariance",
                    ],
                  );
                })
              }
            >
              <ToggleField
                label="Enable stars"
                value={documentValue.visuals.background.starsEnabled}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.starsEnabled = value;
                  })
                }
              />
              <NumberField
                label="Star density"
                min={0}
                max={3}
                step={0.05}
                value={documentValue.visuals.background.starDensity}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.starDensity = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.starDensity = value;
                  })
                }
              />
              <NumberField
                label="Star brightness"
                min={0}
                max={3}
                step={0.05}
                value={documentValue.visuals.background.starBrightness}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.starBrightness = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.starBrightness = value;
                  })
                }
              />
              <NumberField
                label="Star size"
                min={0.25}
                max={3}
                step={0.05}
                value={documentValue.visuals.background.starSize}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.starSize = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.starSize = value;
                  })
                }
              />
              <ToggleField
                label="Enable twinkle"
                value={documentValue.visuals.background.starTwinkleEnabled}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.starTwinkleEnabled = value;
                  })
                }
              />
              <NumberField
                label="Twinkle amount"
                min={0}
                max={2}
                step={0.05}
                value={documentValue.visuals.background.starTwinkleAmount}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.starTwinkleAmount = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.starTwinkleAmount = value;
                  })
                }
              />
              <NumberField
                label="Color variance"
                min={0}
                max={1}
                step={0.05}
                value={documentValue.visuals.background.starColorVariance}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.starColorVariance = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.starColorVariance = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Nebula"
              note="Soft drifting cloud layers behind the stars"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(
                    draft.visuals.background,
                    defaults.visuals.background,
                    [
                      "nebulaEnabled",
                      "nebulaColor",
                      "nebulaStrength",
                      "nebulaScale",
                      "nebulaDrift",
                    ],
                  );
                })
              }
            >
              <ToggleField
                label="Enable nebula"
                value={documentValue.visuals.background.nebulaEnabled}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.nebulaEnabled = value;
                  })
                }
              />
              <ColorField
                label="Nebula color"
                value={documentValue.visuals.background.nebulaColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.nebulaColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.nebulaColor = value;
                  })
                }
              />
              <NumberField
                label="Nebula strength"
                min={0}
                max={1}
                step={0.05}
                value={documentValue.visuals.background.nebulaStrength}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.nebulaStrength = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.nebulaStrength = value;
                  })
                }
              />
              <NumberField
                label="Nebula scale"
                min={0.25}
                max={3}
                step={0.05}
                value={documentValue.visuals.background.nebulaScale}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.nebulaScale = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.nebulaScale = value;
                  })
                }
              />
              <NumberField
                label="Nebula drift"
                min={0}
                max={3}
                step={0.05}
                value={documentValue.visuals.background.nebulaDrift}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.nebulaDrift = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.nebulaDrift = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Dust"
              note="Large faint particles that drift slower than the star field"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(
                    draft.visuals.background,
                    defaults.visuals.background,
                    [
                      "dustEnabled",
                      "dustDensity",
                      "dustBrightness",
                      "dustSize",
                      "dustDrift",
                    ],
                  );
                })
              }
            >
              <ToggleField
                label="Enable dust"
                value={documentValue.visuals.background.dustEnabled}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.dustEnabled = value;
                  })
                }
              />
              <NumberField
                label="Dust density"
                min={0}
                max={3}
                step={0.05}
                value={documentValue.visuals.background.dustDensity}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.dustDensity = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.dustDensity = value;
                  })
                }
              />
              <NumberField
                label="Dust brightness"
                min={0}
                max={2}
                step={0.05}
                value={documentValue.visuals.background.dustBrightness}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.dustBrightness = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.dustBrightness = value;
                  })
                }
              />
              <NumberField
                label="Dust size"
                min={0.25}
                max={4}
                step={0.05}
                value={documentValue.visuals.background.dustSize}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.dustSize = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.dustSize = value;
                  })
                }
              />
              <NumberField
                label="Dust drift"
                min={0}
                max={3}
                step={0.05}
                value={documentValue.visuals.background.dustDrift}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.dustDrift = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.dustDrift = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Distant Bodies"
              note="Huge dim planet limbs and far-off body silhouettes"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(
                    draft.visuals.background,
                    defaults.visuals.background,
                    [
                      "distantBodiesEnabled",
                      "distantBodiesColor",
                      "distantBodiesOpacity",
                      "distantBodiesScale",
                    ],
                  );
                })
              }
            >
              <ToggleField
                label="Enable bodies"
                value={documentValue.visuals.background.distantBodiesEnabled}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.distantBodiesEnabled = value;
                  })
                }
              />
              <ColorField
                label="Body color"
                value={documentValue.visuals.background.distantBodiesColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.distantBodiesColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.distantBodiesColor = value;
                  })
                }
              />
              <NumberField
                label="Body opacity"
                min={0}
                max={1}
                step={0.05}
                value={documentValue.visuals.background.distantBodiesOpacity}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.distantBodiesOpacity = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.distantBodiesOpacity = value;
                  })
                }
              />
              <NumberField
                label="Body scale"
                min={0.5}
                max={2.5}
                step={0.05}
                value={documentValue.visuals.background.distantBodiesScale}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.distantBodiesScale = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.distantBodiesScale = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Events"
              note="Rare flashes and distant activity layered into the sky"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(
                    draft.visuals.background,
                    defaults.visuals.background,
                    ["eventsEnabled", "eventsIntensity", "eventsFrequency"],
                  );
                })
              }
            >
              <ToggleField
                label="Enable events"
                value={documentValue.visuals.background.eventsEnabled}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.eventsEnabled = value;
                  })
                }
              />
              <NumberField
                label="Event intensity"
                min={0}
                max={1}
                step={0.05}
                value={documentValue.visuals.background.eventsIntensity}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.eventsIntensity = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.eventsIntensity = value;
                  })
                }
              />
              <NumberField
                label="Event frequency"
                min={0}
                max={3}
                step={0.05}
                value={documentValue.visuals.background.eventsFrequency}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.background.eventsFrequency = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.background.eventsFrequency = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "planets": {
        const previewPlanetColor = (
          archetype: (typeof ARCHETYPE_IDS)[number],
          key:
            | "color"
            | "forestColor"
            | "oceanDeepColor"
            | "oceanShallowColor"
            | "trailColor",
          value: string,
        ) =>
          applyPreviewChange((draft) => {
            draft.visuals.planets.archetypes[archetype][key] = value;
          });

        const commitPlanetColor = (
          archetype: (typeof ARCHETYPE_IDS)[number],
          key:
            | "color"
            | "forestColor"
            | "oceanDeepColor"
            | "oceanShallowColor"
            | "trailColor",
          value: string,
        ) =>
          commitChange((draft) => {
            draft.visuals.planets.archetypes[archetype][key] = value;
          });

        const previewPlanetNumber = (
          archetype: (typeof ARCHETYPE_IDS)[number],
          key:
            | "auraGap"
            | "auraScale"
            | "bodyScale"
            | "continentsScale"
            | "forestAltitude"
            | "forestCoverage"
            | "forestPatchSize"
            | "mountainHeight"
            | "mountainsScale"
            | "seaLevel",
          value: number,
        ) =>
          applyPreviewChange((draft) => {
            draft.visuals.planets.archetypes[archetype][key] = value;
          });

        const commitPlanetNumber = (
          archetype: (typeof ARCHETYPE_IDS)[number],
          key:
            | "auraGap"
            | "auraScale"
            | "bodyScale"
            | "continentsScale"
            | "forestAltitude"
            | "forestCoverage"
            | "forestPatchSize"
            | "mountainHeight"
            | "mountainsScale"
            | "seaLevel",
          value: number,
        ) =>
          commitChange((draft) => {
            draft.visuals.planets.archetypes[archetype][key] = value;
          });

        return (
          <>
            {ARCHETYPE_IDS.map((archetype) => {
              const archetypeVisuals =
                documentValue.visuals.planets.archetypes[archetype];

              return (
                <InspectorSection
                  key={archetype}
                  title={ARCHETYPES[archetype].name}
                  note="Colors, terrain, forests, and atmosphere"
                  collapsible
                  defaultOpen={archetype === "terra"}
                  resetDisabled={sectionResetDisabled}
                  onReset={() =>
                    resetInspectorSection((draft, defaults) => {
                      draft.visuals.planets.archetypes[archetype] =
                        defaults.visuals.planets.archetypes[archetype];
                    })
                  }
                >
                  <ColorField
                    label="Surface"
                    value={archetypeVisuals.color}
                    onPreviewChange={(value) =>
                      previewPlanetColor(archetype, "color", value)
                    }
                    onCommit={(value) =>
                      commitPlanetColor(archetype, "color", value)
                    }
                  />
                  <ColorField
                    label="Trail"
                    value={archetypeVisuals.trailColor}
                    onPreviewChange={(value) =>
                      previewPlanetColor(archetype, "trailColor", value)
                    }
                    onCommit={(value) =>
                      commitPlanetColor(archetype, "trailColor", value)
                    }
                  />
                  <ColorField
                    label="Ocean shallow"
                    value={archetypeVisuals.oceanShallowColor}
                    onPreviewChange={(value) =>
                      previewPlanetColor(archetype, "oceanShallowColor", value)
                    }
                    onCommit={(value) =>
                      commitPlanetColor(archetype, "oceanShallowColor", value)
                    }
                  />
                  <ColorField
                    label="Ocean deep"
                    value={archetypeVisuals.oceanDeepColor}
                    onPreviewChange={(value) =>
                      previewPlanetColor(archetype, "oceanDeepColor", value)
                    }
                    onCommit={(value) =>
                      commitPlanetColor(archetype, "oceanDeepColor", value)
                    }
                  />
                  <ColorField
                    label="Forest"
                    value={archetypeVisuals.forestColor}
                    onPreviewChange={(value) =>
                      previewPlanetColor(archetype, "forestColor", value)
                    }
                    onCommit={(value) =>
                      commitPlanetColor(archetype, "forestColor", value)
                    }
                  />
                  <NumberField
                    label="Forest coverage"
                    min={0}
                    max={2}
                    step={0.01}
                    value={archetypeVisuals.forestCoverage}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "forestCoverage", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "forestCoverage", value)
                    }
                  />
                  <NumberField
                    label="Forest patch size"
                    min={0.5}
                    max={4}
                    step={0.05}
                    value={archetypeVisuals.forestPatchSize}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "forestPatchSize", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "forestPatchSize", value)
                    }
                  />
                  <NumberField
                    label="Forest altitude"
                    min={-0.4}
                    max={0.4}
                    step={0.01}
                    value={archetypeVisuals.forestAltitude}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "forestAltitude", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "forestAltitude", value)
                    }
                  />
                  <NumberField
                    label="Body scale"
                    min={0.5}
                    max={10}
                    step={0.05}
                    value={archetypeVisuals.bodyScale}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "bodyScale", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "bodyScale", value)
                    }
                  />
                  <NumberField
                    label="Aura scale"
                    min={0.5}
                    max={10}
                    step={0.05}
                    value={archetypeVisuals.auraScale}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "auraScale", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "auraScale", value)
                    }
                  />
                  <NumberField
                    label="Aura gap"
                    min={0}
                    max={10}
                    step={0.05}
                    value={archetypeVisuals.auraGap}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "auraGap", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "auraGap", value)
                    }
                  />
                  <NumberField
                    label="Continents scale"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={archetypeVisuals.continentsScale}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "continentsScale", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "continentsScale", value)
                    }
                  />
                  <NumberField
                    label="Mountains scale"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={archetypeVisuals.mountainsScale}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "mountainsScale", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "mountainsScale", value)
                    }
                  />
                  <NumberField
                    label="Mountain height"
                    min={0}
                    max={3}
                    step={0.05}
                    value={archetypeVisuals.mountainHeight}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "mountainHeight", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "mountainHeight", value)
                    }
                  />
                  <NumberField
                    label="Sea level"
                    min={0}
                    max={1}
                    step={0.01}
                    value={archetypeVisuals.seaLevel}
                    onPreviewChange={(value) =>
                      previewPlanetNumber(archetype, "seaLevel", value)
                    }
                    onCommit={(value) =>
                      commitPlanetNumber(archetype, "seaLevel", value)
                    }
                  />
                </InspectorSection>
              );
            })}
          </>
        );
      }
      case "suns":
        return (
          <>
            {documentValue.visuals.suns.profiles.map((sunVisuals, index) => {
              const sunLabel = getDefaultOrbitSunLabel(index);
              const previewSunColor = (
                key: SunProfileColorKey,
                value: string,
              ) =>
                applyPreviewChange((draft) => {
                  draft.visuals.suns.profiles[index]![key] = value;
                });
              const commitSunColor = (key: SunProfileColorKey, value: string) =>
                commitChange((draft) => {
                  draft.visuals.suns.profiles[index]![key] = value;
                });
              const previewSunNumber = (
                key: SunProfileNumberKey,
                value: number,
              ) =>
                applyPreviewChange((draft) => {
                  draft.visuals.suns.profiles[index]![key] = value;
                });
              const commitSunNumber = (
                key: SunProfileNumberKey,
                value: number,
              ) =>
                commitChange((draft) => {
                  draft.visuals.suns.profiles[index]![key] = value;
                });

              return (
                <InspectorSection
                  key={sunLabel}
                  title={sunLabel}
                  note="Color, brightness, and distortion"
                  collapsible
                  defaultOpen={index === 0}
                  resetDisabled={sectionResetDisabled}
                  onReset={() =>
                    resetInspectorSection((draft, defaults) => {
                      draft.visuals.suns.profiles[index] =
                        defaults.visuals.suns.profiles[index];
                    })
                  }
                >
                  <ColorField
                    label="Core color"
                    value={sunVisuals.color}
                    onPreviewChange={(value) => previewSunColor("color", value)}
                    onCommit={(value) => commitSunColor("color", value)}
                  />
                  <ColorField
                    label="Glow color"
                    value={sunVisuals.glowColor}
                    onPreviewChange={(value) =>
                      previewSunColor("glowColor", value)
                    }
                    onCommit={(value) => commitSunColor("glowColor", value)}
                  />
                  <NumberField
                    label="Core brightness"
                    min={0}
                    max={4}
                    step={0.05}
                    value={sunVisuals.coreBrightness}
                    onPreviewChange={(value) =>
                      previewSunNumber("coreBrightness", value)
                    }
                    onCommit={(value) =>
                      commitSunNumber("coreBrightness", value)
                    }
                  />
                  <NumberField
                    label="Glow brightness"
                    min={0}
                    max={4}
                    step={0.05}
                    value={sunVisuals.glowBrightness}
                    onPreviewChange={(value) =>
                      previewSunNumber("glowBrightness", value)
                    }
                    onCommit={(value) =>
                      commitSunNumber("glowBrightness", value)
                    }
                  />
                  <NumberField
                    label="Glow scale"
                    min={0.5}
                    max={8}
                    step={0.05}
                    value={sunVisuals.glowScale}
                    onPreviewChange={(value) =>
                      previewSunNumber("glowScale", value)
                    }
                    onCommit={(value) => commitSunNumber("glowScale", value)}
                  />
                  <NumberField
                    label="Warp scale"
                    min={0.5}
                    max={8}
                    step={0.05}
                    value={sunVisuals.warpScale}
                    onPreviewChange={(value) =>
                      previewSunNumber("warpScale", value)
                    }
                    onCommit={(value) => commitSunNumber("warpScale", value)}
                  />
                </InspectorSection>
              );
            })}
          </>
        );
      case "blackHole":
        return (
          <>
            <InspectorSection
              title="Gameplay"
              note="Overtime timing and gravity"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.blackHole = defaults.gameplay.blackHole;
                })
              }
            >
              <NumberField
                label="Spawn time"
                min={0}
                max={600}
                step={1}
                value={documentValue.gameplay.blackHole.spawnSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.blackHole.spawnSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.blackHole.spawnSec = value;
                  })
                }
              />
              <NumberField
                label="Mass"
                min={0}
                max={50000000}
                step={100000}
                value={documentValue.gameplay.blackHole.mass}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.blackHole.mass = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.blackHole.mass = value;
                  })
                }
              />
              <NumberField
                label="Kill radius"
                min={1}
                max={2000}
                step={1}
                value={documentValue.gameplay.blackHole.killRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.blackHole.killRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.blackHole.killRadius = value;
                  })
                }
              />
              <NumberField
                label="Ramp"
                min={0.1}
                max={600}
                step={0.1}
                value={documentValue.gameplay.blackHole.rampSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.blackHole.rampSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.blackHole.rampSec = value;
                  })
                }
              />
            </InspectorSection>

            <InspectorSection
              title="Visuals"
              note="Disc, lens, and shock radius"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.visuals.blackHole = defaults.visuals.blackHole;
                })
              }
            >
              <NumberField
                label="Core radius"
                min={20}
                max={1500}
                step={1}
                value={documentValue.visuals.blackHole.coreRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.blackHole.coreRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.blackHole.coreRadius = value;
                  })
                }
              />
              <NumberField
                label="Ring radius"
                min={20}
                max={2000}
                step={1}
                value={documentValue.visuals.blackHole.ringRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.blackHole.ringRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.blackHole.ringRadius = value;
                  })
                }
              />
              <NumberField
                label="Lens radius"
                min={20}
                max={2500}
                step={1}
                value={documentValue.visuals.blackHole.lensRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.blackHole.lensRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.blackHole.lensRadius = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "cannon":
        return renderCannonInspector();
      case "rocketLight":
        return renderRocketInspector("light");
      case "rocketHeavy":
        return renderRocketInspector("heavy");
      case "rocketSeeker":
        return renderRocketInspector("seeker");
      case "foresight":
        return (
          <>
            <InspectorSection
              title="Gameplay"
              note="Prediction cadence"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.abilities.foresight =
                    defaults.gameplay.abilities.foresight;
                })
              }
            >
              <NumberField
                label="Cooldown"
                min={0}
                max={300}
                step={0.05}
                value={documentValue.gameplay.abilities.foresight.cooldownSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.foresight.cooldownSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.foresight.cooldownSec = value;
                  })
                }
              />
              <NumberField
                label="Duration"
                min={0.05}
                max={120}
                step={0.05}
                value={documentValue.gameplay.abilities.foresight.durationSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.foresight.durationSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.foresight.durationSec = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Path Style"
              note="Live forecast rendering"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(
                    draft.visuals.abilities.foresight,
                    defaults.visuals.abilities.foresight,
                    [
                      "showDots",
                      "showLine",
                      "pointSize",
                      "dotOpacity",
                      "lineOpacity",
                      "leadGap",
                      "nearStride",
                      "midStride",
                      "farStride",
                    ],
                  );
                })
              }
            >
              <ToggleField
                label="Show dots"
                value={documentValue.visuals.abilities.foresight.showDots}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.showDots = value;
                  })
                }
              />
              <ToggleField
                label="Show line"
                value={documentValue.visuals.abilities.foresight.showLine}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.showLine = value;
                  })
                }
              />
              <NumberField
                label="Dot size"
                min={1}
                max={64}
                step={0.5}
                value={documentValue.visuals.abilities.foresight.pointSize}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresight.pointSize = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.pointSize = value;
                  })
                }
              />
              <NumberField
                label="Dot opacity"
                min={0}
                max={1}
                step={0.01}
                value={documentValue.visuals.abilities.foresight.dotOpacity}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresight.dotOpacity = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.dotOpacity = value;
                  })
                }
              />
              <NumberField
                label="Line opacity"
                min={0}
                max={1}
                step={0.01}
                value={documentValue.visuals.abilities.foresight.lineOpacity}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresight.lineOpacity = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.lineOpacity = value;
                  })
                }
              />
              <NumberField
                label="Lead gap"
                min={0}
                max={120}
                step={1}
                value={documentValue.visuals.abilities.foresight.leadGap}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresight.leadGap = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.leadGap = value;
                  })
                }
              />
              <NumberField
                label="Near step"
                min={1}
                max={12}
                step={1}
                value={documentValue.visuals.abilities.foresight.nearStride}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresight.nearStride = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.nearStride = value;
                  })
                }
              />
              <NumberField
                label="Mid step"
                min={1}
                max={12}
                step={1}
                value={documentValue.visuals.abilities.foresight.midStride}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresight.midStride = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.midStride = value;
                  })
                }
              />
              <NumberField
                label="Far step"
                min={1}
                max={12}
                step={1}
                value={documentValue.visuals.abilities.foresight.farStride}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresight.farStride = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.farStride = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Colors"
              note="HUD accent and path colors"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.visuals.abilities.foresightColor =
                    defaults.visuals.abilities.foresightColor;
                  resetObjectFields(
                    draft.visuals.abilities.foresight,
                    defaults.visuals.abilities.foresight,
                    ["dotColor", "lineColor"],
                  );
                })
              }
            >
              <ColorField
                label="HUD accent"
                value={documentValue.visuals.abilities.foresightColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresightColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresightColor = value;
                  })
                }
              />
              <ColorField
                label="Dot color"
                value={documentValue.visuals.abilities.foresight.dotColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresight.dotColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.dotColor = value;
                  })
                }
              />
              <ColorField
                label="Line color"
                value={documentValue.visuals.abilities.foresight.lineColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresight.lineColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresight.lineColor = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "shield":
        return (
          <>
            <InspectorSection
              title="Gameplay"
              note="Tracking arc and uptime"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.abilities.shield =
                    defaults.gameplay.abilities.shield;
                })
              }
            >
              <NumberField
                label="Cooldown"
                min={0}
                max={300}
                step={0.05}
                value={documentValue.gameplay.abilities.shield.cooldownSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.shield.cooldownSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.shield.cooldownSec = value;
                  })
                }
              />
              <NumberField
                label="Duration"
                min={0.05}
                max={120}
                step={0.05}
                value={documentValue.gameplay.abilities.shield.durationSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.shield.durationSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.shield.durationSec = value;
                  })
                }
              />
              <NumberField
                label="Arc"
                min={1}
                max={359}
                step={1}
                value={documentValue.gameplay.abilities.shield.arcDeg}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.shield.arcDeg = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.shield.arcDeg = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Visuals"
              note="HUD and arc tint"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.visuals.abilities.shieldColor =
                    defaults.visuals.abilities.shieldColor;
                })
              }
            >
              <ColorField
                label="Accent"
                value={documentValue.visuals.abilities.shieldColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.shieldColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.shieldColor = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "boost":
        return (
          <>
            <InspectorSection
              title="Gameplay"
              note="Charge and impulse"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.abilities.boost =
                    defaults.gameplay.abilities.boost;
                })
              }
            >
              <NumberField
                label="Charges"
                min={1}
                max={5}
                step={1}
                value={documentValue.gameplay.abilities.boost.charges}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.boost.charges = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.boost.charges = value;
                  })
                }
              />
              <NumberField
                label="Cooldown"
                min={0.05}
                max={120}
                step={0.05}
                value={documentValue.gameplay.abilities.boost.cooldownSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.boost.cooldownSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.boost.cooldownSec = value;
                  })
                }
              />
              <NumberField
                label="Magnitude"
                min={0}
                max={4000}
                step={10}
                value={documentValue.gameplay.abilities.boost.magnitude}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.boost.magnitude = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.boost.magnitude = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Visuals"
              note="Burst tint"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.visuals.abilities.boostColor =
                    defaults.visuals.abilities.boostColor;
                })
              }
            >
              <ColorField
                label="Accent"
                value={documentValue.visuals.abilities.boostColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.boostColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.boostColor = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "gravityPulse":
        return (
          <>
            <InspectorSection
              title="Gameplay"
              note="Reach and max force"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.abilities.gravityPulse =
                    defaults.gameplay.abilities.gravityPulse;
                })
              }
            >
              <NumberField
                label="Blast radius"
                min={50}
                max={10000}
                step={10}
                value={documentValue.gameplay.abilities.gravityPulse.radius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.gravityPulse.radius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.gravityPulse.radius = value;
                  })
                }
              />
              <NumberField
                label="Blast force"
                min={0}
                max={20000}
                step={10}
                value={documentValue.gameplay.abilities.gravityPulse.force}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.gravityPulse.force = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.gravityPulse.force = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection title="Ability">
              <div className="edit-inspector__note-stack">
                <article className="edit-inspector__note-card">
                  <strong>{WILDCARD_ABILITY_COPY.gravityPulse.title}</strong>
                  <span>{WILDCARD_ABILITY_COPY.gravityPulse.description}</span>
                </article>
              </div>
            </InspectorSection>
          </>
        );
      case "cloak":
        return (
          <InspectorSection title="Ability">
            <div className="edit-inspector__note-stack">
              <article className="edit-inspector__note-card">
                <strong>{WILDCARD_ABILITY_COPY.cloak.title}</strong>
                <span>{WILDCARD_ABILITY_COPY.cloak.description}</span>
              </article>
            </div>
          </InspectorSection>
        );
      case "cache":
        return (
          <>
            <InspectorSection
              title="Gameplay"
              note="Pickup pressure and rotation"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.cache = defaults.gameplay.cache;
                })
              }
            >
              <NumberField
                label="Count"
                min={0}
                max={20}
                step={1}
                value={documentValue.gameplay.cache.count}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.cache.count = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.cache.count = value;
                  })
                }
              />
              <NumberField
                label="Respawn"
                min={0}
                max={300}
                step={0.1}
                value={documentValue.gameplay.cache.respawnSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.cache.respawnSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.cache.respawnSec = value;
                  })
                }
              />
              <NumberField
                label="Wildcard chance"
                min={0}
                max={1}
                step={0.01}
                value={documentValue.gameplay.cache.wildcardChance}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.cache.wildcardChance = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.cache.wildcardChance = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection title="Effects" note="What each cache grants">
              <div className="edit-inspector__cache-guide">
                {CACHE_ICON_KEYS.map((iconKey) => (
                  <article
                    key={iconKey}
                    className="edit-inspector__cache-guide-item"
                  >
                    <span
                      className="edit-inspector__cache-guide-badge"
                      style={{
                        background: `linear-gradient(180deg, ${getCacheIconAccent(iconKey)}66, ${getCacheIconAccent(iconKey)}22)`,
                        boxShadow: `0 0 12px ${getCacheIconAccent(iconKey)}44`,
                        color: getCacheIconAccent(iconKey),
                      }}
                    >
                      {getCacheIconLabel(iconKey)}
                    </span>
                    <div className="edit-inspector__cache-guide-copy">
                      <strong>{CACHE_EFFECT_COPY[iconKey].title}</strong>
                      <span>{CACHE_EFFECT_COPY[iconKey].description}</span>
                    </div>
                  </article>
                ))}
              </div>
            </InspectorSection>
            <InspectorSection
              title="Visuals"
              note="Badge size as rendered in /sandbox"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  resetObjectFields(
                    draft.visuals.caches,
                    defaults.visuals.caches,
                    ["badgeBaseSize", "badgeScale"],
                  );
                })
              }
            >
              <NumberField
                label="Badge size"
                min={Math.round(getCacheArenaBadgeSize(16, 1))}
                max={Math.round(getCacheArenaBadgeSize(400, 1))}
                step={1}
                value={getDisplayedCacheBadgeSize(documentValue)}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    setDisplayedCacheBadgeSize(draft, value);
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    setDisplayedCacheBadgeSize(draft, value);
                  })
                }
              />
            </InspectorSection>
          </>
        );
    }
  };

  const previewMode = getPreviewMode(selectedItemId);
  const selectItem = (itemId: EditorItemId) => {
    setSelectedItemId(itemId);
    syncEditorItemToLocation(itemId, "pushState");
  };

  return (
    <div className="edit-shell">
      <aside className="edit-column edit-column--objects">
        <section className="edit-panel edit-panel--views">
          <div className="edit-panel__eyebrow">Views</div>
          <div className="edit-object-list">
            {EDITOR_VIEW_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`edit-object-card${
                  selectedItemId === item.id ? " edit-object-card--active" : ""
                }`}
                onClick={() => selectItem(item.id)}
              >
                <EditorItemPreview
                  documentValue={documentValue}
                  itemId={item.id}
                />
                <span className="edit-object-card__copy">
                  <span className="edit-object-card__label">{item.label}</span>
                  <span className="edit-object-card__note">{item.note}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {EDITOR_GROUPS.map((group) => (
          <section key={group.label} className="edit-panel">
            <div className="edit-panel__eyebrow">{group.label}</div>
            <div className="edit-object-list">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`edit-object-card${
                    selectedItemId === item.id
                      ? " edit-object-card--active"
                      : ""
                  }`}
                  onClick={() => selectItem(item.id)}
                >
                  <EditorItemPreview
                    documentValue={documentValue}
                    itemId={item.id}
                  />
                  <span className="edit-object-card__copy">
                    <span className="edit-object-card__label">
                      {item.label}
                    </span>
                    <span className="edit-object-card__note">{item.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </aside>

      <main className="edit-column edit-column--preview">
        <div className="edit-preview-frame">
          <EditorPreviewStage
            documentValue={documentValue}
            externalRevision={previewResetRevision}
            hudTuning={documentValue.visuals.hud}
            itemId={selectedItemId}
            showHud={previewMode.showHud}
          />
        </div>
      </main>

      <aside className="edit-column edit-column--inspector">
        <div className="edit-panel edit-panel--sticky">
          <div className="edit-panel__header">
            <div>
              <div className="edit-panel__title edit-panel__title--small">
                {getEditorItemMeta(selectedItemId)?.label}
              </div>
            </div>
            <div className="edit-panel__actions">
              {canRestartPreview(selectedItemId) ? (
                <button
                  type="button"
                  className="edit-action-button"
                  disabled={saveStatus === "loading"}
                  onClick={restartSelectedPreview}
                >
                  Restart sim
                </button>
              ) : null}
              {canResetItem(selectedItemId) ? (
                <button
                  type="button"
                  className="edit-action-button"
                  disabled={saveStatus === "loading" || saveStatus === "saving"}
                  onClick={resetSelectedItem}
                >
                  {getResetLabel(selectedItemId)}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="edit-inspector">{renderInspector()}</div>
      </aside>
    </div>
  );
}
