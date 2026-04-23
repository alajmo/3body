import type { RocketKind, Vec2 } from "@3body/shared";
import type {
  CombatSandboxCache,
  CombatSandboxPlanet,
  CombatSandboxRocket,
  CombatSandboxState,
} from "../combatSandbox";
import type { getCannonWorldLayout } from "../rocketVisibility";
import type {
  CacheIconKey,
  CacheSpriteAssets,
  CacheVisual,
  SharedCombatTrackedCacheBody,
} from "./cacheVisuals";
import type { LocalSandboxGravityPulseState } from "./localSandboxSimulation";
import type { SharedCombatBoostBurstState } from "./sharedCombatBoostVisuals";
import type { SharedCombatTrackedRocketBody } from "./sharedCombatBlackHoleSwallowTracking";
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
import {
  buildSharedCombatViewportTransientBundle,
  type SharedCombatViewportTransientInput,
} from "./sharedCombatViewportTransients";
import type { ViewportFrameBundle } from "./viewportFrameState";

interface LocalViewportFrameRuntimeInput {
  activeBoostBursts: SharedCombatBoostBurstState[];
  activeGravityPulse: LocalSandboxGravityPulseState | null;
  blackHole: CombatSandboxState["blackHole"];
  boostBurstParticlesPerBurst: number;
  cannonLayout: ReturnType<typeof getCannonWorldLayout>;
  gravityPulseDurationSec: number;
  inputAimWorld: Vec2;
  launchBurstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  nowSec: number;
  playerBoostHeld: boolean;
  playerPlanet: CombatSandboxPlanet | null;
  previousCachesById: Map<number, SharedCombatTrackedCacheBody>;
  previousRocketsById: Map<number, SharedCombatTrackedRocketBody>;
  queueCacheSwallowEffect: (
    previousCache: SharedCombatTrackedCacheBody,
  ) => void;
  queueRocketSwallowEffect: (
    previousRocket: SharedCombatTrackedRocketBody,
  ) => void;
  renderElapsedSec: number;
  renderPlanetsById: ReadonlyMap<number, CombatSandboxPlanet>;
  renderState: Pick<
    CombatSandboxState,
    "caches" | "impactBursts" | "player" | "rockets"
  >;
  shieldActive: boolean;
  shieldRadius: number;
  visibleWorldHeight: number;
  weaponFrame: SharedCombatPresentationFrameState["weapon"];
  worldUnitsPerPixel: number;
}

interface LocalViewportFrameSyncInput {
  activeCacheIds: Set<number>;
  cacheBadgeBaseSize: number;
  cacheBadgeScale: number;
  cacheSpriteAssets: CacheSpriteAssets;
  cacheVisuals: Map<number, CacheVisual>;
  createCacheVisual: (
    cache: CombatSandboxCache,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
  ) => CacheVisual;
  disposeCacheVisual: (visual: CacheVisual) => void;
  getCacheIconKey: (contents: CombatSandboxCache["contents"]) => CacheIconKey;
  launchBurstBudget: number;
  maxRocketTrailSamples: number;
  presentationVisuals: SharedCombatPresentationFrameVisuals;
  renderedCacheKeysById: Map<number, CacheIconKey>;
  rocketKinds: readonly RocketKind[];
  rocketLaunchBurstPools: Record<RocketKind, SharedCombatLaunchBurstPoolVisual>;
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual>;
  rocketTrailBudget: number;
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
  rocketsByKind: Record<RocketKind, CombatSandboxRocket[]>;
  scene: {
    add: (object: CacheVisual["group"]) => void;
    remove: (object: CacheVisual["group"]) => void;
  };
  updateCacheVisualBadge: (
    visual: CacheVisual,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
    key: CacheIconKey,
  ) => void;
}

interface LocalViewportFrameAdapterParams {
  runtime: LocalViewportFrameRuntimeInput;
  sync: LocalViewportFrameSyncInput;
  transient: SharedCombatViewportTransientInput<
    CombatSandboxState["impactBursts"][number]
  >;
}

export const buildLocalViewportFrameBundle = ({
  runtime,
  sync,
  transient,
}: LocalViewportFrameAdapterParams) => {
  const transientBundle = buildSharedCombatViewportTransientBundle(transient);

  return {
    frame: {
      entity: {
        caches: {
          blackHole: runtime.blackHole,
          caches: runtime.renderState.caches,
          nowSec: runtime.nowSec,
          previousCachesById: runtime.previousCachesById,
          queueSwallowEffect: runtime.queueCacheSwallowEffect,
        },
        launchBursts: {
          burstsByKind: runtime.launchBurstsByKind,
          cannonLayout: runtime.cannonLayout,
          currentPlayerId: runtime.renderState.player.playerId,
          nowSec: runtime.renderElapsedSec,
          worldUnitsPerPixel: runtime.worldUnitsPerPixel,
        },
        rockets: {
          blackHole: runtime.blackHole,
          nowSec: runtime.nowSec,
          rockets: runtime.renderState.rockets,
        },
      },
      presentation: {
        blackHole:
          runtime.blackHole === null
            ? null
            : {
                killRadius: runtime.blackHole.killRadius,
                pos: runtime.blackHole.pos,
                z: 4,
              },
        boost: {
          activeBursts: runtime.activeBoostBursts,
          aimTarget: runtime.inputAimWorld,
          getBodyById: (planetId) =>
            runtime.renderPlanetsById.get(planetId) ?? null,
          heldBoosting: runtime.playerBoostHeld,
          maxParticlesPerBurst: runtime.boostBurstParticlesPerBurst,
          playerBody: runtime.playerPlanet,
        },
        gravityPulse: {
          durationSec: runtime.gravityPulseDurationSec,
          pulse: runtime.activeGravityPulse,
          visibleWorldHeight: runtime.visibleWorldHeight,
          z: {
            core: 2.2,
            echo: 2.3,
            ring: 2.35,
          },
        },
        shield: {
          active: runtime.shieldActive,
          activeAimDir: runtime.renderState.player.shieldAimDir,
          bursts: runtime.renderState.impactBursts,
          planet: runtime.playerPlanet,
          shieldRadius: runtime.shieldRadius,
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
          badgeBaseSize: sync.cacheBadgeBaseSize,
          badgeMaterials: sync.cacheSpriteAssets.badgeMaterials,
          badgeScale: sync.cacheBadgeScale,
          cacheVisuals: sync.cacheVisuals,
          createCacheVisual: sync.createCacheVisual,
          disposeCacheVisual: sync.disposeCacheVisual,
          getCacheIconKey: sync.getCacheIconKey,
          renderedCacheKeysById: sync.renderedCacheKeysById,
          scene: sync.scene,
          updateCacheVisualBadge: sync.updateCacheVisualBadge,
        },
        launchBursts: {
          launchBurstBudget: sync.launchBurstBudget,
          launchBurstPools: sync.rocketLaunchBurstPools,
          rocketKinds: sync.rocketKinds,
          rocketPools: sync.rocketPools,
        },
        rockets: {
          getSwallowMargin: (rocket) => Math.max(64, rocket.radius * 9),
          maxRocketTrailSamples: sync.maxRocketTrailSamples,
          previousRocketsById: runtime.previousRocketsById,
          queueSwallowEffect: runtime.queueRocketSwallowEffect,
          rocketKinds: sync.rocketKinds,
          rocketPools: sync.rocketPools,
          rocketTrailBudget: sync.rocketTrailBudget,
          rocketTrailStates: sync.rocketTrailStates,
          rocketsByKind: sync.rocketsByKind,
        },
      },
      presentation: sync.presentationVisuals,
      transient: {
        ...transientBundle.resources,
      },
    },
  } satisfies ViewportFrameBundle<
    CombatSandboxCache,
    CombatSandboxRocket,
    CombatSandboxState["impactBursts"][number]
  >;
};
