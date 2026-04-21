import type {
  CacheContents,
  EntityId,
  PlanetPrivateState,
  PlanetPublic,
  PlayerId,
  RocketKind,
} from "../entities";
import type { BotDifficulty } from "../protocol";
import type { Vec2 } from "../vec2";

export type CombatAiExecutionMode =
  | "planetCombat"
  | "evade"
  | "reposition"
  | "cacheRun"
  | "finishWindow"
  | "wildcardSetup"
  | "recover";

export type CombatAiIntentKind =
  | "survive"
  | "explore"
  | "reposition"
  | "pressure"
  | "finish"
  | "contestCache"
  | "recover"
  | "zoneWithHeavy"
  | "lockSeeker"
  | "useWildcard";

export type CombatAiThreatKind =
  | "rocket"
  | "planet"
  | "sun"
  | "neutronStar"
  | "blackHole"
  | "boundary"
  | "targetLost"
  | "cacheRace"
  | "laneCollapse"
  | "crossfire";

export type CombatAiThreatResponse =
  | "shield"
  | "boost"
  | "reposition"
  | "retarget"
  | "abandonCache"
  | "hold";

export interface CombatAiSelfState {
  tick: number;
  tickHz: number;
  difficulty: BotDifficulty;
  arenaRadius: number;
  planetId: EntityId;
  playerId: PlayerId;
  archetype: PlanetPublic["archetype"];
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  shieldActive: boolean;
  shieldLoad: number;
  shieldMaxLoad: number;
  ammo: PlanetPrivateState["ammo"];
  cooldowns: PlanetPrivateState["cooldowns"];
  boostCharges: number;
  gravityPulseHeld: boolean;
  nextShieldExt: boolean;
}

export interface CombatAiThreat {
  kind: CombatAiThreatKind;
  urgency: number;
  immediate: boolean;
  timeSec: number;
  entityId?: EntityId;
  playerId?: PlayerId;
  preferredResponse: CombatAiThreatResponse;
  escapeDir: Vec2;
  reason: string;
}

export interface CombatAiTargetFact {
  planetId: EntityId;
  playerId: PlayerId;
  hp: number;
  distance: number;
  radialDistance: number;
  closingSpeed: number;
  chaosScore: number;
  pressureScore: number;
}

export interface CombatAiCacheFact {
  cacheId: EntityId;
  contents: CacheContents;
  distance: number;
  selfEtaSec: number;
  enemyEtaSec: number;
  contestMarginSec: number;
  contestScore: number;
  reason: string;
}

export interface CombatAiExploreFact {
  sectorKey: string;
  dir: Vec2;
  targetPos: Vec2;
  score: number;
  ageTicks: number;
  safety: number;
  reason: string;
}

export interface CombatAiPerception {
  tick: number;
  primaryTargetId?: EntityId;
  primaryTargetPlayerId?: PlayerId;
  bestCacheId?: EntityId;
  threats: CombatAiThreat[];
  targets: CombatAiTargetFact[];
  caches: CombatAiCacheFact[];
  hpPressure: number;
  ammoPressure: number;
  boundaryPressure: number;
  blackHolePressure: number;
  laneQuality: number;
  explore: CombatAiExploreFact | null;
  shieldReady: boolean;
  boostReady: boolean;
  gravityPulseHeld: boolean;
}

export interface CombatAiIntentScore {
  kind: CombatAiIntentKind;
  score: number;
  targetPlayerId?: PlayerId;
  targetPlanetId?: EntityId;
  targetCacheId?: EntityId;
  reason: string;
}

export interface CombatAiIntent {
  kind: CombatAiIntentKind;
  score: number;
  targetPlayerId?: PlayerId;
  targetPlanetId?: EntityId;
  targetCacheId?: EntityId;
  expiresAtTick: number;
  reason: string;
}

export interface CombatAiMoveGoalBreakdown {
  survival: number;
  lineOfFire: number;
  pressure: number;
  resource: number;
  exploration: number;
  commitment: number;
}

export interface CombatAiMoveGoal {
  kind: "hold" | "escape" | "band" | "cache" | "commit" | "explore";
  dir: Vec2;
  usesBoost: boolean;
  label: string;
  desiredRadius?: number;
  targetPlayerId?: PlayerId;
  targetCacheId?: EntityId;
  totalScore: number;
  breakdown: CombatAiMoveGoalBreakdown;
  reason: string;
}

export interface CombatAiAimGoal {
  dir: Vec2;
  confidence: number;
  targetId?: EntityId;
  targetPlayerId?: PlayerId;
  weaponKind?: RocketKind;
  reason: string;
}

export interface CombatAiShotBreakdown {
  hitProbability: number;
  shieldLikelihood: number;
  expectedDamage: number;
  wasteScore: number;
  ammoPressure: number;
  futureWindowPenalty: number;
}

export interface CombatAiShotScore {
  weaponKind: RocketKind;
  score: number;
  allowFire: boolean;
  confidence: number;
  aimDir: Vec2;
  expectedDamage: number;
  wasteScore: number;
  targetId?: EntityId;
  targetPlayerId?: PlayerId;
  holdReason?: string;
  breakdown: CombatAiShotBreakdown;
}

export interface CombatAiWeaponPolicy {
  preferredKind: RocketKind | null;
  scoredShots: CombatAiShotScore[];
  holdReason: string | null;
}

export interface CombatAiAbilityPolicy {
  shield: boolean;
  shieldDir?: Vec2;
  boost: boolean;
  boostDir?: Vec2;
  gravityPulse: boolean;
  reason: string[];
}

export interface CombatAiFireGate {
  allowFire: boolean;
  confidence: number;
  expectedDamage: number;
  wasteScore: number;
  holdReason?: string;
  weaponKind?: RocketKind;
  aimDir?: Vec2;
  targetId?: EntityId;
  targetPlayerId?: PlayerId;
}

export interface CombatAiAbortCondition {
  kind: string;
  reason: string;
}

export interface CombatAiPlan {
  generatedAtTick: number;
  expiresAtTick: number;
  executionState: CombatAiExecutionMode;
  moveGoal: CombatAiMoveGoal | null;
  aimGoal: CombatAiAimGoal | null;
  weaponPolicy: CombatAiWeaponPolicy;
  abilityPolicy: CombatAiAbilityPolicy;
  fireGate: CombatAiFireGate;
  abortConditions: CombatAiAbortCondition[];
  reason: string;
}

export interface CombatAiExecutionTransition {
  from: CombatAiExecutionMode | null;
  to: CombatAiExecutionMode;
  tick: number;
  reason: string;
}

export interface CombatAiExecutionState {
  currentState: CombatAiExecutionMode;
  sinceTick: number;
  lastTransition: CombatAiExecutionTransition | null;
}

export interface CombatAiPreemptionRecord {
  tick: number;
  reason: string;
  immediate: boolean;
}

export interface CombatAiHistory {
  lastPerceptionTick: number;
  lastIntentTick: number;
  lastPlanTick: number;
  lastBoostTick: number;
  lastTargetPlayerId: PlayerId | null;
  lastCacheId: EntityId | null;
  lastExploreSectorKey: string | null;
  lastInterruptReason: string | null;
  sectorVisitTicks: Record<string, number>;
  recentThreats: CombatAiThreat[];
  transitions: CombatAiExecutionTransition[];
  preemptions: CombatAiPreemptionRecord[];
  lastCommands: string[];
}

export interface CombatAiDebugState {
  activeIntent: CombatAiIntentKind | null;
  activeIntentReason: string | null;
  alternatives: CombatAiIntentScore[];
  currentTargetPlayerId: PlayerId | null;
  currentTargetId: EntityId | null;
  executionState: CombatAiExecutionMode;
  movementScoreBreakdown: string[];
  shotScoreBreakdown: string[];
  threatRanking: string[];
  lastTransitionReason: string | null;
  lastPreemptionReason: string | null;
  planExpiryTick: number | null;
  planReason: string | null;
  fireHoldReason: string | null;
  commandTrace: string[];
}

export interface CombatAiCommandDirective {
  aimDir: Vec2;
  shieldAimDir?: Vec2;
  fire?: {
    weaponKind: RocketKind;
    aimDir: Vec2;
    targetId?: EntityId;
    targetPlayerId?: PlayerId;
  };
  abilityPolicy: CombatAiAbilityPolicy;
  notes: string[];
}

export interface CombatAiBlackboard {
  self: CombatAiSelfState;
  perception: CombatAiPerception;
  intent: CombatAiIntent;
  intentAlternatives: CombatAiIntentScore[];
  plan: CombatAiPlan | null;
  execution: CombatAiExecutionState;
  history: CombatAiHistory;
  debug: CombatAiDebugState;
  rngState: number;
}
