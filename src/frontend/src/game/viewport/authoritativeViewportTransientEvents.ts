import type { RocketKind } from "@3body/shared";
import type {
  AuthoritativeImpactBurstState,
  QueueAuthoritativeBlackHoleSwallowEffectArgs,
} from "./authoritativeCosmeticFeedback";
import {
  queueBlackHoleSwallowEffect,
  type BlackHoleSwallowState,
  type BlackHoleSwallowVisual,
} from "./blackHoleVisuals";
import type { SharedCombatBoostBurstState } from "./sharedCombatBoostVisuals";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";
import {
  clearSharedCombatPlanetExplosions,
  type SharedCombatPlanetExplosionState,
  type SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";

export interface AuthoritativeViewportTransientEvents {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activeBoostBursts: SharedCombatBoostBurstState[];
  activeImpactBursts: AuthoritativeImpactBurstState[];
  activeLaunchBurstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
}

export const createAuthoritativeViewportTransientEvents = (
  rocketKinds: readonly RocketKind[],
): AuthoritativeViewportTransientEvents => {
  const activeLaunchBurstsByKind: Record<
    RocketKind,
    SharedCombatLaunchBurstState[]
  > = {
    heavy: [],
    light: [],
    seeker: [],
  };
  for (const rocketKind of rocketKinds) {
    activeLaunchBurstsByKind[rocketKind] = [];
  }

  return {
    activeBlackHoleSwallowEffects: [],
    activeBoostBursts: [],
    activeImpactBursts: [],
    activeLaunchBurstsByKind,
    activePlanetExplosions: [],
  };
};

export const resetAuthoritativeViewportTransientEvents = ({
  events,
  inactivePlanetExplosionVisuals,
  rocketKinds,
}: {
  events: AuthoritativeViewportTransientEvents;
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
  rocketKinds: readonly RocketKind[];
}) => {
  for (const rocketKind of rocketKinds) {
    events.activeLaunchBurstsByKind[rocketKind].length = 0;
  }
  events.activeBlackHoleSwallowEffects.length = 0;
  events.activeBoostBursts.length = 0;
  events.activeImpactBursts.length = 0;
  clearSharedCombatPlanetExplosions({
    activePlanetExplosions: events.activePlanetExplosions,
    inactivePlanetExplosionVisuals,
  });
};

export const queueAuthoritativeViewportBlackHoleSwallowEvent = ({
  events,
  inactiveBlackHoleSwallowVisuals,
  nowSec,
  swallow,
}: {
  events: AuthoritativeViewportTransientEvents;
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  nowSec: number;
  swallow: QueueAuthoritativeBlackHoleSwallowEffectArgs;
}) => {
  queueBlackHoleSwallowEffect({
    activeEffects: events.activeBlackHoleSwallowEffects,
    color: swallow.color,
    inactiveVisuals: inactiveBlackHoleSwallowVisuals,
    radius: swallow.radius,
    startedAtSec: nowSec,
    startPos: swallow.startPos,
    targetPos: swallow.targetPos,
  });
};
