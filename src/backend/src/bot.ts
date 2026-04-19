import {
  type ArchetypeId,
  type BotDifficulty,
  type CombatBotCommand,
  type CombatBotContext,
  createCombatBotMemory,
  decideCombatBot,
  type PlayerId,
} from "@3body/shared";
import type { CombatPlayerRuntime, QueuedCombatMessage } from "./room";

export interface BotContext
  extends Omit<CombatBotContext, "difficulty" | "runtime"> {
  runtime: CombatPlayerRuntime;
}

const attachPlayerId = (
  playerId: PlayerId,
  command: CombatBotCommand,
): QueuedCombatMessage => {
  switch (command.type) {
    case "input":
      return { ...command, playerId };
    case "shieldAim":
      return { ...command, playerId };
    case "fireRocket":
      return {
        ...command,
        playerId,
        targetId: command.targetId,
      };
    case "ability":
      return { ...command, playerId };
    case "droneLaunch":
      return { ...command, playerId };
    case "droneSteer":
      return { ...command, playerId };
  }
};

export class Bot {
  #memory = createCombatBotMemory();

  constructor(
    readonly playerId: PlayerId,
    difficulty: BotDifficulty,
    archetypeId: ArchetypeId,
  ) {
    this.difficulty = difficulty;
    this.archetypeId = archetypeId;
  }

  difficulty: BotDifficulty;
  archetypeId: ArchetypeId;

  updateDifficulty(difficulty: BotDifficulty): void {
    this.difficulty = difficulty;
  }

  updateArchetype(archetypeId: ArchetypeId): void {
    this.archetypeId = archetypeId;
  }

  decide(context: BotContext): QueuedCombatMessage[] {
    return decideCombatBot(
      {
        ...context,
        difficulty: this.difficulty,
        runtime: context.runtime,
      },
      this.#memory,
    ).map((command) => attachPlayerId(this.playerId, command));
  }
}
