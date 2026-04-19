import type { CombatAiBlackboard, CombatAiDebugState } from "./types";

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

export const buildCombatAiDebugState = (
  blackboard: CombatAiBlackboard,
): CombatAiDebugState => {
  const plan = blackboard.plan;

  return {
    activeIntent: blackboard.intent.kind,
    activeIntentReason: blackboard.intent.reason,
    alternatives: blackboard.intentAlternatives.slice(0, 4),
    currentTargetPlayerId:
      plan?.fireGate.targetPlayerId ?? blackboard.intent.targetPlayerId ?? null,
    currentTargetId:
      plan?.fireGate.targetId ?? blackboard.intent.targetPlanetId ?? null,
    executionState: blackboard.execution.currentState,
    movementScoreBreakdown:
      plan?.moveGoal === null || plan?.moveGoal === undefined
        ? []
        : [
            `${plan.moveGoal.label} ${plan.moveGoal.totalScore.toFixed(1)}`,
            `survival ${formatPercent(plan.moveGoal.breakdown.survival)}`,
            `line ${formatPercent(plan.moveGoal.breakdown.lineOfFire)}`,
            `pressure ${formatPercent(plan.moveGoal.breakdown.pressure)}`,
            `resource ${formatPercent(plan.moveGoal.breakdown.resource)}`,
            `explore ${formatPercent(plan.moveGoal.breakdown.exploration)}`,
          ],
    shotScoreBreakdown:
      plan?.weaponPolicy.scoredShots
        .slice(0, 3)
        .map(
          (shot) =>
            `${shot.weaponKind} ${formatPercent(shot.confidence)} · dmg ${shot.expectedDamage.toFixed(0)}${shot.allowFire ? " fire" : ` hold ${shot.holdReason ?? ""}`}`,
        ) ?? [],
    threatRanking: blackboard.perception.threats
      .slice(0, 3)
      .map(
        (threat) =>
          `${threat.kind} ${formatPercent(threat.urgency)} · ${threat.reason}`,
      ),
    lastTransitionReason: blackboard.execution.lastTransition?.reason ?? null,
    lastPreemptionReason:
      blackboard.history.preemptions[blackboard.history.preemptions.length - 1]
        ?.reason ?? null,
    planExpiryTick: plan?.expiresAtTick ?? null,
    planReason: plan?.reason ?? null,
    fireHoldReason: plan?.fireGate.holdReason ?? null,
    commandTrace: blackboard.history.lastCommands.slice(-4),
  };
};

export const summarizeCombatAiDebug = (
  debug: CombatAiDebugState,
): Array<{ label: string; value: string }> => {
  const items: Array<{ label: string; value: string }> = [];

  if (debug.activeIntent !== null) {
    items.push({
      label: "AI Intent",
      value: `${debug.activeIntent} · ${debug.executionState}`,
    });
  }
  if (debug.activeIntentReason !== null) {
    items.push({
      label: "AI Reason",
      value: debug.activeIntentReason,
    });
  }
  if (debug.shotScoreBreakdown[0] !== undefined) {
    items.push({
      label: "AI Shot",
      value: debug.shotScoreBreakdown[0]!,
    });
  }
  if (debug.movementScoreBreakdown[0] !== undefined) {
    items.push({
      label: "AI Move",
      value: debug.movementScoreBreakdown[0]!,
    });
  }
  if (debug.threatRanking[0] !== undefined) {
    items.push({
      label: "AI Threat",
      value: debug.threatRanking[0]!,
    });
  }
  if (debug.planExpiryTick !== null) {
    items.push({
      label: "AI Plan",
      value: `exp ${debug.planExpiryTick}${debug.fireHoldReason ? ` · ${debug.fireHoldReason}` : ""}`,
    });
  }

  return items;
};
