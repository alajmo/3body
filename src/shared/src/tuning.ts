import { ARCHETYPE_IDS } from "./archetypes";
import type {
  AbilitySpec,
  BlackHoleSpec,
  BoostSpec,
  CacheSpec,
  GravityPulseSpec,
  MatchTimerSpec,
  NeutronStarSpec,
  RocketSpec,
} from "./constants";
import type { ArchetypeId, RocketKind } from "./entities";
import {
  DEFAULT_FIXED_ORBIT_PATTERN,
  ORBIT_PATTERN_BY_ID,
} from "./orbitPatternCatalog";
import type { BotDifficulty } from "./protocol";
import currentTuningDocument from "./tuning/current.json";
import type { Vec2 } from "./vec2";

export interface ShieldSpec extends AbilitySpec {
  arcDeg: number;
}

export interface PlanetArchetypeVisualSpec {
  auraGap: number;
  auraScale: number;
  bodyScale: number;
  color: string;
  continentsScale: number;
  forestAltitude: number;
  forestColor: string;
  forestCoverage: number;
  forestPatchSize: number;
  mountainHeight: number;
  mountainsScale: number;
  oceanDeepColor: string;
  oceanShallowColor: string;
  seaLevel: number;
  trailColor: string;
}

export interface PlanetTintOffsetTuning {
  hue: number;
  saturation: number;
  lightness: number;
}

export interface PlanetLightDirectionTuning {
  x: number;
  y: number;
  z: number;
}

export interface PlanetMaterialTuning {
  aoMax: number;
  aoMin: number;
  baseRadius: number;
  coastEnd: number;
  coastStart: number;
  continentsGain: number;
  continentsLacunarity: number;
  continentsOctaves: number;
  continentsScale: number;
  detailScale: number;
  displacementBudget: number;
  edgeOutlineStrength: number;
  forestBandEnd: number;
  forestBandStart: number;
  forestClumpEnd: number;
  forestClumpScale: number;
  forestClumpStart: number;
  forestFadeEnd: number;
  forestFadeStart: number;
  forestLightTint: PlanetTintOffsetTuning;
  forestSpeckleScale: number;
  heightLandScale: number;
  heightOceanScale: number;
  highlandEnd: number;
  highlandStart: number;
  highlandTint: PlanetTintOffsetTuning;
  landElevationEnd: number;
  landElevationStart: number;
  landMaskEnd: number;
  landMaskStart: number;
  lambertMax: number;
  lambertMin: number;
  lightDirection: PlanetLightDirectionTuning;
  lowlandTint: PlanetTintOffsetTuning;
  mountainHeightContribution: number;
  mountainsGain: number;
  mountainsLacunarity: number;
  mountainsOctaves: number;
  mountainsScale: number;
  oceanDeepTint: PlanetTintOffsetTuning;
  oceanDepthEnd: number;
  oceanDepthStart: number;
  oceanShallowTint: PlanetTintOffsetTuning;
  polarEnd: number;
  polarMountainInfluence: number;
  polarStart: number;
  rimPower: number;
  rimStrength: number;
  rimTintBlend: number;
  rockEnd: number;
  rockStart: number;
  rockTint: PlanetTintOffsetTuning;
  seaLevel: number;
  snowEnd: number;
  snowStart: number;
  snowTint: PlanetTintOffsetTuning;
}

export interface PlanetAuraTuning {
  alpha: number;
  bodyBoundaryMax: number;
  bodyBoundaryMin: number;
  brightness: number;
  contactFeatherScale: number;
  fadeStartMax: number;
  fadeStartMinOffset: number;
  fadeStartRemainingScale: number;
  glowInnerTint: PlanetTintOffsetTuning;
  glowOuterTint: PlanetTintOffsetTuning;
  haloEnvelopePower: number;
  haloTailBias: number;
  haloTailScale: number;
  innerEdgeMax: number;
  innerFeatherBase: number;
  innerFeatherMax: number;
  innerFeatherMin: number;
  minRemaining: number;
  pulseAmplitude: number;
  pulseBase: number;
  pulseFrequency: number;
  pulseSeedPhase: number;
  riseStartFeatherScale: number;
}

export interface PlanetVariationTuning {
  forestDensityJitterMax: number;
  forestDensityJitterMin: number;
  spinTiltMaxY: number;
  spinTiltMinY: number;
}

export interface PlanetVisualTuning {
  archetypes: Record<ArchetypeId, PlanetArchetypeVisualSpec>;
  material: PlanetMaterialTuning;
  variation: PlanetVariationTuning;
  aura: PlanetAuraTuning;
}

export interface SunVisualProfile {
  bodyScale: number;
  color: string;
  coreBrightness: number;
  glowBrightness: number;
  glowColor: string;
  glowScale: number;
  warpScale: number;
}

export interface SunVisualTuning {
  profiles: [SunVisualProfile, SunVisualProfile, SunVisualProfile];
}

export interface BlackHoleVisualTuning {
  coreRadius: number;
  lensRadius: number;
  ringRadius: number;
}

export interface NeutronStarVisualTuning {
  haloOpacity: number;
  haloScale: number;
  jetLengthScale: number;
  jetOpacity: number;
  jetWidthScale: number;
  lensOpacity: number;
  lensScale: number;
}

export interface BackgroundVisualTuning {
  baseColor: string;
  distantBodiesColor: string;
  distantBodiesEnabled: boolean;
  distantBodiesOpacity: number;
  distantBodiesScale: number;
  dustBrightness: number;
  dustDensity: number;
  dustDrift: number;
  dustEnabled: boolean;
  dustSize: number;
  eventsEnabled: boolean;
  eventsFrequency: number;
  eventsIntensity: number;
  glowColor: string;
  movingObjectsBrightness: number;
  movingObjectsDensity: number;
  movingObjectsEnabled: boolean;
  movingObjectsSize: number;
  movingObjectsSpeed: number;
  nebulaColor: string;
  nebulaDrift: number;
  nebulaEnabled: boolean;
  nebulaScale: number;
  nebulaStrength: number;
  starBrightness: number;
  starColorVariance: number;
  starDensity: number;
  starSize: number;
  starsEnabled: boolean;
  starTwinkleAmount: number;
  starTwinkleEnabled: boolean;
}

export interface RocketVisualTuning {
  bodyScale: Vec2;
  core: string;
  flameScale: Vec2;
  hudAccent: string;
  scale: number;
  trail: string;
  trailScale: Vec2;
}

export interface AbilityVisualTuning {
  boostColor: string;
  shieldColor: string;
  wildcardColor: string;
}

export interface CacheVisualTuning {
  badgeBaseSize: number;
  badgeScale: number;
}

export interface OrbitBoundaryDebrisVisualTuning {
  blackHoleCollapseSec: number;
  coolColor: string;
  density: number;
  dustSize: number;
  largeRockScale: number;
  smallRockScale: number;
  speed: number;
  thickness: number;
  warmColor: string;
}

export interface OrbitVisualTuning {
  boundaryDebris: OrbitBoundaryDebrisVisualTuning;
}

export interface CannonVisualTuning {
  barrelLength: number;
  barrelWidth: number;
  bandLength: number;
  bandWidth: number;
  breechDepth: number;
  breechLength: number;
  breechWidth: number;
  flashDurationSec: number;
  flashRadius: number;
  muzzleLength: number;
  muzzleRadius: number;
  stemLength: number;
  stemWidth: number;
}

export interface HudVisualTuning {
  bottomInset: number;
  cardRadius: number;
  compactCardRadius: number;
  connectionWidth: number;
  dockGap: number;
  killFeedEntryRadius: number;
  leftColumnWidth: number;
  panelBlurPx: number;
  panelGap: number;
  panelRadius: number;
  pillRadius: number;
  shortcutsSectionGap: number;
  sideInset: number;
  timerWidth: number;
  topInset: number;
}

export const VIEWPORT_DISPLAY_MODES = ["default", "vhs"] as const;

export type ViewportDisplayMode = (typeof VIEWPORT_DISPLAY_MODES)[number];

export const DEFAULT_VIEWPORT_DISPLAY_MODE: ViewportDisplayMode = "default";

export const sanitizeViewportDisplayMode = (
  value: unknown,
  fallback: ViewportDisplayMode = DEFAULT_VIEWPORT_DISPLAY_MODE,
): ViewportDisplayMode =>
  typeof value === "string" &&
  VIEWPORT_DISPLAY_MODES.some((mode) => mode === value)
    ? (value as ViewportDisplayMode)
    : fallback;

export interface VisualTuning {
  abilities: AbilityVisualTuning;
  background: BackgroundVisualTuning;
  blackHole: BlackHoleVisualTuning;
  caches: CacheVisualTuning;
  cannon: CannonVisualTuning;
  displayMode: ViewportDisplayMode;
  hud: HudVisualTuning;
  neutronStars: NeutronStarVisualTuning;
  orbits: OrbitVisualTuning;
  planets: PlanetVisualTuning;
  rockets: Record<RocketKind, RocketVisualTuning>;
  suns: SunVisualTuning;
}

export interface GameplayCameraTuning {
  gameplayCameraWorldHeight: number;
  previewCameraWorldHeight: number;
}

export interface ArenaAsteroidFieldPartTuning {
  damage: number;
  randomization: number;
  spawnRatePerSec: number;
}

export interface ArenaAsteroidFieldTuning {
  large: ArenaAsteroidFieldPartTuning;
  micro: ArenaAsteroidFieldPartTuning;
  small: ArenaAsteroidFieldPartTuning;
}

export interface ArenaGameplayTuning {
  asteroidField: ArenaAsteroidFieldTuning;
  instantDeath: boolean;
  radius: number;
}

export interface OrbitSunGameplayTuning {
  mass: number;
  pos: Vec2;
  radius: number;
  vel: Vec2;
}

export interface OrbitPlanetGameplayTuning {
  pos: Vec2;
  radius: number;
  vel: Vec2;
}

export type OrbitStarMotionMode = "physicsSeed" | "fixedPattern";

export interface OrbitStarMotionTuning {
  mode: OrbitStarMotionMode;
  patternId: string;
  speed: number;
}

export interface OrbitGameplayTuning {
  planetStartSpeedScale: number;
  starPatternDistanceScale: number;
  starMotion: OrbitStarMotionTuning;
  sunStartDistanceScale: number;
  planetCircleRadius: number;
  suns: [
    OrbitSunGameplayTuning,
    OrbitSunGameplayTuning,
    OrbitSunGameplayTuning,
  ];
  planets: [
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
  ];
}

export type DifficultyNumberTuning = Record<BotDifficulty, number>;

export type DifficultyRocketNumberTuning = Record<
  BotDifficulty,
  Record<RocketKind, number>
>;

export interface GameplayAiMovementTuning {
  candidateDirections: number;
  evaluationHorizonSec: DifficultyNumberTuning;
  objectiveFanoutDeg: number;
  simulationSteps: DifficultyNumberTuning;
}

export interface GameplayAiThreatTuning {
  lookaheadSec: DifficultyNumberTuning;
  simulationSteps: DifficultyNumberTuning;
}

export interface GameplayAiShotTuning {
  confidenceThresholds: DifficultyRocketNumberTuning;
  targetPredictionHorizonSec: DifficultyNumberTuning;
  targetPredictionSteps: DifficultyNumberTuning;
}

export interface GameplayAiExecutionTuning {
  boostCommitScoreDelta: number;
  boostPenaltyMultipleCharges: number;
  boostPenaltySingleCharge: number;
  cacheRunFireConfidence: number;
  pressureLightOverrideConfidence: number;
  pressureLightOverrideDamage: number;
  pressureLightOverrideWaste: number;
  repositionFireConfidence: number;
}

export interface GameplayAiTuning {
  execution: GameplayAiExecutionTuning;
  movement: GameplayAiMovementTuning;
  shots: GameplayAiShotTuning;
  threat: GameplayAiThreatTuning;
}

export interface GameplayTuning {
  ai: GameplayAiTuning;
  abilities: {
    boost: BoostSpec;
    gravityPulse: GravityPulseSpec;
    shield: ShieldSpec;
  };
  arena: ArenaGameplayTuning;
  blackHole: BlackHoleSpec;
  cache: CacheSpec;
  camera: GameplayCameraTuning;
  neutronStars: NeutronStarSpec;
  orbits: OrbitGameplayTuning;
  rockets: Record<RocketKind, RocketSpec>;
  timers: MatchTimerSpec;
}

export interface GameTuningDocument {
  gameplay: GameplayTuning;
  version: 1;
  visuals: VisualTuning;
}

export const SUN_VISUAL_PROFILE_COUNT = 3;
export const ORBIT_GAMEPLAY_SUN_COUNT = 3;
export const ORBIT_GAMEPLAY_PLANET_COUNT = ARCHETYPE_IDS.length;

export const getSunVisualProfile = (
  tuning: SunVisualTuning,
  index: number,
): SunVisualProfile => {
  const normalizedIndex =
    Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  const profileCount = Math.max(1, tuning.profiles.length);
  return tuning.profiles[normalizedIndex % profileCount] ?? tuning.profiles[0]!;
};

export const getOrbitGameplaySun = (
  tuning: OrbitGameplayTuning,
  index: number,
): OrbitSunGameplayTuning => {
  const normalizedIndex =
    Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  const sunCount = Math.max(1, tuning.suns.length);
  return tuning.suns[normalizedIndex % sunCount] ?? tuning.suns[0]!;
};

export const getOrbitGameplayPlanet = (
  tuning: OrbitGameplayTuning,
  index: number,
): OrbitPlanetGameplayTuning => {
  const normalizedIndex =
    Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  const planetCount = Math.max(1, tuning.planets.length);
  return tuning.planets[normalizedIndex % planetCount] ?? tuning.planets[0]!;
};

export const getOrbitPlanetCircleRadius = (
  tuning: OrbitGameplayTuning,
): number => tuning.planetCircleRadius;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampInteger = (value: number, min: number, max: number): number =>
  Math.round(clamp(value, min, max));

const sanitizeHexColor = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;

const sanitizeBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const sanitizeNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;

const sanitizeInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? clampInteger(value, min, max)
    : fallback;

const sanitizeVec2 = (value: unknown, fallback: Vec2): Vec2 => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof Vec2, unknown>>)
      : {};

  return {
    x: sanitizeNumber(source.x, fallback.x, 1, 256),
    y: sanitizeNumber(source.y, fallback.y, 1, 256),
  };
};

const sanitizeSunVisualProfile = (
  value: unknown,
  fallback: SunVisualProfile,
  sharedSource?: {
    bodyScale?: unknown;
    color?: unknown;
    coreBrightness?: unknown;
    glowBrightness?: unknown;
    glowColor?: unknown;
    glowScale?: unknown;
    warpScale?: unknown;
  },
): SunVisualProfile => {
  const candidate =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof SunVisualProfile, unknown>>)
      : {};

  return {
    bodyScale: sanitizeNumber(
      candidate.bodyScale ?? sharedSource?.bodyScale,
      fallback.bodyScale,
      0.25,
      4,
    ),
    color: sanitizeHexColor(
      candidate.color ?? sharedSource?.color,
      fallback.color,
    ),
    coreBrightness: sanitizeNumber(
      candidate.coreBrightness ?? sharedSource?.coreBrightness,
      fallback.coreBrightness,
      0,
      4,
    ),
    glowBrightness: sanitizeNumber(
      candidate.glowBrightness ?? sharedSource?.glowBrightness,
      fallback.glowBrightness,
      0,
      4,
    ),
    glowColor: sanitizeHexColor(
      candidate.glowColor ?? sharedSource?.glowColor,
      fallback.glowColor,
    ),
    glowScale: sanitizeNumber(
      candidate.glowScale ?? sharedSource?.glowScale,
      fallback.glowScale,
      0.5,
      8,
    ),
    warpScale: sanitizeNumber(
      candidate.warpScale ?? sharedSource?.warpScale,
      fallback.warpScale,
      0.5,
      8,
    ),
  };
};

const sanitizeOrbitVec2 = (
  value: unknown,
  fallback: Vec2,
  min: number,
  max: number,
): Vec2 => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof Vec2, unknown>>)
      : {};

  return {
    x: sanitizeNumber(source.x, fallback.x, min, max),
    y: sanitizeNumber(source.y, fallback.y, min, max),
  };
};

const sanitizeOrbitSunGameplayTuning = (
  value: unknown,
  fallback: OrbitSunGameplayTuning,
): OrbitSunGameplayTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof OrbitSunGameplayTuning, unknown>>)
      : {};

  return {
    mass: sanitizeNumber(source.mass, fallback.mass, 1_000, 5_000_000),
    pos: sanitizeOrbitVec2(source.pos, fallback.pos, -10_000, 10_000),
    radius: sanitizeNumber(
      source.radius,
      fallback.radius,
      8,
      Number.POSITIVE_INFINITY,
    ),
    vel: sanitizeOrbitVec2(source.vel, fallback.vel, -2_000, 2_000),
  };
};

const sanitizeOrbitPlanetGameplayTuning = (
  value: unknown,
  fallback: OrbitPlanetGameplayTuning,
): OrbitPlanetGameplayTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof OrbitPlanetGameplayTuning, unknown>>)
      : {};

  return {
    pos: sanitizeOrbitVec2(source.pos, fallback.pos, -10_000, 10_000),
    radius: sanitizeNumber(source.radius, fallback.radius, 8, 500),
    vel: sanitizeOrbitVec2(source.vel, fallback.vel, -2_000, 2_000),
  };
};

const sanitizeOrbitStarMotionMode = (
  value: unknown,
  fallback: OrbitStarMotionMode,
): OrbitStarMotionMode =>
  value === "physicsSeed" || value === "fixedPattern" ? value : fallback;

const sanitizeOrbitStarMotionTuning = (
  value: unknown,
  fallback: OrbitStarMotionTuning,
): OrbitStarMotionTuning => {
  const candidate =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof OrbitStarMotionTuning, unknown>>)
      : {};
  const patternIdCandidate =
    typeof candidate.patternId === "string"
      ? candidate.patternId
      : fallback.patternId;

  return {
    mode: sanitizeOrbitStarMotionMode(candidate.mode, fallback.mode),
    patternId: ORBIT_PATTERN_BY_ID.has(patternIdCandidate)
      ? patternIdCandidate
      : fallback.patternId,
    speed: sanitizeNumber(
      candidate.speed,
      fallback.speed,
      0,
      Number.POSITIVE_INFINITY,
    ),
  };
};

const sanitizeOrbitBoundaryDebrisVisualTuning = (
  value: unknown,
  fallback: OrbitBoundaryDebrisVisualTuning,
): OrbitBoundaryDebrisVisualTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<
          Record<
            | keyof OrbitBoundaryDebrisVisualTuning
            | "innerOffset"
            | "outerOffset"
            | "offset",
            unknown
          >
        >)
      : {};
  const legacyThickness =
    typeof source.outerOffset === "number" &&
    Number.isFinite(source.outerOffset)
      ? source.outerOffset -
        sanitizeNumber(source.offset ?? source.innerOffset, 0, 0, 420)
      : undefined;

  return {
    blackHoleCollapseSec: sanitizeNumber(
      source.blackHoleCollapseSec,
      fallback.blackHoleCollapseSec,
      0.1,
      600,
    ),
    coolColor: sanitizeHexColor(source.coolColor, fallback.coolColor),
    density: sanitizeNumber(
      source.density,
      fallback.density,
      0.25,
      Number.MAX_SAFE_INTEGER,
    ),
    dustSize: sanitizeNumber(
      source.dustSize,
      fallback.dustSize,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    largeRockScale: sanitizeNumber(
      source.largeRockScale,
      fallback.largeRockScale,
      0.25,
      Number.MAX_SAFE_INTEGER,
    ),
    smallRockScale: sanitizeNumber(
      source.smallRockScale,
      fallback.smallRockScale,
      0.25,
      Number.MAX_SAFE_INTEGER,
    ),
    speed: sanitizeNumber(
      source.speed,
      fallback.speed,
      0.1,
      Number.MAX_SAFE_INTEGER,
    ),
    thickness: sanitizeNumber(
      source.thickness ?? legacyThickness,
      fallback.thickness,
      24,
      Number.MAX_SAFE_INTEGER,
    ),
    warmColor: sanitizeHexColor(source.warmColor, fallback.warmColor),
  };
};

const sanitizePlanetTintOffset = (
  value: unknown,
  fallback: PlanetTintOffsetTuning,
): PlanetTintOffsetTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof PlanetTintOffsetTuning, unknown>>)
      : {};

  return {
    hue: sanitizeNumber(source.hue, fallback.hue, -1, 1),
    saturation: sanitizeNumber(source.saturation, fallback.saturation, -1, 1),
    lightness: sanitizeNumber(source.lightness, fallback.lightness, -1, 1),
  };
};

const sanitizePlanetLightDirection = (
  value: unknown,
  fallback: PlanetLightDirectionTuning,
): PlanetLightDirectionTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof PlanetLightDirectionTuning, unknown>>)
      : {};

  return {
    x: sanitizeNumber(source.x, fallback.x, -2, 2),
    y: sanitizeNumber(source.y, fallback.y, -2, 2),
    z: sanitizeNumber(source.z, fallback.z, -2, 2),
  };
};

const sanitizePlanetMaterialTuning = (
  value: unknown,
  fallback: PlanetMaterialTuning,
): PlanetMaterialTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof PlanetMaterialTuning, unknown>>)
      : {};

  return {
    aoMax: sanitizeNumber(source.aoMax, fallback.aoMax, 0, 2),
    aoMin: sanitizeNumber(source.aoMin, fallback.aoMin, 0, 2),
    baseRadius: sanitizeNumber(
      source.baseRadius,
      fallback.baseRadius,
      0.25,
      1.5,
    ),
    coastEnd: sanitizeNumber(source.coastEnd, fallback.coastEnd, 0, 1),
    coastStart: sanitizeNumber(source.coastStart, fallback.coastStart, 0, 1),
    continentsGain: sanitizeNumber(
      source.continentsGain,
      fallback.continentsGain,
      0,
      1,
    ),
    continentsLacunarity: sanitizeNumber(
      source.continentsLacunarity,
      fallback.continentsLacunarity,
      1,
      4,
    ),
    continentsOctaves: sanitizeInteger(
      source.continentsOctaves,
      fallback.continentsOctaves,
      1,
      8,
    ),
    continentsScale: sanitizeNumber(
      source.continentsScale,
      fallback.continentsScale,
      0.1,
      64,
    ),
    detailScale: sanitizeNumber(
      source.detailScale,
      fallback.detailScale,
      0.1,
      128,
    ),
    displacementBudget: sanitizeNumber(
      source.displacementBudget,
      fallback.displacementBudget,
      0,
      1,
    ),
    edgeOutlineStrength: sanitizeNumber(
      source.edgeOutlineStrength,
      fallback.edgeOutlineStrength,
      0,
      1,
    ),
    forestBandEnd: sanitizeNumber(
      source.forestBandEnd,
      fallback.forestBandEnd,
      0,
      1,
    ),
    forestBandStart: sanitizeNumber(
      source.forestBandStart,
      fallback.forestBandStart,
      0,
      1,
    ),
    forestClumpEnd: sanitizeNumber(
      source.forestClumpEnd,
      fallback.forestClumpEnd,
      0,
      1,
    ),
    forestClumpScale: sanitizeNumber(
      source.forestClumpScale,
      fallback.forestClumpScale,
      0.1,
      128,
    ),
    forestClumpStart: sanitizeNumber(
      source.forestClumpStart,
      fallback.forestClumpStart,
      0,
      1,
    ),
    forestFadeEnd: sanitizeNumber(
      source.forestFadeEnd,
      fallback.forestFadeEnd,
      0,
      1,
    ),
    forestFadeStart: sanitizeNumber(
      source.forestFadeStart,
      fallback.forestFadeStart,
      0,
      1,
    ),
    forestLightTint: sanitizePlanetTintOffset(
      source.forestLightTint,
      fallback.forestLightTint,
    ),
    forestSpeckleScale: sanitizeNumber(
      source.forestSpeckleScale,
      fallback.forestSpeckleScale,
      0.1,
      256,
    ),
    heightLandScale: sanitizeNumber(
      source.heightLandScale,
      fallback.heightLandScale,
      0,
      2,
    ),
    heightOceanScale: sanitizeNumber(
      source.heightOceanScale,
      fallback.heightOceanScale,
      0,
      2,
    ),
    highlandEnd: sanitizeNumber(source.highlandEnd, fallback.highlandEnd, 0, 1),
    highlandStart: sanitizeNumber(
      source.highlandStart,
      fallback.highlandStart,
      0,
      1,
    ),
    highlandTint: sanitizePlanetTintOffset(
      source.highlandTint,
      fallback.highlandTint,
    ),
    landElevationEnd: sanitizeNumber(
      source.landElevationEnd,
      fallback.landElevationEnd,
      0,
      1,
    ),
    landElevationStart: sanitizeNumber(
      source.landElevationStart,
      fallback.landElevationStart,
      0,
      1,
    ),
    landMaskEnd: sanitizeNumber(source.landMaskEnd, fallback.landMaskEnd, 0, 1),
    landMaskStart: sanitizeNumber(
      source.landMaskStart,
      fallback.landMaskStart,
      0,
      1,
    ),
    lambertMax: sanitizeNumber(source.lambertMax, fallback.lambertMax, 0, 2),
    lambertMin: sanitizeNumber(source.lambertMin, fallback.lambertMin, 0, 2),
    lightDirection: sanitizePlanetLightDirection(
      source.lightDirection,
      fallback.lightDirection,
    ),
    lowlandTint: sanitizePlanetTintOffset(
      source.lowlandTint,
      fallback.lowlandTint,
    ),
    mountainHeightContribution: sanitizeNumber(
      source.mountainHeightContribution,
      fallback.mountainHeightContribution,
      0,
      2,
    ),
    mountainsGain: sanitizeNumber(
      source.mountainsGain,
      fallback.mountainsGain,
      0,
      1,
    ),
    mountainsLacunarity: sanitizeNumber(
      source.mountainsLacunarity,
      fallback.mountainsLacunarity,
      1,
      4,
    ),
    mountainsOctaves: sanitizeInteger(
      source.mountainsOctaves,
      fallback.mountainsOctaves,
      1,
      8,
    ),
    mountainsScale: sanitizeNumber(
      source.mountainsScale,
      fallback.mountainsScale,
      0.1,
      128,
    ),
    oceanDeepTint: sanitizePlanetTintOffset(
      source.oceanDeepTint,
      fallback.oceanDeepTint,
    ),
    oceanDepthEnd: sanitizeNumber(
      source.oceanDepthEnd,
      fallback.oceanDepthEnd,
      0,
      1,
    ),
    oceanDepthStart: sanitizeNumber(
      source.oceanDepthStart,
      fallback.oceanDepthStart,
      0,
      1,
    ),
    oceanShallowTint: sanitizePlanetTintOffset(
      source.oceanShallowTint,
      fallback.oceanShallowTint,
    ),
    polarEnd: sanitizeNumber(source.polarEnd, fallback.polarEnd, 0, 1),
    polarMountainInfluence: sanitizeNumber(
      source.polarMountainInfluence,
      fallback.polarMountainInfluence,
      0,
      1,
    ),
    polarStart: sanitizeNumber(source.polarStart, fallback.polarStart, 0, 1),
    rimPower: sanitizeNumber(source.rimPower, fallback.rimPower, 0.1, 8),
    rimStrength: sanitizeNumber(source.rimStrength, fallback.rimStrength, 0, 1),
    rimTintBlend: sanitizeNumber(
      source.rimTintBlend,
      fallback.rimTintBlend,
      0,
      1,
    ),
    rockEnd: sanitizeNumber(source.rockEnd, fallback.rockEnd, 0, 1),
    rockStart: sanitizeNumber(source.rockStart, fallback.rockStart, 0, 1),
    rockTint: sanitizePlanetTintOffset(source.rockTint, fallback.rockTint),
    seaLevel: sanitizeNumber(source.seaLevel, fallback.seaLevel, 0, 1),
    snowEnd: sanitizeNumber(source.snowEnd, fallback.snowEnd, 0, 1),
    snowStart: sanitizeNumber(source.snowStart, fallback.snowStart, 0, 1),
    snowTint: sanitizePlanetTintOffset(source.snowTint, fallback.snowTint),
  };
};

const sanitizePlanetAuraTuning = (
  value: unknown,
  fallback: PlanetAuraTuning,
): PlanetAuraTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof PlanetAuraTuning, unknown>>)
      : {};

  return {
    alpha: sanitizeNumber(source.alpha, fallback.alpha, 0, 1),
    bodyBoundaryMax: sanitizeNumber(
      source.bodyBoundaryMax,
      fallback.bodyBoundaryMax,
      0,
      1,
    ),
    bodyBoundaryMin: sanitizeNumber(
      source.bodyBoundaryMin,
      fallback.bodyBoundaryMin,
      0,
      1,
    ),
    brightness: sanitizeNumber(source.brightness, fallback.brightness, 0, 4),
    contactFeatherScale: sanitizeNumber(
      source.contactFeatherScale,
      fallback.contactFeatherScale,
      0,
      4,
    ),
    fadeStartMax: sanitizeNumber(
      source.fadeStartMax,
      fallback.fadeStartMax,
      0,
      1,
    ),
    fadeStartMinOffset: sanitizeNumber(
      source.fadeStartMinOffset,
      fallback.fadeStartMinOffset,
      0,
      1,
    ),
    fadeStartRemainingScale: sanitizeNumber(
      source.fadeStartRemainingScale,
      fallback.fadeStartRemainingScale,
      0,
      1,
    ),
    glowInnerTint: sanitizePlanetTintOffset(
      source.glowInnerTint,
      fallback.glowInnerTint,
    ),
    glowOuterTint: sanitizePlanetTintOffset(
      source.glowOuterTint,
      fallback.glowOuterTint,
    ),
    haloEnvelopePower: sanitizeNumber(
      source.haloEnvelopePower,
      fallback.haloEnvelopePower,
      0.1,
      8,
    ),
    haloTailBias: sanitizeNumber(
      source.haloTailBias,
      fallback.haloTailBias,
      0,
      2,
    ),
    haloTailScale: sanitizeNumber(
      source.haloTailScale,
      fallback.haloTailScale,
      0,
      2,
    ),
    innerEdgeMax: sanitizeNumber(
      source.innerEdgeMax,
      fallback.innerEdgeMax,
      0,
      1,
    ),
    innerFeatherBase: sanitizeNumber(
      source.innerFeatherBase,
      fallback.innerFeatherBase,
      0,
      1,
    ),
    innerFeatherMax: sanitizeNumber(
      source.innerFeatherMax,
      fallback.innerFeatherMax,
      0,
      1,
    ),
    innerFeatherMin: sanitizeNumber(
      source.innerFeatherMin,
      fallback.innerFeatherMin,
      0,
      1,
    ),
    minRemaining: sanitizeNumber(
      source.minRemaining,
      fallback.minRemaining,
      0,
      1,
    ),
    pulseAmplitude: sanitizeNumber(
      source.pulseAmplitude,
      fallback.pulseAmplitude,
      0,
      1,
    ),
    pulseBase: sanitizeNumber(source.pulseBase, fallback.pulseBase, 0, 2),
    pulseFrequency: sanitizeNumber(
      source.pulseFrequency,
      fallback.pulseFrequency,
      0,
      4,
    ),
    pulseSeedPhase: sanitizeNumber(
      source.pulseSeedPhase,
      fallback.pulseSeedPhase,
      0,
      8,
    ),
    riseStartFeatherScale: sanitizeNumber(
      source.riseStartFeatherScale,
      fallback.riseStartFeatherScale,
      0,
      4,
    ),
  };
};

const sanitizePlanetVariationTuning = (
  value: unknown,
  fallback: PlanetVariationTuning,
): PlanetVariationTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof PlanetVariationTuning, unknown>>)
      : {};

  return {
    forestDensityJitterMax: sanitizeNumber(
      source.forestDensityJitterMax,
      fallback.forestDensityJitterMax,
      0,
      2,
    ),
    forestDensityJitterMin: sanitizeNumber(
      source.forestDensityJitterMin,
      fallback.forestDensityJitterMin,
      0,
      2,
    ),
    spinTiltMaxY: sanitizeNumber(
      source.spinTiltMaxY,
      fallback.spinTiltMaxY,
      -1,
      1,
    ),
    spinTiltMinY: sanitizeNumber(
      source.spinTiltMinY,
      fallback.spinTiltMinY,
      -1,
      1,
    ),
  };
};

export const DEFAULT_GAME_TUNING: GameTuningDocument = {
  version: 1,
  visuals: {
    background: {
      baseColor: "#020307",
      distantBodiesColor: "#31455c",
      distantBodiesEnabled: true,
      distantBodiesOpacity: 0.28,
      distantBodiesScale: 1,
      dustBrightness: 0.42,
      dustDensity: 1,
      dustDrift: 1,
      dustEnabled: true,
      dustSize: 1,
      eventsEnabled: true,
      eventsFrequency: 1,
      eventsIntensity: 0.22,
      glowColor: "#0f2748",
      movingObjectsBrightness: 0.34,
      movingObjectsDensity: 1,
      movingObjectsEnabled: true,
      movingObjectsSize: 1,
      movingObjectsSpeed: 1,
      nebulaColor: "#244a82",
      nebulaDrift: 1,
      nebulaEnabled: true,
      nebulaScale: 1,
      nebulaStrength: 0.36,
      starBrightness: 1,
      starColorVariance: 1,
      starDensity: 1,
      starSize: 1,
      starsEnabled: true,
      starTwinkleAmount: 1,
      starTwinkleEnabled: true,
    },
    displayMode: DEFAULT_VIEWPORT_DISPLAY_MODE,
    planets: {
      archetypes: {
        terra: {
          auraGap: 0,
          auraScale: 2.2,
          bodyScale: 1,
          color: "#9fc66f",
          continentsScale: 1,
          forestAltitude: 0,
          forestColor: "#2c5a2a",
          forestCoverage: 0.95,
          forestPatchSize: 1,
          mountainHeight: 1,
          mountainsScale: 1,
          oceanDeepColor: "#1f4f85",
          oceanShallowColor: "#5ca5d8",
          seaLevel: 0.5,
          trailColor: "#d6ef8a",
        },
        ignis: {
          auraGap: 0,
          auraScale: 2.2,
          bodyScale: 1,
          color: "#ff8550",
          continentsScale: 1,
          forestAltitude: 0,
          forestColor: "#6e3422",
          forestCoverage: 0,
          forestPatchSize: 1,
          mountainHeight: 1,
          mountainsScale: 1,
          oceanDeepColor: "#5a1f15",
          oceanShallowColor: "#a04d26",
          seaLevel: 0.5,
          trailColor: "#ffb07c",
        },
        glacius: {
          auraGap: 0,
          auraScale: 2.2,
          bodyScale: 1,
          color: "#8ed8ff",
          continentsScale: 1,
          forestAltitude: 0,
          forestColor: "#6e8797",
          forestCoverage: 0,
          forestPatchSize: 1,
          mountainHeight: 1,
          mountainsScale: 1,
          oceanDeepColor: "#285a93",
          oceanShallowColor: "#74b9f4",
          seaLevel: 0.5,
          trailColor: "#d5f4ff",
        },
        volans: {
          auraGap: 0,
          auraScale: 2.2,
          bodyScale: 1,
          color: "#5fe7da",
          continentsScale: 1,
          forestAltitude: 0,
          forestColor: "#1f6b5b",
          forestCoverage: 0.55,
          forestPatchSize: 1,
          mountainHeight: 1,
          mountainsScale: 1,
          oceanDeepColor: "#1b5c6a",
          oceanShallowColor: "#40b7be",
          seaLevel: 0.5,
          trailColor: "#8ff7ee",
        },
        oculus: {
          auraGap: 0,
          auraScale: 2.2,
          bodyScale: 1,
          color: "#ffd56b",
          continentsScale: 1,
          forestAltitude: 0,
          forestColor: "#786a2d",
          forestCoverage: 0,
          forestPatchSize: 1,
          mountainHeight: 1,
          mountainsScale: 1,
          oceanDeepColor: "#6d451c",
          oceanShallowColor: "#b88836",
          seaLevel: 0.5,
          trailColor: "#fff1a4",
        },
        umbra: {
          auraGap: 0,
          auraScale: 2.2,
          bodyScale: 1,
          color: "#8c7dff",
          continentsScale: 1,
          forestAltitude: 0,
          forestColor: "#3a2a52",
          forestCoverage: 0.4,
          forestPatchSize: 1,
          mountainHeight: 1,
          mountainsScale: 1,
          oceanDeepColor: "#2b1e61",
          oceanShallowColor: "#6b51d6",
          seaLevel: 0.5,
          trailColor: "#b3a8ff",
        },
        corvus: {
          auraGap: 0,
          auraScale: 2.2,
          bodyScale: 1,
          color: "#d7e4ff",
          continentsScale: 1,
          forestAltitude: 0,
          forestColor: "#496170",
          forestCoverage: 0,
          forestPatchSize: 1,
          mountainHeight: 1,
          mountainsScale: 1,
          oceanDeepColor: "#394b63",
          oceanShallowColor: "#94a8c0",
          seaLevel: 0.5,
          trailColor: "#f3f7ff",
        },
      },
      material: {
        aoMax: 1.03,
        aoMin: 0.94,
        baseRadius: 0.84,
        coastEnd: 0.52,
        coastStart: 0.48,
        continentsGain: 0.55,
        continentsLacunarity: 2,
        continentsOctaves: 4,
        continentsScale: 1.35,
        detailScale: 12.5,
        displacementBudget: 0.28,
        edgeOutlineStrength: 0.14,
        forestBandEnd: 0.18,
        forestBandStart: 0.02,
        forestClumpEnd: 0.78,
        forestClumpScale: 22,
        forestClumpStart: 0.42,
        forestFadeEnd: 0.3,
        forestFadeStart: 0.62,
        forestLightTint: { hue: 0, saturation: 0.08, lightness: 0.08 },
        forestSpeckleScale: 64,
        heightLandScale: 0.52,
        heightOceanScale: 0.44,
        highlandEnd: 0.42,
        highlandStart: 0.05,
        highlandTint: { hue: -0.03, saturation: -0.2, lightness: 0.14 },
        landElevationEnd: 1,
        landElevationStart: 0.5,
        landMaskEnd: 0.56,
        landMaskStart: 0.42,
        lambertMax: 1,
        lambertMin: 0.38,
        lightDirection: { x: -0.35, y: 0.55, z: 0.9 },
        lowlandTint: { hue: 0.02, saturation: 0.06, lightness: -0.08 },
        mountainHeightContribution: 0.55,
        mountainsGain: 0.52,
        mountainsLacunarity: 2.15,
        mountainsOctaves: 6,
        mountainsScale: 6.4,
        oceanDeepTint: { hue: 0.55, saturation: 0.25, lightness: -0.22 },
        oceanDepthEnd: 0.3,
        oceanDepthStart: 0.48,
        oceanShallowTint: { hue: 0.5, saturation: 0.2, lightness: -0.06 },
        polarEnd: 0.94,
        polarMountainInfluence: 0.08,
        polarStart: 0.78,
        rimPower: 2.6,
        rimStrength: 0.1,
        rimTintBlend: 0.42,
        rockEnd: 0.72,
        rockStart: 0.42,
        rockTint: { hue: 0, saturation: -0.5, lightness: -0.04 },
        seaLevel: 0.5,
        snowEnd: 0.96,
        snowStart: 0.78,
        snowTint: { hue: 0, saturation: -0.7, lightness: 0.24 },
      },
      aura: {
        alpha: 0.16,
        bodyBoundaryMax: 0.975,
        bodyBoundaryMin: 0.08,
        brightness: 0.56,
        contactFeatherScale: 1.95,
        fadeStartMax: 0.995,
        fadeStartMinOffset: 0.02,
        fadeStartRemainingScale: 0.18,
        glowInnerTint: { hue: -0.08, saturation: 0.1, lightness: 0.28 },
        glowOuterTint: { hue: -0.04, saturation: 0.04, lightness: 0.2 },
        haloEnvelopePower: 1.85,
        haloTailBias: 0.28,
        haloTailScale: 0.72,
        innerEdgeMax: 0.985,
        innerFeatherBase: 0.12,
        innerFeatherMax: 0.085,
        innerFeatherMin: 0.02,
        minRemaining: 0.025,
        pulseAmplitude: 0.06,
        pulseBase: 0.94,
        pulseFrequency: 0.18,
        pulseSeedPhase: 1.9,
        riseStartFeatherScale: 0.9,
      },
      variation: {
        forestDensityJitterMax: 1.3,
        forestDensityJitterMin: 0.6,
        spinTiltMaxY: 0.72,
        spinTiltMinY: -0.72,
      },
    },
    suns: {
      profiles: [
        {
          bodyScale: 1,
          color: "#ffd78a",
          coreBrightness: 1,
          glowBrightness: 1,
          glowColor: "#ffefb5",
          glowScale: 1.7,
          warpScale: 3.2,
        },
        {
          bodyScale: 1,
          color: "#ffd78a",
          coreBrightness: 1,
          glowBrightness: 1,
          glowColor: "#ffefb5",
          glowScale: 1.7,
          warpScale: 3.2,
        },
        {
          bodyScale: 1,
          color: "#ffd78a",
          coreBrightness: 1,
          glowBrightness: 1,
          glowColor: "#ffefb5",
          glowScale: 1.7,
          warpScale: 3.2,
        },
      ],
    },
    blackHole: {
      coreRadius: 110,
      ringRadius: 205,
      lensRadius: 330,
    },
    neutronStars: {
      haloScale: 2.1,
      haloOpacity: 0.94,
      lensScale: 2.8,
      lensOpacity: 0.8,
      jetLengthScale: 4.2,
      jetWidthScale: 0.3,
      jetOpacity: 0.86,
    },
    cannon: {
      barrelLength: 26,
      barrelWidth: 9,
      bandLength: 3.5,
      bandWidth: 11.5,
      breechDepth: 14,
      breechLength: 11,
      breechWidth: 16,
      flashDurationSec: 0.14,
      flashRadius: 16,
      muzzleLength: 4,
      muzzleRadius: 5.6,
      stemLength: 4,
      stemWidth: 8,
    },
    rockets: {
      light: {
        core: "#f4f9ff",
        trail: "#b7e6ff",
        hudAccent: "#f5fbff",
        scale: 1,
        bodyScale: { x: 24, y: 4.8 },
        flameScale: { x: 22, y: 9 },
        trailScale: { x: 30, y: 6 },
      },
      heavy: {
        core: "#ff8d4a",
        trail: "#ff6130",
        hudAccent: "#ff7a3d",
        scale: 1,
        bodyScale: { x: 31, y: 7.8 },
        flameScale: { x: 28, y: 14 },
        trailScale: { x: 36, y: 9 },
      },
      seeker: {
        core: "#f564ff",
        trail: "#ff4dd4",
        hudAccent: "#ff61eb",
        scale: 1,
        bodyScale: { x: 27, y: 6.2 },
        flameScale: { x: 25, y: 11 },
        trailScale: { x: 33, y: 7.5 },
      },
    },
    abilities: {
      shieldColor: "#86ecff",
      boostColor: "#8bc6ff",
      wildcardColor: "#ffd37a",
    },
    caches: {
      badgeScale: 1,
      badgeBaseSize: 80,
    },
    orbits: {
      boundaryDebris: {
        blackHoleCollapseSec: 60,
        coolColor: "#8ca8c7",
        density: 1,
        dustSize: 3.6,
        largeRockScale: 1,
        smallRockScale: 1,
        speed: 1,
        thickness: 148,
        warmColor: "#b7a18e",
      },
    },
    hud: {
      topInset: 20,
      sideInset: 20,
      bottomInset: 20,
      leftColumnWidth: 320,
      panelRadius: 18,
      pillRadius: 16,
      cardRadius: 14,
      compactCardRadius: 10,
      killFeedEntryRadius: 12,
      panelBlurPx: 14,
      panelGap: 12,
      dockGap: 10,
      shortcutsSectionGap: 18,
      timerWidth: 240,
      connectionWidth: 220,
    },
  },
  gameplay: {
    ai: {
      execution: {
        boostCommitScoreDelta: 7.5,
        boostPenaltyMultipleCharges: 0.08,
        boostPenaltySingleCharge: 0.22,
        cacheRunFireConfidence: 0.74,
        pressureLightOverrideConfidence: 0.22,
        pressureLightOverrideDamage: 3,
        pressureLightOverrideWaste: 0.32,
        repositionFireConfidence: 0.7,
      },
      movement: {
        candidateDirections: 8,
        evaluationHorizonSec: {
          easy: 1.6,
          normal: 2.4,
          hard: 3.1,
        },
        objectiveFanoutDeg: 28,
        simulationSteps: {
          easy: 16,
          normal: 24,
          hard: 30,
        },
      },
      shots: {
        confidenceThresholds: {
          easy: {
            light: 0.14,
            heavy: 0.42,
            seeker: 0.4,
          },
          normal: {
            light: 0.22,
            heavy: 0.58,
            seeker: 0.52,
          },
          hard: {
            light: 0.32,
            heavy: 0.67,
            seeker: 0.6,
          },
        },
        targetPredictionHorizonSec: {
          easy: 1.35,
          normal: 2.15,
          hard: 2.75,
        },
        targetPredictionSteps: {
          easy: 18,
          normal: 28,
          hard: 34,
        },
      },
      threat: {
        lookaheadSec: {
          easy: 1.5,
          normal: 2.1,
          hard: 2.8,
        },
        simulationSteps: {
          easy: 18,
          normal: 24,
          hard: 30,
        },
      },
    },
    arena: {
      asteroidField: {
        large: {
          damage: 6.5,
          randomization: 0.85,
          spawnRatePerSec: 0.12,
        },
        micro: {
          damage: 0.4,
          randomization: 0.2,
          spawnRatePerSec: 2.8,
        },
        small: {
          damage: 1.6,
          randomization: 0.55,
          spawnRatePerSec: 0.55,
        },
      },
      instantDeath: true,
      radius: 2_000,
    },
    blackHole: {
      spawnSec: 300,
      mass: 8_000_000,
      killRadius: 150,
      rampSec: 30,
    },
    camera: {
      gameplayCameraWorldHeight: 4600,
      previewCameraWorldHeight: 7600,
    },
    orbits: {
      planetStartSpeedScale: 1,
      starPatternDistanceScale: 1,
      starMotion: {
        mode: "physicsSeed",
        patternId: DEFAULT_FIXED_ORBIT_PATTERN.id,
        speed: 1,
      },
      sunStartDistanceScale: 1,
      planetCircleRadius: 2_200,
      suns: [
        {
          mass: 140_000,
          pos: { x: -1_600, y: 0 },
          radius: 88,
          vel: { x: 72.32160915498832, y: 110.93745960353417 },
        },
        {
          mass: 140_000,
          pos: { x: 1_600, y: 0 },
          radius: 124,
          vel: { x: 72.32160915498832, y: 110.93745960353417 },
        },
        {
          mass: 140_000,
          pos: { x: 0, y: 0 },
          radius: 160,
          vel: { x: -144.64321830997665, y: -221.87491920706827 },
        },
      ],
      planets: [
        {
          pos: { x: 1051.733345716462, y: -486.2037513362361 },
          radius: 22,
          vel: { x: 207.27459254394333, y: 436.57125872427775 },
        },
        {
          pos: { x: 1237.2001757998341, y: 495.31145926706535 },
          radius: 22,
          vel: { x: -163.37440434072008, y: 400.77881724748056 },
        },
        {
          pos: { x: 460.1445835773605, y: 1556.3928974903736 },
          radius: 22,
          vel: { x: -372.65622642539535, y: 111.7201256085271 },
        },
        {
          pos: { x: -1196.4670734311585, y: 1528.8907139662576 },
          radius: 22,
          vel: { x: -272.90915043475695, y: -216.89824635627662 },
        },
        {
          pos: { x: -1985.7429230504715, y: 198.96788944608195 },
          radius: 22,
          vel: { x: -37.30840816112747, y: -348.6404574643785 },
        },
        {
          pos: { x: -1491.5073043121004, y: -1768.4204616689865 },
          radius: 24,
          vel: { x: 241.48513032988333, y: -205.26122266372127 },
        },
        {
          pos: { x: 510.8599255453144, y: -2319.9217869943445 },
          radius: 24,
          vel: { x: 304.54386524914696, y: 67.92373710106013 },
        },
      ],
    },
    rockets: {
      light: {
        damage: 15,
        lockSec: 0,
        speed: 950,
        reloadSec: 1.5,
        ttlSec: 8,
        radius: 10,
        turnRate: 0,
        startAmmo: 5,
        maxAmmo: 5,
      },
      heavy: {
        damage: 70,
        lockSec: 0,
        speed: 560,
        reloadSec: 6,
        ttlSec: 8,
        radius: 14,
        turnRate: 0,
        startAmmo: 2,
        maxAmmo: 2,
      },
      seeker: {
        damage: 35,
        lockSec: 3,
        speed: 760,
        reloadSec: 4,
        ttlSec: 8,
        radius: 12,
        turnRate: Math.PI * 0.75,
        startAmmo: 3,
        maxAmmo: 3,
      },
    },
    abilities: {
      shield: {
        cooldownSec: 15,
        durationSec: 4,
        arcDeg: 120,
      },
      boost: {
        charges: 1,
        cooldownSec: 5,
        depleteSec: 2,
        magnitude: 280,
      },
      gravityPulse: {
        force: 1800,
        radius: 2_000,
      },
    },
    cache: {
      count: 3,
      pickupRadius: 24,
      respawnSec: 15,
      wildcardChance: 0.1,
    },
    neutronStars: {
      count: 0,
      minMassKg: 700_000,
      maxMassKg: 1_100_000,
      minSize: 42,
      maxSize: 78,
      randomizePositionInsidePlayableCircle: true,
    },
    timers: {
      lobbySec: 10,
      pickSec: 30,
      countdownSec: 3,
      rematchVoteSec: 20,
    },
  },
};

const sanitizeRocketSpec = (
  value: unknown,
  fallback: RocketSpec,
): RocketSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof RocketSpec, unknown>>)
      : {};
  const maxAmmo = sanitizeInteger(source.maxAmmo, fallback.maxAmmo, 1, 32);

  return {
    damage: sanitizeNumber(source.damage, fallback.damage, 0, 500),
    lockSec: sanitizeNumber(source.lockSec, fallback.lockSec, 0, 120),
    maxAmmo,
    radius: sanitizeNumber(source.radius, fallback.radius, 1, 128),
    reloadSec: sanitizeNumber(source.reloadSec, fallback.reloadSec, 0.05, 120),
    speed: sanitizeNumber(source.speed, fallback.speed, 10, 4_000),
    startAmmo: sanitizeInteger(
      source.startAmmo,
      fallback.startAmmo,
      0,
      maxAmmo,
    ),
    turnRate: sanitizeNumber(
      source.turnRate,
      fallback.turnRate,
      0,
      Math.PI * 8,
    ),
    ttlSec: sanitizeNumber(source.ttlSec, fallback.ttlSec, 0.1, 120),
  } as RocketSpec;
};

const sanitizeAbilitySpec = (
  value: unknown,
  fallback: AbilitySpec,
): AbilitySpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof AbilitySpec, unknown>>)
      : {};

  return {
    cooldownSec: sanitizeNumber(
      source.cooldownSec,
      fallback.cooldownSec,
      0,
      300,
    ),
    durationSec: sanitizeNumber(
      source.durationSec,
      fallback.durationSec,
      0.05,
      120,
    ),
  };
};

const sanitizeShieldSpec = (
  value: unknown,
  fallback: ShieldSpec,
): ShieldSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof ShieldSpec, unknown>>)
      : {};

  return {
    ...sanitizeAbilitySpec(source, fallback),
    arcDeg: sanitizeNumber(source.arcDeg, fallback.arcDeg, 1, 359),
  };
};

const sanitizeBoostSpec = (value: unknown, fallback: BoostSpec): BoostSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof BoostSpec, unknown>>)
      : {};

  return {
    charges: sanitizeInteger(source.charges, fallback.charges, 1, 5),
    cooldownSec: sanitizeNumber(
      source.cooldownSec,
      fallback.cooldownSec,
      0.05,
      120,
    ),
    depleteSec: sanitizeNumber(
      source.depleteSec,
      fallback.depleteSec,
      0.05,
      30,
    ),
    magnitude: sanitizeNumber(source.magnitude, fallback.magnitude, 0, 4_000),
  };
};

const sanitizeGravityPulseSpec = (
  value: unknown,
  fallback: GravityPulseSpec,
): GravityPulseSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof GravityPulseSpec, unknown>>)
      : {};

  return {
    force: sanitizeNumber(source.force, fallback.force, 0, 20_000),
    radius: sanitizeNumber(source.radius, fallback.radius, 50, 10_000),
  };
};

const sanitizeCacheSpec = (value: unknown, fallback: CacheSpec): CacheSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof CacheSpec, unknown>>)
      : {};

  return {
    count: sanitizeInteger(source.count, fallback.count, 0, 20),
    pickupRadius: sanitizeNumber(
      source.pickupRadius,
      fallback.pickupRadius,
      1,
      500,
    ),
    respawnSec: sanitizeNumber(source.respawnSec, fallback.respawnSec, 0, 300),
    wildcardChance: sanitizeNumber(
      source.wildcardChance,
      fallback.wildcardChance,
      0,
      1,
    ),
  };
};

const sanitizeNeutronStarSpec = (
  value: unknown,
  fallback: NeutronStarSpec,
): NeutronStarSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof NeutronStarSpec, unknown>>)
      : {};
  const minMassKg = sanitizeNumber(
    source.minMassKg,
    fallback.minMassKg,
    0,
    Number.POSITIVE_INFINITY,
  );
  const maxMassKg = sanitizeNumber(
    source.maxMassKg,
    fallback.maxMassKg,
    0,
    Number.POSITIVE_INFINITY,
  );
  const minSize = sanitizeNumber(
    source.minSize,
    fallback.minSize,
    12,
    Number.POSITIVE_INFINITY,
  );
  const maxSize = sanitizeNumber(
    source.maxSize,
    fallback.maxSize,
    minSize,
    Number.POSITIVE_INFINITY,
  );

  return {
    count: sanitizeInteger(source.count, fallback.count, 0, 12),
    minMassKg,
    maxMassKg,
    minSize,
    maxSize,
    randomizePositionInsidePlayableCircle: sanitizeBoolean(
      source.randomizePositionInsidePlayableCircle,
      fallback.randomizePositionInsidePlayableCircle,
    ),
  };
};

const sanitizeGameplayCameraTuning = (
  value: unknown,
  fallback: GameplayCameraTuning,
): GameplayCameraTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof GameplayCameraTuning, unknown>>)
      : {};

  return {
    gameplayCameraWorldHeight: sanitizeNumber(
      source.gameplayCameraWorldHeight,
      fallback.gameplayCameraWorldHeight,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ),
    previewCameraWorldHeight: sanitizeNumber(
      source.previewCameraWorldHeight,
      fallback.previewCameraWorldHeight,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ),
  };
};

const sanitizeDifficultyNumberTuning = (
  value: unknown,
  fallback: DifficultyNumberTuning,
  min: number,
  max: number,
): DifficultyNumberTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<BotDifficulty, unknown>>)
      : {};

  return {
    easy: sanitizeNumber(source.easy, fallback.easy, min, max),
    normal: sanitizeNumber(source.normal, fallback.normal, min, max),
    hard: sanitizeNumber(source.hard, fallback.hard, min, max),
  };
};

const sanitizeDifficultyIntegerTuning = (
  value: unknown,
  fallback: DifficultyNumberTuning,
  min: number,
  max: number,
): DifficultyNumberTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<BotDifficulty, unknown>>)
      : {};

  return {
    easy: sanitizeInteger(source.easy, fallback.easy, min, max),
    normal: sanitizeInteger(source.normal, fallback.normal, min, max),
    hard: sanitizeInteger(source.hard, fallback.hard, min, max),
  };
};

const sanitizeDifficultyRocketNumberTuning = (
  value: unknown,
  fallback: DifficultyRocketNumberTuning,
  min: number,
  max: number,
): DifficultyRocketNumberTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<BotDifficulty, unknown>>)
      : {};
  const sanitizeRocketThresholds = (
    candidate: unknown,
    candidateFallback: Record<RocketKind, number>,
  ): Record<RocketKind, number> => {
    const rocketSource =
      candidate !== null && typeof candidate === "object"
        ? (candidate as Partial<Record<RocketKind, unknown>>)
        : {};

    return {
      light: sanitizeNumber(
        rocketSource.light,
        candidateFallback.light,
        min,
        max,
      ),
      heavy: sanitizeNumber(
        rocketSource.heavy,
        candidateFallback.heavy,
        min,
        max,
      ),
      seeker: sanitizeNumber(
        rocketSource.seeker,
        candidateFallback.seeker,
        min,
        max,
      ),
    };
  };

  return {
    easy: sanitizeRocketThresholds(source.easy, fallback.easy),
    normal: sanitizeRocketThresholds(source.normal, fallback.normal),
    hard: sanitizeRocketThresholds(source.hard, fallback.hard),
  };
};

const sanitizeArenaAsteroidFieldPartTuning = (
  value: unknown,
  fallback: ArenaAsteroidFieldPartTuning,
): ArenaAsteroidFieldPartTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof ArenaAsteroidFieldPartTuning, unknown>>)
      : {};

  return {
    damage: sanitizeNumber(source.damage, fallback.damage, 0, 50),
    randomization: sanitizeNumber(
      source.randomization,
      fallback.randomization,
      0,
      1,
    ),
    spawnRatePerSec: sanitizeNumber(
      source.spawnRatePerSec,
      fallback.spawnRatePerSec,
      0,
      Number.POSITIVE_INFINITY,
    ),
  };
};

const sanitizeArenaAsteroidFieldTuning = (
  value: unknown,
  fallback: ArenaAsteroidFieldTuning,
): ArenaAsteroidFieldTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof ArenaAsteroidFieldTuning, unknown>>)
      : {};

  return {
    large: sanitizeArenaAsteroidFieldPartTuning(source.large, fallback.large),
    micro: sanitizeArenaAsteroidFieldPartTuning(source.micro, fallback.micro),
    small: sanitizeArenaAsteroidFieldPartTuning(source.small, fallback.small),
  };
};

const sanitizeArenaGameplayTuning = (
  value: unknown,
  fallback: ArenaGameplayTuning,
): ArenaGameplayTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof ArenaGameplayTuning, unknown>>)
      : {};

  return {
    asteroidField: sanitizeArenaAsteroidFieldTuning(
      source.asteroidField,
      fallback.asteroidField,
    ),
    instantDeath: sanitizeBoolean(source.instantDeath, fallback.instantDeath),
    radius: sanitizeNumber(
      source.radius,
      fallback.radius,
      1_400,
      Number.POSITIVE_INFINITY,
    ),
  };
};

const sanitizeGameplayAiMovementTuning = (
  value: unknown,
  fallback: GameplayAiMovementTuning,
): GameplayAiMovementTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof GameplayAiMovementTuning, unknown>>)
      : {};

  return {
    candidateDirections: sanitizeInteger(
      source.candidateDirections,
      fallback.candidateDirections,
      4,
      32,
    ),
    evaluationHorizonSec: sanitizeDifficultyNumberTuning(
      source.evaluationHorizonSec,
      fallback.evaluationHorizonSec,
      0.4,
      8,
    ),
    objectiveFanoutDeg: sanitizeNumber(
      source.objectiveFanoutDeg,
      fallback.objectiveFanoutDeg,
      0,
      90,
    ),
    simulationSteps: sanitizeDifficultyIntegerTuning(
      source.simulationSteps,
      fallback.simulationSteps,
      4,
      96,
    ),
  };
};

const sanitizeGameplayAiThreatTuning = (
  value: unknown,
  fallback: GameplayAiThreatTuning,
): GameplayAiThreatTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof GameplayAiThreatTuning, unknown>>)
      : {};

  return {
    lookaheadSec: sanitizeDifficultyNumberTuning(
      source.lookaheadSec,
      fallback.lookaheadSec,
      0.4,
      8,
    ),
    simulationSteps: sanitizeDifficultyIntegerTuning(
      source.simulationSteps,
      fallback.simulationSteps,
      4,
      96,
    ),
  };
};

const sanitizeGameplayAiShotTuning = (
  value: unknown,
  fallback: GameplayAiShotTuning,
): GameplayAiShotTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof GameplayAiShotTuning, unknown>>)
      : {};

  return {
    confidenceThresholds: sanitizeDifficultyRocketNumberTuning(
      source.confidenceThresholds,
      fallback.confidenceThresholds,
      0,
      1,
    ),
    targetPredictionHorizonSec: sanitizeDifficultyNumberTuning(
      source.targetPredictionHorizonSec,
      fallback.targetPredictionHorizonSec,
      0.2,
      8,
    ),
    targetPredictionSteps: sanitizeDifficultyIntegerTuning(
      source.targetPredictionSteps,
      fallback.targetPredictionSteps,
      4,
      96,
    ),
  };
};

const sanitizeGameplayAiExecutionTuning = (
  value: unknown,
  fallback: GameplayAiExecutionTuning,
): GameplayAiExecutionTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof GameplayAiExecutionTuning, unknown>>)
      : {};

  return {
    boostCommitScoreDelta: sanitizeNumber(
      source.boostCommitScoreDelta,
      fallback.boostCommitScoreDelta,
      0,
      60,
    ),
    boostPenaltyMultipleCharges: sanitizeNumber(
      source.boostPenaltyMultipleCharges,
      fallback.boostPenaltyMultipleCharges,
      0,
      1,
    ),
    boostPenaltySingleCharge: sanitizeNumber(
      source.boostPenaltySingleCharge,
      fallback.boostPenaltySingleCharge,
      0,
      1,
    ),
    cacheRunFireConfidence: sanitizeNumber(
      source.cacheRunFireConfidence,
      fallback.cacheRunFireConfidence,
      0,
      1,
    ),
    pressureLightOverrideConfidence: sanitizeNumber(
      source.pressureLightOverrideConfidence,
      fallback.pressureLightOverrideConfidence,
      0,
      1,
    ),
    pressureLightOverrideDamage: sanitizeNumber(
      source.pressureLightOverrideDamage,
      fallback.pressureLightOverrideDamage,
      0,
      1_000,
    ),
    pressureLightOverrideWaste: sanitizeNumber(
      source.pressureLightOverrideWaste,
      fallback.pressureLightOverrideWaste,
      0,
      1,
    ),
    repositionFireConfidence: sanitizeNumber(
      source.repositionFireConfidence,
      fallback.repositionFireConfidence,
      0,
      1,
    ),
  };
};

const sanitizeGameplayAiTuning = (
  value: unknown,
  fallback: GameplayAiTuning,
): GameplayAiTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof GameplayAiTuning, unknown>>)
      : {};

  return {
    execution: sanitizeGameplayAiExecutionTuning(
      source.execution,
      fallback.execution,
    ),
    movement: sanitizeGameplayAiMovementTuning(
      source.movement,
      fallback.movement,
    ),
    shots: sanitizeGameplayAiShotTuning(source.shots, fallback.shots),
    threat: sanitizeGameplayAiThreatTuning(source.threat, fallback.threat),
  };
};

const sanitizeBlackHoleSpec = (
  value: unknown,
  fallback: BlackHoleSpec,
): BlackHoleSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof BlackHoleSpec, unknown>>)
      : {};

  return {
    killRadius: sanitizeNumber(
      source.killRadius,
      fallback.killRadius,
      1,
      2_000,
    ),
    mass: sanitizeNumber(source.mass, fallback.mass, 0, 50_000_000),
    rampSec: sanitizeNumber(source.rampSec, fallback.rampSec, 0.1, 600),
    spawnSec: sanitizeNumber(source.spawnSec, fallback.spawnSec, 0, 600),
  };
};

const sanitizeMatchTimerSpec = (
  value: unknown,
  fallback: MatchTimerSpec,
): MatchTimerSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof MatchTimerSpec, unknown>>)
      : {};

  return {
    countdownSec: sanitizeInteger(
      source.countdownSec,
      fallback.countdownSec,
      1,
      30,
    ),
    lobbySec: sanitizeInteger(source.lobbySec, fallback.lobbySec, 1, 300),
    pickSec: sanitizeInteger(source.pickSec, fallback.pickSec, 1, 300),
    rematchVoteSec: sanitizeInteger(
      source.rematchVoteSec,
      fallback.rematchVoteSec,
      1,
      300,
    ),
  };
};

const sanitizeRocketVisualSpec = (
  value: unknown,
  fallback: RocketVisualTuning,
): RocketVisualTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof RocketVisualTuning, unknown>>)
      : {};

  return {
    bodyScale: sanitizeVec2(source.bodyScale, fallback.bodyScale),
    core: sanitizeHexColor(source.core, fallback.core),
    flameScale: sanitizeVec2(source.flameScale, fallback.flameScale),
    hudAccent: sanitizeHexColor(source.hudAccent, fallback.hudAccent),
    scale: sanitizeNumber(
      source.scale,
      fallback.scale,
      0.1,
      Number.POSITIVE_INFINITY,
    ),
    trail: sanitizeHexColor(source.trail, fallback.trail),
    trailScale: sanitizeVec2(source.trailScale, fallback.trailScale),
  };
};

const sanitizeCannonVisualTuning = (
  value: unknown,
  fallback: CannonVisualTuning,
): CannonVisualTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof CannonVisualTuning, unknown>>)
      : {};

  return {
    barrelLength: sanitizeNumber(
      source.barrelLength,
      fallback.barrelLength,
      1,
      128,
    ),
    barrelWidth: sanitizeNumber(
      source.barrelWidth,
      fallback.barrelWidth,
      0.5,
      64,
    ),
    bandLength: sanitizeNumber(source.bandLength, fallback.bandLength, 0.5, 64),
    bandWidth: sanitizeNumber(source.bandWidth, fallback.bandWidth, 0.5, 64),
    breechDepth: sanitizeNumber(
      source.breechDepth,
      fallback.breechDepth,
      1,
      96,
    ),
    breechLength: sanitizeNumber(
      source.breechLength,
      fallback.breechLength,
      1,
      96,
    ),
    breechWidth: sanitizeNumber(
      source.breechWidth,
      fallback.breechWidth,
      1,
      96,
    ),
    flashDurationSec: sanitizeNumber(
      source.flashDurationSec,
      fallback.flashDurationSec,
      0.02,
      2,
    ),
    flashRadius: sanitizeNumber(
      source.flashRadius,
      fallback.flashRadius,
      0.5,
      128,
    ),
    muzzleLength: sanitizeNumber(
      source.muzzleLength,
      fallback.muzzleLength,
      0.5,
      64,
    ),
    muzzleRadius: sanitizeNumber(
      source.muzzleRadius,
      fallback.muzzleRadius,
      0.5,
      64,
    ),
    stemLength: sanitizeNumber(source.stemLength, fallback.stemLength, 0.5, 64),
    stemWidth: sanitizeNumber(source.stemWidth, fallback.stemWidth, 0.5, 64),
  };
};

const sanitizeNeutronStarVisualTuning = (
  value: unknown,
  fallback: NeutronStarVisualTuning,
): NeutronStarVisualTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof NeutronStarVisualTuning, unknown>>)
      : {};

  return {
    haloOpacity: sanitizeNumber(source.haloOpacity, fallback.haloOpacity, 0, 1),
    haloScale: sanitizeNumber(source.haloScale, fallback.haloScale, 0.25, 12),
    jetLengthScale: sanitizeNumber(
      source.jetLengthScale,
      fallback.jetLengthScale,
      0.25,
      16,
    ),
    jetOpacity: sanitizeNumber(source.jetOpacity, fallback.jetOpacity, 0, 1),
    jetWidthScale: sanitizeNumber(
      source.jetWidthScale,
      fallback.jetWidthScale,
      0.02,
      4,
    ),
    lensOpacity: sanitizeNumber(source.lensOpacity, fallback.lensOpacity, 0, 1),
    lensScale: sanitizeNumber(source.lensScale, fallback.lensScale, 0.25, 16),
  };
};

const sanitizePlanetArchetypeVisualSpec = (
  value: unknown,
  fallback: PlanetArchetypeVisualSpec,
): PlanetArchetypeVisualSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof PlanetArchetypeVisualSpec, unknown>>)
      : {};
  const legacySource =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    auraGap: sanitizeNumber(source.auraGap, fallback.auraGap, 0, 10),
    auraScale: sanitizeNumber(
      source.auraScale,
      fallback.auraScale,
      0.5,
      Number.POSITIVE_INFINITY,
    ),
    bodyScale: sanitizeNumber(
      source.bodyScale,
      fallback.bodyScale,
      0.5,
      Number.POSITIVE_INFINITY,
    ),
    color: sanitizeHexColor(source.color, fallback.color),
    continentsScale: sanitizeNumber(
      source.continentsScale,
      fallback.continentsScale,
      0.25,
      4,
    ),
    forestAltitude: sanitizeNumber(
      source.forestAltitude,
      fallback.forestAltitude,
      -0.4,
      0.4,
    ),
    forestColor: sanitizeHexColor(source.forestColor, fallback.forestColor),
    forestCoverage: sanitizeNumber(
      source.forestCoverage ?? legacySource.forestDensity,
      fallback.forestCoverage,
      0,
      2,
    ),
    forestPatchSize: sanitizeNumber(
      source.forestPatchSize,
      fallback.forestPatchSize,
      0.5,
      4,
    ),
    mountainHeight: sanitizeNumber(
      source.mountainHeight,
      fallback.mountainHeight,
      0,
      3,
    ),
    mountainsScale: sanitizeNumber(
      source.mountainsScale,
      fallback.mountainsScale,
      0.25,
      4,
    ),
    oceanDeepColor: sanitizeHexColor(
      source.oceanDeepColor,
      fallback.oceanDeepColor,
    ),
    oceanShallowColor: sanitizeHexColor(
      source.oceanShallowColor,
      fallback.oceanShallowColor,
    ),
    seaLevel: sanitizeNumber(source.seaLevel, fallback.seaLevel, 0, 1),
    trailColor: sanitizeHexColor(source.trailColor, fallback.trailColor),
  };
};

export const sanitizeGameTuning = (value: unknown): GameTuningDocument => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<GameTuningDocument>)
      : {};
  const visuals =
    source.visuals !== null && typeof source.visuals === "object"
      ? (source.visuals as Partial<VisualTuning>)
      : ({} as Partial<VisualTuning>);
  const gameplay =
    source.gameplay !== null && typeof source.gameplay === "object"
      ? (source.gameplay as Partial<GameplayTuning>)
      : ({} as Partial<GameplayTuning>);
  const fallback = DEFAULT_GAME_TUNING;

  const nextArchetypes = Object.fromEntries(
    ARCHETYPE_IDS.map((archetype) => [
      archetype,
      sanitizePlanetArchetypeVisualSpec(
        visuals.planets?.archetypes?.[archetype],
        fallback.visuals.planets.archetypes[archetype],
      ),
    ]),
  ) as Record<ArchetypeId, PlanetArchetypeVisualSpec>;
  const sunVisualsSource =
    visuals.suns !== null && typeof visuals.suns === "object"
      ? (visuals.suns as Partial<
          SunVisualTuning & {
            bodyScale?: unknown;
            color?: unknown;
            coreBrightness?: unknown;
            glowBrightness?: unknown;
            glowColor?: unknown;
            glowScale?: unknown;
            warpScale?: unknown;
          }
        >)
      : {};
  const sunProfileSources = Array.isArray(sunVisualsSource.profiles)
    ? sunVisualsSource.profiles
    : [];

  return {
    version: 1,
    visuals: {
      background: {
        baseColor: sanitizeHexColor(
          visuals.background?.baseColor,
          fallback.visuals.background.baseColor,
        ),
        distantBodiesColor: sanitizeHexColor(
          visuals.background?.distantBodiesColor,
          fallback.visuals.background.distantBodiesColor,
        ),
        distantBodiesEnabled: sanitizeBoolean(
          visuals.background?.distantBodiesEnabled,
          fallback.visuals.background.distantBodiesEnabled,
        ),
        distantBodiesOpacity: sanitizeNumber(
          visuals.background?.distantBodiesOpacity,
          fallback.visuals.background.distantBodiesOpacity,
          0,
          1,
        ),
        distantBodiesScale: sanitizeNumber(
          visuals.background?.distantBodiesScale,
          fallback.visuals.background.distantBodiesScale,
          0.5,
          2.5,
        ),
        dustBrightness: sanitizeNumber(
          visuals.background?.dustBrightness,
          fallback.visuals.background.dustBrightness,
          0,
          2,
        ),
        dustDensity: sanitizeNumber(
          visuals.background?.dustDensity,
          fallback.visuals.background.dustDensity,
          0,
          3,
        ),
        dustDrift: sanitizeNumber(
          visuals.background?.dustDrift,
          fallback.visuals.background.dustDrift,
          0,
          3,
        ),
        dustEnabled: sanitizeBoolean(
          visuals.background?.dustEnabled,
          fallback.visuals.background.dustEnabled,
        ),
        dustSize: sanitizeNumber(
          visuals.background?.dustSize,
          fallback.visuals.background.dustSize,
          0.25,
          4,
        ),
        eventsEnabled: sanitizeBoolean(
          visuals.background?.eventsEnabled,
          fallback.visuals.background.eventsEnabled,
        ),
        eventsFrequency: sanitizeNumber(
          visuals.background?.eventsFrequency,
          fallback.visuals.background.eventsFrequency,
          0,
          3,
        ),
        eventsIntensity: sanitizeNumber(
          visuals.background?.eventsIntensity,
          fallback.visuals.background.eventsIntensity,
          0,
          1,
        ),
        glowColor: sanitizeHexColor(
          visuals.background?.glowColor,
          fallback.visuals.background.glowColor,
        ),
        movingObjectsBrightness: sanitizeNumber(
          visuals.background?.movingObjectsBrightness,
          fallback.visuals.background.movingObjectsBrightness,
          0,
          2,
        ),
        movingObjectsDensity: sanitizeNumber(
          visuals.background?.movingObjectsDensity,
          fallback.visuals.background.movingObjectsDensity,
          0,
          3,
        ),
        movingObjectsEnabled: sanitizeBoolean(
          visuals.background?.movingObjectsEnabled,
          fallback.visuals.background.movingObjectsEnabled,
        ),
        movingObjectsSize: sanitizeNumber(
          visuals.background?.movingObjectsSize,
          fallback.visuals.background.movingObjectsSize,
          0.5,
          4,
        ),
        movingObjectsSpeed: sanitizeNumber(
          visuals.background?.movingObjectsSpeed,
          fallback.visuals.background.movingObjectsSpeed,
          0,
          3,
        ),
        nebulaColor: sanitizeHexColor(
          visuals.background?.nebulaColor,
          fallback.visuals.background.nebulaColor,
        ),
        nebulaDrift: sanitizeNumber(
          visuals.background?.nebulaDrift,
          fallback.visuals.background.nebulaDrift,
          0,
          3,
        ),
        nebulaEnabled: sanitizeBoolean(
          visuals.background?.nebulaEnabled,
          fallback.visuals.background.nebulaEnabled,
        ),
        nebulaScale: sanitizeNumber(
          visuals.background?.nebulaScale,
          fallback.visuals.background.nebulaScale,
          0.25,
          3,
        ),
        nebulaStrength: sanitizeNumber(
          visuals.background?.nebulaStrength,
          fallback.visuals.background.nebulaStrength,
          0,
          1,
        ),
        starBrightness: sanitizeNumber(
          visuals.background?.starBrightness,
          fallback.visuals.background.starBrightness,
          0,
          3,
        ),
        starColorVariance: sanitizeNumber(
          visuals.background?.starColorVariance,
          fallback.visuals.background.starColorVariance,
          0,
          1,
        ),
        starDensity: sanitizeNumber(
          visuals.background?.starDensity,
          fallback.visuals.background.starDensity,
          0,
          3,
        ),
        starSize: sanitizeNumber(
          visuals.background?.starSize,
          fallback.visuals.background.starSize,
          0.25,
          3,
        ),
        starsEnabled: sanitizeBoolean(
          visuals.background?.starsEnabled,
          fallback.visuals.background.starsEnabled,
        ),
        starTwinkleAmount: sanitizeNumber(
          visuals.background?.starTwinkleAmount,
          fallback.visuals.background.starTwinkleAmount,
          0,
          2,
        ),
        starTwinkleEnabled: sanitizeBoolean(
          visuals.background?.starTwinkleEnabled,
          fallback.visuals.background.starTwinkleEnabled,
        ),
      },
      displayMode: sanitizeViewportDisplayMode(
        visuals.displayMode,
        fallback.visuals.displayMode,
      ),
      planets: {
        archetypes: nextArchetypes,
        material: sanitizePlanetMaterialTuning(
          visuals.planets?.material,
          fallback.visuals.planets.material,
        ),
        variation: sanitizePlanetVariationTuning(
          visuals.planets?.variation,
          fallback.visuals.planets.variation,
        ),
        aura: sanitizePlanetAuraTuning(
          visuals.planets?.aura,
          fallback.visuals.planets.aura,
        ),
      },
      suns: {
        profiles: fallback.visuals.suns.profiles.map((profile, index) =>
          sanitizeSunVisualProfile(sunProfileSources[index], profile, {
            bodyScale: sunVisualsSource.bodyScale,
            color: sunVisualsSource.color,
            coreBrightness: sunVisualsSource.coreBrightness,
            glowBrightness: sunVisualsSource.glowBrightness,
            glowColor: sunVisualsSource.glowColor,
            glowScale: sunVisualsSource.glowScale,
            warpScale: sunVisualsSource.warpScale,
          }),
        ) as SunVisualTuning["profiles"],
      },
      blackHole: {
        coreRadius: sanitizeNumber(
          visuals.blackHole?.coreRadius,
          fallback.visuals.blackHole.coreRadius,
          20,
          1_500,
        ),
        lensRadius: sanitizeNumber(
          visuals.blackHole?.lensRadius,
          fallback.visuals.blackHole.lensRadius,
          20,
          2_500,
        ),
        ringRadius: sanitizeNumber(
          visuals.blackHole?.ringRadius,
          fallback.visuals.blackHole.ringRadius,
          20,
          2_000,
        ),
      },
      neutronStars: sanitizeNeutronStarVisualTuning(
        visuals.neutronStars,
        fallback.visuals.neutronStars,
      ),
      cannon: sanitizeCannonVisualTuning(
        visuals.cannon,
        fallback.visuals.cannon,
      ),
      rockets: {
        light: sanitizeRocketVisualSpec(
          visuals.rockets?.light,
          fallback.visuals.rockets.light,
        ),
        heavy: sanitizeRocketVisualSpec(
          visuals.rockets?.heavy,
          fallback.visuals.rockets.heavy,
        ),
        seeker: sanitizeRocketVisualSpec(
          visuals.rockets?.seeker,
          fallback.visuals.rockets.seeker,
        ),
      },
      abilities: {
        boostColor: sanitizeHexColor(
          visuals.abilities?.boostColor,
          fallback.visuals.abilities.boostColor,
        ),
        shieldColor: sanitizeHexColor(
          visuals.abilities?.shieldColor,
          fallback.visuals.abilities.shieldColor,
        ),
        wildcardColor: sanitizeHexColor(
          visuals.abilities?.wildcardColor,
          fallback.visuals.abilities.wildcardColor,
        ),
      },
      caches: {
        badgeBaseSize: sanitizeNumber(
          visuals.caches?.badgeBaseSize,
          fallback.visuals.caches.badgeBaseSize,
          16,
          526,
        ),
        badgeScale: sanitizeNumber(
          visuals.caches?.badgeScale,
          fallback.visuals.caches.badgeScale,
          0.5,
          3,
        ),
      },
      orbits: {
        boundaryDebris: sanitizeOrbitBoundaryDebrisVisualTuning(
          visuals.orbits?.boundaryDebris,
          fallback.visuals.orbits.boundaryDebris,
        ),
      },
      hud: {
        bottomInset: sanitizeNumber(
          visuals.hud?.bottomInset,
          fallback.visuals.hud.bottomInset,
          0,
          120,
        ),
        cardRadius: sanitizeNumber(
          visuals.hud?.cardRadius,
          fallback.visuals.hud.cardRadius,
          4,
          40,
        ),
        compactCardRadius: sanitizeNumber(
          visuals.hud?.compactCardRadius,
          fallback.visuals.hud.compactCardRadius,
          4,
          32,
        ),
        connectionWidth: sanitizeNumber(
          visuals.hud?.connectionWidth,
          fallback.visuals.hud.connectionWidth,
          120,
          480,
        ),
        dockGap: sanitizeNumber(
          visuals.hud?.dockGap,
          fallback.visuals.hud.dockGap,
          0,
          32,
        ),
        killFeedEntryRadius: sanitizeNumber(
          visuals.hud?.killFeedEntryRadius,
          fallback.visuals.hud.killFeedEntryRadius,
          4,
          32,
        ),
        leftColumnWidth: sanitizeNumber(
          visuals.hud?.leftColumnWidth,
          fallback.visuals.hud.leftColumnWidth,
          180,
          520,
        ),
        panelBlurPx: sanitizeNumber(
          visuals.hud?.panelBlurPx,
          fallback.visuals.hud.panelBlurPx,
          0,
          48,
        ),
        panelGap: sanitizeNumber(
          visuals.hud?.panelGap,
          fallback.visuals.hud.panelGap,
          0,
          32,
        ),
        panelRadius: sanitizeNumber(
          visuals.hud?.panelRadius,
          fallback.visuals.hud.panelRadius,
          4,
          40,
        ),
        pillRadius: sanitizeNumber(
          visuals.hud?.pillRadius,
          fallback.visuals.hud.pillRadius,
          4,
          40,
        ),
        shortcutsSectionGap: sanitizeNumber(
          visuals.hud?.shortcutsSectionGap,
          fallback.visuals.hud.shortcutsSectionGap,
          0,
          64,
        ),
        sideInset: sanitizeNumber(
          visuals.hud?.sideInset,
          fallback.visuals.hud.sideInset,
          0,
          120,
        ),
        timerWidth: sanitizeNumber(
          visuals.hud?.timerWidth,
          fallback.visuals.hud.timerWidth,
          120,
          480,
        ),
        topInset: sanitizeNumber(
          visuals.hud?.topInset,
          fallback.visuals.hud.topInset,
          0,
          120,
        ),
      },
    },
    gameplay: {
      ai: sanitizeGameplayAiTuning(gameplay.ai, fallback.gameplay.ai),
      arena: sanitizeArenaGameplayTuning(
        gameplay.arena,
        fallback.gameplay.arena,
      ),
      blackHole: sanitizeBlackHoleSpec(
        gameplay.blackHole,
        fallback.gameplay.blackHole,
      ),
      camera: sanitizeGameplayCameraTuning(
        gameplay.camera,
        fallback.gameplay.camera,
      ),
      neutronStars: sanitizeNeutronStarSpec(
        gameplay.neutronStars,
        fallback.gameplay.neutronStars,
      ),
      orbits: {
        planetStartSpeedScale: sanitizeNumber(
          gameplay.orbits?.planetStartSpeedScale,
          fallback.gameplay.orbits.planetStartSpeedScale,
          0,
          Number.POSITIVE_INFINITY,
        ),
        starPatternDistanceScale: sanitizeNumber(
          gameplay.orbits?.starPatternDistanceScale,
          fallback.gameplay.orbits.starPatternDistanceScale,
          0.5,
          Number.POSITIVE_INFINITY,
        ),
        starMotion: sanitizeOrbitStarMotionTuning(
          gameplay.orbits?.starMotion,
          fallback.gameplay.orbits.starMotion,
        ),
        sunStartDistanceScale: sanitizeNumber(
          gameplay.orbits?.sunStartDistanceScale,
          fallback.gameplay.orbits.sunStartDistanceScale,
          0.5,
          Number.POSITIVE_INFINITY,
        ),
        planetCircleRadius: sanitizeNumber(
          gameplay.orbits?.planetCircleRadius,
          fallback.gameplay.orbits.planetCircleRadius,
          400,
          Number.POSITIVE_INFINITY,
        ),
        suns: fallback.gameplay.orbits.suns.map((sun, index) =>
          sanitizeOrbitSunGameplayTuning(gameplay.orbits?.suns?.[index], sun),
        ) as OrbitGameplayTuning["suns"],
        planets: fallback.gameplay.orbits.planets.map((planet, index) =>
          sanitizeOrbitPlanetGameplayTuning(
            gameplay.orbits?.planets?.[index],
            planet,
          ),
        ) as OrbitGameplayTuning["planets"],
      },
      rockets: {
        light: sanitizeRocketSpec(
          gameplay.rockets?.light,
          fallback.gameplay.rockets.light,
        ),
        heavy: sanitizeRocketSpec(
          gameplay.rockets?.heavy,
          fallback.gameplay.rockets.heavy,
        ),
        seeker: sanitizeRocketSpec(
          gameplay.rockets?.seeker,
          fallback.gameplay.rockets.seeker,
        ),
      },
      abilities: {
        shield: sanitizeShieldSpec(
          gameplay.abilities?.shield,
          fallback.gameplay.abilities.shield,
        ),
        boost: sanitizeBoostSpec(
          gameplay.abilities?.boost,
          fallback.gameplay.abilities.boost,
        ),
        gravityPulse: sanitizeGravityPulseSpec(
          gameplay.abilities?.gravityPulse,
          fallback.gameplay.abilities.gravityPulse,
        ),
      },
      cache: sanitizeCacheSpec(gameplay.cache, fallback.gameplay.cache),
      timers: sanitizeMatchTimerSpec(gameplay.timers, fallback.gameplay.timers),
    },
  };
};

export const cloneGameTuningDocument = (
  value: GameTuningDocument,
): GameTuningDocument =>
  JSON.parse(JSON.stringify(value)) as GameTuningDocument;

export const CURRENT_GAME_TUNING: GameTuningDocument = sanitizeGameTuning(
  currentTuningDocument,
);
