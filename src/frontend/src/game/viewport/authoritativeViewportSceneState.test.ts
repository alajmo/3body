import type { PlanetPublic, World } from "@3body/shared";
import type { Object3D } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import type { CacheVisual } from "./cacheVisuals";
import {
  createAuthoritativeViewportSceneState,
  disposeAuthoritativeViewportSceneStateVisuals,
  resetAuthoritativeViewportSceneState,
  syncAuthoritativeViewportPlanetsById,
} from "./authoritativeViewportSceneState";

const rocketKinds = ["heavy", "light", "seeker"] as const;

const createPlanet = (id: number): PlanetPublic =>
  ({
    archetype: "terra",
    debuffs: {},
    hp: 100,
    id,
    kind: "planet",
    playerId: `player-${id}`,
    pos: { x: id, y: -id },
    radius: 18,
    shieldActive: false,
    shieldAimDir: { x: 1, y: 0 },
    shieldLoad: 0,
    shieldMaxLoad: 100,
    vel: { x: 0, y: 0 },
  }) satisfies PlanetPublic;

describe("authoritativeViewportSceneState", () => {
  it("indexes authoritative planets from the current world", () => {
    const state = createAuthoritativeViewportSceneState(rocketKinds);
    const planets = [createPlanet(1), createPlanet(2)];

    const planetsById = syncAuthoritativeViewportPlanetsById({
      state,
      world: {
        planets,
      } as World,
    });

    expect(planetsById.get(1)).toBe(planets[0]);
    expect(planetsById.get(2)).toBe(planets[1]);

    syncAuthoritativeViewportPlanetsById({ state, world: null });

    expect(state.authoritativePlanetsById.size).toBe(0);
  });

  it("clears owned maps, caches, and grouped rocket state on reset", () => {
    const state = createAuthoritativeViewportSceneState(rocketKinds);
    state.activeCacheIds.add(1);
    state.authoritativePlanetsById.set(1, createPlanet(1));
    state.cacheVisuals.set(1, {} as CacheVisual);
    state.maps.sunVisuals.set(1, {} as never);
    state.maps.neutronStarVisuals.set(2, {} as never);
    state.maps.planetVisuals.set(3, {} as never);
    state.previousState.previousCacheBodiesById.set(1, {
      pos: { x: 1, y: 2 },
      radius: 3,
    });
    state.previousState.previousNeutronStarsById.set(2, {} as never);
    state.previousState.previousRocketBodiesById.set(3, {} as never);
    state.previousState.previousSunBodiesById.set(4, {} as never);
    state.rocketTrailStates.set(5, {} as never);
    state.rocketsByKind.heavy.push({ rocketKind: "heavy" } as never);

    resetAuthoritativeViewportSceneState({ rocketKinds, state });

    expect(state.activeCacheIds.size).toBe(0);
    expect(state.authoritativePlanetsById.size).toBe(0);
    expect(state.cacheVisuals.size).toBe(0);
    expect(state.maps.sunVisuals.size).toBe(0);
    expect(state.maps.neutronStarVisuals.size).toBe(0);
    expect(state.maps.planetVisuals.size).toBe(0);
    expect(state.previousState.previousCacheBodiesById.size).toBe(0);
    expect(state.previousState.previousNeutronStarsById.size).toBe(0);
    expect(state.previousState.previousRocketBodiesById.size).toBe(0);
    expect(state.previousState.previousSunBodiesById.size).toBe(0);
    expect(state.rocketTrailStates.size).toBe(0);
    expect(state.rocketsByKind.heavy).toHaveLength(0);
  });

  it("removes cache visuals during visual disposal", () => {
    const state = createAuthoritativeViewportSceneState(rocketKinds);
    const group = {} as Object3D;
    const sceneRemoveSafe = vi.fn();
    state.cacheVisuals.set(1, { group } as CacheVisual);

    disposeAuthoritativeViewportSceneStateVisuals({
      sceneRemoveSafe,
      state,
    });

    expect(sceneRemoveSafe).toHaveBeenCalledWith(group);
  });
});
