import type { RocketKind } from "@3body/shared";
import type { CombatSandboxRocket, CombatSandboxState } from "../combatSandbox";
import type { CacheIconKey, CacheVisual } from "./cacheVisuals";
import type { LocalViewportCombatBlackHoleSwallowTracker } from "./localViewportCelestialSync";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";
import type {
  SharedCombatNeutronStarVisual as NeutronStarVisual,
  SharedCombatSunVisual as SunVisual,
} from "./sharedCombatCelestialVisuals";
import type { SharedCombatPlanetVisual as PlanetVisual } from "./sharedCombatPlanetVisuals";
import type { SharedCombatRocketTrailState } from "./sharedCombatRocketPools";

export interface LocalViewportSceneVisualMaps {
  neutronStarVisuals: Map<number, NeutronStarVisual>;
  planetVisuals: Map<number, PlanetVisual>;
  sunVisuals: Map<number, SunVisual>;
}

export interface LocalViewportSceneState {
  activeCacheIds: Set<number>;
  blackHoleSwallowTracker: LocalViewportCombatBlackHoleSwallowTracker;
  cacheVisuals: Map<number, CacheVisual>;
  launchBurstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  maps: LocalViewportSceneVisualMaps;
  renderedCacheKeysById: Map<number, CacheIconKey>;
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
  rocketsByKind: Record<RocketKind, CombatSandboxRocket[]>;
}

export const createLocalViewportSceneState = ({
  blackHoleSwallowTracker,
  cacheVisuals,
  maps,
  renderedCacheKeysById,
  weaponKinds,
}: {
  blackHoleSwallowTracker: LocalViewportCombatBlackHoleSwallowTracker;
  cacheVisuals: Map<number, CacheVisual>;
  maps: LocalViewportSceneVisualMaps;
  renderedCacheKeysById: Map<number, CacheIconKey>;
  weaponKinds: readonly RocketKind[];
}): LocalViewportSceneState => {
  const launchBurstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]> =
    {
      heavy: [],
      light: [],
      seeker: [],
    };
  const rocketsByKind: Record<RocketKind, CombatSandboxRocket[]> = {
    heavy: [],
    light: [],
    seeker: [],
  };
  for (const rocketKind of weaponKinds) {
    launchBurstsByKind[rocketKind] = [];
    rocketsByKind[rocketKind] = [];
  }

  return {
    activeCacheIds: new Set<number>(),
    blackHoleSwallowTracker,
    cacheVisuals,
    launchBurstsByKind,
    maps,
    renderedCacheKeysById,
    rocketTrailStates: new Map<number, SharedCombatRocketTrailState>(),
    rocketsByKind,
  };
};

export const syncLocalViewportLaunchBurstsByKind = ({
  renderState,
  sceneState,
  weaponKinds,
}: {
  renderState: CombatSandboxState;
  sceneState: LocalViewportSceneState;
  weaponKinds: readonly RocketKind[];
}) => {
  for (const rocketKind of weaponKinds) {
    sceneState.launchBurstsByKind[rocketKind].length = 0;
  }
  for (const burst of renderState.launchBursts) {
    sceneState.launchBurstsByKind[burst.rocketKind].push(burst);
  }
};

export const resetLocalViewportSceneStateLookups = ({
  sceneState,
  weaponKinds,
}: {
  sceneState: LocalViewportSceneState;
  weaponKinds: readonly RocketKind[];
}) => {
  sceneState.activeCacheIds.clear();
  sceneState.renderedCacheKeysById.clear();
  sceneState.rocketTrailStates.clear();
  for (const rocketKind of weaponKinds) {
    sceneState.launchBurstsByKind[rocketKind].length = 0;
    sceneState.rocketsByKind[rocketKind].length = 0;
  }
};
