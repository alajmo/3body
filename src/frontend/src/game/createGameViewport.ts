import type { CacheContents, RocketKind, Vec2 } from "@3body/shared";
import {
  ARENA_RADIUS,
  add,
  clamp,
  FIXED_STEP_SEC,
  len,
  lerp,
  mulberry32,
  normalize as normalizeVec2,
  PLANET_HP,
  predictPath,
  rot,
  ROCKET_SPECS,
  SHIELD_SPEC,
  scale as scaleVec2,
  sub,
} from "@3body/shared";
import {
  abs,
  attribute,
  bloom,
  color,
  dot,
  float,
  length,
  max,
  mix,
  mx_cell_noise_float,
  mx_fractal_noise_float,
  normalize,
  normalWorld,
  type pass,
  pointUV,
  positionLocal,
  pow,
  renderOutput,
  rgbShift,
  screenUV,
  ssaaPass,
  sin,
  smoothstep,
  timerLocal,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewportSafeUV,
  viewportSharedTexture,
} from "three/tsl";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  PostProcessing,
  Quaternion,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGPURenderer,
} from "three/webgpu";
import {
  type CombatSandboxCache,
  type CombatSandboxDebris,
  type CombatSandboxDrone,
  type CombatSandboxImpactBurst,
  type CombatPlanetDeathReason,
  type CombatSandboxPlanet,
  type CombatSandboxRocket,
  type CombatSandboxRocketLaunchBurst,
  createSandboxState,
  createInterpolatedSandboxState,
  createSandboxInterpolationCache,
  getActiveCombatSuns,
  getSandboxDebugSnapshot,
  getSandboxResetReason,
  SEEKER_LOCK_TICKS,
  syncInterpolatedSandboxState,
  stepSandbox,
  SUN_SWALLOW_FADE_SEC,
} from "./combatSandbox";
import {
  getCannonMuzzleDistance,
  getCannonMuzzleOrigin,
  getLaunchBurstHandoffDuration,
  getLaunchBurstTravelDistance,
  getMinScreenAxisScale,
  getRocketVisibleDistanceThreshold,
  ROCKET_MIN_SCREEN_WIDTH_PX,
  ROCKET_RENDER_INSTANCE_LIMITS,
} from "./rocketVisibility";
import {
  createCacheSpriteAssets,
  createCacheVisual as createSharedCacheVisual,
  disposeCacheSpriteAssets,
  getCacheIconKey as getSharedCacheIconKey,
  type CacheSpriteMaterialMap,
  updateCacheVisualBadge as updateSharedCacheVisualBadge,
} from "./viewport/cacheVisuals";
import { buildLocalSandboxHudState } from "./viewport/localHud";
import { createGameViewportInputController } from "./viewport/localInput";
import { createViewportPerformanceProfiler } from "./viewport/performanceProfiler";
import { createAdaptiveQualityController } from "./viewport/renderQuality";
import { createRuntimeStatsTracker } from "./viewport/runtimeStats";
import {
  createGameViewportSandboxSettingsStore,
  sandboxControlsEnabled as sandboxSettingsControlsEnabled,
} from "./viewport/sandboxSettingsStore";
import {
  createViewportRendererBootstrap,
  showViewportRendererFailure,
} from "./viewport/rendererBootstrap";
import {
  areHudStatesEqual,
  createInitialHudState,
  type CreateGameViewportOptions,
  type GameViewportHudState,
} from "./viewportHud";
import { getRuntimeTuningDocument } from "./runtimeTuning";

const CAMERA_DISTANCE = 100;
const FULL_VIEW_WORLD_HEIGHT = ARENA_RADIUS * 2.25;
const FOLLOW_VIEW_WORLD_HEIGHT = ARENA_RADIUS * 0.92;
const READ_MODE_WORLD_HEIGHT = ARENA_RADIUS * 1.52;
const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_STEPS_PER_FRAME = 12;
const CAMERA_FOLLOW_LERP = 6.4;
const CAMERA_ZOOM_LERP = 5.2;
const READ_MODE_HUD_OPACITY = 0.2;
const FULL_VIEW_PADDING = 260;
const TRAIL_DURATION_SEC = 3.5;
const TRAIL_POINT_SIZE = 12;
const MAX_TRAIL_SAMPLES = Math.ceil(TRAIL_DURATION_SEC * 180) + 8;
const BLOOM_STRENGTH = 1.02;
const BLOOM_RADIUS = 0.18;
const BLOOM_THRESHOLD = 0.82;
const CHROMATIC_ABERRATION_MAX = 0.0012;
const CHROMATIC_DISTANCE_FALLOFF = 720;
const STARFIELD_RADIUS = ARENA_RADIUS * 2.35;
const STARFIELD_TILE_SIZE = STARFIELD_RADIUS * 2;
const SUN_GEOMETRY_SEGMENTS = 40;
const GLOW_GEOMETRY_SEGMENTS = 52;
const WARP_GEOMETRY_SEGMENTS = 72;
const PLANET_GEOMETRY_SEGMENTS = 80;
const KILL_FEED_DURATION_SEC = 4;
const MAX_KILL_FEED_ENTRIES = 6;
const HUD_UPDATE_INTERVAL_SEC = 1 / 12;
const ROCKET_TRAIL_DURATION_SEC = 0.18;
const ROCKET_TRAIL_SAMPLE_DISTANCE = 18;
const MAX_ROCKET_TRAIL_SAMPLES = 9;
const MAX_ROCKET_TRAIL_SEGMENTS = MAX_ROCKET_TRAIL_SAMPLES - 1;
const MAX_ROCKET_TRAIL_INSTANCES = {
  heavy: ROCKET_RENDER_INSTANCE_LIMITS.heavy * MAX_ROCKET_TRAIL_SEGMENTS,
  light: ROCKET_RENDER_INSTANCE_LIMITS.light * MAX_ROCKET_TRAIL_SEGMENTS,
  seeker: ROCKET_RENDER_INSTANCE_LIMITS.seeker * MAX_ROCKET_TRAIL_SEGMENTS,
} satisfies Record<RocketKind, number>;
const MAX_ROCKET_LAUNCH_BURST_INSTANCES = {
  heavy: 24,
  light: 24,
  seeker: 24,
} satisfies Record<RocketKind, number>;
const MAX_DEBRIS_SAMPLES = 512;
const FORESIGHT_WINDOW_SEC = 6;
const FORESIGHT_STEP_INTERVAL = 2;
const FORESIGHT_STEP_SEC = FIXED_STEP_SEC * FORESIGHT_STEP_INTERVAL;
const MAX_FORESIGHT_SAMPLES =
  Math.ceil(FORESIGHT_WINDOW_SEC / FORESIGHT_STEP_SEC) + 2;
const FORESIGHT_POINT_SIZE = 9;
const FORESIGHT_SOLID_FRACTION = 0.28;
const FORESIGHT_FADE_FRACTION = 0.92;
const SHIELD_INNER_SCALE = 1.22;
const SHIELD_OUTER_SCALE = 1.7;
const SHIELD_GLOW_OUTER_SCALE = 2.06;
const BOOST_BURST_DURATION_SEC = 0.48;
const BOOST_BURST_PARTICLES = 32;
const MAX_ACTIVE_BOOST_BURSTS = 4;
const MAX_BOOST_BURST_SAMPLES = BOOST_BURST_PARTICLES * MAX_ACTIVE_BOOST_BURSTS;
const MAX_VISIBLE_IMPACT_BURSTS = 20;
const PLANET_EXPLOSION_DURATION_SEC = 1.55;
const PLANET_EXPLOSION_FLASH_DURATION_SEC = 0.34;
const PLANET_EXPLOSION_RING_DURATION_SEC = 0.78;
const PLANET_EXPLOSION_CHUNK_COUNT = 12;
const MAX_ACTIVE_PLANET_EXPLOSIONS = 6;
const HIT_FLASH_DURATION_SEC = 0.24;
const HP_PULSE_DURATION_SEC = 0.48;
const CAMERA_SHAKE_DURATION_SEC = 0.3;
const MAX_CAMERA_SHAKE_WORLD_OFFSET = 34;
const BACKDROP_OVERDRAW = 1.35;
const RETICLE_BASE_COLOR = "#dff3ff";
const CANNON_STEM_LENGTH_PX = 4;
const CANNON_STEM_WIDTH_PX = 8;
const CANNON_BREECH_LENGTH_PX = 11;
const CANNON_BREECH_WIDTH_PX = 16;
const CANNON_BREECH_DEPTH_PX = 14;
const CANNON_BARREL_LENGTH_PX = 26;
const CANNON_BARREL_WIDTH_PX = 9;
const CANNON_BARREL_BAND_LENGTH_PX = 3.5;
const CANNON_BARREL_BAND_WIDTH_PX = 11.5;
const CANNON_MUZZLE_LENGTH_PX = 4;
const CANNON_MUZZLE_RADIUS_PX = 5.6;
const CANNON_FLASH_RADIUS_PX = 16;
const CANNON_FLASH_DURATION_SEC = 0.14;
const WEAPON_KINDS = [
  "light",
  "heavy",
  "seeker",
] as const satisfies readonly RocketKind[];
const getRuntimeVisuals = () => getRuntimeTuningDocument().visuals;
const getSunGlowScale = () => getRuntimeVisuals().suns.glowScale;
const getSunWarpScale = () => getRuntimeVisuals().suns.warpScale;
const getBlackHoleCoreRadius = () => getRuntimeVisuals().blackHole.coreRadius;
const getBlackHoleRingRadius = () => getRuntimeVisuals().blackHole.ringRadius;
const getBlackHoleLensRadius = () => getRuntimeVisuals().blackHole.lensRadius;
const getCacheBadgeBaseSize = () => getRuntimeVisuals().caches.badgeBaseSize;
const getShieldColor = () => getRuntimeVisuals().abilities.shieldColor;
const getBoostColor = () => getRuntimeVisuals().abilities.boostColor;
const getForesightColor = () => getRuntimeVisuals().abilities.foresightColor;
const getWildcardColor = () => getRuntimeVisuals().abilities.wildcardColor;
const getDroneColor = () => getRuntimeVisuals().drone.activeColor;
const getDroneReturnColor = () => getRuntimeVisuals().drone.returnColor;
const getWeaponColors = (): Record<RocketKind, { accent: string }> => ({
  heavy: {
    accent: getRuntimeVisuals().rockets.heavy.hudAccent,
  },
  light: {
    accent: getRuntimeVisuals().rockets.light.hudAccent,
  },
  seeker: {
    accent: getRuntimeVisuals().rockets.seeker.hudAccent,
  },
});
const getRocketRenderProfiles = () => getRuntimeVisuals().rockets;
const SCENE_BACKGROUND = new Color("#05070b");
const CACHED_COLORS = new Map<string, Color>();
const TINTED_COLORS = new Map<string, Color>();
const IMPACT_CORE_BASE = new Color("#fff5dd");
const STARFIELD_LAYERS = [
  {
    count: 320,
    alphaScale: 0.24,
    parallax: 0.08,
    size: 3.4,
    z: -30,
  },
  {
    count: 240,
    alphaScale: 0.34,
    parallax: 0.14,
    size: 2.5,
    z: -26,
  },
  {
    count: 180,
    alphaScale: 0.46,
    parallax: 0.22,
    size: 1.8,
    z: -22,
  },
] as const;

interface TrailSample {
  pos: Vec2;
  timeSec: number;
}

interface TrailVisual {
  samples: TrailSample[];
  geometry: BufferGeometry;
  positionAttribute: Float32BufferAttribute;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
}

interface SunVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  warpMesh: Mesh;
  rotationSpeed: number;
}

interface PlanetVisual {
  glowContactStartNode: ReturnType<typeof uniform>;
  glowMesh: Mesh;
  glowFadeStartNode: ReturnType<typeof uniform>;
  glowRiseEndNode: ReturnType<typeof uniform>;
  glowRiseStartNode: ReturnType<typeof uniform>;
  mesh: Mesh;
  rotationSpeed: number;
  spinAxis: Vector3;
  spinPhase: number;
}

interface StarfieldLayerVisual {
  geometry: BufferGeometry;
  group: Group;
  material: PointsNodeMaterial;
  parallax: number;
  tileSize: number;
}

interface RocketPoolVisual {
  mesh: InstancedMesh;
  scale: Vec2;
  activeCount: number;
  trailMesh: InstancedMesh;
  trailActiveCount: number;
  trailCapacity: number;
  trailOffset: number;
  trailScale: Vec2;
  flameMesh: InstancedMesh;
  flameOffset: number;
  flameScale: Vec2;
}

interface RocketLaunchBurstPoolVisual {
  activeCount: number;
  mesh: InstancedMesh;
  scale: Vec2;
}

interface RocketTrailState {
  lastSeenSec: number;
  rocketKind: RocketKind;
  samples: TrailSample[];
}

interface DebrisVisual {
  geometry: BufferGeometry;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  colorAttribute: Float32BufferAttribute;
  opacityAttribute: Float32BufferAttribute;
}

interface ForesightVisual {
  line: Line;
  lineGeometry: BufferGeometry;
  linePositionAttribute: Float32BufferAttribute;
  points: Points;
  pointGeometry: BufferGeometry;
  pointPositionAttribute: Float32BufferAttribute;
  pointOpacityAttribute: Float32BufferAttribute;
}

interface BoostBurstState {
  origin: Vec2;
  direction: Vec2;
  planetId: number;
  radius: number;
  startedAtSec: number;
  tick: number;
}

interface BoostBurstVisual {
  geometry: BufferGeometry;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  opacityAttribute: Float32BufferAttribute;
  wakeMesh: Mesh;
  wakeOpacityNode: ReturnType<typeof uniform>;
}

interface ImpactBurstVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  ringMesh: Mesh;
}

interface PlanetExplosionChunkVisual {
  baseScale: Vector3;
  direction: Vec2;
  driftDistance: number;
  lateralAmplitude: number;
  lift: number;
  mesh: Mesh;
  radialOffset: number;
  rotationPhase: Vector3;
  rotationSpeed: Vector3;
  tangent: Vec2;
}

interface PlanetExplosionVisual {
  chunkMaterials: readonly [MeshBasicMaterial, MeshBasicMaterial];
  chunks: readonly PlanetExplosionChunkVisual[];
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  glowMaterial: MeshBasicMaterial;
  glowMesh: Mesh;
  group: Group;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
  shockwaveMaterial: MeshBasicMaterial;
  shockwaveMesh: Mesh;
}

interface PlanetExplosionState {
  durationSec: number;
  origin: Vec2;
  radius: number;
  scatterScale: number;
  shockwaveScale: number;
  startedAtSec: number;
  velocity: Vec2;
  visual: PlanetExplosionVisual;
}

type CacheIconKey =
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

interface CacheVisual {
  badgeSprite: Sprite;
  bobPhase: number;
  group: Group;
  key: CacheIconKey;
  pulseRate: number;
  wobbleRate: number;
}

interface DroneVisual {
  group: Group;
  glowMesh: Mesh;
  hullMesh: Mesh;
  wingMesh: Mesh;
  noseMesh: Mesh;
  cargoSprite: Sprite;
}

interface KillFeedState {
  accent: string;
  id: number;
  startedAtSec: number;
  text: string;
}

const registerDisposables = (
  disposables: Array<{ dispose: () => void }>,
  ...items: Array<{ dispose: () => void } | Array<{ dispose: () => void }>>
) => {
  for (const item of items) {
    if (Array.isArray(item)) {
      disposables.push(...item);
      continue;
    }

    disposables.push(item);
  }
};

const decayUnitValue = (
  value: number,
  deltaSec: number,
  durationSec: number,
): number =>
  Math.max(0, value - deltaSec / Math.max(durationSec, Number.EPSILON));

const easingAlpha = (rate: number, dtSec: number): number =>
  1 - Math.exp(-rate * dtSec);

const describePlanetDeath = (
  planet: Pick<CombatSandboxPlanet, "deathReason" | "label">,
): string => {
  switch (planet.deathReason) {
    case "boundary":
      return `${planet.label} drifted beyond the arena`;
    case "blackHole":
      return `${planet.label} fell into the Black Hole`;
    case "planetCollision":
      return `${planet.label} broke apart on impact`;
    case "sunCollision":
      return `${planet.label} was consumed by a sun`;
    default:
      return `${planet.label} was destroyed`;
  }
};

const wrapCentered = (value: number, span: number): number => {
  if (!(span > 0)) {
    return value;
  }

  return ((((value + span / 2) % span) + span) % span) - span / 2;
};

const Z_AXIS = new Vector3(0, 0, 1);

const createPlanetSpinAxis = (seed: number): Vector3 => {
  const rng = mulberry32(Math.imul(seed + 1, 0x9e3779b1) >>> 0);
  const azimuth = rng() * Math.PI * 2;
  // Keep the axis away from the poles so the tilt reads clearly on screen.
  const y = -0.72 + rng() * 1.44;
  const radial = Math.sqrt(Math.max(0.001, 1 - y * y));

  return new Vector3(
    Math.cos(azimuth) * radial,
    y,
    Math.sin(azimuth) * radial,
  ).normalize();
};

const getPlanetForestProfile = (
  archetype: string,
  planetId: number,
): { color: string; density: number } => {
  const archetypeProfiles = getRuntimeVisuals().planets.archetypes;
  const profile =
    archetypeProfiles[archetype as keyof typeof archetypeProfiles];
  if (!profile) {
    return { color: "#2c5a2a", density: 0 };
  }
  const jitter = mulberry32(Math.imul(planetId + 1, 0xc2b2ae35) >>> 0)();
  const density = clamp(profile.forestDensity * (0.6 + jitter * 0.7), 0, 1);
  return { color: profile.forestColor, density };
};

const tintColor = (
  value: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): Color => {
  const result = new Color(value);
  result.offsetHSL(hueOffset, saturationOffset, lightnessOffset);
  return result;
};

const getCachedColor = (value: string): Color => {
  let cached = CACHED_COLORS.get(value);
  if (cached === undefined) {
    cached = new Color(value);
    CACHED_COLORS.set(value, cached);
  }

  return cached;
};

const getTintedColor = (
  value: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): Color => {
  const cacheKey = `${value}|${hueOffset}|${saturationOffset}|${lightnessOffset}`;
  let cached = TINTED_COLORS.get(cacheKey);
  if (cached === undefined) {
    cached = tintColor(value, hueOffset, saturationOffset, lightnessOffset);
    TINTED_COLORS.set(cacheKey, cached);
  }

  return cached;
};

const createRocketMaterial = (
  coreColor: string,
  _trailColor: string,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial();
  const shell = tintColor(coreColor, 0, -0.32, -0.44);
  const nose = tintColor(coreColor, 0, -0.18, -0.22);
  const axial = positionLocal.x.mul(0.5).add(0.5);
  const beam = normalize(vec3(-0.28, 0.34, 0.9));
  const worldNormal = normalize(normalWorld);
  const nDotL = max(dot(worldNormal, beam), float(0));
  const lambert = smoothstep(float(0), float(1), nDotL);
  const bodyShade = mix(float(0.28), float(0.78), lambert);

  material.colorNode = mix(
    color(shell),
    color(nose),
    smoothstep(0.1, 0.95, axial),
  ).mul(bodyShade);

  return material;
};

const createRocketTrailMaterial = (
  _coreColor: string,
  trailColor: string,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const trailUv = uv();
  const lateral = abs(trailUv.y.sub(0.5)).mul(2);
  const head = pow(trailUv.x, float(0.6));
  const widthMask = float(1).sub(smoothstep(float(0.5), float(1.0), lateral));
  const mask = widthMask.mul(head);
  material.colorNode = color(trailColor).mul(0.42);
  material.opacityNode = mask.mul(0.52);
  material.alphaTest = 0.01;
  return material;
};

const createRocketFlameMaterial = (
  _coreColor: string,
  _trailColor: string,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  const flameUv = uv();
  const lateral = abs(flameUv.y.sub(0.5)).mul(2);
  const head = pow(flameUv.x, float(0.55));
  const widthMask = float(1).sub(smoothstep(float(0.4), float(1.0), lateral));
  const mask = widthMask.mul(head);
  const coreMask = float(1)
    .sub(smoothstep(float(0.0), float(0.42), lateral))
    .mul(pow(flameUv.x, float(0.8)));
  const outerFire = color("#ff7a26");
  const innerFire = color("#ffe4a0");
  material.colorNode = mix(outerFire, innerFire, coreMask).mul(0.7);
  material.opacityNode = mask.mul(0.9);
  return material;
};

const createRocketLaunchBurstMaterial = (
  _coreColor: string,
  trailColor: string,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const burstUv = uv();
  const lateral = abs(burstUv.y.sub(0.5)).mul(2);
  const head = pow(burstUv.x, float(0.42));
  const widthMask = float(1).sub(smoothstep(float(0.28), float(1.0), lateral));
  const mask = widthMask.mul(head);
  material.colorNode = color(trailColor).mul(0.9);
  material.opacityNode = mask.mul(0.9);
  material.alphaTest = 0.01;
  return material;
};

const getRenderedPlanetRadius = (
  planet: Pick<CombatSandboxPlanet, "radius">,
  planetBodyScale: number,
): number => planet.radius * planetBodyScale;

const getPlanetAuraRingStops = (
  auraScale: number,
  auraGap: number,
): {
  contactStart: number;
  fadeStart: number;
  riseEnd: number;
  riseStart: number;
} => {
  const safeAuraScale = Math.max(auraScale, 0.001);
  const bodyBoundary = clamp(1 / safeAuraScale, 0.08, 0.975);
  const normalizedGap = Math.max(0, auraGap) / safeAuraScale;
  const innerEdge = clamp(bodyBoundary + normalizedGap, bodyBoundary, 0.985);
  const innerFeather = clamp(0.12 / safeAuraScale, 0.02, 0.085);
  const riseStart = clamp(
    innerEdge - innerFeather * 0.9,
    0.001,
    innerEdge - 0.001,
  );
  const contactStart = clamp(
    innerEdge - innerFeather * 1.95,
    0.001,
    riseStart - 0.001,
  );
  const remaining = Math.max(0.025, 1 - innerEdge);
  const riseEnd = innerEdge;
  const fadeStart = clamp(
    innerEdge + remaining * 0.18,
    innerEdge + 0.02,
    0.995,
  );

  return {
    contactStart,
    fadeStart,
    riseEnd,
    riseStart,
  };
};

const getBoostBurstAnchor = (
  burst: BoostBurstState,
  planetsById: ReadonlyMap<number, CombatSandboxPlanet>,
  planetBodyScale: number,
): { origin: Vec2; radius: number } => {
  const boostedPlanet = planetsById.get(burst.planetId) ?? null;
  if (boostedPlanet?.alive) {
    return {
      origin: boostedPlanet.pos,
      radius: getRenderedPlanetRadius(boostedPlanet, planetBodyScale),
    };
  }

  return {
    origin: burst.origin,
    radius: burst.radius * planetBodyScale,
  };
};

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

const getCacheIconKey = (contents: CacheContents): CacheIconKey =>
  contents.kind === "wildcard" ? "wildcard" : contents.kind;

const fillRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fill();
};

const tracePolygon = (
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
) => {
  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index]!.x, points[index]!.y);
  }
  context.closePath();
};

const traceStar = (
  context: CanvasRenderingContext2D,
  outerRadius: number,
  innerRadius: number,
  pointCount: number,
) => {
  context.beginPath();
  for (let index = 0; index < pointCount * 2; index += 1) {
    const angle = -Math.PI / 2 + index * (Math.PI / pointCount);
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
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
  const width = size * 0.58;
  const height = size * 0.64;

  switch (shape) {
    case "hex":
      tracePolygon(context, [
        { x: 0, y: -height },
        { x: width * 0.88, y: -height * 0.46 },
        { x: width * 0.88, y: height * 0.46 },
        { x: 0, y: height },
        { x: -width * 0.88, y: height * 0.46 },
        { x: -width * 0.88, y: -height * 0.46 },
      ]);
      return;

    case "diamond":
      tracePolygon(context, [
        { x: 0, y: -height * 1.04 },
        { x: width, y: 0 },
        { x: 0, y: height * 1.04 },
        { x: -width, y: 0 },
      ]);
      return;

    case "octagon":
      tracePolygon(context, [
        { x: -width * 0.36, y: -height },
        { x: width * 0.36, y: -height },
        { x: width, y: -height * 0.38 },
        { x: width, y: height * 0.38 },
        { x: width * 0.36, y: height },
        { x: -width * 0.36, y: height },
        { x: -width, y: height * 0.38 },
        { x: -width, y: -height * 0.38 },
      ]);
      return;

    case "bolt":
      tracePolygon(context, [
        { x: -width * 0.26, y: -height },
        { x: width * 0.24, y: -height * 0.98 },
        { x: width * 0.02, y: -height * 0.18 },
        { x: width * 0.52, y: -height * 0.18 },
        { x: -width * 0.12, y: height },
        { x: -width * 0.02, y: height * 0.2 },
        { x: -width * 0.58, y: height * 0.2 },
      ]);
      return;

    case "shield":
      tracePolygon(context, [
        { x: 0, y: -height },
        { x: width * 0.86, y: -height * 0.52 },
        { x: width * 0.72, y: height * 0.28 },
        { x: 0, y: height },
        { x: -width * 0.72, y: height * 0.28 },
        { x: -width * 0.86, y: -height * 0.52 },
      ]);
      return;

    case "chevron":
      tracePolygon(context, [
        { x: 0, y: -height },
        { x: width, y: -height * 0.24 },
        { x: width * 0.34, y: 0 },
        { x: width, y: height * 0.24 },
        { x: 0, y: height },
        { x: -width, y: height * 0.24 },
        { x: -width * 0.34, y: 0 },
        { x: -width, y: -height * 0.24 },
      ]);
      return;

    case "star":
      traceStar(context, size * 0.64, size * 0.28, 5);
      return;
  }
};

const drawCacheIconGlyph = (
  context: CanvasRenderingContext2D,
  key: CacheIconKey,
  size: number,
  accent: string,
) => {
  const unit = size / 16;

  context.save();
  context.fillStyle = accent;
  context.strokeStyle = accent;
  context.lineWidth = unit * 1.15;
  context.lineCap = "round";
  context.lineJoin = "round";

  switch (key) {
    case "heavyAmmo":
      fillRoundedRect(
        context,
        -4.2 * unit,
        -1.7 * unit,
        6.4 * unit,
        3.4 * unit,
        unit,
      );
      context.fillRect(2.4 * unit, -0.9 * unit, 2.8 * unit, 1.8 * unit);
      context.fillStyle = "#fff7e9";
      context.fillRect(-2.5 * unit, -0.6 * unit, 1.3 * unit, 1.2 * unit);
      break;

    case "seekerPack":
      context.beginPath();
      context.arc(0, 0, 4.8 * unit, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, 2.4 * unit, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(1.2 * unit, -6 * unit);
      context.lineTo(5.8 * unit, -1.4 * unit);
      context.lineTo(2.1 * unit, -0.4 * unit);
      context.lineTo(4.9 * unit, 4.2 * unit);
      context.lineTo(-1.1 * unit, 1.2 * unit);
      context.lineTo(0.8 * unit, -2.1 * unit);
      context.closePath();
      context.fill();
      break;

    case "repair":
      context.beginPath();
      context.arc(0, 0, 5.5 * unit, 0, Math.PI * 2);
      context.stroke();
      context.fillRect(-1.2 * unit, -4 * unit, 2.4 * unit, 8 * unit);
      context.fillRect(-4 * unit, -1.2 * unit, 8 * unit, 2.4 * unit);
      break;

    case "boostCharge":
      context.beginPath();
      context.moveTo(-1.2 * unit, -6.2 * unit);
      context.lineTo(3.6 * unit, -1.3 * unit);
      context.lineTo(0.6 * unit, -1.3 * unit);
      context.lineTo(2.1 * unit, 6.1 * unit);
      context.lineTo(-3.8 * unit, 0.9 * unit);
      context.lineTo(-0.7 * unit, 0.9 * unit);
      context.closePath();
      context.fill();
      break;

    case "shieldExt":
      context.beginPath();
      context.moveTo(0, -6.2 * unit);
      context.lineTo(4.8 * unit, -4.1 * unit);
      context.lineTo(4.4 * unit, 1.6 * unit);
      context.lineTo(0, 6.3 * unit);
      context.lineTo(-4.4 * unit, 1.6 * unit);
      context.lineTo(-4.8 * unit, -4.1 * unit);
      context.closePath();
      context.stroke();
      context.beginPath();
      context.arc(0, 0, 3.2 * unit, Math.PI * 0.85, Math.PI * 2.15);
      context.stroke();
      break;

    case "foresightExt":
      context.beginPath();
      context.ellipse(0, 0, 6.6 * unit, 4.1 * unit, 0, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, 2.2 * unit, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#081018";
      context.beginPath();
      context.arc(0, 0, 0.9 * unit, 0, Math.PI * 2);
      context.fill();
      break;

    case "wildcard":
      traceStar(context, 5.8 * unit, 2.4 * unit, 5);
      context.stroke();
      context.fillStyle = "#fff3d8";
      context.font = `${6.2 * unit}px "IBM Plex Sans", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("?", 0, 0.6 * unit);
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
  drawCacheIconGlyph(context, key, size, accent);
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

const createCacheSpriteMaterials = (document: Document) =>
  CACHE_ICON_KEYS.reduce(
    (materials, key) => {
      const map = createCacheIconTexture(document, key);
      map.colorSpace = SRGBColorSpace;
      map.generateMipmaps = false;
      map.needsUpdate = true;

      materials[key] = {
        map,
        material: new SpriteMaterial({
          color: "#ffffff",
          depthWrite: false,
          map,
          transparent: true,
        }),
      };
      return materials;
    },
    {} as Record<
      CacheIconKey,
      {
        map: CanvasTexture;
        material: SpriteMaterial;
      }
    >,
  );

const createCacheBadgeSpriteMaterial = (
  document: Document,
  key: CacheIconKey,
): {
  map: CanvasTexture;
  material: SpriteMaterial;
} => {
  const map = createCacheBadgeTexture(document, key);
  map.colorSpace = SRGBColorSpace;
  map.generateMipmaps = false;
  map.needsUpdate = true;

  return {
    map,
    material: new SpriteMaterial({
      alphaTest: 0.02,
      color: "#ffffff",
      depthWrite: false,
      map,
      transparent: true,
    }),
  };
};

const createForesightVisual = (): ForesightVisual => {
  const lineGeometry = new BufferGeometry();
  const linePositions = new Float32Array(MAX_FORESIGHT_SAMPLES * 3);
  const linePositionAttribute = new Float32BufferAttribute(linePositions, 3);
  linePositionAttribute.setUsage(DynamicDrawUsage);
  lineGeometry.setAttribute("position", linePositionAttribute);
  lineGeometry.setDrawRange(0, 0);

  const lineMaterial = new LineBasicMaterial({
    color: "#81d7ff",
    depthWrite: false,
    opacity: 0.76,
    transparent: true,
  });
  const line = new Line(lineGeometry, lineMaterial);
  line.frustumCulled = false;
  line.renderOrder = 11;
  line.position.z = 4.1;
  line.visible = false;

  const pointGeometry = new BufferGeometry();
  const pointPositions = new Float32Array(MAX_FORESIGHT_SAMPLES * 3);
  const pointOpacity = new Float32Array(MAX_FORESIGHT_SAMPLES);
  const pointPositionAttribute = new Float32BufferAttribute(pointPositions, 3);
  const pointOpacityAttribute = new Float32BufferAttribute(pointOpacity, 1);
  pointPositionAttribute.setUsage(DynamicDrawUsage);
  pointOpacityAttribute.setUsage(DynamicDrawUsage);
  pointGeometry.setAttribute("position", pointPositionAttribute);
  pointGeometry.setAttribute("foresightOpacity", pointOpacityAttribute);
  pointGeometry.setDrawRange(0, 0);

  const pointMaterial = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  pointMaterial.colorNode = color("#80d7ff");
  pointMaterial.opacityNode = attribute("foresightOpacity", "float").mul(
    float(1).sub(smoothstep(0.14, 0.48, length(pointUV.sub(vec2(0.5, 0.5))))),
  );
  pointMaterial.size = FORESIGHT_POINT_SIZE;
  pointMaterial.alphaTest = 0.01;

  const points = new Points(pointGeometry, pointMaterial);
  points.frustumCulled = false;
  points.renderOrder = 12;
  points.position.z = 4.2;
  points.visible = false;

  return {
    line,
    lineGeometry,
    linePositionAttribute,
    points,
    pointGeometry,
    pointPositionAttribute,
    pointOpacityAttribute,
  };
};

const updateForesightVisual = (
  foresightVisual: ForesightVisual,
  pathPoints: readonly Vec2[],
) => {
  const lineArray = foresightVisual.linePositionAttribute.array as Float32Array;
  const pointArray = foresightVisual.pointPositionAttribute
    .array as Float32Array;
  const opacityArray = foresightVisual.pointOpacityAttribute
    .array as Float32Array;
  const pointCount = Math.min(pathPoints.length, MAX_FORESIGHT_SAMPLES);
  const solidCount =
    pointCount > 1
      ? Math.max(2, Math.ceil(pointCount * FORESIGHT_SOLID_FRACTION))
      : 0;
  let visiblePointCount = 0;

  for (let index = 0; index < pointCount; index += 1) {
    const point = pathPoints[index]!;
    const offset = index * 3;
    const progress = pointCount <= 1 ? 0 : index / (pointCount - 1);
    const fade = clamp(1 - progress / FORESIGHT_FADE_FRACTION, 0, 1);
    const step =
      progress < FORESIGHT_SOLID_FRACTION ? 1 : progress < 0.68 ? 3 : 5;
    const visible =
      progress < FORESIGHT_FADE_FRACTION &&
      (progress < FORESIGHT_SOLID_FRACTION || index % step === 0);

    lineArray[offset] = point.x;
    lineArray[offset + 1] = point.y;
    lineArray[offset + 2] = 0;
    pointArray[offset] = point.x;
    pointArray[offset + 1] = point.y;
    pointArray[offset + 2] = 0;
    const opacity = visible
      ? fade * (progress < FORESIGHT_SOLID_FRACTION ? 0.26 : 0.82)
      : 0;
    opacityArray[index] = opacity;

    if (opacity > 0.01) {
      visiblePointCount += 1;
    }
  }

  foresightVisual.lineGeometry.setDrawRange(0, solidCount);
  foresightVisual.pointGeometry.setDrawRange(0, pointCount);
  foresightVisual.linePositionAttribute.needsUpdate = true;
  foresightVisual.pointPositionAttribute.needsUpdate = true;
  foresightVisual.pointOpacityAttribute.needsUpdate = true;
  foresightVisual.line.visible = solidCount > 1;
  foresightVisual.points.visible = pointCount > 0 && visiblePointCount > 0;
};

const updateBoostBurstVisual = (
  boostVisual: BoostBurstVisual,
  bursts: readonly BoostBurstState[],
  planetsById: ReadonlyMap<number, CombatSandboxPlanet>,
  nowSec: number,
  planetBodyScale: number,
) => {
  const positionArray = boostVisual.positionAttribute.array as Float32Array;
  const opacityArray = boostVisual.opacityAttribute.array as Float32Array;
  let drawCount = 0;
  let brightestBurst: BoostBurstState | null = null;
  let brightestAlpha = 0;
  let brightestOrigin: Vec2 | null = null;
  let brightestProgress = 0;
  let brightestRadius = 0;

  for (const burst of bursts) {
    const ageSec = nowSec - burst.startedAtSec;
    if (ageSec < 0 || ageSec > BOOST_BURST_DURATION_SEC) {
      continue;
    }

    const burstAlpha = clamp(1 - ageSec / BOOST_BURST_DURATION_SEC, 0, 1);
    const burstProgress = clamp(ageSec / BOOST_BURST_DURATION_SEC, 0, 1);
    const { origin, radius } = getBoostBurstAnchor(
      burst,
      planetsById,
      planetBodyScale,
    );
    if (burstAlpha > brightestAlpha) {
      brightestAlpha = burstAlpha;
      brightestBurst = burst;
      brightestOrigin = origin;
      brightestProgress = burstProgress;
      brightestRadius = radius;
    }

    const exhaustDir = scaleVec2(burst.direction, -1);
    const particleOrigin = add(origin, scaleVec2(exhaustDir, radius * 0.38));

    for (
      let index = 0;
      index < BOOST_BURST_PARTICLES && drawCount < MAX_BOOST_BURST_SAMPLES;
      index += 1
    ) {
      const progress = index / Math.max(1, BOOST_BURST_PARTICLES - 1);
      const spreadAngle =
        ((index % 7) - 3) * 0.11 +
        Math.sin(burst.tick * 0.29 + index * 1.13) * 0.08;
      const particleDir = normalizeVec2(rot(exhaustDir, spreadAngle));
      const travel =
        radius * (0.68 + progress * 1.1) + ageSec * (210 + (index % 5) * 44);
      const forwardDrift = ageSec * 30 * (1 - progress * 0.6);
      const particlePos = add(
        particleOrigin,
        add(
          scaleVec2(particleDir, travel),
          scaleVec2(burst.direction, forwardDrift),
        ),
      );
      const offset = drawCount * 3;

      positionArray[offset] = particlePos.x;
      positionArray[offset + 1] = particlePos.y;
      positionArray[offset + 2] = 0;
      opacityArray[drawCount] = burstAlpha * (1.02 - progress * 0.46);
      drawCount += 1;
    }
  }

  boostVisual.geometry.setDrawRange(0, drawCount);
  boostVisual.positionAttribute.needsUpdate = true;
  boostVisual.opacityAttribute.needsUpdate = true;
  boostVisual.points.visible = drawCount > 0;

  const hasBurst = brightestBurst !== null && brightestOrigin !== null;
  boostVisual.wakeMesh.visible = hasBurst;

  if (hasBurst && brightestBurst !== null && brightestOrigin !== null) {
    const exhaustDir = scaleVec2(brightestBurst.direction, -1);
    const wakeLength = brightestRadius * lerp(2.3, 4.9, brightestProgress);
    const wakeWidth = brightestRadius * lerp(1.5, 0.82, brightestProgress);
    const wakeOffset = brightestRadius * lerp(0.46, 0.72, brightestProgress);
    boostVisual.wakeMesh.position.set(
      brightestOrigin.x + exhaustDir.x * wakeOffset,
      brightestOrigin.y + exhaustDir.y * wakeOffset,
      2.26,
    );
    boostVisual.wakeMesh.scale.set(wakeLength, wakeWidth, 1);
    boostVisual.wakeMesh.rotation.z = Math.atan2(exhaustDir.y, exhaustDir.x);
    boostVisual.wakeOpacityNode.value =
      brightestAlpha * lerp(1, 0.44, brightestProgress);
  } else {
    boostVisual.wakeOpacityNode.value = 0;
  }
};

const hideImpactBurstVisual = (visual: ImpactBurstVisual) => {
  visual.coreMesh.visible = false;
  visual.glowMesh.visible = false;
  visual.ringMesh.visible = false;
};

const updateImpactBurstVisuals = (
  visuals: readonly ImpactBurstVisual[],
  bursts: readonly CombatSandboxImpactBurst[],
  planetsById: ReadonlyMap<number, CombatSandboxPlanet>,
  elapsedSec: number,
  planetBodyScale: number,
) => {
  let visibleCount = 0;
  const firstBurstIndex = Math.max(0, bursts.length - visuals.length);

  for (
    let burstIndex = firstBurstIndex;
    burstIndex < bursts.length && visibleCount < visuals.length;
    burstIndex += 1
  ) {
    const burst = bursts[burstIndex]!;
    const planet = planetsById.get(burst.planetId) ?? null;
    if (planet === null) {
      continue;
    }

    const durationSec = Math.max(
      FIXED_STEP_SEC,
      (burst.ttlUntilTick - burst.startedAtTick) * FIXED_STEP_SEC,
    );
    const ageSec = elapsedSec - burst.startedAtSec;
    if (ageSec < 0 || ageSec > durationSec) {
      continue;
    }

    const visual = visuals[visibleCount]!;
    const progress = clamp(ageSec / durationSec, 0, 1);
    const fade = (1 - progress) ** 1.6;
    const flashAlpha = fade * (0.72 + (1 - progress) * 0.18);
    const glowAlpha = fade * (0.28 + (1 - progress) * 0.16);
    const ringAlpha = fade * 0.44;
    const renderRadius = getRenderedPlanetRadius(planet, planetBodyScale);
    const normal =
      len(burst.normal) > 0.001
        ? burst.normal
        : ({ x: 1, y: 0 } satisfies Vec2);
    const radialDrift = renderRadius * (0.94 + progress * 0.08);
    const impactPos = add(planet.pos, scaleVec2(normal, radialDrift));
    const glowMaterial = visual.glowMesh.material as MeshBasicMaterial;
    const coreMaterial = visual.coreMesh.material as MeshBasicMaterial;
    const ringMaterial = visual.ringMesh.material as MeshBasicMaterial;
    const glowTint = getTintedColor(burst.color, -0.02, 0.12, 0.14);
    const ringTint = getTintedColor(burst.color, -0.01, 0.18, 0.28);

    visual.glowMesh.visible = glowAlpha > 0.01;
    visual.coreMesh.visible = flashAlpha > 0.01;
    visual.ringMesh.visible = ringAlpha > 0.01;

    visual.glowMesh.position.set(impactPos.x, impactPos.y, 2.55);
    visual.coreMesh.position.set(impactPos.x, impactPos.y, 2.65);
    visual.ringMesh.position.set(impactPos.x, impactPos.y, 2.75);

    const glowScale = renderRadius * (0.3 + progress * 0.34);
    const coreScale = renderRadius * (0.12 + (1 - progress) * 0.12);
    const ringScale = renderRadius * (0.16 + progress * 0.42);
    visual.glowMesh.scale.set(glowScale, glowScale, 1);
    visual.coreMesh.scale.set(coreScale, coreScale, 1);
    visual.ringMesh.scale.set(ringScale, ringScale, 1);

    glowMaterial.color.copy(glowTint);
    glowMaterial.opacity = glowAlpha;
    coreMaterial.color
      .copy(IMPACT_CORE_BASE)
      .lerp(getCachedColor(burst.color), 0.28);
    coreMaterial.opacity = flashAlpha;
    ringMaterial.color.copy(ringTint);
    ringMaterial.opacity = ringAlpha;

    visibleCount += 1;
  }

  for (let index = visibleCount; index < visuals.length; index += 1) {
    hideImpactBurstVisual(visuals[index]!);
  }
};

const resetTrail = (trail: TrailVisual) => {
  trail.samples.length = 0;
  trail.geometry.setDrawRange(0, 0);
  trail.positionAttribute.needsUpdate = true;
  trail.opacityAttribute.needsUpdate = true;
};

const pruneRocketTrailState = (trail: RocketTrailState, nowSec: number) => {
  while (
    trail.samples.length > 0 &&
    nowSec - trail.samples[0]!.timeSec > ROCKET_TRAIL_DURATION_SEC
  ) {
    trail.samples.shift();
  }

  while (trail.samples.length > MAX_ROCKET_TRAIL_SAMPLES) {
    trail.samples.shift();
  }
};

const appendRocketTrailSample = (
  trail: RocketTrailState,
  pos: Vec2,
  timeSec: number,
) => {
  trail.lastSeenSec = timeSec;
  const lastSample = trail.samples[trail.samples.length - 1];

  if (
    lastSample !== undefined &&
    len(sub(pos, lastSample.pos)) < ROCKET_TRAIL_SAMPLE_DISTANCE
  ) {
    lastSample.pos.x = pos.x;
    lastSample.pos.y = pos.y;
    lastSample.timeSec = timeSec;
    pruneRocketTrailState(trail, timeSec);
    return;
  }

  trail.samples.push({
    pos: { x: pos.x, y: pos.y },
    timeSec,
  });
  pruneRocketTrailState(trail, timeSec);
};

const appendRocketTrailInstances = (
  mesh: InstancedMesh,
  trail: RocketTrailState,
  trailScale: Vec2,
  startIndex: number,
  maxInstances: number,
  matrix: Matrix4,
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
): number => {
  const segmentCount = trail.samples.length - 1;

  if (segmentCount <= 0 || startIndex >= maxInstances) {
    return startIndex;
  }

  for (
    let sampleIndex = 1;
    sampleIndex < trail.samples.length && startIndex < maxInstances;
    sampleIndex += 1
  ) {
    const previousSample = trail.samples[sampleIndex - 1]!;
    const nextSample = trail.samples[sampleIndex]!;
    const delta = sub(nextSample.pos, previousSample.pos);
    const segmentLength = len(delta);

    if (segmentLength < 0.001) {
      continue;
    }

    const headAlpha = sampleIndex / segmentCount;
    position.set(
      (previousSample.pos.x + nextSample.pos.x) * 0.5,
      (previousSample.pos.y + nextSample.pos.y) * 0.5,
      2.75,
    );
    rotation.setFromAxisAngle(Z_AXIS, Math.atan2(delta.y, delta.x));
    scale.set(
      Math.max(
        segmentLength + trailScale.y * 1.2,
        trailScale.x * lerp(0.26, 0.54, headAlpha),
      ),
      trailScale.y * lerp(0.24, 0.92, headAlpha),
      1,
    );
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(startIndex, matrix);
    startIndex += 1;
  }

  return startIndex;
};

const pruneRocketTrailStates = (
  trailsById: Map<number, RocketTrailState>,
  nowSec: number,
) => {
  for (const [rocketId, trail] of trailsById) {
    pruneRocketTrailState(trail, nowSec);

    if (
      trail.samples.length < 2 &&
      nowSec - trail.lastSeenSec > ROCKET_TRAIL_DURATION_SEC
    ) {
      trailsById.delete(rocketId);
    }
  }
};

const createPlanetMaterial = (
  planetColor: string,
  seed: number,
  forestDensity = 0,
  forestColorHex = "#2f5a2a",
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial();

  const base = new Color(planetColor);
  const lowland = tintColor(planetColor, 0.02, 0.06, -0.08);
  const highland = tintColor(planetColor, -0.03, -0.2, 0.14);
  const rock = tintColor(planetColor, 0.0, -0.5, -0.04);
  const snow = tintColor(planetColor, 0.0, -0.7, 0.24);
  const oceanDeep = tintColor(planetColor, 0.55, 0.25, -0.22);
  const oceanShallow = tintColor(planetColor, 0.5, 0.2, -0.06);
  const forestDark = new Color(forestColorHex);
  const forestLight = tintColor(forestColorHex, 0.0, 0.08, 0.08);

  const seedNode = uniform(seed);
  const dir = normalize(positionLocal);
  const seedOffset = vec3(
    seedNode.mul(3.7),
    seedNode.mul(1.9),
    seedNode.mul(5.3),
  );

  const continents = mx_fractal_noise_float(
    dir.mul(1.35).add(seedOffset),
    4,
    2,
    0.55,
    1,
  )
    .mul(0.5)
    .add(0.5);

  const mountains = mx_fractal_noise_float(
    dir
      .mul(6.4)
      .add(vec3(seedNode.mul(7.1), seedNode.mul(2.4), seedNode.mul(9.7))),
    6,
    2.15,
    0.52,
    1,
  )
    .mul(0.5)
    .add(0.5);

  const detail = mx_cell_noise_float(
    dir
      .mul(12.5)
      .add(vec3(seedNode.mul(4.2), seedNode.mul(6.1), seedNode.mul(2.7))),
  )
    .mul(0.5)
    .add(0.5);

  const landMask = smoothstep(0.42, 0.56, continents);
  const height = mix(
    continents.mul(0.44),
    continents.mul(0.52).add(mountains.mul(0.55)),
    landMask,
  );

  const aboveSea = max(height.sub(0.5), float(0));
  const displacement = aboveSea.mul(0.36);
  material.positionNode = positionLocal.add(dir.mul(displacement));

  const landElevation = smoothstep(0.5, 1.0, height);

  const oceanDepthMask = smoothstep(0.48, 0.3, height);
  const oceanCol = mix(color(oceanShallow), color(oceanDeep), oceanDepthMask);

  const forestTint = mix(color(lowland), color(base), detail);
  const lowToHigh = mix(
    forestTint,
    color(highland),
    smoothstep(0.05, 0.42, landElevation),
  );
  const highToRock = mix(
    lowToHigh,
    color(rock),
    smoothstep(0.42, 0.72, landElevation),
  );
  const snowCapped = mix(
    highToRock,
    color(snow),
    smoothstep(0.78, 0.96, landElevation),
  );

  const forestClumps = mx_cell_noise_float(
    dir
      .mul(22)
      .add(vec3(seedNode.mul(8.3), seedNode.mul(3.6), seedNode.mul(5.9))),
  )
    .mul(0.5)
    .add(0.5);
  const forestSpeckle = mx_cell_noise_float(
    dir
      .mul(64)
      .add(vec3(seedNode.mul(2.1), seedNode.mul(9.4), seedNode.mul(4.8))),
  )
    .mul(0.5)
    .add(0.5);
  const forestElevationMask = smoothstep(0.02, 0.18, landElevation).mul(
    smoothstep(0.62, 0.3, landElevation),
  );
  const forestBody = smoothstep(0.42, 0.78, forestClumps);
  const forestTexture = mix(
    color(forestDark),
    color(forestLight),
    forestSpeckle,
  );
  const forestStrength = forestElevationMask
    .mul(forestBody)
    .mul(float(forestDensity));
  const landCol = mix(snowCapped, forestTexture, forestStrength);

  const coastBlend = smoothstep(0.48, 0.52, height);
  const surfaceBase = mix(oceanCol, landCol, coastBlend);

  const latitude = abs(dir.y);
  const polarMask = smoothstep(0.78, 0.94, latitude.add(mountains.mul(0.08)));
  const surfaceColor = mix(surfaceBase, color(snow), polarMask);

  const lightDir = normalize(vec3(-0.35, 0.55, 0.9));
  const worldNormal = normalize(normalWorld);
  const nDotL = max(dot(worldNormal, lightDir), float(0));
  const lambert = smoothstep(float(0), float(1), nDotL);
  const shading = mix(float(0.38), float(1.0), lambert);
  const heightAO = mix(float(0.94), float(1.03), landElevation);

  const viewFacing = max(dot(worldNormal, vec3(0, 0, 1)), float(0));
  const rim = pow(float(1).sub(viewFacing), 3.2).mul(0.08);
  const rimTint = mix(color(base), color(rock), float(0.6));

  material.colorNode = surfaceColor
    .mul(shading)
    .mul(heightAO)
    .add(rimTint.mul(rim));

  return material;
};

const createPlanetGlowMaterial = (
  planetColor: string,
  seed: number,
): {
  contactStartNode: ReturnType<typeof uniform>;
  fadeStartNode: ReturnType<typeof uniform>;
  material: MeshBasicNodeMaterial;
  riseEndNode: ReturnType<typeof uniform>;
  riseStartNode: ReturnType<typeof uniform>;
} => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const outerGlow = tintColor(planetColor, -0.04, 0.04, 0.2);
  const innerGlow = tintColor(planetColor, -0.08, 0.1, 0.28);
  const seedNode = uniform(seed);
  const planetVisuals = getRuntimeVisuals().planets;
  const initialRingStops = getPlanetAuraRingStops(
    planetVisuals.auraScale,
    planetVisuals.auraGap,
  );
  const contactStartNode = uniform(initialRingStops.contactStart);
  const riseStartNode = uniform(initialRingStops.riseStart);
  const riseEndNode = uniform(initialRingStops.riseEnd);
  const fadeStartNode = uniform(initialRingStops.fadeStart);
  const radial = length(positionLocal.xy);
  const pulse = sin(timerLocal(0.18).add(seedNode.mul(1.9)))
    .mul(0.06)
    .add(0.94);
  const haloInnerFade = smoothstep(contactStartNode, riseEndNode, radial);
  const haloEnvelope = pow(
    float(1).sub(smoothstep(riseEndNode, 1, radial)),
    float(1.85),
  );
  const haloTail = float(1)
    .sub(smoothstep(fadeStartNode, 1, radial))
    .mul(0.72)
    .add(0.28);
  const haloMask = haloInnerFade.mul(haloEnvelope).mul(haloTail);
  const haloBlend = smoothstep(riseEndNode, 1, radial);

  material.fragmentNode = vec4(
    mix(color(innerGlow), color(outerGlow), haloBlend)
      .mul(haloMask)
      .mul(pulse)
      .mul(0.56),
    haloMask.mul(0.16).mul(pulse),
  );

  return {
    contactStartNode,
    fadeStartNode,
    material,
    riseEndNode,
    riseStartNode,
  };
};

const isPlanetExplosionDeath = (
  deathReason: CombatPlanetDeathReason | undefined,
): boolean =>
  deathReason === "rocket" ||
  deathReason === "planetCollision" ||
  deathReason === "sunCollision";

const hidePlanetExplosionVisual = (visual: PlanetExplosionVisual) => {
  visual.group.visible = false;
  visual.glowMesh.visible = false;
  visual.coreMesh.visible = false;
  visual.ringMesh.visible = false;
  visual.shockwaveMesh.visible = false;
  visual.glowMaterial.opacity = 0;
  visual.coreMaterial.opacity = 0;
  visual.ringMaterial.opacity = 0;
  visual.shockwaveMaterial.opacity = 0;
  for (const material of visual.chunkMaterials) {
    material.opacity = 0;
  }
  for (const chunk of visual.chunks) {
    chunk.mesh.visible = false;
  }
};

const createPlanetExplosionVisual = (
  scene: Scene,
  flashGeometry: CircleGeometry,
  ringGeometry: RingGeometry,
  fragmentGeometries: readonly BufferGeometry[],
): PlanetExplosionVisual => {
  const group = new Group();
  const glowMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: "#ffffff",
    depthWrite: false,
    opacity: 0,
    transparent: true,
  });
  const coreMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: "#ffffff",
    depthWrite: false,
    opacity: 0,
    transparent: true,
  });
  const ringMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: "#ffffff",
    depthWrite: false,
    opacity: 0,
    transparent: true,
  });
  const shockwaveMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: "#ffffff",
    depthWrite: false,
    opacity: 0,
    transparent: true,
  });
  const chunkMaterials = [
    new MeshBasicMaterial({
      color: "#ffffff",
      depthWrite: false,
      opacity: 0,
      transparent: true,
    }),
    new MeshBasicMaterial({
      color: "#ffffff",
      depthWrite: false,
      opacity: 0,
      transparent: true,
    }),
  ] as const satisfies readonly [MeshBasicMaterial, MeshBasicMaterial];
  const glowMesh = new Mesh(flashGeometry, glowMaterial);
  const coreMesh = new Mesh(flashGeometry, coreMaterial);
  const ringMesh = new Mesh(ringGeometry, ringMaterial);
  const shockwaveMesh = new Mesh(ringGeometry, shockwaveMaterial);

  glowMesh.position.z = 2.82;
  coreMesh.position.z = 2.96;
  ringMesh.position.z = 3.08;
  shockwaveMesh.position.z = 3.22;
  glowMesh.renderOrder = 14.2;
  coreMesh.renderOrder = 14.4;
  ringMesh.renderOrder = 14.6;
  shockwaveMesh.renderOrder = 14.8;
  group.add(glowMesh, coreMesh, ringMesh, shockwaveMesh);

  const chunks = Array.from(
    { length: PLANET_EXPLOSION_CHUNK_COUNT },
    (_, index) => {
      const mesh = new Mesh(
        fragmentGeometries[index % fragmentGeometries.length]!,
        chunkMaterials[index % chunkMaterials.length]!,
      );
      mesh.visible = false;
      mesh.renderOrder = 14.9 + index * 0.01;
      group.add(mesh);

      return {
        baseScale: new Vector3(1, 1, 1),
        direction: { x: 1, y: 0 },
        driftDistance: 0,
        lateralAmplitude: 0,
        lift: 0,
        mesh,
        radialOffset: 0,
        rotationPhase: new Vector3(),
        rotationSpeed: new Vector3(),
        tangent: { x: 0, y: 1 },
      } satisfies PlanetExplosionChunkVisual;
    },
  );

  scene.add(group);
  const visual = {
    chunkMaterials,
    chunks,
    coreMaterial,
    coreMesh,
    glowMaterial,
    glowMesh,
    group,
    ringMaterial,
    ringMesh,
    shockwaveMaterial,
    shockwaveMesh,
  } satisfies PlanetExplosionVisual;
  hidePlanetExplosionVisual(visual);
  return visual;
};

const armPlanetExplosion = (
  visual: PlanetExplosionVisual,
  planet: Pick<
    CombatSandboxPlanet,
    "color" | "deathReason" | "id" | "pos" | "radius" | "vel"
  >,
  startedAtSec: number,
  planetBodyScale: number,
): PlanetExplosionState => {
  const rng = mulberry32(
    (Math.imul(planet.id + 1, 0x9e3779b1) ^ Math.round(startedAtSec * 1000)) >>>
      0,
  );
  const renderRadius = getRenderedPlanetRadius(planet, planetBodyScale);
  const durationSec =
    planet.deathReason === "planetCollision"
      ? PLANET_EXPLOSION_DURATION_SEC + 0.22
      : planet.deathReason === "sunCollision"
        ? PLANET_EXPLOSION_DURATION_SEC + 0.12
        : PLANET_EXPLOSION_DURATION_SEC;
  const scatterScale =
    planet.deathReason === "planetCollision"
      ? 1.62
      : planet.deathReason === "sunCollision"
        ? 1.48
        : 1.34;
  const shockwaveScale =
    planet.deathReason === "planetCollision"
      ? 6.8
      : planet.deathReason === "sunCollision"
        ? 6.2
        : 5.6;
  visual.glowMaterial.color.copy(tintColor(planet.color, -0.04, 0.12, 0.22));
  visual.ringMaterial.color.copy(tintColor(planet.color, 0.02, 0.16, 0.28));
  visual.shockwaveMaterial.color.copy(
    tintColor(planet.color, -0.08, 0.06, 0.38),
  );
  visual.coreMaterial.color.copy(
    new Color("#fff7de").lerp(new Color(planet.color), 0.24),
  );
  visual.chunkMaterials[0].color.copy(
    tintColor(planet.color, -0.02, -0.26, -0.14),
  );
  visual.chunkMaterials[1].color.copy(
    tintColor(planet.color, 0.01, -0.08, 0.02),
  );
  visual.group.position.set(planet.pos.x, planet.pos.y, 0);
  visual.group.visible = true;
  for (const material of visual.chunkMaterials) {
    material.opacity = 0;
  }
  for (const chunk of visual.chunks) {
    const angle = rng() * Math.PI * 2;
    chunk.direction.x = Math.cos(angle);
    chunk.direction.y = Math.sin(angle);
    chunk.tangent.x = -chunk.direction.y;
    chunk.tangent.y = chunk.direction.x;
    chunk.driftDistance = 0.78 + rng() * 1.18;
    chunk.lateralAmplitude = 0.08 + rng() * 0.22;
    chunk.lift = 0.18 + rng() * 0.82;
    chunk.radialOffset = 0.18 + rng() * 0.24;
    chunk.baseScale.set(
      renderRadius * (0.13 + rng() * 0.12),
      renderRadius * (0.11 + rng() * 0.16),
      renderRadius * (0.1 + rng() * 0.18),
    );
    chunk.rotationPhase.set(
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
    );
    chunk.rotationSpeed.set(
      (rng() - 0.5) * 9,
      (rng() - 0.5) * 9,
      (rng() - 0.5) * 9,
    );
    chunk.mesh.visible = false;
    chunk.mesh.scale.copy(chunk.baseScale);
    chunk.mesh.position.set(
      chunk.direction.x * renderRadius * 0.28,
      chunk.direction.y * renderRadius * 0.28,
      0.14,
    );
    chunk.mesh.rotation.set(
      chunk.rotationPhase.x,
      chunk.rotationPhase.y,
      chunk.rotationPhase.z,
    );
  }

  return {
    durationSec,
    origin: { x: planet.pos.x, y: planet.pos.y },
    radius: renderRadius,
    scatterScale,
    shockwaveScale,
    startedAtSec,
    velocity: { x: planet.vel.x, y: planet.vel.y },
    visual,
  };
};

const updatePlanetExplosion = (
  explosion: PlanetExplosionState,
  elapsedSec: number,
): boolean => {
  const ageSec = elapsedSec - explosion.startedAtSec;
  if (ageSec < 0) {
    explosion.visual.group.visible = false;
    return true;
  }

  if (ageSec > explosion.durationSec) {
    return false;
  }

  const progress = clamp(ageSec / explosion.durationSec, 0, 1);
  const flashProgress = clamp(
    ageSec / PLANET_EXPLOSION_FLASH_DURATION_SEC,
    0,
    1,
  );
  const ringProgress = clamp(ageSec / PLANET_EXPLOSION_RING_DURATION_SEC, 0, 1);
  const fade = (1 - progress) ** 1.28;
  const burst = progress ** 0.74;
  const driftX = explosion.velocity.x * ageSec * 0.42;
  const driftY = explosion.velocity.y * ageSec * 0.42;
  const radius = explosion.radius;
  const glowAlpha = fade * (0.34 + (1 - progress) * 0.42);
  const coreAlpha = (1 - flashProgress) ** 2.45 * 0.98;
  const ringAlpha = (1 - ringProgress) ** 1.72 * 0.44;
  const shockwaveAlpha = (1 - ringProgress) ** 2.1 * 0.3;

  explosion.visual.group.visible = true;
  explosion.visual.group.position.set(
    explosion.origin.x + driftX,
    explosion.origin.y + driftY,
    0,
  );

  explosion.visual.glowMesh.visible = glowAlpha > 0.01;
  explosion.visual.coreMesh.visible = coreAlpha > 0.01;
  explosion.visual.ringMesh.visible = ringAlpha > 0.01;
  explosion.visual.shockwaveMesh.visible = shockwaveAlpha > 0.01;

  explosion.visual.glowMesh.scale.set(
    radius * (1.08 + progress * 3.2),
    radius * (1.08 + progress * 3.2),
    1,
  );
  explosion.visual.coreMesh.scale.set(
    radius * (0.74 + flashProgress * 2.15),
    radius * (0.74 + flashProgress * 2.15),
    1,
  );
  explosion.visual.ringMesh.scale.set(
    radius * (0.92 + ringProgress * 4.3),
    radius * (0.92 + ringProgress * 4.3),
    1,
  );
  explosion.visual.shockwaveMesh.scale.set(
    radius * (1.14 + ringProgress * explosion.shockwaveScale),
    radius * (1.14 + ringProgress * explosion.shockwaveScale),
    1,
  );

  explosion.visual.glowMaterial.opacity = glowAlpha;
  explosion.visual.coreMaterial.opacity = coreAlpha;
  explosion.visual.ringMaterial.opacity = ringAlpha;
  explosion.visual.shockwaveMaterial.opacity = shockwaveAlpha;

  const chunkOpacity = clamp(fade * 1.18, 0, 1);
  for (const material of explosion.visual.chunkMaterials) {
    material.opacity = chunkOpacity;
  }
  for (const chunk of explosion.visual.chunks) {
    const radialDistance =
      radius *
      (chunk.radialOffset +
        chunk.driftDistance * explosion.scatterScale * burst);
    const lateralDistance =
      radius *
      chunk.lateralAmplitude *
      Math.sin(
        progress * Math.PI * (1.1 + chunk.lift * 0.24) + chunk.rotationPhase.z,
      ) *
      (0.22 + fade * 0.78);

    chunk.mesh.visible = chunkOpacity > 0.02;
    chunk.mesh.position.set(
      chunk.direction.x * radialDistance + chunk.tangent.x * lateralDistance,
      chunk.direction.y * radialDistance + chunk.tangent.y * lateralDistance,
      0.16 + chunk.lift * radius * burst * 0.045,
    );
    chunk.mesh.rotation.set(
      chunk.rotationPhase.x + progress * chunk.rotationSpeed.x,
      chunk.rotationPhase.y + progress * chunk.rotationSpeed.y,
      chunk.rotationPhase.z + progress * chunk.rotationSpeed.z,
    );
    chunk.mesh.scale.set(
      chunk.baseScale.x * (0.92 + fade * 0.12),
      chunk.baseScale.y * (0.92 + fade * 0.12),
      chunk.baseScale.z * (0.92 + fade * 0.12),
    );
  }

  return true;
};

const releasePlanetExplosion = (
  availableVisuals: PlanetExplosionVisual[],
  explosion: PlanetExplosionState,
) => {
  hidePlanetExplosionVisual(explosion.visual);
  availableVisuals.push(explosion.visual);
};

const createBoostWakeMaterial = (): {
  material: MeshBasicNodeMaterial;
  opacityNode: ReturnType<typeof uniform>;
} => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const opacityNode = uniform(0);
  const wakeUv = uv();
  const tailProgress = wakeUv.x;
  const fromPlanet = float(1).sub(tailProgress);
  const lateral = abs(wakeUv.y.sub(0.5)).mul(2);
  const wakeWidth = mix(float(0.16), float(0.94), pow(fromPlanet, float(0.68)));
  const widthMask = float(1).sub(
    smoothstep(wakeWidth.mul(0.68), wakeWidth, lateral),
  );
  const frontFade = smoothstep(0.0, 0.08, tailProgress);
  const tailFade = pow(fromPlanet, float(0.78));
  const coreBand = float(1).sub(smoothstep(0.0, 0.24, lateral));
  const mask = widthMask.mul(frontFade).mul(tailFade);
  const boostColor = getBoostColor();
  const hotGlow = tintColor(boostColor, -0.03, -0.05, 0.28);
  const coolGlow = tintColor(boostColor, 0.01, 0.03, -0.04);
  const trailBlend = smoothstep(0.12, 1.0, tailProgress);
  const glowColor = mix(color(hotGlow), color(coolGlow), trailBlend).mul(
    mask.mul(1.78).add(coreBand.mul(mask).mul(0.82)),
  );

  material.fragmentNode = vec4(
    glowColor.mul(opacityNode),
    mask.mul(0.34).mul(opacityNode),
  );

  return {
    material,
    opacityNode,
  };
};

const createSunCoreMaterial = (
  sunColor: string,
  glowColor: string,
  seed: number,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  const ember = tintColor(sunColor, 0.04, 0.06, -0.22);
  const base = new Color(sunColor);
  const hot = tintColor(glowColor, -0.02, 0.08, 0.12);
  const seedNode = uniform(seed);
  const spherePos = normalize(positionLocal);
  const timeNode = timerLocal(0.22).add(seedNode.mul(2.4));
  const turbulence = mx_fractal_noise_float(
    spherePos
      .mul(3.6)
      .add(vec3(timeNode.mul(0.62), seedNode.mul(5.8), timeNode.mul(-0.38))),
    5,
    2.1,
    0.58,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const moltenBands = sin(
    spherePos.y.mul(18).add(turbulence.mul(5.8)).add(timeNode.mul(1.2)),
  )
    .mul(0.5)
    .add(0.5);
  const hotMask = smoothstep(0.46, 0.96, turbulence.add(moltenBands.mul(0.28)));
  const pulse = sin(timeNode.mul(1.8)).mul(0.11).add(0.92);
  const coronaBoost = pow(
    max(float(1).sub(dot(spherePos, vec3(0, 0, 1))), 0),
    1.45,
  ).mul(0.62);
  const baseSurface = mix(color(ember), color(base), turbulence);

  material.colorNode = mix(baseSurface, color(hot), hotMask)
    .mul(pulse.add(coronaBoost))
    .mul(1.55);

  return material;
};

const createSunGlowMaterial = (
  glowColor: string,
  seed: number,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const warmGlow = new Color(glowColor);
  const hotGlow = tintColor(glowColor, -0.02, 0.08, 0.15);
  const seedNode = uniform(seed);

  material.fragmentNode = vec4(
    mix(
      color(warmGlow),
      color(hotGlow),
      mx_fractal_noise_float(
        positionLocal.xy
          .mul(3.4)
          .toVar()
          .add(vec2(seedNode.mul(1.3), timerLocal(0.35).mul(0.6))),
        3,
        2,
        0.58,
        1,
      )
        .mul(0.5)
        .add(0.5),
    )
      .mul(
        smoothstep(0.14, 0.48, length(positionLocal.xy)).mul(
          float(1).sub(smoothstep(0.7, 1, length(positionLocal.xy))),
        ),
      )
      .mul(2.3),
    smoothstep(0.14, 0.48, length(positionLocal.xy))
      .mul(float(1).sub(smoothstep(0.7, 1, length(positionLocal.xy))))
      .mul(0.78),
  );

  return material;
};

const createWarpMaterial = (
  glowColor: string,
  seed: number,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  const tint = tintColor(glowColor, 0.02, -0.16, -0.05);
  const seedNode = uniform(seed);
  const timeNode = timerLocal(0.18).add(seedNode.mul(1.3));
  const localPos = positionLocal.xy;
  const radial = max(length(localPos), 0.001);
  const bandMask = smoothstep(0.52, 0.64, radial).mul(
    float(1).sub(smoothstep(0.86, 1, radial)),
  );
  const turbulence = mx_fractal_noise_float(
    positionLocal.xy
      .mul(4.4)
      .toVar()
      .add(vec2(seedNode.mul(1.6), timeNode.mul(0.52))),
    3,
    2,
    0.6,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const warpStrength = bandMask
    .mul(turbulence.mul(0.7).add(0.3))
    .mul(0.02)
    .div(radial.mul(radial).add(0.08));
  const distortedUV = screenUV.add(normalize(localPos).mul(warpStrength));
  const sampledScene = viewportSharedTexture(viewportSafeUV(distortedUV));
  const edgeTint = bandMask.mul(turbulence.mul(0.72).add(0.18));

  material.fragmentNode = vec4(
    mix(sampledScene.rgb, color(tint), edgeTint.mul(0.22)),
    edgeTint.mul(0.34),
  );

  return material;
};

const createBlackHoleCoreMaterial = (): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  const eventHorizon = color("#050608");
  const emberRing = color("#b76c2c");
  const radial = length(positionLocal.xy);
  const innerMask = float(1).sub(smoothstep(0.58, 0.88, radial));
  const ringMask = smoothstep(0.52, 0.78, radial).mul(
    float(1).sub(smoothstep(0.86, 1, radial)),
  );

  material.fragmentNode = vec4(
    mix(eventHorizon, emberRing, ringMask.mul(0.55)),
    innerMask.add(ringMask.mul(0.42)),
  );

  return material;
};

const createBlackHoleRingMaterial = (): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const ash = color("#78421d");
  const glow = color("#f4b165");
  const radial = length(positionLocal.xy);
  const swirlNoise = mx_fractal_noise_float(
    positionLocal.xy
      .mul(5.2)
      .toVar()
      .add(vec2(timerLocal(0.28).mul(0.75), timerLocal(0.18).mul(-0.55))),
    4,
    2,
    0.56,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const ringMask = smoothstep(0.48, 0.68, radial).mul(
    float(1).sub(smoothstep(0.84, 1, radial)),
  );

  material.fragmentNode = vec4(
    mix(ash, glow, swirlNoise).mul(ringMask.mul(1.6)),
    ringMask.mul(swirlNoise.mul(0.7).add(0.22)),
  );

  return material;
};

const createBlackHoleLensMaterial = (): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  const localPos = positionLocal.xy;
  const radial = max(length(localPos), 0.001);
  const warpMask = smoothstep(0.24, 0.56, radial).mul(
    float(1).sub(smoothstep(0.86, 1, radial)),
  );
  const warpStrength = warpMask.mul(0.05).div(radial.mul(radial).add(0.045));
  const sampledScene = viewportSharedTexture(
    viewportSafeUV(screenUV.add(normalize(localPos).mul(warpStrength))),
  );

  material.fragmentNode = vec4(sampledScene.rgb, warpMask.mul(0.55));

  return material;
};

const createStarfieldLayer = (
  count: number,
  size: number,
  alphaScale: number,
  z: number,
  parallax: number,
): StarfieldLayerVisual => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  const warmth = new Float32Array(count);
  const phase = new Float32Array(count);
  const pulse = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const x = (Math.random() - 0.5) * STARFIELD_TILE_SIZE;
    const y = (Math.random() - 0.5) * STARFIELD_TILE_SIZE;

    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = 0;
    alpha[index] = alphaScale * (0.45 + Math.random() * 0.55);
    warmth[index] = Math.random();
    phase[index] = Math.random() * Math.PI * 2;
    pulse[index] = 0.8 + Math.random() * 2.6;
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("starAlpha", new Float32BufferAttribute(alpha, 1));
  geometry.setAttribute("starWarmth", new Float32BufferAttribute(warmth, 1));
  geometry.setAttribute("starPhase", new Float32BufferAttribute(phase, 1));
  geometry.setAttribute("starPulse", new Float32BufferAttribute(pulse, 1));

  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const pointMask = float(1).sub(
    smoothstep(0.18, 0.5, length(pointUV.sub(vec2(0.5, 0.5)))),
  );
  const twinkle = sin(
    timerLocal(0.08)
      .mul(attribute("starPulse", "float"))
      .add(attribute("starPhase", "float")),
  )
    .mul(0.28)
    .add(0.78);

  material.colorNode = mix(
    color("#7ea8ff"),
    color("#fff3d1"),
    attribute("starWarmth", "float"),
  );
  material.opacityNode = attribute("starAlpha", "float")
    .mul(twinkle)
    .mul(pointMask);
  material.size = size;
  material.alphaTest = 0.01;

  const group = new Group();
  for (let tileY = -1; tileY <= 1; tileY += 1) {
    for (let tileX = -1; tileX <= 1; tileX += 1) {
      const points = new Points(geometry, material);
      points.position.set(
        tileX * STARFIELD_TILE_SIZE,
        tileY * STARFIELD_TILE_SIZE,
        z,
      );
      points.frustumCulled = false;
      points.renderOrder = -25;
      group.add(points);
    }
  }

  return {
    geometry,
    group,
    material,
    parallax,
    tileSize: STARFIELD_TILE_SIZE,
  };
};

const updateDebrisGeometry = (
  debrisVisual: DebrisVisual,
  debris: readonly CombatSandboxDebris[],
) => {
  const positionArray = debrisVisual.positionAttribute.array as Float32Array;
  const colorArray = debrisVisual.colorAttribute.array as Float32Array;
  const opacityArray = debrisVisual.opacityAttribute.array as Float32Array;
  const drawCount = Math.min(debris.length, MAX_DEBRIS_SAMPLES);

  for (let index = 0; index < drawCount; index += 1) {
    const piece = debris[index]!;
    const offset = index * 3;
    const tint = getCachedColor(piece.color);

    positionArray[offset] = piece.pos.x;
    positionArray[offset + 1] = piece.pos.y;
    positionArray[offset + 2] = 0;
    colorArray[offset] = tint.r;
    colorArray[offset + 1] = tint.g;
    colorArray[offset + 2] = tint.b;
    opacityArray[index] = 0.9;
  }

  debrisVisual.geometry.setDrawRange(0, drawCount);
  debrisVisual.positionAttribute.needsUpdate = true;
  debrisVisual.colorAttribute.needsUpdate = true;
  debrisVisual.opacityAttribute.needsUpdate = true;
};

const hideInstancedMeshRange = (
  mesh: InstancedMesh,
  fromIndex: number,
  toIndex: number,
  matrix: Matrix4,
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
): boolean => {
  if (fromIndex >= toIndex) {
    return false;
  }

  matrix.compose(position, rotation, scale);
  for (let index = fromIndex; index < toIndex; index += 1) {
    mesh.setMatrixAt(index, matrix);
  }

  return true;
};

const createCacheVisual = (
  cache: CombatSandboxCache,
  badgeMaterials: CacheSpriteMaterialMap,
): CacheVisual => createSharedCacheVisual(cache, badgeMaterials) as CacheVisual;

const updateCacheVisualBadge = (
  visual: CacheVisual,
  badgeMaterials: CacheSpriteMaterialMap,
  key: CacheIconKey,
) => updateSharedCacheVisualBadge(visual, badgeMaterials, key);

const disposeCacheVisual = (_visual: CacheVisual) => {};

const updateDroneVisual = (
  visual: DroneVisual,
  drone: CombatSandboxDrone | null,
  nowSec: number,
  spriteMaterials: CacheSpriteMaterialMap,
) => {
  visual.group.visible = drone !== null;
  if (drone === null) {
    return;
  }

  const accent =
    drone.mode === "return" ? getDroneReturnColor() : getDroneColor();
  const hullMaterial = visual.hullMesh.material as MeshBasicMaterial;
  const wingMaterial = visual.wingMesh.material as MeshBasicMaterial;
  const glowMaterial = visual.glowMesh.material as MeshBasicMaterial;
  const noseMaterial = visual.noseMesh.material as MeshBasicMaterial;
  const angle =
    len(drone.vel) > 18 ? Math.atan2(drone.vel.y, drone.vel.x) : nowSec * 0.4;

  hullMaterial.color.set(accent);
  wingMaterial.color.set(accent);
  glowMaterial.color.set(accent);
  glowMaterial.opacity = drone.mode === "return" ? 0.22 : 0.28;
  noseMaterial.color.set("#f4fbff");

  visual.group.position.set(drone.pos.x, drone.pos.y, 4.4);
  visual.group.rotation.z = angle - Math.PI / 2;
  visual.group.scale.set(1, 1, 1);
  visual.glowMesh.scale.set(44, 44, 1);
  visual.hullMesh.scale.set(16, 20, 1);
  visual.wingMesh.scale.set(24, 8, 1);
  visual.noseMesh.scale.set(5.5, 5.5, 1);
  visual.cargoSprite.visible = drone.cargo !== undefined;
  if (drone.cargo !== undefined) {
    const key = getSharedCacheIconKey(drone.cargo);
    visual.cargoSprite.material = spriteMaterials[key].material;
    visual.cargoSprite.position.set(0, 21, 0.25);
    visual.cargoSprite.scale.set(20, 20, 1);
  }
};

const getSandboxFocusPlanet = (
  planets: readonly {
    id: number;
    alive: boolean;
    pos: Vec2;
    label?: string;
  }[],
  playerPlanetId: number,
) =>
  planets.find((planet) => planet.id === playerPlanetId && planet.alive) ??
  planets.find((planet) => planet.alive) ??
  planets.find((planet) => planet.id === playerPlanetId) ??
  planets[0] ??
  null;

const getSandboxFocusBody = (state: {
  player: {
    activeDroneId: number | null;
    controlMode: "planet" | "drone";
    planetId: number;
  };
  drones: readonly {
    id: number;
    pos: Vec2;
  }[];
  planets: readonly {
    id: number;
    alive: boolean;
    pos: Vec2;
    label?: string;
  }[];
}) => {
  const activeDrone =
    state.player.controlMode === "drone" && state.player.activeDroneId !== null
      ? (state.drones.find(
          (drone) => drone.id === state.player.activeDroneId,
        ) ?? null)
      : null;

  if (activeDrone !== null) {
    return {
      label: "Drone",
      pos: activeDrone.pos,
    };
  }

  const focusPlanet = getSandboxFocusPlanet(
    state.planets,
    state.player.planetId,
  );
  return focusPlanet === null
    ? null
    : {
        label: focusPlanet.label ?? "Planet",
        pos: focusPlanet.pos,
      };
};

const getFullViewFrame = (
  state: {
    blackHole: { pos: Vec2; radius: number } | null;
    drones: readonly CombatSandboxDrone[];
    planets: readonly CombatSandboxPlanet[];
    player: {
      activeDroneId: number | null;
      controlMode: "planet" | "drone";
      planetId: number;
    };
    suns: readonly {
      pos: Vec2;
      radius: number;
      swallowedAtSec: number | null;
    }[];
  },
  viewportAspect: number,
  planetBodyScale: number,
): { centerX: number; centerY: number; visibleWorldHeight: number } => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includeCircle = (x: number, y: number, radius: number) => {
    minX = Math.min(minX, x - radius);
    maxX = Math.max(maxX, x + radius);
    minY = Math.min(minY, y - radius);
    maxY = Math.max(maxY, y + radius);
  };

  for (const sun of state.suns) {
    if (sun.swallowedAtSec !== null) {
      continue;
    }

    includeCircle(sun.pos.x, sun.pos.y, sun.radius);
  }

  for (const planet of state.planets) {
    if (!planet.alive) {
      continue;
    }

    includeCircle(
      planet.pos.x,
      planet.pos.y,
      getRenderedPlanetRadius(planet, planetBodyScale),
    );
  }

  if (state.blackHole !== null) {
    includeCircle(
      state.blackHole.pos.x,
      state.blackHole.pos.y,
      state.blackHole.radius,
    );
  }

  const controlledBody = getControlledBody(state);
  if (controlledBody !== null) {
    includeCircle(
      controlledBody.pos.x,
      controlledBody.pos.y,
      controlledBody.radius,
    );
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: FULL_VIEW_WORLD_HEIGHT,
    };
  }

  const paddedWidth = maxX - minX + FULL_VIEW_PADDING * 2;
  const paddedHeight = maxY - minY + FULL_VIEW_PADDING * 2;
  const safeAspect = Math.max(0.5, viewportAspect);

  return {
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
    visibleWorldHeight: Math.max(
      FULL_VIEW_WORLD_HEIGHT,
      paddedHeight,
      paddedWidth / safeAspect,
    ),
  };
};

const getControlledBody = (state: {
  player: {
    activeDroneId: number | null;
    controlMode: "planet" | "drone";
    planetId: number;
  };
  drones: readonly CombatSandboxDrone[];
  planets: readonly CombatSandboxPlanet[];
}) => {
  if (
    state.player.controlMode === "drone" &&
    state.player.activeDroneId !== null
  ) {
    return (
      state.drones.find((drone) => drone.id === state.player.activeDroneId) ??
      null
    );
  }

  return (
    state.planets.find((planet) => planet.id === state.player.planetId) ?? null
  );
};

export function createGameViewport(
  hostElement: HTMLDivElement,
  options: CreateGameViewportOptions = {},
): () => void {
  const sandboxStorageEnabled = options.enableSandboxStorage === true;
  const storage = sandboxStorageEnabled
    ? (hostElement.ownerDocument.defaultView?.localStorage ?? null)
    : null;
  const qualityController = createAdaptiveQualityController();
  let renderQuality = qualityController.getProfile();
  let currentMaxPixelRatio = renderQuality.maxPixelRatio;
  let currentSsaaLevel = renderQuality.ssaaLevel;
  let disposed = false;
  let renderer: WebGPURenderer | null = null;
  let rendererBootstrap:
    | Awaited<ReturnType<typeof createViewportRendererBootstrap>>
    | null = null;
  let camera: OrthographicCamera | null = null;
  let backdropMesh: Mesh | null = null;
  let inputController: ReturnType<typeof createGameViewportInputController> | null =
    null;
  let resetSimulationAccumulator = false;
  let resetSandbox: (() => void) | null = null;
  let clearPlanetExplosions = () => {};
  let syncAimWorldToPointer: (() => void) | null = null;
  const disposables: Array<{ dispose: () => void }> = [];
  let lastHudState = createInitialHudState();
  let resetProfiling = () => {};
  const emitHudState = (nextState: GameViewportHudState) => {
    if (areHudStatesEqual(lastHudState, nextState)) {
      return;
    }
    lastHudState = nextState;
    if (!disposed) {
      options.onHudStateChange?.(nextState);
    }
  };
  const sandboxSettingsStore = createGameViewportSandboxSettingsStore({
    emitHudState,
    getCurrentHudState: () => lastHudState,
    onResetProfilingRequested: () => {
      resetProfiling();
    },
    onResetSandboxRequested: () => {
      resetSandbox?.();
    },
    onSimulationAccumulatorResetRequested: () => {
      resetSimulationAccumulator = true;
    },
    storage,
  });
  const sandboxSettings = sandboxSettingsStore.state;
  const sandboxControlsEnabled = () =>
    sandboxSettingsControlsEnabled(sandboxSettings);
  options.onControllerReady?.(sandboxSettingsStore.controller);
  sandboxSettingsStore.emitInitialHudState();
  const cameraState = {
    centerX: 0,
    centerY: 0,
    renderCenterX: 0,
    renderCenterY: 0,
    shakeOffsetX: 0,
    shakeOffsetY: 0,
    visibleWorldHeight: FOLLOW_VIEW_WORLD_HEIGHT,
  };

  const applyCameraFrame = () => {
    if (camera === null) {
      return;
    }

    const width = Math.max(1, hostElement.clientWidth);
    const height = Math.max(1, hostElement.clientHeight);
    const aspect = width / height;
    const worldHalfHeight = cameraState.visibleWorldHeight / 2;
    const worldHalfWidth = worldHalfHeight * aspect;
    const renderCenterX = cameraState.centerX + cameraState.shakeOffsetX;
    const renderCenterY = cameraState.centerY + cameraState.shakeOffsetY;

    cameraState.renderCenterX = renderCenterX;
    cameraState.renderCenterY = renderCenterY;

    camera.left = -worldHalfWidth;
    camera.right = worldHalfWidth;
    camera.top = worldHalfHeight;
    camera.bottom = -worldHalfHeight;
    camera.position.set(renderCenterX, renderCenterY, CAMERA_DISTANCE);
    camera.lookAt(renderCenterX, renderCenterY, 0);
    camera.updateProjectionMatrix();

    if (backdropMesh !== null) {
      backdropMesh.position.set(renderCenterX, renderCenterY, -40);
      backdropMesh.scale.set(
        worldHalfWidth * 2 * BACKDROP_OVERDRAW,
        worldHalfHeight * 2 * BACKDROP_OVERDRAW,
        1,
      );
    }
  };

  const resizeViewport = () => {
    if (renderer === null || camera === null) {
      return;
    }

    const width = Math.max(1, hostElement.clientWidth);
    const height = Math.max(1, hostElement.clientHeight);

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, currentMaxPixelRatio),
    );
    renderer.setSize(width, height, false);
    applyCameraFrame();
    syncAimWorldToPointer?.();
  };

  void (async () => {
    try {
      const bootstrap = await createViewportRendererBootstrap({
        hostElement,
        onContextRecovered: () => {
          resetSimulationAccumulator = true;
        },
        target: "combatSandbox",
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
      const backdropMaterial = new MeshBasicNodeMaterial();
      backdropMaterial.colorNode = mix(
        color("#020307"),
        color("#0f2748"),
        uv().y.add(
          mx_fractal_noise_float(
            vec3(uv().mul(vec2(3.2, 1.8)), timerLocal(0.02)),
            4,
            2,
            0.55,
            1,
          )
            .mul(0.5)
            .add(0.5)
            .mul(0.12),
        ),
      );
      backdropMesh = new Mesh(backdropGeometry, backdropMaterial);
      backdropMesh.frustumCulled = false;
      backdropMesh.renderOrder = -40;
      scene.add(backdropMesh);
      applyCameraFrame();

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

      const initialState = createSandboxState(sandboxSettings.activePreset);
      const sunGeometry = new SphereGeometry(
        1,
        SUN_GEOMETRY_SEGMENTS,
        SUN_GEOMETRY_SEGMENTS,
      );
      const glowGeometry = new CircleGeometry(1, GLOW_GEOMETRY_SEGMENTS);
      const warpGeometry = new RingGeometry(0.55, 1, WARP_GEOMETRY_SEGMENTS);
      const planetGeometry = new SphereGeometry(
        1,
        PLANET_GEOMETRY_SEGMENTS,
        PLANET_GEOMETRY_SEGMENTS,
      );
      const sunVisuals = initialState.suns.map((sun, index) => {
        const presetSun = initialState.preset.suns[index]!;
        const coreMaterial = createSunCoreMaterial(
          presetSun.color,
          presetSun.glowColor,
          sun.id,
        );
        const glowMaterial = createSunGlowMaterial(presetSun.glowColor, sun.id);
        const warpMaterial = createWarpMaterial(presetSun.glowColor, sun.id);
        const coreMesh = new Mesh(sunGeometry, coreMaterial);
        const glowMesh = new Mesh(glowGeometry, glowMaterial);
        const warpMesh = new Mesh(warpGeometry, warpMaterial);

        coreMesh.renderOrder = -8;
        glowMesh.renderOrder = -10;
        warpMesh.renderOrder = -12;
        glowMesh.position.z = -2;
        warpMesh.position.z = -4;
        scene.add(warpMesh);
        scene.add(glowMesh);
        scene.add(coreMesh);
        disposables.push(coreMaterial, glowMaterial, warpMaterial);

        return {
          coreMesh,
          glowMesh,
          warpMesh,
          rotationSpeed: 0.12 + index * 0.05,
        } satisfies SunVisual;
      });

      const planetVisuals = initialState.planets.map((planet, index) => {
        const forestProfile = getPlanetForestProfile(
          planet.archetype,
          planet.id,
        );
        const material = createPlanetMaterial(
          planet.color,
          planet.id * 0.173,
          forestProfile.density,
          forestProfile.color,
        );
        const glowMaterial = createPlanetGlowMaterial(
          planet.color,
          planet.id * 0.173,
        );
        const mesh = new Mesh(planetGeometry, material);
        const glowMesh = new Mesh(glowGeometry, glowMaterial.material);
        const spinAxis = createPlanetSpinAxis(planet.id);
        const spinPhase =
          mulberry32(Math.imul(planet.id + 1, 0x85ebca6b) >>> 0)() *
          Math.PI *
          2;
        mesh.setRotationFromAxisAngle(spinAxis, spinPhase);
        mesh.renderOrder = -2;
        scene.add(mesh);
        glowMesh.position.z = 0.16;
        glowMesh.renderOrder = -1;
        scene.add(glowMesh);
        disposables.push(material, glowMaterial.material);

        return {
          glowContactStartNode: glowMaterial.contactStartNode,
          glowFadeStartNode: glowMaterial.fadeStartNode,
          glowMesh,
          glowRiseEndNode: glowMaterial.riseEndNode,
          glowRiseStartNode: glowMaterial.riseStartNode,
          mesh,
          rotationSpeed: 0.28 + index * 0.045,
          spinAxis,
          spinPhase,
        } satisfies PlanetVisual;
      });

      const trailVisuals = initialState.planets.map((planet) => {
        const geometry = new BufferGeometry();
        const positions = new Float32Array(MAX_TRAIL_SAMPLES * 3);
        const opacities = new Float32Array(MAX_TRAIL_SAMPLES);
        const positionAttribute = new Float32BufferAttribute(positions, 3);
        const opacityAttribute = new Float32BufferAttribute(opacities, 1);
        positionAttribute.setUsage(DynamicDrawUsage);
        opacityAttribute.setUsage(DynamicDrawUsage);
        geometry.setAttribute("position", positionAttribute);
        geometry.setAttribute("trailOpacity", opacityAttribute);
        geometry.setDrawRange(0, 0);

        const material = new PointsNodeMaterial({
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        });
        material.colorNode = color(planet.trailColor);
        material.opacityNode = attribute("trailOpacity", "float");
        material.size = TRAIL_POINT_SIZE;
        material.alphaTest = 0.01;

        const points = new Points(geometry, material);
        points.frustumCulled = false;
        points.position.z = -1;
        points.renderOrder = -3;

        disposables.push(geometry, material);

        return {
          samples: [],
          geometry,
          positionAttribute,
          opacityAttribute,
          points,
        } satisfies TrailVisual;
      });
      const hiddenTrailUntilByPlanetId = new Map(
        initialState.planets.map((planet) => [
          planet.id,
          planet.hideTrailUntilTick,
        ]),
      );
      const cacheSpriteAssets = createCacheSpriteAssets(
        hostElement.ownerDocument,
      );
      const cacheVisuals = new Map<number, CacheVisual>();
      const renderedCacheKeysById = new Map<number, CacheIconKey>();
      disposables.push({
        dispose: () => {
          for (const visual of cacheVisuals.values()) {
            scene.remove(visual.group);
            disposeCacheVisual(visual);
          }
          cacheVisuals.clear();
          renderedCacheKeysById.clear();
          disposeCacheSpriteAssets(cacheSpriteAssets);
        },
      });

      const droneColor = getDroneColor();
      const rocketRenderProfiles = getRocketRenderProfiles();
      const droneGlowMaterial = new MeshBasicMaterial({
        blending: AdditiveBlending,
        color: droneColor,
        depthWrite: false,
        opacity: 0.28,
        transparent: true,
      });
      const droneHullMaterial = new MeshBasicMaterial({
        color: droneColor,
        depthWrite: false,
      });
      const droneWingMaterial = new MeshBasicMaterial({
        color: droneColor,
        depthWrite: false,
        opacity: 0.92,
        transparent: true,
      });
      const droneNoseMaterial = new MeshBasicMaterial({
        color: "#f4fbff",
        depthWrite: false,
      });
      const droneGlowGeometry = new CircleGeometry(1, 40);
      const droneHullGeometry = new CircleGeometry(1, 3);
      const droneWingGeometry = new PlaneGeometry(1, 1);
      const droneNoseGeometry = new CircleGeometry(1, 20);
      const droneGroup = new Group();
      const droneGlowMesh = new Mesh(droneGlowGeometry, droneGlowMaterial);
      const droneWingMesh = new Mesh(droneWingGeometry, droneWingMaterial);
      const droneHullMesh = new Mesh(droneHullGeometry, droneHullMaterial);
      const droneNoseMesh = new Mesh(droneNoseGeometry, droneNoseMaterial);
      const droneCargoSprite = new Sprite(
        cacheSpriteAssets.iconMaterials.heavyAmmo.material,
      );
      droneGlowMesh.position.z = 0.1;
      droneWingMesh.position.z = 0.2;
      droneHullMesh.position.z = 0.3;
      droneNoseMesh.position.set(0, 12, 0.34);
      droneCargoSprite.position.z = 0.35;
      droneGlowMesh.renderOrder = 10;
      droneWingMesh.renderOrder = 11;
      droneHullMesh.renderOrder = 12;
      droneNoseMesh.renderOrder = 13;
      droneCargoSprite.renderOrder = 14;
      droneGroup.visible = false;
      droneGroup.add(
        droneGlowMesh,
        droneWingMesh,
        droneHullMesh,
        droneNoseMesh,
        droneCargoSprite,
      );
      scene.add(droneGroup);
      const droneVisual: DroneVisual = {
        group: droneGroup,
        glowMesh: droneGlowMesh,
        hullMesh: droneHullMesh,
        wingMesh: droneWingMesh,
        noseMesh: droneNoseMesh,
        cargoSprite: droneCargoSprite,
      };

      const rocketGeometry = new CylinderGeometry(0.58, 1, 1, 18, 1);
      rocketGeometry.rotateZ(-Math.PI / 2);
      const rocketTrailGeometry = new PlaneGeometry(1, 1);
      const rocketFlameGeometry = new PlaneGeometry(1, 1);
      const rocketLaunchBurstGeometry = new PlaneGeometry(1, 1);
      const rocketPools = WEAPON_KINDS.reduce(
        (pools, rocketKind) => {
          const profile = rocketRenderProfiles[rocketKind];
          const material = createRocketMaterial(profile.core, profile.trail);
          const trailMaterial = createRocketTrailMaterial(
            profile.core,
            profile.trail,
          );
          const flameMaterial = createRocketFlameMaterial(
            profile.core,
            profile.trail,
          );
          const mesh = new InstancedMesh(
            rocketGeometry,
            material,
            ROCKET_RENDER_INSTANCE_LIMITS[rocketKind],
          );
          const trailMesh = new InstancedMesh(
            rocketTrailGeometry,
            trailMaterial,
            MAX_ROCKET_TRAIL_INSTANCES[rocketKind],
          );
          const flameMesh = new InstancedMesh(
            rocketFlameGeometry,
            flameMaterial,
            ROCKET_RENDER_INSTANCE_LIMITS[rocketKind],
          );
          mesh.instanceMatrix.setUsage(DynamicDrawUsage);
          trailMesh.instanceMatrix.setUsage(DynamicDrawUsage);
          flameMesh.instanceMatrix.setUsage(DynamicDrawUsage);
          const hiddenInit = new Matrix4().compose(
            new Vector3(1e8, 1e8, 1e8),
            new Quaternion(),
            new Vector3(0.001, 0.001, 0.001),
          );
          for (
            let i = 0;
            i < ROCKET_RENDER_INSTANCE_LIMITS[rocketKind];
            i += 1
          ) {
            mesh.setMatrixAt(i, hiddenInit);
            flameMesh.setMatrixAt(i, hiddenInit);
          }
          for (let i = 0; i < MAX_ROCKET_TRAIL_INSTANCES[rocketKind]; i += 1) {
            trailMesh.setMatrixAt(i, hiddenInit);
          }
          mesh.instanceMatrix.needsUpdate = true;
          trailMesh.instanceMatrix.needsUpdate = true;
          flameMesh.instanceMatrix.needsUpdate = true;
          mesh.count = 0;
          mesh.visible = false;
          mesh.frustumCulled = false;
          mesh.renderOrder = 9;
          trailMesh.count = 0;
          trailMesh.visible = false;
          trailMesh.frustumCulled = false;
          trailMesh.renderOrder = 7;
          flameMesh.count = 0;
          flameMesh.visible = false;
          flameMesh.frustumCulled = false;
          flameMesh.renderOrder = 8;
          scene.add(trailMesh);
          scene.add(flameMesh);
          scene.add(mesh);
          disposables.push(material, trailMaterial, flameMaterial);

          pools[rocketKind] = {
            activeCount: 0,
            mesh,
            scale: profile.bodyScale,
            trailMesh,
            trailActiveCount: 0,
            trailCapacity: MAX_ROCKET_TRAIL_INSTANCES[rocketKind],
            trailOffset:
              profile.bodyScale.x * 0.5 + profile.trailScale.x * 0.5 - 2,
            trailScale: profile.trailScale,
            flameMesh,
            flameOffset:
              profile.bodyScale.x * 0.45 + profile.flameScale.x * 0.5 - 4,
            flameScale: profile.flameScale,
          };

          return pools;
        },
        {} as Record<RocketKind, RocketPoolVisual>,
      );
      const rocketLaunchBurstPools = WEAPON_KINDS.reduce(
        (pools, rocketKind) => {
          const profile = rocketRenderProfiles[rocketKind];
          const material = createRocketLaunchBurstMaterial(
            profile.core,
            profile.trail,
          );
          const mesh = new InstancedMesh(
            rocketLaunchBurstGeometry,
            material,
            MAX_ROCKET_LAUNCH_BURST_INSTANCES[rocketKind],
          );
          mesh.instanceMatrix.setUsage(DynamicDrawUsage);
          const hiddenInit = new Matrix4().compose(
            new Vector3(1e8, 1e8, 1e8),
            new Quaternion(),
            new Vector3(0.001, 0.001, 0.001),
          );
          for (
            let i = 0;
            i < MAX_ROCKET_LAUNCH_BURST_INSTANCES[rocketKind];
            i += 1
          ) {
            mesh.setMatrixAt(i, hiddenInit);
          }
          mesh.instanceMatrix.needsUpdate = true;
          mesh.count = 0;
          mesh.visible = false;
          mesh.frustumCulled = false;
          mesh.renderOrder = 21;
          scene.add(mesh);
          disposables.push(material);

          pools[rocketKind] = {
            activeCount: 0,
            mesh,
            scale: profile.trailScale,
          };

          return pools;
        },
        {} as Record<RocketKind, RocketLaunchBurstPoolVisual>,
      );

      const debrisGeometry = new BufferGeometry();
      const debrisPositions = new Float32Array(MAX_DEBRIS_SAMPLES * 3);
      const debrisColors = new Float32Array(MAX_DEBRIS_SAMPLES * 3);
      const debrisOpacity = new Float32Array(MAX_DEBRIS_SAMPLES);
      const debrisPositionAttribute = new Float32BufferAttribute(
        debrisPositions,
        3,
      );
      const debrisColorAttribute = new Float32BufferAttribute(debrisColors, 3);
      const debrisOpacityAttribute = new Float32BufferAttribute(
        debrisOpacity,
        1,
      );
      debrisPositionAttribute.setUsage(DynamicDrawUsage);
      debrisColorAttribute.setUsage(DynamicDrawUsage);
      debrisOpacityAttribute.setUsage(DynamicDrawUsage);
      debrisGeometry.setAttribute("position", debrisPositionAttribute);
      debrisGeometry.setAttribute("debrisColor", debrisColorAttribute);
      debrisGeometry.setAttribute("debrisOpacity", debrisOpacityAttribute);
      debrisGeometry.setDrawRange(0, 0);

      const debrisMaterial = new PointsNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      debrisMaterial.colorNode = attribute("debrisColor", "vec3");
      debrisMaterial.opacityNode = attribute("debrisOpacity", "float").mul(
        float(1).sub(
          smoothstep(0.12, 0.5, length(pointUV.sub(vec2(0.5, 0.5)))),
        ),
      );
      debrisMaterial.size = 10;
      debrisMaterial.alphaTest = 0.01;
      const debrisPoints = new Points(debrisGeometry, debrisMaterial);
      debrisPoints.renderOrder = 10;
      debrisPoints.position.z = 2;
      debrisPoints.frustumCulled = false;
      scene.add(debrisPoints);
      const debrisVisual: DebrisVisual = {
        geometry: debrisGeometry,
        points: debrisPoints,
        positionAttribute: debrisPositionAttribute,
        colorAttribute: debrisColorAttribute,
        opacityAttribute: debrisOpacityAttribute,
      };
      registerDisposables(disposables, debrisGeometry, debrisMaterial);

      const cannonMetalMaterial = new MeshBasicNodeMaterial();
      {
        const lightDir = normalize(vec3(-0.35, 0.82, 0.45));
        const viewDir = vec3(0, 0, 1);
        const halfDir = normalize(lightDir.add(viewDir));
        const n = normalize(normalWorld);
        const nDotL = dot(n, lightDir);
        const wrap = nDotL.mul(0.5).add(0.5);
        const lambert = pow(wrap, float(2.2));
        const shading = mix(float(0.05), float(1.08), lambert);
        const nDotH = max(dot(n, halfDir), float(0));
        const spec = pow(nDotH, float(32)).mul(0.7);
        cannonMetalMaterial.colorNode = color("#7a8aa2")
          .mul(shading)
          .add(color("#e5edff").mul(spec));
      }
      const cannonAccentMaterial = new MeshBasicNodeMaterial();
      const cannonAccentTint = uniform(new Color(RETICLE_BASE_COLOR));
      {
        const lightDir = normalize(vec3(-0.4, 0.75, 0.55));
        const viewDir = vec3(0, 0, 1);
        const halfDir = normalize(lightDir.add(viewDir));
        const n = normalize(normalWorld);
        const nDotL = max(dot(n, lightDir), float(0));
        const halfLambert = nDotL.mul(0.5).add(0.5);
        const lambert = pow(halfLambert, float(1.4));
        const shading = mix(float(0.1), float(0.78), lambert);
        const nDotH = max(dot(n, halfDir), float(0));
        const spec = pow(nDotH, float(18)).mul(0.22);
        cannonAccentMaterial.colorNode = cannonAccentTint
          .mul(shading)
          .add(color("#ffffff").mul(spec));
      }
      const cannonFlashMaterial = new MeshBasicMaterial({
        color: "#fff1c2",
        depthWrite: false,
        opacity: 0,
        transparent: true,
        blending: AdditiveBlending,
      });

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

      const cannonStemMesh = new Mesh(cannonStemGeometry, cannonMetalMaterial);
      cannonStemMesh.renderOrder = 14;
      const cannonBreechMesh = new Mesh(
        cannonBreechGeometry,
        cannonMetalMaterial,
      );
      cannonBreechMesh.renderOrder = 15;
      const cannonBarrelMesh = new Mesh(
        cannonBarrelGeometry,
        cannonMetalMaterial,
      );
      cannonBarrelMesh.renderOrder = 16;
      const cannonBarrelBandMesh = new Mesh(
        cannonBarrelBandGeometry,
        cannonAccentMaterial,
      );
      cannonBarrelBandMesh.renderOrder = 17;
      const cannonMuzzleMesh = new Mesh(
        cannonMuzzleGeometry,
        cannonAccentMaterial,
      );
      cannonMuzzleMesh.renderOrder = 18;
      const cannonFlashMesh = new Mesh(
        cannonFlashGeometry,
        cannonFlashMaterial,
      );
      cannonFlashMesh.renderOrder = 20;
      cannonFlashMesh.visible = false;
      const cannonGroup = new Group();
      cannonGroup.visible = false;
      cannonGroup.position.z = 6;
      cannonGroup.add(
        cannonStemMesh,
        cannonBreechMesh,
        cannonBarrelMesh,
        cannonBarrelBandMesh,
        cannonMuzzleMesh,
        cannonFlashMesh,
      );
      scene.add(cannonGroup);
      const cannonFireState = {
        lastAmmo: {
          light: initialState.player.ammo.light,
          heavy: initialState.player.ammo.heavy,
          seeker: initialState.player.ammo.seeker,
        } as Record<RocketKind, number>,
        flashStartSec: -Infinity,
      };

      const reticleRingMaterial = new MeshBasicMaterial({
        color: RETICLE_BASE_COLOR,
        depthWrite: false,
        opacity: 0.92,
        transparent: true,
      });
      const reticleRingMesh = new Mesh(
        new RingGeometry(15, 22, 48),
        reticleRingMaterial,
      );
      reticleRingMesh.renderOrder = 15;
      reticleRingMesh.position.z = 7;
      scene.add(reticleRingMesh);

      const reticleDotMaterial = new MeshBasicMaterial({
        color: RETICLE_BASE_COLOR,
        depthWrite: false,
        opacity: 0.95,
        transparent: true,
      });
      const reticleDotMesh = new Mesh(
        new CircleGeometry(4.5, 28),
        reticleDotMaterial,
      );
      reticleDotMesh.renderOrder = 16;
      reticleDotMesh.position.z = 7.5;
      scene.add(reticleDotMesh);

      const lockRingProgressUniform = uniform(0);
      const lockRingLockedUniform = uniform(0);
      const lockRingTimeUniform = uniform(0);
      const lockRingMaterial = new MeshBasicNodeMaterial({
        depthWrite: false,
        transparent: true,
      });
      {
        const ringUv = uv();
        const softEdge = float(0.006);
        const maskFactor = float(1).sub(
          smoothstep(
            lockRingProgressUniform.sub(softEdge),
            lockRingProgressUniform.add(softEdge),
            ringUv.x,
          ),
        );
        const chargingColor = color("#ffb347");
        const lockedColor = color(getWeaponColors().seeker.accent);
        const pulse = sin(lockRingTimeUniform.mul(float(11)))
          .mul(0.22)
          .add(1);
        const chargingBrightness = float(0.85);
        const lockedBrightness = pulse.mul(1.15);
        const brightness = mix(
          chargingBrightness,
          lockedBrightness,
          lockRingLockedUniform,
        );
        const ringTint = mix(chargingColor, lockedColor, lockRingLockedUniform);
        lockRingMaterial.colorNode = ringTint.mul(brightness);
        lockRingMaterial.opacityNode = maskFactor.mul(
          mix(float(0.85), float(0.95), lockRingLockedUniform),
        );
      }
      const lockRingMesh = new Mesh(
        new RingGeometry(1, 1.12, 96, 1, -Math.PI / 2, Math.PI * 2),
        lockRingMaterial,
      );
      lockRingMesh.visible = false;
      lockRingMesh.renderOrder = 13;
      lockRingMesh.position.z = 5.5;
      scene.add(lockRingMesh);

      const foresightVisual = createForesightVisual();
      scene.add(foresightVisual.line, foresightVisual.points);

      const shieldArcRadians = (SHIELD_SPEC.arcDeg * Math.PI) / 180;
      const shieldColor = getShieldColor();
      const shieldGlowMaterial = new MeshBasicMaterial({
        color: shieldColor,
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
      shieldGlowMesh.renderOrder = 11;
      shieldGlowMesh.position.z = 2.6;

      const shieldArcMaterial = new MeshBasicMaterial({
        color: shieldColor,
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
      shieldArcMesh.renderOrder = 12;
      shieldArcMesh.position.z = 2.8;

      const shieldGroup = new Group();
      shieldGroup.visible = false;
      shieldGroup.add(shieldGlowMesh, shieldArcMesh);
      scene.add(shieldGroup);

      const boostBurstGeometry = new BufferGeometry();
      const boostBurstPositions = new Float32Array(MAX_BOOST_BURST_SAMPLES * 3);
      const boostBurstOpacity = new Float32Array(MAX_BOOST_BURST_SAMPLES);
      const boostBurstPositionAttribute = new Float32BufferAttribute(
        boostBurstPositions,
        3,
      );
      const boostBurstOpacityAttribute = new Float32BufferAttribute(
        boostBurstOpacity,
        1,
      );
      boostBurstPositionAttribute.setUsage(DynamicDrawUsage);
      boostBurstOpacityAttribute.setUsage(DynamicDrawUsage);
      boostBurstGeometry.setAttribute("position", boostBurstPositionAttribute);
      boostBurstGeometry.setAttribute(
        "boostBurstOpacity",
        boostBurstOpacityAttribute,
      );
      boostBurstGeometry.setDrawRange(0, 0);

      const boostBurstMaterial = new PointsNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      boostBurstMaterial.colorNode = color(getBoostColor());
      boostBurstMaterial.opacityNode = attribute(
        "boostBurstOpacity",
        "float",
      ).mul(
        float(1).sub(
          smoothstep(0.12, 0.5, length(pointUV.sub(vec2(0.5, 0.5)))),
        ),
      );
      boostBurstMaterial.size = 14;
      boostBurstMaterial.alphaTest = 0.01;

      const boostBurstPoints = new Points(
        boostBurstGeometry,
        boostBurstMaterial,
      );
      boostBurstPoints.frustumCulled = false;
      boostBurstPoints.renderOrder = 13;
      boostBurstPoints.position.z = 2.2;
      boostBurstPoints.visible = false;
      scene.add(boostBurstPoints);

      const boostWake = createBoostWakeMaterial();
      const boostWakeGeometry = new PlaneGeometry(1, 1);
      boostWakeGeometry.translate(0.5, 0, 0);
      const boostWakeMesh = new Mesh(boostWakeGeometry, boostWake.material);
      boostWakeMesh.renderOrder = 11.8;
      boostWakeMesh.position.z = 2.26;
      boostWakeMesh.visible = false;
      scene.add(boostWakeMesh);
      const boostBurstVisual: BoostBurstVisual = {
        geometry: boostBurstGeometry,
        points: boostBurstPoints,
        positionAttribute: boostBurstPositionAttribute,
        opacityAttribute: boostBurstOpacityAttribute,
        wakeMesh: boostWakeMesh,
        wakeOpacityNode: boostWake.opacityNode,
      };
      const impactFlashGeometry = new CircleGeometry(1, 48);
      const impactRingGeometry = new RingGeometry(0.72, 1, 56);
      const impactBurstVisuals = Array.from(
        { length: MAX_VISIBLE_IMPACT_BURSTS },
        () => {
          const glowMaterial = new MeshBasicMaterial({
            depthWrite: false,
            opacity: 0,
            transparent: true,
            blending: AdditiveBlending,
          });
          const coreMaterial = new MeshBasicMaterial({
            depthWrite: false,
            opacity: 0,
            transparent: true,
            blending: AdditiveBlending,
          });
          const ringMaterial = new MeshBasicMaterial({
            depthWrite: false,
            opacity: 0,
            transparent: true,
            blending: AdditiveBlending,
          });
          const glowMesh = new Mesh(impactFlashGeometry, glowMaterial);
          const coreMesh = new Mesh(impactFlashGeometry, coreMaterial);
          const ringMesh = new Mesh(impactRingGeometry, ringMaterial);
          glowMesh.visible = false;
          coreMesh.visible = false;
          ringMesh.visible = false;
          glowMesh.renderOrder = 12.5;
          ringMesh.renderOrder = 13.2;
          coreMesh.renderOrder = 13.4;
          glowMesh.position.z = 2.55;
          ringMesh.position.z = 2.75;
          coreMesh.position.z = 2.65;
          scene.add(glowMesh, ringMesh, coreMesh);
          disposables.push(glowMaterial, coreMaterial, ringMaterial);

          return {
            coreMesh,
            glowMesh,
            ringMesh,
          } satisfies ImpactBurstVisual;
        },
      );
      registerDisposables(disposables, impactFlashGeometry, impactRingGeometry);
      const planetExplosionFragmentGeometries = [
        new BoxGeometry(1, 1, 1, 3, 3, 3),
        new BoxGeometry(1, 1, 1, 2, 3, 2),
        new SphereGeometry(1, 10, 10),
      ] satisfies readonly BufferGeometry[];
      const planetExplosionVisuals = Array.from(
        { length: MAX_ACTIVE_PLANET_EXPLOSIONS },
        () =>
          createPlanetExplosionVisual(
            scene,
            impactFlashGeometry,
            impactRingGeometry,
            planetExplosionFragmentGeometries,
          ),
      );
      registerDisposables(disposables, planetExplosionFragmentGeometries);
      registerDisposables(
        disposables,
        planetExplosionVisuals.flatMap((visual) => [
          visual.coreMaterial,
          visual.glowMaterial,
          visual.ringMaterial,
          visual.shockwaveMaterial,
          ...visual.chunkMaterials,
        ]),
      );

      const blackHoleGroup = new Group();
      blackHoleGroup.visible = false;
      blackHoleGroup.position.set(0, 0, 4);

      const blackHoleLens = new Mesh(
        new CircleGeometry(1, 72),
        createBlackHoleLensMaterial(),
      );
      blackHoleLens.scale.set(
        getBlackHoleLensRadius(),
        getBlackHoleLensRadius(),
        1,
      );
      blackHoleLens.position.z = -2;
      blackHoleLens.renderOrder = 4;

      const blackHoleRing = new Mesh(
        new RingGeometry(0.42, 1, 96),
        createBlackHoleRingMaterial(),
      );
      blackHoleRing.scale.set(
        getBlackHoleRingRadius(),
        getBlackHoleRingRadius(),
        1,
      );
      blackHoleRing.renderOrder = 5;

      const blackHoleCore = new Mesh(
        new CircleGeometry(1, 72),
        createBlackHoleCoreMaterial(),
      );
      blackHoleCore.scale.set(
        getBlackHoleCoreRadius(),
        getBlackHoleCoreRadius(),
        1,
      );
      blackHoleCore.renderOrder = 6;

      blackHoleGroup.add(blackHoleLens, blackHoleRing, blackHoleCore);
      scene.add(blackHoleGroup);

      registerDisposables(
        disposables,
        backdropGeometry,
        backdropMaterial,
        sunGeometry,
        glowGeometry,
        warpGeometry,
        planetGeometry,
        droneGlowGeometry,
        droneHullGeometry,
        droneWingGeometry,
        droneNoseGeometry,
        droneGlowMaterial,
        droneHullMaterial,
        droneWingMaterial,
        droneNoseMaterial,
        rocketGeometry,
        rocketTrailGeometry,
        rocketFlameGeometry,
        rocketLaunchBurstGeometry,
        cannonStemGeometry,
        cannonBreechGeometry,
        cannonBarrelGeometry,
        cannonBarrelBandGeometry,
        cannonMuzzleGeometry,
        cannonFlashGeometry,
        cannonMetalMaterial,
        cannonAccentMaterial,
        cannonFlashMaterial,
        reticleRingMesh.geometry,
        reticleRingMaterial,
        reticleDotMesh.geometry,
        reticleDotMaterial,
        lockRingMesh.geometry,
        lockRingMaterial,
        foresightVisual.lineGeometry,
        foresightVisual.line.material,
        foresightVisual.pointGeometry,
        foresightVisual.points.material,
        shieldGlowMesh.geometry,
        shieldGlowMaterial,
        shieldArcMesh.geometry,
        shieldArcMaterial,
        boostBurstGeometry,
        boostBurstMaterial,
        boostWakeMesh.geometry,
        boostWake.material,
        blackHoleLens.geometry,
        blackHoleLens.material,
        blackHoleRing.geometry,
        blackHoleRing.material,
        blackHoleCore.geometry,
        blackHoleCore.material,
      );

      const scenePass = ssaaPass(scene, nextCamera) as ReturnType<
        typeof pass
      > & { sampleLevel: number };
      scenePass.sampleLevel = currentSsaaLevel;
      const bloomNode = bloom(
        scenePass,
        BLOOM_STRENGTH,
        BLOOM_RADIUS,
        BLOOM_THRESHOLD,
      );
      const chromaticAberrationNode = rgbShift(scenePass.add(bloomNode), 0, 0);
      const outputFrame = renderOutput(
        chromaticAberrationNode,
        nextRenderer.toneMapping,
        nextRenderer.outputColorSpace,
      );
      const postProcessing = new PostProcessing(nextRenderer, outputFrame);
      postProcessing.outputColorTransform = false;
      disposables.push(scenePass, bloomNode);

      let foresightPath: Vec2[] = [];
      let lastBoostVisualTick = initialState.player.lastBoostTick;
      const killFeedEntries: KillFeedState[] = [];
      let nextKillFeedId = 1;
      const activeBoostBursts: BoostBurstState[] = [];
      const activePlanetExplosions: PlanetExplosionState[] = [];
      const inactivePlanetExplosionVisuals = [...planetExplosionVisuals];
      const rocketTrailStates = new Map<number, RocketTrailState>();
      let cameraShake = 0;
      let playerDamageFlash = 0;
      let playerHpPulse = 0;
      const rocketMatrix = new Matrix4();
      const hiddenRocketMatrix = new Matrix4();
      const rocketPosition = new Vector3();
      const hiddenRocketPosition = new Vector3(
        ARENA_RADIUS * 8,
        ARENA_RADIUS * 8,
        0,
      );
      const rocketRotation = new Quaternion();
      const hiddenRocketRotation = new Quaternion();
      const rocketScale = new Vector3();
      const hiddenRocketScale = new Vector3(0.001, 0.001, 0.001);

      const flushRocketPool = (
        pool: RocketPoolVisual,
        capacity: number,
        fromIndex = 0,
      ) => {
        const didHide = hideInstancedMeshRange(
          pool.mesh,
          fromIndex,
          capacity,
          hiddenRocketMatrix,
          hiddenRocketPosition,
          hiddenRocketRotation,
          hiddenRocketScale,
        );
        const didHideTrail = hideInstancedMeshRange(
          pool.trailMesh,
          fromIndex,
          pool.trailCapacity,
          hiddenRocketMatrix,
          hiddenRocketPosition,
          hiddenRocketRotation,
          hiddenRocketScale,
        );
        const didHideFlame = hideInstancedMeshRange(
          pool.flameMesh,
          fromIndex,
          capacity,
          hiddenRocketMatrix,
          hiddenRocketPosition,
          hiddenRocketRotation,
          hiddenRocketScale,
        );
        pool.mesh.count = 0;
        pool.mesh.visible = false;
        pool.trailMesh.count = 0;
        pool.trailMesh.visible = false;
        pool.flameMesh.count = 0;
        pool.flameMesh.visible = false;
        pool.activeCount = 0;
        pool.trailActiveCount = 0;
        if (didHide) {
          pool.mesh.instanceMatrix.needsUpdate = true;
        }
        if (didHideTrail) {
          pool.trailMesh.instanceMatrix.needsUpdate = true;
        }
        if (didHideFlame) {
          pool.flameMesh.instanceMatrix.needsUpdate = true;
        }
      };
      const flushRocketLaunchBurstPool = (
        pool: RocketLaunchBurstPoolVisual,
        capacity: number,
        fromIndex = 0,
      ) => {
        const didHide = hideInstancedMeshRange(
          pool.mesh,
          fromIndex,
          capacity,
          hiddenRocketMatrix,
          hiddenRocketPosition,
          hiddenRocketRotation,
          hiddenRocketScale,
        );
        pool.mesh.count = 0;
        pool.mesh.visible = false;
        pool.activeCount = 0;
        if (didHide) {
          pool.mesh.instanceMatrix.needsUpdate = true;
        }
      };

      clearPlanetExplosions = () => {
        while (activePlanetExplosions.length > 0) {
          releasePlanetExplosion(
            inactivePlanetExplosionVisuals,
            activePlanetExplosions.pop()!,
          );
        }
      };

      let previousState = initialState;
      let currentState = previousState;
      let renderState = createInterpolatedSandboxState(currentState);
      let accumulatorSec = 0;
      let previousFrameTimeSec: number | null = null;
      let nextHudUpdateSec = 0;
      const runtimeStats = {
        fps: 0,
        frameTimeMs: 0,
      };
      const runtimeStatsTracker = createRuntimeStatsTracker();
      const performanceProfiler = createViewportPerformanceProfiler();
      const renderInterpolationCache = createSandboxInterpolationCache();
      inputController = createGameViewportInputController({
        canvasElement: nextRenderer.domElement,
        getPlayerControlState: () => currentState.player,
        initialPlayer: initialState.player,
        isSandboxPaused: () => sandboxSettings.sandboxPaused,
        sandboxControlsEnabled,
        syncAimWorldToPointer: () => {
          syncAimWorldToPointer?.();
        },
        windowTarget: window,
      });
      const inputRuntime = inputController.state;
      const inputState = inputRuntime.inputState;
      const pendingAbilityRequests = inputRuntime.pendingAbilityRequests;
      const pendingDroneRequests = inputRuntime.pendingDroneRequests;
      const pointerState = inputRuntime.pointerState;
      const renderPlanetsById = new Map<number, CombatSandboxPlanet>();
      const renderDronesById = new Map<number, CombatSandboxDrone>();
      const activeCacheIds = new Set<number>();
      const activeRocketTrailIds = new Set<number>();
      const launchBurstsByKind = {
        heavy: [] as CombatSandboxRocketLaunchBurst[],
        light: [] as CombatSandboxRocketLaunchBurst[],
        seeker: [] as CombatSandboxRocketLaunchBurst[],
      };
      const rocketsByKind = {
        heavy: [] as CombatSandboxRocket[],
        light: [] as CombatSandboxRocket[],
        seeker: [] as CombatSandboxRocket[],
      };
      const syncRenderEntityLookups = (state: {
        drones: readonly CombatSandboxDrone[];
        planets: readonly CombatSandboxPlanet[];
      }) => {
        renderPlanetsById.clear();
        for (const planet of state.planets) {
          renderPlanetsById.set(planet.id, planet);
        }

        renderDronesById.clear();
        for (const drone of state.drones) {
          renderDronesById.set(drone.id, drone);
        }
      };

      const getCameraFrame = (state: typeof currentState) => {
        if (inputRuntime.fullViewEnabled) {
          const width = Math.max(1, hostElement.clientWidth);
          const height = Math.max(1, hostElement.clientHeight);
          return getFullViewFrame(
            state,
            width / height,
            sandboxSettings.planetBodyScale,
          );
        }

        const focusBody = getSandboxFocusBody(state);
        return {
          centerX: focusBody !== null ? focusBody.pos.x : 0,
          centerY: focusBody !== null ? focusBody.pos.y : 0,
          visibleWorldHeight: inputRuntime.readModeHeld
            ? READ_MODE_WORLD_HEIGHT
            : FOLLOW_VIEW_WORLD_HEIGHT,
        };
      };

      const syncCameraToFocus = (state: typeof currentState) => {
        const frame = getCameraFrame(state);
        cameraState.visibleWorldHeight = frame.visibleWorldHeight;
        cameraState.centerX = frame.centerX;
        cameraState.centerY = frame.centerY;
        applyCameraFrame();
        syncAimWorldToPointer?.();
      };

      const computeForesightPath = (state: typeof currentState): Vec2[] => {
        if (state.tick >= state.player.foresightActiveUntilTick) {
          return [];
        }

        const playerPlanet =
          state.planets.find((planet) => planet.id === state.player.planetId) ??
          null;
        if (playerPlanet === null || !playerPlanet.alive) {
          return [];
        }

        return predictPath(
          playerPlanet.pos,
          playerPlanet.vel,
          getActiveCombatSuns(state.suns),
          Math.ceil(FORESIGHT_WINDOW_SEC / FORESIGHT_STEP_SEC),
          FORESIGHT_STEP_SEC,
          state.blackHole ?? undefined,
        );
      };

      const screenToWorld = (clientX: number, clientY: number): Vec2 => {
        const rect = nextRenderer.domElement.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const aspect = width / height;
        const halfHeight = cameraState.visibleWorldHeight / 2;
        const halfWidth = halfHeight * aspect;
        const normalizedX = (clientX - rect.left) / width;
        const normalizedY = (clientY - rect.top) / height;

        return {
          x:
            cameraState.renderCenterX +
            lerp(-halfWidth, halfWidth, normalizedX),
          y:
            cameraState.renderCenterY +
            lerp(halfHeight, -halfHeight, normalizedY),
        };
      };

      syncAimWorldToPointer = () => {
        if (!pointerState.hasPointer) {
          return;
        }

        inputState.aimWorld = screenToWorld(
          pointerState.clientX,
          pointerState.clientY,
        );
      };

      resetSandbox = () => {
        previousState = createSandboxState(sandboxSettings.activePreset);
        currentState = previousState;
        renderState = createInterpolatedSandboxState(currentState);
        accumulatorSec = 0;
        previousFrameTimeSec = null;
        nextHudUpdateSec = 0;
        inputController?.resetForPlayer(currentState.player);
        resetProfiling();
        foresightPath = [];
        lastBoostVisualTick = currentState.player.lastBoostTick;
        activeBoostBursts.length = 0;
        clearPlanetExplosions();
        killFeedEntries.length = 0;
        cameraShake = 0;
        playerDamageFlash = 0;
        playerHpPulse = 0;
        cameraState.shakeOffsetX = 0;
        cameraState.shakeOffsetY = 0;
        hiddenTrailUntilByPlanetId.clear();
        rocketTrailStates.clear();
        for (const planet of currentState.planets) {
          hiddenTrailUntilByPlanetId.set(planet.id, planet.hideTrailUntilTick);
        }

        for (const trail of trailVisuals) {
          resetTrail(trail);
        }
        for (const rocketKind of WEAPON_KINDS) {
          flushRocketPool(
            rocketPools[rocketKind],
            ROCKET_RENDER_INSTANCE_LIMITS[rocketKind],
          );
          flushRocketLaunchBurstPool(
            rocketLaunchBurstPools[rocketKind],
            MAX_ROCKET_LAUNCH_BURST_INSTANCES[rocketKind],
          );
        }
        updateDebrisGeometry(debrisVisual, []);
        debrisVisual.points.visible = false;
        updateForesightVisual(foresightVisual, []);
        syncRenderEntityLookups(currentState);
        updateBoostBurstVisual(
          boostBurstVisual,
          activeBoostBursts,
          renderPlanetsById,
          0,
          sandboxSettings.planetBodyScale,
        );
        updateImpactBurstVisuals(
          impactBurstVisuals,
          [],
          renderPlanetsById,
          currentState.elapsedSec,
          sandboxSettings.planetBodyScale,
        );
        shieldGroup.visible = false;
        droneVisual.group.visible = false;
        for (const visual of cacheVisuals.values()) {
          scene.remove(visual.group);
          disposeCacheVisual(visual);
        }
        cacheVisuals.clear();

        syncCameraToFocus(currentState);
        syncAimWorldToPointer?.();
      };
      resetProfiling = () => {
        performanceProfiler.reset();
        nextHudUpdateSec = 0;
        emitHudState({
          ...lastHudState,
          debugItems: [],
          profilingEnabled: sandboxSettings.profilingEnabled,
        });
      };

      hostElement.replaceChildren(nextRenderer.domElement);
      resizeViewport();
      window.addEventListener("resize", resizeViewport);
      syncCameraToFocus(currentState);

      nextRenderer.setAnimationLoop((timeMs = performance.now()) => {
        const nowSec = timeMs * 0.001;
        const activePreset = sandboxSettings.activePreset;
        const blackHoleSettings = sandboxSettings.blackHoleSettings;
        const boostSettings = sandboxSettings.boostSettings;
        const cacheBadgeScale = sandboxSettings.cacheBadgeScale;
        const foresightSettings = sandboxSettings.foresightSettings;
        const fullViewEnabled = inputRuntime.fullViewEnabled;
        const planetAuraGap = sandboxSettings.planetAuraGap;
        const planetAuraScale = sandboxSettings.planetAuraScale;
        const planetBodyScale = sandboxSettings.planetBodyScale;
        const profilingEnabled = sandboxSettings.profilingEnabled;
        const readModeHeld = inputRuntime.readModeHeld;
        const sandboxPaused = sandboxSettings.sandboxPaused;
        const shieldSettings = sandboxSettings.shieldSettings;
        const frameProfilerStartMs = profilingEnabled ? performance.now() : 0;

        if (resetSimulationAccumulator) {
          accumulatorSec = 0;
          previousFrameTimeSec = nowSec;
          resetSimulationAccumulator = false;
        }

        if (previousFrameTimeSec === null) {
          previousFrameTimeSec = nowSec;
        }

        const frameDeltaSec = clamp(
          nowSec - previousFrameTimeSec,
          0,
          MAX_FRAME_DELTA_SEC,
        );
        previousFrameTimeSec = nowSec;
        const sampledRuntimeStats = runtimeStatsTracker.sample(frameDeltaSec);
        runtimeStats.fps = sampledRuntimeStats.fps;
        runtimeStats.frameTimeMs = sampledRuntimeStats.frameTimeMs;
        const nextRenderQuality = qualityController.update(
          nowSec,
          runtimeStats.frameTimeMs,
        );
        if (nextRenderQuality.changed) {
          renderQuality = nextRenderQuality.profile;
          currentMaxPixelRatio = renderQuality.maxPixelRatio;
          currentSsaaLevel = renderQuality.ssaaLevel;
          scenePass.sampleLevel = currentSsaaLevel;
          resizeViewport();
        }
        if (sandboxPaused) {
          accumulatorSec = 0;
          inputController?.clearPendingGameplayRequests();
        } else {
          accumulatorSec += frameDeltaSec;
        }
        syncAimWorldToPointer?.();

        let stepCount = 0;
        const simulationProfilerStartMs = profilingEnabled
          ? performance.now()
          : 0;

        while (
          accumulatorSec >= FIXED_STEP_SEC &&
          stepCount < MAX_STEPS_PER_FRAME
        ) {
          const previousControlMode = currentState.player.controlMode;
          const previousActiveDroneId = currentState.player.activeDroneId;
          const fireRequestedThisStep =
            inputController?.consumeShotRequest() ?? false;
          const nextState = stepSandbox(
            currentState,
            {
              aimWorld: inputState.aimWorld,
              boostRequested: pendingAbilityRequests.boost,
              droneAutoReturnRequested: pendingDroneRequests.autoReturn,
              droneBurstRequested: pendingDroneRequests.burst,
              droneLaunchRequested: pendingDroneRequests.launch,
              droneRecallRequested: pendingDroneRequests.recall,
              fireRequested: fireRequestedThisStep,
              foresightRequested: pendingAbilityRequests.foresight,
              selectedRocketKind: inputState.selectedRocketKind,
              shieldRequested: pendingAbilityRequests.shield,
              wildcardRequested: pendingAbilityRequests.wildcard,
            },
            blackHoleSettings,
            {
              planetImpactRadiusMultiplier: planetBodyScale,
            },
          );
          inputController?.clearStepScopedRequests();
          const resetReason = getSandboxResetReason(nextState);
          previousState = currentState;
          currentState = nextState;
          for (let index = 0; index < currentState.planets.length; index += 1) {
            const planet = currentState.planets[index]!;
            const previousAtIndex = previousState.planets[index];
            const previousPlanet =
              previousAtIndex && previousAtIndex.id === planet.id
                ? previousAtIndex
                : (previousState.planets.find(
                    (item) => item.id === planet.id,
                  ) ?? null);
            if (previousPlanet?.alive && previousPlanet.hp > planet.hp) {
              const damageRatio = clamp(
                (previousPlanet.hp - planet.hp) / PLANET_HP,
                0.18,
                1,
              );
              if (planet.id === currentState.player.planetId) {
                playerDamageFlash = Math.max(
                  playerDamageFlash,
                  0.26 + damageRatio * 0.74,
                );
                playerHpPulse = Math.max(
                  playerHpPulse,
                  0.34 + damageRatio * 0.66,
                );
                cameraShake = Math.max(cameraShake, 0.24 + damageRatio * 0.76);
              }
            }
            if (previousPlanet?.alive && !planet.alive) {
              killFeedEntries.unshift({
                accent: planet.color,
                id: nextKillFeedId,
                startedAtSec: nowSec,
                text: describePlanetDeath(planet),
              });
              if (isPlanetExplosionDeath(planet.deathReason)) {
                cameraShake = Math.max(
                  cameraShake,
                  planet.id === currentState.player.planetId ? 1 : 0.5,
                );
                if (
                  inactivePlanetExplosionVisuals.length === 0 &&
                  activePlanetExplosions.length > 0
                ) {
                  releasePlanetExplosion(
                    inactivePlanetExplosionVisuals,
                    activePlanetExplosions.shift()!,
                  );
                }
                const explosionVisual =
                  inactivePlanetExplosionVisuals.pop() ?? null;
                if (explosionVisual !== null) {
                  activePlanetExplosions.push(
                    armPlanetExplosion(
                      explosionVisual,
                      planet,
                      nextState.elapsedSec,
                      planetBodyScale,
                    ),
                  );
                }
              }
              nextKillFeedId += 1;
            }
          }
          while (killFeedEntries.length > MAX_KILL_FEED_ENTRIES) {
            killFeedEntries.pop();
          }
          if (
            previousControlMode !== currentState.player.controlMode ||
            previousActiveDroneId !== currentState.player.activeDroneId
          ) {
            syncCameraToFocus(currentState);
          }
          if (
            currentState.player.lastBoostTick !== null &&
            currentState.player.lastBoostTick !== lastBoostVisualTick
          ) {
            const boostedPlanet =
              currentState.planets.find(
                (planet) => planet.id === currentState.player.planetId,
              ) ?? null;
            if (boostedPlanet?.alive) {
              activeBoostBursts.push({
                origin: { x: boostedPlanet.pos.x, y: boostedPlanet.pos.y },
                direction: normalizeVec2(currentState.player.lastBoostAimDir),
                planetId: boostedPlanet.id,
                radius: boostedPlanet.radius,
                startedAtSec: nowSec,
                tick: currentState.player.lastBoostTick,
              });
              while (activeBoostBursts.length > MAX_ACTIVE_BOOST_BURSTS) {
                activeBoostBursts.shift();
              }
            }
            lastBoostVisualTick = currentState.player.lastBoostTick;
          }
          foresightPath = computeForesightPath(currentState);
          accumulatorSec -= FIXED_STEP_SEC;
          stepCount += 1;

          if (resetReason !== null) {
            resetSandbox?.();
            break;
          }
        }

        if (stepCount === MAX_STEPS_PER_FRAME) {
          accumulatorSec = 0;
        }

        const simulationProfilerEndMs = profilingEnabled
          ? performance.now()
          : 0;
        const interpolationProfilerStartMs = profilingEnabled
          ? performance.now()
          : 0;
        syncInterpolatedSandboxState(
          renderState,
          renderInterpolationCache,
          previousState,
          currentState,
          clamp(accumulatorSec / FIXED_STEP_SEC, 0, 1),
        );
        syncRenderEntityLookups(renderState);
        const interpolationProfilerEndMs = profilingEnabled
          ? performance.now()
          : 0;
        const renderProfilerStartMs = profilingEnabled ? performance.now() : 0;
        const playerPlanet =
          renderPlanetsById.get(renderState.player.planetId) ?? null;
        const activeDrone =
          renderState.player.activeDroneId === null
            ? null
            : (renderDronesById.get(renderState.player.activeDroneId) ?? null);
        const controlsEnabled = sandboxControlsEnabled();
        const cameraFrame = getCameraFrame(renderState);
        const cameraTargetX = cameraFrame.centerX;
        const cameraTargetY = cameraFrame.centerY;
        const cameraTargetHeight = cameraFrame.visibleWorldHeight;
        const cameraMoveAlpha = easingAlpha(CAMERA_FOLLOW_LERP, frameDeltaSec);
        const cameraZoomAlpha = easingAlpha(CAMERA_ZOOM_LERP, frameDeltaSec);

        cameraState.centerX = lerp(
          cameraState.centerX,
          cameraTargetX,
          cameraMoveAlpha,
        );
        cameraState.centerY = lerp(
          cameraState.centerY,
          cameraTargetY,
          cameraMoveAlpha,
        );
        cameraState.visibleWorldHeight = lerp(
          cameraState.visibleWorldHeight,
          cameraTargetHeight,
          cameraZoomAlpha,
        );
        playerDamageFlash = decayUnitValue(
          playerDamageFlash,
          frameDeltaSec,
          HIT_FLASH_DURATION_SEC,
        );
        playerHpPulse = decayUnitValue(
          playerHpPulse,
          frameDeltaSec,
          HP_PULSE_DURATION_SEC,
        );
        cameraShake = decayUnitValue(
          cameraShake,
          frameDeltaSec,
          CAMERA_SHAKE_DURATION_SEC,
        );
        const shakeMagnitude =
          MAX_CAMERA_SHAKE_WORLD_OFFSET *
          (cameraTargetHeight / FOLLOW_VIEW_WORLD_HEIGHT) *
          cameraShake *
          cameraShake;
        cameraState.shakeOffsetX =
          shakeMagnitude *
          (Math.sin(nowSec * 64 + 0.4) * 0.68 +
            Math.sin(nowSec * 117 + 1.7) * 0.32);
        cameraState.shakeOffsetY =
          shakeMagnitude *
          (Math.cos(nowSec * 73 + 0.8) * 0.62 +
            Math.sin(nowSec * 109 + 2.1) * 0.38);
        applyCameraFrame();
        syncAimWorldToPointer?.();

        for (const layer of starfieldLayers) {
          layer.group.position.x = wrapCentered(
            cameraState.renderCenterX * layer.parallax,
            layer.tileSize,
          );
          layer.group.position.y = wrapCentered(
            cameraState.renderCenterY * layer.parallax,
            layer.tileSize,
          );
        }

        for (let index = 0; index < sunVisuals.length; index += 1) {
          const visual = sunVisuals[index]!;
          const sun = renderState.suns[index]!;
          const swallowFade =
            sun.swallowedAtSec === null
              ? 1
              : clamp(
                  1 -
                    (renderState.elapsedSec - sun.swallowedAtSec) /
                      SUN_SWALLOW_FADE_SEC,
                  0,
                  1,
                );
          const swallowScale = lerp(0.58, 1, swallowFade);
          const visible = swallowFade > 0.01;
          const coreMaterial = visual.coreMesh
            .material as MeshBasicNodeMaterial;
          const glowMaterial = visual.glowMesh
            .material as MeshBasicNodeMaterial;
          const warpMaterial = visual.warpMesh
            .material as MeshBasicNodeMaterial;

          visual.coreMesh.visible = visible;
          visual.glowMesh.visible = visible;
          visual.warpMesh.visible = visible;
          if (!visible) {
            continue;
          }

          coreMaterial.opacity = swallowFade;
          glowMaterial.opacity = swallowFade * 0.92;
          warpMaterial.opacity = swallowFade * 0.78;
          visual.coreMesh.position.set(sun.pos.x, sun.pos.y, 0);
          visual.glowMesh.position.set(sun.pos.x, sun.pos.y, -2);
          visual.warpMesh.position.set(sun.pos.x, sun.pos.y, -4);
          visual.coreMesh.scale.set(
            sun.radius * swallowScale,
            sun.radius * swallowScale,
            sun.radius * swallowScale,
          );
          visual.glowMesh.scale.set(
            sun.radius * getSunGlowScale() * swallowScale,
            sun.radius * getSunGlowScale() * swallowScale,
            1,
          );
          visual.warpMesh.scale.set(
            sun.radius * getSunWarpScale() * swallowScale,
            sun.radius * getSunWarpScale() * swallowScale,
            1,
          );
          visual.coreMesh.rotation.x = 0.38;
          visual.coreMesh.rotation.y = nowSec * visual.rotationSpeed;
          visual.glowMesh.rotation.z = nowSec * (0.05 + index * 0.02);
        }

        for (let index = 0; index < planetVisuals.length; index += 1) {
          const visual = planetVisuals[index]!;
          const trail = trailVisuals[index]!;
          const planet = renderState.planets[index]!;
          const auraRingStops = getPlanetAuraRingStops(
            planetAuraScale,
            planetAuraGap,
          );

          visual.mesh.visible = planet.alive;
          visual.glowMesh.visible = planet.alive;
          trail.points.visible = false;

          if (planet.alive) {
            visual.glowContactStartNode.value = auraRingStops.contactStart;
            visual.glowRiseStartNode.value = auraRingStops.riseStart;
            visual.glowRiseEndNode.value = auraRingStops.riseEnd;
            visual.glowFadeStartNode.value = auraRingStops.fadeStart;
            visual.mesh.position.set(planet.pos.x, planet.pos.y, 0);
            visual.glowMesh.position.set(planet.pos.x, planet.pos.y, 0.16);
            const renderRadius = getRenderedPlanetRadius(
              planet,
              planetBodyScale,
            );
            visual.mesh.scale.set(renderRadius, renderRadius, renderRadius);
            visual.glowMesh.scale.set(
              renderRadius * planetAuraScale,
              renderRadius * planetAuraScale,
              1,
            );
            visual.mesh.setRotationFromAxisAngle(
              visual.spinAxis,
              nowSec * visual.rotationSpeed + visual.spinPhase,
            );
          }
        }

        activeCacheIds.clear();
        for (const cache of renderState.caches) {
          activeCacheIds.add(cache.id);
          let visual = cacheVisuals.get(cache.id);
          if (visual === undefined) {
            visual = createCacheVisual(cache, cacheSpriteAssets.badgeMaterials);
            cacheVisuals.set(cache.id, visual);
            scene.add(visual.group);
          }

          const key = getSharedCacheIconKey(cache.contents);
          const previousKey = renderedCacheKeysById.get(cache.id);
          if (
            import.meta.env.DEV &&
            previousKey !== undefined &&
            previousKey !== key
          ) {
            console.warn("Cache key changed for existing id", {
              cacheId: cache.id,
              previousKey,
              key,
              contents: cache.contents,
              tick: renderState.tick,
            });
          }
          renderedCacheKeysById.set(cache.id, key);
          updateCacheVisualBadge(visual, cacheSpriteAssets.badgeMaterials, key);
          visual.group.position.set(
            cache.pos.x,
            cache.pos.y + Math.sin(nowSec * 1.8 + visual.bobPhase) * 6,
            3.5,
          );
          visual.group.rotation.z =
            Math.sin(nowSec * visual.wobbleRate + visual.bobPhase) * 0.08;
          const pulse =
            1 + Math.sin(nowSec * visual.pulseRate + visual.bobPhase) * 0.04;
          const badgeSize = getCacheBadgeBaseSize() * cacheBadgeScale * pulse;
          visual.badgeSprite.scale.set(badgeSize, badgeSize, 1);
        }

        for (const [cacheId, visual] of cacheVisuals) {
          if (!activeCacheIds.has(cacheId)) {
            scene.remove(visual.group);
            disposeCacheVisual(visual);
            cacheVisuals.delete(cacheId);
            renderedCacheKeysById.delete(cacheId);
          }
        }

        updateDroneVisual(
          droneVisual,
          activeDrone,
          nowSec,
          cacheSpriteAssets.iconMaterials,
        );

        for (const rocketKind of WEAPON_KINDS) {
          rocketsByKind[rocketKind].length = 0;
          launchBurstsByKind[rocketKind].length = 0;
        }
        pruneRocketTrailStates(rocketTrailStates, nowSec);
        for (const rocket of renderState.rockets) {
          rocketsByKind[rocket.rocketKind].push(rocket);
        }
        for (const burst of renderState.launchBursts) {
          launchBurstsByKind[burst.rocketKind].push(burst);
        }
        const worldUnitsPerPixel =
          cameraState.visibleWorldHeight /
          Math.max(1, hostElement.clientHeight);
        const renderElapsedSec = renderState.elapsedSec;
        const cannonStemLenWorld = CANNON_STEM_LENGTH_PX * worldUnitsPerPixel;
        const cannonBreechLenWorld =
          CANNON_BREECH_LENGTH_PX * worldUnitsPerPixel;
        const cannonBarrelLenWorld =
          CANNON_BARREL_LENGTH_PX * worldUnitsPerPixel;

        for (const rocketKind of WEAPON_KINDS) {
          const pool = rocketPools[rocketKind];
          const launchBurstPool = rocketLaunchBurstPools[rocketKind];
          const rockets = rocketsByKind[rocketKind];
          const launchBursts = launchBurstsByKind[rocketKind];
          const renderBodyScale = getMinScreenAxisScale(
            pool.scale,
            ROCKET_MIN_SCREEN_WIDTH_PX.body,
            worldUnitsPerPixel,
          );
          const renderFlameScale = getMinScreenAxisScale(
            pool.flameScale,
            ROCKET_MIN_SCREEN_WIDTH_PX.flame,
            worldUnitsPerPixel,
          );
          const renderTrailScale = getMinScreenAxisScale(
            pool.trailScale,
            ROCKET_MIN_SCREEN_WIDTH_PX.trail,
            worldUnitsPerPixel,
          );
          const renderLaunchScale = getMinScreenAxisScale(
            launchBurstPool.scale,
            ROCKET_MIN_SCREEN_WIDTH_PX.launchBurst,
            worldUnitsPerPixel,
          );
          const previousCount = pool.activeCount;
          const previousTrailCount = pool.trailActiveCount;
          const previousLaunchBurstCount = launchBurstPool.activeCount;
          let count = 0;
          activeRocketTrailIds.clear();

          for (const rocket of rockets) {
            if (count >= ROCKET_RENDER_INSTANCE_LIMITS[rocketKind]) {
              break;
            }

            const angle = Math.atan2(rocket.vel.y, rocket.vel.x);
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const seekerPulse =
              rocketKind === "seeker"
                ? 1 + Math.sin(nowSec * 10 + count * 0.7) * 0.18
                : 1;
            const flicker = 0.82 + Math.sin(nowSec * 38 + count * 1.37) * 0.16;
            const rocketMuzzleDistance = getCannonMuzzleDistance(
              rocket.launchPlanetRadius * planetBodyScale,
              cannonStemLenWorld,
              cannonBreechLenWorld,
              cannonBarrelLenWorld,
            );
            const rocketVisibleDistance = getRocketVisibleDistanceThreshold(
              rocketMuzzleDistance,
              renderBodyScale.x,
            );
            if (
              rocket.ownerId === renderState.player.playerId &&
              Math.hypot(
                rocket.pos.x - rocket.launchPlanetPos.x,
                rocket.pos.y - rocket.launchPlanetPos.y,
              ) < rocketVisibleDistance
            ) {
              continue;
            }
            const trailAnchor = {
              x: rocket.pos.x - dirX * pool.trailOffset,
              y: rocket.pos.y - dirY * pool.trailOffset,
            } satisfies Vec2;
            let trailState = rocketTrailStates.get(rocket.id);
            if (trailState === undefined) {
              trailState = {
                lastSeenSec: nowSec,
                rocketKind,
                samples: [],
              };
              rocketTrailStates.set(rocket.id, trailState);
            }
            appendRocketTrailSample(trailState, trailAnchor, nowSec);
            activeRocketTrailIds.add(rocket.id);

            rocketPosition.set(rocket.pos.x, rocket.pos.y, 3);
            rocketRotation.setFromAxisAngle(Z_AXIS, angle);
            rocketScale.set(
              renderBodyScale.x,
              renderBodyScale.y * seekerPulse,
              renderBodyScale.y,
            );
            rocketMatrix.compose(rocketPosition, rocketRotation, rocketScale);
            pool.mesh.setMatrixAt(count, rocketMatrix);

            rocketPosition.set(
              rocket.pos.x - dirX * pool.flameOffset,
              rocket.pos.y - dirY * pool.flameOffset,
              2.9,
            );
            rocketScale.set(
              renderFlameScale.x * flicker,
              renderFlameScale.y * flicker,
              1,
            );
            rocketMatrix.compose(rocketPosition, rocketRotation, rocketScale);
            pool.flameMesh.setMatrixAt(count, rocketMatrix);
            count += 1;
          }

          let trailCount = 0;

          for (const rocket of rockets) {
            const trailState = rocketTrailStates.get(rocket.id);

            if (trailState === undefined) {
              continue;
            }

            trailCount = appendRocketTrailInstances(
              pool.trailMesh,
              trailState,
              renderTrailScale,
              trailCount,
              pool.trailCapacity,
              rocketMatrix,
              rocketPosition,
              rocketRotation,
              rocketScale,
            );

            if (trailCount >= pool.trailCapacity) {
              break;
            }
          }

          if (trailCount < pool.trailCapacity) {
            for (const [rocketId, trailState] of rocketTrailStates) {
              if (
                trailState.rocketKind !== rocketKind ||
                activeRocketTrailIds.has(rocketId)
              ) {
                continue;
              }

              trailCount = appendRocketTrailInstances(
                pool.trailMesh,
                trailState,
                renderTrailScale,
                trailCount,
                pool.trailCapacity,
                rocketMatrix,
                rocketPosition,
                rocketRotation,
                rocketScale,
              );

              if (trailCount >= pool.trailCapacity) {
                break;
              }
            }
          }

          const clearedTail = hideInstancedMeshRange(
            pool.mesh,
            count,
            previousCount,
            hiddenRocketMatrix,
            hiddenRocketPosition,
            hiddenRocketRotation,
            hiddenRocketScale,
          );
          const clearedTrailTail = hideInstancedMeshRange(
            pool.trailMesh,
            trailCount,
            previousTrailCount,
            hiddenRocketMatrix,
            hiddenRocketPosition,
            hiddenRocketRotation,
            hiddenRocketScale,
          );
          const clearedFlameTail = hideInstancedMeshRange(
            pool.flameMesh,
            count,
            previousCount,
            hiddenRocketMatrix,
            hiddenRocketPosition,
            hiddenRocketRotation,
            hiddenRocketScale,
          );
          pool.activeCount = count;
          pool.trailActiveCount = trailCount;
          pool.mesh.count = count;
          pool.mesh.visible = count > 0;
          pool.trailMesh.count = trailCount;
          pool.trailMesh.visible = trailCount > 0;
          pool.flameMesh.count = count;
          pool.flameMesh.visible = count > 0;
          pool.mesh.instanceMatrix.needsUpdate = count > 0 || clearedTail;
          pool.trailMesh.instanceMatrix.needsUpdate =
            trailCount > 0 || clearedTrailTail;
          pool.flameMesh.instanceMatrix.needsUpdate =
            count > 0 || clearedFlameTail;

          let launchBurstCount = 0;
          for (const burst of launchBursts) {
            const burstMuzzleDistance = getCannonMuzzleDistance(
              burst.launchPlanetRadius * planetBodyScale,
              cannonStemLenWorld,
              cannonBreechLenWorld,
              cannonBarrelLenWorld,
            );
            const burstVisibleDistance = getRocketVisibleDistanceThreshold(
              burstMuzzleDistance,
              renderBodyScale.x,
            );
            const spawnDistance = Math.hypot(
              burst.origin.x - burst.launchPlanetPos.x,
              burst.origin.y - burst.launchPlanetPos.y,
            );
            const durationSec = Math.max(
              FIXED_STEP_SEC,
              Math.max(
                (burst.ttlUntilTick - burst.startedAtTick) * FIXED_STEP_SEC,
                getLaunchBurstHandoffDuration(
                  spawnDistance,
                  burstVisibleDistance,
                  burst.speed,
                ),
              ),
            );
            const ageSec = renderElapsedSec - burst.startedAtSec;
            if (ageSec < 0 || ageSec > durationSec) {
              continue;
            }

            const progress = clamp(ageSec / durationSec, 0, 1);
            const length = renderLaunchScale.x * (1.1 - progress * 0.16);
            const width = renderLaunchScale.y * (0.96 - progress * 0.34);
            const travel = getLaunchBurstTravelDistance(ageSec, burst.speed);
            const angle = Math.atan2(burst.dir.y, burst.dir.x);
            const origin =
              burst.ownerId === renderState.player.playerId
                ? getCannonMuzzleOrigin(
                    burst.launchPlanetPos,
                    burst.dir,
                    burstMuzzleDistance,
                  )
                : burst.origin;
            rocketPosition.set(
              origin.x + burst.dir.x * (travel + length * 0.5),
              origin.y + burst.dir.y * (travel + length * 0.5),
              6.25,
            );
            rocketRotation.setFromAxisAngle(Z_AXIS, angle);
            rocketScale.set(length, width, 1);
            rocketMatrix.compose(rocketPosition, rocketRotation, rocketScale);
            launchBurstPool.mesh.setMatrixAt(launchBurstCount, rocketMatrix);
            launchBurstCount += 1;

            if (
              launchBurstCount >= MAX_ROCKET_LAUNCH_BURST_INSTANCES[rocketKind]
            ) {
              break;
            }
          }

          const clearedLaunchBurstTail = hideInstancedMeshRange(
            launchBurstPool.mesh,
            launchBurstCount,
            previousLaunchBurstCount,
            hiddenRocketMatrix,
            hiddenRocketPosition,
            hiddenRocketRotation,
            hiddenRocketScale,
          );
          launchBurstPool.activeCount = launchBurstCount;
          launchBurstPool.mesh.count = launchBurstCount;
          launchBurstPool.mesh.visible = launchBurstCount > 0;
          launchBurstPool.mesh.instanceMatrix.needsUpdate =
            launchBurstCount > 0 || clearedLaunchBurstTail;
        }

        updateDebrisGeometry(debrisVisual, renderState.debris);
        debrisVisual.points.visible = renderState.debris.length > 0;
        while (
          activeBoostBursts.length > 0 &&
          nowSec - activeBoostBursts[0]!.startedAtSec > BOOST_BURST_DURATION_SEC
        ) {
          activeBoostBursts.shift();
        }
        updateForesightVisual(foresightVisual, foresightPath);
        updateBoostBurstVisual(
          boostBurstVisual,
          activeBoostBursts,
          renderPlanetsById,
          nowSec,
          planetBodyScale,
        );
        updateImpactBurstVisuals(
          impactBurstVisuals,
          renderState.impactBursts,
          renderPlanetsById,
          renderState.elapsedSec,
          planetBodyScale,
        );
        for (
          let index = activePlanetExplosions.length - 1;
          index >= 0;
          index -= 1
        ) {
          const explosion = activePlanetExplosions[index]!;
          if (!updatePlanetExplosion(explosion, renderState.elapsedSec)) {
            releasePlanetExplosion(inactivePlanetExplosionVisuals, explosion);
            activePlanetExplosions.splice(index, 1);
          }
        }

        const shieldActive =
          currentState.tick < currentState.player.shieldActiveUntilTick &&
          playerPlanet !== null &&
          playerPlanet.alive;
        shieldGroup.visible = shieldActive;
        if (shieldActive && playerPlanet !== null) {
          const shieldAngle = Math.atan2(
            renderState.player.shieldAimDir.y,
            renderState.player.shieldAimDir.x,
          );
          const pulse = 1 + Math.sin(nowSec * 8.2) * 0.035;
          const shieldRadius = getRenderedPlanetRadius(
            playerPlanet,
            planetBodyScale,
          );
          shieldGroup.position.set(playerPlanet.pos.x, playerPlanet.pos.y, 0);
          shieldGroup.scale.set(shieldRadius * pulse, shieldRadius * pulse, 1);
          shieldGroup.rotation.z = shieldAngle;
          shieldGlowMaterial.opacity = 0.2 + Math.sin(nowSec * 9.4) * 0.04;
          shieldArcMaterial.opacity = 0.54 + Math.sin(nowSec * 7.6) * 0.05;
        }

        const controlledBody = getControlledBody(renderState);

        if (
          controlledBody !== null &&
          controlsEnabled &&
          playerPlanet?.alive &&
          !shieldActive
        ) {
          const aimDelta = sub(inputState.aimWorld, controlledBody.pos);
          const aimAngle = Math.atan2(aimDelta.y, aimDelta.x);
          const weaponAccent =
            renderState.player.controlMode === "drone"
              ? getDroneColor()
              : getWeaponColors()[inputState.selectedRocketKind].accent;
          const worldUnitsPerPixel =
            cameraState.visibleWorldHeight /
            Math.max(1, hostElement.clientHeight);
          const aimSurfaceOffset =
            controlledBody.kind === "planet"
              ? getRenderedPlanetRadius(controlledBody, planetBodyScale)
              : controlledBody.radius;

          const stemLenWorld = CANNON_STEM_LENGTH_PX * worldUnitsPerPixel;
          const stemRadiusWorld =
            CANNON_STEM_WIDTH_PX * 0.5 * worldUnitsPerPixel;
          const breechLenWorld = CANNON_BREECH_LENGTH_PX * worldUnitsPerPixel;
          const breechWidthWorld = CANNON_BREECH_WIDTH_PX * worldUnitsPerPixel;
          const breechDepthWorld = CANNON_BREECH_DEPTH_PX * worldUnitsPerPixel;
          const barrelLenWorld = CANNON_BARREL_LENGTH_PX * worldUnitsPerPixel;
          const barrelRadiusWorld =
            CANNON_BARREL_WIDTH_PX * 0.5 * worldUnitsPerPixel;
          const bandLenWorld =
            CANNON_BARREL_BAND_LENGTH_PX * worldUnitsPerPixel;
          const bandRadiusWorld =
            CANNON_BARREL_BAND_WIDTH_PX * 0.5 * worldUnitsPerPixel;
          const muzzleLenWorld = CANNON_MUZZLE_LENGTH_PX * worldUnitsPerPixel;
          const muzzleRadiusWorld =
            CANNON_MUZZLE_RADIUS_PX * worldUnitsPerPixel;

          const stemStart = aimSurfaceOffset;
          const breechStart = stemStart + stemLenWorld;
          const barrelStart = breechStart + breechLenWorld;
          const barrelEnd = barrelStart + barrelLenWorld;

          cannonGroup.visible = true;
          cannonGroup.position.set(
            controlledBody.pos.x,
            controlledBody.pos.y,
            6,
          );
          cannonGroup.rotation.z = aimAngle;
          cannonAccentTint.value.set(weaponAccent);
          cannonStemMesh.position.set(stemStart + stemLenWorld * 0.5, 0, 0);
          cannonStemMesh.scale.set(
            stemLenWorld,
            stemRadiusWorld,
            stemRadiusWorld,
          );
          cannonBreechMesh.position.set(
            breechStart + breechLenWorld * 0.5,
            0,
            0,
          );
          cannonBreechMesh.scale.set(
            breechLenWorld,
            breechWidthWorld,
            breechDepthWorld,
          );
          cannonBarrelMesh.position.set(
            barrelStart + barrelLenWorld * 0.5,
            0,
            0,
          );
          cannonBarrelMesh.scale.set(
            barrelLenWorld,
            barrelRadiusWorld,
            barrelRadiusWorld,
          );
          cannonBarrelBandMesh.position.set(
            barrelStart + barrelLenWorld * 0.32,
            0,
            0,
          );
          cannonBarrelBandMesh.scale.set(
            bandLenWorld,
            bandRadiusWorld,
            bandRadiusWorld,
          );
          cannonMuzzleMesh.position.set(barrelEnd - muzzleLenWorld * 0.5, 0, 0);
          cannonMuzzleMesh.scale.set(
            muzzleLenWorld,
            muzzleRadiusWorld,
            muzzleRadiusWorld,
          );

          let firedThisFrame = false;
          for (const rocketKind of WEAPON_KINDS) {
            const currentAmmo = renderState.player.ammo[rocketKind];
            const previousAmmo = cannonFireState.lastAmmo[rocketKind];
            if (currentAmmo < previousAmmo) {
              firedThisFrame = true;
            }
            cannonFireState.lastAmmo[rocketKind] = currentAmmo;
          }
          if (firedThisFrame) {
            cannonFireState.flashStartSec = nowSec;
          }
          const flashElapsed = nowSec - cannonFireState.flashStartSec;
          if (flashElapsed >= 0 && flashElapsed <= CANNON_FLASH_DURATION_SEC) {
            const flashProgress = flashElapsed / CANNON_FLASH_DURATION_SEC;
            const flashOpacity = (1 - flashProgress) ** 2.1;
            const flashRadius =
              CANNON_FLASH_RADIUS_PX *
              worldUnitsPerPixel *
              (0.6 + flashProgress * 0.9);
            cannonFlashMesh.visible = true;
            cannonFlashMaterial.opacity = flashOpacity;
            cannonFlashMaterial.color.set(weaponAccent);
            cannonFlashMesh.position.set(
              barrelEnd + muzzleRadiusWorld * 0.4,
              0,
              0,
            );
            cannonFlashMesh.scale.set(flashRadius, flashRadius, flashRadius);
          } else {
            cannonFlashMesh.visible = false;
            cannonFlashMaterial.opacity = 0;
          }

          reticleRingMesh.visible = false;
          reticleDotMesh.visible = false;

          const lockTarget =
            renderState.player.controlMode === "drone" ||
            renderState.player.lockTargetId === null
              ? null
              : (renderPlanetsById.get(renderState.player.lockTargetId) ??
                null);

          lockRingMesh.visible =
            inputState.selectedRocketKind === "seeker" &&
            lockTarget !== null &&
            lockTarget.alive;
          if (lockTarget !== null && lockRingMesh.visible) {
            const lockAcquiredTick =
              currentState.player.seekerLockAcquiredAtTick;
            const lockProgress =
              lockAcquiredTick === null
                ? 0
                : Math.min(
                    1,
                    Math.max(0, currentState.tick - lockAcquiredTick) /
                      SEEKER_LOCK_TICKS,
                  );
            const isLocked = lockProgress >= 1;
            lockRingProgressUniform.value = lockProgress;
            lockRingLockedUniform.value = isLocked ? 1 : 0;
            lockRingTimeUniform.value = nowSec;
            lockRingMesh.position.set(lockTarget.pos.x, lockTarget.pos.y, 5.5);
            const baseRadius =
              getRenderedPlanetRadius(lockTarget, planetBodyScale) + 22;
            const chargePulse = 1 + Math.sin(nowSec * 3.6) * 0.015;
            const lockedPulse = 1 + Math.sin(nowSec * 6.5) * 0.06;
            const lockScale =
              baseRadius * (isLocked ? lockedPulse : chargePulse);
            lockRingMesh.scale.set(lockScale, lockScale, 1);
          }
        } else {
          cannonGroup.visible = false;
          cannonFlashMesh.visible = false;
          cannonFlashMaterial.opacity = 0;
          for (const rocketKind of WEAPON_KINDS) {
            cannonFireState.lastAmmo[rocketKind] =
              renderState.player.ammo[rocketKind];
          }
          reticleRingMesh.visible = false;
          reticleDotMesh.visible = false;
          lockRingMesh.visible = false;
        }

        blackHoleGroup.visible = renderState.blackHole !== null;
        if (renderState.blackHole !== null) {
          blackHoleGroup.position.set(
            renderState.blackHole.pos.x,
            renderState.blackHole.pos.y,
            4,
          );
          blackHoleRing.rotation.z = nowSec * 0.16;
        }

        const debug = getSandboxDebugSnapshot(currentState);
        const chromaticPressure =
          1 -
          clamp(
            debug.minCurrentPlanetSunGap / CHROMATIC_DISTANCE_FALLOFF,
            0,
            1,
          );
        const chromaticAberrationPressure = clamp(
          (chromaticPressure - 0.72) / 0.28,
          0,
          1,
        );
        chromaticAberrationNode.amount.value =
          chromaticAberrationPressure * CHROMATIC_ABERRATION_MAX;
        chromaticAberrationNode.angle.value = nowSec * 0.22;
        if (nowSec >= nextHudUpdateSec) {
          nextHudUpdateSec = nowSec + HUD_UPDATE_INTERVAL_SEC;
          const foresightActiveRemainingSec =
            Math.max(
              0,
              currentState.player.foresightActiveUntilTick - currentState.tick,
            ) * FIXED_STEP_SEC;
          const foresightCooldownRemainingSec =
            Math.max(
              0,
              currentState.player.foresightCooldownUntilTick -
                currentState.tick,
            ) * FIXED_STEP_SEC;
          const shieldActiveRemainingSec =
            Math.max(
              0,
              currentState.player.shieldActiveUntilTick - currentState.tick,
            ) * FIXED_STEP_SEC;
          const shieldCooldownRemainingSec =
            Math.max(
              0,
              currentState.player.shieldCooldownUntilTick - currentState.tick,
            ) * FIXED_STEP_SEC;
          const boostChargeRemainingSec =
            currentState.player.nextBoostChargeAtTick === null
              ? 0
              : Math.max(
                  0,
                  currentState.player.nextBoostChargeAtTick - currentState.tick,
                ) * FIXED_STEP_SEC;
          const boostRecoveryRemainingSec = boostChargeRemainingSec;
          const boostRecoveryDurationSec = boostSettings.cooldownSec;
          const foresightMode =
            foresightActiveRemainingSec > 0
              ? "active"
              : foresightCooldownRemainingSec > 0
                ? "cooldown"
                : "ready";
          const shieldMode =
            shieldActiveRemainingSec > 0
              ? "active"
              : shieldCooldownRemainingSec > 0
                ? "cooldown"
                : "ready";
          const boostMode =
            boostRecoveryRemainingSec > 0 ? "cooldown" : "ready";
          const droneTtlRemainingSec =
            activeDrone === null
              ? 0
              : Math.max(0, activeDrone.ttlUntilTick - currentState.tick) *
                FIXED_STEP_SEC;
          while (
            killFeedEntries.length > 0 &&
            nowSec - killFeedEntries[killFeedEntries.length - 1]!.startedAtSec >
              KILL_FEED_DURATION_SEC
          ) {
            killFeedEntries.pop();
          }

          const blackHoleRemainingSec = Math.max(
            0,
            blackHoleSettings.spawnSec - currentState.elapsedSec,
          );
          const profilerSnapshot = profilingEnabled
            ? performanceProfiler.getSnapshot()
            : null;
          const killFeed = killFeedEntries.map((entry) => ({
            accent: entry.accent,
            ageSec: nowSec - entry.startedAtSec,
            id: entry.id,
            text: entry.text,
          }));
          emitHudState(
            buildLocalSandboxHudState({
              activeDrone,
              blackHoleRemainingSec,
              blackHoleSettings,
              boostMode,
              boostRecoveryDurationSec,
              boostRecoveryRemainingSec,
              boostSettings,
              cacheBadgeScale,
              colors: {
                boost: getBoostColor(),
                drone: getDroneColor(),
                droneReturn: getDroneReturnColor(),
                foresight: getForesightColor(),
                shield: getShieldColor(),
                weapon: getWeaponColors(),
                wildcard: getWildcardColor(),
              },
              controlsEnabled,
              currentMaxPixelRatio,
              currentPresetId: activePreset.id,
              currentSsaaLevel,
              currentState,
              debug,
              droneTtlRemainingSec,
              foresightActiveRemainingSec,
              foresightCooldownRemainingSec,
              foresightMode,
              foresightSettings,
              fullViewEnabled,
              killFeed,
              planetAuraGap,
              planetAuraScale,
              planetBodyScale,
              playerDamageFlash,
              playerHpPulse,
              playerLabel: playerPlanet?.label ?? "Player",
              profilingEnabled,
              profilerSnapshot,
              readModeHeld,
              readModeHudOpacity: READ_MODE_HUD_OPACITY,
              runtimeStats,
              sandboxPaused,
              selectedWeapon: inputState.selectedRocketKind,
              shieldActiveRemainingSec,
              shieldCooldownRemainingSec,
              shieldMode,
              shieldSettings,
            }),
          );
        }

        const renderProfilerEndMs = profilingEnabled ? performance.now() : 0;
        const submitProfilerStartMs = profilingEnabled ? performance.now() : 0;
        postProcessing.render();
        if (profilingEnabled) {
          const submitProfilerEndMs = performance.now();
          performanceProfiler.record({
            frameCpuMs: submitProfilerEndMs - frameProfilerStartMs,
            frameDeltaSec,
            interpolationMs:
              interpolationProfilerEndMs - interpolationProfilerStartMs,
            renderCpuMs: renderProfilerEndMs - renderProfilerStartMs,
            simulationMs: simulationProfilerEndMs - simulationProfilerStartMs,
            stepCount,
            submitMs: submitProfilerEndMs - submitProfilerStartMs,
          });
        }
      });
    } catch (error) {
      console.error("[frontend] Failed to initialize TSL viewport.", error);

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
    inputController?.dispose();
    syncAimWorldToPointer = null;

    if (renderer !== null) {
      renderer.setAnimationLoop(null);
    }

    clearPlanetExplosions();
    for (let index = disposables.length - 1; index >= 0; index -= 1) {
      try {
        disposables[index]!.dispose();
      } catch (error) {
        console.warn(
          "[frontend] Failed to dispose game viewport resource.",
          error,
        );
      }
    }

    if (renderer !== null) {
      renderer.dispose();
    }

    rendererBootstrap?.dispose();

    options.onControllerReady?.(null);
    hostElement.replaceChildren();
  };
}
