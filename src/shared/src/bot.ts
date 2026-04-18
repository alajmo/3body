import { ARCHETYPES } from "./archetypes";
import { BLACK_HOLE_SPEC, ROCKET_SPECS } from "./constants";
import type {
  PlanetPrivateState,
  PlanetPublic,
  Rocket,
  RocketKind,
  Sun,
  World,
} from "./entities";
import { predictPath, stepBody, stepSuns } from "./physics";
import type { AbilitySlot, BotDifficulty } from "./protocol";
import type { Vec2 } from "./vec2";
import { add, dist, dot, len, lenSq, normalize, scale, sub } from "./vec2";

const DEFAULT_DIR: Vec2 = { x: 1, y: 0 };
const LOOKAHEAD_SEC_BY_DIFFICULTY = {
  easy: 1.2,
  normal: 2.2,
  hard: 2.8,
} as const satisfies Record<BotDifficulty, number>;
const LOOKAHEAD_STEPS_BY_DIFFICULTY = {
  easy: 18,
  normal: 28,
  hard: 34,
} as const satisfies Record<BotDifficulty, number>;
const FIRE_CADENCE_TICKS = {
  easy: 12,
  normal: 8,
  hard: 6,
} as const satisfies Record<BotDifficulty, number>;
const AIM_CADENCE_TICKS = {
  easy: 4,
  normal: 3,
  hard: 2,
} as const satisfies Record<BotDifficulty, number>;
const SHIELD_THREAT_SEC = 1.0;
const BOUNDARY_ESCAPE_ALPHA = 0.9;

export interface CombatBotRuntime {
  activeDroneId: number | null;
  controlMode: "planet" | "drone";
}

export interface CombatBotContext {
  difficulty: BotDifficulty;
  tick: number;
  tickHz: number;
  world: World;
  self: PlanetPublic;
  privateState: PlanetPrivateState;
  runtime: CombatBotRuntime;
}

export interface CombatBotMemory {
  cachedAimDir: Vec2;
  lastAimTick: number;
  lastBoostTick: number;
  lastFireTick: number;
  lastShieldTick: number;
}

export type CombatBotCommand =
  | {
      type: "input";
      mouseDir: Vec2;
      clientTick: number;
    }
  | {
      type: "shieldAim";
      dir: Vec2;
    }
  | {
      type: "fireRocket";
      kind: RocketKind;
      aimDir: Vec2;
      targetId?: number;
      clientTick: number;
    }
  | {
      type: "ability";
      slot: AbilitySlot;
      aimDir?: Vec2;
    };

interface PredictedPoint {
  pos: Vec2;
  timeSec: number;
}

interface PredictedTarget {
  target: PlanetPublic;
  points: PredictedPoint[];
  chaosScore: number;
}

interface ThreatAssessment {
  rocket: Rocket;
  threatDir: Vec2;
  timeSec: number;
  missDistance: number;
}

interface SurvivalAssessment {
  danger: boolean;
  escapeDir: Vec2;
}

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

const normalizeDir = (dir: Vec2, fallback: Vec2 = DEFAULT_DIR): Vec2 => {
  const normalized = normalize(dir);
  return len(normalized) === 0 ? { ...fallback } : normalized;
};

const inwardDir = (pos: Vec2): Vec2 =>
  normalizeDir(scale(pos, -1), DEFAULT_DIR);

export const createCombatBotMemory = (): CombatBotMemory => ({
  cachedAimDir: { ...DEFAULT_DIR },
  lastAimTick: -1,
  lastBoostTick: -1,
  lastFireTick: -1,
  lastShieldTick: -1,
});

export const cloneCombatBotMemory = (
  memory: CombatBotMemory,
): CombatBotMemory => ({
  cachedAimDir: { ...memory.cachedAimDir },
  lastAimTick: memory.lastAimTick,
  lastBoostTick: memory.lastBoostTick,
  lastFireTick: memory.lastFireTick,
  lastShieldTick: memory.lastShieldTick,
});

const rocketAvailable = (
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

const rocketDamageEstimate = (
  rocketKind: RocketKind,
  archetypeId: CombatBotContext["self"]["archetype"],
): number => {
  const archetype = ARCHETYPES[archetypeId];
  return ROCKET_SPECS[rocketKind].damage * archetype.rocketDamageMultiplier;
};

const chooseTarget = (
  self: PlanetPublic,
  planets: readonly PlanetPublic[],
  difficulty: BotDifficulty,
): PlanetPublic | null => {
  const enemies = planets.filter((planet) => planet.playerId !== self.playerId);
  if (enemies.length === 0) {
    return null;
  }

  if (difficulty === "easy") {
    return enemies.sort(
      (left, right) => dist(self.pos, left.pos) - dist(self.pos, right.pos),
    )[0]!;
  }

  if (difficulty === "hard") {
    return enemies.sort((left, right) => {
      const leftScore = left.hp * 12 + dist(self.pos, left.pos) * 0.04;
      const rightScore = right.hp * 12 + dist(self.pos, right.pos) * 0.04;
      return leftScore - rightScore;
    })[0]!;
  }

  return enemies.sort((left, right) => {
    const leftScore = dist(self.pos, left.pos) + left.hp * 2.5;
    const rightScore = dist(self.pos, right.pos) + right.hp * 2.5;
    return leftScore - rightScore;
  })[0]!;
};

const predictTargetPath = (
  target: PlanetPublic,
  world: World,
  difficulty: BotDifficulty,
): PredictedTarget => {
  const lookaheadSec = LOOKAHEAD_SEC_BY_DIFFICULTY[difficulty];
  const steps = LOOKAHEAD_STEPS_BY_DIFFICULTY[difficulty];
  const dt = lookaheadSec / steps;
  const predictedPoints = predictPath(
    target.pos,
    target.vel,
    world.suns,
    steps,
    dt,
    world.blackHole,
  ).slice(1);

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

const chooseWeapon = (
  difficulty: BotDifficulty,
  archetypeId: CombatBotContext["self"]["archetype"],
  target: PlanetPublic,
  predictedTarget: PredictedTarget,
  privateState: PlanetPrivateState,
  tick: number,
): RocketKind | null => {
  const availableKinds = (["light", "heavy", "seeker"] as const).filter(
    (kind) => rocketAvailable(kind, privateState, tick),
  );
  if (availableKinds.length === 0) {
    return null;
  }

  if (difficulty === "easy") {
    return availableKinds.includes("light") ? "light" : availableKinds[0]!;
  }

  const heavyDamage = rocketDamageEstimate("heavy", archetypeId);
  const seekerDamage = rocketDamageEstimate("seeker", archetypeId);
  const chaosScore = predictedTarget.chaosScore;
  const lowChaos = chaosScore < 0.42;
  const highChaos = chaosScore > 1.0;

  if (difficulty === "hard") {
    if (target.hp <= heavyDamage && availableKinds.includes("heavy")) {
      return "heavy";
    }
    if (target.hp <= seekerDamage && availableKinds.includes("seeker")) {
      return "seeker";
    }
    if (lowChaos && availableKinds.includes("heavy")) {
      return "heavy";
    }
    if (highChaos && availableKinds.includes("seeker")) {
      return "seeker";
    }
    if (availableKinds.includes("light")) {
      return "light";
    }
    return availableKinds[0]!;
  }

  if (lowChaos && availableKinds.includes("heavy")) {
    return "heavy";
  }
  if (highChaos && availableKinds.includes("seeker")) {
    return "seeker";
  }
  if (availableKinds.includes("light")) {
    return "light";
  }
  return availableKinds[0]!;
};

const chooseInterceptAim = (
  self: PlanetPublic,
  predictedTarget: PredictedTarget,
  rocketKind: RocketKind,
): Vec2 => {
  const rocketSpeed = ROCKET_SPECS[rocketKind].speed;
  let bestAim = normalizeDir(sub(predictedTarget.target.pos, self.pos));
  let bestError = Number.POSITIVE_INFINITY;

  for (const point of predictedTarget.points) {
    const distance = dist(self.pos, point.pos);
    const travelTimeSec = distance / Math.max(1, rocketSpeed);
    const error = Math.abs(travelTimeSec - point.timeSec);
    if (error < bestError) {
      bestError = error;
      bestAim = normalizeDir(sub(point.pos, self.pos), bestAim);
    }
  }

  return bestAim;
};

const findIncomingThreat = (
  self: PlanetPublic,
  rockets: readonly Rocket[],
): ThreatAssessment | null => {
  let bestThreat: ThreatAssessment | null = null;

  for (const rocket of rockets) {
    if (rocket.ownerId === self.playerId) {
      continue;
    }

    const relativePos = sub(rocket.pos, self.pos);
    const relativeVel = sub(rocket.vel, self.vel);
    const relativeSpeedSq = Math.max(1, lenSq(relativeVel));
    const t = Math.max(
      0,
      Math.min(
        SHIELD_THREAT_SEC,
        -dot(relativePos, relativeVel) / relativeSpeedSq,
      ),
    );
    const closestVec = add(relativePos, scale(relativeVel, t));
    const missDistance = len(closestVec);
    const hitRadius = self.radius + rocket.radius + 28;
    if (missDistance > hitRadius) {
      continue;
    }

    const threat: ThreatAssessment = {
      rocket,
      threatDir: normalizeDir(relativePos, DEFAULT_DIR),
      timeSec: t,
      missDistance,
    };

    if (
      bestThreat === null ||
      threat.timeSec < bestThreat.timeSec ||
      (Math.abs(threat.timeSec - bestThreat.timeSec) < 0.05 &&
        threat.missDistance < bestThreat.missDistance)
    ) {
      bestThreat = threat;
    }
  }

  return bestThreat;
};

const assessSurvival = (
  self: PlanetPublic,
  world: World,
  difficulty: BotDifficulty,
): SurvivalAssessment => {
  const lookaheadSec = difficulty === "easy" ? 1.5 : 2.0;
  const steps = difficulty === "easy" ? 18 : 24;
  const dt = lookaheadSec / steps;
  let predictedSuns = cloneSuns(world.suns);
  let predictedSelf = clonePlanet(self);
  let danger = false;
  let escapeVec = { x: 0, y: 0 };

  for (let step = 0; step < steps; step += 1) {
    predictedSuns = stepSuns(predictedSuns, dt, world.blackHole);
    predictedSelf = stepBody(predictedSelf, predictedSuns, dt, world.blackHole);

    for (const sun of predictedSuns) {
      const distance = dist(predictedSelf.pos, sun.pos);
      if (distance <= predictedSelf.radius + sun.radius + 56) {
        danger = true;
        escapeVec = add(
          escapeVec,
          scale(
            normalizeDir(sub(predictedSelf.pos, sun.pos)),
            1 + (predictedSuns.length - step) / predictedSuns.length,
          ),
        );
      }
    }

    if (len(predictedSelf.pos) >= world.arenaRadius * BOUNDARY_ESCAPE_ALPHA) {
      danger = true;
      escapeVec = add(escapeVec, inwardDir(predictedSelf.pos));
    }

    if (world.blackHole) {
      const distanceToOrigin = len(predictedSelf.pos);
      if (distanceToOrigin <= BLACK_HOLE_SPEC.killRadius + 140) {
        danger = true;
        escapeVec = add(
          escapeVec,
          scale(normalizeDir(predictedSelf.pos, DEFAULT_DIR), 2),
        );
      }
    }
  }

  if (!danger && len(self.pos) >= world.arenaRadius * 0.94) {
    danger = true;
    escapeVec = inwardDir(self.pos);
  }

  if (!danger) {
    return { danger: false, escapeDir: DEFAULT_DIR };
  }

  if (lenSq(escapeVec) === 0) {
    escapeVec = inwardDir(self.pos);
  }

  return {
    danger: true,
    escapeDir: normalizeDir(escapeVec, inwardDir(self.pos)),
  };
};

export const decideCombatBot = (
  context: CombatBotContext,
  memory: CombatBotMemory,
): CombatBotCommand[] => {
  const commands: CombatBotCommand[] = [];
  const threat = findIncomingThreat(context.self, context.world.rockets);
  const survival = assessSurvival(
    context.self,
    context.world,
    context.difficulty,
  );
  const target = chooseTarget(
    context.self,
    context.world.planets,
    context.difficulty,
  );

  let predictedTarget: PredictedTarget | null = null;
  if (target) {
    predictedTarget = predictTargetPath(
      target,
      context.world,
      context.difficulty,
    );
    memory.cachedAimDir = chooseInterceptAim(
      context.self,
      predictedTarget,
      "light",
    );
  } else if (survival.danger) {
    memory.cachedAimDir = survival.escapeDir;
  }

  if (
    context.tick === 0 ||
    context.tick - memory.lastAimTick >= AIM_CADENCE_TICKS[context.difficulty]
  ) {
    commands.push({
      type: "input",
      mouseDir: memory.cachedAimDir,
      clientTick: context.tick,
    });
    memory.lastAimTick = context.tick;
  }

  if (threat && context.self.shieldActive) {
    commands.push({
      type: "shieldAim",
      dir: threat.threatDir,
    });
  } else if (
    context.self.shieldActive &&
    context.tick - memory.lastShieldTick >= 12
  ) {
    commands.push({
      type: "ability",
      slot: "w",
    });
    memory.lastShieldTick = context.tick;
  } else if (
    threat &&
    !context.self.shieldActive &&
    context.self.shieldLoad > 0 &&
    context.tick - memory.lastShieldTick >= 8
  ) {
    commands.push({
      type: "ability",
      slot: "w",
      aimDir: threat.threatDir,
    });
    memory.lastShieldTick = context.tick;
  }

  const canBoost = context.privateState.boostCharges > 0;
  if (
    canBoost &&
    context.tick - memory.lastBoostTick >= context.tickHz / 2 &&
    (survival.danger ||
      (context.difficulty !== "easy" &&
        target !== null &&
        target.hp <= rocketDamageEstimate("seeker", context.self.archetype) &&
        dist(context.self.pos, target.pos) >= 480 &&
        !context.world.blackHole))
  ) {
    commands.push({
      type: "ability",
      slot: "e",
      aimDir:
        survival.danger || target === null
          ? survival.escapeDir
          : normalizeDir(
              sub(target.pos, context.self.pos),
              memory.cachedAimDir,
            ),
    });
    memory.lastBoostTick = context.tick;
  }

  if (
    context.difficulty === "hard" &&
    predictedTarget !== null &&
    context.privateState.cooldowns.foresightActiveUntilTick <= context.tick &&
    predictedTarget.chaosScore < 0.42 &&
    rocketAvailable("heavy", context.privateState, context.tick)
  ) {
    commands.push({
      type: "ability",
      slot: "q",
    });
  }

  if (!target || predictedTarget === null) {
    return commands;
  }

  const weapon = chooseWeapon(
    context.difficulty,
    context.self.archetype,
    target,
    predictedTarget,
    context.privateState,
    context.tick,
  );
  if (
    weapon !== null &&
    context.tick - memory.lastFireTick >= FIRE_CADENCE_TICKS[context.difficulty]
  ) {
    const aimDir = chooseInterceptAim(context.self, predictedTarget, weapon);
    commands.push({
      type: "fireRocket",
      kind: weapon,
      aimDir,
      targetId: weapon === "seeker" ? target.id : undefined,
      clientTick: context.tick,
    });
    memory.lastFireTick = context.tick;
  }

  return commands;
};
