import type { World } from "../entities";
import type {
  CombatAiBlackboard,
  CombatAiPerception,
  CombatAiPlan,
} from "./types";

const PERCEPTION_REFRESH_TICKS = 6;
const INTENT_REFRESH_TICKS = 12;

export const shouldRefreshPerception = (
  blackboard: CombatAiBlackboard,
  tick: number,
  immediateInterrupt: string | null,
): boolean =>
  immediateInterrupt !== null ||
  blackboard.history.lastPerceptionTick < 0 ||
  tick - blackboard.history.lastPerceptionTick >= PERCEPTION_REFRESH_TICKS;

export const shouldRefreshIntent = (
  blackboard: CombatAiBlackboard,
  tick: number,
  immediateInterrupt: string | null,
): boolean =>
  immediateInterrupt !== null ||
  blackboard.history.lastIntentTick < 0 ||
  tick >= blackboard.intent.expiresAtTick ||
  tick - blackboard.history.lastIntentTick >= INTENT_REFRESH_TICKS;

export const detectImmediateInterrupt = (
  perception: CombatAiPerception,
): string | null =>
  perception.threats.find((threat) => threat.immediate)?.reason ?? null;

export const detectSoftInterrupt = ({
  blackboard,
  perception,
  tick,
}: {
  blackboard: CombatAiBlackboard;
  perception: CombatAiPerception;
  tick: number;
}): string | null => {
  const plan = blackboard.plan;
  if (plan === null) {
    return "no active plan";
  }

  if (tick >= plan.expiresAtTick) {
    return "plan expired";
  }

  if (
    plan.fireGate.allowFire &&
    perception.primaryTargetPlayerId !== undefined &&
    plan.fireGate.targetPlayerId !== perception.primaryTargetPlayerId &&
    perception.targets[0] !== undefined &&
    perception.targets[0]!.pressureScore >= 0.65
  ) {
    return "better target window opened";
  }

  if (
    plan.executionState !== "cacheRun" &&
    perception.caches[0] !== undefined &&
    perception.caches[0]!.contestScore >= 86
  ) {
    return "cache contest opened";
  }

  if (
    plan.executionState === "planetCombat" &&
    !plan.fireGate.allowFire &&
    perception.laneQuality <= 0.3
  ) {
    return "firing lane collapsed";
  }

  return null;
};

export const isCombatAiPlanInvalid = ({
  blackboard,
  perception,
  tick,
  world,
}: {
  blackboard: CombatAiBlackboard;
  perception: CombatAiPerception;
  tick: number;
  world: World;
}): boolean => {
  const plan = blackboard.plan;
  if (plan === null) {
    return true;
  }

  if (tick >= plan.expiresAtTick) {
    return true;
  }

  if (
    plan.fireGate.targetPlayerId !== undefined &&
    !world.planets.some(
      (planet) => planet.playerId === plan.fireGate.targetPlayerId,
    )
  ) {
    return true;
  }

  if (
    plan.moveGoal?.targetCacheId !== undefined &&
    !world.caches.some((cache) => cache.id === plan.moveGoal?.targetCacheId)
  ) {
    return true;
  }

  return perception.threats.some((threat) => threat.immediate);
};

export const updateCombatAiExecutionState = ({
  blackboard,
  plan,
  tick,
  transitionReason,
}: {
  blackboard: CombatAiBlackboard;
  plan: CombatAiPlan | null;
  tick: number;
  transitionReason: string;
}): void => {
  if (plan === null) {
    return;
  }

  if (blackboard.execution.currentState === plan.executionState) {
    return;
  }

  const transition = {
    from: blackboard.execution.currentState,
    to: plan.executionState,
    tick,
    reason: transitionReason,
  } as const;
  blackboard.execution = {
    currentState: plan.executionState,
    sinceTick: tick,
    lastTransition: transition,
  };
  blackboard.history.transitions = [
    ...blackboard.history.transitions.slice(-5),
    transition,
  ];
};

export const recordCombatAiPreemption = ({
  blackboard,
  immediate,
  reason,
  tick,
}: {
  blackboard: CombatAiBlackboard;
  immediate: boolean;
  reason: string;
  tick: number;
}): void => {
  blackboard.history.lastInterruptReason = reason;
  blackboard.history.preemptions = [
    ...blackboard.history.preemptions.slice(-5),
    {
      tick,
      reason,
      immediate,
    },
  ];
};
