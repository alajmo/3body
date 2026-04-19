import {
  CURRENT_GAME_TUNING,
  type DifficultyNumberTuning,
  type DifficultyRocketNumberTuning,
  type GameplayAiTuning,
} from "../tuning";

const cloneDifficultyNumbers = (
  value: DifficultyNumberTuning,
): DifficultyNumberTuning => ({
  easy: value.easy,
  normal: value.normal,
  hard: value.hard,
});

const cloneDifficultyRocketNumbers = (
  value: DifficultyRocketNumberTuning,
): DifficultyRocketNumberTuning => ({
  easy: { ...value.easy },
  normal: { ...value.normal },
  hard: { ...value.hard },
});

const initialAiTuning = CURRENT_GAME_TUNING.gameplay.ai;

export const COMBAT_AI_TUNING: GameplayAiTuning = {
  execution: { ...initialAiTuning.execution },
  movement: {
    candidateDirections: initialAiTuning.movement.candidateDirections,
    evaluationHorizonSec: cloneDifficultyNumbers(
      initialAiTuning.movement.evaluationHorizonSec,
    ),
    objectiveFanoutDeg: initialAiTuning.movement.objectiveFanoutDeg,
    simulationSteps: cloneDifficultyNumbers(
      initialAiTuning.movement.simulationSteps,
    ),
  },
  shots: {
    confidenceThresholds: cloneDifficultyRocketNumbers(
      initialAiTuning.shots.confidenceThresholds,
    ),
    targetPredictionHorizonSec: cloneDifficultyNumbers(
      initialAiTuning.shots.targetPredictionHorizonSec,
    ),
    targetPredictionSteps: cloneDifficultyNumbers(
      initialAiTuning.shots.targetPredictionSteps,
    ),
  },
  threat: {
    lookaheadSec: cloneDifficultyNumbers(initialAiTuning.threat.lookaheadSec),
    simulationSteps: cloneDifficultyNumbers(
      initialAiTuning.threat.simulationSteps,
    ),
  },
};

export const applyCombatAiTuning = (value: GameplayAiTuning): void => {
  Object.assign(COMBAT_AI_TUNING.execution, value.execution);
  COMBAT_AI_TUNING.movement.candidateDirections =
    value.movement.candidateDirections;
  COMBAT_AI_TUNING.movement.objectiveFanoutDeg =
    value.movement.objectiveFanoutDeg;
  Object.assign(
    COMBAT_AI_TUNING.movement.evaluationHorizonSec,
    value.movement.evaluationHorizonSec,
  );
  Object.assign(
    COMBAT_AI_TUNING.movement.simulationSteps,
    value.movement.simulationSteps,
  );
  Object.assign(
    COMBAT_AI_TUNING.shots.targetPredictionHorizonSec,
    value.shots.targetPredictionHorizonSec,
  );
  Object.assign(
    COMBAT_AI_TUNING.shots.targetPredictionSteps,
    value.shots.targetPredictionSteps,
  );
  Object.assign(
    COMBAT_AI_TUNING.shots.confidenceThresholds.easy,
    value.shots.confidenceThresholds.easy,
  );
  Object.assign(
    COMBAT_AI_TUNING.shots.confidenceThresholds.normal,
    value.shots.confidenceThresholds.normal,
  );
  Object.assign(
    COMBAT_AI_TUNING.shots.confidenceThresholds.hard,
    value.shots.confidenceThresholds.hard,
  );
  Object.assign(
    COMBAT_AI_TUNING.threat.lookaheadSec,
    value.threat.lookaheadSec,
  );
  Object.assign(
    COMBAT_AI_TUNING.threat.simulationSteps,
    value.threat.simulationSteps,
  );
};
