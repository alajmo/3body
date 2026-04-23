import type { PlanetPublic, RocketKind, Vec2, World } from "@3body/shared";
import type { getCannonWorldLayout } from "../rocketVisibility";
import type {
  AuthoritativeImpactBurstState,
  ImmediateGravityPulseFeedbackState,
} from "./authoritativeCosmeticFeedback";
import type {
  CacheVisual,
  SharedCombatTrackedCacheBody,
  CacheIconKey,
  CacheSpriteMaterialMap,
} from "./cacheVisuals";
import type { SharedCombatTrackedRocketBody } from "./sharedCombatBlackHoleSwallowTracking";
import type { SharedCombatBoostBurstState } from "./sharedCombatBoostVisuals";
import type { SharedCombatLaunchBurstPoolVisual } from "./sharedCombatLaunchBurstPools";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";
import type {
  SharedCombatPresentationFrameState,
  SharedCombatPresentationFrameVisuals,
} from "./sharedCombatPresentationFrame";
import type {
  SharedCombatRocketPoolVisual,
  SharedCombatRocketTrailState,
} from "./sharedCombatRocketPools";
import type { SharedCombatImmediateShieldFeedbackState } from "./sharedCombatSupportVisuals";
import {
  buildSharedCombatViewportTransientBundle,
  type SharedCombatViewportTransientInput,
} from "./sharedCombatViewportTransients";
import type { ViewportFrameBundle } from "./viewportFrameState";

interface AuthoritativeViewportFrameRuntimeInput {
  activeBoostBursts: SharedCombatBoostBurstState[];
  activeImpactBursts: AuthoritativeImpactBurstState[];
  aimTarget: Vec2;
  blackHole: NonNullable<World["blackHole"]> | null;
  boostBurstParticlesPerBurst: number;
  boostHeld: boolean;
  cannonLayout: ReturnType<typeof getCannonWorldLayout>;
  currentPlayerId: string | null;
  getPlanetById: (planetId: number) => PlanetPublic | null;
  gravityPulseDurationSec: number;
  gravityPulseState: ImmediateGravityPulseFeedbackState | null;
  immediateShieldFeedbackDurationSec: number;
  nowSec: number;
  playerPlanet: PlanetPublic | null;
  previousCachesById: Map<number, SharedCombatTrackedCacheBody>;
  previousRocketsById: Map<number, SharedCombatTrackedRocketBody>;
  queueCacheSwallowEffect: (
    previousCache: SharedCombatTrackedCacheBody,
  ) => void;
  queueRocketSwallowEffect: (
    previousRocket: SharedCombatTrackedRocketBody,
  ) => void;
  shieldActive: boolean;
  shieldImmediateFeedback: SharedCombatImmediateShieldFeedbackState | null;
  visibleWorldHeight: number;
  weaponFrame: SharedCombatPresentationFrameState["weapon"];
  world: Pick<World, "caches" | "rockets"> | null;
  worldUnitsPerPixel: number;
}

interface AuthoritativeViewportFrameSyncInput {
  activeCacheIds: Set<number>;
  activeLaunchBurstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  badgeBaseSize: number;
  badgeMaterials: CacheSpriteMaterialMap;
  badgeScale: number;
  cacheVisuals: Map<number, CacheVisual>;
  createCacheVisual: (
    cache: World["caches"][number],
    badgeMaterials: CacheSpriteMaterialMap,
  ) => CacheVisual;
  getCacheIconKey: (
    contents: World["caches"][number]["contents"],
  ) => CacheIconKey;
  launchBurstBudget: number;
  launchBurstPools: Record<
    RocketKind,
    SharedCombatLaunchBurstPoolVisual
  > | null;
  maxRocketTrailSamples: number;
  presentationVisuals: SharedCombatPresentationFrameVisuals;
  rocketKinds: readonly RocketKind[];
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual> | null;
  rocketTrailBudget: number;
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
  rocketsByKind: Record<RocketKind, Array<World["rockets"][number]>>;
  scene: {
    add: (object: CacheVisual["group"]) => void;
    remove: (object: CacheVisual["group"]) => void;
  };
  updateCacheVisualBadge: (
    visual: CacheVisual,
    badgeMaterials: CacheSpriteMaterialMap,
    key: CacheIconKey,
  ) => void;
}

interface AuthoritativeViewportFrameAdapterParams {
  runtime: AuthoritativeViewportFrameRuntimeInput;
  sync: AuthoritativeViewportFrameSyncInput;
  transient: SharedCombatViewportTransientInput<AuthoritativeImpactBurstState>;
}

export const buildAuthoritativeViewportFrameBundle = ({
  runtime,
  sync,
  transient,
}: AuthoritativeViewportFrameAdapterParams) => {
  const transientBundle = buildSharedCombatViewportTransientBundle(transient);

  return {
    frame: {
      entity: {
        caches: {
          blackHole: runtime.blackHole,
          caches: runtime.world?.caches ?? [],
          nowSec: runtime.nowSec,
          previousCachesById: runtime.previousCachesById,
          queueSwallowEffect: runtime.queueCacheSwallowEffect,
        },
        launchBursts:
          sync.rocketPools !== null && sync.launchBurstPools !== null
            ? {
                burstsByKind: sync.activeLaunchBurstsByKind,
                cannonLayout: runtime.cannonLayout,
                currentPlayerId: runtime.currentPlayerId,
                nowSec: runtime.nowSec,
                worldUnitsPerPixel: runtime.worldUnitsPerPixel,
              }
            : null,
        rockets:
          sync.rocketPools !== null
            ? {
                blackHole: runtime.blackHole,
                nowSec: runtime.nowSec,
                rockets: runtime.world?.rockets ?? [],
              }
            : null,
      },
      presentation: {
        blackHole:
          runtime.blackHole === null
            ? null
            : {
                killRadius: runtime.blackHole.killRadius,
                pos: runtime.blackHole.pos,
                z: 5,
              },
        boost: {
          activeBursts: runtime.activeBoostBursts,
          aimTarget: runtime.aimTarget,
          getBodyById: runtime.getPlanetById,
          heldBoosting: runtime.boostHeld,
          maxParticlesPerBurst: runtime.boostBurstParticlesPerBurst,
          playerBody: runtime.playerPlanet,
        },
        gravityPulse: {
          durationSec: runtime.gravityPulseDurationSec,
          pulse: runtime.gravityPulseState,
          visibleWorldHeight: runtime.visibleWorldHeight,
          z: {
            core: 5.1,
            echo: 5.2,
            ring: 5.25,
          },
        },
        shield: {
          active: runtime.shieldActive,
          activeAimDir: runtime.playerPlanet?.shieldAimDir ?? null,
          bursts: runtime.activeImpactBursts,
          immediateFeedback: runtime.shieldImmediateFeedback,
          immediateFeedbackDurationSec:
            runtime.immediateShieldFeedbackDurationSec,
          planet: runtime.playerPlanet,
          shieldRadius: runtime.playerPlanet?.radius ?? 0,
        },
        weapon: runtime.weaponFrame,
      },
      transient: {
        ...transientBundle.frame,
      },
    },
    resources: {
      entity: {
        caches: {
          activeCacheIds: sync.activeCacheIds,
          badgeBaseSize: sync.badgeBaseSize,
          badgeMaterials: sync.badgeMaterials,
          badgeScale: sync.badgeScale,
          cacheVisuals: sync.cacheVisuals,
          createCacheVisual: sync.createCacheVisual,
          getCacheIconKey: sync.getCacheIconKey,
          scene: sync.scene,
          updateCacheVisualBadge: sync.updateCacheVisualBadge,
        },
        launchBursts:
          sync.rocketPools !== null && sync.launchBurstPools !== null
            ? {
                launchBurstBudget: sync.launchBurstBudget,
                launchBurstPools: sync.launchBurstPools,
                pruneBeforeSync: true,
                rocketKinds: sync.rocketKinds,
                rocketPools: sync.rocketPools,
              }
            : null,
        rockets:
          sync.rocketPools !== null
            ? {
                getSwallowMargin: (rocket) => Math.max(72, rocket.radius * 10),
                maxRocketTrailSamples: sync.maxRocketTrailSamples,
                previousRocketsById: runtime.previousRocketsById,
                queueSwallowEffect: runtime.queueRocketSwallowEffect,
                rocketKinds: sync.rocketKinds,
                rocketPools: sync.rocketPools,
                rocketTrailBudget: sync.rocketTrailBudget,
                rocketTrailStates: sync.rocketTrailStates,
                rocketsByKind: sync.rocketsByKind,
              }
            : null,
      },
      presentation: sync.presentationVisuals,
      transient: {
        ...transientBundle.resources,
      },
    },
  } satisfies ViewportFrameBundle<
    World["caches"][number],
    World["rockets"][number],
    AuthoritativeImpactBurstState
  >;
};
