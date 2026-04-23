import type { SharedCombatCacheBody } from "./cacheVisuals";
import { syncSharedCombatEntityPresentationFrame } from "./sharedCombatEntityPresentationFrame";
import { syncSharedCombatPresentationFrame } from "./sharedCombatPresentationFrame";
import type { SharedCombatRocketBody } from "./sharedCombatRocketPools";
import { syncSharedCombatTransientPresentation } from "./sharedCombatTransientPresentation";
import type {
  ViewportFrameResources,
  ViewportFrameState,
} from "./viewportFrameState";

type SharedCombatViewportFrameState<
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> = ViewportFrameState<CacheBody, Rocket, Burst>;

export const syncSharedCombatViewportFrame = <
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
>({
  frame,
  resources,
}: {
  frame: SharedCombatViewportFrameState<CacheBody, Rocket, Burst>;
  resources: ViewportFrameResources<CacheBody, Rocket, Burst>;
}) => {
  const nowSec = frame.transient.nowSec;

  syncSharedCombatEntityPresentationFrame({
    frame: {
      caches:
        frame.entity.caches === null || resources.entity.caches === null
          ? null
          : {
              ...resources.entity.caches,
              ...frame.entity.caches,
            },
      launchBursts:
        frame.entity.launchBursts === null ||
        resources.entity.launchBursts === null
          ? null
          : {
              ...resources.entity.launchBursts,
              ...frame.entity.launchBursts,
            },
      rockets:
        frame.entity.rockets === null || resources.entity.rockets === null
          ? null
          : {
              ...resources.entity.rockets,
              ...frame.entity.rockets,
            },
    },
  });

  const presentationState = syncSharedCombatPresentationFrame({
    frame: frame.presentation,
    nowSec,
    visuals: resources.presentation,
  });

  syncSharedCombatTransientPresentation({
    blackHoleSwallows: resources.transient.blackHoleSwallows,
    impactBursts: {
      ...resources.transient.impactBursts,
      ...frame.transient.impactBursts,
    },
    nowSec: frame.transient.nowSec,
    planetExplosions: resources.transient.planetExplosions,
  });

  return presentationState;
};
