import {
  ARENA_RADIUS,
  type CacheContents,
  mulberry32,
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
  pointUV,
  positionLocal,
  pow,
  screenUV,
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
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  MeshBasicNodeMaterial,
  Points,
  PointsNodeMaterial,
  SRGBColorSpace,
  SpriteMaterial,
  Vector3,
} from "three/webgpu";

export interface StarfieldLayerVisual {
  geometry: BufferGeometry;
  group: Group;
  material: PointsNodeMaterial;
  parallax: number;
  tileSize: number;
}

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

export interface PlanetGlowMaterialNodes {
  contactStartNode: ReturnType<typeof uniform>;
  fadeStartNode: ReturnType<typeof uniform>;
  material: MeshBasicNodeMaterial;
  riseEndNode: ReturnType<typeof uniform>;
  riseStartNode: ReturnType<typeof uniform>;
}

export const SCENE_BACKGROUND = new Color("#05070b");
export const SUN_GLOW_SCALE = 1.7;
export const SUN_WARP_SCALE = 3.2;
export const CACHE_BADGE_BASE_SIZE = 80;
export const STARFIELD_LAYERS = [
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
  "boostCharge",
  "shieldExt",
  "foresightExt",
  "wildcard",
] as const satisfies readonly CacheIconKey[];

const STARFIELD_RADIUS = ARENA_RADIUS * 2.35;
const STARFIELD_TILE_SIZE = STARFIELD_RADIUS * 2;
const CACHE_BADGE_CELL_SIZE = 160;

const FOREST_PROFILES: Record<
  string,
  {
    baseDensity: number;
    color: string;
  }
> = {
  terra: { baseDensity: 0.95, color: "#2c5a2a" },
  volans: { baseDensity: 0.55, color: "#1f6b5b" },
  umbra: { baseDensity: 0.4, color: "#3a2a52" },
};

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

export const createBackdropMaterial = (): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = mix(
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
  return material;
};

export const createPlanetSpinAxis = (seed: number): Vector3 => {
  const rng = mulberry32(Math.imul(seed + 1, 0x9e3779b1) >>> 0);
  const azimuth = rng() * Math.PI * 2;
  const y = -0.72 + rng() * 1.44;
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
): { color: string; density: number } => {
  const profile = FOREST_PROFILES[archetype];
  if (profile === undefined) {
    return { color: "#2c5a2a", density: 0 };
  }

  const jitter = mulberry32(Math.imul(planetId + 1, 0xc2b2ae35) >>> 0)();
  return {
    color: profile.color,
    density: Math.min(
      1,
      Math.max(0, profile.baseDensity * (0.6 + jitter * 0.7)),
    ),
  };
};

export const createRocketMaterial = (
  coreColor: string,
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

export const createRocketTrailMaterial = (
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

export const createRocketFlameMaterial = (): MeshBasicNodeMaterial => {
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

export const createPlanetMaterial = (
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
  const bodyBoundary = Math.min(0.975, Math.max(0.08, 1 / safeAuraScale));
  const normalizedGap = Math.max(0, auraGap) / safeAuraScale;
  const innerEdge = Math.min(
    0.985,
    Math.max(bodyBoundary, bodyBoundary + normalizedGap),
  );
  const innerFeather = Math.min(0.085, Math.max(0.02, 0.12 / safeAuraScale));
  const riseStart = Math.min(
    innerEdge - 0.001,
    Math.max(0.001, innerEdge - innerFeather * 0.9),
  );
  const contactStart = Math.min(
    riseStart - 0.001,
    Math.max(0.001, innerEdge - innerFeather * 1.95),
  );
  const remaining = Math.max(0.025, 1 - innerEdge);
  const riseEnd = innerEdge;
  const fadeStart = Math.min(
    0.995,
    Math.max(innerEdge + 0.02, innerEdge + remaining * 0.18),
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
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const outerGlow = tintColor(planetColor, -0.04, 0.04, 0.2);
  const innerGlow = tintColor(planetColor, -0.08, 0.1, 0.28);
  const seedNode = uniform(seed);
  const initialRingStops = getPlanetAuraRingStops(auraScale, auraGap);
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

export const createSunCoreMaterial = (
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

export const createSunGlowMaterial = (
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

export const createStarfieldLayer = (
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
    positions[offset] = (Math.random() - 0.5) * STARFIELD_TILE_SIZE;
    positions[offset + 1] = (Math.random() - 0.5) * STARFIELD_TILE_SIZE;
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
  contents.kind === "wildcard" ? "wildcard" : contents.kind;
