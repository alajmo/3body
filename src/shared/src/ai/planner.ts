import type { PlanetPrivateState, PlanetPublic, World } from "../entities";
import type { BotDifficulty } from "../protocol";
import { dot, len, normalize, scale } from "../vec2";
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
    case "useWildcard":
      return "wildcardSetup";
    case "recover":
      return "recover";
    default:
      return "planetCombat";
  }
};

const inwardDir = (pos: Vec2): Vec2 => {
  const dir = normalize(scale(pos, -1));
  return len(dir) === 0 ? defaultCombatAiAimDir() : dir;
};

const selectShieldThreat = ({
  perception,
  self,
}: {
  perception: CombatAiBlackboard["perception"];
  self: PlanetPublic;
}): CombatAiBlackboard["perception"]["threats"][number] | undefined => {
  if (self.shieldLoad <= 0) {
    return undefined;
  }

  return perception.threats.find((threat) => {
    if (threat.kind !== "rocket") {
      return false;
    }

    return (
      threat.immediate ||
      (threat.timeSec <= 0.8 && threat.urgency >= 0.34) ||
      (self.shieldActive && threat.timeSec <= 1.05 && threat.urgency >= 0.24) ||
      threat.urgency >= 0.62
    );
  });
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

  if (perception.boundaryPressure >= 0.34) {
    threshold *= 0.72;
  }
  if (perception.boundaryPressure >= 0.55 || topThreat?.kind === "boundary") {
    threshold *= 0.58;
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

const isLowAmmoLightFallbackShot = ({
  privateState,
  score,
}: {
  privateState: PlanetPrivateState;
  score: CombatAiShotScore;
}): boolean =>
  score.weaponKind === "light" &&
  privateState.ammo.heavy <= 0 &&
  privateState.ammo.seeker <= 0 &&
  score.confidence >=
    Math.max(
      0.26,
      COMBAT_AI_TUNING.execution.pressureLightOverrideConfidence * 0.6,
    ) &&
  score.expectedDamage >=
    Math.max(
      2.5,
      COMBAT_AI_TUNING.execution.pressureLightOverrideDamage * 0.35,
    ) &&
  score.wasteScore <=
    Math.min(
      0.56,
      COMBAT_AI_TUNING.execution.pressureLightOverrideWaste + 0.32,
    ) &&
  score.breakdown.shieldLikelihood <= 0.56;

const chooseShotForIntent = (
  intent: CombatAiIntent,
  privateState: PlanetPrivateState,
  scores: CombatAiShotScore[],
): CombatAiShotScore | null => {
  if (scores.length === 0) {
    return null;
  }

  const lowAmmoLightFallback = scores.find((score) =>
    isLowAmmoLightFallbackShot({ privateState, score }),
  );

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
      return (
        (lightPressureReady ? light : undefined) ??
        lowAmmoLightFallback ??
        heavy ??
        scores[0]!
      );
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
        ) ??
        lowAmmoLightFallback ??
        scores[0]!
      );
    default:
      return lowAmmoLightFallback ?? scores[0]!;
  }
};

const buildAbilityPolicy = ({
  bestMoveDelta,
  boostCommitThreshold,
  intent,
  lastBoostTick,
  moveGoal,
  perception,
  privateState,
  shieldThreat,
  self,
  target,
  tick,
  tickHz,
  topThreat,
  world,
}: {
  bestMoveDelta: number;
  boostCommitThreshold: number;
  intent: CombatAiIntent;
  lastBoostTick: number;
  moveGoal: CombatAiMoveGoal | null;
  perception: CombatAiBlackboard["perception"];
  privateState: PlanetPrivateState;
  shieldThreat: CombatAiBlackboard["perception"]["threats"][number] | undefined;
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
  const shield = shieldThreat !== undefined;
  if (shield) {
    reasons.push("shield rocket");
  }

  const ticksSinceBoost =
    lastBoostTick < 0
      ? Number.POSITIVE_INFINITY
      : Math.max(0, tick - lastBoostTick);
  const inwardAlignment =
    moveGoal === null ? 0 : dot(moveGoal.dir, inwardDir(self.pos));
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
  const boundaryRescueWindow =
    moveGoal?.usesBoost &&
    perception.boundaryPressure >= 0.32 &&
    moveGoal.breakdown.survival >= 0.44 &&
    inwardAlignment >= 0.18 &&
    ticksSinceBoost >= tickHz;
  const boost =
    privateState.boostCharges > 0 &&
    moveGoal?.usesBoost === true &&
    (bestMoveDelta >= boostCommitThreshold ||
      boundaryRescueWindow ||
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

  const gravityPulse =
    privateState.gravityPulseHeld &&
    gravityPulseScore >= 0.66 &&
    (intent.kind === "survive" ||
      intent.kind === "finish" ||
      intent.kind === "useWildcard");
  if (gravityPulse) {
    reasons.push(`gravity pulse ${gravityPulseScore.toFixed(2)}`);
  }

  return {
    shield,
    shieldDir: shieldThreat?.escapeDir
      ? normalize(scale(shieldThreat.escapeDir, -1))
      : undefined,
    boost,
    boostDir:
      boost && moveGoal !== null
        ? normalize(moveGoal.dir)
        : topThreat?.escapeDir !== undefined
          ? normalize(topThreat.escapeDir)
          : undefined,
    gravityPulse,
    reason: reasons,
  };
};

const buildFireGate = ({
  chosenShot,
  executionState,
  intent,
  privateState,
  topThreat,
}: {
  chosenShot: CombatAiShotScore | null;
  executionState: CombatAiPlan["executionState"];
  intent: CombatAiIntent;
  privateState: PlanetPrivateState;
  topThreat: CombatAiBlackboard["perception"]["threats"][number] | undefined;
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

  const lowAmmoLightOverride = isLowAmmoLightFallbackShot({
    privateState,
    score: chosenShot,
  });
  const boundaryEvadeLightWindow =
    executionState === "evade" &&
    topThreat?.kind === "boundary" &&
    chosenShot.weaponKind === "light" &&
    (chosenShot.allowFire || lowAmmoLightOverride);
  const fireSuppressed =
    (executionState === "evade" && !boundaryEvadeLightWindow) ||
    (executionState === "recover" && !lowAmmoLightOverride) ||
    (executionState === "cacheRun" &&
      chosenShot.confidence <
        COMBAT_AI_TUNING.execution.cacheRunFireConfidence &&
      !lowAmmoLightOverride);
  const pressureLightOverride =
    intent.kind === "pressure" && isPressureLightProbeShot(chosenShot);
  const allowFire =
    (chosenShot.allowFire || pressureLightOverride || lowAmmoLightOverride) &&
    !fireSuppressed &&
    !(
      (intent.kind === "reposition" &&
        chosenShot.confidence <
          COMBAT_AI_TUNING.execution.repositionFireConfidence &&
        !lowAmmoLightOverride) ||
      (executionState === "cacheRun" &&
        chosenShot.confidence <
          COMBAT_AI_TUNING.execution.cacheRunFireConfidence &&
        !lowAmmoLightOverride)
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
  const shieldThreat = selectShieldThreat({ perception, self });
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
  const chosenShot = chooseShotForIntent(intent, privateState, shotScores);
  const executionState = executionStateForIntent(intent);
  const fireGate = buildFireGate({
    chosenShot,
    executionState,
    intent,
    privateState,
    topThreat,
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
  const edgeRescueBoostGoal =
    bestMoveGoal?.usesBoost &&
    perception.boundaryPressure >= 0.32 &&
    bestMoveGoal.breakdown.survival >= 0.44 &&
    dot(bestMoveGoal.dir, inwardDir(self.pos)) >= 0.18;
  const moveGoal =
    forcedMoveGoal ??
    (bestMoveGoal === null
      ? null
      : bestMoveGoal.usesBoost &&
          bestMoveDelta < boostCommitThreshold &&
          !edgeRescueBoostGoal
        ? (holdGoal ?? bestMoveGoal)
        : bestMoveGoal);
  const abilityPolicy = buildAbilityPolicy({
    bestMoveDelta,
    boostCommitThreshold,
    intent,
    lastBoostTick: blackboard.history.lastBoostTick,
    moveGoal,
    perception,
    privateState,
    shieldThreat,
    self,
    target,
    tick,
    tickHz: blackboard.self.tickHz,
    topThreat,
    world,
  });
  const aimGoal =
    chosenShot !== null
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
      shieldDir: abilityPolicy.shieldDir,
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
