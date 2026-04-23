import type {
  AbilitySlot,
  PlanetPublic,
  RocketKind,
  SnapshotEvent,
  Vec2,
  World,
} from "@3body/shared";
import {
  GRAVITY_PULSE_SPEC,
  len,
  normalize as normalizeVec2,
  SNAPSHOT_HZ,
  sub,
} from "@3body/shared";
import type {
  AuthoritativeMatchRuntimeState,
  AuthoritativeSnapshot,
} from "../authoritativeMatchRuntime";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import { deriveAuthoritativeRocketLaunchBursts } from "./authoritativeRocketLaunchBursts";
import {
  CAMERA_SHAKE_DURATION_SEC,
  getRocketImpactCameraShake,
  getRocketImpactHudFlicker,
  getRocketImpactScreenFlash,
  ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC,
  ROCKET_IMPACT_SCREEN_FLASH_DURATION_SEC,
} from "./cameraShake";
import {
  queueSharedCombatBoostBurst,
  type SharedCombatBoostBurstState,
} from "./sharedCombatBoostVisuals";
import type {
  SharedCombatImmediateFireBurstState,
  SharedCombatImmediateGhostRocketState,
} from "./sharedCombatImmediateFireVisuals";
import type { SharedCombatPlanetExplosionSource } from "./sharedCombatPlanetExplosions";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";
import type { SharedCombatImmediateShieldFeedbackState } from "./sharedCombatSupportVisuals";

const AUTHORITATIVE_IMMEDIATE_FIRE_CAMERA_SHAKE = 0.12;
const AUTHORITATIVE_IMMEDIATE_FIRE_HUD_FLICKER = 0.05;
const AUTHORITATIVE_IMMEDIATE_SHIELD_HUD_FLICKER = 0.06;
const AUTHORITATIVE_IMMEDIATE_BOOST_CAMERA_SHAKE = 0.1;
const AUTHORITATIVE_IMMEDIATE_GRAVITY_PULSE_CAMERA_SHAKE = 0.18;
const AUTHORITATIVE_IMMEDIATE_GRAVITY_PULSE_HUD_FLICKER = 0.1;

export interface ImmediateGravityPulseFeedbackState {
  effectRadius: number;
  origin: Vec2;
  planetRadius: number;
  startedAtSec: number;
}

export interface ImmediateCannonFlashState {
  rocketKind: RocketKind;
  startedAtSec: number;
}

export interface AuthoritativeImpactBurstState {
  absorbedByShield: boolean;
  color: string;
  normal: Vec2;
  planetId: number;
  radius: number;
  startedAtSec: number;
  targetPos: Vec2;
}

export interface AuthoritativeFeedbackLevels {
  cameraShake: number;
  damageFlash: number;
  hudFlicker: number;
}

export interface QueueAuthoritativeBlackHoleSwallowEffectArgs {
  color: string;
  radius: number;
  startPos: Vec2;
  targetPos: Vec2;
}

const DEFAULT_DIRECTION = { x: 1, y: 0 } satisfies Vec2;

const worldContainsPlayerPlanet = (
  world: World | null | undefined,
  playerId: string,
  planetId: number,
): boolean =>
  world?.planets.some(
    (planet) => planet.id === planetId && planet.playerId === playerId,
  ) ?? false;

const isPlayerRocketHitEvent = (
  runtime: Pick<
    AuthoritativeMatchRuntimeState,
    "playerId" | "previousSnapshot" | "snapshot"
  >,
  event: Extract<SnapshotEvent, { kind: "hit" }>,
): boolean => {
  if (runtime.playerId === null) {
    return false;
  }

  return (
    worldContainsPlayerPlanet(
      runtime.snapshot?.world ?? null,
      runtime.playerId,
      event.victimPlanetId,
    ) ||
    worldContainsPlayerPlanet(
      runtime.previousSnapshot?.world ?? null,
      runtime.playerId,
      event.victimPlanetId,
    )
  );
};

const findPlanetById = (
  world: World | null | undefined,
  planetId: number,
): PlanetPublic | null =>
  world?.planets.find((planet) => planet.id === planetId) ?? null;

const findPlanetByPlayerId = (
  world: World | null | undefined,
  playerId: string,
): PlanetPublic | null =>
  world?.planets.find((planet) => planet.playerId === playerId) ?? null;

const findRocketById = (
  world: World | null | undefined,
  rocketId: number,
): World["rockets"][number] | null =>
  world?.rockets.find((rocket) => rocket.id === rocketId) ?? null;

const killCauseToPlanetExplosionDeathReason = (
  cause: Extract<SnapshotEvent, { kind: "kill" }>["cause"],
): SharedCombatPlanetExplosionSource["deathReason"] | null => {
  switch (cause) {
    case "rocket":
    case "planetCollision":
    case "boundaryAsteroid":
    case "boundary":
      return cause;
    case "sun":
      return "sunCollision";
    case "neutronStar":
      return "neutronStar";
    case "blackHole":
      return null;
  }
};

const estimateImpactNormal = ({
  event,
  previousWorld,
  snapshotWorld,
}: {
  event: Extract<SnapshotEvent, { kind: "hit" }>;
  previousWorld: World | null | undefined;
  snapshotWorld: World | null | undefined;
}): Vec2 => {
  const victimPlanet =
    findPlanetById(snapshotWorld, event.victimPlanetId) ??
    findPlanetById(previousWorld, event.victimPlanetId);
  if (victimPlanet === null) {
    return DEFAULT_DIRECTION;
  }

  const impactRocket =
    findRocketById(snapshotWorld, event.rocketId) ??
    findRocketById(previousWorld, event.rocketId);
  if (impactRocket !== null) {
    const rocketDelta = sub(impactRocket.pos, victimPlanet.pos);
    if (len(rocketDelta) > 0.001) {
      return normalizeVec2(rocketDelta);
    }
  }

  if (event.attackerPlayerId !== undefined) {
    const attackerPlanet =
      findPlanetByPlayerId(snapshotWorld, event.attackerPlayerId) ??
      findPlanetByPlayerId(previousWorld, event.attackerPlayerId);
    if (attackerPlanet !== null) {
      const attackerDelta = sub(attackerPlanet.pos, victimPlanet.pos);
      if (len(attackerDelta) > 0.001) {
        return normalizeVec2(attackerDelta);
      }
    }
  }

  return DEFAULT_DIRECTION;
};

const estimateBoostDirection = ({
  fallbackDirection,
  planetId,
  previousWorld,
  snapshotWorld,
}: {
  fallbackDirection: Vec2 | null;
  planetId: number;
  previousWorld: World | null | undefined;
  snapshotWorld: World | null | undefined;
}): Vec2 => {
  const currentPlanet = findPlanetById(snapshotWorld, planetId);
  const previousPlanet = findPlanetById(previousWorld, planetId);
  if (currentPlanet !== null && previousPlanet !== null) {
    const velocityDelta = sub(currentPlanet.vel, previousPlanet.vel);
    if (len(velocityDelta) > 0.001) {
      return normalizeVec2(velocityDelta);
    }
  }

  if (fallbackDirection !== null && len(fallbackDirection) > 0.001) {
    return normalizeVec2(fallbackDirection);
  }

  return DEFAULT_DIRECTION;
};

export const decayAuthoritativeFeedbackLevels = ({
  cameraShake,
  damageFlash,
  frameDeltaSec,
  hudFlicker,
}: AuthoritativeFeedbackLevels & {
  frameDeltaSec: number;
}): AuthoritativeFeedbackLevels => ({
  cameraShake: Math.max(
    0,
    cameraShake - frameDeltaSec / CAMERA_SHAKE_DURATION_SEC,
  ),
  damageFlash: Math.max(
    0,
    damageFlash - frameDeltaSec / ROCKET_IMPACT_SCREEN_FLASH_DURATION_SEC,
  ),
  hudFlicker: Math.max(
    0,
    hudFlicker - frameDeltaSec / ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC,
  ),
});

const queueAuthoritativeBoostBurst = ({
  activeBursts,
  burst,
  maxActiveBursts,
}: {
  activeBursts: SharedCombatBoostBurstState[];
  burst: SharedCombatBoostBurstState;
  maxActiveBursts: number;
}) => {
  const lastBurst = activeBursts[activeBursts.length - 1] ?? null;
  if (
    lastBurst !== null &&
    lastBurst.planetId === burst.planetId &&
    Math.abs(burst.startedAtSec - lastBurst.startedAtSec) <= 0.12
  ) {
    lastBurst.direction = burst.direction;
    lastBurst.origin = burst.origin;
    lastBurst.radius = burst.radius;
    lastBurst.startedAtSec = Math.min(
      lastBurst.startedAtSec,
      burst.startedAtSec,
    );
    lastBurst.tick = burst.tick;
    return;
  }

  queueSharedCombatBoostBurst({
    activeBursts,
    burst,
    maxActiveBursts,
  });
};

export const queueAuthoritativeImmediateFireFeedback = ({
  immediateFireBurstState,
  immediateGhostRocketState,
  nowSec,
  rocketKind,
  screenEffects,
}: {
  aimDir: Vec2;
  immediateFireBurstState: Map<RocketKind, SharedCombatImmediateFireBurstState>;
  immediateGhostRocketState: Map<
    RocketKind,
    SharedCombatImmediateGhostRocketState
  >;
  nowSec: number;
  playerPlanet: Pick<PlanetPublic, "pos" | "radius">;
  rocketKind: RocketKind;
  screenEffects: AuthoritativeFeedbackLevels;
}): {
  immediateCannonFlashState: ImmediateCannonFlashState;
  screenEffects: AuthoritativeFeedbackLevels;
} => {
  immediateFireBurstState.delete(rocketKind);
  immediateGhostRocketState.delete(rocketKind);

  return {
    immediateCannonFlashState: {
      rocketKind,
      startedAtSec: nowSec,
    },
    screenEffects: {
      cameraShake: Math.max(
        screenEffects.cameraShake,
        AUTHORITATIVE_IMMEDIATE_FIRE_CAMERA_SHAKE,
      ),
      damageFlash: screenEffects.damageFlash,
      hudFlicker: Math.max(
        screenEffects.hudFlicker,
        AUTHORITATIVE_IMMEDIATE_FIRE_HUD_FLICKER,
      ),
    },
  };
};

export const queueAuthoritativeImmediateAbilityFeedback = ({
  abilitySlot,
  activeBoostBursts,
  aimDir,
  gravityPulseFeedbackState,
  immediateShieldFeedbackState,
  maxActiveBoostBursts,
  nowSec,
  playerPlanet,
  screenEffects,
  snapshotTick,
}: {
  abilitySlot: AbilitySlot;
  activeBoostBursts: SharedCombatBoostBurstState[];
  aimDir: Vec2;
  gravityPulseFeedbackState: ImmediateGravityPulseFeedbackState | null;
  immediateShieldFeedbackState: SharedCombatImmediateShieldFeedbackState | null;
  maxActiveBoostBursts: number;
  nowSec: number;
  playerPlanet: Pick<PlanetPublic, "id" | "pos" | "radius">;
  screenEffects: AuthoritativeFeedbackLevels;
  snapshotTick: number | null;
}): {
  gravityPulseFeedbackState: ImmediateGravityPulseFeedbackState | null;
  immediateShieldFeedbackState: SharedCombatImmediateShieldFeedbackState | null;
  screenEffects: AuthoritativeFeedbackLevels;
} => {
  switch (abilitySlot) {
    case "q":
      return {
        gravityPulseFeedbackState,
        immediateShieldFeedbackState: {
          aimDir: { x: aimDir.x, y: aimDir.y },
          startedAtSec: nowSec,
        },
        screenEffects: {
          cameraShake: screenEffects.cameraShake,
          damageFlash: screenEffects.damageFlash,
          hudFlicker: Math.max(
            screenEffects.hudFlicker,
            AUTHORITATIVE_IMMEDIATE_SHIELD_HUD_FLICKER,
          ),
        },
      };
    case "w":
      queueAuthoritativeBoostBurst({
        activeBursts: activeBoostBursts,
        burst: {
          direction: { x: aimDir.x, y: aimDir.y },
          origin: {
            x: playerPlanet.pos.x,
            y: playerPlanet.pos.y,
          },
          planetId: playerPlanet.id,
          radius: playerPlanet.radius,
          startedAtSec: nowSec,
          tick: snapshotTick ?? Math.round(nowSec * SNAPSHOT_HZ),
        },
        maxActiveBursts: maxActiveBoostBursts,
      });
      return {
        gravityPulseFeedbackState,
        immediateShieldFeedbackState,
        screenEffects: {
          cameraShake: Math.max(
            screenEffects.cameraShake,
            AUTHORITATIVE_IMMEDIATE_BOOST_CAMERA_SHAKE,
          ),
          damageFlash: screenEffects.damageFlash,
          hudFlicker: screenEffects.hudFlicker,
        },
      };
    case "g":
      return {
        gravityPulseFeedbackState: {
          effectRadius: GRAVITY_PULSE_SPEC.radius,
          origin: {
            x: playerPlanet.pos.x,
            y: playerPlanet.pos.y,
          },
          planetRadius: playerPlanet.radius,
          startedAtSec: nowSec,
        },
        immediateShieldFeedbackState,
        screenEffects: {
          cameraShake: Math.max(
            screenEffects.cameraShake,
            AUTHORITATIVE_IMMEDIATE_GRAVITY_PULSE_CAMERA_SHAKE,
          ),
          damageFlash: screenEffects.damageFlash,
          hudFlicker: Math.max(
            screenEffects.hudFlicker,
            AUTHORITATIVE_IMMEDIATE_GRAVITY_PULSE_HUD_FLICKER,
          ),
        },
      };
  }
};

export const syncAuthoritativeLaunchBurstFeedback = ({
  activeLaunchBurstsByKind,
  currentPlayerId,
  currentSnapshot,
  lastProcessedSnapshotTick,
  previousSnapshotWorld,
  rocketKinds,
}: {
  activeLaunchBurstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  currentPlayerId: string | null;
  currentSnapshot: AuthoritativeSnapshot | null;
  lastProcessedSnapshotTick: number | null;
  previousSnapshotWorld: World | null | undefined;
  rocketKinds: readonly RocketKind[];
}): number | null => {
  const snapshotTick = currentSnapshot?.tick ?? null;
  if (snapshotTick === null) {
    for (const rocketKind of rocketKinds) {
      activeLaunchBurstsByKind[rocketKind].length = 0;
    }
    return null;
  }

  if (
    lastProcessedSnapshotTick === null ||
    snapshotTick < lastProcessedSnapshotTick
  ) {
    for (const rocketKind of rocketKinds) {
      activeLaunchBurstsByKind[rocketKind].length = 0;
    }
    return snapshotTick;
  }

  if (snapshotTick > lastProcessedSnapshotTick) {
    if (
      currentSnapshot !== null &&
      previousSnapshotWorld !== undefined &&
      previousSnapshotWorld !== null
    ) {
      const snapshotReceivedAtSec = currentSnapshot.receivedAtMs * 0.001;
      const derivedLaunchBursts = deriveAuthoritativeRocketLaunchBursts({
        currentPlayerId,
        previousWorld: previousSnapshotWorld,
        snapshotReceivedAtSec,
        snapshotWorld: currentSnapshot.world,
      });
      for (const burst of derivedLaunchBursts) {
        activeLaunchBurstsByKind[burst.rocketKind].push(burst);
      }
    }

    return snapshotTick;
  }

  return lastProcessedSnapshotTick;
};

export const syncAuthoritativeRecentEventFeedback = ({
  activeBoostBursts,
  activeImpactBursts,
  blackHoleSource,
  lastProcessedEventId,
  localAimWorld,
  localPlayerPlanet,
  maxActiveBoostBursts,
  maxActiveImpactBursts,
  nowSec,
  queueBlackHoleSwallowEffect,
  queuePlanetExplosionEffect,
  runtime,
  screenEffects,
}: {
  activeBoostBursts: SharedCombatBoostBurstState[];
  activeImpactBursts: AuthoritativeImpactBurstState[];
  blackHoleSource: NonNullable<World["blackHole"]> | null;
  lastProcessedEventId: number | null;
  localAimWorld: Vec2;
  localPlayerPlanet: PlanetPublic | null;
  maxActiveBoostBursts: number;
  maxActiveImpactBursts: number;
  nowSec: number;
  queueBlackHoleSwallowEffect: (
    args: QueueAuthoritativeBlackHoleSwallowEffectArgs,
  ) => void;
  queuePlanetExplosionEffect?: (
    planet: SharedCombatPlanetExplosionSource,
  ) => void;
  runtime: Pick<
    AuthoritativeMatchRuntimeState,
    "playerId" | "previousSnapshot" | "recentEvents" | "snapshot"
  >;
  screenEffects: AuthoritativeFeedbackLevels;
}): AuthoritativeFeedbackLevels & {
  lastProcessedEventId: number;
} => {
  const latestEventId =
    runtime.recentEvents[runtime.recentEvents.length - 1]?.id ?? 0;
  if (lastProcessedEventId === null || latestEventId < lastProcessedEventId) {
    return {
      ...screenEffects,
      lastProcessedEventId: latestEventId,
    };
  }

  let { cameraShake, damageFlash, hudFlicker } = screenEffects;
  const snapshot = runtime.snapshot;
  const previousSnapshot = runtime.previousSnapshot ?? snapshot;
  const snapshotWorld = snapshot?.world;
  const previousSnapshotWorld = previousSnapshot?.world;

  for (const eventRecord of runtime.recentEvents) {
    if (eventRecord.id <= lastProcessedEventId) {
      continue;
    }

    if (eventRecord.event.kind === "hit") {
      const hitEvent = eventRecord.event;
      const hitPlanet =
        findPlanetById(snapshotWorld, hitEvent.victimPlanetId) ??
        findPlanetById(previousSnapshotWorld, hitEvent.victimPlanetId);
      if (hitPlanet !== null) {
        activeImpactBursts.push({
          absorbedByShield: hitEvent.absorbedByShield,
          color: hitEvent.absorbedByShield
            ? getRuntimeTuningDocument().visuals.abilities.shieldColor
            : getRuntimeTuningDocument().visuals.rockets[hitEvent.rocketKind]
                .hudAccent,
          normal: estimateImpactNormal({
            event: hitEvent,
            previousWorld: previousSnapshotWorld,
            snapshotWorld,
          }),
          planetId: hitEvent.victimPlanetId,
          radius: hitPlanet.radius,
          startedAtSec: nowSec,
          targetPos: { x: hitPlanet.pos.x, y: hitPlanet.pos.y },
        });
        while (activeImpactBursts.length > maxActiveImpactBursts) {
          activeImpactBursts.shift();
        }
      }

      if (isPlayerRocketHitEvent(runtime, hitEvent)) {
        damageFlash = Math.max(
          damageFlash,
          hitEvent.hpAfter <= 0
            ? 1
            : getRocketImpactScreenFlash({
                absorbedByShield: hitEvent.absorbedByShield,
                rocketKind: hitEvent.rocketKind,
              }),
        );
        hudFlicker = Math.max(
          hudFlicker,
          getRocketImpactHudFlicker({
            absorbedByShield: hitEvent.absorbedByShield,
            rocketKind: hitEvent.rocketKind,
          }),
        );
        cameraShake = Math.max(
          cameraShake,
          hitEvent.hpAfter <= 0
            ? 1
            : getRocketImpactCameraShake({
                absorbedByShield: hitEvent.absorbedByShield,
                rocketKind: hitEvent.rocketKind,
              }),
        );
      }
    }

    if (eventRecord.event.kind === "boost") {
      const boostPlanet =
        findPlanetById(snapshotWorld, eventRecord.event.planetId) ??
        findPlanetById(previousSnapshotWorld, eventRecord.event.planetId);
      if (boostPlanet !== null) {
        const fallbackDirection =
          eventRecord.event.playerId === runtime.playerId &&
          localPlayerPlanet !== null
            ? normalizeVec2(sub(localAimWorld, localPlayerPlanet.pos))
            : null;
        queueAuthoritativeBoostBurst({
          activeBursts: activeBoostBursts,
          burst: {
            direction: estimateBoostDirection({
              fallbackDirection,
              planetId: eventRecord.event.planetId,
              previousWorld: previousSnapshotWorld,
              snapshotWorld,
            }),
            origin: {
              x: boostPlanet.pos.x,
              y: boostPlanet.pos.y,
            },
            planetId: boostPlanet.id,
            radius: boostPlanet.radius,
            startedAtSec: nowSec,
            tick: eventRecord.event.tick,
          },
          maxActiveBursts: maxActiveBoostBursts,
        });
      }
    }

    if (
      eventRecord.event.kind === "kill" &&
      eventRecord.event.cause === "blackHole" &&
      blackHoleSource !== null
    ) {
      const killEvent = eventRecord.event;
      const swallowedPlanet =
        previousSnapshot?.world.planets.find(
          (planet) => planet.id === killEvent.victimPlanetId,
        ) ??
        snapshot?.world.planets.find(
          (planet) => planet.id === killEvent.victimPlanetId,
        ) ??
        null;

      if (swallowedPlanet !== null) {
        const archetypeVisual =
          getRuntimeTuningDocument().visuals.planets.archetypes[
            swallowedPlanet.archetype
          ];
        queueBlackHoleSwallowEffect({
          color: archetypeVisual.color,
          radius: swallowedPlanet.radius,
          startPos: swallowedPlanet.pos,
          targetPos: blackHoleSource.pos,
        });
      }
    }

    if (eventRecord.event.kind === "kill" && queuePlanetExplosionEffect) {
      const killEvent = eventRecord.event;
      const deathReason = killCauseToPlanetExplosionDeathReason(
        killEvent.cause,
      );
      const killedPlanet =
        findPlanetById(previousSnapshotWorld, killEvent.victimPlanetId) ??
        findPlanetById(snapshotWorld, killEvent.victimPlanetId);

      if (deathReason !== null && killedPlanet !== null) {
        const archetypeVisual =
          getRuntimeTuningDocument().visuals.planets.archetypes[
            killedPlanet.archetype
          ];
        queuePlanetExplosionEffect({
          color: archetypeVisual.color,
          deathReason,
          id: killedPlanet.id,
          pos: { x: killedPlanet.pos.x, y: killedPlanet.pos.y },
          radius: killedPlanet.radius,
          vel: { x: killedPlanet.vel.x, y: killedPlanet.vel.y },
        });
      }
    }
  }

  return {
    cameraShake,
    damageFlash,
    hudFlicker,
    lastProcessedEventId: latestEventId,
  };
};
