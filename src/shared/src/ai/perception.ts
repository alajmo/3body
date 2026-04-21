import { PLANET_HP } from "../constants";
import type {
  Cache,
  CacheContents,
  PlanetPrivateState,
  PlanetPublic,
  Rocket,
  World,
} from "../entities";
import {
  advanceWorldOrbitStarMotion,
  stepSunsWithOrbitMotion,
} from "../orbitPatternTracks";
import { stepBody } from "../physics";
import type { BotDifficulty } from "../protocol";
import type { Vec2 } from "../vec2";
import {
  dist,
  dot,
  fromAngle,
  len,
  lenSq,
  normalize,
  scale,
  sub,
} from "../vec2";
import { clamp01 } from "./blackboard";
import { COMBAT_AI_TUNING } from "./runtimeTuning";
import {
  analyzeTargetTrajectory,
  buildShotScores,
  estimateTravelEtaSec,
} from "./scoring";
import type {
  CombatAiBlackboard,
  CombatAiCacheFact,
  CombatAiExploreFact,
  CombatAiPerception,
  CombatAiTargetFact,
  CombatAiThreat,
} from "./types";

const DEFAULT_DIR: Vec2 = { x: 1, y: 0 };
const EXPLORE_ANGLE_SECTORS = 12;
const EXPLORE_RING_CENTERS = [0.18, 0.32, 0.46, 0.58] as const;
const EXPLORE_UNSEEN_BONUS_TICKS = 8 * 120;
const EXPLORE_AGE_CAP_TICKS = 18 * 120;
const BOUNDARY_THREAT_START_RATIO = 0.84;

const normalizeDir = (dir: Vec2, fallback: Vec2 = DEFAULT_DIR): Vec2 => {
  const normalized = normalize(dir);
  return len(normalized) === 0 ? { ...fallback } : normalized;
};

const inwardDir = (pos: Vec2): Vec2 =>
  normalizeDir(scale(pos, -1), DEFAULT_DIR);

const findExploreRingIndex = (pos: Vec2, arenaRadius: number): number => {
  const normalizedRadius = clamp01(
    len(pos) /
      Math.max(
        1,
        arenaRadius * EXPLORE_RING_CENTERS[EXPLORE_RING_CENTERS.length - 1]!,
      ),
  );
  let bestIndex = 0;
  let bestError = Number.POSITIVE_INFINITY;

  for (let index = 0; index < EXPLORE_RING_CENTERS.length; index += 1) {
    const error = Math.abs(normalizedRadius - EXPLORE_RING_CENTERS[index]!);
    if (error < bestError) {
      bestError = error;
      bestIndex = index;
    }
  }

  return bestIndex;
};

const getExploreSectorKey = (pos: Vec2, arenaRadius: number): string => {
  const ringIndex = findExploreRingIndex(pos, arenaRadius);
  const angle = Math.atan2(pos.y, pos.x);
  const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
  const sectorIndex = Math.floor(
    (normalizedAngle / (Math.PI * 2)) * EXPLORE_ANGLE_SECTORS,
  );
  return `${ringIndex}:${Math.min(EXPLORE_ANGLE_SECTORS - 1, sectorIndex)}`;
};

const getExploreSectorCenter = (
  ringIndex: number,
  sectorIndex: number,
  arenaRadius: number,
): Vec2 => {
  const angle =
    ((sectorIndex + 0.5) / EXPLORE_ANGLE_SECTORS) * Math.PI * 2 - Math.PI;
  return scale(
    fromAngle(angle),
    arenaRadius * (EXPLORE_RING_CENTERS[ringIndex] ?? EXPLORE_RING_CENTERS[0]!),
  );
};

export const recordCombatAiExploreVisit = ({
  arenaRadius,
  blackboard,
  pos,
  tick,
}: {
  arenaRadius: number;
  blackboard: CombatAiBlackboard;
  pos: Vec2;
  tick: number;
}): void => {
  const sectorKey = getExploreSectorKey(pos, arenaRadius);
  blackboard.history.lastExploreSectorKey = sectorKey;
  blackboard.history.sectorVisitTicks[sectorKey] = tick;
};

const scoreCacheContents = (
  contents: CacheContents,
  self: PlanetPublic,
  privateState: PlanetPrivateState,
): number => {
  switch (contents.kind) {
    case "repair":
      return self.hp < PLANET_HP
        ? 1.15 + (1 - self.hp / PLANET_HP) * 0.8
        : 0.32;
    case "heavyAmmo":
      return privateState.ammo.heavy <= 1 ? 1.12 : 0.46;
    case "seekerPack":
      return privateState.ammo.seeker <= 1 ? 1.08 : 0.42;
    case "shieldExt":
      return self.shieldLoad < self.shieldMaxLoad * 0.55 ? 0.82 : 0.48;
    case "wildcard":
      return 0.94;
  }
};

const scoreAmmoPressure = (privateState: PlanetPrivateState): number =>
  clamp01(
    (1 - privateState.ammo.light / 12) * 0.2 +
      (1 - privateState.ammo.heavy / 4) * 0.4 +
      (1 - privateState.ammo.seeker / 3) * 0.4,
  );

const assessRocketThreats = (
  self: PlanetPublic,
  rockets: readonly Rocket[],
): CombatAiThreat[] => {
  const threats: CombatAiThreat[] = [];

  for (const rocket of rockets) {
    if (rocket.ownerId === self.playerId) {
      continue;
    }

    const targeted = rocket.targetId === self.id;
    const seeker = rocket.rocketKind === "seeker";
    const relativePos = sub(rocket.pos, self.pos);
    const relativeVel = sub(rocket.vel, self.vel);
    const relativeSpeedSq = Math.max(1, lenSq(relativeVel));
    const t = Math.max(
      0,
      Math.min(1.25, -dot(relativePos, relativeVel) / relativeSpeedSq),
    );
    const closestVec = addScaled(relativePos, relativeVel, t);
    const missDistance = len(closestVec);
    const hitRadius =
      self.radius + rocket.radius + (targeted ? 92 : seeker ? 72 : 52);
    if (missDistance > hitRadius) {
      continue;
    }

    const urgency = clamp01(
      clamp01(1 - t / 1.25) * 0.56 +
        clamp01(1 - missDistance / hitRadius) * 0.26 +
        (targeted ? 0.12 : 0) +
        (seeker ? 0.06 : 0),
    );
    threats.push({
      kind: "rocket",
      urgency,
      immediate:
        t <= (targeted || seeker ? 0.68 : 0.48) ||
        missDistance <= hitRadius * 0.28,
      timeSec: t,
      entityId: rocket.id,
      playerId: rocket.ownerId,
      preferredResponse: self.shieldLoad > 0 ? "shield" : "boost",
      escapeDir: normalizeDir(scale(relativePos, -1), inwardDir(self.pos)),
      reason: `rocket ${rocket.rocketKind} in ${t.toFixed(2)}s`,
    });
  }

  return threats;
};

const addScaled = (base: Vec2, delta: Vec2, scalar: number): Vec2 => ({
  x: base.x + delta.x * scalar,
  y: base.y + delta.y * scalar,
});

const assessPlanetThreats = (
  self: PlanetPublic,
  planets: readonly PlanetPublic[],
): CombatAiThreat[] => {
  const threats: CombatAiThreat[] = [];

  for (const planet of planets) {
    if (planet.id === self.id) {
      continue;
    }

    const relativePos = sub(planet.pos, self.pos);
    const relativeVel = sub(planet.vel, self.vel);
    const relativeSpeedSq = Math.max(1, lenSq(relativeVel));
    const t = Math.max(
      0,
      Math.min(1.6, -dot(relativePos, relativeVel) / relativeSpeedSq),
    );
    const closestVec = addScaled(relativePos, relativeVel, t);
    const gap = len(closestVec) - self.radius - planet.radius;
    const dangerMargin = 72;
    if (gap > dangerMargin) {
      continue;
    }

    const urgency =
      clamp01(1 - t / 1.6) * 0.56 +
      clamp01(1 - gap / Math.max(1, dangerMargin)) * 0.44;
    threats.push({
      kind: "planet",
      urgency,
      immediate: t <= 0.5 || gap <= 18,
      timeSec: t,
      entityId: planet.id,
      playerId: planet.playerId,
      preferredResponse: "boost",
      escapeDir: normalizeDir(scale(relativePos, -1), inwardDir(self.pos)),
      reason: `planet collision ${planet.playerId} ${t.toFixed(2)}s`,
    });
  }

  return threats;
};

const assessHazardThreats = ({
  difficulty,
  self,
  world,
}: {
  difficulty: BotDifficulty;
  self: PlanetPublic;
  world: World;
}): CombatAiThreat[] => {
  const threats: CombatAiThreat[] = [];
  const steps = Math.max(
    1,
    Math.round(COMBAT_AI_TUNING.threat.simulationSteps[difficulty]),
  );
  const dt =
    COMBAT_AI_TUNING.threat.lookaheadSec[difficulty] / Math.max(1, steps);
  let predictedSuns = world.suns.map((sun) => ({
    ...sun,
    pos: { ...sun.pos },
    vel: { ...sun.vel },
  }));
  let predictedSelf: PlanetPublic = {
    ...self,
    pos: { ...self.pos },
    vel: { ...self.vel },
    shieldAimDir: { ...self.shieldAimDir },
    debuffs: { ...self.debuffs },
  };
  let orbitStarMotion = world.orbitStarMotion;

  for (let step = 0; step < steps; step += 1) {
    predictedSuns = stepSunsWithOrbitMotion(
      predictedSuns,
      dt,
      world.blackHole,
      orbitStarMotion,
    );
    orbitStarMotion = advanceWorldOrbitStarMotion(
      orbitStarMotion,
      dt,
      predictedSuns,
    );
    predictedSelf = stepBody(
      predictedSelf,
      predictedSuns,
      dt,
      world.blackHole,
      world.neutronStars,
    );
    const timeSec = dt * (step + 1);

    for (const sun of predictedSuns) {
      const gap =
        dist(predictedSelf.pos, sun.pos) - predictedSelf.radius - sun.radius;
      if (gap <= 56) {
        threats.push({
          kind: "sun",
          urgency: clamp01(1 - gap / 56) * clamp01(1 - timeSec / 2.8),
          immediate: timeSec <= 0.65,
          timeSec,
          entityId: sun.id,
          preferredResponse: "boost",
          escapeDir: normalizeDir(
            sub(predictedSelf.pos, sun.pos),
            inwardDir(self.pos),
          ),
          reason: `sun clearance ${gap.toFixed(0)}`,
        });
        break;
      }
    }

    for (const neutronStar of world.neutronStars) {
      const gap =
        dist(predictedSelf.pos, neutronStar.pos) -
        predictedSelf.radius -
        neutronStar.radius;
      if (gap <= 92) {
        threats.push({
          kind: "neutronStar",
          urgency: clamp01(1 - gap / 92) * clamp01(1 - timeSec / 3),
          immediate: timeSec <= 0.75,
          timeSec,
          entityId: neutronStar.id,
          preferredResponse: "boost",
          escapeDir: normalizeDir(
            sub(predictedSelf.pos, neutronStar.pos),
            inwardDir(self.pos),
          ),
          reason: `neutron-star pull ${gap.toFixed(0)}`,
        });
        break;
      }
    }

    const boundaryOverrun =
      len(predictedSelf.pos) - world.arenaRadius * BOUNDARY_THREAT_START_RATIO;
    if (boundaryOverrun >= 0) {
      threats.push({
        kind: "boundary",
        urgency:
          clamp01(
            boundaryOverrun /
              (world.arenaRadius * (1 - BOUNDARY_THREAT_START_RATIO)),
          ) * 0.96,
        immediate:
          timeSec <= 0.55 || len(predictedSelf.pos) >= world.arenaRadius * 0.94,
        timeSec,
        preferredResponse: "boost",
        escapeDir: inwardDir(predictedSelf.pos),
        reason: `boundary overrun ${boundaryOverrun.toFixed(0)}`,
      });
    }

    if (world.blackHole) {
      const blackHoleGap = len(predictedSelf.pos) - world.blackHole.killRadius;
      if (blackHoleGap <= 180) {
        threats.push({
          kind: "blackHole",
          urgency: clamp01(1 - blackHoleGap / 180),
          immediate: timeSec <= 0.7 || blackHoleGap <= 40,
          timeSec,
          entityId: world.blackHole.id,
          preferredResponse: "boost",
          escapeDir: normalizeDir(predictedSelf.pos, inwardDir(self.pos)),
          reason: `black-hole margin ${blackHoleGap.toFixed(0)}`,
        });
      }
    }
  }

  return threats;
};

const assessCrossfireThreat = (
  self: PlanetPublic,
  planets: readonly PlanetPublic[],
): CombatAiThreat | null => {
  const nearbyEnemies = planets.filter(
    (planet) =>
      planet.playerId !== self.playerId && dist(self.pos, planet.pos) <= 760,
  );
  if (nearbyEnemies.length < 2) {
    return null;
  }

  const nearestDistance = nearbyEnemies.reduce(
    (best, planet) => Math.min(best, dist(self.pos, planet.pos)),
    Number.POSITIVE_INFINITY,
  );
  return {
    kind: "crossfire",
    urgency: clamp01(
      (nearbyEnemies.length - 1) * 0.22 + 1 - nearestDistance / 760,
    ),
    immediate: false,
    timeSec: 1.1,
    preferredResponse: "reposition",
    escapeDir: inwardDir(self.pos),
    reason: `${nearbyEnemies.length} enemies in crossfire`,
  };
};

const scoreExploreSectorSafety = (
  pos: Vec2,
  self: PlanetPublic,
  world: World,
): number => {
  const boundarySafety = clamp01(
    (world.arenaRadius * 0.82 - len(pos)) / (world.arenaRadius * 0.18),
  );
  const radialComfort = clamp01(
    1 -
      Math.abs(len(pos) - world.arenaRadius * 0.46) /
        (world.arenaRadius * 0.28),
  );
  let sunSafety = 1;
  let neutronSafety = 1;

  for (const sun of world.suns) {
    const gap = dist(pos, sun.pos) - self.radius - sun.radius;
    sunSafety = Math.min(sunSafety, clamp01(gap / 320));
  }

  for (const neutronStar of world.neutronStars) {
    const gap = dist(pos, neutronStar.pos) - self.radius - neutronStar.radius;
    neutronSafety = Math.min(neutronSafety, clamp01(gap / 360));
  }

  const blackHoleSafety =
    world.blackHole === undefined
      ? 1
      : clamp01(
          (len(pos) - world.blackHole.killRadius) /
            Math.max(220, world.blackHole.killRadius),
        );

  return clamp01(
    boundarySafety * 0.4 +
      radialComfort * 0.14 +
      sunSafety * 0.22 +
      neutronSafety * 0.1 +
      blackHoleSafety * 0.14,
  );
};

const buildExploreFact = ({
  blackboard,
  self,
  tick,
  world,
}: {
  blackboard: CombatAiBlackboard;
  self: PlanetPublic;
  tick: number;
  world: World;
}): CombatAiExploreFact | null => {
  let best: CombatAiExploreFact | null = null;

  for (
    let ringIndex = 0;
    ringIndex < EXPLORE_RING_CENTERS.length;
    ringIndex += 1
  ) {
    for (
      let sectorIndex = 0;
      sectorIndex < EXPLORE_ANGLE_SECTORS;
      sectorIndex += 1
    ) {
      const sectorKey = `${ringIndex}:${sectorIndex}`;
      const targetPos = getExploreSectorCenter(
        ringIndex,
        sectorIndex,
        world.arenaRadius,
      );
      const safety = scoreExploreSectorSafety(targetPos, self, world);
      if (safety <= 0.18) {
        continue;
      }

      const lastVisitTick = blackboard.history.sectorVisitTicks[sectorKey];
      const ageTicks =
        lastVisitTick === undefined
          ? tick + EXPLORE_UNSEEN_BONUS_TICKS
          : Math.max(0, tick - lastVisitTick);
      const ageScore = clamp01(ageTicks / EXPLORE_AGE_CAP_TICKS);
      const travelScore = clamp01(
        1 - dist(self.pos, targetPos) / Math.max(240, world.arenaRadius * 0.72),
      );
      const score = clamp01(
        ageScore * 0.56 + safety * 0.34 + travelScore * 0.1,
      );
      const fact: CombatAiExploreFact = {
        sectorKey,
        dir: normalizeDir(sub(targetPos, self.pos), inwardDir(self.pos)),
        targetPos,
        score,
        ageTicks,
        safety,
        reason: `explore ${sectorKey} stale ${(ageTicks / 120).toFixed(1)}s safe ${Math.round(safety * 100)}%`,
      };

      if (
        best === null ||
        fact.score > best.score + 0.0001 ||
        (Math.abs(fact.score - best.score) <= 0.0001 &&
          fact.ageTicks > best.ageTicks)
      ) {
        best = fact;
      }
    }
  }

  return best;
};

export const probeCombatAiThreats = ({
  blackboard,
  difficulty,
  self,
  world,
}: {
  blackboard: CombatAiBlackboard;
  difficulty: BotDifficulty;
  self: PlanetPublic;
  world: World;
}): CombatAiThreat[] => {
  const threats = [
    ...assessRocketThreats(self, world.rockets),
    ...assessPlanetThreats(self, world.planets),
    ...assessHazardThreats({ difficulty, self, world }),
  ];
  const crossfire = assessCrossfireThreat(self, world.planets);
  if (crossfire !== null) {
    threats.push(crossfire);
  }

  if (
    blackboard.plan?.fireGate.targetPlayerId !== undefined &&
    !world.planets.some(
      (planet) => planet.playerId === blackboard.plan?.fireGate.targetPlayerId,
    )
  ) {
    threats.push({
      kind: "targetLost",
      urgency: 1,
      immediate: true,
      timeSec: 0,
      preferredResponse: "retarget",
      escapeDir: inwardDir(self.pos),
      reason: "planned target destroyed",
    });
  }

  if (
    blackboard.plan?.moveGoal?.targetCacheId !== undefined &&
    !world.caches.some(
      (cache) => cache.id === blackboard.plan?.moveGoal?.targetCacheId,
    )
  ) {
    threats.push({
      kind: "cacheRace",
      urgency: 0.78,
      immediate: true,
      timeSec: 0,
      preferredResponse: "abandonCache",
      escapeDir: inwardDir(self.pos),
      reason: "planned cache removed",
    });
  }

  return threats.sort((left, right) => {
    if (Math.abs(right.urgency - left.urgency) > 0.0001) {
      return right.urgency - left.urgency;
    }
    return left.timeSec - right.timeSec;
  });
};

const buildTargetFacts = ({
  blackboard,
  difficulty,
  self,
  world,
}: {
  blackboard: CombatAiBlackboard;
  difficulty: BotDifficulty;
  self: PlanetPublic;
  world: World;
}): CombatAiTargetFact[] =>
  world.planets
    .filter((planet) => planet.playerId !== self.playerId)
    .map((planet) => {
      const distance = dist(self.pos, planet.pos);
      const direction = normalizeDir(
        sub(planet.pos, self.pos),
        inwardDir(self.pos),
      );
      const closingSpeed = -dot(sub(planet.vel, self.vel), direction);
      const { chaosScore } = analyzeTargetTrajectory({
        difficulty,
        target: planet,
        world,
      });
      const sameTargetBonus =
        blackboard.history.lastTargetPlayerId === planet.playerId ? 0.12 : 0;
      const pressureScore =
        (1 - planet.hp / PLANET_HP) * 0.52 +
        clamp01(1 - distance / 1200) * 0.3 +
        clamp01(closingSpeed / 260) * 0.06 +
        clamp01(1 - chaosScore / 2.6) * 0.12 +
        sameTargetBonus;

      return {
        planetId: planet.id,
        playerId: planet.playerId,
        hp: planet.hp,
        distance,
        radialDistance: len(planet.pos),
        closingSpeed,
        chaosScore,
        pressureScore,
      };
    })
    .sort((left, right) => right.pressureScore - left.pressureScore);

const buildCacheFacts = ({
  self,
  targets,
  privateState,
  world,
}: {
  self: PlanetPublic;
  targets: readonly CombatAiTargetFact[];
  privateState: PlanetPrivateState;
  world: World;
}): CombatAiCacheFact[] =>
  world.caches
    .map((cache) => {
      const speedHint = Math.max(140, len(self.vel) + 120);
      const selfEtaSec = estimateTravelEtaSec(self.pos, cache.pos, speedHint);
      const enemyEtaSec = targets.reduce((best, target) => {
        const enemy = world.planets.find(
          (planet) => planet.id === target.planetId,
        );
        if (!enemy) {
          return best;
        }

        return Math.min(
          best,
          estimateTravelEtaSec(
            enemy.pos,
            cache.pos,
            Math.max(120, len(enemy.vel) + 100),
          ),
        );
      }, Number.POSITIVE_INFINITY);
      const contestMarginSec = enemyEtaSec - selfEtaSec;
      const cacheValue = scoreCacheContents(cache.contents, self, privateState);
      const contestScore =
        cacheValue * 100 +
        contestMarginSec * 22 -
        Math.max(0, selfEtaSec - 5) * 8;

      return {
        cacheId: cache.id,
        contents: cache.contents,
        distance: dist(self.pos, cache.pos),
        selfEtaSec,
        enemyEtaSec,
        contestMarginSec,
        contestScore,
        reason: `${cache.contents.kind} eta ${selfEtaSec.toFixed(1)}s / enemy ${enemyEtaSec.toFixed(1)}s`,
      };
    })
    .sort((left, right) => right.contestScore - left.contestScore);

export const buildCombatAiPerception = ({
  blackboard,
  difficulty,
  privateState,
  self,
  tick,
  world,
}: {
  blackboard: CombatAiBlackboard;
  difficulty: BotDifficulty;
  privateState: PlanetPrivateState;
  self: PlanetPublic;
  tick: number;
  world: World;
}): CombatAiPerception => {
  const threats = probeCombatAiThreats({ blackboard, difficulty, self, world });
  const targets = buildTargetFacts({ blackboard, difficulty, self, world });
  const primaryTarget = targets[0];
  const caches = buildCacheFacts({ self, targets, privateState, world });
  const bestCache = caches[0];
  const explore = buildExploreFact({
    blackboard,
    self,
    tick,
    world,
  });
  const hpPressure = clamp01(1 - self.hp / PLANET_HP);
  const ammoPressure = scoreAmmoPressure(privateState);
  const boundaryPressure = clamp01(
    (len(self.pos) - world.arenaRadius * 0.66) / (world.arenaRadius * 0.18),
  );
  const blackHolePressure =
    world.blackHole === undefined
      ? 0
      : clamp01(
          1 -
            (len(self.pos) - world.blackHole.killRadius) /
              Math.max(world.blackHole.killRadius, 240),
        );
  const laneQuality =
    primaryTarget === undefined
      ? 0
      : (() => {
          const target = world.planets.find(
            (planet) => planet.id === primaryTarget.planetId,
          );
          if (!target) {
            return 0;
          }
          const shots = buildShotScores({
            ammoPressure,
            difficulty,
            privateState,
            self,
            target,
            targetFact: primaryTarget,
            tick,
            world,
          });
          return shots[0]?.confidence ?? 0;
        })();

  return {
    tick,
    primaryTargetId: primaryTarget?.planetId,
    primaryTargetPlayerId: primaryTarget?.playerId,
    bestCacheId: bestCache?.cacheId,
    threats,
    targets,
    caches,
    hpPressure,
    ammoPressure,
    boundaryPressure,
    blackHolePressure,
    laneQuality,
    explore,
    shieldReady: self.shieldLoad > 0 && !self.shieldActive,
    boostReady: privateState.boostCharges > 0,
    gravityPulseHeld: privateState.gravityPulseHeld,
  };
};

export const hasImmediateThreat = (perception: CombatAiPerception): boolean =>
  perception.threats.some((threat) => threat.immediate);

export const findPrimaryTarget = (
  perception: CombatAiPerception,
  world: World,
): PlanetPublic | null =>
  perception.primaryTargetId === undefined
    ? null
    : (world.planets.find(
        (planet) => planet.id === perception.primaryTargetId,
      ) ?? null);

export const findBestCache = (
  perception: CombatAiPerception,
  world: World,
): Cache | null =>
  perception.bestCacheId === undefined
    ? null
    : (world.caches.find((cache) => cache.id === perception.bestCacheId) ??
      null);
