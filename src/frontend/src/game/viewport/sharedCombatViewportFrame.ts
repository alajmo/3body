import type { SharedCombatCacheBody } from "./cacheVisuals";
import type { SharedCombatEntityPresentationFrameState } from "./sharedCombatEntityPresentationFrame";
import { syncSharedCombatEntityPresentationFrame } from "./sharedCombatEntityPresentationFrame";
import type {
  SharedCombatPresentationFrameState,
  SharedCombatPresentationFrameVisuals,
} from "./sharedCombatPresentationFrame";
import { syncSharedCombatPresentationFrame } from "./sharedCombatPresentationFrame";
import type { SharedCombatRocketBody } from "./sharedCombatRocketPools";
import type { SharedCombatTransientPresentationFrameState } from "./sharedCombatTransientPresentation";
import { syncSharedCombatTransientPresentation } from "./sharedCombatTransientPresentation";

export interface SharedCombatViewportFrameState<
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  entity: SharedCombatEntityPresentationFrameState<CacheBody, Rocket>;
  presentation: SharedCombatPresentationFrameState;
  transient: SharedCombatTransientPresentationFrameState<Burst>;
}

export const syncSharedCombatViewportFrame = <
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
>({
  frame,
  nowSec,
  visuals,
}: {
  frame: SharedCombatViewportFrameState<CacheBody, Rocket, Burst>;
  nowSec: number;
  visuals: SharedCombatPresentationFrameVisuals;
}) => {
  syncSharedCombatEntityPresentationFrame({
    frame: frame.entity,
  });

  const presentationState = syncSharedCombatPresentationFrame({
    frame: frame.presentation,
    nowSec,
    visuals,
  });

  syncSharedCombatTransientPresentation(frame.transient);

  return presentationState;
};
