import {
  clamp,
  mulberry32,
  type ArchetypeId,
  type PlanetArchetypeVisualSpec,
  type PlanetTintOffsetTuning,
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
  type CircleGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  Points,
  PointsNodeMaterial,
  type RingGeometry,
  SRGBColorSpace,
  type Scene,
  Vector3,
} from "three/webgpu";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import { MAX_FORESIGHT_SAMPLES } from "./foresightShared";
const PLANET_EXPLOSION_CHUNK_COUNT = 12;
const getRuntimeVisuals = () => getRuntimeTuningDocument().visuals;
const getBoostColor = () => getRuntimeVisuals().abilities.boostColor;
const getPlanetMaterialTuning = () => getRuntimeVisuals().planets.material;
const getPlanetAuraTuning = () => getRuntimeVisuals().planets.aura;
const getPlanetVariationTuning = () => getRuntimeVisuals().planets.variation;

interface PlanetSurfaceMaterial extends MeshBasicNodeMaterial {
  opacityUniform: ReturnType<typeof uniform>;
}

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

const tintWithOffset = (value: string, offset: PlanetTintOffsetTuning): Color =>
  tintColor(value, offset.hue, offset.saturation, offset.lightness);

const getPlanetAuraRingStops = (
  auraScale: number,
  auraGap: number,
): {
  contactStart: number;
  fadeStart: number;
  riseEnd: number;
  riseStart: number;
} => {
  const auraTuning = getPlanetAuraTuning();
  const safeAuraScale = Math.max(auraScale, 0.001);
  const bodyBoundary = clamp(
    1 / safeAuraScale,
    auraTuning.bodyBoundaryMin,
    auraTuning.bodyBoundaryMax,
  );
  const normalizedGap = Math.max(0, auraGap) / safeAuraScale;
  const innerEdge = clamp(
    bodyBoundary + normalizedGap,
    bodyBoundary,
    auraTuning.innerEdgeMax,
  );
  const innerFeather = clamp(
    auraTuning.innerFeatherBase / safeAuraScale,
    auraTuning.innerFeatherMin,
    auraTuning.innerFeatherMax,
  );
  const riseStart = clamp(
    innerEdge - innerFeather * auraTuning.riseStartFeatherScale,
    0.001,
    innerEdge - 0.001,
  );
  const contactStart = clamp(
    innerEdge - innerFeather * auraTuning.contactFeatherScale,
    0.001,
    riseStart - 0.001,
  );
  const remaining = Math.max(auraTuning.minRemaining, 1 - innerEdge);
  const riseEnd = innerEdge;
  const fadeStart = clamp(
    innerEdge + remaining * auraTuning.fadeStartRemainingScale,
    innerEdge + auraTuning.fadeStartMinOffset,
    auraTuning.fadeStartMax,
  );

  return {
    contactStart,
    fadeStart,
    riseEnd,
    riseStart,
  };
};

const hidePlanetExplosionVisual = (visual: {
  chunkMaterials: readonly MeshBasicMaterial[];
  chunks: readonly { mesh: Mesh }[];
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  glowMaterial: MeshBasicMaterial;
  glowMesh: Mesh;
  group: Group;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
  shockwaveMaterial: MeshBasicMaterial;
  shockwaveMesh: Mesh;
}) => {
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

export const createPlanetSpinAxis = (seed: number): Vector3 => {
  const variationTuning = getPlanetVariationTuning();
  const rng = mulberry32(Math.imul(seed + 1, 0x9e3779b1) >>> 0);
  const azimuth = rng() * Math.PI * 2;
  // Keep the axis away from the poles so the tilt reads clearly on screen.
  const y =
    variationTuning.spinTiltMinY +
    rng() * (variationTuning.spinTiltMaxY - variationTuning.spinTiltMinY);
  const radial = Math.sqrt(Math.max(0.001, 1 - y * y));

  return new Vector3(
    Math.cos(azimuth) * radial,
    y,
    Math.sin(azimuth) * radial,
  ).normalize();
};

export const getPlanetForestProfile = (
  archetype: ArchetypeId,
  planetId: number,
): { color: string; coverage: number } => {
  const variationTuning = getPlanetVariationTuning();
  const archetypeProfiles = getRuntimeVisuals().planets.archetypes;
  const profile = archetypeProfiles[archetype];
  if (!profile) {
    return { color: "#2c5a2a", coverage: 0 };
  }
  const jitter = mulberry32(Math.imul(planetId + 1, 0xc2b2ae35) >>> 0)();
  const coverage = clamp(
    profile.forestCoverage *
      (variationTuning.forestDensityJitterMin +
        jitter *
          (variationTuning.forestDensityJitterMax -
            variationTuning.forestDensityJitterMin)),
    0,
    2,
  );
  return { color: profile.forestColor, coverage };
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

export const createRocketLaunchBurstMaterial = (
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

export const createForesightVisual = () => {
  const foresightTuning = getRuntimeVisuals().abilities.foresight;
  const lineGeometry = new BufferGeometry();
  const linePositions = new Float32Array(MAX_FORESIGHT_SAMPLES * 3);
  const linePositionAttribute = new Float32BufferAttribute(linePositions, 3);
  linePositionAttribute.setUsage(DynamicDrawUsage);
  lineGeometry.setAttribute("position", linePositionAttribute);
  lineGeometry.setDrawRange(0, 0);

  const lineMaterial = new LineBasicMaterial({
    color: foresightTuning.lineColor,
    depthWrite: false,
    opacity: foresightTuning.lineOpacity,
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

  const pointColorUniform = uniform(new Color(foresightTuning.dotColor));
  const pointOpacityUniform = uniform(foresightTuning.dotOpacity);
  const pointMaterial = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const foresightOpacityNode = attribute<"float">("foresightOpacity", "float");
  pointMaterial.colorNode = pointColorUniform;
  pointMaterial.opacityNode = foresightOpacityNode.mul(pointOpacityUniform);
  pointMaterial.size = foresightTuning.pointSize;
  pointMaterial.alphaTest = 0.01;

  const points = new Points(pointGeometry, pointMaterial);
  points.frustumCulled = false;
  points.renderOrder = 12;
  points.position.z = 4.2;
  points.visible = false;

  return {
    line,
    lineGeometry,
    lineMaterial,
    linePositionAttribute,
    pointGeometry,
    pointColorUniform,
    pointOpacityAttribute,
    pointOpacityUniform,
    pointMaterial,
    pointPositionAttribute,
    points,
  };
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
  const materialTuning = getPlanetMaterialTuning();
  const forestCoverage =
    forestProfile?.coverage ?? planetVisuals.forestCoverage;
  const forestColorHex = forestProfile?.color ?? planetVisuals.forestColor;
  const forestPatchScale = Math.max(0.001, planetVisuals.forestPatchSize);
  const forestAltitude = planetVisuals.forestAltitude;
  const forestBandStart = clamp(
    materialTuning.forestBandStart + forestAltitude,
    0,
    1,
  );
  const forestBandEnd = clamp(
    materialTuning.forestBandEnd + forestAltitude,
    0,
    1,
  );
  const forestFadeStart = clamp(
    materialTuning.forestFadeStart + forestAltitude,
    0,
    1,
  );
  const forestFadeEnd = clamp(
    materialTuning.forestFadeEnd + forestAltitude,
    0,
    1,
  );
  const forestClumpCoverageShift = (forestCoverage - 1) * 0.18;
  const forestClumpStart = clamp(
    materialTuning.forestClumpStart - forestClumpCoverageShift,
    0,
    1,
  );
  const forestClumpEnd = clamp(
    materialTuning.forestClumpEnd - forestClumpCoverageShift,
    0,
    1,
  );
  const forestOpacity = clamp(forestCoverage, 0, 1);

  const base = new Color(planetVisuals.color);
  const lowland = tintWithOffset(
    planetVisuals.color,
    materialTuning.lowlandTint,
  );
  const highland = tintWithOffset(
    planetVisuals.color,
    materialTuning.highlandTint,
  );
  const rock = tintWithOffset(planetVisuals.color, materialTuning.rockTint);
  const snow = tintWithOffset(planetVisuals.color, materialTuning.snowTint);
  const oceanDeep = new Color(planetVisuals.oceanDeepColor);
  const oceanShallow = new Color(planetVisuals.oceanShallowColor);
  const forestDark = new Color(forestColorHex);
  const forestLight = tintWithOffset(
    forestColorHex,
    materialTuning.forestLightTint,
  );

  const seedNode = uniform(seed);
  const dir = normalize(positionLocal);
  const seedOffset = vec3(
    seedNode.mul(3.7),
    seedNode.mul(1.9),
    seedNode.mul(5.3),
  );

  const continents = mx_fractal_noise_float(
    dir
      .mul(materialTuning.continentsScale * planetVisuals.continentsScale)
      .add(seedOffset),
    materialTuning.continentsOctaves,
    materialTuning.continentsLacunarity,
    materialTuning.continentsGain,
    1,
  )
    .mul(0.5)
    .add(0.5);

  const mountains = mx_fractal_noise_float(
    dir
      .mul(materialTuning.mountainsScale * planetVisuals.mountainsScale)
      .add(vec3(seedNode.mul(7.1), seedNode.mul(2.4), seedNode.mul(9.7))),
    materialTuning.mountainsOctaves,
    materialTuning.mountainsLacunarity,
    materialTuning.mountainsGain,
    1,
  )
    .mul(0.5)
    .add(0.5);

  const detail = mx_cell_noise_float(
    dir
      .mul(materialTuning.detailScale)
      .add(vec3(seedNode.mul(4.2), seedNode.mul(6.1), seedNode.mul(2.7))),
  )
    .mul(0.5)
    .add(0.5);

  const landMask = smoothstep(
    materialTuning.landMaskStart,
    materialTuning.landMaskEnd,
    continents,
  );
  const height = mix(
    continents.mul(materialTuning.heightOceanScale),
    continents
      .mul(materialTuning.heightLandScale)
      .add(
        mountains.mul(
          materialTuning.mountainHeightContribution *
            planetVisuals.mountainHeight,
        ),
      ),
    landMask,
  );

  const aboveSea = max(height.sub(planetVisuals.seaLevel), float(0));
  const displacement = aboveSea.mul(materialTuning.displacementBudget);
  material.positionNode = positionLocal
    .mul(materialTuning.baseRadius)
    .add(dir.mul(displacement));

  const landElevation = smoothstep(
    materialTuning.landElevationStart,
    materialTuning.landElevationEnd,
    height,
  );

  const oceanDepthMask = smoothstep(
    materialTuning.oceanDepthStart,
    materialTuning.oceanDepthEnd,
    height,
  );
  const oceanCol = mix(color(oceanShallow), color(oceanDeep), oceanDepthMask);

  const forestTint = mix(color(lowland), color(base), detail);
  const lowToHigh = mix(
    forestTint,
    color(highland),
    smoothstep(
      materialTuning.highlandStart,
      materialTuning.highlandEnd,
      landElevation,
    ),
  );
  const highToRock = mix(
    lowToHigh,
    color(rock),
    smoothstep(materialTuning.rockStart, materialTuning.rockEnd, landElevation),
  );
  const snowCapped = mix(
    highToRock,
    color(snow),
    smoothstep(materialTuning.snowStart, materialTuning.snowEnd, landElevation),
  );

  const forestClumps = mx_cell_noise_float(
    dir
      .mul(materialTuning.forestClumpScale / forestPatchScale)
      .add(vec3(seedNode.mul(8.3), seedNode.mul(3.6), seedNode.mul(5.9))),
  )
    .mul(0.5)
    .add(0.5);
  const forestSpeckle = mx_cell_noise_float(
    dir
      .mul(materialTuning.forestSpeckleScale / Math.sqrt(forestPatchScale))
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

  const coastBlend = smoothstep(
    materialTuning.coastStart,
    materialTuning.coastEnd,
    height,
  );
  const surfaceBase = mix(oceanCol, landCol, coastBlend);

  const latitude = abs(dir.y);
  const polarMask = smoothstep(
    materialTuning.polarStart,
    materialTuning.polarEnd,
    latitude.add(mountains.mul(materialTuning.polarMountainInfluence)),
  );
  const surfaceColor = mix(surfaceBase, color(snow), polarMask);

  const lightDir = normalize(
    vec3(
      materialTuning.lightDirection.x,
      materialTuning.lightDirection.y,
      materialTuning.lightDirection.z,
    ),
  );
  const worldNormal = normalize(normalWorld);
  const nDotL = max(dot(worldNormal, lightDir), float(0));
  const lambert = smoothstep(float(0), float(1), nDotL);
  const shading = mix(
    float(materialTuning.lambertMin),
    float(materialTuning.lambertMax),
    lambert,
  );
  const heightAO = mix(
    float(materialTuning.aoMin),
    float(materialTuning.aoMax),
    landElevation,
  );

  const viewFacing = max(dot(worldNormal, vec3(0, 0, 1)), float(0));
  const rim = pow(float(1).sub(viewFacing), materialTuning.rimPower).mul(
    materialTuning.rimStrength,
  );
  const edgeOutline = smoothstep(0.2, 0.04, viewFacing).mul(
    materialTuning.edgeOutlineStrength,
  );
  const rimTint = mix(
    color(snow),
    color(base),
    float(materialTuning.rimTintBlend),
  );

  material.colorNode = surfaceColor
    .mul(shading)
    .mul(heightAO)
    .add(rimTint.mul(rim.add(edgeOutline)));

  return material;
};

export const createPlanetGlowMaterial = (
  planetColor: string,
  seed: number,
  auraScale: number,
  auraGap: number,
) => {
  const opacityUniform = uniform(1);
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const auraTuning = getPlanetAuraTuning();
  const outerGlow = tintWithOffset(planetColor, auraTuning.glowOuterTint);
  const innerGlow = tintWithOffset(planetColor, auraTuning.glowInnerTint);
  const seedNode = uniform(seed);
  const initialRingStops = getPlanetAuraRingStops(auraScale, auraGap);
  const contactStartNode = uniform(initialRingStops.contactStart);
  const riseStartNode = uniform(initialRingStops.riseStart);
  const riseEndNode = uniform(initialRingStops.riseEnd);
  const fadeStartNode = uniform(initialRingStops.fadeStart);
  const radial = length(positionLocal.xy);
  const pulse = sin(
    time
      .mul(auraTuning.pulseFrequency)
      .add(seedNode.mul(auraTuning.pulseSeedPhase)),
  )
    .mul(auraTuning.pulseAmplitude)
    .add(auraTuning.pulseBase);
  const haloInnerFade = smoothstep(contactStartNode, riseEndNode, radial);
  const haloEnvelope = pow(
    float(1).sub(smoothstep(riseEndNode, 1, radial)),
    float(auraTuning.haloEnvelopePower),
  );
  const haloTail = float(1)
    .sub(smoothstep(fadeStartNode, 1, radial))
    .mul(auraTuning.haloTailScale)
    .add(auraTuning.haloTailBias);
  const haloMask = haloInnerFade.mul(haloEnvelope).mul(haloTail);
  const haloBlend = smoothstep(riseEndNode, 1, radial);

  material.fragmentNode = vec4(
    mix(color(innerGlow), color(outerGlow), haloBlend)
      .mul(haloMask)
      .mul(pulse)
      .mul(opacityUniform)
      .mul(auraTuning.brightness),
    haloMask.mul(auraTuning.alpha).mul(pulse).mul(opacityUniform),
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

export const createPlanetExplosionVisual = (
  scene: Scene,
  flashGeometry: CircleGeometry,
  ringGeometry: RingGeometry,
  fragmentGeometries: readonly BufferGeometry[],
) => {
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
      };
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
  };
  hidePlanetExplosionVisual(visual);
  return visual;
};

export const createBoostWakeMaterial = () => {
  const boostColor = getBoostColor();
  const hotGlow = tintColor(boostColor, -0.03, -0.05, 0.28);
  const coolGlow = tintColor(boostColor, 0.01, 0.03, -0.04);
  const canvas = globalThis.document?.createElement("canvas") ?? null;
  let texture: CanvasTexture | null = null;

  if (canvas !== null) {
    canvas.width = 96;
    canvas.height = 28;
    const context = canvas.getContext("2d");

    if (context !== null) {
      context.clearRect(0, 0, canvas.width, canvas.height);

      const colorGradient = context.createLinearGradient(0, 0, canvas.width, 0);
      colorGradient.addColorStop(0, hotGlow.getStyle());
      colorGradient.addColorStop(0.34, new Color(boostColor).getStyle());
      colorGradient.addColorStop(1, coolGlow.getStyle());
      context.fillStyle = colorGradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.globalCompositeOperation = "destination-in";

      const headGradient = context.createLinearGradient(0, 0, canvas.width, 0);
      headGradient.addColorStop(0, "rgba(255,255,255,0)");
      headGradient.addColorStop(0.08, "rgba(255,255,255,0.88)");
      headGradient.addColorStop(0.26, "rgba(255,255,255,1)");
      headGradient.addColorStop(0.72, "rgba(255,255,255,0.28)");
      headGradient.addColorStop(0.9, "rgba(255,255,255,0.08)");
      headGradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = headGradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      const verticalGradient = context.createLinearGradient(
        0,
        0,
        0,
        canvas.height,
      );
      verticalGradient.addColorStop(0, "rgba(255,255,255,0)");
      verticalGradient.addColorStop(0.16, "rgba(255,255,255,0.28)");
      verticalGradient.addColorStop(0.5, "rgba(255,255,255,1)");
      verticalGradient.addColorStop(0.84, "rgba(255,255,255,0.28)");
      verticalGradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = verticalGradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
    }
  }

  const material = new MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    color: texture === null ? boostColor : "#ffffff",
    map: texture ?? undefined,
    opacity: 0,
  });

  return {
    material,
    texture,
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

export const createBlackHoleCoreMaterial = (): MeshBasicNodeMaterial => {
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

export const createBlackHoleRingMaterial = (): MeshBasicNodeMaterial => {
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
      .add(vec2(time.mul(0.28).mul(0.75), time.mul(0.18).mul(-0.55))),
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

export const createBlackHoleLensMaterial = (): MeshBasicNodeMaterial => {
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
    screenUV
      .add(normalize(localPos).mul(warpStrength))
      .clamp(vec2(0.001, 0.001), vec2(0.999, 0.999)),
  );

  material.fragmentNode = vec4(sampledScene.rgb, warpMask.mul(0.55));

  return material;
};

export const createNeutronStarCoreMaterial = (
  seed: number,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  const deep = color("#16325d");
  const cool = color("#63cfff");
  const hot = color("#f7fcff");
  const seedNode = uniform(seed);
  const spherePos = normalize(positionLocal);
  const timeNode = time.mul(0.42).add(seedNode.mul(3.1));
  const turbulence = mx_fractal_noise_float(
    spherePos
      .mul(7.2)
      .add(vec3(seedNode.mul(5.2), timeNode.mul(0.88), timeNode.mul(-0.64))),
    5,
    2.2,
    0.56,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const magneticBands = sin(
    spherePos.y.mul(36).add(turbulence.mul(10.2)).add(timeNode.mul(1.8)),
  )
    .mul(0.5)
    .add(0.5);
  const hotspot = smoothstep(
    0.52,
    0.98,
    turbulence.add(magneticBands.mul(0.38)),
  );
  const rim = pow(
    max(float(1).sub(dot(spherePos, vec3(0, 0, 1))), 0),
    1.75,
  ).mul(0.78);
  const pulse = sin(timeNode.mul(2.8)).mul(0.12).add(0.94);

  material.colorNode = mix(mix(deep, cool, turbulence), hot, hotspot)
    .mul(pulse.add(rim))
    .mul(1.9);

  return material;
};

export const createNeutronStarHaloMaterial = (
  seed: number,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const localPos = positionLocal.xy;
  const radial = length(localPos);
  const seedNode = uniform(seed);
  const timeNode = time.mul(0.34).add(seedNode.mul(2.1));
  const turbulence = mx_fractal_noise_float(
    localPos
      .mul(4.8)
      .toVar()
      .add(vec2(seedNode.mul(2.4), timeNode.mul(0.68))),
    4,
    2.05,
    0.58,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const innerFade = smoothstep(0.08, 0.48, radial);
  const outerFade = float(1).sub(smoothstep(0.56, 1, radial));
  const halo = innerFade.mul(outerFade).mul(turbulence.mul(0.62).add(0.38));

  material.fragmentNode = vec4(
    mix(color("#56c8ff"), color("#c9f4ff"), turbulence).mul(halo.mul(2.6)),
    halo.mul(0.82),
  );

  return material;
};

export const createNeutronStarJetMaterial = (
  seed: number,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const localPos = positionLocal.xy;
  const seedNode = uniform(seed);
  const timeNode = time.mul(0.52).add(seedNode.mul(1.7));
  const axial = abs(localPos.y).mul(2);
  const width = abs(localPos.x).mul(2);
  const turbulence = mx_fractal_noise_float(
    vec2(localPos.y.mul(12).add(timeNode), localPos.x.mul(8).add(seedNode)),
    3,
    2.1,
    0.55,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const widthLimit = mix(0.42, 0.08, smoothstep(0, 1, axial));
  const beam = float(1)
    .sub(smoothstep(widthLimit.mul(0.24), widthLimit, width))
    .mul(float(1).sub(smoothstep(0.04, 1, axial)))
    .mul(turbulence.mul(0.46).add(0.54));

  material.fragmentNode = vec4(
    mix(color("#5fd0ff"), color("#f8ffff"), float(1).sub(width.mul(0.8))).mul(
      beam.mul(2.4),
    ),
    beam.mul(0.78),
  );

  return material;
};

export const createNeutronStarLensMaterial = (
  seed: number,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  const localPos = positionLocal.xy;
  const radial = max(length(localPos), 0.001);
  const seedNode = uniform(seed);
  const timeNode = time.mul(0.24).add(seedNode.mul(1.1));
  const ringMask = smoothstep(0.18, 0.52, radial).mul(
    float(1).sub(smoothstep(0.88, 1, radial)),
  );
  const turbulence = mx_fractal_noise_float(
    localPos
      .mul(5.4)
      .toVar()
      .add(vec2(seedNode.mul(1.8), timeNode.mul(-0.42))),
    3,
    2,
    0.56,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const warpStrength = ringMask
    .mul(0.022)
    .mul(turbulence.mul(0.72).add(0.4))
    .div(radial.mul(radial).add(0.09));
  const sampledScene = viewportSharedTexture(
    screenUV
      .add(normalize(localPos).mul(warpStrength))
      .clamp(vec2(0.001, 0.001), vec2(0.999, 0.999)),
  );

  material.fragmentNode = vec4(
    mix(sampledScene.rgb, color("#6ad3ff"), ringMask.mul(turbulence).mul(0.18)),
    ringMask.mul(turbulence.mul(0.58).add(0.24)).mul(0.34),
  );

  return material;
};
