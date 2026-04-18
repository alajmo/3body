import currentTuningDocument from "./tuning/current.json";
import { ARCHETYPE_IDS } from "./archetypes";
import type {
  AbilitySpec,
  BlackHoleSpec,
  BoostSpec,
  CacheSpec,
  DroneSpec,
  GravityPulseSpec,
  MatchTimerSpec,
  RocketSpec,
} from "./constants";
import type { ArchetypeId, RocketKind } from "./entities";
import { fromAngle, scale, type Vec2 } from "./vec2";

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
  trail: string;
  trailScale: Vec2;
}

export interface AbilityVisualTuning {
  boostColor: string;
  foresight: ForesightPathVisualTuning;
  foresightColor: string;
  shieldColor: string;
  wildcardColor: string;
}

export interface ForesightPathVisualTuning {
  dotColor: string;
  dotOpacity: number;
  farStride: number;
  leadGap: number;
  lineColor: string;
  lineOpacity: number;
  midStride: number;
  nearStride: number;
  pointSize: number;
  showDots: boolean;
  showLine: boolean;
}

export interface DroneVisualTuning {
  activeColor: string;
}

export interface CacheVisualTuning {
  badgeBaseSize: number;
  badgeScale: number;
}

export interface OrbitBoundaryDebrisVisualTuning {
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

export interface VisualTuning {
  abilities: AbilityVisualTuning;
  background: BackgroundVisualTuning;
  blackHole: BlackHoleVisualTuning;
  caches: CacheVisualTuning;
  cannon: CannonVisualTuning;
  drone: DroneVisualTuning;
  hud: HudVisualTuning;
  orbits: OrbitVisualTuning;
  planets: PlanetVisualTuning;
  rockets: Record<RocketKind, RocketVisualTuning>;
  suns: SunVisualTuning;
}

export interface GameplayCameraTuning {
  readModeWorldHeight: number;
  viewportWorldHeight: number;
}

export interface ArenaGameplayTuning {
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

export interface OrbitSystemDriftGameplayTuning {
  directionDeg: number;
  speed: number;
}

export interface OrbitGameplayTuning {
  sunStartDistanceScale: number;
  planetCircleRadius: number;
  systemDrift: OrbitSystemDriftGameplayTuning;
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

export interface GameplayTuning {
  abilities: {
    boost: BoostSpec;
    foresight: AbilitySpec;
    gravityPulse: GravityPulseSpec;
    shield: ShieldSpec;
  };
  arena: ArenaGameplayTuning;
  blackHole: BlackHoleSpec;
  cache: CacheSpec;
  camera: GameplayCameraTuning;
  drone: DroneSpec;
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

export const getOrbitSystemDriftVelocity = (
  tuning: OrbitGameplayTuning,
): Vec2 =>
  scale(
    fromAngle((tuning.systemDrift.directionDeg * Math.PI) / 180),
    tuning.systemDrift.speed,
  );

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
    radius: sanitizeNumber(source.radius, fallback.radius, 8, 500),
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

const sanitizeOrbitSystemDriftGameplayTuning = (
  value: unknown,
  fallback: OrbitSystemDriftGameplayTuning,
): OrbitSystemDriftGameplayTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<
          Record<keyof OrbitSystemDriftGameplayTuning, unknown>
        >)
      : {};

  return {
    directionDeg: sanitizeNumber(
      source.directionDeg,
      fallback.directionDeg,
      0,
      360,
    ),
    speed: sanitizeNumber(source.speed, fallback.speed, 0, 2_000),
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

const sanitizeForesightPathVisualTuning = (
  value: unknown,
  fallback: ForesightPathVisualTuning,
): ForesightPathVisualTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof ForesightPathVisualTuning, unknown>>)
      : {};

  return {
    dotColor: sanitizeHexColor(source.dotColor, fallback.dotColor),
    dotOpacity: sanitizeNumber(source.dotOpacity, fallback.dotOpacity, 0, 1),
    farStride: sanitizeInteger(source.farStride, fallback.farStride, 1, 12),
    leadGap: sanitizeNumber(source.leadGap, fallback.leadGap, 0, 120),
    lineColor: sanitizeHexColor(source.lineColor, fallback.lineColor),
    lineOpacity: sanitizeNumber(source.lineOpacity, fallback.lineOpacity, 0, 1),
    midStride: sanitizeInteger(source.midStride, fallback.midStride, 1, 12),
    nearStride: sanitizeInteger(source.nearStride, fallback.nearStride, 1, 12),
    pointSize: sanitizeNumber(source.pointSize, fallback.pointSize, 1, 64),
    showDots: sanitizeBoolean(source.showDots, fallback.showDots),
    showLine: sanitizeBoolean(source.showLine, fallback.showLine),
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
        bodyScale: { x: 24, y: 4.8 },
        flameScale: { x: 22, y: 9 },
        trailScale: { x: 30, y: 6 },
      },
      heavy: {
        core: "#ff8d4a",
        trail: "#ff6130",
        hudAccent: "#ff7a3d",
        bodyScale: { x: 31, y: 7.8 },
        flameScale: { x: 28, y: 14 },
        trailScale: { x: 36, y: 9 },
      },
      seeker: {
        core: "#f564ff",
        trail: "#ff4dd4",
        hudAccent: "#ff61eb",
        bodyScale: { x: 27, y: 6.2 },
        flameScale: { x: 25, y: 11 },
        trailScale: { x: 33, y: 7.5 },
      },
    },
    abilities: {
      foresightColor: "#80d7ff",
      foresight: {
        dotColor: "#80d7ff",
        dotOpacity: 0.82,
        farStride: 6,
        leadGap: 24,
        lineColor: "#81d7ff",
        lineOpacity: 0.76,
        midStride: 4,
        nearStride: 3,
        pointSize: 9,
        showDots: true,
        showLine: false,
      },
      shieldColor: "#86ecff",
      boostColor: "#8bc6ff",
      wildcardColor: "#ffd37a",
    },
    drone: {
      activeColor: "#91ffd2",
    },
    caches: {
      badgeScale: 1,
      badgeBaseSize: 80,
    },
    orbits: {
      boundaryDebris: {
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
    arena: {
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
      readModeWorldHeight: 7_600,
      viewportWorldHeight: 4600,
    },
    orbits: {
      sunStartDistanceScale: 1,
      planetCircleRadius: 2_200,
      systemDrift: {
        directionDeg: 0,
        speed: 0,
      },
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
      foresight: {
        cooldownSec: 12,
        durationSec: 4,
      },
      shield: {
        cooldownSec: 15,
        durationSec: 4,
        arcDeg: 120,
      },
      boost: {
        charges: 1,
        cooldownSec: 5,
        magnitude: 280,
      },
      gravityPulse: {
        force: 1800,
        radius: 2_000,
      },
    },
    drone: {
      damage: 55,
      speed: 620,
      thrust: 220,
      turnRateDeg: 240,
      ttlSec: 5,
      cooldownSec: 8,
    },
    cache: {
      count: 3,
      respawnSec: 15,
      wildcardChance: 0.1,
    },
    timers: {
      lobbySec: 30,
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

const sanitizeDroneSpec = (value: unknown, fallback: DroneSpec): DroneSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof DroneSpec, unknown>>)
      : {};

  return {
    cooldownSec: sanitizeNumber(
      source.cooldownSec,
      fallback.cooldownSec,
      0.05,
      300,
    ),
    damage: sanitizeNumber(source.damage, fallback.damage, 0, 10_000),
    speed: sanitizeNumber(source.speed, fallback.speed, 1, 4_000),
    thrust: sanitizeNumber(source.thrust, fallback.thrust, 0, 4_000),
    turnRateDeg: sanitizeNumber(
      source.turnRateDeg,
      fallback.turnRateDeg,
      0,
      1_080,
    ),
    ttlSec: sanitizeNumber(source.ttlSec, fallback.ttlSec, 0.1, 300),
  };
};

const sanitizeCacheSpec = (value: unknown, fallback: CacheSpec): CacheSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof CacheSpec, unknown>>)
      : {};

  return {
    count: sanitizeInteger(source.count, fallback.count, 0, 20),
    respawnSec: sanitizeNumber(source.respawnSec, fallback.respawnSec, 0, 300),
    wildcardChance: sanitizeNumber(
      source.wildcardChance,
      fallback.wildcardChance,
      0,
      1,
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
    readModeWorldHeight: sanitizeNumber(
      source.readModeWorldHeight,
      fallback.readModeWorldHeight,
      100,
      10_000,
    ),
    viewportWorldHeight: sanitizeNumber(
      source.viewportWorldHeight,
      fallback.viewportWorldHeight,
      100,
      10_000,
    ),
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
    instantDeath: sanitizeBoolean(source.instantDeath, fallback.instantDeath),
    radius: sanitizeNumber(
      source.radius,
      fallback.radius,
      1_400,
      Number.POSITIVE_INFINITY,
    ),
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
    auraScale: sanitizeNumber(source.auraScale, fallback.auraScale, 0.5, 10),
    bodyScale: sanitizeNumber(source.bodyScale, fallback.bodyScale, 0.5, 10),
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
        foresight: sanitizeForesightPathVisualTuning(
          visuals.abilities?.foresight,
          fallback.visuals.abilities.foresight,
        ),
        foresightColor: sanitizeHexColor(
          visuals.abilities?.foresightColor,
          fallback.visuals.abilities.foresightColor,
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
      drone: {
        activeColor: sanitizeHexColor(
          visuals.drone?.activeColor,
          fallback.visuals.drone.activeColor,
        ),
      },
      caches: {
        badgeBaseSize: sanitizeNumber(
          visuals.caches?.badgeBaseSize,
          fallback.visuals.caches.badgeBaseSize,
          16,
          400,
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
      orbits: {
        sunStartDistanceScale: sanitizeNumber(
          gameplay.orbits?.sunStartDistanceScale,
          fallback.gameplay.orbits.sunStartDistanceScale,
          0.5,
          2.5,
        ),
        planetCircleRadius: sanitizeNumber(
          gameplay.orbits?.planetCircleRadius,
          fallback.gameplay.orbits.planetCircleRadius,
          400,
          6_000,
        ),
        systemDrift: sanitizeOrbitSystemDriftGameplayTuning(
          gameplay.orbits?.systemDrift,
          fallback.gameplay.orbits.systemDrift,
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
        foresight: sanitizeAbilitySpec(
          gameplay.abilities?.foresight,
          fallback.gameplay.abilities.foresight,
        ),
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
      drone: sanitizeDroneSpec(gameplay.drone, fallback.gameplay.drone),
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
