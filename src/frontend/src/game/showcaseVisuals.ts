import {
  ARENA_RADIUS,
  type BackgroundVisualTuning,
  type CacheContents,
  mulberry32,
  type PlanetArchetypeVisualSpec,
  type Vec2,
} from "@3body/shared";
import {
  abs,
  attribute,
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
  positionLocal,
  pow,
  screenUV,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewportSharedTexture,
} from "three/tsl";
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  Points,
  PointsNodeMaterial,
  SRGBColorSpace,
  SpriteMaterial,
  Vector2,
  Vector3,
} from "three/webgpu";
import { getRuntimeTuningDocument } from "./runtimeTuning";

export interface BackgroundParallaxLayerVisual {
  geometry: BufferGeometry;
  group: Group;
  material: PointsNodeMaterial;
  driftX: number;
  driftY: number;
  parallax: number;
  tileSize: number;
}

export type BackgroundParallaxLayerKind = "dust" | "stars";

export interface BackgroundParallaxLayerConfig {
  alphaScale: number;
  count: number;
  coolColor: string;
  driftX: number;
  driftY: number;
  kind: BackgroundParallaxLayerKind;
  parallax: number;
  size: number;
  twinkleAmount: number;
  colorVariance: number;
  warmColor: string;
  z: number;
}

export type CacheIconKey =
  | "heavyAmmo"
  | "seekerPack"
  | "repair"
  | "shieldExt"
  | "foresightExt"
  | "wildcardGravityPulse"
  | "wildcardCloak";

type CacheBadgeShape =
  | "cache"
  | "hex"
  | "diamond"
  | "octagon"
  | "bolt"
  | "shield"
  | "chevron"
  | "star";

export interface PlanetGlowMaterialNodes {
  contactStartNode: ReturnType<typeof uniform>;
  fadeStartNode: ReturnType<typeof uniform>;
  material: MeshBasicNodeMaterial;
  opacityUniform: ReturnType<typeof uniform>;
  riseEndNode: ReturnType<typeof uniform>;
  riseStartNode: ReturnType<typeof uniform>;
}

export interface PlanetSurfaceMaterial extends MeshBasicNodeMaterial {
  opacityUniform: ReturnType<typeof uniform>;
}

export interface BackdropMaterial extends MeshBasicNodeMaterial {
  parallaxOffsetUniform: ReturnType<typeof uniform>;
}

export const SUN_GLOW_SCALE = 1.7;
export const SUN_WARP_SCALE = 3.2;
export const CACHE_BADGE_BASE_SIZE = 80;
const DISTANT_BODIES_CAMERA_FOLLOW = 0.08;
const NEBULA_CAMERA_FOLLOW = 0.12;
const MIN_BACKDROP_WORLD_SPAN = 0.001;
const BASE_STARFIELD_LAYERS = [
  {
    count: 320,
    alphaScale: 0.24,
    driftX: 0,
    driftY: 0,
    parallax: 0.08,
    size: 3.4,
    z: -30,
  },
  {
    count: 240,
    alphaScale: 0.34,
    driftX: 0,
    driftY: 0,
    parallax: 0.14,
    size: 2.5,
    z: -26,
  },
  {
    count: 180,
    alphaScale: 0.46,
    driftX: 0,
    driftY: 0,
    parallax: 0.22,
    size: 1.8,
    z: -22,
  },
] as const;

const BASE_DUST_LAYERS = [
  {
    count: 120,
    alphaScale: 0.085,
    driftX: -9,
    driftY: 4,
    parallax: 0.05,
    size: 11,
    z: -36,
  },
  {
    count: 90,
    alphaScale: 0.12,
    driftX: 7,
    driftY: -3,
    parallax: 0.1,
    size: 8,
    z: -32,
  },
] as const;

interface StarfieldLayerConfig {
  alphaScale: number;
  count: number;
  driftX: number;
  driftY: number;
  parallax: number;
  size: number;
  z: number;
}

interface StarfieldLayerVisual {
  geometry: { dispose: () => void };
  group: import("three/webgpu").Group;
  material: { dispose: () => void };
  parallax: number;
  tileSize: number;
}

const toHexString = (value: Color): string => `#${value.getHexString()}`;

export const createSceneBackgroundColor = (
  background: BackgroundVisualTuning,
): Color => new Color(background.baseColor);

export const createBackgroundLayerConfigs = (
  background: BackgroundVisualTuning,
): BackgroundParallaxLayerConfig[] => {
  const configs: BackgroundParallaxLayerConfig[] = [];

  if (background.starsEnabled) {
    const coolColor = toHexString(
      tintColor(background.glowColor, 0.06, 0.1, 0.18),
    );
    const warmColor = toHexString(
      tintColor(background.glowColor, -0.08, 0.2, 0.42),
    );
    const twinkleAmount = background.starTwinkleEnabled
      ? background.starTwinkleAmount
      : 0;

    configs.push(
      ...BASE_STARFIELD_LAYERS.map((layer) => ({
        ...layer,
        colorVariance: background.starColorVariance,
        coolColor,
        count: Math.max(0, Math.round(layer.count * background.starDensity)),
        kind: "stars" as const,
        size: layer.size * background.starSize,
        twinkleAmount,
        warmColor,
        alphaScale: layer.alphaScale * background.starBrightness,
      })),
    );
  }

  if (background.dustEnabled) {
    const coolColor = toHexString(
      tintColor(background.baseColor, 0.05, 0.08, 0.42),
    );
    const warmColor = toHexString(
      tintColor(background.glowColor, 0.02, -0.12, 0.55),
    );

    configs.push(
      ...BASE_DUST_LAYERS.map((layer) => ({
        ...layer,
        alphaScale: layer.alphaScale * background.dustBrightness,
        colorVariance: 0.28,
        coolColor,
        count: Math.max(0, Math.round(layer.count * background.dustDensity)),
        driftX: layer.driftX * background.dustDrift,
        driftY: layer.driftY * background.dustDrift,
        kind: "dust" as const,
        size: layer.size * background.dustSize,
        twinkleAmount: 0.14,
        warmColor,
      })),
    );
  }

  return configs;
};

export const createStarfieldLayerConfigs = (
  background: BackgroundVisualTuning,
): BackgroundParallaxLayerConfig[] => createBackgroundLayerConfigs(background);

export const ROCKET_RENDER_PROFILES = {
  heavy: {
    bodyScale: { x: 31, y: 7.8 } satisfies Vec2,
    core: "#ff8d4a",
    flameScale: { x: 28, y: 14 } satisfies Vec2,
    trail: "#ff6130",
    trailScale: { x: 36, y: 9 } satisfies Vec2,
  },
  light: {
    bodyScale: { x: 24, y: 4.8 } satisfies Vec2,
    core: "#f4f9ff",
    flameScale: { x: 22, y: 9 } satisfies Vec2,
    trail: "#b7e6ff",
    trailScale: { x: 30, y: 6 } satisfies Vec2,
  },
  seeker: {
    bodyScale: { x: 27, y: 6.2 } satisfies Vec2,
    core: "#f564ff",
    flameScale: { x: 25, y: 11 } satisfies Vec2,
    trail: "#ff4dd4",
    trailScale: { x: 33, y: 7.5 } satisfies Vec2,
  },
} as const;

export const CACHE_ICON_KEYS = [
  "heavyAmmo",
  "seekerPack",
  "repair",
  "shieldExt",
  "foresightExt",
  "wildcardGravityPulse",
  "wildcardCloak",
] as const satisfies readonly CacheIconKey[];

const getStarfieldRadius = (): number => ARENA_RADIUS * 2.35;
const getStarfieldTileSize = (): number => getStarfieldRadius() * 2;
const CACHE_BADGE_CELL_SIZE = 160;

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
    shape: "cache",
  },
  seekerPack: {
    accent: "#ff61eb",
    label: "SEEKER",
    shape: "cache",
  },
  repair: {
    accent: "#88f1b6",
    label: "REPAIR",
    shape: "cache",
  },
  shieldExt: {
    accent: "#86ecff",
    label: "SHIELD",
    shape: "cache",
  },
  foresightExt: {
    accent: "#ffe28b",
    label: "SIGHT+",
    shape: "cache",
  },
  wildcardGravityPulse: {
    accent: "#ffbf7d",
    label: "PULSE",
    shape: "cache",
  },
  wildcardCloak: {
    accent: "#92f0ff",
    label: "CLOAK",
    shape: "cache",
  },
};

export const getCacheIconAccent = (key: CacheIconKey): string =>
  CACHE_ICON_PRESENTATION[key].accent;

export const getCacheIconLabel = (key: CacheIconKey): string =>
  CACHE_ICON_PRESENTATION[key].label;

export const wrapCentered = (value: number, span: number): number => {
  if (!(span > 0)) {
    return value;
  }

  return ((((value + span / 2) % span) + span) % span) - span / 2;
};

export const tintColor = (
  value: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): Color => {
  const result = new Color(value);
  result.offsetHSL(hueOffset, saturationOffset, lightnessOffset);
  return result;
};

const PLANET_BASE_RADIUS = 0.84;
const PLANET_DISPLACEMENT_BUDGET = 0.28;
const PLANET_CONTINENTS_SCALE = 1.35;
const PLANET_CONTINENTS_OCTAVES = 4;
const PLANET_CONTINENTS_LACUNARITY = 2;
const PLANET_CONTINENTS_GAIN = 0.55;
const PLANET_MOUNTAINS_SCALE = 6.4;
const PLANET_MOUNTAINS_OCTAVES = 6;
const PLANET_MOUNTAINS_LACUNARITY = 2.15;
const PLANET_MOUNTAINS_GAIN = 0.52;
const PLANET_MOUNTAIN_HEIGHT = 0.55;
const PLANET_DETAIL_SCALE = 12.5;
const PLANET_FOREST_CLUMP_SCALE = 22;
const PLANET_FOREST_SPECKLE_SCALE = 64;
const PLANET_LAND_MASK_START = 0.42;
const PLANET_LAND_MASK_END = 0.56;
const PLANET_HEIGHT_OCEAN_SCALE = 0.44;
const PLANET_HEIGHT_LAND_SCALE = 0.52;
const PLANET_LAND_ELEVATION_START = 0.5;
const PLANET_LAND_ELEVATION_END = 1;
const PLANET_OCEAN_DEPTH_START = 0.48;
const PLANET_OCEAN_DEPTH_END = 0.3;
const PLANET_HIGHLAND_START = 0.05;
const PLANET_HIGHLAND_END = 0.42;
const PLANET_ROCK_START = 0.42;
const PLANET_ROCK_END = 0.72;
const PLANET_SNOW_START = 0.78;
const PLANET_SNOW_END = 0.96;
const PLANET_FOREST_BAND_START = 0.02;
const PLANET_FOREST_BAND_END = 0.18;
const PLANET_FOREST_FADE_START = 0.62;
const PLANET_FOREST_FADE_END = 0.3;
const PLANET_FOREST_CLUMP_START = 0.42;
const PLANET_FOREST_CLUMP_END = 0.78;
const PLANET_COAST_START = 0.48;
const PLANET_COAST_END = 0.52;
const PLANET_POLAR_START = 0.78;
const PLANET_POLAR_END = 0.94;
const PLANET_POLAR_MOUNTAIN_INFLUENCE = 0.08;
const PLANET_LAMBERT_MIN = 0.38;
const PLANET_LAMBERT_MAX = 1;
const PLANET_AO_MIN = 0.94;
const PLANET_AO_MAX = 1.03;
const PLANET_RIM_POWER = 2.6;
const PLANET_RIM_STRENGTH = 0.1;
const PLANET_EDGE_OUTLINE_STRENGTH = 0.14;
const PLANET_RIM_TINT_BLEND = 0.42;
const PLANET_GLOW_OUTER_HUE = -0.04;
const PLANET_GLOW_OUTER_SATURATION = 0.04;
const PLANET_GLOW_OUTER_LIGHTNESS = 0.2;
const PLANET_GLOW_INNER_HUE = -0.08;
const PLANET_GLOW_INNER_SATURATION = 0.1;
const PLANET_GLOW_INNER_LIGHTNESS = 0.28;
const PLANET_AURA_BODY_BOUNDARY_MIN = 0.08;
const PLANET_AURA_BODY_BOUNDARY_MAX = 0.975;
const PLANET_AURA_INNER_EDGE_MAX = 0.985;
const PLANET_AURA_INNER_FEATHER_BASE = 0.12;
const PLANET_AURA_INNER_FEATHER_MIN = 0.02;
const PLANET_AURA_INNER_FEATHER_MAX = 0.085;
const PLANET_AURA_RISE_START_FEATHER_SCALE = 0.9;
const PLANET_AURA_CONTACT_FEATHER_SCALE = 1.95;
const PLANET_AURA_MIN_REMAINING = 0.025;
const PLANET_AURA_FADE_START_MIN_OFFSET = 0.02;
const PLANET_AURA_FADE_START_REMAINING_SCALE = 0.18;
const PLANET_AURA_FADE_START_MAX = 0.995;
const PLANET_AURA_PULSE_FREQUENCY = 0.18;
const PLANET_AURA_PULSE_AMPLITUDE = 0.06;
const PLANET_AURA_PULSE_BASE = 0.94;
const PLANET_AURA_PULSE_SEED_PHASE = 1.9;
const PLANET_AURA_HALO_ENVELOPE_POWER = 1.85;
const PLANET_AURA_HALO_TAIL_SCALE = 0.72;
const PLANET_AURA_HALO_TAIL_BIAS = 0.28;
const PLANET_AURA_BRIGHTNESS = 0.56;
const PLANET_AURA_ALPHA = 0.16;
const PLANET_FOREST_DENSITY_JITTER_MIN = 0.6;
const PLANET_FOREST_DENSITY_JITTER_MAX = 1.3;
const PLANET_SPIN_TILT_MIN_Y = -0.72;
const PLANET_SPIN_TILT_MAX_Y = 0.72;

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));
const getBackdropParallaxOffset = (cameraFollow: number): number =>
  1 - cameraFollow;

export const syncBackdropFrame = ({
  backdropMesh,
  centerX,
  centerY,
  height,
  width,
}: {
  backdropMesh: Mesh | null;
  centerX: number;
  centerY: number;
  height: number;
  width: number;
}) => {
  if (backdropMesh === null) {
    return;
  }

  backdropMesh.position.set(centerX, centerY, -40);
  backdropMesh.scale.set(width, height, 1);

  const material = backdropMesh.material as Partial<BackdropMaterial>;
  material.parallaxOffsetUniform?.value.set(
    centerX / Math.max(width, MIN_BACKDROP_WORLD_SPAN),
    centerY / Math.max(height, MIN_BACKDROP_WORLD_SPAN),
  );
};

export const createBackdropMaterial = (
  background: BackgroundVisualTuning,
): BackdropMaterial => {
  const material = new MeshBasicNodeMaterial() as BackdropMaterial;
  material.parallaxOffsetUniform = uniform(new Vector2(0, 0));
  const surfaceUv = uv();
  const backdropTime = time.mul(0.02);
  const glowNoise = mx_fractal_noise_float(
    vec3(surfaceUv.mul(vec2(3.2, 1.8)), backdropTime),
    4,
    2,
    0.55,
    1,
  )
    .mul(0.5)
    .add(0.5);
  let backdropColor: any = mix(
    color(background.baseColor),
    color(background.glowColor),
    surfaceUv.y.add(glowNoise.mul(0.12)),
  );

  if (background.nebulaEnabled && background.nebulaStrength > 0) {
    const nebulaTime = time.mul(0.012 + background.nebulaDrift * 0.01);
    const nebulaUv = surfaceUv.add(
      material.parallaxOffsetUniform.mul(
        getBackdropParallaxOffset(NEBULA_CAMERA_FOLLOW),
      ),
    );
    const nebulaNoise = mx_fractal_noise_float(
      vec3(
        nebulaUv
          .mul(vec2(2.1, 1.3).mul(background.nebulaScale))
          .add(vec2(nebulaTime.mul(0.5), nebulaTime.mul(-0.22))),
        nebulaTime.mul(0.42),
      ),
      5,
      2.05,
      0.58,
      1,
    )
      .mul(0.5)
      .add(0.5);
    const nebulaMask = smoothstep(0.5, 0.88, nebulaNoise).mul(
      float(1).sub(smoothstep(0.18, 1.08, abs(nebulaUv.y.sub(0.36)).mul(2.1))),
    );

    backdropColor = mix(
      backdropColor,
      color(background.nebulaColor),
      nebulaMask.mul(background.nebulaStrength * 0.42),
    ).add(
      color(background.nebulaColor)
        .mul(nebulaMask)
        .mul(background.nebulaStrength * 0.11),
    );
  }

  if (background.distantBodiesEnabled && background.distantBodiesOpacity > 0) {
    const distantBodiesUv = surfaceUv.add(
      material.parallaxOffsetUniform.mul(
        getBackdropParallaxOffset(DISTANT_BODIES_CAMERA_FOLLOW),
      ),
    );
    const bodyCenterA = vec2(1.08, 0.16);
    const bodyDistanceA = length(distantBodiesUv.sub(bodyCenterA));
    const bodyFillA = float(1).sub(
      smoothstep(
        0.46 * background.distantBodiesScale,
        0.74 * background.distantBodiesScale,
        bodyDistanceA,
      ),
    );
    const bodyRimA = smoothstep(
      0.48 * background.distantBodiesScale,
      0.62 * background.distantBodiesScale,
      bodyDistanceA,
    ).mul(
      float(1).sub(
        smoothstep(
          0.62 * background.distantBodiesScale,
          0.76 * background.distantBodiesScale,
          bodyDistanceA,
        ),
      ),
    );
    const bodyCenterB = vec2(-0.18, 0.9);
    const bodyDistanceB = length(distantBodiesUv.sub(bodyCenterB));
    const bodyFillB = float(1).sub(
      smoothstep(
        0.18 * background.distantBodiesScale,
        0.32 * background.distantBodiesScale,
        bodyDistanceB,
      ),
    );
    const distantColor = color(background.distantBodiesColor);
    const rimColor = color(
      toHexString(tintColor(background.distantBodiesColor, 0.02, -0.08, 0.24)),
    );

    backdropColor = mix(
      backdropColor,
      distantColor,
      bodyFillA.mul(background.distantBodiesOpacity * 0.22),
    )
      .add(rimColor.mul(bodyRimA).mul(background.distantBodiesOpacity * 0.16))
      .add(rimColor.mul(bodyFillB).mul(background.distantBodiesOpacity * 0.12));
  }

  if (background.eventsEnabled && background.eventsIntensity > 0) {
    const eventTime = time.mul(0.04 + background.eventsFrequency * 0.03);
    const pulseTime = time.mul(0.5 + background.eventsFrequency * 0.24);
    const eventField = mx_fractal_noise_float(
      vec3(
        surfaceUv
          .mul(vec2(4.2, 2.4))
          .add(vec2(eventTime.mul(1.8), eventTime.mul(-0.94))),
        eventTime.mul(2.2),
      ),
      4,
      2.08,
      0.58,
      1,
    )
      .mul(0.5)
      .add(0.5);
    const eventPulse = sin(pulseTime.add(eventField.mul(13)))
      .mul(0.5)
      .add(0.5);
    const eventMask = smoothstep(0.9, 0.995, eventField).mul(eventPulse);

    backdropColor = backdropColor
      .add(
        color("#f6ecff")
          .mul(eventMask)
          .mul(background.eventsIntensity * 0.15),
      )
      .add(
        color(background.glowColor)
          .mul(eventMask)
          .mul(background.eventsIntensity * 0.22),
      );
  }

  material.colorNode = backdropColor;
  return material;
};

export const createPlanetSpinAxis = (seed: number): Vector3 => {
  const rng = mulberry32(Math.imul(seed + 1, 0x9e3779b1) >>> 0);
  const azimuth = rng() * Math.PI * 2;
  const y =
    PLANET_SPIN_TILT_MIN_Y +
    rng() * (PLANET_SPIN_TILT_MAX_Y - PLANET_SPIN_TILT_MIN_Y);
  const radial = Math.sqrt(Math.max(0.001, 1 - y * y));

  return new Vector3(
    Math.cos(azimuth) * radial,
    y,
    Math.sin(azimuth) * radial,
  ).normalize();
};

export const getPlanetForestProfile = (
  archetype: string,
  planetId: number,
): { color: string; coverage: number } => {
  const archetypeProfiles =
    getRuntimeTuningDocument().visuals.planets.archetypes;
  const profile =
    archetypeProfiles[archetype as keyof typeof archetypeProfiles];
  if (profile === undefined) {
    return { color: "#2c5a2a", coverage: 0 };
  }

  const jitter = mulberry32(Math.imul(planetId + 1, 0xc2b2ae35) >>> 0)();
  return {
    color: profile.forestColor,
    coverage: Math.min(
      2,
      Math.max(
        0,
        profile.forestCoverage *
          (PLANET_FOREST_DENSITY_JITTER_MIN +
            jitter *
              (PLANET_FOREST_DENSITY_JITTER_MAX -
                PLANET_FOREST_DENSITY_JITTER_MIN)),
      ),
    ),
  };
};

export const createRocketMaterial = (
  coreColor: string,
  trailColor: string,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial();
  const shell = tintColor(coreColor, 0, -0.32, -0.44);
  const nose = tintColor(coreColor, 0, -0.08, 0.18);
  const tail = tintColor(coreColor, 0, -0.38, -0.52);
  const stripe = tintColor(trailColor, -0.02, 0.1, 0.18);
  const canopy = tintColor(trailColor, 0.01, 0.02, 0.28);
  const axial = positionLocal.x.mul(0.5).add(0.5);
  const radial = length(vec2(positionLocal.y, positionLocal.z));
  const beam = normalize(vec3(-0.28, 0.34, 0.9));
  const worldNormal = normalize(normalWorld);
  const nDotL = max(dot(worldNormal, beam), float(0));
  const lambert = smoothstep(float(0), float(1), nDotL);
  const bodyShade = mix(float(0.34), float(0.92), lambert);
  const noseBlend = smoothstep(0.58, 0.98, axial);
  const tailBlend = float(1).sub(smoothstep(0.08, 0.28, axial));
  const rimShade = mix(float(1), float(0.62), smoothstep(0.18, 0.94, radial));
  const stripeMask = float(1)
    .sub(smoothstep(float(0.1), float(0.44), abs(positionLocal.y)))
    .mul(smoothstep(0.18, 0.82, axial))
    .mul(float(1).sub(smoothstep(0.86, 0.98, axial)));
  const bandMask = smoothstep(0.26, 0.36, axial).mul(
    float(1).sub(smoothstep(0.44, 0.54, axial)),
  );
  const bodyColor = mix(
    mix(mix(color(shell), color(nose), noseBlend), color(tail), tailBlend),
    color(stripe),
    bandMask.mul(0.78),
  );
  const panelColor = mix(bodyColor, color(canopy), stripeMask.mul(0.42));

  material.colorNode = panelColor
    .mul(bodyShade)
    .mul(rimShade)
    .mul(mix(float(0.72), float(1.08), stripeMask));

  return material;
};

export const createRocketTrailMaterial = (
  coreColor: string,
  trailColor: string,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const trailUv = uv();
  const lateral = abs(trailUv.y.sub(0.5)).mul(2);
  const head = pow(trailUv.x, float(0.42));
  const widthMask = float(1).sub(smoothstep(float(0.36), float(1.0), lateral));
  const plumeMask = widthMask.mul(head);
  const hotCore = float(1)
    .sub(smoothstep(float(0.0), float(0.24), lateral))
    .mul(smoothstep(0.58, 1.0, trailUv.x));
  const shimmer = sin(trailUv.x.mul(18).sub(time.mul(10)))
    .mul(0.08)
    .add(0.92);
  const outerTrail = color(tintColor(trailColor, 0, -0.12, -0.18));
  const innerTrail = color(tintColor(trailColor, 0.02, 0.12, 0.18));
  const plasmaCore = color(tintColor(coreColor, 0.03, 0.18, 0.42));

  material.colorNode = mix(
    mix(outerTrail, innerTrail, head),
    plasmaCore,
    hotCore,
  ).mul(mix(float(0.42), float(1.06), hotCore));
  material.opacityNode = plumeMask
    .mul(shimmer)
    .mul(mix(float(0.18), float(0.82), hotCore));
  material.alphaTest = 0.01;
  return material;
};

export const createRocketFlameMaterial = (
  coreColor: string,
  trailColor: string,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const flameUv = uv();
  const lateral = abs(flameUv.y.sub(0.5)).mul(2);
  const head = pow(flameUv.x, float(0.48));
  const widthMask = float(1).sub(smoothstep(float(0.28), float(1.0), lateral));
  const flameMask = widthMask.mul(head);
  const plasmaCore = float(1)
    .sub(smoothstep(float(0.0), float(0.22), lateral))
    .mul(smoothstep(0.48, 0.98, flameUv.x));
  const ripple = sin(flameUv.x.mul(24).sub(time.mul(14)).add(lateral.mul(6)))
    .mul(0.1)
    .add(0.9);
  const outerFire = color(tintColor(trailColor, -0.01, 0.16, 0.1));
  const innerFire = color(tintColor(coreColor, 0.02, 0.18, 0.46));
  const whiteHot = color("#fff3cf");

  material.colorNode = mix(
    mix(outerFire, innerFire, head),
    whiteHot,
    plasmaCore,
  ).mul(mix(float(0.74), float(1.18), plasmaCore));
  material.opacityNode = flameMask
    .mul(ripple)
    .mul(mix(float(0.4), float(1.0), plasmaCore));
  material.alphaTest = 0.01;
  return material;
};

export const createPlanetMaterial = (
  planetVisuals: PlanetArchetypeVisualSpec,
  seed: number,
  forestProfile?: {
    color: string;
    coverage: number;
  },
): PlanetSurfaceMaterial => {
  const opacityUniform = uniform(1);
  const material = new MeshBasicNodeMaterial() as PlanetSurfaceMaterial;
  material.transparent = true;
  material.opacityNode = opacityUniform;
  material.opacityUniform = opacityUniform;
  material.alphaTest = 0.01;
  const forestCoverage =
    forestProfile?.coverage ?? planetVisuals.forestCoverage;
  const forestColorHex = forestProfile?.color ?? planetVisuals.forestColor;
  const forestPatchScale = Math.max(0.001, planetVisuals.forestPatchSize);
  const forestAltitude = planetVisuals.forestAltitude;
  const forestBandStart = clampUnit(PLANET_FOREST_BAND_START + forestAltitude);
  const forestBandEnd = clampUnit(PLANET_FOREST_BAND_END + forestAltitude);
  const forestFadeStart = clampUnit(PLANET_FOREST_FADE_START + forestAltitude);
  const forestFadeEnd = clampUnit(PLANET_FOREST_FADE_END + forestAltitude);
  const forestClumpCoverageShift = (forestCoverage - 1) * 0.18;
  const forestClumpStart = clampUnit(
    PLANET_FOREST_CLUMP_START - forestClumpCoverageShift,
  );
  const forestClumpEnd = clampUnit(
    PLANET_FOREST_CLUMP_END - forestClumpCoverageShift,
  );
  const forestOpacity = clampUnit(forestCoverage);

  const base = new Color(planetVisuals.color);
  const lowland = tintColor(planetVisuals.color, 0.02, 0.06, -0.08);
  const highland = tintColor(planetVisuals.color, -0.03, -0.2, 0.14);
  const rock = tintColor(planetVisuals.color, 0, -0.5, -0.04);
  const snow = tintColor(planetVisuals.color, 0, -0.7, 0.24);
  const oceanDeep = new Color(planetVisuals.oceanDeepColor);
  const oceanShallow = new Color(planetVisuals.oceanShallowColor);
  const forestDark = new Color(forestColorHex);
  const forestLight = tintColor(forestColorHex, 0, 0.08, 0.08);

  const seedNode = uniform(seed);
  const dir = normalize(positionLocal);
  const seedOffset = vec3(
    seedNode.mul(3.7),
    seedNode.mul(1.9),
    seedNode.mul(5.3),
  );
  const continents = mx_fractal_noise_float(
    dir
      .mul(PLANET_CONTINENTS_SCALE * planetVisuals.continentsScale)
      .add(seedOffset),
    PLANET_CONTINENTS_OCTAVES,
    PLANET_CONTINENTS_LACUNARITY,
    PLANET_CONTINENTS_GAIN,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const mountains = mx_fractal_noise_float(
    dir
      .mul(PLANET_MOUNTAINS_SCALE * planetVisuals.mountainsScale)
      .add(vec3(seedNode.mul(7.1), seedNode.mul(2.4), seedNode.mul(9.7))),
    PLANET_MOUNTAINS_OCTAVES,
    PLANET_MOUNTAINS_LACUNARITY,
    PLANET_MOUNTAINS_GAIN,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const detail = mx_cell_noise_float(
    dir
      .mul(PLANET_DETAIL_SCALE)
      .add(vec3(seedNode.mul(4.2), seedNode.mul(6.1), seedNode.mul(2.7))),
  )
    .mul(0.5)
    .add(0.5);
  const landMask = smoothstep(
    PLANET_LAND_MASK_START,
    PLANET_LAND_MASK_END,
    continents,
  );
  const height = mix(
    continents.mul(PLANET_HEIGHT_OCEAN_SCALE),
    continents
      .mul(PLANET_HEIGHT_LAND_SCALE)
      .add(
        mountains.mul(PLANET_MOUNTAIN_HEIGHT * planetVisuals.mountainHeight),
      ),
    landMask,
  );
  const aboveSea = max(height.sub(planetVisuals.seaLevel), float(0));
  const displacement = aboveSea.mul(PLANET_DISPLACEMENT_BUDGET);
  material.positionNode = positionLocal
    .mul(PLANET_BASE_RADIUS)
    .add(dir.mul(displacement));

  const landElevation = smoothstep(
    PLANET_LAND_ELEVATION_START,
    PLANET_LAND_ELEVATION_END,
    height,
  );
  const oceanDepthMask = smoothstep(
    PLANET_OCEAN_DEPTH_START,
    PLANET_OCEAN_DEPTH_END,
    height,
  );
  const oceanCol = mix(color(oceanShallow), color(oceanDeep), oceanDepthMask);
  const forestTint = mix(color(lowland), color(base), detail);
  const lowToHigh = mix(
    forestTint,
    color(highland),
    smoothstep(PLANET_HIGHLAND_START, PLANET_HIGHLAND_END, landElevation),
  );
  const highToRock = mix(
    lowToHigh,
    color(rock),
    smoothstep(PLANET_ROCK_START, PLANET_ROCK_END, landElevation),
  );
  const snowCapped = mix(
    highToRock,
    color(snow),
    smoothstep(PLANET_SNOW_START, PLANET_SNOW_END, landElevation),
  );
  const forestClumps = mx_cell_noise_float(
    dir
      .mul(PLANET_FOREST_CLUMP_SCALE / forestPatchScale)
      .add(vec3(seedNode.mul(8.3), seedNode.mul(3.6), seedNode.mul(5.9))),
  )
    .mul(0.5)
    .add(0.5);
  const forestSpeckle = mx_cell_noise_float(
    dir
      .mul(PLANET_FOREST_SPECKLE_SCALE / Math.sqrt(forestPatchScale))
      .add(vec3(seedNode.mul(2.1), seedNode.mul(9.4), seedNode.mul(4.8))),
  )
    .mul(0.5)
    .add(0.5);
  const forestElevationMask = smoothstep(
    forestBandStart,
    forestBandEnd,
    landElevation,
  ).mul(smoothstep(forestFadeStart, forestFadeEnd, landElevation));
  const forestBody = smoothstep(forestClumpStart, forestClumpEnd, forestClumps);
  const forestTexture = mix(
    color(forestDark),
    color(forestLight),
    forestSpeckle,
  );
  const forestStrength = forestElevationMask
    .mul(forestBody)
    .mul(float(forestOpacity));
  const landCol = mix(snowCapped, forestTexture, forestStrength);
  const coastBlend = smoothstep(PLANET_COAST_START, PLANET_COAST_END, height);
  const surfaceBase = mix(oceanCol, landCol, coastBlend);
  const latitude = abs(dir.y);
  const polarMask = smoothstep(
    PLANET_POLAR_START,
    PLANET_POLAR_END,
    latitude.add(mountains.mul(PLANET_POLAR_MOUNTAIN_INFLUENCE)),
  );
  const surfaceColor = mix(surfaceBase, color(snow), polarMask);
  const lightDir = normalize(vec3(-0.35, 0.55, 0.9));
  const worldNormal = normalize(normalWorld);
  const nDotL = max(dot(worldNormal, lightDir), float(0));
  const lambert = smoothstep(float(0), float(1), nDotL);
  const shading = mix(
    float(PLANET_LAMBERT_MIN),
    float(PLANET_LAMBERT_MAX),
    lambert,
  );
  const heightAO = mix(
    float(PLANET_AO_MIN),
    float(PLANET_AO_MAX),
    landElevation,
  );
  const viewFacing = max(dot(worldNormal, vec3(0, 0, 1)), float(0));
  const rim = pow(float(1).sub(viewFacing), PLANET_RIM_POWER).mul(
    PLANET_RIM_STRENGTH,
  );
  const edgeOutline = smoothstep(0.2, 0.04, viewFacing).mul(
    PLANET_EDGE_OUTLINE_STRENGTH,
  );
  const rimTint = mix(color(snow), color(base), float(PLANET_RIM_TINT_BLEND));

  material.colorNode = surfaceColor
    .mul(shading)
    .mul(heightAO)
    .add(rimTint.mul(rim.add(edgeOutline)));

  return material;
};

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
  const bodyBoundary = Math.min(
    PLANET_AURA_BODY_BOUNDARY_MAX,
    Math.max(PLANET_AURA_BODY_BOUNDARY_MIN, 1 / safeAuraScale),
  );
  const normalizedGap = Math.max(0, auraGap) / safeAuraScale;
  const innerEdge = Math.min(
    PLANET_AURA_INNER_EDGE_MAX,
    Math.max(bodyBoundary, bodyBoundary + normalizedGap),
  );
  const innerFeather = Math.min(
    PLANET_AURA_INNER_FEATHER_MAX,
    Math.max(
      PLANET_AURA_INNER_FEATHER_MIN,
      PLANET_AURA_INNER_FEATHER_BASE / safeAuraScale,
    ),
  );
  const riseStart = Math.min(
    innerEdge - 0.001,
    Math.max(
      0.001,
      innerEdge - innerFeather * PLANET_AURA_RISE_START_FEATHER_SCALE,
    ),
  );
  const contactStart = Math.min(
    riseStart - 0.001,
    Math.max(
      0.001,
      innerEdge - innerFeather * PLANET_AURA_CONTACT_FEATHER_SCALE,
    ),
  );
  const remaining = Math.max(PLANET_AURA_MIN_REMAINING, 1 - innerEdge);
  const riseEnd = innerEdge;
  const fadeStart = Math.min(
    PLANET_AURA_FADE_START_MAX,
    Math.max(
      innerEdge + PLANET_AURA_FADE_START_MIN_OFFSET,
      innerEdge + remaining * PLANET_AURA_FADE_START_REMAINING_SCALE,
    ),
  );

  return {
    contactStart,
    fadeStart,
    riseEnd,
    riseStart,
  };
};

export const createPlanetGlowMaterial = (
  planetColor: string,
  seed: number,
  auraScale: number,
  auraGap: number,
): PlanetGlowMaterialNodes => {
  const opacityUniform = uniform(1);
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const outerGlow = tintColor(
    planetColor,
    PLANET_GLOW_OUTER_HUE,
    PLANET_GLOW_OUTER_SATURATION,
    PLANET_GLOW_OUTER_LIGHTNESS,
  );
  const innerGlow = tintColor(
    planetColor,
    PLANET_GLOW_INNER_HUE,
    PLANET_GLOW_INNER_SATURATION,
    PLANET_GLOW_INNER_LIGHTNESS,
  );
  const seedNode = uniform(seed);
  const initialRingStops = getPlanetAuraRingStops(auraScale, auraGap);
  const contactStartNode = uniform(initialRingStops.contactStart);
  const riseStartNode = uniform(initialRingStops.riseStart);
  const riseEndNode = uniform(initialRingStops.riseEnd);
  const fadeStartNode = uniform(initialRingStops.fadeStart);
  const radial = length(positionLocal.xy);
  const pulse = sin(
    time
      .mul(PLANET_AURA_PULSE_FREQUENCY)
      .add(seedNode.mul(PLANET_AURA_PULSE_SEED_PHASE)),
  )
    .mul(PLANET_AURA_PULSE_AMPLITUDE)
    .add(PLANET_AURA_PULSE_BASE);
  const haloInnerFade = smoothstep(contactStartNode, riseEndNode, radial);
  const haloEnvelope = pow(
    float(1).sub(smoothstep(riseEndNode, 1, radial)),
    float(PLANET_AURA_HALO_ENVELOPE_POWER),
  );
  const haloTail = float(1)
    .sub(smoothstep(fadeStartNode, 1, radial))
    .mul(PLANET_AURA_HALO_TAIL_SCALE)
    .add(PLANET_AURA_HALO_TAIL_BIAS);
  const haloMask = haloInnerFade.mul(haloEnvelope).mul(haloTail);
  const haloBlend = smoothstep(riseEndNode, 1, radial);

  material.fragmentNode = vec4(
    mix(color(innerGlow), color(outerGlow), haloBlend)
      .mul(haloMask)
      .mul(pulse)
      .mul(opacityUniform)
      .mul(PLANET_AURA_BRIGHTNESS),
    haloMask.mul(PLANET_AURA_ALPHA).mul(pulse).mul(opacityUniform),
  );
  material.alphaTest = 0.01;

  return {
    contactStartNode,
    fadeStartNode,
    material,
    opacityUniform,
    riseEndNode,
    riseStartNode,
  };
};

export const createSunCoreMaterial = (
  sunColor: string,
  glowColor: string,
  seed: number,
  brightness = 1,
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
  const timeNode = time.mul(0.22).add(seedNode.mul(2.4));
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
    .mul(1.55 * brightness);

  return material;
};

export const createSunGlowMaterial = (
  glowColor: string,
  seed: number,
  brightness = 1,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const warmGlow = new Color(glowColor);
  const hotGlow = tintColor(glowColor, -0.02, 0.08, 0.15);
  const seedNode = uniform(seed);
  const spherePos = normalize(positionLocal);
  const timeNode = time.mul(0.28).add(seedNode.mul(1.9));
  const turbulence = mx_fractal_noise_float(
    spherePos
      .mul(4.2)
      .add(vec3(seedNode.mul(2.1), timeNode.mul(0.58), timeNode.mul(-0.44))),
    4,
    2.05,
    0.58,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const bands = sin(
    spherePos.x
      .mul(4.2)
      .add(spherePos.y.mul(16))
      .add(turbulence.mul(5.6))
      .add(timeNode.mul(1.15)),
  )
    .mul(0.5)
    .add(0.5);
  const corona = smoothstep(
    0.08,
    0.94,
    pow(max(float(1).sub(dot(spherePos, vec3(0, 0, 1))), 0), 1.75),
  ).mul(turbulence.mul(0.52).add(bands.mul(0.22)).add(0.38));
  const glowMix = smoothstep(0.42, 0.95, turbulence.add(bands.mul(0.18)));

  material.fragmentNode = vec4(
    mix(color(warmGlow), color(hotGlow), glowMix)
      .mul(corona)
      .mul(2.6 * brightness),
    corona.mul(0.84 * brightness),
  );

  return material;
};

export const createWarpMaterial = (
  glowColor: string,
  seed: number,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  const tint = tintColor(glowColor, 0.02, -0.16, -0.05);
  const seedNode = uniform(seed);
  const timeNode = time.mul(0.18).add(seedNode.mul(1.3));
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
  const sampledScene = viewportSharedTexture(
    distortedUV.clamp(vec2(0.001, 0.001), vec2(0.999, 0.999)),
  );
  const edgeTint = bandMask.mul(turbulence.mul(0.72).add(0.18));

  material.fragmentNode = vec4(
    mix(sampledScene.rgb, color(tint), edgeTint.mul(0.22)),
    edgeTint.mul(0.34),
  );

  return material;
};

export const createBackgroundLayer = (
  config: BackgroundParallaxLayerConfig,
): BackgroundParallaxLayerVisual => {
  const { alphaScale, colorVariance, coolColor, count, driftX, driftY, kind } =
    config;
  const starfieldTileSize = getStarfieldTileSize();
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  const tint = new Float32Array(count);
  const phase = new Float32Array(count);
  const pulse = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions[offset] = (Math.random() - 0.5) * starfieldTileSize;
    positions[offset + 1] = (Math.random() - 0.5) * starfieldTileSize;
    positions[offset + 2] = 0;
    alpha[index] = alphaScale * (0.42 + Math.random() * 0.58);
    tint[index] = Math.random();
    phase[index] = Math.random() * Math.PI * 2;
    pulse[index] = 0.8 + Math.random() * 2.6;
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("particleAlpha", new Float32BufferAttribute(alpha, 1));
  geometry.setAttribute("particleTint", new Float32BufferAttribute(tint, 1));
  geometry.setAttribute("particlePhase", new Float32BufferAttribute(phase, 1));
  geometry.setAttribute("particlePulse", new Float32BufferAttribute(pulse, 1));

  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const particleTint = mix(
    float(0.5),
    attribute("particleTint", "float"),
    colorVariance,
  );
  const particleAlpha = attribute<"float">("particleAlpha", "float");
  const twinkle = sin(
    time
      .mul(0.08)
      .mul(attribute("particlePulse", "float"))
      .add(attribute("particlePhase", "float")),
  )
    .mul(0.26 * config.twinkleAmount)
    .add(1 - 0.18 * config.twinkleAmount);

  if (kind === "dust") {
    material.colorNode = mix(
      color(coolColor),
      color(config.warmColor),
      particleTint,
    );
    material.opacityNode = particleAlpha.mul(twinkle);
  } else {
    material.colorNode = mix(
      color(coolColor),
      color(config.warmColor),
      particleTint,
    );
    material.opacityNode = particleAlpha.mul(twinkle);
  }

  material.size = config.size;
  material.alphaTest = 0.01;

  const group = new Group();
  for (let tileY = -1; tileY <= 1; tileY += 1) {
    for (let tileX = -1; tileX <= 1; tileX += 1) {
      const points = new Points(geometry, material);
      points.position.set(
        tileX * starfieldTileSize,
        tileY * starfieldTileSize,
        config.z,
      );
      points.frustumCulled = false;
      points.renderOrder = kind === "dust" ? -28 : -25;
      group.add(points);
    }
  }

  return {
    driftX,
    driftY,
    geometry,
    group,
    material,
    parallax: config.parallax,
    tileSize: starfieldTileSize,
  };
};

export const createStarfieldLayer = (
  count: number,
  size: number,
  alphaScale: number,
  z: number,
  parallax: number,
): BackgroundParallaxLayerVisual =>
  createBackgroundLayer({
    alphaScale,
    colorVariance: 1,
    coolColor: "#7ea8ff",
    count,
    driftX: 0,
    driftY: 0,
    kind: "stars",
    parallax,
    size,
    twinkleAmount: 1,
    warmColor: "#fff3d1",
    z,
  });

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
      continue;
    }

    context.lineTo(x, y);
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
    case "cache":
      fillRoundedRect(
        context,
        -size * 0.34,
        -size * 0.34,
        size * 0.68,
        size * 0.68,
        size * 0.11,
      );
      return;
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
    case "wildcardGravityPulse":
      traceStar(context, 5.8 * unit, 2.4 * unit, 5);
      context.stroke();
      context.fillStyle = "#fff3d8";
      context.font = `${6.2 * unit}px "IBM Plex Sans", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("?", 0, 0.6 * unit);
      break;
    case "wildcardCloak":
      context.beginPath();
      context.arc(0, 0, 5.8 * unit, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-4.8 * unit, 4.8 * unit);
      context.lineTo(4.8 * unit, -4.8 * unit);
      context.stroke();
      break;
  }

  context.restore();
};

const getCacheBadgeFontSize = (size: number, label: string): number => {
  if (label.length >= 7) {
    return size * 0.145;
  }

  if (label.length >= 6) {
    return size * 0.16;
  }

  return size * 0.18;
};

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

  if (shape === "cache") {
    context.save();
    context.fillStyle = "rgba(255, 255, 255, 0.05)";
    fillRoundedRect(
      context,
      -size * 0.26,
      -size * 0.22,
      size * 0.52,
      size * 0.38,
      size * 0.06,
    );
    context.fill();
    context.fillStyle = `${accent}22`;
    fillRoundedRect(
      context,
      -size * 0.21,
      -size * 0.27,
      size * 0.42,
      size * 0.07,
      size * 0.03,
    );
    context.fill();
    context.fillStyle = accent;
    fillRoundedRect(
      context,
      -size * 0.26,
      size * 0.2,
      size * 0.08,
      size * 0.04,
      size * 0.015,
    );
    context.fill();
    fillRoundedRect(
      context,
      size * 0.18,
      size * 0.2,
      size * 0.08,
      size * 0.04,
      size * 0.015,
    );
    context.fill();
    context.restore();
  }

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
  canvas.width = CACHE_BADGE_CELL_SIZE;
  canvas.height = CACHE_BADGE_CELL_SIZE;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2D canvas context unavailable.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawCacheBadgeTile(context, key, 0, 0, CACHE_BADGE_CELL_SIZE);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

export const createCacheBadgeSpriteMaterial = (
  document: Document,
  key: CacheIconKey,
): {
  map: CanvasTexture;
  material: SpriteMaterial;
} => {
  const map = createCacheBadgeTexture(document, key);
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

export const getCacheIconKey = (contents: CacheContents): CacheIconKey =>
  contents.kind === "wildcard"
    ? contents.wildcard.kind === "gravityPulse"
      ? "wildcardGravityPulse"
      : "wildcardCloak"
    : contents.kind;
