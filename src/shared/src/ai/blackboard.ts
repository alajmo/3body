import type {
  CombatAiBlackboard,
  CombatAiDebugState,
  CombatAiExecutionState,
  CombatAiHistory,
  CombatAiIntent,
  CombatAiPerception,
  CombatAiSelfState,
} from "./types";

const DEFAULT_DIR = { x: 1, y: 0 };

const createEmptyPerception = (
  self: CombatAiSelfState,
): CombatAiPerception => ({
  tick: self.tick,
  threats: [],
  targets: [],
  caches: [],
  hpPressure: 0,
  ammoPressure: 0,
  boundaryPressure: 0,
  blackHolePressure: 0,
  laneQuality: 0,
  explore: null,
  shieldReady: self.shieldLoad > 0 && !self.shieldActive,
  boostReady: self.boostCharges > 0,
  foresightReady:
    self.cooldowns.foresightActiveUntilTick <= self.tick &&
    self.cooldowns.foresightCooldownUntilTick <= self.tick,
  gravityPulseHeld: self.gravityPulseHeld,
  cloakHeld: self.cloakHeld,
});

const createEmptyIntent = (tick: number): CombatAiIntent => ({
  kind: "reposition",
  score: 0,
  expiresAtTick: tick,
  reason: "bootstrapping blackboard",
});

const createHistory = (): CombatAiHistory => ({
  lastPerceptionTick: -1,
  lastIntentTick: -1,
  lastPlanTick: -1,
  lastBoostTick: -1,
  lastTargetPlayerId: null,
  lastCacheId: null,
  lastExploreSectorKey: null,
  lastInterruptReason: null,
  sectorVisitTicks: {},
  recentThreats: [],
  transitions: [],
  preemptions: [],
  lastCommands: [],
});

const createDebugState = (): CombatAiDebugState => ({
  activeIntent: null,
  activeIntentReason: null,
  alternatives: [],
  currentTargetPlayerId: null,
  currentTargetId: null,
  executionState: "reposition",
  movementScoreBreakdown: [],
  shotScoreBreakdown: [],
  threatRanking: [],
  lastTransitionReason: null,
  lastPreemptionReason: null,
  planExpiryTick: null,
  planReason: null,
  fireHoldReason: null,
  commandTrace: [],
});

const createExecutionState = (tick: number): CombatAiExecutionState => ({
  currentState: "reposition",
  sinceTick: tick,
  lastTransition: null,
});

export const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, value));

export const createCombatAiBlackboard = (
  self: CombatAiSelfState,
  rngState: number,
): CombatAiBlackboard => ({
  self,
  perception: createEmptyPerception(self),
  intent: createEmptyIntent(self.tick),
  intentAlternatives: [],
  plan: null,
  execution: createExecutionState(self.tick),
  history: createHistory(),
  debug: createDebugState(),
  rngState: rngState >>> 0,
});

export const cloneCombatAiBlackboard = (
  blackboard: CombatAiBlackboard,
): CombatAiBlackboard =>
  JSON.parse(JSON.stringify(blackboard)) as CombatAiBlackboard;

export const replaceCombatAiSelfState = (
  blackboard: CombatAiBlackboard,
  self: CombatAiSelfState,
): void => {
  blackboard.self = {
    ...self,
    pos: { ...self.pos },
    vel: { ...self.vel },
    ammo: { ...self.ammo },
    cooldowns: { ...self.cooldowns },
  };
};

export const nextCombatAiRandom = (blackboard: CombatAiBlackboard): number => {
  blackboard.rngState =
    (Math.imul(1664525, blackboard.rngState) + 1013904223) >>> 0;
  return blackboard.rngState / 4294967296;
};

export const stableTieBreak = (
  blackboard: CombatAiBlackboard,
  leftScore: number,
  rightScore: number,
): number => {
  if (Math.abs(leftScore - rightScore) > 0.0001) {
    return leftScore - rightScore;
  }

  return nextCombatAiRandom(blackboard) - 0.5;
};

export const defaultCombatAiAimDir = () => ({ ...DEFAULT_DIR });
