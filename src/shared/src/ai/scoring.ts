import { ARCHETYPES } from "../archetypes";
import {
  BOOST_SPEC,
  GRAVITY_PULSE_RADIUS,
  PLANET_HP,
  ROCKET_SPECS,
} from "../constants";
import type {
  Cache,
  CacheContents,
  EntityId,
  PlanetPrivateState,
  PlanetPublic,
  Rocket,
  RocketKind,
  Sun,
  World,
} from "../entities";
import {
  advanceWorldOrbitStarMotion,
  stepSunsWithOrbitMotion,
} from "../orbitPatternTracks";
import { stepBody, stepSeeker } from "../physics";
import type { BotDifficulty } from "../protocol";
import type { Vec2 } from "../vec2";
import {
  add,
  dist,
  dot,
  fromAngle,
  len,
  lenSq,
  normalize,
  rot,
  scale,
  sub,
} from "../vec2";
import { clamp01 } from "./blackboard";
import { COMBAT_AI_TUNING } from "./runtimeTuning";
import type {
  CombatAiMoveGoal,
  CombatAiMoveGoalBreakdown,
  CombatAiShotScore,
  CombatAiTargetFact,
} from "./types";

const DEFAULT_DIR: Vec2 = { x: 1, y: 0 };

interface PredictedPoint {
  pos: Vec2;
  timeSec: number;
}

interface PredictedTarget {
  target: PlanetPublic;
  points: PredictedPoint[];
  chaosScore: number;
}

interface MovementCandidateSpec {
  dir: Vec2;
  kind: CombatAiMoveGoal["kind"];
  label: string;
  targetCacheId?: number;
  usesBoost: boolean;
}

interface MovementIntentMetrics {
  escapeAlignment: number;
  lineOfFire: number;
  orbitBand: number;
  pressure: number;
  resource: number;
  exploration: number;
  rocketAvoidance: number;
  survival: number;
  targetProgress: number;
}

interface PredictedPlanetPath {
  planet: PlanetPublic;
  positions: Vec2[];
}

interface EvaluatedMoveGoal {
  goal: CombatAiMoveGoal;
  safetyScore: number;
  safe: boolean;
}

const MOVEMENT_CANDIDATE_LIMIT_IDLE = 12;
const MOVEMENT_CANDIDATE_LIMIT_TACTICAL = 30;
const MOVEMENT_ROCKET_TRACK_RADIUS = 1_600;
const MAX_TRACKED_MOVEMENT_ROCKETS = 4;
const MOVEMENT_SAFE_SURVIVAL_FLOOR = 0.34;
const MOVEMENT_SAFE_BOUNDARY_RATIO_FLOOR = 0.12;
const MOVEMENT_SAFE_SUN_CLEARANCE_FLOOR = 0.14;
const MOVEMENT_SAFE_BLACK_HOLE_FLOOR = 0.14;
const MOVEMENT_SAFE_ROCKET_CLEARANCE_FLOOR = 0.08;
const MOVEMENT_SAFE_PLANET_CLEARANCE_FLOOR = 0.12;
const MOVEMENT_HARD_BOUNDARY_MARGIN = 28;
const MOVEMENT_HARD_SUN_MARGIN = 32;
const MOVEMENT_HARD_NEUTRON_MARGIN = 40;
const MOVEMENT_HARD_BLACK_HOLE_MARGIN = 56;
const MOVEMENT_HARD_PLANET_MARGIN = 24;
const MOVEMENT_HARD_ROCKET_MARGIN = 16;
const MOVEMENT_ORBIT_RADIUS_RATIO = 0.54;
const MOVEMENT_BOUNDARY_CAREFUL_RATIO = 0.64;
const MOVEMENT_BOUNDARY_OUTWARD_VETO_RATIO = 0.7;

const normalizeDir = (dir: Vec2, fallback: Vec2 = DEFAULT_DIR): Vec2 => {
  const normalized = normalize(dir);
  return len(normalized) === 0 ? { ...fallback } : normalized;
};

const inwardDir = (pos: Vec2): Vec2 =>
  normalizeDir(scale(pos, -1), DEFAULT_DIR);

const cloneSuns = (suns: readonly Sun[]): Sun[] =>
  suns.map((sun) => ({
    ...sun,
    pos: { ...sun.pos },
    vel: { ...sun.vel },
  }));

const clonePlanet = (planet: PlanetPublic): PlanetPublic => ({
  ...planet,
  pos: { ...planet.pos },
  vel: { ...planet.vel },
  shieldAimDir: { ...planet.shieldAimDir },
  debuffs: { ...planet.debuffs },
});

const cloneRocket = (rocket: Rocket): Rocket => ({
  ...rocket,
  pos: { ...rocket.pos },
  vel: { ...rocket.vel },
});

const tangentLeft = (dir: Vec2, fallback: Vec2): Vec2 =>
  normalizeDir({ x: -dir.y, y: dir.x }, fallback);

const tangentRight = (dir: Vec2, fallback: Vec2): Vec2 =>
  normalizeDir({ x: dir.y, y: -dir.x }, fallback);

const blendDirs = (
  primary: Vec2,
  primaryWeight: number,
  secondary: Vec2,
  secondaryWeight: number,
  fallback: Vec2,
): Vec2 =>
  normalizeDir(
    add(scale(primary, primaryWeight), scale(secondary, secondaryWeight)),
    fallback,
  );

const zeroVec = (): Vec2 => ({ x: 0, y: 0 });

const choosePreferredOrbitTangents = ({
  fallback,
  objectiveDir,
  objectiveVel,
  self,
}: {
  fallback: Vec2;
  objectiveDir: Vec2;
  objectiveVel: Vec2 | null;
  self: PlanetPublic;
}): { primary: Vec2; secondary: Vec2 } => {
  const left = tangentLeft(objectiveDir, fallback);
  const right = tangentRight(objectiveDir, fallback);
  const relativeVel = normalizeDir(
    sub(self.vel, objectiveVel ?? zeroVec()),
    normalizeDir(self.vel, left),
  );
  return dot(relativeVel, left) >= dot(relativeVel, right)
    ? { primary: left, secondary: right }
    : { primary: right, secondary: left };
};

const directionKey = (dir: Vec2): string =>
  `${Math.round(dir.x * 100)}:${Math.round(dir.y * 100)}`;

const fanDirections = (dir: Vec2, fanoutRad: number): Vec2[] => {
  if (fanoutRad <= 0) {
    return [dir];
  }

  return [
    dir,
    rot(dir, fanoutRad * 0.5),
    rot(dir, -fanoutRad * 0.5),
    rot(dir, fanoutRad),
    rot(dir, -fanoutRad),
  ];
};

const scoreMovementRocketThreat = (
  self: PlanetPublic,
  rocket: Rocket,
): number => {
  const distance = dist(self.pos, rocket.pos);
  const proximity = clamp01(1 - distance / MOVEMENT_ROCKET_TRACK_RADIUS);
  const targetingBonus = rocket.targetId === self.id ? 1.2 : 0;
  const seekerBonus = rocket.rocketKind === "seeker" ? 0.22 : 0;
  return proximity + targetingBonus + seekerBonus;
};

const selectMovementThreatRockets = (
  self: PlanetPublic,
  rockets: readonly Rocket[],
): Rocket[] =>
  rockets
    .filter((rocket) => {
      if (rocket.ownerId === self.playerId) {
        return false;
      }

      return (
        rocket.targetId === self.id ||
        rocket.rocketKind === "seeker" ||
        dist(self.pos, rocket.pos) <= MOVEMENT_ROCKET_TRACK_RADIUS
      );
    })
    .sort(
      (left, right) =>
        scoreMovementRocketThreat(self, right) -
        scoreMovementRocketThreat(self, left),
    )
    .slice(0, MAX_TRACKED_MOVEMENT_ROCKETS)
    .map(cloneRocket);

const buildHazardPressureDir = (
  self: PlanetPublic,
  world: World,
  fallback: Vec2,
): Vec2 => {
  let composite = scale(
    inwardDir(self.pos),
    clamp01(
      (len(self.pos) - world.arenaRadius * 0.66) / (world.arenaRadius * 0.18),
    ) * 1.1,
  );

  for (const sun of world.suns) {
    const gap = dist(self.pos, sun.pos) - self.radius - sun.radius;
    const weight = clamp01(1 - gap / 540);
    composite = add(
      composite,
      scale(normalizeDir(sub(self.pos, sun.pos), fallback), weight * 1.25),
    );
  }

  for (const neutronStar of world.neutronStars) {
    const gap =
      dist(self.pos, neutronStar.pos) - self.radius - neutronStar.radius;
    const weight = clamp01(1 - gap / 620);
    composite = add(
      composite,
      scale(
        normalizeDir(sub(self.pos, neutronStar.pos), fallback),
        weight * 1.15,
      ),
    );
  }

  if (world.blackHole) {
    const margin = len(self.pos) - world.blackHole.killRadius;
    const weight = clamp01(
      1 - margin / Math.max(260, world.blackHole.killRadius),
    );
    composite = add(
      composite,
      scale(normalizeDir(self.pos, fallback), weight * 1.4),
    );
  }

  for (const rocket of world.rockets) {
    if (rocket.ownerId === self.playerId) {
      continue;
    }

    const away = sub(self.pos, rocket.pos);
    const distance = Math.max(1, len(away));
    const weight = clamp01(1 - distance / 900);
    composite = add(
      composite,
      scale(normalizeDir(away, fallback), weight * 1.6),
    );
  }

  return lenSq(composite) === 0 ? fallback : normalizeDir(composite, fallback);
};

const buildMovementCandidates = ({
  bestCache,
  exploreTargetPos,
  holdDir,
  objectiveFanoutRad,
  self,
  target,
  targetInterceptPos,
  targetProjectedPos,
  topThreatEscapeDir,
  world,
}: {
  bestCache: Cache | null;
  exploreTargetPos: Vec2 | null;
  holdDir: Vec2;
  objectiveFanoutRad: number;
  self: PlanetPublic;
  target: PlanetPublic | null;
  targetInterceptPos: Vec2 | null;
  targetProjectedPos: Vec2 | null;
  topThreatEscapeDir: Vec2 | null;
  world: World;
}): MovementCandidateSpec[] => {
  const candidates: MovementCandidateSpec[] = [];
  const seen = new Set<string>();
  const inward = inwardDir(self.pos);
  const outward = normalizeDir(self.pos, inward);
  const orbitalLeft = tangentLeft(inward, holdDir);
  const orbitalRight = tangentRight(inward, holdDir);
  const prograde = normalizeDir(self.vel, orbitalLeft);
  const retrograde = scale(prograde, -1);
  const hazardPressureDir = buildHazardPressureDir(self, world, inward);
  const objectivePos =
    target?.pos ?? bestCache?.pos ?? exploreTargetPos ?? null;
  const objectiveVel = target?.vel ?? null;
  const sampleCount = Math.max(
    4,
    Math.round(COMBAT_AI_TUNING.movement.candidateDirections),
  );

  const pushCandidate = (
    dir: Vec2,
    label: string,
    {
      kind = "commit",
      targetCacheId,
      usesBoost = true,
    }: Partial<Omit<MovementCandidateSpec, "dir" | "label">> = {},
  ) => {
    const normalized = normalizeDir(dir, holdDir);
    const key = `${usesBoost ? "boost" : "hold"}:${kind}:${targetCacheId ?? "none"}:${directionKey(normalized)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      dir: normalized,
      kind,
      label,
      targetCacheId,
      usesBoost,
    });
  };

  pushCandidate(holdDir, "hold orbit", {
    kind: "hold",
    usesBoost: false,
  });
  pushCandidate(inward, "cut inward", { kind: "band" });
  pushCandidate(outward, "burn outward", { kind: "band" });
  pushCandidate(prograde, "carry prograde", { kind: "band" });
  pushCandidate(retrograde, "brake retrograde", { kind: "band" });
  pushCandidate(orbitalLeft, "orbit left", { kind: "band" });
  pushCandidate(orbitalRight, "orbit right", { kind: "band" });

  for (const dir of fanDirections(
    hazardPressureDir,
    objectiveFanoutRad * 0.7,
  )) {
    pushCandidate(dir, "hazard escape", { kind: "escape" });
  }

  if (topThreatEscapeDir !== null) {
    for (const dir of fanDirections(
      topThreatEscapeDir,
      objectiveFanoutRad * 0.85,
    )) {
      pushCandidate(dir, "threat escape", { kind: "escape" });
    }
  }

  if (bestCache !== null) {
    const toCache = normalizeDir(sub(bestCache.pos, self.pos), holdDir);
    const { primary, secondary } = choosePreferredOrbitTangents({
      fallback: holdDir,
      objectiveDir: toCache,
      objectiveVel: null,
      self,
    });
    for (const dir of fanDirections(toCache, objectiveFanoutRad * 0.65)) {
      pushCandidate(dir, "contest cache", {
        kind: "cache",
        targetCacheId: bestCache.id,
      });
    }
    pushCandidate(
      blendDirs(toCache, 0.62, primary, 0.82, holdDir),
      "cache sweep",
      {
        kind: "cache",
        targetCacheId: bestCache.id,
      },
    );
    pushCandidate(
      blendDirs(toCache, 0.54, secondary, 0.74, holdDir),
      "cache counter-sweep",
      {
        kind: "cache",
        targetCacheId: bestCache.id,
      },
    );
  }

  if (exploreTargetPos !== null) {
    const toExplore = normalizeDir(sub(exploreTargetPos, self.pos), holdDir);
    const { primary } = choosePreferredOrbitTangents({
      fallback: holdDir,
      objectiveDir: toExplore,
      objectiveVel: null,
      self,
    });
    for (const dir of fanDirections(toExplore, objectiveFanoutRad * 0.75)) {
      pushCandidate(dir, "explore sector", {
        kind: "explore",
      });
    }
    pushCandidate(
      blendDirs(toExplore, 0.55, primary, 0.8, holdDir),
      "explore sweep",
      {
        kind: "explore",
      },
    );
  }

  if (target !== null) {
    const toTarget = normalizeDir(sub(target.pos, self.pos), holdDir);
    const toIntercept = normalizeDir(
      sub(targetInterceptPos ?? target.pos, self.pos),
      toTarget,
    );
    const toProjected = normalizeDir(
      sub(targetProjectedPos ?? target.pos, self.pos),
      toIntercept,
    );
    const { primary, secondary } = choosePreferredOrbitTangents({
      fallback: holdDir,
      objectiveDir: toTarget,
      objectiveVel,
      self,
    });
    for (const dir of fanDirections(toIntercept, objectiveFanoutRad)) {
      pushCandidate(dir, "intercept target");
    }
    pushCandidate(primary, "swing orbit", { kind: "band" });
    pushCandidate(
      blendDirs(toIntercept, 0.72, primary, 0.9, holdDir),
      "arc in",
      { kind: "commit" },
    );
    pushCandidate(
      blendDirs(primary, 0.96, scale(toTarget, -1), 0.24, holdDir),
      "arc sweep",
      { kind: "band" },
    );
    pushCandidate(
      blendDirs(toIntercept, 0.66, secondary, 0.72, holdDir),
      "counter arc",
      { kind: "band" },
    );
    for (const dir of fanDirections(
      tangentLeft(toTarget, holdDir),
      objectiveFanoutRad * 0.45,
    )) {
      pushCandidate(dir, "flank left", { kind: "band" });
    }
    for (const dir of fanDirections(
      tangentRight(toTarget, holdDir),
      objectiveFanoutRad * 0.45,
    )) {
      pushCandidate(dir, "flank right", { kind: "band" });
    }
    pushCandidate(toProjected, "close future lane");
    pushCandidate(scale(toTarget, -1), "disengage target", { kind: "escape" });
  }

  if (objectivePos !== null && target === null) {
    const toObjective = normalizeDir(sub(objectivePos, self.pos), holdDir);
    const { primary } = choosePreferredOrbitTangents({
      fallback: holdDir,
      objectiveDir: toObjective,
      objectiveVel,
      self,
    });
    pushCandidate(primary, "objective orbit", {
      kind: bestCache !== null ? "cache" : "explore",
      targetCacheId: bestCache?.id,
    });
  }

  for (let index = 0; index < sampleCount; index += 1) {
    pushCandidate(
      fromAngle((Math.PI * 2 * index) / sampleCount),
      `search ${index + 1}`,
    );
  }

  return candidates.slice(
    0,
    target !== null || bestCache !== null || topThreatEscapeDir !== null
      ? MOVEMENT_CANDIDATE_LIMIT_TACTICAL
      : MOVEMENT_CANDIDATE_LIMIT_IDLE,
  );
};

const scoreObjectiveFlow = ({
  fallback,
  objectivePos,
  objectiveVel,
  predictedSelf,
}: {
  fallback: Vec2;
  objectivePos: Vec2;
  objectiveVel: Vec2 | null;
  predictedSelf: PlanetPublic;
}): number => {
  const toObjective = sub(objectivePos, predictedSelf.pos);
  if (lenSq(toObjective) === 0) {
    return 0;
  }

  const objectiveDir = normalizeDir(toObjective, fallback);
  const { primary } = choosePreferredOrbitTangents({
    fallback,
    objectiveDir,
    objectiveVel,
    self: predictedSelf,
  });
  return clamp01(
    (dot(normalizeDir(predictedSelf.vel, primary), primary) + 1) * 0.5,
  );
};

const scoreMovementIntent = (
  intentKind: Parameters<typeof estimateDesiredRange>[0],
  commitment: number,
  metrics: MovementIntentMetrics,
): number => {
  switch (intentKind) {
    case "survive":
      return (
        metrics.survival * 62 +
        metrics.rocketAvoidance * 18 +
        metrics.escapeAlignment * 14 +
        metrics.orbitBand * 12 +
        metrics.pressure * 12 +
        commitment * 18
      );
    case "recover":
      return (
        metrics.survival * 58 +
        metrics.resource * 30 +
        metrics.orbitBand * 16 +
        metrics.pressure * 12 +
        metrics.lineOfFire * 8 +
        commitment * 18
      );
    case "contestCache":
      return (
        metrics.survival * 50 +
        metrics.resource * 40 +
        metrics.pressure * 14 +
        metrics.lineOfFire * 10 +
        metrics.orbitBand * 8 +
        commitment * 18
      );
    case "explore":
      return (
        metrics.survival * 58 +
        metrics.exploration * 30 +
        metrics.resource * 18 +
        metrics.orbitBand * 14 +
        metrics.pressure * 8 +
        metrics.lineOfFire * 6 +
        commitment * 18
      );
    case "reposition":
      return (
        metrics.survival * 54 +
        metrics.orbitBand * 22 +
        metrics.pressure * 18 +
        metrics.lineOfFire * 18 +
        metrics.targetProgress * 10 +
        commitment * 18
      );
    case "pressure":
      return (
        metrics.survival * 44 +
        metrics.lineOfFire * 24 +
        metrics.targetProgress * 32 +
        metrics.pressure * 24 +
        metrics.orbitBand * 8 +
        commitment * 18
      );
    case "finish":
      return (
        metrics.survival * 48 +
        metrics.lineOfFire * 28 +
        metrics.targetProgress * 26 +
        metrics.pressure * 16 +
        metrics.orbitBand * 10 +
        commitment * 18
      );
    case "zoneWithHeavy":
      return (
        metrics.survival * 46 +
        metrics.lineOfFire * 34 +
        metrics.orbitBand * 18 +
        metrics.targetProgress * 14 +
        metrics.pressure * 14 +
        commitment * 16
      );
    case "lockSeeker":
      return (
        metrics.survival * 44 +
        metrics.lineOfFire * 30 +
        metrics.targetProgress * 18 +
        metrics.orbitBand * 16 +
        metrics.pressure * 16 +
        commitment * 16
      );
    case "useWildcard":
      return (
        metrics.survival * 52 +
        metrics.escapeAlignment * 10 +
        metrics.targetProgress * 14 +
        metrics.pressure * 16 +
        metrics.lineOfFire * 14 +
        commitment * 18
      );
    default:
      return (
        metrics.survival * 46 +
        metrics.lineOfFire * 22 +
        metrics.targetProgress * 24 +
        metrics.pressure * 20 +
        metrics.orbitBand * 12 +
        commitment * 18
      );
  }
};

const scoreRangeWindow = (
  distance: number,
  minDistance: number,
  maxDistance: number,
): number => {
  if (distance >= minDistance && distance <= maxDistance) {
    return 1;
  }

  const midpoint = (minDistance + maxDistance) / 2;
  const halfWidth = Math.max(1, (maxDistance - minDistance) / 2);
  return clamp01(1 - Math.abs(distance - midpoint) / halfWidth);
};

const estimateDesiredRange = (
  intentKind:
    | "finish"
    | "pressure"
    | "contestCache"
    | "explore"
    | "reposition"
    | "survive"
    | "zoneWithHeavy"
    | "lockSeeker"
    | "recover"
    | "useWildcard",
) => {
  switch (intentKind) {
    case "finish":
      return { max: 460, min: 180 };
    case "zoneWithHeavy":
      return { max: 960, min: 420 };
    case "lockSeeker":
      return { max: 1200, min: 380 };
    case "contestCache":
      return { max: 720, min: 260 };
    case "survive":
    case "recover":
      return { max: 900, min: 450 };
    default:
      return { max: 760, min: 260 };
  }
};

const predictTargetPath = (
  target: PlanetPublic,
  world: World,
  difficulty: BotDifficulty,
): PredictedTarget => {
  const lookaheadSec =
    COMBAT_AI_TUNING.shots.targetPredictionHorizonSec[difficulty];
  const steps = Math.max(
    1,
    Math.round(COMBAT_AI_TUNING.shots.targetPredictionSteps[difficulty]),
  );
  const dt = lookaheadSec / Math.max(1, steps);
  let orbitStarMotion = world.orbitStarMotion;
  let predictedSuns = cloneSuns(world.suns);
  let predictedTarget = clonePlanet(target);
  const predictedPoints: Vec2[] = [];

  for (let step = 0; step < steps; step += 1) {
    predictedSuns = stepSunsWithOrbitMotion(
      predictedSuns,
      dt,
      world.blackHole,
      orbitStarMotion,
    );
    orbitStarMotion = advanceWorldOrbitStarMotion(
      orbitStarMotion,
      dt,
      predictedSuns,
    );
    predictedTarget = stepBody(
      predictedTarget,
      predictedSuns,
      dt,
      world.blackHole,
      world.neutronStars,
    );
    predictedPoints.push({ ...predictedTarget.pos });
  }

  let chaosScore = 0;
  for (let index = 1; index < predictedPoints.length - 1; index += 1) {
    const previous = predictedPoints[index - 1]!;
    const current = predictedPoints[index]!;
    const next = predictedPoints[index + 1]!;
    const left = sub(current, previous);
    const right = sub(next, current);
    const leftLen = len(left);
    const rightLen = len(right);
    if (leftLen === 0 || rightLen === 0) {
      continue;
    }
    const cosine = dot(left, right) / (leftLen * rightLen);
    chaosScore += Math.acos(Math.max(-1, Math.min(1, cosine)));
  }

  return {
    target,
    points: predictedPoints.map((pos, index) => ({
      pos,
      timeSec: dt * (index + 1),
    })),
    chaosScore,
  };
};

export const analyzeTargetTrajectory = ({
  difficulty,
  target,
  world,
}: {
  difficulty: BotDifficulty;
  target: PlanetPublic;
  world: World;
}): {
  chaosScore: number;
} => {
  const prediction = predictTargetPath(target, world, difficulty);
  return {
    chaosScore: prediction.chaosScore,
  };
};

const chooseInterceptSolution = (
  self: PlanetPublic,
  predictedTarget: PredictedTarget,
  rocketKind: RocketKind,
): {
  aimDir: Vec2;
  errorSec: number;
  travelTimeSec: number;
} => {
  const rocketSpeed = ROCKET_SPECS[rocketKind].speed;
  let bestAim = normalizeDir(sub(predictedTarget.target.pos, self.pos));
  let bestError = Number.POSITIVE_INFINITY;
  let bestTravelTimeSec =
    dist(self.pos, predictedTarget.target.pos) / rocketSpeed;

  for (const point of predictedTarget.points) {
    const distance = dist(self.pos, point.pos);
    const travelTimeSec = distance / Math.max(1, rocketSpeed);
    const error = Math.abs(travelTimeSec - point.timeSec);
    if (error < bestError) {
      bestError = error;
      bestTravelTimeSec = travelTimeSec;
      bestAim = normalizeDir(sub(point.pos, self.pos), bestAim);
    }
  }

  return {
    aimDir: bestAim,
    errorSec: bestError,
    travelTimeSec: bestTravelTimeSec,
  };
};

const computeShieldLikelihood = (
  target: PlanetPublic,
  aimDir: Vec2,
): number => {
  if (!target.shieldActive || target.shieldLoad <= 0) {
    return 0.12;
  }

  const shieldDot = dot(normalizeDir(target.shieldAimDir), scale(aimDir, -1));
  if (shieldDot >= 0.78) {
    return 0.88;
  }
  if (shieldDot >= 0.45) {
    return 0.52;
  }
  return 0.2;
};

const ammoScarcity = (
  rocketKind: RocketKind,
  privateState: PlanetPrivateState,
): number => {
  const current = privateState.ammo[rocketKind];
  const max = Math.max(1, ROCKET_SPECS[rocketKind].maxAmmo);
  const scarcity = 1 - current / max;

  switch (rocketKind) {
    case "light":
      return scarcity * 0.35;
    case "heavy":
      return scarcity * 0.9;
    case "seeker":
      return scarcity * 0.8;
  }
};

const futureWindowPenalty = (
  rocketKind: RocketKind,
  predictedTarget: PredictedTarget,
  confidence: number,
): number => {
  const chaosBias =
    rocketKind === "heavy"
      ? clamp01(predictedTarget.chaosScore / 1.1)
      : rocketKind === "light"
        ? clamp01(predictedTarget.chaosScore / 1.6)
        : clamp01(predictedTarget.chaosScore / 2.4);
  const holdBias = rocketKind === "light" ? 0.12 : 0.22;
  return chaosBias * clamp01(1 - confidence + holdBias);
};

export const rocketAvailable = (
  rocketKind: RocketKind,
  privateState: PlanetPrivateState,
  tick: number,
): boolean => {
  const cooldownKey =
    rocketKind === "light"
      ? "lightReloadUntilTick"
      : rocketKind === "heavy"
        ? "heavyReloadUntilTick"
        : "seekerReloadUntilTick";
  return (
    privateState.ammo[rocketKind] > 0 &&
    tick >= privateState.cooldowns[cooldownKey]
  );
};

export const rocketDamageEstimate = (
  rocketKind: RocketKind,
  archetypeId: PlanetPublic["archetype"],
): number => {
  const archetype = ARCHETYPES[archetypeId];
  return ROCKET_SPECS[rocketKind].damage * archetype.rocketDamageMultiplier;
};

export const buildShotScores = ({
  ammoPressure,
  difficulty,
  privateState,
  self,
  target,
  targetFact,
  tick,
  world,
}: {
  ammoPressure: number;
  difficulty: BotDifficulty;
  privateState: PlanetPrivateState;
  self: PlanetPublic;
  target: PlanetPublic;
  targetFact: CombatAiTargetFact;
  tick: number;
  world: World;
}): CombatAiShotScore[] => {
  const predictedTarget = predictTargetPath(target, world, difficulty);
  const scores: CombatAiShotScore[] = [];

  for (const rocketKind of ["light", "heavy", "seeker"] as const) {
    if (!rocketAvailable(rocketKind, privateState, tick)) {
      continue;
    }

    const solution = chooseInterceptSolution(self, predictedTarget, rocketKind);
    const errorWindow =
      rocketKind === "light" ? 0.5 : rocketKind === "heavy" ? 0.72 : 0.95;
    const baseConfidence = clamp01(1 - solution.errorSec / errorWindow);
    const chaosPenalty =
      rocketKind === "seeker"
        ? clamp01(predictedTarget.chaosScore / 2.3) * 0.35
        : rocketKind === "light"
          ? clamp01(predictedTarget.chaosScore / 1.8) * 0.4
          : clamp01(predictedTarget.chaosScore / 1.15) * 0.58;
    const travelPenalty = clamp01(
      solution.travelTimeSec /
        Math.max(0.001, ROCKET_SPECS[rocketKind].ttlSec * 0.95),
    );
    const confidence = clamp01(
      baseConfidence * (1 - chaosPenalty) * (1 - travelPenalty * 0.24),
    );
    const shieldLikelihood = computeShieldLikelihood(target, solution.aimDir);
    const damage = rocketDamageEstimate(rocketKind, self.archetype);
    const expectedDamage = damage * confidence * (1 - shieldLikelihood * 0.85);
    const wasteScore = clamp01(Math.max(0, damage - target.hp) / damage);
    const scarcity = ammoScarcity(rocketKind, privateState);
    const holdPenalty = futureWindowPenalty(
      rocketKind,
      predictedTarget,
      confidence,
    );
    const killBonus =
      target.hp <= expectedDamage ? 42 : target.hp <= damage ? 18 : 0;
    const rangeBonus =
      rocketKind === "heavy"
        ? scoreRangeWindow(targetFact.distance, 360, 980) * 8
        : rocketKind === "seeker"
          ? scoreRangeWindow(targetFact.distance, 320, 1200) * 6
          : scoreRangeWindow(targetFact.distance, 160, 720) * 6;
    const score =
      expectedDamage * 1.9 +
      killBonus +
      rangeBonus -
      wasteScore * 20 -
      scarcity * 18 -
      ammoPressure * (rocketKind === "light" ? 4 : 10) -
      holdPenalty * 18;
    const threshold =
      COMBAT_AI_TUNING.shots.confidenceThresholds[difficulty][rocketKind];
    const shieldedLane =
      shieldLikelihood >= 0.6 &&
      expectedDamage < damage * 0.45 &&
      target.hp > expectedDamage * 1.15;
    const allowFire =
      !shieldedLane &&
      confidence >= threshold &&
      (score >= 24 || target.hp <= damage * Math.max(0.55, confidence));

    let holdReason: string | undefined;
    if (!allowFire) {
      if (shieldedLane) {
        holdReason = `${rocketKind} lane blocked by shield`;
      } else if (confidence < threshold) {
        holdReason = `${rocketKind} confidence ${Math.round(confidence * 100)}% < ${Math.round(threshold * 100)}%`;
      } else if (wasteScore >= 0.45 && target.hp > expectedDamage) {
        holdReason = `${rocketKind} overkills by ${Math.round(wasteScore * 100)}%`;
      } else {
        holdReason = `${rocketKind} saved for a better lane`;
      }
    }

    scores.push({
      weaponKind: rocketKind,
      score,
      allowFire,
      confidence,
      aimDir: solution.aimDir,
      expectedDamage,
      wasteScore,
      targetId: target.id,
      targetPlayerId: target.playerId,
      holdReason,
      breakdown: {
        hitProbability: confidence,
        shieldLikelihood,
        expectedDamage,
        wasteScore,
        ammoPressure: scarcity + ammoPressure,
        futureWindowPenalty: holdPenalty,
      },
    });
  }

  return scores.sort((left, right) => right.score - left.score);
};

const createMovementBreakdown = (
  survival: number,
  lineOfFire: number,
  pressure: number,
  resource: number,
  exploration: number,
  commitment: number,
): CombatAiMoveGoalBreakdown => ({
  survival,
  lineOfFire,
  pressure,
  resource,
  exploration,
  commitment,
});

const estimateRangeScore = (
  intentKind: Parameters<typeof estimateDesiredRange>[0],
  targetDistance: number,
): number => {
  const window = estimateDesiredRange(intentKind);
  return scoreRangeWindow(targetDistance, window.min, window.max);
};

const estimateCacheValue = (
  contents: CacheContents,
  self: PlanetPublic,
  privateState: PlanetPrivateState,
): number => {
  switch (contents.kind) {
    case "repair":
      return self.hp < PLANET_HP ? 1.2 + (1 - self.hp / PLANET_HP) * 0.8 : 0.35;
    case "heavyAmmo":
      return privateState.ammo.heavy <= 1 ? 1.15 : 0.55;
    case "seekerPack":
      return privateState.ammo.seeker <= 1 ? 1.12 : 0.5;
    case "shieldExt":
      return self.shieldMaxLoad < self.shieldLoad + 5 ? 0.78 : 0.52;
    case "wildcard":
      return 0.96;
  }
};

export const estimateTravelEtaSec = (
  from: Vec2,
  to: Vec2,
  speedHint: number,
): number => dist(from, to) / Math.max(120, speedHint);

const predictOtherPlanetPaths = ({
  dt,
  predictedSunsByStep,
  self,
  steps,
  world,
}: {
  dt: number;
  predictedSunsByStep: readonly Sun[][];
  self: PlanetPublic;
  steps: number;
  world: World;
}): PredictedPlanetPath[] =>
  world.planets
    .filter((planet) => planet.id !== self.id)
    .map((planet) => {
      let predictedPlanet = clonePlanet(planet);
      const positions: Vec2[] = [];

      for (let step = 0; step < steps; step += 1) {
        predictedPlanet = stepBody(
          predictedPlanet,
          predictedSunsByStep[step]!,
          dt,
          world.blackHole,
          world.neutronStars,
        );
        positions.push({ ...predictedPlanet.pos });
      }

      return {
        planet,
        positions,
      };
    });

export const scoreMovementGoals = ({
  bestCache,
  boostCharges,
  difficulty,
  exploreTargetPos,
  intentKind,
  privateState,
  self,
  target,
  topThreatEscapeDir,
  world,
}: {
  bestCache: Cache | null;
  boostCharges: number;
  difficulty: BotDifficulty;
  exploreTargetPos: Vec2 | null;
  intentKind: Parameters<typeof estimateDesiredRange>[0];
  privateState: PlanetPrivateState;
  self: PlanetPublic;
  target: PlanetPublic | null;
  topThreatEscapeDir: Vec2 | null;
  world: World;
}): CombatAiMoveGoal[] => {
  const steps = Math.max(
    1,
    Math.round(COMBAT_AI_TUNING.movement.simulationSteps[difficulty]),
  );
  const horizonSec = COMBAT_AI_TUNING.movement.evaluationHorizonSec[difficulty];
  const dt = horizonSec / Math.max(1, steps);
  const predictedSunsByStep: Sun[][] = [];
  let sunState = cloneSuns(world.suns);
  let orbitStarMotion = world.orbitStarMotion;

  for (let step = 0; step < steps; step += 1) {
    sunState = stepSunsWithOrbitMotion(
      sunState,
      dt,
      world.blackHole,
      orbitStarMotion,
    );
    orbitStarMotion = advanceWorldOrbitStarMotion(
      orbitStarMotion,
      dt,
      sunState,
    );
    predictedSunsByStep.push(sunState);
  }

  const inward = inwardDir(self.pos);
  const outward = normalizeDir(self.pos, inward);
  const holdDir =
    target !== null
      ? normalizeDir(sub(target.pos, self.pos), inward)
      : bestCache !== null
        ? normalizeDir(sub(bestCache.pos, self.pos), inward)
        : topThreatEscapeDir !== null
          ? normalizeDir(topThreatEscapeDir, inward)
          : inward;
  const targetPath: Vec2[] = [];

  if (target !== null) {
    let predictedTarget = clonePlanet(target);
    for (let step = 0; step < steps; step += 1) {
      predictedTarget = stepBody(
        predictedTarget,
        predictedSunsByStep[step]!,
        dt,
        world.blackHole,
        world.neutronStars,
      );
      targetPath.push({ ...predictedTarget.pos });
    }
  }

  const targetInterceptPos =
    targetPath[Math.floor(targetPath.length * 0.45)] ?? null;
  const targetProjectedPos = targetPath[targetPath.length - 1] ?? null;
  const candidates = buildMovementCandidates({
    bestCache,
    exploreTargetPos,
    holdDir,
    objectiveFanoutRad:
      (COMBAT_AI_TUNING.movement.objectiveFanoutDeg * Math.PI) / 180,
    self,
    target,
    targetInterceptPos,
    targetProjectedPos,
    topThreatEscapeDir,
    world,
  });
  const enemyRockets = selectMovementThreatRockets(self, world.rockets);
  const rocketTargets = new Map<EntityId, PlanetPublic>(
    world.planets.map((planet) => [planet.id, planet]),
  );
  const predictedPlanetPaths = predictOtherPlanetPaths({
    dt,
    predictedSunsByStep,
    self,
    steps,
    world,
  });
  const initialTargetDistance =
    target === null ? null : dist(self.pos, target.pos);
  const initialCacheDistance =
    bestCache === null ? null : dist(self.pos, bestCache.pos);
  const initialExploreDistance =
    exploreTargetPos === null ? null : dist(self.pos, exploreTargetPos);
  const currentRadiusRatio = len(self.pos) / Math.max(1, world.arenaRadius);
  const cacheValue =
    bestCache === null
      ? 0
      : estimateCacheValue(bestCache.contents, self, privateState);
  const boostMagnitude =
    BOOST_SPEC.magnitude * ARCHETYPES[self.archetype].boostMagnitudeMultiplier;
  const goals: EvaluatedMoveGoal[] = [];

  for (const candidate of candidates) {
    if (candidate.usesBoost && boostCharges <= 0) {
      continue;
    }

    let predictedSelf = clonePlanet(self);
    let predictedRockets = enemyRockets.map(cloneRocket);
    if (candidate.usesBoost) {
      predictedSelf.vel = add(
        predictedSelf.vel,
        scale(candidate.dir, boostMagnitude),
      );
    }

    let minBoundaryRatio = 1;
    let minBoundaryMargin = Number.POSITIVE_INFINITY;
    let minSunClearance = 1;
    let minSunGap = Number.POSITIVE_INFINITY;
    let minNeutronClearance = 1;
    let minNeutronGap = Number.POSITIVE_INFINITY;
    let minBlackHoleClearance = 1;
    let minBlackHoleGap = Number.POSITIVE_INFINITY;
    let minRocketClearance = 1;
    let minRocketGap = Number.POSITIVE_INFINITY;
    let minPlanetClearance = 1;
    let minPlanetGap = Number.POSITIVE_INFINITY;
    let bestRangeScore = 0;
    let bestResourceScore = 0;
    let bestOrbitBand = 0;
    let bestPressure = 0;
    let bestFlowAlignment = 0;
    let maxRadiusRatio = currentRadiusRatio;
    let closestTargetDistance =
      initialTargetDistance ?? Number.POSITIVE_INFINITY;
    let closestCacheDistance = initialCacheDistance ?? Number.POSITIVE_INFINITY;
    let closestExploreDistance =
      initialExploreDistance ?? Number.POSITIVE_INFINITY;

    for (let step = 0; step < steps; step += 1) {
      const stepSunsState = predictedSunsByStep[step]!;
      predictedSelf = stepBody(
        predictedSelf,
        stepSunsState,
        dt,
        world.blackHole,
        world.neutronStars,
      );
      const boundaryMargin = world.arenaRadius - len(predictedSelf.pos);
      maxRadiusRatio = Math.max(
        maxRadiusRatio,
        len(predictedSelf.pos) / Math.max(1, world.arenaRadius),
      );
      minBoundaryMargin = Math.min(minBoundaryMargin, boundaryMargin);
      minBoundaryRatio = Math.min(
        minBoundaryRatio,
        clamp01(boundaryMargin / (world.arenaRadius * 0.18)),
      );

      for (const sun of stepSunsState) {
        const gap =
          dist(predictedSelf.pos, sun.pos) - predictedSelf.radius - sun.radius;
        minSunGap = Math.min(minSunGap, gap);
        minSunClearance = Math.min(minSunClearance, clamp01(gap / 260));
      }

      for (const neutronStar of world.neutronStars) {
        const gap =
          dist(predictedSelf.pos, neutronStar.pos) -
          predictedSelf.radius -
          neutronStar.radius;
        minNeutronGap = Math.min(minNeutronGap, gap);
        minNeutronClearance = Math.min(minNeutronClearance, clamp01(gap / 320));
      }

      if (world.blackHole) {
        const blackHoleGap =
          len(predictedSelf.pos) - world.blackHole.killRadius;
        minBlackHoleGap = Math.min(minBlackHoleGap, blackHoleGap);
        minBlackHoleClearance = Math.min(
          minBlackHoleClearance,
          clamp01(blackHoleGap / Math.max(160, world.blackHole.killRadius)),
        );
      }

      for (const predictedPlanet of predictedPlanetPaths) {
        const otherPos =
          predictedPlanet.positions[step] ?? predictedPlanet.planet.pos;
        const gap =
          dist(predictedSelf.pos, otherPos) -
          predictedSelf.radius -
          predictedPlanet.planet.radius;
        minPlanetGap = Math.min(minPlanetGap, gap);
        minPlanetClearance = Math.min(minPlanetClearance, clamp01(gap / 240));
      }

      bestOrbitBand = Math.max(
        bestOrbitBand,
        clamp01(
          1 -
            Math.abs(
              len(predictedSelf.pos) -
                world.arenaRadius * MOVEMENT_ORBIT_RADIUS_RATIO,
            ) /
              (world.arenaRadius * 0.2),
        ),
      );

      if (target !== null) {
        const predictedTargetPos = targetPath[step] ?? target.pos;
        const targetDistance = dist(predictedSelf.pos, predictedTargetPos);
        const rangeScore = estimateRangeScore(intentKind, targetDistance);
        bestRangeScore = Math.max(bestRangeScore, rangeScore);
        bestPressure = Math.max(
          bestPressure,
          clamp01(1 - targetDistance / 1500),
        );
        bestFlowAlignment = Math.max(
          bestFlowAlignment,
          scoreObjectiveFlow({
            fallback: holdDir,
            objectivePos: predictedTargetPos,
            objectiveVel: target.vel,
            predictedSelf,
          }) * clamp01(0.38 + rangeScore * 0.62),
        );
        closestTargetDistance = Math.min(closestTargetDistance, targetDistance);
      } else {
        bestPressure = Math.max(bestPressure, bestOrbitBand);
      }

      if (bestCache !== null) {
        const cacheDistance = dist(predictedSelf.pos, bestCache.pos);
        const cacheScore = clamp01(1 - cacheDistance / 1100) * cacheValue;
        bestResourceScore = Math.max(bestResourceScore, cacheScore);
        bestFlowAlignment = Math.max(
          bestFlowAlignment,
          scoreObjectiveFlow({
            fallback: holdDir,
            objectivePos: bestCache.pos,
            objectiveVel: null,
            predictedSelf,
          }) * clamp01(0.32 + cacheScore * 0.68),
        );
        closestCacheDistance = Math.min(closestCacheDistance, cacheDistance);
      }

      if (exploreTargetPos !== null) {
        const exploreDistance = dist(predictedSelf.pos, exploreTargetPos);
        bestFlowAlignment = Math.max(
          bestFlowAlignment,
          scoreObjectiveFlow({
            fallback: holdDir,
            objectivePos: exploreTargetPos,
            objectiveVel: null,
            predictedSelf,
          }) *
            clamp01(
              1 - exploreDistance / Math.max(260, world.arenaRadius * 0.22),
            ),
        );
        closestExploreDistance = Math.min(
          closestExploreDistance,
          exploreDistance,
        );
      }

      if (predictedRockets.length > 0) {
        predictedRockets = predictedRockets.map((rocket) => {
          const seekerTarget =
            rocket.targetId === self.id
              ? predictedSelf
              : rocket.targetId === undefined
                ? null
                : (rocketTargets.get(rocket.targetId) ?? null);
          return rocket.rocketKind === "seeker"
            ? stepSeeker(
                rocket,
                seekerTarget,
                stepSunsState,
                dt,
                world.blackHole,
                undefined,
                world.neutronStars,
              )
            : stepBody(
                rocket,
                stepSunsState,
                dt,
                world.blackHole,
                world.neutronStars,
              );
        });

        for (const rocket of predictedRockets) {
          const gap =
            dist(predictedSelf.pos, rocket.pos) -
            predictedSelf.radius -
            rocket.radius;
          minRocketGap = Math.min(minRocketGap, gap);
          minRocketClearance = Math.min(minRocketClearance, clamp01(gap / 220));
        }
      }
    }

    const survival =
      minBoundaryRatio * 0.16 +
      minSunClearance * 0.16 +
      minNeutronClearance * 0.12 +
      minBlackHoleClearance * 0.12 +
      minRocketClearance * 0.26 +
      minPlanetClearance * 0.18;
    const targetProgress =
      target === null || initialTargetDistance === null
        ? 0
        : clamp01(
            (initialTargetDistance - closestTargetDistance) /
              Math.max(180, initialTargetDistance * 0.6),
          );
    const lineOfFire = target === null ? bestOrbitBand : bestRangeScore;
    const pressure =
      target === null
        ? clamp01(bestOrbitBand * 0.58 + bestFlowAlignment * 0.42)
        : clamp01(
            bestPressure * 0.48 +
              targetProgress * 0.24 +
              bestFlowAlignment * 0.28,
          );
    const resource =
      bestCache === null || initialCacheDistance === null
        ? 0
        : clamp01(
            bestResourceScore * 0.7 +
              clamp01(
                (initialCacheDistance - closestCacheDistance) /
                  Math.max(160, initialCacheDistance * 0.72),
              ) *
                0.3,
          );
    const exploration =
      exploreTargetPos === null || initialExploreDistance === null
        ? 0
        : clamp01(
            clamp01(
              (initialExploreDistance - closestExploreDistance) /
                Math.max(180, initialExploreDistance * 0.68),
            ) *
              0.62 +
              clamp01(
                1 -
                  closestExploreDistance /
                    Math.max(220, world.arenaRadius * 0.18),
              ) *
                0.2 +
              bestFlowAlignment * 0.18,
          );
    const escapeAlignment =
      topThreatEscapeDir === null
        ? 0
        : clamp01(
            (dot(
              normalizeDir(
                candidate.usesBoost ? candidate.dir : predictedSelf.vel,
                candidate.dir,
              ),
              normalizeDir(topThreatEscapeDir, candidate.dir),
            ) +
              1) *
              0.5,
          );
    const commitment = candidate.usesBoost
      ? boostCharges <= 1
        ? -COMBAT_AI_TUNING.execution.boostPenaltySingleCharge
        : -COMBAT_AI_TUNING.execution.boostPenaltyMultipleCharges
      : 0.1;
    const outwardAlignment = Math.max(0, dot(candidate.dir, outward));
    const boundaryPenalty =
      currentRadiusRatio <= MOVEMENT_BOUNDARY_CAREFUL_RATIO
        ? 0
        : clamp01(
            (currentRadiusRatio - MOVEMENT_BOUNDARY_CAREFUL_RATIO) /
              (MOVEMENT_BOUNDARY_OUTWARD_VETO_RATIO -
                MOVEMENT_BOUNDARY_CAREFUL_RATIO),
          ) *
          (outwardAlignment * 18 +
            clamp01(
              (maxRadiusRatio - MOVEMENT_BOUNDARY_CAREFUL_RATIO) /
                (1 - MOVEMENT_BOUNDARY_CAREFUL_RATIO),
            ) *
              22);
    let totalScore = scoreMovementIntent(intentKind, commitment, {
      escapeAlignment,
      lineOfFire,
      orbitBand: bestOrbitBand,
      pressure,
      resource,
      exploration,
      rocketAvoidance: minRocketClearance,
      survival,
      targetProgress,
    });
    totalScore -= boundaryPenalty;
    const curvedCandidate =
      candidate.label.includes("orbit") ||
      candidate.label.includes("arc") ||
      candidate.label.includes("sweep") ||
      candidate.label.includes("flank");
    if (candidate.kind === "explore" && intentKind !== "explore") {
      totalScore -= 9;
    }
    if (
      curvedCandidate &&
      (intentKind === "pressure" ||
        intentKind === "reposition" ||
        intentKind === "finish")
    ) {
      totalScore += 3.5;
    }
    if (
      intentKind === "pressure" &&
      (candidate.label === "arc in" ||
        candidate.label === "close future lane" ||
        candidate.label === "intercept target")
    ) {
      totalScore += 4.5;
    }
    if (intentKind === "explore") {
      totalScore +=
        candidate.kind === "explore" ? 8 : candidate.kind === "escape" ? -4 : 0;
    }
    const hardUnsafe =
      minBoundaryMargin <= MOVEMENT_HARD_BOUNDARY_MARGIN ||
      minSunGap <= MOVEMENT_HARD_SUN_MARGIN ||
      minNeutronGap <= MOVEMENT_HARD_NEUTRON_MARGIN ||
      minBlackHoleGap <= MOVEMENT_HARD_BLACK_HOLE_MARGIN ||
      minPlanetGap <= MOVEMENT_HARD_PLANET_MARGIN ||
      minRocketGap <= MOVEMENT_HARD_ROCKET_MARGIN ||
      (currentRadiusRatio >= MOVEMENT_BOUNDARY_OUTWARD_VETO_RATIO &&
        outwardAlignment >= 0.15) ||
      (maxRadiusRatio >= 0.9 && candidate.kind !== "escape");
    const safe =
      !hardUnsafe &&
      survival >= MOVEMENT_SAFE_SURVIVAL_FLOOR &&
      minBoundaryRatio >= MOVEMENT_SAFE_BOUNDARY_RATIO_FLOOR &&
      minSunClearance >= MOVEMENT_SAFE_SUN_CLEARANCE_FLOOR &&
      minBlackHoleClearance >= MOVEMENT_SAFE_BLACK_HOLE_FLOOR &&
      minRocketClearance >= MOVEMENT_SAFE_ROCKET_CLEARANCE_FLOOR &&
      minPlanetClearance >= MOVEMENT_SAFE_PLANET_CLEARANCE_FLOOR;
    const safetyScore =
      survival * 0.58 +
      minPlanetClearance * 0.14 +
      minRocketClearance * 0.12 +
      minBoundaryRatio * 0.08 +
      minSunClearance * 0.08;

    goals.push({
      goal: {
        kind: candidate.kind,
        dir: candidate.dir,
        usesBoost: candidate.usesBoost,
        label: candidate.label,
        targetCacheId: candidate.targetCacheId,
        targetPlayerId: target?.playerId,
        desiredRadius: world.arenaRadius * MOVEMENT_ORBIT_RADIUS_RATIO,
        totalScore,
        breakdown: createMovementBreakdown(
          survival,
          lineOfFire,
          clamp01(
            pressure * 0.5 +
              bestOrbitBand * 0.18 +
              escapeAlignment * 0.16 +
              exploration * 0.16,
          ),
          resource,
          exploration,
          commitment,
        ),
        reason: `${candidate.label} surv ${survival.toFixed(2)} lane ${lineOfFire.toFixed(2)} move ${pressure.toFixed(2)}`,
      },
      safetyScore,
      safe,
    });
  }

  const byScore = (
    left: EvaluatedMoveGoal,
    right: EvaluatedMoveGoal,
  ): number => {
    if (Math.abs(right.goal.totalScore - left.goal.totalScore) > 0.0001) {
      return right.goal.totalScore - left.goal.totalScore;
    }
    return right.safetyScore - left.safetyScore;
  };

  const safeGoals = goals.filter((goal) => goal.safe).sort(byScore);
  if (safeGoals.length > 0) {
    return safeGoals.map((goal) => goal.goal);
  }

  return goals
    .sort((left, right) => {
      if (Math.abs(right.safetyScore - left.safetyScore) > 0.0001) {
        return right.safetyScore - left.safetyScore;
      }
      if (left.goal.kind === "escape" && right.goal.kind !== "escape") {
        return -1;
      }
      if (right.goal.kind === "escape" && left.goal.kind !== "escape") {
        return 1;
      }
      return right.goal.totalScore - left.goal.totalScore;
    })
    .map(({ goal, safetyScore }) => ({
      ...goal,
      reason: `${goal.reason} fallback ${safetyScore.toFixed(2)}`,
    }));
};

export const scoreGravityPulseOpportunity = ({
  rockets,
  self,
  target,
  world,
}: {
  rockets: readonly Rocket[];
  self: PlanetPublic;
  target: PlanetPublic | null;
  world: World;
}): number => {
  let score = 0;

  for (const rocket of rockets) {
    if (rocket.ownerId === self.playerId) {
      continue;
    }

    const distance = dist(self.pos, rocket.pos);
    if (distance <= GRAVITY_PULSE_RADIUS) {
      score += clamp01(1 - distance / GRAVITY_PULSE_RADIUS) * 0.55;
    }
  }

  if (target !== null) {
    const distance = dist(self.pos, target.pos);
    if (distance <= GRAVITY_PULSE_RADIUS * 0.92) {
      score += clamp01(1 - distance / (GRAVITY_PULSE_RADIUS * 0.92)) * 0.75;
    }
  }

  for (const cache of world.caches) {
    const distance = dist(self.pos, cache.pos);
    if (distance <= GRAVITY_PULSE_RADIUS * 0.72) {
      score += clamp01(1 - distance / (GRAVITY_PULSE_RADIUS * 0.72)) * 0.2;
    }
  }

  for (const piece of world.debris) {
    if (piece.asteroidTier === undefined) {
      continue;
    }

    const distance = dist(self.pos, piece.pos);
    if (distance <= GRAVITY_PULSE_RADIUS) {
      score += clamp01(1 - distance / GRAVITY_PULSE_RADIUS) * 0.35;
    }
  }

  return score;
};
