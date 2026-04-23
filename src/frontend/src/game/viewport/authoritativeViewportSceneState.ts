import type { PlanetPublic, RocketKind, World } from "@3body/shared";
import type { Object3D } from "three/webgpu";
import type { CacheVisual, SharedCombatTrackedCacheBody } from "./cacheVisuals";
import type { SharedCombatTrackedRocketBody } from "./sharedCombatBlackHoleSwallowTracking";
import {
  disposeSharedCombatNeutronStarVisual,
  disposeSharedCombatSunVisual,
  type SharedCombatNeutronStarVisual as NeutronStarVisual,
  type SharedCombatSunVisual as SunVisual,
} from "./sharedCombatCelestialVisuals";
import type {
  SharedCombatTrackedNeutronStarBody,
  SharedCombatTrackedSunBody,
} from "./sharedCombatDynamicCelestialSync";
import {
  disposeSharedCombatPlanetVisual,
  type SharedCombatPlanetVisual as PlanetVisual,
} from "./sharedCombatPlanetVisuals";
import type { SharedCombatRocketTrailState } from "./sharedCombatRocketPools";

export interface AuthoritativeViewportSceneState {
  activeCacheIds: Set<number>;
  authoritativePlanetsById: Map<number, PlanetPublic>;
  cacheVisuals: Map<number, CacheVisual>;
  maps: {
    neutronStarVisuals: Map<number, NeutronStarVisual>;
    planetVisuals: Map<number, PlanetVisual>;
    sunVisuals: Map<number, SunVisual>;
  };
  previousState: {
    previousCacheBodiesById: Map<number, SharedCombatTrackedCacheBody>;
    previousNeutronStarsById: Map<number, SharedCombatTrackedNeutronStarBody>;
    previousRocketBodiesById: Map<number, SharedCombatTrackedRocketBody>;
    previousSunBodiesById: Map<number, SharedCombatTrackedSunBody>;
  };
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
  rocketsByKind: Record<RocketKind, Array<World["rockets"][number]>>;
}

export const createAuthoritativeViewportSceneState = (
  rocketKinds: readonly RocketKind[],
): AuthoritativeViewportSceneState => {
  const rocketsByKind: Record<RocketKind, Array<World["rockets"][number]>> = {
    heavy: [],
    light: [],
    seeker: [],
  };
  for (const rocketKind of rocketKinds) {
    rocketsByKind[rocketKind] = [];
  }

  return {
    activeCacheIds: new Set<number>(),
    authoritativePlanetsById: new Map<number, PlanetPublic>(),
    cacheVisuals: new Map<number, CacheVisual>(),
    maps: {
      neutronStarVisuals: new Map<number, NeutronStarVisual>(),
      planetVisuals: new Map<number, PlanetVisual>(),
      sunVisuals: new Map<number, SunVisual>(),
    },
    previousState: {
      previousCacheBodiesById: new Map<number, SharedCombatTrackedCacheBody>(),
      previousNeutronStarsById: new Map<
        number,
        SharedCombatTrackedNeutronStarBody
      >(),
      previousRocketBodiesById: new Map<
        number,
        SharedCombatTrackedRocketBody
      >(),
      previousSunBodiesById: new Map<number, SharedCombatTrackedSunBody>(),
    },
    rocketTrailStates: new Map<number, SharedCombatRocketTrailState>(),
    rocketsByKind,
  };
};

export const syncAuthoritativeViewportPlanetsById = ({
  state,
  world,
}: {
  state: AuthoritativeViewportSceneState;
  world: World | null;
}): ReadonlyMap<number, PlanetPublic> => {
  state.authoritativePlanetsById.clear();
  for (const planet of world?.planets ?? []) {
    state.authoritativePlanetsById.set(planet.id, planet);
  }

  return state.authoritativePlanetsById;
};

export const disposeAuthoritativeViewportSceneStateVisuals = ({
  sceneRemoveSafe,
  state,
}: {
  sceneRemoveSafe: (...objects: Object3D[]) => void;
  state: AuthoritativeViewportSceneState;
}) => {
  for (const visual of state.maps.sunVisuals.values()) {
    disposeSharedCombatSunVisual(visual);
  }
  for (const visual of state.maps.neutronStarVisuals.values()) {
    disposeSharedCombatNeutronStarVisual(visual);
  }
  for (const visual of state.maps.planetVisuals.values()) {
    disposeSharedCombatPlanetVisual(visual);
  }
  for (const visual of state.cacheVisuals.values()) {
    sceneRemoveSafe(visual.group);
  }
};

export const resetAuthoritativeViewportSceneState = ({
  rocketKinds,
  state,
}: {
  rocketKinds: readonly RocketKind[];
  state: AuthoritativeViewportSceneState;
}) => {
  state.maps.sunVisuals.clear();
  state.maps.neutronStarVisuals.clear();
  state.maps.planetVisuals.clear();
  state.cacheVisuals.clear();
  state.activeCacheIds.clear();
  state.authoritativePlanetsById.clear();
  state.previousState.previousCacheBodiesById.clear();
  state.previousState.previousNeutronStarsById.clear();
  state.previousState.previousRocketBodiesById.clear();
  state.previousState.previousSunBodiesById.clear();
  state.rocketTrailStates.clear();
  for (const rocketKind of rocketKinds) {
    state.rocketsByKind[rocketKind].length = 0;
  }
};
