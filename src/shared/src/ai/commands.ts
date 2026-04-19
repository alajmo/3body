import { defaultCombatAiAimDir } from "./blackboard";
import type { CombatAiBlackboard, CombatAiCommandDirective } from "./types";

export const buildCombatAiCommandDirective = (
  blackboard: CombatAiBlackboard,
): CombatAiCommandDirective => {
  const plan = blackboard.plan;
  const topThreat = blackboard.perception.threats[0];
  const aimDir = plan?.aimGoal?.dir ?? plan?.moveGoal?.dir ?? defaultCombatAiAimDir();
  const notes = [
    `intent ${blackboard.intent.kind}`,
    ...(plan === null ? ["no plan"] : [plan.reason]),
    ...(plan?.fireGate.holdReason ? [`hold ${plan.fireGate.holdReason}`] : []),
  ];

  return {
    aimDir,
    shieldAimDir:
      plan?.abilityPolicy.shieldDir ??
      (topThreat === undefined ? undefined : scaleDir(topThreat.escapeDir, -1)),
    fire:
      plan?.fireGate.allowFire === true &&
      plan.fireGate.weaponKind !== undefined &&
      plan.fireGate.aimDir !== undefined
        ? {
            weaponKind: plan.fireGate.weaponKind,
            aimDir: plan.fireGate.aimDir,
            targetId: plan.fireGate.targetId,
            targetPlayerId: plan.fireGate.targetPlayerId,
          }
        : undefined,
    abilityPolicy:
      plan?.abilityPolicy ?? {
        shield: false,
        boost: false,
        foresight: false,
        gravityPulse: false,
        cloak: false,
        reason: [],
      },
    notes,
  };
};

const scaleDir = (dir: { x: number; y: number }, scalar: number) => ({
  x: dir.x * scalar,
  y: dir.y * scalar,
});
