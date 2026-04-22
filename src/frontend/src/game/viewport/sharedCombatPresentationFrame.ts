import type { Vec2 } from "@3body/shared";
import type {
  SharedCombatBoostBody,
  SharedCombatBoostBurstState,
  SharedCombatBoostBurstVisual,
  SharedCombatBoostPresentationBody,
} from "./sharedCombatBoostVisuals";
import { syncSharedCombatBoostPresentation } from "./sharedCombatBoostVisuals";
import type { SharedCombatGravityPulseVisual } from "./sharedCombatSceneResources";
import {
  syncSharedCombatBlackHoleVisual,
  syncSharedCombatGravityPulsePresentation,
  syncSharedCombatPlayerShieldPresentation,
  syncSharedCombatPlayerWeaponPresentation,
  type SharedCombatAimedCannonPresentation,
  type SharedCombatBlackHolePresentation,
  type SharedCombatBlackHoleVisual,
  type SharedCombatCannonVisual,
  type SharedCombatGravityPulseState,
  type SharedCombatImmediateShieldFeedbackState,
  type SharedCombatLockRingPresentation,
  type SharedCombatLockRingVisual,
  type SharedCombatShieldImpactBurst,
  type SharedCombatShieldVisual,
} from "./sharedCombatSupportVisuals";

export interface SharedCombatWeaponPresentationFrame {
  cannon: SharedCombatAimedCannonPresentation | null;
  lockRing: SharedCombatLockRingPresentation | null;
}

export interface SharedCombatShieldPresentationFrame {
  active: boolean;
  activeAimDir: Vec2 | null;
  bursts: readonly SharedCombatShieldImpactBurst[];
  immediateFeedback?: SharedCombatImmediateShieldFeedbackState | null;
  immediateFeedbackDurationSec?: number;
  planet: {
    id: number;
    pos: Vec2;
    shieldLoad: number;
    shieldMaxLoad: number;
  } | null;
  shieldRadius: number;
}

export interface SharedCombatBoostPresentationFrame {
  activeBursts: SharedCombatBoostBurstState[];
  aimTarget: Vec2;
  getBodyById?: (planetId: number) => SharedCombatBoostBody | null;
  heldBoosting: boolean;
  maxParticlesPerBurst: number;
  playerBody: SharedCombatBoostPresentationBody | null;
}

export interface SharedCombatGravityPulsePresentationFrame {
  durationSec: number;
  pulse: SharedCombatGravityPulseState | null;
  visibleWorldHeight: number;
  z: {
    core: number;
    echo: number;
    ring: number;
  };
}

export interface SharedCombatPresentationFrameState {
  blackHole: SharedCombatBlackHolePresentation | null;
  boost: SharedCombatBoostPresentationFrame;
  gravityPulse: SharedCombatGravityPulsePresentationFrame;
  shield: SharedCombatShieldPresentationFrame;
  weapon: SharedCombatWeaponPresentationFrame;
}

export interface SharedCombatPresentationFrameVisuals {
  blackHole: SharedCombatBlackHoleVisual;
  boost: SharedCombatBoostBurstVisual | null;
  cannon: SharedCombatCannonVisual | null;
  gravityPulse: SharedCombatGravityPulseVisual | null;
  lockRing: SharedCombatLockRingVisual | null;
  shield: SharedCombatShieldVisual | null;
}

export const syncSharedCombatPresentationFrame = ({
  frame,
  nowSec,
  visuals,
}: {
  frame: SharedCombatPresentationFrameState;
  nowSec: number;
  visuals: SharedCombatPresentationFrameVisuals;
}): {
  gravityPulse: SharedCombatGravityPulseState | null;
  shieldImmediateFeedback: SharedCombatImmediateShieldFeedbackState | null;
} => {
  const shieldImmediateFeedback = syncSharedCombatPlayerShieldPresentation({
    active: frame.shield.active,
    activeAimDir: frame.shield.activeAimDir,
    bursts: frame.shield.bursts,
    immediateFeedback: frame.shield.immediateFeedback,
    immediateFeedbackDurationSec: frame.shield.immediateFeedbackDurationSec,
    nowSec,
    planet: frame.shield.planet,
    shieldRadius: frame.shield.shieldRadius,
    visual: visuals.shield,
  });

  syncSharedCombatPlayerWeaponPresentation({
    cannon: frame.weapon.cannon,
    cannonVisual: visuals.cannon,
    lockRing: frame.weapon.lockRing,
    lockRingVisual: visuals.lockRing,
  });

  syncSharedCombatBoostPresentation({
    activeBursts: frame.boost.activeBursts,
    aimTarget: frame.boost.aimTarget,
    boostVisual: visuals.boost,
    getBodyById: frame.boost.getBodyById,
    heldBoosting: frame.boost.heldBoosting,
    maxParticlesPerBurst: frame.boost.maxParticlesPerBurst,
    nowSec,
    playerBody: frame.boost.playerBody,
  });

  const gravityPulse = syncSharedCombatGravityPulsePresentation({
    durationSec: frame.gravityPulse.durationSec,
    nowSec,
    pulse: frame.gravityPulse.pulse,
    visibleWorldHeight: frame.gravityPulse.visibleWorldHeight,
    visual: visuals.gravityPulse,
    z: frame.gravityPulse.z,
  });

  syncSharedCombatBlackHoleVisual({
    blackHole: frame.blackHole,
    nowSec,
    visual: visuals.blackHole,
  });

  return {
    gravityPulse,
    shieldImmediateFeedback,
  };
};
