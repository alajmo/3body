import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const CATALOG_PATH = path.join(
  REPO_ROOT,
  "src/shared/src/orbitPatternCatalog.ts",
);
const OUTPUT_PATH = path.join(
  REPO_ROOT,
  "src/shared/src/orbitPatternTrackData.generated.ts",
);

const DIRECT_SEARCH_MAX_T = 200;
const SYMMETRY_SEARCH_MAX_T = 100;
const SEARCH_MIN_T = 1;
const DIRECT_ACCEPT_SCORE = 0.02;
const DIRECT_OPTIMIZE_SCORE = 0.05;
const SYMMETRY_PROMISING_SCORE = 0.25;
const SYMMETRY_ACCEPT_SCORE = 0.04;
const SOLVER_DT = 1 / 2000;
const OPTIMIZE_ITERATIONS = 12;
const OPTIMIZE_START_DELTA = 0.01;
const FULL_LOOP_SAMPLES_MIN = 240;
const FULL_LOOP_SAMPLES_MAX = 720;
const FULL_LOOP_SAMPLES_PER_NORMALIZED_UNIT = 18;
const SEGMENT_OVERSAMPLE = 10;
const ANGLE_SNAP_TOLERANCE_RAD = 0.1;
const CANONICAL_MASS = 120_000;
const G = 500;
const TWO_PI = Math.PI * 2;

const equalMassPatternRegex =
  /createEqualMassPeriodicPattern\(\{\s*id: "([^"]+)",\s*label: "([^"]+)",\s*p1: ([^,]+),\s*p2: ([^,]+),\s*worldScale: ([^,]+),/gms;
const equilateralCircleRegex =
  /createEquilateralCirclePattern\(\{\s*id: "([^"]+)",\s*label: "([^"]+)",\s*worldScale: ([^,]+),/gms;
const lagrangeEllipseRegex =
  /createLagrangeEllipsePattern\(\{\s*eccentricity: ([^,]+),\s*id: "([^"]+)",\s*label: "([^"]+)",\s*worldScale: ([^,]+),/gms;
const PARAMETRIC_FLOWER_PATTERNS = [
  {
    canonicalMass: CANONICAL_MASS,
    id: "clover-3",
    kind: "analyticParametric",
    label: "Clover-3",
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
        bloomPhase: TWO_PI / 3 + 0.28,
        bloomRadius: 118,
        kind: "bloom",
        orbitRadius: 645,
        petalCount: 3,
        phaseOffset: TWO_PI / 3 + 0.12,
      },
      {
        bloomPhase: (TWO_PI * 2) / 3 + 0.28,
        bloomRadius: 118,
        kind: "bloom",
        orbitRadius: 645,
        petalCount: 3,
        phaseOffset: (TWO_PI * 2) / 3 + 0.12,
      },
    ],
    worldScale: 760,
  },
  {
    canonicalMass: CANONICAL_MASS,
    id: "sunflower-5",
    kind: "analyticParametric",
    label: "Sunflower-5",
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
    worldScale: 900,
  },
  {
    canonicalMass: CANONICAL_MASS,
    id: "daisy-6",
    kind: "analyticParametric",
    label: "Daisy-6",
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
    worldScale: 790,
  },
  {
    canonicalMass: CANONICAL_MASS,
    id: "lotus-twin",
    kind: "analyticParametric",
    label: "Lotus Twin",
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
    worldScale: 880,
  },
  {
    canonicalMass: CANONICAL_MASS,
    id: "crown-orbit",
    kind: "analyticParametric",
    label: "Crown Orbit",
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
        bloomPhase: TWO_PI / 3 + 0.22,
        bloomRadius: 84,
        kind: "bloom",
        orbitRadius: 655,
        petalCount: 3,
        phaseOffset: TWO_PI / 3 + 0.08,
        rotationScale: 0.9,
      },
      {
        bloomAspect: 0.56,
        bloomPhase: (TWO_PI * 2) / 3 + 0.22,
        bloomRadius: 84,
        kind: "bloom",
        orbitRadius: 655,
        petalCount: 3,
        phaseOffset: (TWO_PI * 2) / 3 + 0.08,
        rotationScale: 0.9,
      },
    ],
    worldScale: 740,
  },
];

const normalizeAngle = (angle) => {
  let next = angle;
  while (next > Math.PI) {
    next -= TWO_PI;
  }
  while (next <= -Math.PI) {
    next += TWO_PI;
  }
  return next;
};

const PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

const ROTATION_SNAPS = Array.from({ length: 6 }, (_, denominator) => {
  const nextDenominator = denominator + 1;
  return Array.from({ length: nextDenominator }, (_, numerator) => {
    const rawAngle = (TWO_PI * numerator) / nextDenominator;
    return {
      angle: normalizeAngle(rawAngle),
      denominator: nextDenominator,
      numerator,
    };
  });
}).flat();

const angleDistance = (a, b) => Math.abs(normalizeAngle(a - b));

const gcd = (a, b) => {
  let nextA = Math.abs(a);
  let nextB = Math.abs(b);
  while (nextB !== 0) {
    const remainder = nextA % nextB;
    nextA = nextB;
    nextB = remainder;
  }
  return nextA;
};

const lcm = (a, b) => (a * b) / Math.max(1, gcd(a, b));

const reduceFraction = (numerator, denominator) => {
  const divisor = gcd(numerator, denominator);
  return {
    denominator: denominator / Math.max(1, divisor),
    numerator: numerator / Math.max(1, divisor),
  };
};

const getRotationOrder = ({ denominator, numerator }) => {
  if (numerator === 0) {
    return 1;
  }

  return reduceFraction(numerator, denominator).denominator;
};

const getPermutationOrder = (perm) => {
  const identity = [0, 1, 2];
  let current = [0, 1, 2];

  for (let step = 1; step <= 12; step += 1) {
    current = current.map((index) => perm[index]);
    if (current.every((value, index) => value === identity[index])) {
      return step;
    }
  }

  return null;
};

const rotateVec2 = (value, angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: value.x * cos - value.y * sin,
    y: value.x * sin + value.y * cos,
  };
};

const rotateSample = (sample, angle) => ({
  pos: rotateVec2(sample.pos, angle),
  vel: rotateVec2(sample.vel, angle),
});

const parseNumericLiteral = (value) => Number(value.replaceAll("_", "").trim());

const cloneState = (state) =>
  state.map((sun) => ({
    pos: { x: sun.pos.x, y: sun.pos.y },
    vel: { x: sun.vel.x, y: sun.vel.y },
  }));

const createNormalizedSeedState = ({ p1, p2 }) => [
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
];

const createEquilateralCircleNormalizedState = () => {
  const speed = 1 / 3 ** 0.25;

  return [0, 1, 2].map((index) => {
    const angle = (TWO_PI * index) / 3;
    const tangentAngle = angle + Math.PI / 2;

    return {
      pos: {
        x: Math.cos(angle),
        y: Math.sin(angle),
      },
      vel: {
        x: Math.cos(tangentAngle) * speed,
        y: Math.sin(tangentAngle) * speed,
      },
    };
  });
};

const solveKeplerEccentricAnomaly = (meanAnomaly, eccentricity) => {
  let next = meanAnomaly;

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const sin = Math.sin(next);
    const cos = Math.cos(next);
    next -=
      (next - eccentricity * sin - meanAnomaly) /
      Math.max(1 - eccentricity * cos, 0.0001);
  }

  return next;
};

const createLagrangeEllipseBaseSample = (
  meanMotion,
  elapsedSec,
  eccentricity,
) => {
  const meanAnomaly = meanMotion * elapsedSec;
  const eccentricAnomaly = solveKeplerEccentricAnomaly(
    meanAnomaly,
    eccentricity,
  );
  const cosE = Math.cos(eccentricAnomaly);
  const sinE = Math.sin(eccentricAnomaly);
  const root = Math.sqrt(Math.max(0, 1 - eccentricity * eccentricity));
  const denominator = Math.max(1 - eccentricity * cosE, 0.0001);

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

const accelAt = (state, index, positions = state.map((sun) => sun.pos)) => {
  const origin = positions[index];
  const accel = { x: 0, y: 0 };

  for (let sourceIndex = 0; sourceIndex < state.length; sourceIndex += 1) {
    if (sourceIndex === index) {
      continue;
    }

    const source = positions[sourceIndex];
    const dx = source.x - origin.x;
    const dy = source.y - origin.y;
    const radiusSq = dx * dx + dy * dy;
    const radius = Math.sqrt(radiusSq);
    const strength = 1 / (radiusSq * radius);

    accel.x += dx * strength;
    accel.y += dy * strength;
  }

  return accel;
};

const stepNormalizedState = (state, dt) => {
  const accel0 = state.map((_, index) => accelAt(state, index));
  const nextPositions = state.map((sun, index) => ({
    x: sun.pos.x + sun.vel.x * dt + accel0[index].x * 0.5 * dt * dt,
    y: sun.pos.y + sun.vel.y * dt + accel0[index].y * 0.5 * dt * dt,
  }));
  const accel1 = state.map((_, index) => accelAt(state, index, nextPositions));

  return state.map((sun, index) => ({
    pos: nextPositions[index],
    vel: {
      x: sun.vel.x + (accel0[index].x + accel1[index].x) * 0.5 * dt,
      y: sun.vel.y + (accel0[index].y + accel1[index].y) * 0.5 * dt,
    },
  }));
};

const scoreIdentityState = (start, current) => {
  let posError = 0;
  let velError = 0;

  for (let index = 0; index < start.length; index += 1) {
    posError += Math.hypot(
      current[index].pos.x - start[index].pos.x,
      current[index].pos.y - start[index].pos.y,
    );
    velError += Math.hypot(
      current[index].vel.x - start[index].vel.x,
      current[index].vel.y - start[index].vel.y,
    );
  }

  return (posError + velError) / start.length;
};

const getBestSymmetryFit = (start, current) => {
  let best = {
    angle: 0,
    perm: PERMUTATIONS[0],
    score: Number.POSITIVE_INFINITY,
  };

  for (const perm of PERMUTATIONS) {
    let cross = 0;
    let dot = 0;

    for (let index = 0; index < start.length; index += 1) {
      const currentSun = current[index];
      const startSun = start[perm[index]];

      cross += currentSun.pos.x * startSun.pos.y - currentSun.pos.y * startSun.pos.x;
      dot += currentSun.pos.x * startSun.pos.x + currentSun.pos.y * startSun.pos.y;
      cross += currentSun.vel.x * startSun.vel.y - currentSun.vel.y * startSun.vel.x;
      dot += currentSun.vel.x * startSun.vel.x + currentSun.vel.y * startSun.vel.y;
    }

    const angle = Math.atan2(cross, dot);
    let posError = 0;
    let velError = 0;

    for (let index = 0; index < start.length; index += 1) {
      const rotatedPos = rotateVec2(current[index].pos, angle);
      const rotatedVel = rotateVec2(current[index].vel, angle);
      const targetSun = start[perm[index]];

      posError += Math.hypot(
        rotatedPos.x - targetSun.pos.x,
        rotatedPos.y - targetSun.pos.y,
      );
      velError += Math.hypot(
        rotatedVel.x - targetSun.vel.x,
        rotatedVel.y - targetSun.vel.y,
      );
    }

    const score = (posError + velError) / start.length;
    if (score < best.score) {
      best = {
        angle,
        perm,
        score,
      };
    }
  }

  return best;
};

const snapRotation = (angle) => {
  let best = null;

  for (const candidate of ROTATION_SNAPS) {
    const delta = angleDistance(angle, candidate.angle);
    if (best === null || delta < best.delta) {
      best = {
        ...candidate,
        delta,
      };
    }
  }

  return best;
};

const evaluateSeed = ({ maxT, mode, p1, p2 }) => {
  const start = createNormalizedSeedState({ p1, p2 });
  let state = cloneState(start);
  const minSteps = Math.round(SEARCH_MIN_T / SOLVER_DT);
  const maxSteps = Math.round(maxT / SOLVER_DT);
  let best = null;

  for (let stepIndex = 1; stepIndex <= maxSteps; stepIndex += 1) {
    state = stepNormalizedState(state, SOLVER_DT);
    if (stepIndex < minSteps) {
      continue;
    }

    if (mode === "direct") {
      const score = scoreIdentityState(start, state);
      if (best === null || score < best.score) {
        best = {
          mode,
          score,
          normalizedPeriod: stepIndex * SOLVER_DT,
        };
      }
      continue;
    }

    const symmetry = getBestSymmetryFit(start, state);
    if (best === null || symmetry.score < best.score) {
      best = {
        angle: symmetry.angle,
        mode,
        normalizedPeriod: stepIndex * SOLVER_DT,
        perm: [...symmetry.perm],
        score: symmetry.score,
      };
    }
  }

  return best;
};

const optimizeSeed = ({ maxT, mode, p1, p2 }) => {
  let best = {
    p1,
    p2,
    ...evaluateSeed({ maxT, mode, p1, p2 }),
  };
  let delta = OPTIMIZE_START_DELTA;

  for (let iteration = 0; iteration < OPTIMIZE_ITERATIONS; iteration += 1) {
    let improved = false;
    let bestCandidate = best;

    for (const deltaX of [-delta, 0, delta]) {
      for (const deltaY of [-delta, 0, delta]) {
        if (deltaX === 0 && deltaY === 0) {
          continue;
        }

        const candidate = {
          p1: best.p1 + deltaX,
          p2: best.p2 + deltaY,
        };
        const evaluated = {
          ...candidate,
          ...evaluateSeed({
            maxT,
            mode,
            p1: candidate.p1,
            p2: candidate.p2,
          }),
        };

        if (evaluated.score < bestCandidate.score) {
          bestCandidate = evaluated;
          improved = true;
        }
      }
    }

    if (improved) {
      best = bestCandidate;
      continue;
    }

    delta *= 0.5;
  }

  return best;
};

const applySymmetry = (state, symmetry) =>
  state.map((_, index) => {
    const source = state[symmetry.perm[index]];
    return {
      pos: rotateVec2(source.pos, symmetry.angle),
      vel: rotateVec2(source.vel, symmetry.angle),
    };
  });

const correctSegmentEndpoint = (samples, targetEnd) => {
  const start = samples[0];
  const end = samples[samples.length - 1];

  return samples.map((sample, index) => {
    const alpha = samples.length <= 1 ? 0 : index / (samples.length - 1);

    return sample.map((sun, sunIndex) => ({
      pos: {
        x: sun.pos.x + (targetEnd[sunIndex].pos.x - end[sunIndex].pos.x) * alpha,
        y: sun.pos.y + (targetEnd[sunIndex].pos.y - end[sunIndex].pos.y) * alpha,
      },
      vel: {
        x: sun.vel.x + (targetEnd[sunIndex].vel.x - end[sunIndex].vel.x) * alpha,
        y: sun.vel.y + (targetEnd[sunIndex].vel.y - end[sunIndex].vel.y) * alpha,
      },
    }));
  }).map((sample, index) => (index === 0 ? start : sample));
};

const createSegmentSamples = ({ normalizedPeriod, p1, p2, targetEnd }) => {
  const targetSamples = Math.max(
    2,
    Math.round(
      Math.min(
        FULL_LOOP_SAMPLES_MAX,
        Math.max(
          FULL_LOOP_SAMPLES_MIN,
          normalizedPeriod * FULL_LOOP_SAMPLES_PER_NORMALIZED_UNIT,
        ),
      ),
    ),
  );
  const segmentSamples = Math.max(2, targetSamples);
  const solverSteps = Math.max(1, (segmentSamples - 1) * SEGMENT_OVERSAMPLE);
  const solverDt = normalizedPeriod / solverSteps;
  const samples = [];
  let state = createNormalizedSeedState({ p1, p2 });

  samples.push(cloneState(state));

  for (let stepIndex = 1; stepIndex <= solverSteps; stepIndex += 1) {
    state = stepNormalizedState(state, solverDt);
    if (stepIndex % SEGMENT_OVERSAMPLE === 0) {
      samples.push(cloneState(state));
    }
  }

  return correctSegmentEndpoint(samples, targetEnd);
};

const createAnalyticCircleSamples = (sampleCount) => {
  const normalizedPeriod = (Math.PI * 2) / (1 / 3 ** 0.25);

  return Array.from({ length: sampleCount }, (_, index) => {
    const alpha = index / sampleCount;
    const angle = alpha * TWO_PI;
    const speed = 1 / 3 ** 0.25;

    return [0, 1, 2].map((sunIndex) => {
      const sunAngle = angle + (TWO_PI * sunIndex) / 3;
      const tangentAngle = sunAngle + Math.PI / 2;
      return {
        pos: {
          x: Math.cos(sunAngle),
          y: Math.sin(sunAngle),
        },
        vel: {
          x: Math.cos(tangentAngle) * speed,
          y: Math.sin(tangentAngle) * speed,
        },
      };
    });
  });
};

const createAnalyticLagrangeEllipseSamples = (sampleCount, eccentricity) => {
  const normalizedMeanMotion = 1 / 3 ** 0.25;
  const normalizedPeriod = (Math.PI * 2) / normalizedMeanMotion;

  return Array.from({ length: sampleCount }, (_, index) => {
    const elapsedSec = (index / sampleCount) * normalizedPeriod;
    const base = createLagrangeEllipseBaseSample(
      normalizedMeanMotion,
      elapsedSec,
      eccentricity,
    );

    return [0, 1, 2].map((sunIndex) =>
      rotateSample(base, (TWO_PI * sunIndex) / 3),
    );
  });
};

const createParametricCircleSample = (theta, angularSpeed, spec) => {
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

const createParametricBloomSample = (theta, angularSpeed, spec) => {
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
    Math.cos(bloomAngle) *
    spec.bloomRadius *
    bloomAspect *
    bloomAngularSpeed;
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

const createParametricTrackSamples = ({ periodSec, sampleCount, suns }) => {
  const angularSpeed = TWO_PI / Math.max(periodSec, 0.0001);

  return Array.from({ length: sampleCount }, (_, index) => {
    const theta = (index / sampleCount) * TWO_PI;

    return suns.map((spec) =>
      spec.kind === "circle"
        ? createParametricCircleSample(theta, angularSpeed, spec)
        : createParametricBloomSample(theta, angularSpeed, spec),
    );
  });
};

const createLoopFromSymmetry = ({
  canonicalMass,
  p1,
  p2,
  snappedAngle,
  symmetryOrder,
  symmetryPerm,
  symmetryPeriod,
  worldScale,
}) => {
  const symmetry = {
    angle: snappedAngle.angle,
    perm: symmetryPerm,
  };
  const start = createNormalizedSeedState({ p1, p2 });
  const targetEnd = applySymmetry(start, symmetry);
  const fullLoopSamples = Math.min(
    FULL_LOOP_SAMPLES_MAX,
    Math.max(
      FULL_LOOP_SAMPLES_MIN,
      Math.round(
        symmetryPeriod *
          symmetryOrder *
          FULL_LOOP_SAMPLES_PER_NORMALIZED_UNIT,
      ),
    ),
  );
  const segmentSamples = Math.max(2, Math.round(fullLoopSamples / symmetryOrder));
  const baseSamples = createSegmentSamples({
    normalizedPeriod: symmetryPeriod,
    p1,
    p2,
    targetEnd,
  }).slice(0, segmentSamples);
  const normalizedPeriod = symmetryPeriod * symmetryOrder;
  const timeScale = Math.sqrt((worldScale ** 3) / (G * canonicalMass));
  const speedScale = Math.sqrt((G * canonicalMass) / worldScale);
  const samples = [];
  let currentPerm = [0, 1, 2];
  let currentAngle = 0;

  for (let repeatIndex = 0; repeatIndex < symmetryOrder; repeatIndex += 1) {
    for (let sampleIndex = 0; sampleIndex < baseSamples.length; sampleIndex += 1) {
      if (repeatIndex > 0 && sampleIndex === 0) {
        continue;
      }

      const frame = baseSamples[sampleIndex].map((_, sunIndex) => {
        const source = baseSamples[sampleIndex][currentPerm[sunIndex]];
        const rotatedPos = rotateVec2(source.pos, currentAngle);
        const rotatedVel = rotateVec2(source.vel, currentAngle);

        return [
          Number((rotatedPos.x * worldScale).toFixed(6)),
          Number((rotatedPos.y * worldScale).toFixed(6)),
          Number((rotatedVel.x * speedScale).toFixed(6)),
          Number((rotatedVel.y * speedScale).toFixed(6)),
        ];
      });

      samples.push(frame);
    }

    currentPerm = currentPerm.map((index) => symmetry.perm[index]);
    currentAngle = normalizeAngle(currentAngle + symmetry.angle);
  }

  return {
    periodSec: Number((normalizedPeriod * timeScale).toFixed(6)),
    samples,
  };
};

const createLoopFromDirectSeed = ({ canonicalMass, normalizedPeriod, p1, p2, worldScale }) => {
  const start = createNormalizedSeedState({ p1, p2 });
  const samples = createSegmentSamples({
    normalizedPeriod,
    p1,
    p2,
    targetEnd: start,
  });
  const timeScale = Math.sqrt((worldScale ** 3) / (G * canonicalMass));
  const speedScale = Math.sqrt((G * canonicalMass) / worldScale);

  return {
    periodSec: Number((normalizedPeriod * timeScale).toFixed(6)),
    samples: samples.slice(0, -1).map((frame) =>
      frame.map((sun) => [
        Number((sun.pos.x * worldScale).toFixed(6)),
        Number((sun.pos.y * worldScale).toFixed(6)),
        Number((sun.vel.x * speedScale).toFixed(6)),
        Number((sun.vel.y * speedScale).toFixed(6)),
      ]),
    ),
  };
};

const createLoopFromAnalyticCircle = ({ canonicalMass, worldScale }) => {
  const sampleCount = 240;
  const normalizedPeriod = (Math.PI * 2) / (1 / 3 ** 0.25);
  const timeScale = Math.sqrt((worldScale ** 3) / (G * canonicalMass));
  const speedScale = Math.sqrt((G * canonicalMass) / worldScale);

  return {
    periodSec: Number((normalizedPeriod * timeScale).toFixed(6)),
    samples: createAnalyticCircleSamples(sampleCount).map((frame) =>
      frame.map((sun) => [
        Number((sun.pos.x * worldScale).toFixed(6)),
        Number((sun.pos.y * worldScale).toFixed(6)),
        Number((sun.vel.x * speedScale).toFixed(6)),
        Number((sun.vel.y * speedScale).toFixed(6)),
      ]),
    ),
  };
};

const createLoopFromAnalyticLagrangeEllipse = ({
  canonicalMass,
  eccentricity,
  worldScale,
}) => {
  const sampleCount = 360;
  const normalizedPeriod = (Math.PI * 2) / (1 / 3 ** 0.25);
  const timeScale = Math.sqrt((worldScale ** 3) / (G * canonicalMass));
  const speedScale = Math.sqrt((G * canonicalMass) / worldScale);

  return {
    periodSec: Number((normalizedPeriod * timeScale).toFixed(6)),
    samples: createAnalyticLagrangeEllipseSamples(
      sampleCount,
      eccentricity,
    ).map((frame) =>
      frame.map((sun) => [
        Number((sun.pos.x * worldScale).toFixed(6)),
        Number((sun.pos.y * worldScale).toFixed(6)),
        Number((sun.vel.x * speedScale).toFixed(6)),
        Number((sun.vel.y * speedScale).toFixed(6)),
      ]),
    ),
  };
};

const createLoopFromAnalyticParametric = ({ periodSec, sampleCount, suns }) => ({
  periodSec: Number(periodSec.toFixed(6)),
  samples: createParametricTrackSamples({
    periodSec,
    sampleCount,
    suns,
  }).map((frame) =>
    frame.map((sun) => [
      Number(sun.pos.x.toFixed(6)),
      Number(sun.pos.y.toFixed(6)),
      Number(sun.vel.x.toFixed(6)),
      Number(sun.vel.y.toFixed(6)),
    ]),
  ),
});

const parseCatalog = () => {
  const source = fs.readFileSync(CATALOG_PATH, "utf8");
  const patterns = [];

  for (const match of source.matchAll(equalMassPatternRegex)) {
    patterns.push({
      canonicalMass: CANONICAL_MASS,
      id: match[1],
      kind: "equalMassPeriodic",
      label: match[2],
      p1: parseNumericLiteral(match[3]),
      p2: parseNumericLiteral(match[4]),
      worldScale: parseNumericLiteral(match[5]),
    });
  }

  for (const match of source.matchAll(equilateralCircleRegex)) {
    patterns.push({
      canonicalMass: CANONICAL_MASS,
      id: match[1],
      kind: "analyticEquilateralCircle",
      label: match[2],
      worldScale: parseNumericLiteral(match[3]),
    });
  }

  for (const match of source.matchAll(lagrangeEllipseRegex)) {
    patterns.push({
      canonicalMass: CANONICAL_MASS,
      eccentricity: parseNumericLiteral(match[1]),
      id: match[2],
      kind: "analyticLagrangeEllipse",
      label: match[3],
      worldScale: parseNumericLiteral(match[4]),
    });
  }

  return [...patterns, ...PARAMETRIC_FLOWER_PATTERNS];
};

const validatePattern = (pattern) => {
  if (pattern.kind === "analyticEquilateralCircle") {
    return {
      accepted: true,
      bake: createLoopFromAnalyticCircle(pattern),
      id: pattern.id,
      label: pattern.label,
      reason: "analytic",
      score: 0,
    };
  }

  if (pattern.kind === "analyticLagrangeEllipse") {
    return {
      accepted: true,
      bake: createLoopFromAnalyticLagrangeEllipse(pattern),
      id: pattern.id,
      label: pattern.label,
      reason: "analytic",
      score: 0,
    };
  }

  if (pattern.kind === "analyticParametric") {
    return {
      accepted: true,
      bake: createLoopFromAnalyticParametric(pattern),
      id: pattern.id,
      label: pattern.label,
      reason: "analytic",
      score: 0,
    };
  }

  const direct = evaluateSeed({
    maxT: DIRECT_SEARCH_MAX_T,
    mode: "direct",
    p1: pattern.p1,
    p2: pattern.p2,
  });

  if (direct.score <= DIRECT_ACCEPT_SCORE) {
    return {
      accepted: true,
      bake: createLoopFromDirectSeed({
        canonicalMass: pattern.canonicalMass,
        normalizedPeriod: direct.normalizedPeriod,
        p1: pattern.p1,
        p2: pattern.p2,
        worldScale: pattern.worldScale,
      }),
      id: pattern.id,
      label: pattern.label,
      reason: "direct",
      score: direct.score,
    };
  }

  if (direct.score <= DIRECT_OPTIMIZE_SCORE) {
    const optimizedDirect = optimizeSeed({
      maxT: DIRECT_SEARCH_MAX_T,
      mode: "direct",
      p1: pattern.p1,
      p2: pattern.p2,
    });

    if (optimizedDirect.score <= DIRECT_ACCEPT_SCORE) {
      return {
        accepted: true,
        bake: createLoopFromDirectSeed({
          canonicalMass: pattern.canonicalMass,
          normalizedPeriod: optimizedDirect.normalizedPeriod,
          p1: optimizedDirect.p1,
          p2: optimizedDirect.p2,
          worldScale: pattern.worldScale,
        }),
        id: pattern.id,
        label: pattern.label,
        reason: "direct-optimized",
        score: optimizedDirect.score,
      };
    }
  }

  const rawSymmetry = evaluateSeed({
    maxT: SYMMETRY_SEARCH_MAX_T,
    mode: "symmetry",
    p1: pattern.p1,
    p2: pattern.p2,
  });

  if (rawSymmetry.score > SYMMETRY_PROMISING_SCORE) {
    return {
      accepted: false,
      id: pattern.id,
      label: pattern.label,
      reason: "unstable",
      score: rawSymmetry.score,
    };
  }

  const optimizedSymmetry = optimizeSeed({
    maxT: SYMMETRY_SEARCH_MAX_T,
    mode: "symmetry",
    p1: pattern.p1,
    p2: pattern.p2,
  });
  const snappedAngle = snapRotation(optimizedSymmetry.angle);
  const permutationOrder = getPermutationOrder(optimizedSymmetry.perm);
  const rotationOrder = getRotationOrder(snappedAngle);

  if (
    optimizedSymmetry.score > SYMMETRY_ACCEPT_SCORE ||
    snappedAngle.delta > ANGLE_SNAP_TOLERANCE_RAD ||
    permutationOrder === null
  ) {
    return {
      accepted: false,
      id: pattern.id,
      label: pattern.label,
      reason: "unstable",
      score: optimizedSymmetry.score,
    };
  }

  const symmetryOrder = lcm(permutationOrder, rotationOrder);

  return {
    accepted: true,
    bake: createLoopFromSymmetry({
      canonicalMass: pattern.canonicalMass,
      p1: optimizedSymmetry.p1,
      p2: optimizedSymmetry.p2,
      snappedAngle,
      symmetryOrder,
      symmetryPerm: optimizedSymmetry.perm,
      symmetryPeriod: optimizedSymmetry.normalizedPeriod,
      worldScale: pattern.worldScale,
    }),
    id: pattern.id,
    label: pattern.label,
    reason: `symmetry-${symmetryOrder}`,
    score: optimizedSymmetry.score,
  };
};

const generateOutput = (accepted, rejected) => {
  const formattedTracks = accepted
    .map((pattern) => {
      const samples = pattern.bake.samples
        .map(
          (frame) =>
            `    [[${frame[0].join(", ")}], [${frame[1].join(", ")}], [${frame[2].join(", ")}]]`,
        )
        .join(",\n");

      return `  {
    patternId: "${pattern.id}",
    label: ${JSON.stringify(pattern.label)},
    periodSec: ${pattern.bake.periodSec},
    validation: {
      mode: "${pattern.reason}",
      score: ${Number(pattern.score.toFixed(6))},
    },
    samples: [
${samples}
    ],
  }`;
    })
    .join(",\n");

  const rejectedSummary = rejected
    .map(
      (pattern) =>
        `// ${pattern.id} (${pattern.label}) - ${pattern.reason}, score ${pattern.score.toFixed(4)}`,
    )
    .join("\n");

  return `// This file is generated by scripts/bake-orbit-pattern-tracks.mjs.
// Do not edit manually.
//
// Rejected candidates during the last bake:
${rejectedSummary || "// none"}

export const BAKED_ORBIT_PATTERN_TRACKS = [
${formattedTracks}
] as const;

export const BAKED_ORBIT_PATTERN_IDS = BAKED_ORBIT_PATTERN_TRACKS.map(
  (track) => track.patternId,
);
`;
};

const main = () => {
  const patterns = parseCatalog();
  const accepted = [];
  const rejected = [];

  for (const pattern of patterns) {
    const result = validatePattern(pattern);
    const logLine = `${result.accepted ? "accepted" : "rejected"} ${result.id} (${result.label}) via ${result.reason} score=${result.score.toFixed(6)}`;
    console.log(logLine);

    if (result.accepted) {
      accepted.push(result);
    } else {
      rejected.push(result);
    }
  }

  accepted.sort((left, right) => left.label.localeCompare(right.label));
  fs.writeFileSync(OUTPUT_PATH, generateOutput(accepted, rejected));
  console.log(`wrote ${accepted.length} baked tracks to ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
};

main();
