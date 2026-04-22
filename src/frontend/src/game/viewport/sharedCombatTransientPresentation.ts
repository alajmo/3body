import {
  type BlackHoleSwallowState,
  type BlackHoleSwallowVisual,
  updateBlackHoleSwallowEffects,
} from "./blackHoleVisuals";
import {
  syncSharedCombatImpactBurstPool,
  styleSharedCombatImpactBurstVisual,
  type SharedCombatImpactBurstDepths,
  type SharedCombatResolvedImpactBurst,
} from "./sharedCombatImpactBursts";
import {
  type SharedCombatPlanetExplosionState,
  type SharedCombatPlanetExplosionVisual,
  updateSharedCombatPlanetExplosions,
} from "./sharedCombatPlanetExplosions";
import type { SharedCombatImpactBurstVisual } from "./sharedCombatSceneResources";

export interface SharedCombatImpactBurstFrame<
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  bursts: readonly Burst[];
  maxVisibleBursts: number;
  nowSec: number;
  resolveBurst: (burst: Burst) => SharedCombatResolvedImpactBurst | null;
  visuals: readonly SharedCombatImpactBurstVisual[];
  z: SharedCombatImpactBurstDepths;
}

export interface SharedCombatBlackHoleSwallowPresentationFrame {
  activeEffects: BlackHoleSwallowState[];
  inactiveVisuals: BlackHoleSwallowVisual[];
}

export interface SharedCombatPlanetExplosionPresentationFrame {
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
}

export interface SharedCombatTransientPresentationFrameState<
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  blackHoleSwallows: SharedCombatBlackHoleSwallowPresentationFrame;
  impactBursts: SharedCombatImpactBurstFrame<Burst>;
  nowSec: number;
  planetExplosions: SharedCombatPlanetExplosionPresentationFrame;
}

export const syncSharedCombatImpactBurstFrame = <
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
>({
  bursts,
  maxVisibleBursts,
  nowSec,
  resolveBurst,
  visuals,
  z,
}: SharedCombatImpactBurstFrame<Burst>) => {
  syncSharedCombatImpactBurstPool({
    bursts,
    maxVisibleBursts,
    nowSec,
    resolveBurst,
    styleBurstVisual: ({ burst, visual }) => {
      styleSharedCombatImpactBurstVisual({
        absorbedByShield: burst.absorbedByShield,
        burstColor: burst.color,
        visual,
      });
    },
    visuals,
    z,
  });
};

export const syncSharedCombatTransientPresentation = <
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
>({
  blackHoleSwallows,
  impactBursts,
  nowSec,
  planetExplosions,
}: SharedCombatTransientPresentationFrameState<Burst>) => {
  syncSharedCombatImpactBurstFrame(impactBursts);
  updateBlackHoleSwallowEffects({
    activeEffects: blackHoleSwallows.activeEffects,
    inactiveVisuals: blackHoleSwallows.inactiveVisuals,
    nowSec,
  });
  updateSharedCombatPlanetExplosions({
    activePlanetExplosions: planetExplosions.activePlanetExplosions,
    elapsedSec: nowSec,
    inactivePlanetExplosionVisuals:
      planetExplosions.inactivePlanetExplosionVisuals,
  });
};
