import {
  ARCHETYPE_IDS,
  ARCHETYPES,
  ARENA_RADIUS_MIN,
  type BotDifficulty,
  clamp,
  clampOrbitPatternDistanceScale,
  cloneGameTuningDocument,
  DEFAULT_GAME_TUNING,
  EDITOR_FIXED_ORBIT_PATTERNS,
  type GameTuningDocument,
  getOrbitPatternMinimumDistanceScale,
  type PlanetTintOffsetTuning,
  type RocketKind,
  resolveEditorFixedOrbitPatternId,
  sanitizeGameTuning,
  type TuningMode,
} from "@3body/shared";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { EditGameViewportPanel } from "./EditGameViewportPanel";
import { EditorPreviewStage } from "./EditorPreviewStage";
import {
  ColorField,
  InspectorSection,
  InspectorSubheading,
  NumberField,
  SelectField,
  ToggleField,
} from "./editInspectorFields";
import {
  DEFAULT_ORBIT_PRESET,
  getDefaultOrbitSunLabel,
} from "./game/orbitPresets";
import {
  applyRuntimeTuningDocument,
  getRuntimeTuningDocument,
} from "./game/runtimeTuning";
import { SHOWCASE_DISPLAY_MODE_OPTIONS } from "./game/showcaseDisplayMode";
import {
  CACHE_ICON_KEYS,
  type CacheIconKey,
  getCacheIconAccent,
  getCacheIconLabel,
} from "./game/showcaseVisuals";
import {
  CACHE_ARENA_BADGE_SIZE_FACTOR,
  getCacheArenaBadgeSize,
} from "./game/viewport/cacheVisuals";
import {
  createInitialHudState,
  type GameViewportController,
} from "./game/viewportHud";

type EditorItemId =
  | "overview"
  | "hud"
  | "orbits"
  | "aiGameplay"
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

type EditorItemMeta = {
  id: EditorItemId;
  label: string;
  note: string;
};

const EDITOR_ITEM_QUERY_PARAM = "item";

const EDITOR_VIEW_ITEMS = [
  { id: "overview", label: "Overview", note: "Showcase + HUD" },
  {
    id: "background",
    label: "Gameplay",
    note: "Backdrop, hazards, and starfield",
  },
  { id: "hud", label: "HUD", note: "HUD only" },
  { id: "orbits", label: "Orbits", note: "Orbit seed tuning" },
  { id: "aiGameplay", label: "AI Gameplay", note: "Local bot battle" },
] as const;

const EDITOR_GROUPS = [
  {
    label: "World",
    items: [
      { id: "planets", label: "Planets", note: "Scale and archetype colors" },
      { id: "suns", label: "Suns", note: "Per-sun size and glow" },
      {
        id: "neutronStars",
        label: "Neutron Stars",
        note: "Planet-only gravity wells",
      },
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
      { id: "shield", label: "Shield", note: "Arc and active tint" },
      { id: "boost", label: "Boost", note: "Charges and impulse" },
      {
        id: "gravityPulse",
        label: "Gravity Pulse",
        note: "Wildcard shockwave",
      },
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
  wildcardGravityPulse: {
    title: "Gravity Pulse",
    description:
      "Wildcard cache. Press G to emit a pulse that blasts planets, rockets, and caches within its blast radius away from your planet. Force falls off linearly with distance.",
  },
};

const WILDCARD_ABILITY_COPY = {
  gravityPulse: {
    description:
      "Press G to emit a pulse that shoves planets, rockets, and caches within its blast radius away from you. Force falls off linearly with distance.",
    title: "Gravity Pulse",
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

const CACHE_BADGE_DISPLAY_SIZE_MAX = 500;
const CACHE_BADGE_BASE_SIZE_MAX = Math.round(
  CACHE_BADGE_DISPLAY_SIZE_MAX / CACHE_ARENA_BADGE_SIZE_FACTOR,
);

const setDisplayedCacheBadgeSize = (
  draft: GameTuningDocument,
  value: number,
) => {
  draft.visuals.caches.badgeBaseSize = Math.max(
    16,
    Math.min(
      CACHE_BADGE_BASE_SIZE_MAX,
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
const ORBIT_BOUNDARY_DEBRIS_BLACK_HOLE_COLLAPSE_MIN = 0.5;
const ORBIT_BOUNDARY_DEBRIS_BLACK_HOLE_COLLAPSE_MAX = 600;
const ORBIT_BOUNDARY_DEBRIS_BLACK_HOLE_COLLAPSE_STEP = 0.5;
const ARENA_ASTEROID_DAMAGE_STEP = 0.1;
const ARENA_ASTEROID_RANDOMIZATION_STEP = 0.01;
const ARENA_ASTEROID_SPAWN_RATE_STEP = 0.05;
const ORBIT_SUN_DISTANCE_SCALE_MIN = 0.5;
const ORBIT_SUN_DISTANCE_SCALE_STEP = 0.05;
const ORBIT_PATTERN_DISTANCE_SCALE_MIN = 0.5;
const ORBIT_PATTERN_DISTANCE_SCALE_STEP = 0.05;
const ORBIT_PATTERN_SPEED_MIN = 0;
const ORBIT_PATTERN_SPEED_STEP = 0.05;
const ORBIT_PLANET_START_SPEED_MIN = 0;
const ORBIT_PLANET_START_SPEED_STEP = 0.05;
const ORBIT_START_POSITION_MIN = -10000;
const ORBIT_START_POSITION_MAX = 10000;
const ORBIT_START_POSITION_STEP = 10;
const ORBIT_STAR_MOTION_OPTIONS = [
  { label: "Physics seed", value: "physicsSeed" },
  { label: "Fixed pattern", value: "fixedPattern" },
] as const;
const ORBIT_PATTERN_OPTIONS = EDITOR_FIXED_ORBIT_PATTERNS.map((pattern) => ({
  label: pattern.label,
  value: pattern.id,
})) as {
  label: string;
  value: string;
}[];
const AI_GAMEPLAY_MIN_PARTICIPANTS = 2;
const AI_GAMEPLAY_MAX_PARTICIPANTS = DEFAULT_ORBIT_PRESET.planets.length;
const BOT_DIFFICULTY_VALUES = ["easy", "normal", "hard"] as const;
const AI_GAMEPLAY_DIFFICULTIES = [
  { label: "Easy", value: "easy" },
  { label: "Normal", value: "normal" },
  { label: "Hard", value: "hard" },
] as const satisfies readonly {
  label: string;
  value: BotDifficulty;
}[];

const formatBotDifficultyLabel = (difficulty: BotDifficulty): string =>
  difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

type NumericFieldConfig<Key extends string> = {
  key: Key;
  label: string;
  max: number;
  min: number;
  step: number;
};

const _PLANET_MATERIAL_TINT_FIELDS = [
  { key: "lowlandTint", label: "Lowland" },
  { key: "highlandTint", label: "Highland" },
  { key: "rockTint", label: "Rock" },
  { key: "snowTint", label: "Snow" },
  { key: "oceanShallowTint", label: "Ocean shallow" },
  { key: "oceanDeepTint", label: "Ocean deep" },
  { key: "forestLightTint", label: "Forest light" },
] as const satisfies readonly { key: PlanetMaterialTintKey; label: string }[];

const _PLANET_SURFACE_GEOMETRY_FIELDS = [
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

const _PLANET_SURFACE_RAMP_FIELDS = [
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

const _PLANET_LIGHTING_FIELDS = [
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

const _PLANET_AURA_TINT_FIELDS = [
  { key: "glowOuterTint", label: "Glow outer" },
  { key: "glowInnerTint", label: "Glow inner" },
] as const satisfies readonly { key: PlanetAuraTintKey; label: string }[];

const _PLANET_AURA_SHAPE_FIELDS = [
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

const _PLANET_AURA_PULSE_FIELDS = [
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

const _PLANET_LIGHT_DIRECTION_FIELDS = [
  { key: "x", label: "Light X", min: -2, max: 2, step: 0.01 },
  { key: "y", label: "Light Y", min: -2, max: 2, step: 0.01 },
  { key: "z", label: "Light Z", min: -2, max: 2, step: 0.01 },
] as const satisfies readonly NumericFieldConfig<PlanetLightDirectionKey>[];

const _PLANET_VARIATION_FIELDS = [
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
  aiGameplay: "ai-gameplay",
  background: "background",
  planets: "planets",
  suns: "suns",
  neutronStars: "neutron",
  blackHole: "black-hole",
  cannon: "turret",
  rocketLight: "light",
  rocketHeavy: "heavy",
  rocketSeeker: "seeker",
  shield: "shield",
  boost: "boost",
  gravityPulse: "gravity-pulse",
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
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("neutronstar", "neutronStars");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("neutronstars", "neutronStars");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("neutron-star", "neutronStars");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("neutron-stars", "neutronStars");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("cannon", "cannon");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("rocketlight", "rocketLight");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("rocketheavy", "rocketHeavy");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("rocketseeker", "rocketSeeker");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("light-missile", "rocketLight");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("heavy-missile", "rocketHeavy");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("seeker-missile", "rocketSeeker");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("gravitypulse", "gravityPulse");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("aigameplay", "aiGameplay");
EDITOR_ITEM_ID_BY_QUERY_VALUE.set("ai-gameplay", "aiGameplay");

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

const canResetItem = (itemId: EditorItemId): boolean => itemId !== "aiGameplay";
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
    case "aiGameplay":
      return;
    case "background":
      draft.visuals.background = defaults.visuals.background;
      draft.gameplay.arena.asteroidField =
        defaults.gameplay.arena.asteroidField;
      return;
    case "planets":
      draft.visuals.planets = defaults.visuals.planets;
      return;
    case "suns":
      draft.visuals.suns = defaults.visuals.suns;
      return;
    case "neutronStars":
      draft.gameplay.neutronStars = defaults.gameplay.neutronStars;
      draft.visuals.neutronStars = defaults.visuals.neutronStars;
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
  return {
    ...value,
    gameplay: value.gameplay,
    visuals: value.visuals,
  };
};

const normalizeEditorTuningDocument = (
  value: GameTuningDocument,
): GameTuningDocument => {
  if (value.gameplay.orbits.starMotion.mode !== "fixedPattern") {
    return value;
  }

  const resolvedPatternId = resolveEditorFixedOrbitPatternId(
    value.gameplay.orbits.starMotion.patternId,
  );
  const clampedDistanceScale = clampOrbitPatternDistanceScale(
    resolvedPatternId,
    value.gameplay.orbits.starPatternDistanceScale,
    value.gameplay.orbits.suns,
  );
  if (
    resolvedPatternId === value.gameplay.orbits.starMotion.patternId &&
    clampedDistanceScale === value.gameplay.orbits.starPatternDistanceScale
  ) {
    return value;
  }

  const nextDocument = cloneGameTuningDocument(value);
  nextDocument.gameplay.orbits.starMotion.patternId = resolvedPatternId;
  nextDocument.gameplay.orbits.starPatternDistanceScale = clampedDistanceScale;
  return nextDocument;
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
    case "aiGameplay":
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
    case "neutronStars":
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
    case "shield":
      return {
        showHud: false,
      };
    case "boost":
    case "gravityPulse":
      return {
        showHud: false,
      };
    default:
      return {
        showHud: false,
      };
  }
};

const _describeSaveState = (
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

const formatMatchClock = (valueSec: number): string => {
  const totalSeconds = Math.max(0, Math.floor(valueSec));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const updateDocument = (
  source: GameTuningDocument,
  updater: (draft: GameTuningDocument) => void,
): GameTuningDocument => {
  const nextDocument = cloneGameTuningDocument(source);
  updater(nextDocument);
  return nextDocument;
};

function _PlanetTintOffsetFields({
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
    case "aiGameplay":
      return (
        <div className="edit-object-preview edit-object-preview--orbits">
          <span className="edit-object-preview__orbit-ring" />
          <span className="edit-object-preview__orbit-ring edit-object-preview__orbit-ring--inner" />
          <span className="edit-object-preview__orbit-sun edit-object-preview__orbit-sun--a" />
          <span className="edit-object-preview__orbit-sun edit-object-preview__orbit-sun--b" />
          <span className="edit-object-preview__orbit-sun edit-object-preview__orbit-sun--c" />
          <span
            className="edit-object-preview__orbit-planet"
            style={{
              background: documentValue.visuals.planets.archetypes.terra.color,
              top: "18%",
              left: "62%",
            }}
          />
          <span
            className="edit-object-preview__orbit-planet"
            style={{
              background: documentValue.visuals.planets.archetypes.ignis.color,
              top: "32%",
              left: "79%",
            }}
          />
          <span
            className="edit-object-preview__orbit-planet"
            style={{
              background: documentValue.visuals.planets.archetypes.umbra.color,
              top: "58%",
              left: "76%",
            }}
          />
          <span
            className="edit-object-preview__orbit-planet"
            style={{
              background:
                documentValue.visuals.planets.archetypes.glacius.color,
              top: "76%",
              left: "56%",
            }}
          />
          <span
            className="edit-object-preview__orbit-planet"
            style={{
              background: documentValue.visuals.planets.archetypes.terra.color,
              top: "74%",
              left: "28%",
            }}
          />
          <span
            className="edit-object-preview__orbit-planet"
            style={{
              background: documentValue.visuals.planets.archetypes.volans.color,
              top: "46%",
              left: "16%",
            }}
          />
          <span
            className="edit-object-preview__orbit-planet"
            style={{
              background: documentValue.visuals.planets.archetypes.oculus.color,
              top: "22%",
              left: "24%",
            }}
          />
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
      const eventOpacity = background.eventsEnabled
        ? Math.max(
            0.16,
            Math.min(0.92, 0.22 + background.eventsIntensity * 0.48),
          )
        : 0;
      const eventPulseDurationSec = Math.max(
        1.2,
        4.6 - background.eventsFrequency * 1.05,
      );
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
          {background.eventsEnabled ? (
            <>
              <span
                className="edit-object-preview__background-event edit-object-preview__background-event--a"
                style={{
                  animationDuration: `${eventPulseDurationSec.toFixed(2)}s`,
                  opacity: eventOpacity,
                }}
              />
              <span
                className="edit-object-preview__background-event edit-object-preview__background-event--b"
                style={{
                  animationDelay: `-${(eventPulseDurationSec * 0.42).toFixed(2)}s`,
                  animationDuration: `${(eventPulseDurationSec * 1.14).toFixed(2)}s`,
                  opacity: eventOpacity * 0.82,
                }}
              />
            </>
          ) : null}
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
    case "neutronStars":
      return (
        <div className="edit-object-preview edit-object-preview--neutron-stars">
          <span className="edit-object-preview__neutron-star-jet edit-object-preview__neutron-star-jet--a" />
          <span className="edit-object-preview__neutron-star-jet edit-object-preview__neutron-star-jet--b" />
          <span className="edit-object-preview__neutron-star-halo" />
          <span className="edit-object-preview__neutron-star-core" />
        </div>
      );
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

export function EditPage({ mode }: { mode: TuningMode }) {
  const [documentValue, setDocumentValue] = useState(createDocumentSnapshot);
  const [selectedItemId, setSelectedItemId] = useState<EditorItemId>(() =>
    typeof window === "undefined"
      ? DEFAULT_EDITOR_ITEM_ID
      : getEditorItemSelectionFromLocation().itemId,
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "loading" | "saving" | "saved" | "error"
  >("loading");
  const [_saveError, setSaveError] = useState<string | null>(null);
  const [previewResetRevision, setPreviewResetRevision] = useState(0);
  const [aiGameplayParticipantCount, setAiGameplayParticipantCount] = useState(
    AI_GAMEPLAY_MAX_PARTICIPANTS,
  );
  const [aiGameplayDifficulty, setAiGameplayDifficulty] =
    useState<BotDifficulty>("normal");
  const [aiGameplayController, setAiGameplayController] =
    useState<GameViewportController | null>(null);
  const [aiGameplayFullscreen, setAiGameplayFullscreen] = useState(false);
  const [aiGameplayHudState, setAiGameplayHudState] = useState(() =>
    createInitialHudState(),
  );
  const documentRef = useRef(documentValue);
  const aiGameplayPreviewRef = useRef<HTMLDivElement | null>(null);

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
    const syncAiGameplayFullscreenState = () => {
      setAiGameplayFullscreen(
        document.fullscreenElement === aiGameplayPreviewRef.current,
      );
    };

    syncAiGameplayFullscreenState();
    document.addEventListener(
      "fullscreenchange",
      syncAiGameplayFullscreenState,
    );
    return () => {
      document.removeEventListener(
        "fullscreenchange",
        syncAiGameplayFullscreenState,
      );
    };
  }, []);

  useEffect(() => {
    if (selectedItemId === "aiGameplay") {
      return;
    }

    const previewElement = aiGameplayPreviewRef.current;
    if (
      previewElement !== null &&
      document.fullscreenElement === previewElement
    ) {
      void document.exitFullscreen();
      return;
    }

    setAiGameplayFullscreen(false);
  }, [selectedItemId]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(`/api/editor/tuning/${mode}`);
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const nextDocument = normalizeEditorTuningDocument(
          sanitizeGameTuning(await response.json()),
        );
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
  }, [mode]);

  const applyPreviewChange = (updater: (draft: GameTuningDocument) => void) => {
    const nextDocument = normalizeEditorTuningDocument(
      updateDocument(documentRef.current, updater),
    );
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
      const response = await fetch(`/api/editor/tuning/${mode}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(serializeEditorTuningDocument(nextDocument)),
      });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const savedDocument = normalizeEditorTuningDocument(
        sanitizeGameTuning(await response.json()),
      );
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
    const nextDocument = normalizeEditorTuningDocument(
      updateDocument(documentRef.current, updater),
    );
    documentRef.current = nextDocument;
    applyRuntimeTuningDocument(nextDocument);
    setDocumentValue(nextDocument);
    void saveDocument(nextDocument);
  };

  const syncCurrentTuning = async () => {
    startTransition(() => {
      setSaveStatus("saving");
      setSaveError(null);
    });

    try {
      const response = await fetch(`/api/editor/tuning/${mode}/sync-current`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const syncedDocument = normalizeEditorTuningDocument(
        sanitizeGameTuning(await response.json()),
      );
      applyRuntimeTuningDocument(syncedDocument);
      documentRef.current = syncedDocument;
      startTransition(() => {
        setDocumentValue(syncedDocument);
        setSaveStatus("saved");
        setSaveError(null);
      });
    } catch (error) {
      startTransition(() => {
        setSaveStatus("error");
        setSaveError(
          error instanceof Error
            ? error.message
            : "Unable to sync current tuning.",
        );
      });
    }
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
  const fixedPatternDistanceScaleMin =
    documentValue.gameplay.orbits.starMotion.mode === "fixedPattern"
      ? Math.max(
          ORBIT_PATTERN_DISTANCE_SCALE_MIN,
          getOrbitPatternMinimumDistanceScale(
            resolveEditorFixedOrbitPatternId(
              documentValue.gameplay.orbits.starMotion.patternId,
            ),
            documentValue.gameplay.orbits.suns,
          ),
        )
      : ORBIT_PATTERN_DISTANCE_SCALE_MIN;
  const fixedPatternDistanceScaleLabel =
    fixedPatternDistanceScaleMin > ORBIT_PATTERN_DISTANCE_SCALE_MIN
      ? `Star distance scale (min ${fixedPatternDistanceScaleMin.toFixed(2)})`
      : "Star distance scale";

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
          {rocketKind === "seeker" ? (
            <NumberField
              label="Lock seconds"
              min={0}
              max={120}
              step={0.05}
              value={rocket.lockSec}
              onPreviewChange={(value) =>
                applyPreviewChange((draft) => {
                  draft.gameplay.rockets.seeker.lockSec = value;
                })
              }
              onCommit={(value) =>
                commitChange((draft) => {
                  draft.gameplay.rockets.seeker.lockSec = value;
                })
              }
            />
          ) : null}
        </InspectorSection>

        <InspectorSection
          title="Visuals"
          note="Mesh silhouette, overall scale, and HUD accent"
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
            label="Scale"
            min={0.1}
            max={32}
            step={0.05}
            value={visuals.scale}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].scale = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].scale = value;
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

  const renderNeutronStarInspector = () => (
    <>
      <InspectorSection
        title="Gameplay"
        note="Planet-only gravity wells with mass-scaled size and optional random placement"
        resetDisabled={sectionResetDisabled}
        onReset={() =>
          resetInspectorSection((draft, defaults) => {
            draft.gameplay.neutronStars = defaults.gameplay.neutronStars;
          })
        }
      >
        <NumberField
          label="Neutron star count"
          min={0}
          max={12}
          step={1}
          value={documentValue.gameplay.neutronStars.count}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.gameplay.neutronStars.count = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.gameplay.neutronStars.count = value;
            })
          }
        />
        <NumberField
          label="Min mass (kg)"
          step={1000}
          value={documentValue.gameplay.neutronStars.minMassKg}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.gameplay.neutronStars.minMassKg = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.gameplay.neutronStars.minMassKg = value;
            })
          }
        />
        <NumberField
          label="Max mass (kg)"
          step={1000}
          value={documentValue.gameplay.neutronStars.maxMassKg}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.gameplay.neutronStars.maxMassKg = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.gameplay.neutronStars.maxMassKg = value;
            })
          }
        />
        <NumberField
          label="Min size"
          min={12}
          max={220}
          step={1}
          value={documentValue.gameplay.neutronStars.minSize}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.gameplay.neutronStars.minSize = value;
              if (draft.gameplay.neutronStars.maxSize < value) {
                draft.gameplay.neutronStars.maxSize = value;
              }
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.gameplay.neutronStars.minSize = value;
              if (draft.gameplay.neutronStars.maxSize < value) {
                draft.gameplay.neutronStars.maxSize = value;
              }
            })
          }
        />
        <NumberField
          label="Max size"
          min={documentValue.gameplay.neutronStars.minSize}
          max={260}
          step={1}
          value={documentValue.gameplay.neutronStars.maxSize}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.gameplay.neutronStars.maxSize = Math.max(
                value,
                draft.gameplay.neutronStars.minSize,
              );
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.gameplay.neutronStars.maxSize = Math.max(
                value,
                draft.gameplay.neutronStars.minSize,
              );
            })
          }
        />
        <ToggleField
          label="Randomize position inside playable circle"
          value={
            documentValue.gameplay.neutronStars
              .randomizePositionInsidePlayableCircle
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.gameplay.neutronStars.randomizePositionInsidePlayableCircle =
                value;
            })
          }
        />
      </InspectorSection>
      <InspectorSection
        title="Visuals"
        note="Control the neutron star halo, lensing disc, and polar jet silhouette"
        resetDisabled={sectionResetDisabled}
        onReset={() =>
          resetInspectorSection((draft, defaults) => {
            draft.visuals.neutronStars = defaults.visuals.neutronStars;
          })
        }
      >
        <NumberField
          label="Halo scale"
          min={0.25}
          max={12}
          step={0.05}
          value={documentValue.visuals.neutronStars.haloScale}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.visuals.neutronStars.haloScale = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.visuals.neutronStars.haloScale = value;
            })
          }
        />
        <NumberField
          label="Halo opacity"
          min={0}
          max={1}
          step={0.01}
          value={documentValue.visuals.neutronStars.haloOpacity}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.visuals.neutronStars.haloOpacity = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.visuals.neutronStars.haloOpacity = value;
            })
          }
        />
        <NumberField
          label="Lens scale"
          min={0.25}
          max={16}
          step={0.05}
          value={documentValue.visuals.neutronStars.lensScale}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.visuals.neutronStars.lensScale = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.visuals.neutronStars.lensScale = value;
            })
          }
        />
        <NumberField
          label="Lens opacity"
          min={0}
          max={1}
          step={0.01}
          value={documentValue.visuals.neutronStars.lensOpacity}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.visuals.neutronStars.lensOpacity = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.visuals.neutronStars.lensOpacity = value;
            })
          }
        />
        <NumberField
          label="Jet length scale"
          min={0.25}
          max={16}
          step={0.05}
          value={documentValue.visuals.neutronStars.jetLengthScale}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.visuals.neutronStars.jetLengthScale = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.visuals.neutronStars.jetLengthScale = value;
            })
          }
        />
        <NumberField
          label="Jet width scale"
          min={0.02}
          max={4}
          step={0.01}
          value={documentValue.visuals.neutronStars.jetWidthScale}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.visuals.neutronStars.jetWidthScale = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.visuals.neutronStars.jetWidthScale = value;
            })
          }
        />
        <NumberField
          label="Jet opacity"
          min={0}
          max={1}
          step={0.01}
          value={documentValue.visuals.neutronStars.jetOpacity}
          onPreviewChange={(value) =>
            applyPreviewChange((draft) => {
              draft.visuals.neutronStars.jetOpacity = value;
            })
          }
          onCommit={(value) =>
            commitChange((draft) => {
              draft.visuals.neutronStars.jetOpacity = value;
            })
          }
        />
      </InspectorSection>
    </>
  );

  const renderInspector = () => {
    switch (selectedItemId) {
      case "overview":
        return (
          <>
            <InspectorSection
              title="Preview Style"
              note="This post-processing preset is saved in tuning and reused by the local sandbox."
            >
              <SelectField
                label="Display mode"
                options={SHOWCASE_DISPLAY_MODE_OPTIONS}
                value={documentValue.visuals.displayMode}
                onCommit={(mode) =>
                  commitChange((draft) => {
                    draft.visuals.displayMode = mode;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Camera Modes"
              note="Larger values zoom farther out. Sandbox uses the gameplay camera height."
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.camera = defaults.gameplay.camera;
                })
              }
            >
              <NumberField
                label="Gameplay camera height"
                step={10}
                value={documentValue.gameplay.camera.gameplayCameraWorldHeight}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.camera.gameplayCameraWorldHeight = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.camera.gameplayCameraWorldHeight = value;
                  })
                }
              />
              <NumberField
                label="Preview camera height"
                step={10}
                value={documentValue.gameplay.camera.previewCameraWorldHeight}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.camera.previewCameraWorldHeight = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.camera.previewCameraWorldHeight = value;
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
      case "aiGameplay": {
        const aiTuning = documentValue.gameplay.ai;
        const previewMovementScalar = (
          key: "candidateDirections" | "objectiveFanoutDeg",
          value: number,
        ) =>
          applyPreviewChange((draft) => {
            draft.gameplay.ai.movement[key] = value;
          });
        const commitMovementScalar = (
          key: "candidateDirections" | "objectiveFanoutDeg",
          value: number,
        ) =>
          commitChange((draft) => {
            draft.gameplay.ai.movement[key] = value;
          });
        const previewMovementDifficulty = (
          key: "evaluationHorizonSec" | "simulationSteps",
          difficulty: BotDifficulty,
          value: number,
        ) =>
          applyPreviewChange((draft) => {
            draft.gameplay.ai.movement[key][difficulty] = value;
          });
        const commitMovementDifficulty = (
          key: "evaluationHorizonSec" | "simulationSteps",
          difficulty: BotDifficulty,
          value: number,
        ) =>
          commitChange((draft) => {
            draft.gameplay.ai.movement[key][difficulty] = value;
          });
        const previewThreatDifficulty = (
          key: "lookaheadSec" | "simulationSteps",
          difficulty: BotDifficulty,
          value: number,
        ) =>
          applyPreviewChange((draft) => {
            draft.gameplay.ai.threat[key][difficulty] = value;
          });
        const commitThreatDifficulty = (
          key: "lookaheadSec" | "simulationSteps",
          difficulty: BotDifficulty,
          value: number,
        ) =>
          commitChange((draft) => {
            draft.gameplay.ai.threat[key][difficulty] = value;
          });
        const previewShotDifficulty = (
          key: "targetPredictionHorizonSec" | "targetPredictionSteps",
          difficulty: BotDifficulty,
          value: number,
        ) =>
          applyPreviewChange((draft) => {
            draft.gameplay.ai.shots[key][difficulty] = value;
          });
        const commitShotDifficulty = (
          key: "targetPredictionHorizonSec" | "targetPredictionSteps",
          difficulty: BotDifficulty,
          value: number,
        ) =>
          commitChange((draft) => {
            draft.gameplay.ai.shots[key][difficulty] = value;
          });
        const previewExecutionNumber = (
          key:
            | "boostCommitScoreDelta"
            | "cacheRunFireConfidence"
            | "pressureLightOverrideConfidence"
            | "pressureLightOverrideDamage"
            | "pressureLightOverrideWaste"
            | "repositionFireConfidence",
          value: number,
        ) =>
          applyPreviewChange((draft) => {
            draft.gameplay.ai.execution[key] = value;
          });
        const commitExecutionNumber = (
          key:
            | "boostCommitScoreDelta"
            | "cacheRunFireConfidence"
            | "pressureLightOverrideConfidence"
            | "pressureLightOverrideDamage"
            | "pressureLightOverrideWaste"
            | "repositionFireConfidence",
          value: number,
        ) =>
          commitChange((draft) => {
            draft.gameplay.ai.execution[key] = value;
          });

        return (
          <>
            <InspectorSection
              title="AI Setup"
              note="Observer sandbox seeded from the current runtime tuning"
            >
              <NumberField
                label="AI pilots"
                min={AI_GAMEPLAY_MIN_PARTICIPANTS}
                max={AI_GAMEPLAY_MAX_PARTICIPANTS}
                step={1}
                value={aiGameplayParticipantCount}
                onPreviewChange={setClampedAiGameplayParticipantCount}
                onCommit={setClampedAiGameplayParticipantCount}
              />
              <SelectField
                label="Difficulty"
                options={AI_GAMEPLAY_DIFFICULTIES}
                value={aiGameplayDifficulty}
                onCommit={setAiGameplayDifficulty}
              />
            </InspectorSection>
            <InspectorSection
              title="Navigation Search"
              note="How aggressively the planner explores gravity-driven boost routes"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.ai.movement = defaults.gameplay.ai.movement;
                  draft.gameplay.ai.execution.boostCommitScoreDelta =
                    defaults.gameplay.ai.execution.boostCommitScoreDelta;
                })
              }
            >
              <NumberField
                label="Candidate directions"
                min={4}
                max={32}
                step={1}
                value={aiTuning.movement.candidateDirections}
                onPreviewChange={(value) =>
                  previewMovementScalar("candidateDirections", value)
                }
                onCommit={(value) =>
                  commitMovementScalar("candidateDirections", value)
                }
              />
              <NumberField
                label="Objective fanout"
                min={0}
                max={90}
                step={1}
                value={aiTuning.movement.objectiveFanoutDeg}
                onPreviewChange={(value) =>
                  previewMovementScalar("objectiveFanoutDeg", value)
                }
                onCommit={(value) =>
                  commitMovementScalar("objectiveFanoutDeg", value)
                }
              />
              <NumberField
                label="Boost commit delta"
                min={0}
                max={30}
                step={0.5}
                value={aiTuning.execution.boostCommitScoreDelta}
                onPreviewChange={(value) =>
                  previewExecutionNumber("boostCommitScoreDelta", value)
                }
                onCommit={(value) =>
                  commitExecutionNumber("boostCommitScoreDelta", value)
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Movement Horizon"
              note="Planet navigation lookahead under suns, arena edge, and black hole pressure"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.ai.movement.evaluationHorizonSec =
                    defaults.gameplay.ai.movement.evaluationHorizonSec;
                  draft.gameplay.ai.movement.simulationSteps =
                    defaults.gameplay.ai.movement.simulationSteps;
                })
              }
            >
              {BOT_DIFFICULTY_VALUES.map((difficulty) => (
                <NumberField
                  key={`movement-horizon-${difficulty}`}
                  label={`Move horizon ${formatBotDifficultyLabel(difficulty)}`}
                  min={0.4}
                  max={8}
                  step={0.05}
                  value={aiTuning.movement.evaluationHorizonSec[difficulty]}
                  onPreviewChange={(value) =>
                    previewMovementDifficulty(
                      "evaluationHorizonSec",
                      difficulty,
                      value,
                    )
                  }
                  onCommit={(value) =>
                    commitMovementDifficulty(
                      "evaluationHorizonSec",
                      difficulty,
                      value,
                    )
                  }
                />
              ))}
              {BOT_DIFFICULTY_VALUES.map((difficulty) => (
                <NumberField
                  key={`movement-steps-${difficulty}`}
                  label={`Move steps ${formatBotDifficultyLabel(difficulty)}`}
                  min={4}
                  max={96}
                  step={1}
                  value={aiTuning.movement.simulationSteps[difficulty]}
                  onPreviewChange={(value) =>
                    previewMovementDifficulty(
                      "simulationSteps",
                      difficulty,
                      value,
                    )
                  }
                  onCommit={(value) =>
                    commitMovementDifficulty(
                      "simulationSteps",
                      difficulty,
                      value,
                    )
                  }
                />
              ))}
            </InspectorSection>
            <InspectorSection
              title="Threat Lookahead"
              note="How far ahead missile and hazard avoidance probes when choosing escape burns"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.ai.threat = defaults.gameplay.ai.threat;
                })
              }
            >
              {BOT_DIFFICULTY_VALUES.map((difficulty) => (
                <NumberField
                  key={`threat-horizon-${difficulty}`}
                  label={`Threat horizon ${formatBotDifficultyLabel(difficulty)}`}
                  min={0.4}
                  max={8}
                  step={0.05}
                  value={aiTuning.threat.lookaheadSec[difficulty]}
                  onPreviewChange={(value) =>
                    previewThreatDifficulty("lookaheadSec", difficulty, value)
                  }
                  onCommit={(value) =>
                    commitThreatDifficulty("lookaheadSec", difficulty, value)
                  }
                />
              ))}
              {BOT_DIFFICULTY_VALUES.map((difficulty) => (
                <NumberField
                  key={`threat-steps-${difficulty}`}
                  label={`Threat steps ${formatBotDifficultyLabel(difficulty)}`}
                  min={4}
                  max={96}
                  step={1}
                  value={aiTuning.threat.simulationSteps[difficulty]}
                  onPreviewChange={(value) =>
                    previewThreatDifficulty(
                      "simulationSteps",
                      difficulty,
                      value,
                    )
                  }
                  onCommit={(value) =>
                    commitThreatDifficulty("simulationSteps", difficulty, value)
                  }
                />
              ))}
            </InspectorSection>
            <InspectorSection
              title="Shot Prediction"
              note="Target lead horizon used when tracking moving planets for firing windows"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.ai.shots.targetPredictionHorizonSec =
                    defaults.gameplay.ai.shots.targetPredictionHorizonSec;
                  draft.gameplay.ai.shots.targetPredictionSteps =
                    defaults.gameplay.ai.shots.targetPredictionSteps;
                })
              }
            >
              {BOT_DIFFICULTY_VALUES.map((difficulty) => (
                <NumberField
                  key={`shot-horizon-${difficulty}`}
                  label={`Shot horizon ${formatBotDifficultyLabel(difficulty)}`}
                  min={0.2}
                  max={8}
                  step={0.05}
                  value={aiTuning.shots.targetPredictionHorizonSec[difficulty]}
                  onPreviewChange={(value) =>
                    previewShotDifficulty(
                      "targetPredictionHorizonSec",
                      difficulty,
                      value,
                    )
                  }
                  onCommit={(value) =>
                    commitShotDifficulty(
                      "targetPredictionHorizonSec",
                      difficulty,
                      value,
                    )
                  }
                />
              ))}
              {BOT_DIFFICULTY_VALUES.map((difficulty) => (
                <NumberField
                  key={`shot-steps-${difficulty}`}
                  label={`Shot steps ${formatBotDifficultyLabel(difficulty)}`}
                  min={4}
                  max={96}
                  step={1}
                  value={aiTuning.shots.targetPredictionSteps[difficulty]}
                  onPreviewChange={(value) =>
                    previewShotDifficulty(
                      "targetPredictionSteps",
                      difficulty,
                      value,
                    )
                  }
                  onCommit={(value) =>
                    commitShotDifficulty(
                      "targetPredictionSteps",
                      difficulty,
                      value,
                    )
                  }
                />
              ))}
            </InspectorSection>
            <InspectorSection
              title="Fire Gates"
              note="Rules for when movement plans are allowed to convert into actual shots"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.ai.execution.cacheRunFireConfidence =
                    defaults.gameplay.ai.execution.cacheRunFireConfidence;
                  draft.gameplay.ai.execution.pressureLightOverrideConfidence =
                    defaults.gameplay.ai.execution.pressureLightOverrideConfidence;
                  draft.gameplay.ai.execution.pressureLightOverrideDamage =
                    defaults.gameplay.ai.execution.pressureLightOverrideDamage;
                  draft.gameplay.ai.execution.pressureLightOverrideWaste =
                    defaults.gameplay.ai.execution.pressureLightOverrideWaste;
                  draft.gameplay.ai.execution.repositionFireConfidence =
                    defaults.gameplay.ai.execution.repositionFireConfidence;
                })
              }
            >
              <NumberField
                label="Cache run fire confidence"
                min={0}
                max={1}
                step={0.01}
                value={aiTuning.execution.cacheRunFireConfidence}
                onPreviewChange={(value) =>
                  previewExecutionNumber("cacheRunFireConfidence", value)
                }
                onCommit={(value) =>
                  commitExecutionNumber("cacheRunFireConfidence", value)
                }
              />
              <NumberField
                label="Reposition fire confidence"
                min={0}
                max={1}
                step={0.01}
                value={aiTuning.execution.repositionFireConfidence}
                onPreviewChange={(value) =>
                  previewExecutionNumber("repositionFireConfidence", value)
                }
                onCommit={(value) =>
                  commitExecutionNumber("repositionFireConfidence", value)
                }
              />
              <NumberField
                label="Pressure light confidence"
                min={0}
                max={1}
                step={0.01}
                value={aiTuning.execution.pressureLightOverrideConfidence}
                onPreviewChange={(value) =>
                  previewExecutionNumber(
                    "pressureLightOverrideConfidence",
                    value,
                  )
                }
                onCommit={(value) =>
                  commitExecutionNumber(
                    "pressureLightOverrideConfidence",
                    value,
                  )
                }
              />
              <NumberField
                label="Pressure light damage"
                min={0}
                max={50}
                step={0.5}
                value={aiTuning.execution.pressureLightOverrideDamage}
                onPreviewChange={(value) =>
                  previewExecutionNumber("pressureLightOverrideDamage", value)
                }
                onCommit={(value) =>
                  commitExecutionNumber("pressureLightOverrideDamage", value)
                }
              />
              <NumberField
                label="Pressure light waste"
                min={0}
                max={1}
                step={0.01}
                value={aiTuning.execution.pressureLightOverrideWaste}
                onPreviewChange={(value) =>
                  previewExecutionNumber("pressureLightOverrideWaste", value)
                }
                onCommit={(value) =>
                  commitExecutionNumber("pressureLightOverrideWaste", value)
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Live Match"
              note="Current status from the observer viewport"
            >
              <div className="edit-inspector__note-stack">
                <article className="edit-inspector__note-card">
                  <strong>Alive pilots</strong>
                  <span>
                    {aiGameplayHudState.alivePlayerCount} /{" "}
                    {Math.max(
                      aiGameplayHudState.totalPlayerCount,
                      aiGameplayParticipantCount,
                    )}
                  </span>
                </article>
                <article className="edit-inspector__note-card">
                  <strong>Match clock</strong>
                  <span>
                    {formatMatchClock(aiGameplayHudState.timerElapsedSec)}
                  </span>
                </article>
                <article className="edit-inspector__note-card">
                  <strong>Focused pilot</strong>
                  <span>{aiGameplayHudState.playerLabel}</span>
                </article>
                <article className="edit-inspector__note-card">
                  <strong>Playback</strong>
                  <span>
                    {aiGameplayHudState.sandboxPaused ? "Paused" : "Running"}
                  </span>
                </article>
                <article className="edit-inspector__note-card">
                  <strong>Preview wiring</strong>
                  <span>
                    Orbit, arena, weapon, ability, and AI movement edits now
                    feed this live sandbox match as you tune them.
                  </span>
                </article>
              </div>
            </InspectorSection>
          </>
        );
      }
      case "orbits": {
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
              title="Star motion"
              note={
                documentValue.gameplay.orbits.starMotion.mode === "physicsSeed"
                  ? "Distance keeps the stable orbit ratio and derives starting speed automatically"
                  : "Loop-stable patterns keep the stars on a stable path while planets still feel their gravity"
              }
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.orbits.starMotion =
                    defaults.gameplay.orbits.starMotion;
                  draft.gameplay.orbits.starPatternDistanceScale =
                    defaults.gameplay.orbits.starPatternDistanceScale;
                  draft.gameplay.orbits.sunStartDistanceScale =
                    defaults.gameplay.orbits.sunStartDistanceScale;
                  draft.gameplay.orbits.planetStartSpeedScale =
                    defaults.gameplay.orbits.planetStartSpeedScale;
                })
              }
            >
              <SelectField
                label="Star motion"
                options={ORBIT_STAR_MOTION_OPTIONS}
                value={documentValue.gameplay.orbits.starMotion.mode}
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.orbits.starMotion.mode = value;
                  })
                }
              />
              {documentValue.gameplay.orbits.starMotion.mode ===
              "fixedPattern" ? (
                <>
                  <SelectField
                    label="Pattern"
                    options={ORBIT_PATTERN_OPTIONS}
                    value={resolveEditorFixedOrbitPatternId(
                      documentValue.gameplay.orbits.starMotion.patternId,
                    )}
                    onCommit={(value) =>
                      commitChange((draft) => {
                        draft.gameplay.orbits.starMotion.patternId = value;
                      })
                    }
                  />
                  <NumberField
                    label="Star pattern speed"
                    min={ORBIT_PATTERN_SPEED_MIN}
                    step={ORBIT_PATTERN_SPEED_STEP}
                    value={documentValue.gameplay.orbits.starMotion.speed}
                    onPreviewChange={(value) =>
                      applyPreviewChange((draft) => {
                        draft.gameplay.orbits.starMotion.speed = value;
                      })
                    }
                    onCommit={(value) =>
                      commitChange((draft) => {
                        draft.gameplay.orbits.starMotion.speed = value;
                      })
                    }
                  />
                  <NumberField
                    label={fixedPatternDistanceScaleLabel}
                    min={fixedPatternDistanceScaleMin}
                    step={ORBIT_PATTERN_DISTANCE_SCALE_STEP}
                    value={
                      documentValue.gameplay.orbits.starPatternDistanceScale
                    }
                    onPreviewChange={(value) =>
                      applyPreviewChange((draft) => {
                        draft.gameplay.orbits.starPatternDistanceScale = value;
                      })
                    }
                    onCommit={(value) =>
                      commitChange((draft) => {
                        draft.gameplay.orbits.starPatternDistanceScale = value;
                      })
                    }
                  />
                  <NumberField
                    label="Planet start speed"
                    min={ORBIT_PLANET_START_SPEED_MIN}
                    step={ORBIT_PLANET_START_SPEED_STEP}
                    value={documentValue.gameplay.orbits.planetStartSpeedScale}
                    onPreviewChange={(value) =>
                      applyPreviewChange((draft) => {
                        draft.gameplay.orbits.planetStartSpeedScale = value;
                      })
                    }
                    onCommit={(value) =>
                      commitChange((draft) => {
                        draft.gameplay.orbits.planetStartSpeedScale = value;
                      })
                    }
                  />
                </>
              ) : (
                <NumberField
                  label="Start distance scale"
                  min={ORBIT_SUN_DISTANCE_SCALE_MIN}
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
              )}
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
              <NumberField
                label="Black hole collapse"
                min={ORBIT_BOUNDARY_DEBRIS_BLACK_HOLE_COLLAPSE_MIN}
                max={ORBIT_BOUNDARY_DEBRIS_BLACK_HOLE_COLLAPSE_MAX}
                step={ORBIT_BOUNDARY_DEBRIS_BLACK_HOLE_COLLAPSE_STEP}
                value={debrisVisuals.blackHoleCollapseSec}
                onPreviewChange={(value) =>
                  previewDebrisNumber("blackHoleCollapseSec", value)
                }
                onCommit={(value) =>
                  commitDebrisNumber("blackHoleCollapseSec", value)
                }
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
                  note={
                    documentValue.gameplay.orbits.starMotion.mode ===
                    "fixedPattern"
                      ? "Mass and radius still apply, but the selected pattern drives the stars' path"
                      : "Mass, radius, and initial orbit state"
                  }
                  collapsible
                  defaultOpen={index === 0}
                  resetDisabled={sectionResetDisabled}
                  onReset={() =>
                    resetInspectorSection((draft, defaults) => {
                      draft.gameplay.orbits.suns[index] =
                        defaults.gameplay.orbits.suns[index]!;
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
                    step={1}
                    value={sunOrbit.radius}
                    onPreviewChange={(value) =>
                      previewOrbitNumber("radius", value)
                    }
                    onCommit={(value) => commitOrbitNumber("radius", value)}
                  />
                  {documentValue.gameplay.orbits.starMotion.mode ===
                  "physicsSeed" ? (
                    <>
                      <NumberField
                        label="Start X"
                        min={ORBIT_START_POSITION_MIN}
                        max={ORBIT_START_POSITION_MAX}
                        step={ORBIT_START_POSITION_STEP}
                        value={sunOrbit.pos.x}
                        onPreviewChange={(value) =>
                          previewOrbitVector("pos", "x", value)
                        }
                        onCommit={(value) =>
                          commitOrbitVector("pos", "x", value)
                        }
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
                        onCommit={(value) =>
                          commitOrbitVector("pos", "y", value)
                        }
                      />
                    </>
                  ) : null}
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
              title="Asteroid Field"
              note="Some boundary debris breaks off the ring, drifts inward, and explodes on impact. Falls per second controls how often each tier spawns; inward drift randomization controls how aggressively that tier bends toward the center, and 0 disables inward fallout for that tier."
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.arena.asteroidField =
                    defaults.gameplay.arena.asteroidField;
                })
              }
            >
              <InspectorSubheading label="Micro" />
              <NumberField
                label="Damage"
                min={0}
                step={ARENA_ASTEROID_DAMAGE_STEP}
                value={documentValue.gameplay.arena.asteroidField.micro.damage}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.asteroidField.micro.damage = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.asteroidField.micro.damage = value;
                  })
                }
              />
              <NumberField
                label="Inward drift randomization"
                min={0}
                max={1}
                step={ARENA_ASTEROID_RANDOMIZATION_STEP}
                value={
                  documentValue.gameplay.arena.asteroidField.micro.randomization
                }
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.asteroidField.micro.randomization =
                      value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.asteroidField.micro.randomization =
                      value;
                  })
                }
              />
              <NumberField
                label="Falls per second"
                min={0}
                step={ARENA_ASTEROID_SPAWN_RATE_STEP}
                value={
                  documentValue.gameplay.arena.asteroidField.micro
                    .spawnRatePerSec
                }
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.asteroidField.micro.spawnRatePerSec =
                      value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.asteroidField.micro.spawnRatePerSec =
                      value;
                  })
                }
              />
              <InspectorSubheading label="Small" />
              <NumberField
                label="Damage"
                min={0}
                step={ARENA_ASTEROID_DAMAGE_STEP}
                value={documentValue.gameplay.arena.asteroidField.small.damage}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.asteroidField.small.damage = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.asteroidField.small.damage = value;
                  })
                }
              />
              <NumberField
                label="Inward drift randomization"
                min={0}
                max={1}
                step={ARENA_ASTEROID_RANDOMIZATION_STEP}
                value={
                  documentValue.gameplay.arena.asteroidField.small.randomization
                }
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.asteroidField.small.randomization =
                      value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.asteroidField.small.randomization =
                      value;
                  })
                }
              />
              <NumberField
                label="Falls per second"
                min={0}
                step={ARENA_ASTEROID_SPAWN_RATE_STEP}
                value={
                  documentValue.gameplay.arena.asteroidField.small
                    .spawnRatePerSec
                }
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.asteroidField.small.spawnRatePerSec =
                      value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.asteroidField.small.spawnRatePerSec =
                      value;
                  })
                }
              />
              <InspectorSubheading label="Large" />
              <NumberField
                label="Damage"
                min={0}
                step={ARENA_ASTEROID_DAMAGE_STEP}
                value={documentValue.gameplay.arena.asteroidField.large.damage}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.asteroidField.large.damage = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.asteroidField.large.damage = value;
                  })
                }
              />
              <NumberField
                label="Inward drift randomization"
                min={0}
                max={1}
                step={ARENA_ASTEROID_RANDOMIZATION_STEP}
                value={
                  documentValue.gameplay.arena.asteroidField.large.randomization
                }
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.asteroidField.large.randomization =
                      value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.asteroidField.large.randomization =
                      value;
                  })
                }
              />
              <NumberField
                label="Falls per second"
                min={0}
                step={ARENA_ASTEROID_SPAWN_RATE_STEP}
                value={
                  documentValue.gameplay.arena.asteroidField.large
                    .spawnRatePerSec
                }
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.arena.asteroidField.large.spawnRatePerSec =
                      value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.arena.asteroidField.large.spawnRatePerSec =
                      value;
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
                        defaults.visuals.suns.profiles[index]!;
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
      case "neutronStars":
        return renderNeutronStarInspector();
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
              note="Load, drain, and force"
              resetDisabled={sectionResetDisabled}
              onReset={() =>
                resetInspectorSection((draft, defaults) => {
                  draft.gameplay.abilities.boost =
                    defaults.gameplay.abilities.boost;
                })
              }
            >
              <NumberField
                label="Load"
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
                label="Recharge"
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
                label="Deplete"
                min={0.05}
                max={30}
                step={0.05}
                value={documentValue.gameplay.abilities.boost.depleteSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.boost.depleteSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.boost.depleteSec = value;
                  })
                }
              />
              <NumberField
                label="Force"
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
                label="Pickup radius"
                min={1}
                max={500}
                step={1}
                value={documentValue.gameplay.cache.pickupRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.cache.pickupRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.cache.pickupRadius = value;
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
              note="Badge size as rendered in /offline"
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
                max={CACHE_BADGE_DISPLAY_SIZE_MAX}
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
  const aiGameplaySandboxConfig = useMemo(
    () =>
      ({
        botDifficulty: aiGameplayDifficulty,
        participantCount: aiGameplayParticipantCount,
        playerBehavior: "bot",
      }) as const,
    [aiGameplayDifficulty, aiGameplayParticipantCount],
  );
  const setClampedAiGameplayParticipantCount = (value: number) => {
    setAiGameplayParticipantCount(
      clamp(
        Math.round(value),
        AI_GAMEPLAY_MIN_PARTICIPANTS,
        AI_GAMEPLAY_MAX_PARTICIPANTS,
      ),
    );
  };
  const toggleAiGameplayPlayback = () => {
    if (aiGameplayController === null) {
      return;
    }

    if (aiGameplayHudState.sandboxPaused) {
      aiGameplayController.playSandbox();
      return;
    }

    aiGameplayController.pauseSandbox();
  };
  const toggleAiGameplayFullscreen = () => {
    const previewElement = aiGameplayPreviewRef.current;
    if (previewElement === null) {
      return;
    }

    if (document.fullscreenElement === previewElement) {
      void document.exitFullscreen();
      return;
    }

    void previewElement.requestFullscreen().catch(() => {});
  };
  const selectItem = (itemId: EditorItemId) => {
    setSelectedItemId(itemId);
    syncEditorItemToLocation(itemId, "pushState");
  };

  return (
    <div className="edit-shell">
      <aside className="edit-column edit-column--objects">
        <section className="edit-panel edit-panel--views">
          <div className="edit-panel__eyebrow">
            {mode === "online" ? "Online tuning" : "Offline tuning"}
          </div>
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
          {selectedItemId === "aiGameplay" ? (
            <div
              ref={aiGameplayPreviewRef}
              className={`game-stage game-stage--editor edit-ai-gameplay-stage${
                aiGameplayFullscreen
                  ? " edit-ai-gameplay-stage--fullscreen"
                  : ""
              }`}
              data-testid="ai-gameplay-preview-stage"
            >
              <EditGameViewportPanel
                cameraWorldHeightOverride={
                  documentValue.gameplay.camera.previewCameraWorldHeight
                }
                className="editor-preview-surface"
                documentValue={documentValue}
                hudTuning={documentValue.visuals.hud}
                onControllerReady={setAiGameplayController}
                onHudStateChange={setAiGameplayHudState}
                sandboxSessionConfig={aiGameplaySandboxConfig}
                showHud={false}
              />
              {aiGameplayFullscreen ? (
                <button
                  type="button"
                  className="edit-action-button edit-preview-overlay-button"
                  onClick={toggleAiGameplayFullscreen}
                >
                  Exit fullscreen
                </button>
              ) : null}
            </div>
          ) : (
            <EditorPreviewStage
              documentValue={documentValue}
              externalRevision={previewResetRevision}
              hudTuning={documentValue.visuals.hud}
              itemId={selectedItemId}
              overviewDisplayMode={documentValue.visuals.displayMode}
              showHud={previewMode.showHud}
            />
          )}
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
              {selectedItemId === "aiGameplay" ? (
                <>
                  <button
                    type="button"
                    className="edit-action-button"
                    disabled={aiGameplayController === null}
                    onClick={toggleAiGameplayPlayback}
                  >
                    {aiGameplayHudState.sandboxPaused ? "Play" : "Pause"}
                  </button>
                  <button
                    type="button"
                    className="edit-action-button"
                    onClick={toggleAiGameplayFullscreen}
                  >
                    {aiGameplayFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  </button>
                  <button
                    type="button"
                    className="edit-action-button"
                    disabled={aiGameplayController === null}
                    onClick={() => aiGameplayController?.resetSandbox()}
                  >
                    Restart
                  </button>
                </>
              ) : (
                <>
                  {selectedItemId === "overview" ? (
                    <button
                      type="button"
                      className="edit-action-button"
                      disabled={
                        saveStatus === "loading" || saveStatus === "saving"
                      }
                      onClick={() => {
                        void syncCurrentTuning();
                      }}
                    >
                      Sync
                    </button>
                  ) : null}
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
                      disabled={
                        saveStatus === "loading" || saveStatus === "saving"
                      }
                      onClick={resetSelectedItem}
                    >
                      {getResetLabel(selectedItemId)}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="edit-inspector">{renderInspector()}</div>
      </aside>
    </div>
  );
}
