import type { SharedCombatCacheBody } from "./cacheVisuals";
import type {
  SharedCombatCachePresentationArgs,
  SharedCombatLaunchBurstPresentationArgs,
  SharedCombatRocketPresentationArgs,
} from "./sharedCombatEntityVisualSync";
import {
  syncSharedCombatCachePresentation,
  syncSharedCombatLaunchBurstPresentation,
  syncSharedCombatRocketPresentation,
} from "./sharedCombatEntityVisualSync";
import type { SharedCombatRocketBody } from "./sharedCombatRocketPools";

export interface SharedCombatEntityPresentationFrameState<
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
> {
  caches: SharedCombatCachePresentationArgs<CacheBody> | null;
  launchBursts: SharedCombatLaunchBurstPresentationArgs | null;
  rockets: SharedCombatRocketPresentationArgs<Rocket> | null;
}

export const syncSharedCombatEntityPresentationFrame = <
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
>({
  frame,
}: {
  frame: SharedCombatEntityPresentationFrameState<CacheBody, Rocket>;
}) => {
  if (frame.caches !== null) {
    syncSharedCombatCachePresentation(frame.caches);
  }
  if (frame.rockets !== null) {
    syncSharedCombatRocketPresentation(frame.rockets);
  }
  if (frame.launchBursts !== null) {
    syncSharedCombatLaunchBurstPresentation(frame.launchBursts);
  }
};
