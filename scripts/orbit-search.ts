import {
  EPS2,
  FIXED_STEP_SEC,
  G,
  SIM_HZ,
  add,
  clamp,
  dist,
  fromAngle,
  len,
  mulberry32,
  nextFloat,
  normalize,
  scale,
  stepSuns,
  sub,
} from "@3body/shared";
import type { Sun, Vec2 } from "@3body/shared";
import {
  createSandboxState,
  findMinPlanetSunGap,
  findMinSunSunGap,
  getSandboxResetReason,
  stepSandbox,
} from "../src/frontend/src/game/orbitSandbox";
import type {
  OrbitPlanetSeed,
  OrbitPreset,
} from "../src/frontend/src/game/orbitPresets";
import { DEFAULT_ORBIT_PRESET } from "../src/frontend/src/game/orbitPresets";

const DT = FIXED_STEP_SEC;
const SUN_SEARCH_COUNT = 640;
const PLANET_PACK_SEARCH_COUNT = 720;
const SUN_SIM_SEC = 75;
const FULL_SIM_SEC = 75;
const CLOSE_PASS_GAP = 150;
const SUN_SAMPLE_INTERVAL = 12;
const FULL_SAMPLE_INTERVAL = 6;

const SUN_COLORS = [
  {
    color: "#ffd36a",
    glowColor: "#ffefb5",
    label: "small",
    radius: 96,
    mass: 220_000,
  },
  {
    color: "#ffb347",
    glowColor: "#ffd6ae",
    label: "medium",
    radius: 132,
    mass: 220_000,
  },
  {
    color: "#fff1a1",
    glowColor: "#fff8d0",
    label: "large",
    radius: 164,
    mass: 220_000,
  },
] as const;

const PLANET_VISUALS = [
  { color: "#8ad8ff", trailColor: "#8ad8ff", label: "I", risk: "inner" },
  { color: "#f89bc7", trailColor: "#f89bc7", label: "II", risk: "inner" },
  { color: "#9df2ae", trailColor: "#9df2ae", label: "III", risk: "transfer" },
  { color: "#ffd98c", trailColor: "#ffd98c", label: "IV", risk: "transfer" },
  { color: "#b8b0ff", trailColor: "#b8b0ff", label: "V", risk: "transfer" },
  { color: "#ff9e9e", trailColor: "#ff9e9e", label: "VI", risk: "outer" },
  { color: "#c5f2ff", trailColor: "#c5f2ff", label: "VII", risk: "outer" },
] as const satisfies ReadonlyArray<{
  color: string;
  trailColor: string;
  label: string;
  risk: OrbitPlanetSeed["risk"];
}>;

interface SunEvaluation {
  score: number;
  collisionTimeSec: number;
  minSunGap: number;
  averageDeformation: number;
  deformationSwing: number;
  longestEdgeSwaps: number;
  maxSunRadius: number;
  preset: OrbitPreset;
}

interface PlanetStats {
  timeInsideBandSec: number;
  minGap: number;
  closePassCount: number;
  aliveAt60: boolean;
  aliveAtEnd: boolean;
}

interface FullEvaluation {
  score: number;
  resetAtSec: number;
  aliveAt20: number;
  aliveAt60: number;
  aliveAtEnd: number;
  innerBandPlanets: number;
  closePassPlanets: number;
  totalClosePasses: number;
  outerSurvivorsAt60: number;
  minSunGap: number;
  minPlanetSunGap: number;
  minPlanetPlanetGap: number;
  preset: OrbitPreset;
}

interface FullSearchResult {
  passing: FullEvaluation[];
  ranked: FullEvaluation[];
}

const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const makeTangentialVelocity = (pos: Vec2, speed: number): Vec2 =>
  scale(
    {
      x: -pos.y,
      y: pos.x,
    },
    speed / Math.max(len(pos), 1),
  );

const weightedCenter = <T extends { pos: Vec2; mass: number }>(
  bodies: readonly T[],
): Vec2 => {
  const totalMass = bodies.reduce((sum, body) => sum + body.mass, 0);

  return bodies.reduce(
    (center, body) => add(center, scale(body.pos, body.mass / totalMass)),
    { x: 0, y: 0 },
  );
};

const weightedVelocity = <T extends { vel: Vec2; mass: number }>(
  bodies: readonly T[],
): Vec2 => {
  const totalMass = bodies.reduce((sum, body) => sum + body.mass, 0);

  return bodies.reduce(
    (center, body) => add(center, scale(body.vel, body.mass / totalMass)),
    { x: 0, y: 0 },
  );
};

const computeStableSunSpeed = (orbitRadius: number, meanMass: number): number =>
  Math.sqrt(
    (Math.sqrt(3) * G * meanMass * orbitRadius) /
      (3 * orbitRadius * orbitRadius + EPS2),
  );

const computeApproxOrbitSpeed = (radius: number, totalMass: number): number =>
  Math.sqrt((G * totalMass * radius) / (radius * radius + EPS2));

const createSunPreset = (seed: number): OrbitPreset => {
  const rng = mulberry32(seed);
  const baseRadius = nextFloat(rng, 670, 760);
  const meanMass = average(SUN_COLORS.map((sun) => sun.mass));
  const speedBase =
    computeStableSunSpeed(baseRadius, meanMass) * nextFloat(rng, 0.997, 1.006);
  const globalPhase = nextFloat(rng, -0.2, 0.2);
  const angleBias = nextFloat(rng, -0.028, 0.028);
  const angleBiasB = nextFloat(rng, -0.016, 0.016);
  const radiusBias = nextFloat(rng, -16, 16);
  const radiusBiasB = nextFloat(rng, -8, 8);
  const speedBias = nextFloat(rng, -0.009, 0.009);
  const speedBiasB = nextFloat(rng, -0.004, 0.004);
  const radialBias = nextFloat(rng, -3.2, 3.2);
  const radialBiasB = nextFloat(rng, -1.6, 1.6);
  const angleOffsets = [
    angleBias,
    -angleBias * 0.55 + angleBiasB,
    -angleBias * 0.45 - angleBiasB,
  ];
  const radiusOffsets = [
    radiusBias,
    -radiusBias * 0.4 + radiusBiasB,
    -radiusBias * 0.6 - radiusBiasB,
  ];
  const speedScales = [
    1 + speedBias,
    1 - speedBias * 0.42 + speedBiasB,
    1 - speedBias * 0.58 - speedBiasB,
  ];
  const radialKicks = [
    radialBias,
    -radialBias * 0.42 + radialBiasB,
    -radialBias * 0.58 - radialBiasB,
  ];
  const rawSuns = SUN_COLORS.map((sun, index) => {
    const angle =
      globalPhase +
      index * ((Math.PI * 2) / 3) +
      angleOffsets[index]!;
    const radius = baseRadius + radiusOffsets[index]!;

    return {
      ...sun,
      id: index + 1,
      pos: scale(fromAngle(angle), radius),
      speedScale: speedScales[index]!,
      radialKick: radialKicks[index]!,
    };
  });

  const center = weightedCenter(rawSuns);
  const recentered = rawSuns.map((sun) => ({
    ...sun,
    pos: sub(sun.pos, center),
  }));
  const withVelocity = recentered.map((sun) => {
    const tangential = makeTangentialVelocity(sun.pos, speedBase * sun.speedScale);
    const radial = scale(
      normalize(sun.pos),
      sun.radialKick,
    );

    return {
      ...sun,
      vel: add(tangential, radial),
    };
  });
  const centerVelocity = weightedVelocity(withVelocity);

  return {
    id: `candidate-${seed}`,
    label: `candidate-${seed}`,
    resetPolicy: {
      earlyWindowSec: 18,
      minAliveDuringEarlyWindow: 2,
    },
    suns: withVelocity.map((sun) => ({
      id: sun.id,
      label: sun.label,
      color: sun.color,
      glowColor: sun.glowColor,
      mass: sun.mass,
      radius: sun.radius,
      pos: {
        x: sun.pos.x,
        y: sun.pos.y,
      },
      vel: sub(sun.vel, centerVelocity),
    })),
    planets: [],
  };
};

const evaluateSunPreset = (preset: OrbitPreset): SunEvaluation => {
  let suns: Sun[] = preset.suns.map((sun) => ({
    id: sun.id,
    kind: "sun",
    mass: sun.mass,
    radius: sun.radius,
    pos: { x: sun.pos.x, y: sun.pos.y },
    vel: { x: sun.vel.x, y: sun.vel.y },
  }));
  let minSunGap = findMinSunSunGap(suns);
  let collisionTimeSec = SUN_SIM_SEC;
  let longestEdgeSwaps = 0;
  let lastLongestEdge = -1;
  let deformationMin = Number.POSITIVE_INFINITY;
  let deformationMax = 0;
  let deformationTotal = 0;
  let deformationSamples = 0;
  let maxSunRadius = 0;

  for (let tick = 1; tick <= SUN_SIM_SEC * SIM_HZ; tick += 1) {
    suns = stepSuns(suns, DT);
    minSunGap = Math.min(minSunGap, findMinSunSunGap(suns));
    maxSunRadius = Math.max(maxSunRadius, ...suns.map((sun) => len(sun.pos)));

    if (tick % SUN_SAMPLE_INTERVAL === 0) {
      const edges = [
        dist(suns[0]!.pos, suns[1]!.pos),
        dist(suns[1]!.pos, suns[2]!.pos),
        dist(suns[2]!.pos, suns[0]!.pos),
      ];
      const deformation = Math.max(...edges) - Math.min(...edges);
      const longestEdge = edges.indexOf(Math.max(...edges));

      deformationMin = Math.min(deformationMin, deformation);
      deformationMax = Math.max(deformationMax, deformation);
      deformationTotal += deformation;
      deformationSamples += 1;

      if (lastLongestEdge !== -1 && longestEdge !== lastLongestEdge) {
        longestEdgeSwaps += 1;
      }
      lastLongestEdge = longestEdge;
    }

    if (findMinSunSunGap(suns) <= 0) {
      collisionTimeSec = tick * DT;
      break;
    }
  }

  const averageDeformation =
    deformationSamples > 0 ? deformationTotal / deformationSamples : 0;
  const deformationSwing =
    Number.isFinite(deformationMin) && deformationSamples > 0
      ? deformationMax - deformationMin
      : 0;
  const score =
    collisionTimeSec * 18 +
    clamp(averageDeformation, 0, 260) * 7 +
    clamp(deformationSwing, 0, 360) * 4 +
    clamp(longestEdgeSwaps, 0, 18) * 45 -
    Math.max(0, 120 - minSunGap) * 12 -
    Math.max(0, 60 - collisionTimeSec) * 220 -
    Math.max(0, 80 - averageDeformation) * 22 -
    Math.max(0, averageDeformation - 360) * 10 -
    Math.max(0, maxSunRadius - 980) * 8;

  return {
    score,
    collisionTimeSec,
    minSunGap,
    averageDeformation,
    deformationSwing,
    longestEdgeSwaps,
    maxSunRadius,
    preset,
  };
};

const pickTopSunSeeds = (): SunEvaluation[] => {
  const candidates = Array.from({ length: SUN_SEARCH_COUNT }, (_, index) =>
    evaluateSunPreset(createSunPreset(2_000 + index)),
  );
  const filtered = candidates.filter(
      (candidate) =>
        candidate.collisionTimeSec >= 60 &&
        candidate.averageDeformation >= 45 &&
        candidate.averageDeformation <= 420 &&
        candidate.deformationSwing <= 520 &&
        candidate.minSunGap >= 80 &&
      candidate.maxSunRadius <= 980,
  );

  return (filtered.length > 0 ? filtered : candidates)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};

const makePlanetSeed = (
  index: number,
  totalSunMass: number,
  globalPhase: number,
  rng: ReturnType<typeof mulberry32>,
): OrbitPlanetSeed => {
  const visual = PLANET_VISUALS[index]!;
  const radiusRange =
    visual.risk === "inner"
      ? [760, 930]
      : visual.risk === "transfer"
        ? [930, 1260]
        : [1240, 1560];
  const speedScaleRange =
    visual.risk === "inner"
      ? [0.85, 1.01]
      : visual.risk === "transfer"
        ? [0.82, 1.04]
        : [0.95, 1.07];
  const radialKickRange =
    visual.risk === "inner"
      ? [-90, 70]
      : visual.risk === "transfer"
        ? [-120, 60]
        : [-55, 40];
  const orbitRadius = nextFloat(rng, radiusRange[0], radiusRange[1]);
  const angle =
    globalPhase +
    index * ((Math.PI * 2) / PLANET_VISUALS.length) +
    nextFloat(rng, -0.24, 0.24);
  const pos = scale(fromAngle(angle), orbitRadius);
  const orbitSpeed =
    computeApproxOrbitSpeed(orbitRadius, totalSunMass) *
    nextFloat(rng, speedScaleRange[0], speedScaleRange[1]);
  const tangential = makeTangentialVelocity(pos, orbitSpeed);
  const radial = scale(
    normalize(pos),
    nextFloat(rng, radialKickRange[0], radialKickRange[1]),
  );

  return {
    id: 101 + index,
    label: visual.label,
    color: visual.color,
    trailColor: visual.trailColor,
    risk: visual.risk,
    radius: visual.risk === "outer" ? 32 : 30,
    pos,
    vel: add(tangential, radial),
  };
};

const createPlanetPreset = (sunPreset: OrbitPreset, seed: number): OrbitPreset => {
  const rng = mulberry32(seed);
  const totalSunMass = sunPreset.suns.reduce((sum, sun) => sum + sun.mass, 0);
  const globalPhase = nextFloat(rng, -Math.PI, Math.PI);
  const planets = PLANET_VISUALS.map((_, index) =>
    makePlanetSeed(index, totalSunMass, globalPhase, rng),
  );

  return {
    ...sunPreset,
    id: `${sunPreset.id}-pack-${seed}`,
    label: `pack-${seed}`,
    planets,
  };
};

const evaluateFullPreset = (preset: OrbitPreset): FullEvaluation => {
  const planetStats = new Map<number, PlanetStats>();
  for (const planet of preset.planets) {
    planetStats.set(planet.id, {
      timeInsideBandSec: 0,
      minGap: Number.POSITIVE_INFINITY,
      closePassCount: 0,
      aliveAt60: true,
      aliveAtEnd: true,
    });
  }

  let state = createSandboxState(preset);
  let minSunGap = findMinSunSunGap(state.suns);
  let minPlanetSunGap = findMinPlanetSunGap(state.planets, state.suns);
  let minPlanetPlanetGap = Number.POSITIVE_INFINITY;
  let aliveAt20 = state.planets.length;
  let aliveAt60 = state.planets.length;
  let resetAtSec = FULL_SIM_SEC;
  const closePassOpen = new Set<number>();

  for (let tick = 1; tick <= FULL_SIM_SEC * SIM_HZ; tick += 1) {
    state = stepSandbox(state);
    const resetReason = getSandboxResetReason(state);
    minSunGap = Math.min(minSunGap, findMinSunSunGap(state.suns));
    minPlanetSunGap = Math.min(
      minPlanetSunGap,
      findMinPlanetSunGap(state.planets, state.suns),
    );

    if (tick % FULL_SAMPLE_INTERVAL === 0) {
      const sunRadii = state.suns.map((sun) => len(sun.pos));
      const bandMin = Math.min(...sunRadii) - 180;
      const bandMax = Math.max(...sunRadii) + 180;
      const alivePlanets = state.planets.filter((planet) => planet.alive);

      for (const planet of state.planets) {
        const stats = planetStats.get(planet.id)!;
        if (!planet.alive) {
          stats.aliveAtEnd = false;
          if (tick <= 60 * SIM_HZ) {
            stats.aliveAt60 = false;
          }
          closePassOpen.delete(planet.id);
          continue;
        }

        const orbitalRadius = len(planet.pos);
        if (orbitalRadius >= bandMin && orbitalRadius <= bandMax) {
          stats.timeInsideBandSec += DT * FULL_SAMPLE_INTERVAL;
        }

        let localMinGap = Number.POSITIVE_INFINITY;
        for (const sun of state.suns) {
          localMinGap = Math.min(
            localMinGap,
            dist(planet.pos, sun.pos) - planet.radius - sun.radius,
          );
        }
        stats.minGap = Math.min(stats.minGap, localMinGap);

        if (localMinGap <= CLOSE_PASS_GAP) {
          if (!closePassOpen.has(planet.id)) {
            stats.closePassCount += 1;
            closePassOpen.add(planet.id);
          }
        } else {
          closePassOpen.delete(planet.id);
        }
      }

      for (let index = 0; index < alivePlanets.length; index += 1) {
        for (
          let otherIndex = index + 1;
          otherIndex < alivePlanets.length;
          otherIndex += 1
        ) {
          minPlanetPlanetGap = Math.min(
            minPlanetPlanetGap,
            dist(alivePlanets[index]!.pos, alivePlanets[otherIndex]!.pos) -
              alivePlanets[index]!.radius -
              alivePlanets[otherIndex]!.radius,
          );
        }
      }
    }

    if (tick === 20 * SIM_HZ) {
      aliveAt20 = state.planets.filter((planet) => planet.alive).length;
    }

    if (tick === 60 * SIM_HZ) {
      aliveAt60 = state.planets.filter((planet) => planet.alive).length;
      for (const planet of state.planets) {
        if (!planet.alive) {
          planetStats.get(planet.id)!.aliveAt60 = false;
        }
      }
    }

    if (resetReason !== null) {
      if (tick < 20 * SIM_HZ) {
        aliveAt20 = state.planets.filter((planet) => planet.alive).length;
      }
      if (tick < 60 * SIM_HZ) {
        aliveAt60 = state.planets.filter((planet) => planet.alive).length;
        for (const planet of state.planets) {
          if (!planet.alive) {
            planetStats.get(planet.id)!.aliveAt60 = false;
          }
        }
      }
      resetAtSec = state.elapsedSec;
      break;
    }
  }

  const statsList = [...planetStats.values()];
  const innerBandPlanets = statsList.filter(
    (stats) => stats.timeInsideBandSec >= 8,
  ).length;
  const closePassPlanets = statsList.filter(
    (stats) => stats.closePassCount >= 1,
  ).length;
  const totalClosePasses = statsList.reduce(
    (sum, stats) => sum + stats.closePassCount,
    0,
  );
  const outerSurvivorsAt60 = preset.planets.filter(
    (planet) => planet.risk === "outer" && planetStats.get(planet.id)!.aliveAt60,
  ).length;
  const aliveAtEnd = state.planets.filter((planet) => planet.alive).length;
  const score =
    resetAtSec * 32 +
    aliveAt60 * 220 +
    aliveAtEnd * 120 +
    innerBandPlanets * 180 +
    closePassPlanets * 150 +
    totalClosePasses * 24 +
    outerSurvivorsAt60 * 120 +
    clamp(minPlanetPlanetGap, 0, 240) * 2 -
    Math.max(0, 60 - resetAtSec) * 320 -
    Math.max(0, 4 - aliveAt20) * 600 -
    Math.max(0, 3 - aliveAt60) * 800 -
    Math.max(0, 3 - innerBandPlanets) * 340 -
    Math.max(0, 3 - closePassPlanets) * 300 -
    Math.max(0, 120 - minPlanetPlanetGap) * 10;

  return {
    score,
    resetAtSec,
    aliveAt20,
    aliveAt60,
    aliveAtEnd,
    innerBandPlanets,
    closePassPlanets,
    totalClosePasses,
    outerSurvivorsAt60,
    minSunGap,
    minPlanetSunGap,
    minPlanetPlanetGap,
    preset,
  };
};

const searchFullPresets = (
  sunCandidates: readonly SunEvaluation[],
): FullSearchResult => {
  const allCandidates: FullEvaluation[] = [];

  for (const [sunIndex, sunCandidate] of sunCandidates.entries()) {
    for (let packIndex = 0; packIndex < PLANET_PACK_SEARCH_COUNT; packIndex += 1) {
      const seed = 8_000 + sunIndex * PLANET_PACK_SEARCH_COUNT + packIndex;
      const preset = createPlanetPreset(sunCandidate.preset, seed);
      allCandidates.push(evaluateFullPreset(preset));
    }
  }

  const ranked = [...allCandidates].sort((a, b) => b.score - a.score);
  const passing = ranked.filter(
    (candidate) =>
      candidate.resetAtSec >= 60 &&
      candidate.aliveAt60 >= 3 &&
      candidate.innerBandPlanets >= 3 &&
      candidate.closePassPlanets >= 3 &&
      candidate.minPlanetPlanetGap >= 90,
  );

  return {
    passing,
    ranked,
  };
};

const round = (value: number): number => Math.round(value * 10) / 10;

const formatVec2 = (vec: Vec2): string =>
  `{ x: ${round(vec.x)}, y: ${round(vec.y)} }`;

const formatPreset = (preset: OrbitPreset): string => `{
  id: "${preset.id}",
  label: "${preset.label}",
  resetPolicy: {
    earlyWindowSec: ${preset.resetPolicy.earlyWindowSec},
    minAliveDuringEarlyWindow: ${preset.resetPolicy.minAliveDuringEarlyWindow},
  },
  suns: [
${preset.suns
  .map(
    (sun) => `    {
      id: ${sun.id},
      label: "${sun.label}",
      color: "${sun.color}",
      glowColor: "${sun.glowColor}",
      mass: ${sun.mass.toLocaleString("en-US").replace(/,/g, "_")},
      radius: ${sun.radius},
      pos: ${formatVec2(sun.pos)},
      vel: ${formatVec2(sun.vel)},
    }`,
  )
  .join(",\n")}
  ],
  planets: [
${preset.planets
  .map(
    (planet) => `    {
      id: ${planet.id},
      label: "${planet.label}",
      color: "${planet.color}",
      trailColor: "${planet.trailColor}",
      risk: "${planet.risk}",
      radius: ${planet.radius},
      pos: ${formatVec2(planet.pos)},
      vel: ${formatVec2(planet.vel)},
    }`,
  )
  .join(",\n")}
  ],
}`;

const logSunCandidates = (sunCandidates: readonly SunEvaluation[]) => {
  console.log("Top sun seeds");
  for (const [index, candidate] of sunCandidates.entries()) {
    console.log(
      [
        `${index + 1}. ${candidate.preset.id}`,
        `score=${round(candidate.score)}`,
        `collision=${round(candidate.collisionTimeSec)}s`,
        `minGap=${round(candidate.minSunGap)}`,
        `avgDef=${round(candidate.averageDeformation)}`,
        `swing=${round(candidate.deformationSwing)}`,
        `swaps=${candidate.longestEdgeSwaps}`,
        `maxRadius=${round(candidate.maxSunRadius)}`,
      ].join(" | "),
    );
  }
};

const logFullCandidate = (label: string, evaluation: FullEvaluation) => {
  console.log(label);
  console.log(
    [
      `score=${round(evaluation.score)}`,
      `resetAt=${round(evaluation.resetAtSec)}s`,
      `alive@20=${evaluation.aliveAt20}`,
      `alive@60=${evaluation.aliveAt60}`,
      `alive@end=${evaluation.aliveAtEnd}`,
      `innerBandPlanets=${evaluation.innerBandPlanets}`,
      `closePassPlanets=${evaluation.closePassPlanets}`,
      `totalClosePasses=${evaluation.totalClosePasses}`,
      `outerSurvivors@60=${evaluation.outerSurvivorsAt60}`,
      `minSunGap=${round(evaluation.minSunGap)}`,
      `minPlanetSunGap=${round(evaluation.minPlanetSunGap)}`,
      `minPlanetPlanetGap=${round(evaluation.minPlanetPlanetGap)}`,
    ].join(" | "),
  );
};

const logFullCandidates = (label: string, evaluations: readonly FullEvaluation[]) => {
  console.log(label);
  for (const [index, evaluation] of evaluations.entries()) {
    console.log(
      [
        `${index + 1}. ${evaluation.preset.id}`,
        `score=${round(evaluation.score)}`,
        `resetAt=${round(evaluation.resetAtSec)}s`,
        `alive@20=${evaluation.aliveAt20}`,
        `alive@60=${evaluation.aliveAt60}`,
        `alive@end=${evaluation.aliveAtEnd}`,
        `innerBand=${evaluation.innerBandPlanets}`,
        `closePass=${evaluation.closePassPlanets}`,
        `passes=${evaluation.totalClosePasses}`,
        `outer@60=${evaluation.outerSurvivorsAt60}`,
        `minSunGap=${round(evaluation.minSunGap)}`,
        `minPlanetSunGap=${round(evaluation.minPlanetSunGap)}`,
        `minPlanetGap=${round(evaluation.minPlanetPlanetGap)}`,
      ].join(" | "),
    );
  }
};

const baseline = evaluateFullPreset(DEFAULT_ORBIT_PRESET);
logFullCandidate("Current preset", baseline);

const sunCandidates = pickTopSunSeeds();
logSunCandidates(sunCandidates);

const fullSearch = searchFullPresets(sunCandidates);
logFullCandidates("Top full-system candidates", fullSearch.ranked.slice(0, 5));

const bestPreset = fullSearch.passing[0] ?? null;
if (bestPreset) {
  logFullCandidate("Best passing candidate", bestPreset);
  console.log("Preset snippet");
  console.log(formatPreset(bestPreset.preset));
} else {
  console.log("No planet pack passed the current acceptance filters.");
}
