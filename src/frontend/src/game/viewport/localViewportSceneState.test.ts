import type { CombatSandboxState } from "../combatSandbox";
import type { CacheVisual } from "./cacheVisuals";
import type { LocalViewportCombatBlackHoleSwallowTracker } from "./localViewportCelestialSync";
import {
  createLocalViewportSceneState,
  resetLocalViewportSceneStateLookups,
  syncLocalViewportLaunchBurstsByKind,
} from "./localViewportSceneState";
import { describe, expect, it } from "vitest";

const weaponKinds = ["heavy", "light", "seeker"] as const;

const createTracker = (): LocalViewportCombatBlackHoleSwallowTracker => ({
  previousCachesById: new Map(),
  previousNeutronStarsById: new Map(),
  previousPlanetAliveById: new Map(),
  previousRocketsById: new Map(),
  previousSunsById: new Map(),
  previousSunSwallowedAtById: new Map(),
});

const createState = () =>
  createLocalViewportSceneState({
    blackHoleSwallowTracker: createTracker(),
    cacheVisuals: new Map<number, CacheVisual>(),
    maps: {
      neutronStarVisuals: new Map(),
      planetVisuals: new Map(),
      sunVisuals: new Map(),
    },
    renderedCacheKeysById: new Map(),
    weaponKinds,
  });

describe("localViewportSceneState", () => {
  it("groups launch bursts by weapon kind", () => {
    const sceneState = createState();
    const lightBurst = { rocketKind: "light" };
    const seekerBurst = { rocketKind: "seeker" };

    syncLocalViewportLaunchBurstsByKind({
      renderState: {
        launchBursts: [lightBurst, seekerBurst],
      } as CombatSandboxState,
      sceneState,
      weaponKinds,
    });

    expect(sceneState.launchBurstsByKind.light).toEqual([lightBurst]);
    expect(sceneState.launchBurstsByKind.seeker).toEqual([seekerBurst]);

    syncLocalViewportLaunchBurstsByKind({
      renderState: {
        launchBursts: [],
      } as unknown as CombatSandboxState,
      sceneState,
      weaponKinds,
    });

    expect(sceneState.launchBurstsByKind.light).toHaveLength(0);
    expect(sceneState.launchBurstsByKind.seeker).toHaveLength(0);
  });

  it("clears local lookup state without replacing owned maps", () => {
    const sceneState = createState();
    const originalHeavyLaunchBursts = sceneState.launchBurstsByKind.heavy;
    const originalHeavyRockets = sceneState.rocketsByKind.heavy;
    sceneState.activeCacheIds.add(1);
    sceneState.renderedCacheKeysById.set(1, "repair" as never);
    sceneState.rocketTrailStates.set(2, {} as never);
    sceneState.launchBurstsByKind.heavy.push({ rocketKind: "heavy" } as never);
    sceneState.rocketsByKind.heavy.push({ rocketKind: "heavy" } as never);

    resetLocalViewportSceneStateLookups({ sceneState, weaponKinds });

    expect(sceneState.activeCacheIds.size).toBe(0);
    expect(sceneState.renderedCacheKeysById.size).toBe(0);
    expect(sceneState.rocketTrailStates.size).toBe(0);
    expect(sceneState.launchBurstsByKind.heavy).toBe(originalHeavyLaunchBursts);
    expect(sceneState.launchBurstsByKind.heavy).toHaveLength(0);
    expect(sceneState.rocketsByKind.heavy).toBe(originalHeavyRockets);
    expect(sceneState.rocketsByKind.heavy).toHaveLength(0);
  });
});
