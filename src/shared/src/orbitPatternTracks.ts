import { FIXED_STEP_SEC, G } from "./constants";
import type { BlackHole, Sun, WorldOrbitStarMotion } from "./entities";
import {
  createOrbitPatternCanonicalSuns,
  getOrbitPatternCatalogEntry,
  type OrbitPatternCatalogEntry,
  type OrbitPatternParametricSunSpec,
  resolveEditorFixedOrbitPatternId,
} from "./orbitPatternCatalog";
import { BAKED_ORBIT_PATTERN_TRACKS } from "./orbitPatternTrackData.generated";
import { stepSuns } from "./physics";
import { dot, len, lerpVec2, type Vec2 } from "./vec2";

export interface OrbitPatternTrackSunSample {
  pos: Vec2;
  vel: Vec2;
}

export interface OrbitPatternTrackFrame {
  suns: readonly [
    OrbitPatternTrackSunSample,
    OrbitPatternTrackSunSample,
    OrbitPatternTrackSunSample,
  ];
}

export interface OrbitPatternTrack {
  patternId: string;
  periodSec: number;
  sampleDtSec: number;
  samples: readonly OrbitPatternTrackFrame[];
}

const TRACK_GENERATION_DT_SEC = FIXED_STEP_SEC / 4;
const MIN_TRACK_DURATION_SEC = 1.5;
const MAX_TRACK_DURATION_SEC = 60;
const LOOP_MATCH_THRESHOLD = 0.016;
const ORBIT_PATTERN_MIN_GAP = 1;
const TAU = Math.PI * 2;

const orbitPatternTrackCache = new Map<string, OrbitPatternTrack>();
const orbitPatternTrackMinPairDistanceCache = new Map<string, number>();
const bakedOrbitPatternTrackCache = new Map<string, OrbitPatternTrack>(
  BAKED_ORBIT_PATTERN_TRACKS.map((track) => [
    track.patternId,
    {
      patternId: track.patternId,
      periodSec: track.periodSec,
      sampleDtSec: track.periodSec / Math.max(track.samples.length, 1),
      samples: track.samples.map((frame) => ({
        suns: [
          {
            pos: { x: frame[0][0], y: frame[0][1] },
            vel: { x: frame[0][2], y: frame[0][3] },
          },
          {
            pos: { x: frame[1][0], y: frame[1][1] },
            vel: { x: frame[1][2], y: frame[1][3] },
          },
          {
            pos: { x: frame[2][0], y: frame[2][1] },
            vel: { x: frame[2][2], y: frame[2][3] },
          },
        ] as OrbitPatternTrackFrame["suns"],
      })),
    } satisfies OrbitPatternTrack,
  ]),
);

const cloneSun = (sun: Sun): Sun => ({
  ...sun,
  pos: { x: sun.pos.x, y: sun.pos.y },
  vel: { x: sun.vel.x, y: sun.vel.y },
});

const scaleSunSample = (
  sun: OrbitPatternTrackSunSample,
  distanceScale: number,
): OrbitPatternTrackSunSample => ({
  pos: {
    x: sun.pos.x * distanceScale,
    y: sun.pos.y * distanceScale,
  },
  vel: {
    x: sun.vel.x * distanceScale,
    y: sun.vel.y * distanceScale,
  },
});

const createTrackSunSamples = (
  suns: readonly Sun[],
): OrbitPatternTrackFrame["suns"] => [
  {
    pos: { x: suns[0]!.pos.x, y: suns[0]!.pos.y },
    vel: { x: suns[0]!.vel.x, y: suns[0]!.vel.y },
  },
  {
    pos: { x: suns[1]!.pos.x, y: suns[1]!.pos.y },
    vel: { x: suns[1]!.vel.x, y: suns[1]!.vel.y },
  },
  {
    pos: { x: suns[2]!.pos.x, y: suns[2]!.pos.y },
    vel: { x: suns[2]!.vel.x, y: suns[2]!.vel.y },
  },
];

const createTrackFrame = (suns: readonly Sun[]): OrbitPatternTrackFrame => ({
  suns: createTrackSunSamples(suns),
});

const scaleTrackFrameSample = (
  sample: OrbitPatternTrackSunSample,
  positionScale: number,
  velocityScale: number,
): OrbitPatternTrackSunSample => ({
  pos: {
    x: sample.pos.x * positionScale,
    y: sample.pos.y * positionScale,
  },
  vel: {
    x: sample.vel.x * velocityScale,
    y: sample.vel.y * velocityScale,
  },
});

const scaleTrackFrame = (
  frame: OrbitPatternTrackFrame["suns"],
  positionScale: number,
  velocityScale: number,
): OrbitPatternTrackFrame["suns"] => [
  scaleTrackFrameSample(frame[0], positionScale, velocityScale),
  scaleTrackFrameSample(frame[1], positionScale, velocityScale),
  scaleTrackFrameSample(frame[2], positionScale, velocityScale),
];

const createAnalyticEquilateralCircleSample = (
  initialAngle: number,
  elapsedSec: number,
  orbitDirection: number,
  angularSpeed: number,
  orbitRadius: number,
  orbitalSpeed: number,
): OrbitPatternTrackSunSample => {
  const angle = initialAngle + orbitDirection * angularSpeed * elapsedSec;
  const tangent =
    orbitDirection >= 0
      ? { x: -Math.sin(angle), y: Math.cos(angle) }
      : { x: Math.sin(angle), y: -Math.cos(angle) };

  return {
    pos: {
      x: Math.cos(angle) * orbitRadius,
      y: Math.sin(angle) * orbitRadius,
    },
    vel: {
      x: tangent.x * orbitalSpeed,
      y: tangent.y * orbitalSpeed,
    },
  };
};

const createParametricCircleSample = (
  theta: number,
  angularSpeed: number,
  radius: number,
  phaseOffset = 0,
): OrbitPatternTrackSunSample => {
  const angle = theta + phaseOffset;

  return {
    pos: {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    },
    vel: {
      x: -Math.sin(angle) * radius * angularSpeed,
      y: Math.cos(angle) * radius * angularSpeed,
    },
  };
};

const createParametricBloomSample = (
  theta: number,
  angularSpeed: number,
  spec: Extract<OrbitPatternParametricSunSpec, { kind: "bloom" }>,
): OrbitPatternTrackSunSample => {
  const bloomAspect = spec.bloomAspect ?? 0.72;
  const baseAngle = theta * (spec.rotationScale ?? 1) + (spec.phaseOffset ?? 0);
  const bloomAngle = theta * spec.petalCount + (spec.bloomPhase ?? 0);
  const baseAngularSpeed = (spec.rotationScale ?? 1) * angularSpeed;
  const bloomAngularSpeed = spec.petalCount * angularSpeed;
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

const createParametricTrackSample = (
  theta: number,
  angularSpeed: number,
  spec: OrbitPatternParametricSunSpec,
): OrbitPatternTrackSunSample =>
  spec.kind === "circle"
    ? createParametricCircleSample(
        theta,
        angularSpeed,
        spec.radius,
        spec.phaseOffset ?? 0,
      )
    : createParametricBloomSample(theta, angularSpeed, spec);

const solveKeplerEccentricAnomaly = (
  meanAnomaly: number,
  eccentricity: number,
): number => {
  let next = meanAnomaly;

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const sin = Math.sin(next);
    const cos = Math.cos(next);
    const numerator = next - eccentricity * sin - meanAnomaly;
    const denominator = 1 - eccentricity * cos;
    next -= numerator / Math.max(denominator, 0.0001);
  }

  return next;
};

const rotateSample = (
  sample: OrbitPatternTrackSunSample,
  angle: number,
): OrbitPatternTrackSunSample => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    pos: {
      x: sample.pos.x * cos - sample.pos.y * sin,
      y: sample.pos.x * sin + sample.pos.y * cos,
    },
    vel: {
      x: sample.vel.x * cos - sample.vel.y * sin,
      y: sample.vel.x * sin + sample.vel.y * cos,
    },
  };
};

const createAnalyticLagrangeEllipseSample = (
  meanMotion: number,
  elapsedSec: number,
  eccentricity: number,
): OrbitPatternTrackSunSample => {
  const meanAnomaly = meanMotion * elapsedSec;
  const eccentricAnomaly = solveKeplerEccentricAnomaly(
    meanAnomaly,
    eccentricity,
  );
  const cosE = Math.cos(eccentricAnomaly);
  const sinE = Math.sin(eccentricAnomaly);
  const denominator = Math.max(1 - eccentricity * cosE, 0.0001);
  const root = Math.sqrt(Math.max(0, 1 - eccentricity * eccentricity));

  return {
    pos: {
      x: cosE - eccentricity,
      y: root * sinE,
    },
    vel: {
      x: (-meanMotion * sinE) / denominator,
      y: (meanMotion * root * cosE) / denominator,
    },
  };
};

const generateAnalyticLagrangeEllipseTrack = (
  pattern: OrbitPatternCatalogEntry,
): OrbitPatternTrack => {
  const eccentricity = pattern.eccentricity ?? 0.45;
  const normalizedMeanMotion = 1 / 3 ** 0.25;
  const normalizedPeriodSec = (Math.PI * 2) / normalizedMeanMotion;
  const sampleCount = 360;
  const sampleDtSec = normalizedPeriodSec / sampleCount;
  const velocityScale = Math.sqrt(
    (G * pattern.canonicalMass) / pattern.worldScale,
  );

  const samples: OrbitPatternTrackFrame[] = Array.from(
    { length: sampleCount },
    (_, index): OrbitPatternTrackFrame => {
      const elapsedSec = index * sampleDtSec;
      const base = createAnalyticLagrangeEllipseSample(
        normalizedMeanMotion,
        elapsedSec,
        eccentricity,
      );

      return {
        suns: scaleTrackFrame(
          [
            rotateSample(base, 0),
            rotateSample(base, (Math.PI * 2) / 3),
            rotateSample(base, (Math.PI * 4) / 3),
          ],
          pattern.worldScale,
          velocityScale,
        ),
      };
    },
  );

  return {
    patternId: pattern.id,
    periodSec:
      normalizedPeriodSec *
      Math.sqrt(pattern.worldScale ** 3 / (G * pattern.canonicalMass)),
    sampleDtSec:
      sampleDtSec *
      Math.sqrt(pattern.worldScale ** 3 / (G * pattern.canonicalMass)),
    samples,
  };
};

const generateAnalyticEquilateralCircleTrack = (
  pattern: OrbitPatternCatalogEntry,
): OrbitPatternTrack => {
  const initialSuns = createOrbitPatternCanonicalSuns(pattern);
  const orbitRadius = pattern.worldScale;
  const orbitalSpeed = Math.hypot(initialSuns[0]!.vel.x, initialSuns[0]!.vel.y);
  const angularSpeed = orbitalSpeed / Math.max(orbitRadius, 1);
  const periodSec = (Math.PI * 2) / Math.max(angularSpeed, 0.0001);
  const sampleCount = Math.max(
    64,
    Math.round(periodSec / TRACK_GENERATION_DT_SEC),
  );
  const sampleDtSec = periodSec / sampleCount;
  const orbitDirection =
    Math.sign(
      initialSuns[0]!.pos.x * initialSuns[0]!.vel.y -
        initialSuns[0]!.pos.y * initialSuns[0]!.vel.x,
    ) || 1;
  const initialAngles = [
    Math.atan2(initialSuns[0]!.pos.y, initialSuns[0]!.pos.x),
    Math.atan2(initialSuns[1]!.pos.y, initialSuns[1]!.pos.x),
    Math.atan2(initialSuns[2]!.pos.y, initialSuns[2]!.pos.x),
  ] as const;

  const samples: OrbitPatternTrackFrame[] = Array.from(
    { length: sampleCount },
    (_, index): OrbitPatternTrackFrame => {
      const elapsedSec = index * sampleDtSec;
      const suns: OrbitPatternTrackFrame["suns"] = [
        createAnalyticEquilateralCircleSample(
          initialAngles[0],
          elapsedSec,
          orbitDirection,
          angularSpeed,
          orbitRadius,
          orbitalSpeed,
        ),
        createAnalyticEquilateralCircleSample(
          initialAngles[1],
          elapsedSec,
          orbitDirection,
          angularSpeed,
          orbitRadius,
          orbitalSpeed,
        ),
        createAnalyticEquilateralCircleSample(
          initialAngles[2],
          elapsedSec,
          orbitDirection,
          angularSpeed,
          orbitRadius,
          orbitalSpeed,
        ),
      ];

      return { suns };
    },
  );

  return {
    patternId: pattern.id,
    periodSec,
    sampleDtSec,
    samples,
  };
};

const generateAnalyticParametricTrack = (
  pattern: OrbitPatternCatalogEntry,
): OrbitPatternTrack => {
  const parametricTrack = pattern.parametricTrack;
  if (parametricTrack === undefined) {
    throw new Error(
      `Parametric orbit pattern "${pattern.id}" is missing data.`,
    );
  }

  const periodSec = parametricTrack.periodSec;
  const sampleCount = Math.max(2, parametricTrack.sampleCount);
  const sampleDtSec = periodSec / sampleCount;
  const angularSpeed = TAU / Math.max(periodSec, 0.0001);
  const samples: OrbitPatternTrackFrame[] = Array.from(
    { length: sampleCount },
    (_, index): OrbitPatternTrackFrame => {
      const theta = (index / sampleCount) * TAU;

      return {
        suns: [
          createParametricTrackSample(
            theta,
            angularSpeed,
            parametricTrack.suns[0],
          ),
          createParametricTrackSample(
            theta,
            angularSpeed,
            parametricTrack.suns[1],
          ),
          createParametricTrackSample(
            theta,
            angularSpeed,
            parametricTrack.suns[2],
          ),
        ],
      };
    },
  );

  return {
    patternId: pattern.id,
    periodSec,
    sampleDtSec,
    samples,
  };
};

const getLoopMatchScore = (
  pattern: OrbitPatternCatalogEntry,
  initialSuns: readonly Sun[],
  candidateSuns: readonly Sun[],
): number => {
  const speedScale = Math.sqrt(
    (G * pattern.canonicalMass) / pattern.worldScale,
  );
  let totalPosError = 0;
  let totalVelError = 0;

  for (let index = 0; index < initialSuns.length; index += 1) {
    const initialSun = initialSuns[index]!;
    const candidateSun = candidateSuns[index]!;
    totalPosError +=
      Math.hypot(
        candidateSun.pos.x - initialSun.pos.x,
        candidateSun.pos.y - initialSun.pos.y,
      ) / pattern.worldScale;
    totalVelError +=
      Math.hypot(
        candidateSun.vel.x - initialSun.vel.x,
        candidateSun.vel.y - initialSun.vel.y,
      ) / speedScale;
  }

  return (totalPosError + totalVelError) / initialSuns.length;
};

const generateOrbitPatternTrack = (
  pattern: OrbitPatternCatalogEntry,
): OrbitPatternTrack => {
  if (pattern.trackMode === "analyticEquilateralCircle") {
    return generateAnalyticEquilateralCircleTrack(pattern);
  }
  if (pattern.trackMode === "analyticLagrangeEllipse") {
    return generateAnalyticLagrangeEllipseTrack(pattern);
  }
  if (pattern.trackMode === "analyticParametric") {
    return generateAnalyticParametricTrack(pattern);
  }

  const initialSuns = createOrbitPatternCanonicalSuns(pattern);
  const samples: OrbitPatternTrackFrame[] = [createTrackFrame(initialSuns)];
  let currentSuns = initialSuns.map(cloneSun) as [Sun, Sun, Sun];
  let bestPeriodSteps = Math.max(
    1,
    Math.round(MIN_TRACK_DURATION_SEC / TRACK_GENERATION_DT_SEC),
  );
  let bestScore = Number.POSITIVE_INFINITY;
  const minPeriodSteps = bestPeriodSteps;
  const maxPeriodSteps = Math.max(
    minPeriodSteps + 1,
    Math.round(MAX_TRACK_DURATION_SEC / TRACK_GENERATION_DT_SEC),
  );

  for (let step = 1; step <= maxPeriodSteps; step += 1) {
    currentSuns = stepSuns(currentSuns, TRACK_GENERATION_DT_SEC) as [
      Sun,
      Sun,
      Sun,
    ];
    samples.push(createTrackFrame(currentSuns));

    if (step < minPeriodSteps) {
      continue;
    }

    const score = getLoopMatchScore(pattern, initialSuns, currentSuns);
    if (score < bestScore) {
      bestScore = score;
      bestPeriodSteps = step;
    }
    if (score <= LOOP_MATCH_THRESHOLD) {
      bestPeriodSteps = step;
      break;
    }
  }

  const periodSteps = Math.max(2, bestPeriodSteps);
  return {
    patternId: pattern.id,
    periodSec: periodSteps * TRACK_GENERATION_DT_SEC,
    sampleDtSec: TRACK_GENERATION_DT_SEC,
    samples: samples.slice(0, periodSteps),
  };
};

export const getOrbitPatternTrack = (patternId: string): OrbitPatternTrack => {
  const resolvedPatternId = resolveEditorFixedOrbitPatternId(patternId);
  const baked = bakedOrbitPatternTrackCache.get(resolvedPatternId);
  if (baked !== undefined) {
    return baked;
  }

  const pattern = getOrbitPatternCatalogEntry(resolvedPatternId);
  const cached = orbitPatternTrackCache.get(pattern.id);
  if (cached !== undefined) {
    return cached;
  }

  const track = generateOrbitPatternTrack(pattern);
  orbitPatternTrackCache.set(pattern.id, track);
  return track;
};

const getSegmentMinPairDistance = (
  startA: Vec2,
  endA: Vec2,
  startB: Vec2,
  endB: Vec2,
): number => {
  const relativeStart = {
    x: startB.x - startA.x,
    y: startB.y - startA.y,
  };
  const relativeDelta = {
    x: endB.x - startB.x - (endA.x - startA.x),
    y: endB.y - startB.y - (endA.y - startA.y),
  };
  const denominator = dot(relativeDelta, relativeDelta);
  const alpha =
    denominator <= 0
      ? 0
      : Math.max(
          0,
          Math.min(1, -dot(relativeStart, relativeDelta) / denominator),
        );

  return len({
    x: relativeStart.x + relativeDelta.x * alpha,
    y: relativeStart.y + relativeDelta.y * alpha,
  });
};

export const getOrbitPatternTrackMinPairDistance = (
  track: OrbitPatternTrack,
): number => {
  const cached = orbitPatternTrackMinPairDistanceCache.get(track.patternId);
  if (cached !== undefined) {
    return cached;
  }

  let minDistance = Number.POSITIVE_INFINITY;
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const;

  for (let index = 0; index < track.samples.length; index += 1) {
    const current = track.samples[index]!.suns;
    const next = track.samples[(index + 1) % track.samples.length]!.suns;

    for (const [leftIndex, rightIndex] of pairs) {
      minDistance = Math.min(
        minDistance,
        getSegmentMinPairDistance(
          current[leftIndex]!.pos,
          next[leftIndex]!.pos,
          current[rightIndex]!.pos,
          next[rightIndex]!.pos,
        ),
      );
    }
  }

  const resolved =
    Number.isFinite(minDistance) && minDistance > 0 ? minDistance : 0;
  orbitPatternTrackMinPairDistanceCache.set(track.patternId, resolved);
  return resolved;
};

export const getOrbitPatternMinimumDistanceScale = (
  patternId: string,
  suns: readonly Pick<Sun, "radius">[],
): number => {
  const track = getOrbitPatternTrack(patternId);
  const minPairDistance = getOrbitPatternTrackMinPairDistance(track);
  if (minPairDistance <= 0 || suns.length < 3) {
    return 1;
  }

  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const;

  return pairs.reduce((maxScale, [leftIndex, rightIndex]) => {
    const requiredDistance =
      suns[leftIndex]!.radius +
      suns[rightIndex]!.radius +
      ORBIT_PATTERN_MIN_GAP;
    return Math.max(maxScale, requiredDistance / minPairDistance);
  }, 0);
};

export const clampOrbitPatternDistanceScale = (
  patternId: string,
  distanceScale: number,
  suns: readonly Pick<Sun, "radius">[],
): number =>
  Math.max(distanceScale, getOrbitPatternMinimumDistanceScale(patternId, suns));

const wrapPeriodValue = (value: number, period: number): number => {
  if (!(period > 0)) {
    return 0;
  }

  const wrapped = value % period;
  return wrapped >= 0 ? wrapped : wrapped + period;
};

export const sampleOrbitPatternTrack = (
  track: OrbitPatternTrack,
  elapsedSec: number,
  speed = 1,
  distanceScale = 1,
): OrbitPatternTrackFrame["suns"] => {
  if (track.samples.length <= 1 || track.periodSec <= 0 || speed === 0) {
    return [
      scaleSunSample(track.samples[0]!.suns[0]!, distanceScale),
      scaleSunSample(track.samples[0]!.suns[1]!, distanceScale),
      scaleSunSample(track.samples[0]!.suns[2]!, distanceScale),
    ];
  }

  const phaseSec = wrapPeriodValue(elapsedSec * speed, track.periodSec);
  const sampleIndexFloat = (phaseSec / track.periodSec) * track.samples.length;
  const currentIndex = Math.floor(sampleIndexFloat) % track.samples.length;
  const nextIndex = (currentIndex + 1) % track.samples.length;
  const alpha = sampleIndexFloat - Math.floor(sampleIndexFloat);
  const current = track.samples[currentIndex]!.suns;
  const next = track.samples[nextIndex]!.suns;

  return [
    scaleSunSample(
      {
        pos: lerpVec2(current[0]!.pos, next[0]!.pos, alpha),
        vel: lerpVec2(current[0]!.vel, next[0]!.vel, alpha),
      },
      distanceScale,
    ),
    scaleSunSample(
      {
        pos: lerpVec2(current[1]!.pos, next[1]!.pos, alpha),
        vel: lerpVec2(current[1]!.vel, next[1]!.vel, alpha),
      },
      distanceScale,
    ),
    scaleSunSample(
      {
        pos: lerpVec2(current[2]!.pos, next[2]!.pos, alpha),
        vel: lerpVec2(current[2]!.vel, next[2]!.vel, alpha),
      },
      distanceScale,
    ),
  ];
};

export const stepSunsWithOrbitMotion = (
  suns: readonly Sun[],
  dt: number,
  blackHole?: BlackHole,
  orbitStarMotion?: WorldOrbitStarMotion,
): Sun[] => {
  if (orbitStarMotion?.mode !== "fixedPattern") {
    return stepSuns(suns, dt, blackHole);
  }

  const sampledSuns = sampleOrbitPatternTrack(
    getOrbitPatternTrack(orbitStarMotion.patternId),
    orbitStarMotion.elapsedSec + dt,
    orbitStarMotion.speed,
    orbitStarMotion.distanceScale,
  );
  const activeSunsById = new Map(suns.map((sun) => [sun.id, sun] as const));

  return orbitStarMotion.sunIds.flatMap((sunId, index) => {
    const currentSun = activeSunsById.get(sunId);
    if (currentSun === undefined) {
      return [];
    }

    return [
      {
        ...currentSun,
        pos: {
          x: sampledSuns[index]!.pos.x,
          y: sampledSuns[index]!.pos.y,
        },
        vel: {
          x: sampledSuns[index]!.vel.x,
          y: sampledSuns[index]!.vel.y,
        },
      },
    ];
  });
};

export const advanceWorldOrbitStarMotion = (
  orbitStarMotion: WorldOrbitStarMotion | undefined,
  dt: number,
): WorldOrbitStarMotion | undefined =>
  orbitStarMotion === undefined
    ? undefined
    : {
        ...orbitStarMotion,
        elapsedSec: orbitStarMotion.elapsedSec + dt,
      };
