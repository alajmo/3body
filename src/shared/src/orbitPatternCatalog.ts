import { G } from "./constants";
import type { Sun } from "./entities";
import { BAKED_ORBIT_PATTERN_IDS } from "./orbitPatternTrackData.generated";
import type { Vec2 } from "./vec2";

export interface OrbitPatternNormalizedSunSeed {
  pos: Vec2;
  vel: Vec2;
}

export interface OrbitPatternParametricCircleSunSpec {
  kind: "circle";
  phaseOffset?: number;
  radius: number;
}

export interface OrbitPatternParametricBloomSunSpec {
  kind: "bloom";
  bloomAspect?: number;
  bloomPhase?: number;
  bloomRadius: number;
  orbitRadius: number;
  phaseOffset?: number;
  petalCount: number;
  rotationScale?: number;
}

export type OrbitPatternParametricSunSpec =
  | OrbitPatternParametricCircleSunSpec
  | OrbitPatternParametricBloomSunSpec;

export interface OrbitPatternParametricTrackDefinition {
  periodSec: number;
  sampleCount: number;
  suns: readonly [
    OrbitPatternParametricSunSpec,
    OrbitPatternParametricSunSpec,
    OrbitPatternParametricSunSpec,
  ];
}

export interface OrbitPatternCatalogEntry {
  canonicalMass: number;
  canonicalRadius: number;
  eccentricity?: number;
  id: string;
  label: string;
  normalizedSuns: readonly [
    OrbitPatternNormalizedSunSeed,
    OrbitPatternNormalizedSunSeed,
    OrbitPatternNormalizedSunSeed,
  ];
  parametricTrack?: OrbitPatternParametricTrackDefinition;
  trackMode?:
    | "analyticEquilateralCircle"
    | "analyticLagrangeEllipse"
    | "analyticParametric";
  worldScale: number;
}

interface EqualMassPeriodicPatternSeed {
  canonicalMass?: number;
  canonicalRadius?: number;
  id: string;
  label: string;
  p1: number;
  p2: number;
  worldScale: number;
}

const DEFAULT_CANONICAL_MASS = 120_000;
const DEFAULT_CANONICAL_RADIUS = 32;
const EQUILATERAL_CIRCLE_NORMALIZED_SPEED = 1 / 3 ** 0.25;
const LAGRANGE_ELLIPSE_NORMALIZED_MU = 1 / Math.sqrt(3);
const TAU = Math.PI * 2;

const rotateNormalizedVec2 = (value: Vec2, angle: number): Vec2 => ({
  x: value.x * Math.cos(angle) - value.y * Math.sin(angle),
  y: value.x * Math.sin(angle) + value.y * Math.cos(angle),
});

const createEquilateralCircleNormalizedSun = (
  index: 0 | 1 | 2,
): OrbitPatternNormalizedSunSeed => {
  const angle = (Math.PI * 2 * index) / 3;
  const tangentAngle = angle + Math.PI / 2;

  return {
    pos: {
      x: Math.cos(angle),
      y: Math.sin(angle),
    },
    vel: {
      x: Math.cos(tangentAngle) * EQUILATERAL_CIRCLE_NORMALIZED_SPEED,
      y: Math.sin(tangentAngle) * EQUILATERAL_CIRCLE_NORMALIZED_SPEED,
    },
  };
};

const createLagrangeEllipseNormalizedSun = (
  index: 0 | 1 | 2,
  eccentricity: number,
): OrbitPatternNormalizedSunSeed => {
  const angle = (Math.PI * 2 * index) / 3;
  const periapsisRadius = 1 - eccentricity;
  const periapsisSpeed =
    Math.sqrt(LAGRANGE_ELLIPSE_NORMALIZED_MU) *
    Math.sqrt((1 + eccentricity) / Math.max(1 - eccentricity, 0.0001));

  return {
    pos: rotateNormalizedVec2({ x: periapsisRadius, y: 0 }, angle),
    vel: rotateNormalizedVec2({ x: 0, y: periapsisSpeed }, angle),
  };
};

export const scaleOrbitPatternVelocity = (
  normalizedVelocity: Vec2,
  mass: number,
  worldScale: number,
): Vec2 => {
  const velocityScale = Math.sqrt((G * mass) / worldScale);

  return {
    x: normalizedVelocity.x * velocityScale,
    y: normalizedVelocity.y * velocityScale,
  };
};

const createParametricCircleSample = (
  theta: number,
  angularSpeed: number,
  spec: OrbitPatternParametricCircleSunSpec,
): OrbitPatternNormalizedSunSeed => {
  const angle = theta + (spec.phaseOffset ?? 0);

  return {
    pos: {
      x: Math.cos(angle) * spec.radius,
      y: Math.sin(angle) * spec.radius,
    },
    vel: {
      x: -Math.sin(angle) * spec.radius * angularSpeed,
      y: Math.cos(angle) * spec.radius * angularSpeed,
    },
  };
};

const createParametricBloomSample = (
  theta: number,
  angularSpeed: number,
  spec: OrbitPatternParametricBloomSunSpec,
): OrbitPatternNormalizedSunSeed => {
  const baseAngle = theta * (spec.rotationScale ?? 1) + (spec.phaseOffset ?? 0);
  const bloomAngle = theta * spec.petalCount + (spec.bloomPhase ?? 0);
  const baseAngularSpeed = (spec.rotationScale ?? 1) * angularSpeed;
  const bloomAngularSpeed = spec.petalCount * angularSpeed;
  const bloomAspect = spec.bloomAspect ?? 0.72;
  const radialUnit = {
    x: Math.cos(baseAngle),
    y: Math.sin(baseAngle),
  };
  const tangentUnit = {
    x: -Math.sin(baseAngle),
    y: Math.cos(baseAngle),
  };
  const radialOffset = Math.cos(bloomAngle) * spec.bloomRadius;
  const tangentOffset = Math.sin(bloomAngle) * spec.bloomRadius * bloomAspect;
  const radialOffsetVelocity =
    -Math.sin(bloomAngle) * spec.bloomRadius * bloomAngularSpeed;
  const tangentOffsetVelocity =
    Math.cos(bloomAngle) * spec.bloomRadius * bloomAspect * bloomAngularSpeed;
  const resolvedOrbitRadius = spec.orbitRadius + radialOffset;

  return {
    pos: {
      x: radialUnit.x * resolvedOrbitRadius + tangentUnit.x * tangentOffset,
      y: radialUnit.y * resolvedOrbitRadius + tangentUnit.y * tangentOffset,
    },
    vel: {
      x:
        radialUnit.x *
          (radialOffsetVelocity - tangentOffset * baseAngularSpeed) +
        tangentUnit.x *
          (resolvedOrbitRadius * baseAngularSpeed + tangentOffsetVelocity),
      y:
        radialUnit.y *
          (radialOffsetVelocity - tangentOffset * baseAngularSpeed) +
        tangentUnit.y *
          (resolvedOrbitRadius * baseAngularSpeed + tangentOffsetVelocity),
    },
  };
};

const createParametricSunSample = (
  theta: number,
  angularSpeed: number,
  spec: OrbitPatternParametricSunSpec,
): OrbitPatternNormalizedSunSeed =>
  spec.kind === "circle"
    ? createParametricCircleSample(theta, angularSpeed, spec)
    : createParametricBloomSample(theta, angularSpeed, spec);

const createParametricTrackNormalizedSuns = (
  parametricTrack: OrbitPatternParametricTrackDefinition,
  canonicalMass: number,
  worldScale: number,
): OrbitPatternCatalogEntry["normalizedSuns"] => {
  const angularSpeed = TAU / Math.max(parametricTrack.periodSec, 0.0001);
  const velocityScale = Math.sqrt((G * canonicalMass) / worldScale);
  const normalizeSample = (
    spec: OrbitPatternParametricSunSpec,
  ): OrbitPatternNormalizedSunSeed => {
    const sample = createParametricSunSample(0, angularSpeed, spec);

    return {
      pos: {
        x: sample.pos.x / worldScale,
        y: sample.pos.y / worldScale,
      },
      vel: {
        x: sample.vel.x / velocityScale,
        y: sample.vel.y / velocityScale,
      },
    };
  };

  return [
    normalizeSample(parametricTrack.suns[0]),
    normalizeSample(parametricTrack.suns[1]),
    normalizeSample(parametricTrack.suns[2]),
  ];
};

const createEqualMassPeriodicPattern = ({
  canonicalMass = DEFAULT_CANONICAL_MASS,
  canonicalRadius = DEFAULT_CANONICAL_RADIUS,
  id,
  label,
  p1,
  p2,
  worldScale,
}: EqualMassPeriodicPatternSeed): OrbitPatternCatalogEntry => ({
  canonicalMass,
  canonicalRadius,
  id,
  label,
  normalizedSuns: [
    {
      pos: { x: -1, y: 0 },
      vel: { x: p1, y: p2 },
    },
    {
      pos: { x: 0, y: 0 },
      vel: { x: -2 * p1, y: -2 * p2 },
    },
    {
      pos: { x: 1, y: 0 },
      vel: { x: p1, y: p2 },
    },
  ],
  worldScale,
});

const createEquilateralCirclePattern = ({
  canonicalMass = DEFAULT_CANONICAL_MASS,
  canonicalRadius = DEFAULT_CANONICAL_RADIUS,
  id,
  label,
  worldScale,
}: Omit<
  EqualMassPeriodicPatternSeed,
  "p1" | "p2"
>): OrbitPatternCatalogEntry => ({
  canonicalMass,
  canonicalRadius,
  id,
  label,
  normalizedSuns: [
    createEquilateralCircleNormalizedSun(0),
    createEquilateralCircleNormalizedSun(1),
    createEquilateralCircleNormalizedSun(2),
  ],
  trackMode: "analyticEquilateralCircle",
  worldScale,
});

const createLagrangeEllipsePattern = ({
  canonicalMass = DEFAULT_CANONICAL_MASS,
  canonicalRadius = DEFAULT_CANONICAL_RADIUS,
  eccentricity,
  id,
  label,
  worldScale,
}: Omit<EqualMassPeriodicPatternSeed, "p1" | "p2"> & {
  eccentricity: number;
}): OrbitPatternCatalogEntry => ({
  canonicalMass,
  canonicalRadius,
  eccentricity,
  id,
  label,
  normalizedSuns: [
    createLagrangeEllipseNormalizedSun(0, eccentricity),
    createLagrangeEllipseNormalizedSun(1, eccentricity),
    createLagrangeEllipseNormalizedSun(2, eccentricity),
  ],
  trackMode: "analyticLagrangeEllipse",
  worldScale,
});

const createParametricPattern = ({
  canonicalMass = DEFAULT_CANONICAL_MASS,
  canonicalRadius = DEFAULT_CANONICAL_RADIUS,
  id,
  label,
  parametricTrack,
  worldScale,
}: Omit<EqualMassPeriodicPatternSeed, "p1" | "p2"> & {
  parametricTrack: OrbitPatternParametricTrackDefinition;
}): OrbitPatternCatalogEntry => ({
  canonicalMass,
  canonicalRadius,
  id,
  label,
  normalizedSuns: createParametricTrackNormalizedSuns(
    parametricTrack,
    canonicalMass,
    worldScale,
  ),
  parametricTrack,
  trackMode: "analyticParametric",
  worldScale,
});

export const SPECIAL_PERIODIC_ORBIT_PATTERNS: readonly OrbitPatternCatalogEntry[] =
  [
    createEqualMassPeriodicPattern({
      id: "figure-eight-v1a",
      label: "Figure-Eight (V.1.A)",
      p1: 0.347113,
      p2: 0.532727,
      worldScale: 760,
    }),
    createEquilateralCirclePattern({
      id: "equilateral-circle",
      label: "Equilateral Circle",
      worldScale: 900,
    }),
    createLagrangeEllipsePattern({
      eccentricity: 0.45,
      id: "lagrange-ellipse",
      label: "Lagrange Ellipse",
      worldScale: 980,
    }),
    createParametricPattern({
      id: "clover-3",
      label: "Clover-3",
      parametricTrack: {
        periodSec: 22,
        sampleCount: 330,
        suns: [
          {
            bloomPhase: 0.28,
            bloomRadius: 118,
            kind: "bloom",
            orbitRadius: 645,
            petalCount: 3,
            phaseOffset: 0.12,
          },
          {
            bloomPhase: TAU / 3 + 0.28,
            bloomRadius: 118,
            kind: "bloom",
            orbitRadius: 645,
            petalCount: 3,
            phaseOffset: TAU / 3 + 0.12,
          },
          {
            bloomPhase: (TAU * 2) / 3 + 0.28,
            bloomRadius: 118,
            kind: "bloom",
            orbitRadius: 645,
            petalCount: 3,
            phaseOffset: (TAU * 2) / 3 + 0.12,
          },
        ],
      },
      worldScale: 760,
    }),
    createParametricPattern({
      id: "sunflower-5",
      label: "Sunflower-5",
      parametricTrack: {
        periodSec: 28,
        sampleCount: 420,
        suns: [
          {
            kind: "circle",
            phaseOffset: 0.28,
            radius: 520,
          },
          {
            bloomAspect: 0.52,
            bloomPhase: 0.18,
            bloomRadius: 104,
            kind: "bloom",
            orbitRadius: 790,
            petalCount: 5,
            phaseOffset: 0.42,
            rotationScale: 0.98,
          },
          {
            bloomAspect: 0.52,
            bloomPhase: Math.PI / 5 + 0.18,
            bloomRadius: 104,
            kind: "bloom",
            orbitRadius: 790,
            petalCount: 5,
            phaseOffset: Math.PI + 0.42,
            rotationScale: 0.98,
          },
        ],
      },
      worldScale: 900,
    }),
    createParametricPattern({
      id: "daisy-6",
      label: "Daisy-6",
      parametricTrack: {
        periodSec: 26,
        sampleCount: 390,
        suns: [
          {
            kind: "circle",
            phaseOffset: -0.18,
            radius: 470,
          },
          {
            bloomAspect: 0.48,
            bloomPhase: 0.12,
            bloomRadius: 82,
            kind: "bloom",
            orbitRadius: 708,
            petalCount: 6,
            phaseOffset: 0.06,
            rotationScale: 1,
          },
          {
            bloomAspect: 0.48,
            bloomPhase: Math.PI + 0.12,
            bloomRadius: 82,
            kind: "bloom",
            orbitRadius: 708,
            petalCount: 6,
            phaseOffset: Math.PI + 0.06,
            rotationScale: 1,
          },
        ],
      },
      worldScale: 790,
    }),
    createParametricPattern({
      id: "lotus-twin",
      label: "Lotus Twin",
      parametricTrack: {
        periodSec: 25,
        sampleCount: 480,
        suns: [
          {
            kind: "circle",
            phaseOffset: 0.5,
            radius: 430,
          },
          {
            bloomAspect: 0.58,
            bloomPhase: 0.3,
            bloomRadius: 112,
            kind: "bloom",
            orbitRadius: 760,
            petalCount: 4,
            phaseOffset: 0.24,
            rotationScale: 0.88,
          },
          {
            bloomAspect: 0.58,
            bloomPhase: Math.PI + 0.3,
            bloomRadius: 112,
            kind: "bloom",
            orbitRadius: 760,
            petalCount: 4,
            phaseOffset: Math.PI + 0.24,
            rotationScale: 0.88,
          },
        ],
      },
      worldScale: 880,
    }),
    createParametricPattern({
      id: "crown-orbit",
      label: "Crown Orbit",
      parametricTrack: {
        periodSec: 27,
        sampleCount: 420,
        suns: [
          {
            bloomAspect: 0.56,
            bloomPhase: 0.22,
            bloomRadius: 84,
            kind: "bloom",
            orbitRadius: 655,
            petalCount: 3,
            phaseOffset: 0.08,
            rotationScale: 0.9,
          },
          {
            bloomAspect: 0.56,
            bloomPhase: TAU / 3 + 0.22,
            bloomRadius: 84,
            kind: "bloom",
            orbitRadius: 655,
            petalCount: 3,
            phaseOffset: TAU / 3 + 0.08,
            rotationScale: 0.9,
          },
          {
            bloomAspect: 0.56,
            bloomPhase: (TAU * 2) / 3 + 0.22,
            bloomRadius: 84,
            kind: "bloom",
            orbitRadius: 655,
            petalCount: 3,
            phaseOffset: (TAU * 2) / 3 + 0.08,
            rotationScale: 0.9,
          },
        ],
      },
      worldScale: 740,
    }),
    createEqualMassPeriodicPattern({
      id: "butterfly-i-i2a",
      label: "Butterfly I (I.2.A)",
      p1: 0.306893,
      p2: 0.125507,
      worldScale: 990,
    }),
    createEqualMassPeriodicPattern({
      id: "butterfly-ii-i2b",
      label: "Butterfly II (I.2.B)",
      p1: 0.392955,
      p2: 0.097579,
      worldScale: 970,
    }),
    createEqualMassPeriodicPattern({
      id: "bumblebee-ii11a",
      label: "Bumblebee (II.11.A)",
      p1: 0.184279,
      p2: 0.587188,
      worldScale: 840,
    }),
    createEqualMassPeriodicPattern({
      id: "butterfly-iii-ivb3a",
      label: "Butterfly III (IVb.3.A)",
      p1: 0.405916,
      p2: 0.230163,
      worldScale: 840,
    }),
    createEqualMassPeriodicPattern({
      id: "moth-iii-ivc5a",
      label: "Moth III (IVc.5.A)",
      p1: 0.383444,
      p2: 0.377364,
      worldScale: 830,
    }),
    createEqualMassPeriodicPattern({
      id: "goggles-prl",
      label: "Goggles",
      p1: 0.0833,
      p2: 0.12789,
      worldScale: 1020,
    }),
    createEqualMassPeriodicPattern({
      id: "butterfly-iv-ivb24a",
      label: "Butterfly IV (IVb.24.A)",
      p1: 0.350112,
      p2: 0.079339,
      worldScale: 810,
    }),
    createEqualMassPeriodicPattern({
      id: "yarn-prl",
      label: "Yarn",
      p1: 0.55906,
      p2: 0.34919,
      worldScale: 690,
    }),
    createEqualMassPeriodicPattern({
      id: "yin-yang-i-alpha-iii3a-alpha",
      label: "Yin-Yang I alpha (III.3.A)",
      p1: 0.513918,
      p2: 0.304736,
      worldScale: 940,
    }),
    createEqualMassPeriodicPattern({
      id: "yin-yang-i-beta-iii3a-beta",
      label: "Yin-Yang I beta (III.3.A)",
      p1: 0.282699,
      p2: 0.327209,
      worldScale: 890,
    }),
    createEqualMassPeriodicPattern({
      id: "yin-yang-ii-alpha-iii12a-alpha",
      label: "Yin-Yang II alpha (III.12.A)",
      p1: 0.416822,
      p2: 0.330333,
      worldScale: 760,
    }),
    createEqualMassPeriodicPattern({
      id: "yin-yang-ii-beta-iii12a-beta",
      label: "Yin-Yang II beta (III.12.A)",
      p1: 0.417343,
      p2: 0.3131,
      worldScale: 750,
    }),
    createEqualMassPeriodicPattern({
      id: "dragonfly-ii6a",
      label: "Dragonfly II.6.A",
      p1: 0.186238,
      p2: 0.578713,
      worldScale: 740,
    }),
    createEqualMassPeriodicPattern({
      id: "dragonfly-ii8a",
      label: "Dragonfly II.8.A",
      p1: 0.144812,
      p2: 0.542898,
      worldScale: 760,
    }),
    createEqualMassPeriodicPattern({
      id: "yin-yang-iii9a-alpha",
      label: "Yin-Yang III.9.A alpha",
      p1: 0.51315,
      p2: 0.289437,
      worldScale: 710,
    }),
    createEqualMassPeriodicPattern({
      id: "yin-yang-iii9a-beta",
      label: "Yin-Yang III.9.A beta",
      p1: 0.276237,
      p2: 0.331714,
      worldScale: 700,
    }),
  ];

export const DEFAULT_FIXED_ORBIT_PATTERN = SPECIAL_PERIODIC_ORBIT_PATTERNS[0]!;

export const ORBIT_PATTERN_BY_ID = new Map(
  SPECIAL_PERIODIC_ORBIT_PATTERNS.map(
    (pattern) => [pattern.id, pattern] as const,
  ),
);

const BAKED_ORBIT_PATTERN_ID_SET = new Set<string>(BAKED_ORBIT_PATTERN_IDS);

export const EDITOR_FIXED_ORBIT_PATTERNS =
  SPECIAL_PERIODIC_ORBIT_PATTERNS.filter((pattern) =>
    BAKED_ORBIT_PATTERN_ID_SET.has(pattern.id),
  );

export const isEditorFixedOrbitPatternId = (patternId: string): boolean =>
  BAKED_ORBIT_PATTERN_ID_SET.has(patternId);

export const resolveEditorFixedOrbitPatternId = (patternId: string): string =>
  isEditorFixedOrbitPatternId(patternId)
    ? patternId
    : DEFAULT_FIXED_ORBIT_PATTERN.id;

export const getOrbitPatternCatalogEntry = (
  patternId: string,
): OrbitPatternCatalogEntry =>
  ORBIT_PATTERN_BY_ID.get(patternId) ?? DEFAULT_FIXED_ORBIT_PATTERN;

export const createOrbitPatternCanonicalSuns = (
  pattern: OrbitPatternCatalogEntry,
): [Sun, Sun, Sun] =>
  pattern.normalizedSuns.map((sun, index) => ({
    id: index + 1,
    kind: "sun",
    mass: pattern.canonicalMass,
    radius: pattern.canonicalRadius,
    pos: {
      x: sun.pos.x * pattern.worldScale,
      y: sun.pos.y * pattern.worldScale,
    },
    vel: scaleOrbitPatternVelocity(
      sun.vel,
      pattern.canonicalMass,
      pattern.worldScale,
    ),
  })) as [Sun, Sun, Sun];
