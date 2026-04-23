import type {
  SharedCombatBlackHoleSwallowPresentationFrame,
  SharedCombatImpactBurstFrame,
  SharedCombatPlanetExplosionPresentationFrame,
} from "./sharedCombatTransientPresentation";
import type {
  ViewportTransientFrameState,
  ViewportTransientSyncResources,
} from "./viewportFrameState";

export interface SharedCombatViewportTransientInput<
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

interface SharedCombatViewportTransientBundle<
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  frame: ViewportTransientFrameState<Burst>;
  resources: ViewportTransientSyncResources<Burst>;
}

export const buildSharedCombatViewportTransientBundle = <
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
>({
  blackHoleSwallows,
  impactBursts,
  nowSec,
  planetExplosions,
}: SharedCombatViewportTransientInput<Burst>): SharedCombatViewportTransientBundle<Burst> => ({
  frame: {
    impactBursts: {
      bursts: impactBursts.bursts,
      nowSec: impactBursts.nowSec,
      resolveBurst: impactBursts.resolveBurst,
    },
    nowSec,
  },
  resources: {
    blackHoleSwallows,
    impactBursts: {
      maxVisibleBursts: impactBursts.maxVisibleBursts,
      visuals: impactBursts.visuals,
      z: impactBursts.z,
    },
    planetExplosions,
  },
});
