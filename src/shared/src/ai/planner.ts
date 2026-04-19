import type {
  Drone,
  PlanetPrivateState,
  PlanetPublic,
  World,
} from "../entities";
import type { BotDifficulty } from "../protocol";
import { dot, len, normalize, scale, sub } from "../vec2";
import type { Vec2 } from "../vec2";
import { defaultCombatAiAimDir } from "./blackboard";
import { COMBAT_AI_TUNING } from "./runtimeTuning";
import {
  buildShotScores,
  scoreGravityPulseOpportunity,
  scoreMovementGoals,
} from "./scoring";
import type {
  CombatAiAbilityPolicy,
  CombatAiBlackboard,
  CombatAiFireGate,
  CombatAiIntent,
  CombatAiMoveGoal,
  CombatAiPlan,
  CombatAiShotScore,
} from "./types";

const planExpiryTicks = (intent: CombatAiIntent): number => {
  switch (intent.kind) {
    case "survive":
      return 4;
    case "explore":
      return 12;
    case "finish":
      return 8;
    case "contestCache":
      return 12;
    case "deployDrone":
      return 10;
    default:
      return 10;
  }
};

const findTarget = (
  intent: CombatAiIntent,
  perceptionTargetId: number | undefined,
  world: World,
): PlanetPublic | null => {
  const targetId = intent.targetPlanetId ?? perceptionTargetId;
  return targetId === undefined
    ? null
    : (world.planets.find((planet) => planet.id === targetId) ?? null);
};

const findDrone = (
  self: PlanetPublic,
  world: World,
  activeDroneId: number | null,
): Drone | null => {
  if (activeDroneId !== null) {
    return world.drones.find((drone) => drone.id === activeDroneId) ?? null;
  }

  return world.drones.find((drone) => drone.ownerId === self.playerId) ?? null;
};

const turnSignalForDrone = (drone: Drone, desiredDir: Vec2): -1 | 0 | 1 => {
  const forward = normalize(drone.vel);
  const targetDir = normalize(desiredDir);
  if (len(forward) === 0 || len(targetDir) === 0) {
    return 0;
  }

  const cross = forward.x * targetDir.y - forward.y * targetDir.x;
  if (Math.abs(cross) <= 0.08) {
    return 0;
  }
  return cross > 0 ? 1 : -1;
};

const executionStateForIntent = (
  intent: CombatAiIntent,
): CombatAiPlan["executionState"] => {
  switch (intent.kind) {
    case "survive":
      return "evade";
    case "explore":
      return "reposition";
    case "reposition":
      return "reposition";
    case "contestCache":
      return "cacheRun";
    case "finish":
      return "finishWindow";
    case "deployDrone":
      return "droneRun";
    case "useWildcard":
      return "wildcardSetup";
    case "recover":
      return "recover";
    default:
      return "planetCombat";
  }
};

const resolveBoostCommitThreshold = ({
  intent,
  lastBoostTick,
  perception,
  tick,
  tickHz,
  topThreat,
}: {
  intent: CombatAiIntent;
  lastBoostTick: number;
  perception: CombatAiBlackboard["perception"];
  tick: number;
  tickHz: number;
  topThreat: CombatAiBlackboard["perception"]["threats"][number] | undefined;
}): number => {
  let threshold = COMBAT_AI_TUNING.execution.boostCommitScoreDelta;

  switch (intent.kind) {
    case "pressure":
    case "zoneWithHeavy":
    case "lockSeeker":
      threshold *= 0.34;
      break;
    case "finish":
    case "reposition":
    case "explore":
    case "useWildcard":
      threshold *= 0.5;
      break;
    case "contestCache":
    case "recover":
      threshold *= 0.42;
      break;
    case "survive":
      threshold *=
        topThreat?.preferredResponse === "boost" && topThreat.urgency >= 0.72
          ? 0.3
          : 0.58;
      break;
    default:
      threshold *= 0.62;
      break;
  }

  if ((perception.targets[0]?.distance ?? 0) >= 850) {
    threshold *= 0.82;
  }

  if (
    (intent.kind === "pressure" ||
      intent.kind === "reposition" ||
      intent.kind === "explore" ||
      intent.kind === "zoneWithHeavy" ||
      intent.kind === "lockSeeker") &&
    perception.laneQuality <= 0.38
  ) {
    threshold *= 0.82;
  }

  const ticksSinceBoost =
    lastBoostTick < 0
      ? Number.POSITIVE_INFINITY
      : Math.max(0, tick - lastBoostTick);
  if (ticksSinceBoost >= tickHz * 2.5) {
    threshold *= 0.8;
  }
  if (ticksSinceBoost >= tickHz * 5) {
    threshold *= 0.72;
  }

  return Math.max(0.55, threshold);
};

const isPressureLightProbeShot = (score: CombatAiShotScore): boolean =>
  score.weaponKind === "light" &&
  score.confidence >=
    Math.max(
      0.2,
      COMBAT_AI_TUNING.execution.pressureLightOverrideConfidence * 0.5,
    ) &&
  score.expectedDamage >=
    Math.max(3, COMBAT_AI_TUNING.execution.pressureLightOverrideDamage * 0.4) &&
  score.wasteScore <=
    Math.min(
      0.5,
      COMBAT_AI_TUNING.execution.pressureLightOverrideWaste + 0.26,
    ) &&
  score.breakdown.shieldLikelihood <= 0.5;

const chooseShotForIntent = (
  intent: CombatAiIntent,
  scores: CombatAiShotScore[],
): CombatAiShotScore | null => {
  if (scores.length === 0) {
    return null;
  }

  switch (intent.kind) {
    case "zoneWithHeavy":
      return scores.find((score) => score.weaponKind === "heavy") ?? scores[0]!;
    case "lockSeeker":
      return (
        scores.find((score) => score.weaponKind === "seeker") ?? scores[0]!
      );
    case "pressure": {
      const light = scores.find((score) => score.weaponKind === "light");
      const heavy = scores.find(
        (score) => score.weaponKind === "heavy" && score.allowFire,
      );
      const lightPressureReady =
        light !== undefined &&
        (light.allowFire || isPressureLightProbeShot(light));
      if (light && heavy) {
        const heavyDecisive =
          heavy.expectedDamage >= light.expectedDamage * 2.4 &&
          heavy.score >= light.score + 18 &&
          heavy.wasteScore <= 0.18;
        return heavyDecisive || !lightPressureReady ? heavy : light;
      }
      return (lightPressureReady ? light : undefined) ?? heavy ?? scores[0]!;
    }
    case "survive":
    case "reposition":
    case "explore":
    case "contestCache":
    case "recover":
      return (
        scores.find(
          (score) =>
            score.allowFire &&
            (score.weaponKind === "light" || score.confidence >= 0.74),
        ) ?? scores[0]!
      );
    default:
      return scores[0]!;
  }
};

const buildAbilityPolicy = ({
  bestMoveDelta,
  boostCommitThreshold,
  chosenShot,
  drone,
  intent,
  lastBoostTick,
  moveGoal,
  perception,
  privateState,
  self,
  target,
  tick,
  tickHz,
  topThreat,
  world,
}: {
  bestMoveDelta: number;
  boostCommitThreshold: number;
  chosenShot: CombatAiShotScore | null;
  drone: Drone | null;
  intent: CombatAiIntent;
  lastBoostTick: number;
  moveGoal: CombatAiMoveGoal | null;
  perception: CombatAiBlackboard["perception"];
  privateState: PlanetPrivateState;
  self: PlanetPublic;
  target: PlanetPublic | null;
  tick: number;
  tickHz: number;
  topThreat: CombatAiBlackboard["perception"]["threats"][number] | undefined;
  world: World;
}): CombatAiAbilityPolicy => {
  const reasons: string[] = [];
  const gravityPulseScore = scoreGravityPulseOpportunity({
    rockets: world.rockets,
    self,
    target,
    world,
  });
  const shield =
    topThreat?.preferredResponse === "shield" &&
    (topThreat.immediate || topThreat.urgency >= 0.55) &&
    self.shieldLoad > 0;
  if (shield && topThreat !== undefined) {
    reasons.push(`shield ${topThreat.kind}`);
  }

  const ticksSinceBoost =
    lastBoostTick < 0
      ? Number.POSITIVE_INFINITY
      : Math.max(0, tick - lastBoostTick);
  const movementPressure =
    moveGoal === null
      ? 0
      : Math.max(
          moveGoal.breakdown.pressure,
          moveGoal.breakdown.resource,
          moveGoal.breakdown.exploration,
        );
  const assertiveRepositionWindow =
    moveGoal !== null &&
    (moveGoal.kind === "cache" ||
      moveGoal.kind === "explore" ||
      moveGoal.kind === "commit" ||
      moveGoal.kind === "band") &&
    moveGoal.breakdown.survival >= 0.48 &&
    movementPressure >= 0.4 &&
    ticksSinceBoost >= tickHz * 2 &&
    dot(normalize(self.vel), moveGoal.dir) < 0.74;
  const boost =
    privateState.boostCharges > 0 &&
    moveGoal?.usesBoost === true &&
    (bestMoveDelta >= boostCommitThreshold ||
      (assertiveRepositionWindow &&
        bestMoveDelta >= boostCommitThreshold * 0.4) ||
      (intent.kind === "survive" &&
        moveGoal.kind === "escape" &&
        topThreat?.preferredResponse === "boost") ||
      (intent.kind === "survive" &&
        topThreat?.preferredResponse === "boost" &&
        topThreat.urgency >= 0.72));
  if (boost) {
    reasons.push("boost commit");
  }

  const foresight =
    perception.foresightReady &&
    !shield &&
    chosenShot !== null &&
    chosenShot.confidence >= 0.64 &&
    (intent.kind === "finish" ||
      intent.kind === "zoneWithHeavy" ||
      intent.kind === "lockSeeker");
  if (foresight) {
    reasons.push("foresight setup");
  }

  const gravityPulse =
    privateState.gravityPulseHeld &&
    gravityPulseScore >= 0.66 &&
    (intent.kind === "survive" ||
      intent.kind === "finish" ||
      intent.kind === "useWildcard");
  if (gravityPulse) {
    reasons.push(`gravity pulse ${gravityPulseScore.toFixed(2)}`);
  }

  const cloak =
    privateState.cloakHeld &&
    ((intent.kind === "contestCache" &&
      perception.caches[0] !== undefined &&
      perception.caches[0]!.contestMarginSec <= 0.75) ||
      (intent.kind === "survive" && (topThreat?.urgency ?? 0) >= 0.82) ||
      (intent.kind === "finish" && (chosenShot?.confidence ?? 0) >= 0.74));
  if (cloak) {
    reasons.push("cloak swing window");
  }

  const droneLaunch =
    perception.droneReady &&
    self.pilotingDroneId === undefined &&
    self.playerId !== undefined &&
    intent.kind === "deployDrone" &&
    self.shieldActive === false;
  if (droneLaunch) {
    reasons.push("launch drone");
  }

  const droneDir =
    intent.targetCacheId !== undefined &&
    world.caches.find((cache) => cache.id === intent.targetCacheId) !==
      undefined
      ? normalize(
          sub(
            world.caches.find((cache) => cache.id === intent.targetCacheId)!
              .pos,
            drone?.pos ?? self.pos,
          ),
        )
      : target !== null
        ? normalize(sub(target.pos, drone?.pos ?? self.pos))
        : defaultCombatAiAimDir();

  return {
    shield,
    shieldDir: topThreat?.escapeDir
      ? normalize(topThreat.escapeDir)
      : undefined,
    boost,
    boostDir:
      boost && moveGoal !== null
        ? normalize(moveGoal.dir)
        : topThreat?.escapeDir !== undefined
          ? normalize(topThreat.escapeDir)
          : undefined,
    foresight,
    gravityPulse,
    cloak,
    droneLaunch,
    droneDir,
    droneTurn: drone !== null ? turnSignalForDrone(drone, droneDir) : 0,
    reason: reasons,
  };
};

const buildFireGate = ({
  chosenShot,
  executionState,
  intent,
}: {
  chosenShot: CombatAiShotScore | null;
  executionState: CombatAiPlan["executionState"];
  intent: CombatAiIntent;
}): CombatAiFireGate => {
  if (chosenShot === null) {
    return {
      allowFire: false,
      confidence: 0,
      expectedDamage: 0,
      wasteScore: 0,
      holdReason: "no weapon solution",
    };
  }

  const fireSuppressed =
    executionState === "evade" ||
    executionState === "recover" ||
    executionState === "droneRun" ||
    (executionState === "cacheRun" &&
      chosenShot.confidence <
        COMBAT_AI_TUNING.execution.cacheRunFireConfidence);
  const pressureLightOverride =
    intent.kind === "pressure" && isPressureLightProbeShot(chosenShot);
  const allowFire =
    (chosenShot.allowFire || pressureLightOverride) &&
    !fireSuppressed &&
    !(
      (intent.kind === "reposition" &&
        chosenShot.confidence <
          COMBAT_AI_TUNING.execution.repositionFireConfidence) ||
      (executionState === "cacheRun" &&
        chosenShot.confidence <
          COMBAT_AI_TUNING.execution.cacheRunFireConfidence)
    );

  return {
    allowFire,
    confidence: chosenShot.confidence,
    expectedDamage: chosenShot.expectedDamage,
    wasteScore: chosenShot.wasteScore,
    holdReason: allowFire
      ? undefined
      : fireSuppressed
        ? `${executionState} suppresses fire`
        : chosenShot.holdReason,
    weaponKind: chosenShot.weaponKind,
    aimDir: chosenShot.aimDir,
    targetId: chosenShot.targetId,
    targetPlayerId: chosenShot.targetPlayerId,
  };
};

export const buildCombatAiPlan = ({
  blackboard,
  difficulty,
  intent,
  privateState,
  self,
  tick,
  world,
}: {
  blackboard: CombatAiBlackboard;
  difficulty: BotDifficulty;
  intent: CombatAiIntent;
  privateState: PlanetPrivateState;
  self: PlanetPublic;
  tick: number;
  world: World;
}): CombatAiPlan => {
  const perception = blackboard.perception;
  const target = findTarget(intent, perception.primaryTargetId, world);
  const bestCache =
    intent.targetCacheId === undefined
      ? null
      : (world.caches.find((cache) => cache.id === intent.targetCacheId) ??
        null);
  const topThreat = perception.threats[0];
  const moveGoals = scoreMovementGoals({
    bestCache,
    boostCharges: privateState.boostCharges,
    difficulty,
    exploreTargetPos: perception.explore?.targetPos ?? null,
    intentKind: intent.kind,
    privateState,
    self,
    target,
    topThreatEscapeDir: topThreat?.escapeDir ?? null,
    world,
  });
  const holdGoal = moveGoals.find((goal) => goal.usesBoost === false) ?? null;
  const bestMoveGoal = moveGoals[0] ?? holdGoal;
  const bestMoveDelta =
    bestMoveGoal === null
      ? 0
      : bestMoveGoal.totalScore -
        (holdGoal?.totalScore ?? bestMoveGoal.totalScore);
  const boostCommitThreshold = resolveBoostCommitThreshold({
    intent,
    lastBoostTick: blackboard.history.lastBoostTick,
    perception,
    tick,
    tickHz: blackboard.self.tickHz,
    topThreat,
  });
  const escapeMoveGoal =
    topThreat === undefined
      ? null
      : (moveGoals.find(
          (goal) =>
            goal.usesBoost &&
            (goal.label === "threat escape" || goal.kind === "escape"),
        ) ?? null);
  const cacheMoveGoal =
    bestCache === null
      ? null
      : (moveGoals.find((goal) => goal.targetCacheId === bestCache.id) ?? null);

  const targetFact =
    target === null
      ? undefined
      : perception.targets.find((item) => item.planetId === target.id);
  const shotScores =
    target !== null && targetFact !== undefined
      ? buildShotScores({
          ammoPressure: perception.ammoPressure,
          difficulty,
          privateState,
          self,
          target,
          targetFact,
          tick,
          world,
        })
      : [];
  const chosenShot = chooseShotForIntent(intent, shotScores);
  const executionState = executionStateForIntent(intent);
  const drone = findDrone(self, world, blackboard.self.activeDroneId);
  const fireGate = buildFireGate({
    chosenShot,
    executionState,
    intent,
  });
  const forcedMoveGoal =
    intent.kind === "survive" &&
    topThreat !== undefined &&
    topThreat.preferredResponse === "boost" &&
    privateState.boostCharges > 0
      ? (escapeMoveGoal ?? bestMoveGoal)
      : intent.kind === "contestCache" && cacheMoveGoal !== null
        ? cacheMoveGoal
        : null;
  const moveGoal =
    forcedMoveGoal ??
    (bestMoveGoal === null
      ? null
      : bestMoveGoal.usesBoost && bestMoveDelta < boostCommitThreshold
        ? (holdGoal ?? bestMoveGoal)
        : bestMoveGoal);
  const abilityPolicy = buildAbilityPolicy({
    bestMoveDelta,
    boostCommitThreshold,
    chosenShot,
    drone,
    intent,
    lastBoostTick: blackboard.history.lastBoostTick,
    moveGoal,
    perception,
    privateState,
    self,
    target,
    tick,
    tickHz: blackboard.self.tickHz,
    topThreat,
    world,
  });
  const aimGoal =
    executionState === "droneRun" && abilityPolicy.droneDir !== undefined
      ? {
          dir: abilityPolicy.droneDir,
          confidence: 0.6,
          targetId: target?.id,
          targetPlayerId: target?.playerId,
          reason: "drone vector",
        }
      : chosenShot !== null
        ? {
            dir: chosenShot.aimDir,
            confidence: chosenShot.confidence,
            targetId: chosenShot.targetId,
            targetPlayerId: chosenShot.targetPlayerId,
            weaponKind: chosenShot.weaponKind,
            reason: fireGate.allowFire
              ? `${chosenShot.weaponKind} firing lane`
              : (chosenShot.holdReason ?? "track firing lane"),
          }
        : moveGoal !== null
          ? {
              dir: moveGoal.dir,
              confidence: clampAimConfidence(moveGoal.totalScore),
              targetPlayerId: target?.playerId,
              targetId: target?.id,
              reason: moveGoal.reason,
            }
          : {
              dir: defaultCombatAiAimDir(),
              confidence: 0.2,
              reason: "no tactical aim",
            };

  return {
    generatedAtTick: tick,
    expiresAtTick: tick + planExpiryTicks(intent),
    executionState,
    moveGoal,
    aimGoal,
    weaponPolicy: {
      preferredKind: chosenShot?.weaponKind ?? null,
      scoredShots: shotScores,
      holdReason: fireGate.allowFire ? null : (fireGate.holdReason ?? null),
    },
    abilityPolicy: {
      ...abilityPolicy,
      boostDir: moveGoal?.dir,
      shieldDir:
        topThreat !== undefined
          ? normalize(scale(topThreat.escapeDir, -1))
          : abilityPolicy.shieldDir,
    },
    fireGate,
    abortConditions: [
      {
        kind: "intentExpired",
        reason: `${intent.kind} window expires at ${tick + planExpiryTicks(intent)}`,
      },
      ...(target === null
        ? []
        : [
            {
              kind: "targetLost",
              reason: `retarget if ${target.playerId} disappears`,
            },
          ]),
      ...(bestCache === null
        ? []
        : [
            {
              kind: "cacheLost",
              reason: `cache ${bestCache.id} no longer available`,
            },
          ]),
      {
        kind: "threatSpike",
        reason: "preempt if immediate threat appears",
      },
    ],
    reason: `${intent.kind}: ${intent.reason}`,
  };
};

const clampAimConfidence = (score: number): number =>
  Math.min(0.9, Math.max(0.2, score / 100));
