import { PLANET_HP } from "../constants";
import type { PlanetPrivateState, PlanetPublic, World } from "../entities";
import type { BotDifficulty } from "../protocol";
import { clamp01 } from "./blackboard";
import { rocketAvailable } from "./scoring";
import type {
  CombatAiBlackboard,
  CombatAiIntent,
  CombatAiIntentScore,
  CombatAiPerception,
} from "./types";

const getIntentExpiryTicks = (
  tick: number,
  kind: CombatAiIntent["kind"],
): number => {
  switch (kind) {
    case "survive":
      return tick + 6;
    case "explore":
      return tick + 16;
    case "finish":
      return tick + 10;
    case "contestCache":
      return tick + 18;
    case "deployDrone":
      return tick + 16;
    default:
      return tick + 14;
  }
};

export const scoreCombatAiIntents = ({
  blackboard,
  difficulty,
  perception,
  privateState,
  self,
  tick,
  world,
}: {
  blackboard: CombatAiBlackboard;
  difficulty: BotDifficulty;
  perception: CombatAiPerception;
  privateState: PlanetPrivateState;
  self: PlanetPublic;
  tick: number;
  world: World;
}): CombatAiIntentScore[] => {
  const topThreat = perception.threats[0];
  const primaryTargetFact = perception.targets[0];
  const primaryTarget =
    primaryTargetFact === undefined
      ? null
      : (world.planets.find(
          (planet) => planet.id === primaryTargetFact.planetId,
        ) ?? null);
  const bestCache = perception.caches[0];
  const topNonBoundaryThreat = perception.threats.find(
    (threat) => threat.kind !== "boundary",
  );
  const boundaryOnlyPressure =
    topThreat?.kind === "boundary" &&
    (topThreat.urgency ?? 0) < 0.86 &&
    perception.boundaryPressure < 0.76 &&
    (topNonBoundaryThreat?.urgency ?? 0) < 0.58;
  const currentIntentKind = blackboard.intent.kind;
  const currentIntentBias = (kind: CombatAiIntent["kind"]): number =>
    currentIntentKind === kind && tick < blackboard.intent.expiresAtTick
      ? 5
      : 0;

  const surviveScore =
    (topThreat?.urgency ?? 0) * (boundaryOnlyPressure ? 72 : 120) +
    perception.boundaryPressure * (boundaryOnlyPressure ? 14 : 36) +
    perception.blackHolePressure * 42 +
    (boundaryOnlyPressure ? 0 : currentIntentBias("survive"));
  const surviveReason =
    topThreat === undefined
      ? "no urgent threats"
      : boundaryOnlyPressure
        ? `stabilize orbit after ${topThreat.reason}`
        : `answer ${topThreat.kind} (${Math.round(topThreat.urgency * 100)}%)`;

  const finishScore =
    primaryTarget === null
      ? -Infinity
      : (1 - primaryTarget.hp / PLANET_HP) * 72 +
        perception.laneQuality * 54 +
        (primaryTarget.hp <= 38 ? 28 : 0) +
        (topThreat?.urgency ?? 0) * -16 +
        currentIntentBias("finish");

  const pressureScore =
    primaryTarget === null
      ? -Infinity
      : primaryTargetFact!.pressureScore * 68 +
        perception.laneQuality * 32 +
        (topThreat?.urgency ?? 0) * -10 +
        currentIntentBias("pressure");

  const repositionScore =
    (1 - perception.laneQuality) * 34 +
    clamp01(
      primaryTargetFact?.distance !== undefined
        ? primaryTargetFact.distance / 1000
        : 0.55,
    ) *
      16 +
    perception.boundaryPressure * 24 +
    (boundaryOnlyPressure ? 18 + perception.boundaryPressure * 18 : 0) +
    ((perception.boostReady && topThreat === undefined) || difficulty === "hard"
      ? 8
      : 0) +
    currentIntentBias("reposition");

  const exploreScore =
    perception.explore === null
      ? -Infinity
      : perception.explore.score * 54 +
        clamp01(
          primaryTargetFact === undefined
            ? 0.72
            : (primaryTargetFact.distance - 620) / 980,
        ) *
          18 +
        (1 - perception.laneQuality) * 18 +
        ((bestCache?.contestScore ?? Number.NEGATIVE_INFINITY) >= 80
          ? -26
          : 0) +
        (topThreat?.urgency ?? 0) * -22 +
        currentIntentBias("explore");

  const contestCacheScore =
    bestCache === undefined
      ? -Infinity
      : bestCache.contestScore +
        (perception.ammoPressure + perception.hpPressure) * 18 +
        (topThreat?.urgency ?? 0) * -26 +
        currentIntentBias("contestCache");

  const recoverScore =
    perception.hpPressure * 84 +
    perception.ammoPressure * 22 +
    (bestCache?.contents.kind === "repair" ? 18 : 0) +
    currentIntentBias("recover");

  const heavyZoneUnlocked =
    primaryTarget !== null &&
    (primaryTarget.hp <= PLANET_HP * 0.85 || tick >= 4 * 120);

  const zoneWithHeavyScore =
    primaryTargetFact === undefined ||
    !heavyZoneUnlocked ||
    !rocketAvailable("heavy", privateState, tick) ||
    primaryTargetFact.distance < 360 ||
    primaryTargetFact.chaosScore > 1.1
      ? -Infinity
      : perception.laneQuality * 42 +
        scoreRange(primaryTargetFact.distance, 420, 980) * 28 +
        currentIntentBias("zoneWithHeavy");

  const lockSeekerScore =
    primaryTargetFact === undefined ||
    !rocketAvailable("seeker", privateState, tick)
      ? -Infinity
      : clamp01(primaryTargetFact.chaosScore / 1.8) * 34 +
        scoreRange(primaryTargetFact.distance, 320, 1200) * 24 +
        currentIntentBias("lockSeeker");

  const earlyDroneUnlocked =
    tick >= 4 * 120 || (bestCache?.contestScore ?? 0) >= 90;
  const strongCacheDroneWindow =
    bestCache !== undefined && bestCache.contestScore >= 76;
  const longRangeDroneWindow =
    primaryTargetFact !== undefined &&
    primaryTargetFact.distance >= 680 &&
    perception.laneQuality <= 0.52;
  const deployDroneScore =
    !earlyDroneUnlocked || (topThreat?.urgency ?? 0) > 0.7
      ? -Infinity
      : perception.droneReady &&
          (strongCacheDroneWindow || longRangeDroneWindow)
        ? (strongCacheDroneWindow ? (bestCache?.contestScore ?? 0) * 0.28 : 0) +
          (longRangeDroneWindow
            ? scoreRange(primaryTargetFact!.distance, 680, 1280) * 18
            : 0) +
          (1 - perception.laneQuality) * 16 +
          currentIntentBias("deployDrone")
        : -Infinity;

  const wildcardHeld = perception.gravityPulseHeld || perception.cloakHeld;
  const useWildcardScore =
    !wildcardHeld || topThreat === undefined
      ? -Infinity
      : topThreat.urgency * 52 +
        (perception.gravityPulseHeld ? 8 : 0) +
        (perception.cloakHeld ? 10 : 0) +
        currentIntentBias("useWildcard");

  const scores: CombatAiIntentScore[] = [
    {
      kind: "survive",
      score: surviveScore,
      targetPlayerId: primaryTarget?.playerId,
      targetPlanetId: primaryTarget?.id,
      reason: surviveReason,
    },
    {
      kind: "finish",
      score: finishScore,
      targetPlayerId: primaryTarget?.playerId,
      targetPlanetId: primaryTarget?.id,
      reason:
        primaryTarget === null
          ? "no target"
          : `finish ${Math.round(primaryTarget.hp)} hp target`,
    },
    {
      kind: "pressure",
      score: pressureScore,
      targetPlayerId: primaryTarget?.playerId,
      targetPlanetId: primaryTarget?.id,
      reason:
        primaryTarget === null
          ? "no target"
          : `pressure ${primaryTarget.playerId} at ${Math.round(primaryTargetFact!.distance)}`,
    },
    {
      kind: "reposition",
      score: repositionScore,
      targetPlayerId: primaryTarget?.playerId,
      targetPlanetId: primaryTarget?.id,
      reason: "improve lane and spacing",
    },
    {
      kind: "explore",
      score: exploreScore,
      reason: perception.explore?.reason ?? "no safe sector to explore",
    },
    {
      kind: "contestCache",
      score: contestCacheScore,
      targetCacheId: bestCache?.cacheId,
      reason: bestCache?.reason ?? "no cache edge",
    },
    {
      kind: "recover",
      score: recoverScore,
      targetCacheId:
        bestCache?.contents.kind === "repair" ? bestCache.cacheId : undefined,
      reason:
        self.hp < PLANET_HP * 0.55
          ? `recover ${Math.round(self.hp)} hp`
          : "recover ammo and shield posture",
    },
    {
      kind: "zoneWithHeavy",
      score: zoneWithHeavyScore,
      targetPlayerId: primaryTarget?.playerId,
      targetPlanetId: primaryTarget?.id,
      reason: "heavy lane is stable",
    },
    {
      kind: "lockSeeker",
      score: lockSeekerScore,
      targetPlayerId: primaryTarget?.playerId,
      targetPlanetId: primaryTarget?.id,
      reason: "seeker lane favored by chaos",
    },
    {
      kind: "deployDrone",
      score: deployDroneScore,
      targetPlayerId: primaryTarget?.playerId,
      targetPlanetId: primaryTarget?.id,
      targetCacheId: bestCache?.cacheId,
      reason: "drone can extend pressure or cache reach",
    },
    {
      kind: "useWildcard",
      score: useWildcardScore,
      targetPlayerId: primaryTarget?.playerId,
      targetPlanetId: primaryTarget?.id,
      reason: "wildcard can swing the current exchange",
    },
  ];

  return scores.sort((left, right) => right.score - left.score);
};

const scoreRange = (distance: number, min: number, max: number): number => {
  if (distance >= min && distance <= max) {
    return 1;
  }

  const midpoint = (min + max) / 2;
  const radius = Math.max(1, (max - min) / 2);
  return clamp01(1 - Math.abs(distance - midpoint) / radius);
};

export const chooseCombatAiIntent = ({
  alternatives,
  blackboard,
  tick,
}: {
  alternatives: CombatAiIntentScore[];
  blackboard: CombatAiBlackboard;
  tick: number;
}): CombatAiIntent => {
  const top = alternatives[0] ?? {
    kind: "reposition" as const,
    score: 0,
    reason: "no alternatives",
  };
  const current = blackboard.intent;
  const keepCurrent =
    tick < current.expiresAtTick &&
    alternatives.some(
      (candidate) =>
        candidate.kind === current.kind && candidate.score >= top.score - 8,
    );
  const chosen = keepCurrent
    ? (alternatives.find((candidate) => candidate.kind === current.kind) ?? top)
    : top;

  return {
    kind: chosen.kind,
    score: chosen.score,
    targetPlayerId: chosen.targetPlayerId,
    targetPlanetId: chosen.targetPlanetId,
    targetCacheId: chosen.targetCacheId,
    expiresAtTick: getIntentExpiryTicks(tick, chosen.kind),
    reason: chosen.reason,
  };
};
