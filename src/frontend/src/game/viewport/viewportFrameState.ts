import type { SharedCombatCacheBody } from "./cacheVisuals";
import type {
  SharedCombatCachePresentationArgs,
  SharedCombatLaunchBurstPresentationArgs,
  SharedCombatRocketPresentationArgs,
} from "./sharedCombatEntityVisualSync";
import type {
  SharedCombatPresentationFrameState,
  SharedCombatPresentationFrameVisuals,
} from "./sharedCombatPresentationFrame";
import type { SharedCombatRocketBody } from "./sharedCombatRocketPools";
import type {
  SharedCombatBlackHoleSwallowPresentationFrame,
  SharedCombatImpactBurstFrame,
  SharedCombatPlanetExplosionPresentationFrame,
} from "./sharedCombatTransientPresentation";

export type ViewportCacheFrameState<CacheBody extends SharedCombatCacheBody> =
  Pick<
    SharedCombatCachePresentationArgs<CacheBody>,
    | "blackHole"
    | "caches"
    | "nowSec"
    | "previousCachesById"
    | "queueSwallowEffect"
  >;

export type ViewportCacheSyncResources<
  CacheBody extends SharedCombatCacheBody,
> = Omit<
  SharedCombatCachePresentationArgs<CacheBody>,
  keyof ViewportCacheFrameState<CacheBody>
>;

export type ViewportLaunchBurstFrameState = Pick<
  SharedCombatLaunchBurstPresentationArgs,
  | "burstsByKind"
  | "cannonLayout"
  | "currentPlayerId"
  | "nowSec"
  | "worldUnitsPerPixel"
>;

export type ViewportLaunchBurstSyncResources = Omit<
  SharedCombatLaunchBurstPresentationArgs,
  keyof ViewportLaunchBurstFrameState
>;

export type ViewportRocketFrameState<
  Rocket extends SharedCombatRocketBody & { radius: number },
> = Pick<
  SharedCombatRocketPresentationArgs<Rocket>,
  "blackHole" | "nowSec" | "rockets"
>;

export type ViewportRocketSyncResources<
  Rocket extends SharedCombatRocketBody & { radius: number },
> = Omit<
  SharedCombatRocketPresentationArgs<Rocket>,
  keyof ViewportRocketFrameState<Rocket>
>;

export interface ViewportEntityFrameState<
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
> {
  caches: ViewportCacheFrameState<CacheBody> | null;
  launchBursts: ViewportLaunchBurstFrameState | null;
  rockets: ViewportRocketFrameState<Rocket> | null;
}

export interface ViewportEntitySyncResources<
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
> {
  caches: ViewportCacheSyncResources<CacheBody> | null;
  launchBursts: ViewportLaunchBurstSyncResources | null;
  rockets: ViewportRocketSyncResources<Rocket> | null;
}

export type ViewportImpactBurstFrameState<
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> = Pick<
  SharedCombatImpactBurstFrame<Burst>,
  "bursts" | "nowSec" | "resolveBurst"
>;

export type ViewportImpactBurstSyncResources<
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> = Omit<
  SharedCombatImpactBurstFrame<Burst>,
  keyof ViewportImpactBurstFrameState<Burst>
>;

export interface ViewportTransientFrameState<
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  impactBursts: ViewportImpactBurstFrameState<Burst>;
  nowSec: number;
}

export interface ViewportTransientSyncResources<
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  blackHoleSwallows: SharedCombatBlackHoleSwallowPresentationFrame;
  impactBursts: ViewportImpactBurstSyncResources<Burst>;
  planetExplosions: SharedCombatPlanetExplosionPresentationFrame;
}

export interface ViewportFrameState<
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  entity: ViewportEntityFrameState<CacheBody, Rocket>;
  presentation: SharedCombatPresentationFrameState;
  transient: ViewportTransientFrameState<Burst>;
}

export interface ViewportFrameResources<
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  entity: ViewportEntitySyncResources<CacheBody, Rocket>;
  presentation: SharedCombatPresentationFrameVisuals;
  transient: ViewportTransientSyncResources<Burst>;
}

export interface ViewportFrameBundle<
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  frame: ViewportFrameState<CacheBody, Rocket, Burst>;
  resources: ViewportFrameResources<CacheBody, Rocket, Burst>;
}
