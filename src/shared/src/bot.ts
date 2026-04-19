import {
  buildCombatAiCommandDirective,
  buildCombatAiDebugState,
  buildCombatAiPerception,
  buildCombatAiPlan,
  chooseCombatAiIntent,
  cloneCombatAiBlackboard,
  createCombatAiBlackboard,
  detectImmediateInterrupt,
  detectSoftInterrupt,
  isCombatAiPlanInvalid,
  probeCombatAiThreats,
  recordCombatAiExploreVisit,
  recordCombatAiPreemption,
  replaceCombatAiSelfState,
  scoreCombatAiIntents,
  shouldRefreshIntent,
  shouldRefreshPerception,
  updateCombatAiExecutionState,
  type CombatAiBlackboard,
  type CombatAiSelfState,
} from "./ai/index";
import type {
  EntityId,
  PlanetPrivateState,
  PlanetPublic,
  RocketKind,
  World,
} from "./entities";
import type { AbilitySlot, BotDifficulty } from "./protocol";
import type { Vec2 } from "./vec2";
import { dot, len, normalize } from "./vec2";

const DEFAULT_DIR: Vec2 = { x: 1, y: 0 };
const AIM_CADENCE_TICKS = {
  easy: 4,
  normal: 3,
  hard: 2,
} as const satisfies Record<BotDifficulty, number>;
const FIRE_CADENCE_TICKS = {
  easy: 12,
  normal: 8,
  hard: 6,
} as const satisfies Record<BotDifficulty, number>;
const PLAN_REFRESH_TICKS = 6;
const DRONE_LAUNCH_CADENCE_TICKS = 18;
const WILDCARD_CADENCE_TICKS = 10;

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
  lastDroneLaunchTick: number;
  lastFireTick: number;
  lastForesightTick: number;
  lastShieldTick: number;
  lastWildcardTick: number;
  blackboard: CombatAiBlackboard;
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
    }
  | {
      type: "droneLaunch";
      aimDir: Vec2;
    }
  | {
      type: "droneSteer";
      turn: -1 | 0 | 1;
    };

const normalizeDir = (dir: Vec2, fallback: Vec2 = DEFAULT_DIR): Vec2 => {
  const normalized = normalize(dir);
  return len(normalized) === 0 ? { ...fallback } : normalized;
};

const placeholderSelfState = (): CombatAiSelfState => ({
  tick: 0,
  tickHz: 120,
  difficulty: "normal",
  arenaRadius: 2000,
  planetId: -1 as EntityId,
  playerId: "bot:placeholder",
  archetype: "terra",
  pos: { x: 0, y: 0 },
  vel: { x: 0, y: 0 },
  radius: 1,
  hp: 100,
  shieldActive: false,
  shieldLoad: 0,
  shieldMaxLoad: 0,
  ammo: { light: 0, heavy: 0, seeker: 0 },
  cooldowns: {
    lightReloadUntilTick: 0,
    heavyReloadUntilTick: 0,
    seekerReloadUntilTick: 0,
    foresightActiveUntilTick: 0,
    foresightCooldownUntilTick: 0,
    foresightDurationTicks: 0,
    droneCooldownUntilTick: 0,
  },
  boostCharges: 0,
  gravityPulseHeld: false,
  cloakHeld: false,
  nextShieldExt: false,
  nextForesightExt: false,
  activeDroneId: null,
  controlMode: "planet",
});

const hashBotSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createBotBlackboard = (seedKey = "bot:placeholder"): CombatAiBlackboard =>
  createCombatAiBlackboard(placeholderSelfState(), hashBotSeed(seedKey));

export const createCombatBotMemory = (): CombatBotMemory => ({
  cachedAimDir: { ...DEFAULT_DIR },
  lastAimTick: -1,
  lastBoostTick: -1,
  lastDroneLaunchTick: -1,
  lastFireTick: -1,
  lastForesightTick: -1,
  lastShieldTick: -1,
  lastWildcardTick: -1,
  blackboard: createBotBlackboard(),
});

export const cloneCombatBotMemory = (
  memory: CombatBotMemory,
): CombatBotMemory => ({
  cachedAimDir: { ...memory.cachedAimDir },
  lastAimTick: memory.lastAimTick,
  lastBoostTick: memory.lastBoostTick,
  lastDroneLaunchTick: memory.lastDroneLaunchTick,
  lastFireTick: memory.lastFireTick,
  lastForesightTick: memory.lastForesightTick,
  lastShieldTick: memory.lastShieldTick,
  lastWildcardTick: memory.lastWildcardTick,
  blackboard: cloneCombatAiBlackboard(memory.blackboard),
});

const buildCombatAiSelfState = (
  context: CombatBotContext,
): CombatAiSelfState => ({
  tick: context.tick,
  tickHz: context.tickHz,
  difficulty: context.difficulty,
  arenaRadius: context.world.arenaRadius,
  planetId: context.self.id,
  playerId: context.self.playerId,
  archetype: context.self.archetype,
  pos: { ...context.self.pos },
  vel: { ...context.self.vel },
  radius: context.self.radius,
  hp: context.self.hp,
  shieldActive: context.self.shieldActive,
  shieldLoad: context.self.shieldLoad,
  shieldMaxLoad: context.self.shieldMaxLoad,
  ammo: { ...context.privateState.ammo },
  cooldowns: { ...context.privateState.cooldowns },
  boostCharges: context.privateState.boostCharges,
  gravityPulseHeld: context.privateState.gravityPulseHeld,
  cloakHeld: context.privateState.cloakHeld,
  nextShieldExt: context.privateState.nextShieldExt,
  nextForesightExt: context.privateState.nextForesightExt,
  activeDroneId: context.runtime.activeDroneId,
  controlMode: context.runtime.controlMode,
});

const ensureBlackboard = (
  context: CombatBotContext,
  memory: CombatBotMemory,
): CombatAiBlackboard => {
  const seedKey = `${context.self.playerId}:${context.difficulty}:${context.self.archetype}`;
  if (memory.blackboard.self.playerId !== context.self.playerId) {
    memory.blackboard = createBotBlackboard(seedKey);
  }

  replaceCombatAiSelfState(memory.blackboard, buildCombatAiSelfState(context));
  return memory.blackboard;
};

const shouldUpdateAim = (
  memory: CombatBotMemory,
  nextAimDir: Vec2,
  context: CombatBotContext,
): boolean => {
  if (
    memory.lastAimTick < 0 ||
    context.tick - memory.lastAimTick >= AIM_CADENCE_TICKS[context.difficulty]
  ) {
    return true;
  }

  return dot(memory.cachedAimDir, nextAimDir) < 0.985;
};

const actionReady = (
  lastTick: number,
  cadenceTicks: number,
  currentTick: number,
): boolean =>
  lastTick < 0
    ? currentTick >= cadenceTicks
    : currentTick - lastTick >= cadenceTicks;

export const decideCombatAi = (
  context: CombatBotContext,
  memory: CombatBotMemory,
): CombatAiBlackboard => {
  const blackboard = ensureBlackboard(context, memory);
  recordCombatAiExploreVisit({
    arenaRadius: context.world.arenaRadius,
    blackboard,
    pos: context.self.pos,
    tick: context.tick,
  });
  const threatProbe = probeCombatAiThreats({
    blackboard,
    difficulty: context.difficulty,
    self: context.self,
    world: context.world,
  });
  const immediateInterrupt =
    threatProbe.find((threat) => threat.immediate)?.reason ?? null;
  const perceptionNeedsRefresh = shouldRefreshPerception(
    blackboard,
    context.tick,
    immediateInterrupt,
  );

  if (perceptionNeedsRefresh) {
    blackboard.perception = buildCombatAiPerception({
      blackboard,
      difficulty: context.difficulty,
      privateState: context.privateState,
      self: context.self,
      tick: context.tick,
      world: context.world,
    });
    blackboard.history.lastPerceptionTick = context.tick;
  } else {
    blackboard.perception = {
      ...blackboard.perception,
      tick: context.tick,
      threats: threatProbe,
      shieldReady: context.self.shieldLoad > 0 && !context.self.shieldActive,
      boostReady: context.privateState.boostCharges > 0,
      foresightReady:
        context.privateState.cooldowns.foresightActiveUntilTick <=
          context.tick &&
        context.privateState.cooldowns.foresightCooldownUntilTick <=
          context.tick,
      droneReady:
        context.privateState.cooldowns.droneCooldownUntilTick <= context.tick &&
        context.runtime.activeDroneId === null,
      gravityPulseHeld: context.privateState.gravityPulseHeld,
      cloakHeld: context.privateState.cloakHeld,
    };
  }
  blackboard.history.recentThreats = blackboard.perception.threats.slice(0, 4);

  if (shouldRefreshIntent(blackboard, context.tick, immediateInterrupt)) {
    blackboard.intentAlternatives = scoreCombatAiIntents({
      blackboard,
      difficulty: context.difficulty,
      perception: blackboard.perception,
      privateState: context.privateState,
      self: context.self,
      tick: context.tick,
      world: context.world,
    });
    blackboard.intent = chooseCombatAiIntent({
      alternatives: blackboard.intentAlternatives,
      blackboard,
      tick: context.tick,
    });
    blackboard.history.lastIntentTick = context.tick;
    blackboard.history.lastTargetPlayerId =
      blackboard.intent.targetPlayerId ?? null;
    blackboard.history.lastCacheId = blackboard.intent.targetCacheId ?? null;
  }

  const softInterrupt = detectSoftInterrupt({
    blackboard,
    perception: blackboard.perception,
    tick: context.tick,
  });
  const planInvalid = isCombatAiPlanInvalid({
    blackboard,
    perception: blackboard.perception,
    tick: context.tick,
    world: context.world,
  });

  if (immediateInterrupt !== null) {
    recordCombatAiPreemption({
      blackboard,
      immediate: true,
      reason: immediateInterrupt,
      tick: context.tick,
    });
  } else if (
    softInterrupt !== null &&
    (planInvalid ||
      context.tick - blackboard.history.lastPlanTick >= PLAN_REFRESH_TICKS)
  ) {
    recordCombatAiPreemption({
      blackboard,
      immediate: false,
      reason: softInterrupt,
      tick: context.tick,
    });
  }

  if (
    planInvalid ||
    blackboard.history.lastPlanTick < 0 ||
    context.tick - blackboard.history.lastPlanTick >= PLAN_REFRESH_TICKS ||
    immediateInterrupt !== null ||
    softInterrupt !== null
  ) {
    blackboard.plan = buildCombatAiPlan({
      blackboard,
      difficulty: context.difficulty,
      intent: blackboard.intent,
      privateState: context.privateState,
      self: context.self,
      tick: context.tick,
      world: context.world,
    });
    blackboard.history.lastPlanTick = context.tick;
  }

  updateCombatAiExecutionState({
    blackboard,
    plan: blackboard.plan,
    tick: context.tick,
    transitionReason:
      immediateInterrupt ??
      softInterrupt ??
      blackboard.plan?.reason ??
      blackboard.intent.reason,
  });
  blackboard.debug = buildCombatAiDebugState(blackboard);

  return blackboard;
};

const emitAbilityCommand = (
  commands: CombatBotCommand[],
  slot: AbilitySlot,
  aimDir: Vec2 | undefined,
) => {
  commands.push(
    aimDir === undefined
      ? {
          type: "ability",
          slot,
        }
      : {
          type: "ability",
          slot,
          aimDir,
        },
  );
};

const setCommandTrace = (
  blackboard: CombatAiBlackboard,
  commands: CombatBotCommand[],
): void => {
  blackboard.history.lastCommands = commands.map((command) => {
    switch (command.type) {
      case "input":
        return "input";
      case "shieldAim":
        return "shieldAim";
      case "fireRocket":
        return `fire:${command.kind}`;
      case "ability":
        return `ability:${command.slot}`;
      case "droneLaunch":
        return "droneLaunch";
      case "droneSteer":
        return `droneSteer:${command.turn}`;
    }
  });
  blackboard.debug = buildCombatAiDebugState(blackboard);
};

export const decideCombatBot = (
  context: CombatBotContext,
  memory: CombatBotMemory,
): CombatBotCommand[] => {
  const blackboard = decideCombatAi(context, memory);
  const directive = buildCombatAiCommandDirective(blackboard);
  const commands: CombatBotCommand[] = [];
  const aimDir = normalizeDir(directive.aimDir, memory.cachedAimDir);

  if (shouldUpdateAim(memory, aimDir, context)) {
    commands.push({
      type: "input",
      mouseDir: aimDir,
      clientTick: context.tick,
    });
    memory.cachedAimDir = aimDir;
    memory.lastAimTick = context.tick;
  }

  if (context.self.shieldActive && directive.shieldAimDir !== undefined) {
    commands.push({
      type: "shieldAim",
      dir: normalizeDir(directive.shieldAimDir, aimDir),
    });
  }

  if (
    directive.abilityPolicy.shield &&
    !context.self.shieldActive &&
    context.self.shieldLoad > 0 &&
    actionReady(memory.lastShieldTick, 6, context.tick)
  ) {
    emitAbilityCommand(
      commands,
      "w",
      normalizeDir(directive.shieldAimDir ?? aimDir, aimDir),
    );
    memory.lastShieldTick = context.tick;
  } else if (
    context.self.shieldActive &&
    !directive.abilityPolicy.shield &&
    actionReady(memory.lastShieldTick, 14, context.tick)
  ) {
    emitAbilityCommand(commands, "w", undefined);
    memory.lastShieldTick = context.tick;
  }

  if (
    directive.abilityPolicy.boost &&
    directive.abilityPolicy.boostDir !== undefined &&
    context.privateState.boostCharges > 0 &&
    actionReady(
      memory.lastBoostTick,
      Math.max(1, Math.round(context.tickHz / 2)),
      context.tick,
    )
  ) {
    emitAbilityCommand(
      commands,
      "e",
      normalizeDir(directive.abilityPolicy.boostDir, aimDir),
    );
    memory.lastBoostTick = context.tick;
    blackboard.history.lastBoostTick = context.tick;
  }

  if (
    directive.abilityPolicy.foresight &&
    actionReady(memory.lastForesightTick, 12, context.tick)
  ) {
    emitAbilityCommand(commands, "q", undefined);
    memory.lastForesightTick = context.tick;
  }

  if (
    directive.abilityPolicy.gravityPulse &&
    context.privateState.gravityPulseHeld &&
    actionReady(memory.lastWildcardTick, WILDCARD_CADENCE_TICKS, context.tick)
  ) {
    emitAbilityCommand(commands, "g", undefined);
    memory.lastWildcardTick = context.tick;
  } else if (
    directive.abilityPolicy.cloak &&
    context.privateState.cloakHeld &&
    actionReady(memory.lastWildcardTick, WILDCARD_CADENCE_TICKS, context.tick)
  ) {
    emitAbilityCommand(commands, "c", undefined);
    memory.lastWildcardTick = context.tick;
  }

  if (
    directive.abilityPolicy.droneLaunch &&
    directive.abilityPolicy.droneDir !== undefined &&
    context.runtime.controlMode === "planet" &&
    actionReady(
      memory.lastDroneLaunchTick,
      DRONE_LAUNCH_CADENCE_TICKS,
      context.tick,
    )
  ) {
    commands.push({
      type: "droneLaunch",
      aimDir: normalizeDir(directive.abilityPolicy.droneDir, aimDir),
    });
    memory.lastDroneLaunchTick = context.tick;
  } else if (context.runtime.controlMode === "drone") {
    commands.push({
      type: "droneSteer",
      turn: directive.abilityPolicy.droneTurn,
    });
  }

  if (
    directive.fire !== undefined &&
    context.runtime.controlMode === "planet" &&
    actionReady(
      memory.lastFireTick,
      FIRE_CADENCE_TICKS[context.difficulty],
      context.tick,
    )
  ) {
    commands.push({
      type: "fireRocket",
      kind: directive.fire.weaponKind,
      aimDir: normalizeDir(directive.fire.aimDir, aimDir),
      targetId: directive.fire.targetId,
      clientTick: context.tick,
    });
    memory.lastFireTick = context.tick;
  }

  setCommandTrace(blackboard, commands);
  return commands;
};
