import { describe, expect, it } from "vitest";
import type { CacheVisual } from "./cacheVisuals";
import { syncSharedCombatCacheVisuals } from "./cacheVisuals";
import {
  isWithinSharedCombatBlackHoleSwallowBand,
  queueSharedCombatRemovedCacheSwallowEffects,
  queueSharedCombatRemovedRocketSwallowEffects,
  syncSharedCombatTrackedCaches,
  syncSharedCombatTrackedRockets,
} from "./sharedCombatBlackHoleSwallowTracking";

const createMockCacheVisual = (key = "repair"): CacheVisual => {
  const position = {
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
    x: 0,
    y: 0,
    z: 0,
  };
  const scale = {
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
    x: 0,
    y: 0,
    z: 0,
  };

  return {
    badgeSprite: {
      scale,
    } as CacheVisual["badgeSprite"],
    bobPhase: 0,
    group: {
      position,
      rotation: { z: 0 },
    } as CacheVisual["group"],
    key: key as CacheVisual["key"],
    pulseRate: 0,
    wobbleRate: 0,
  };
};

describe("syncSharedCombatCacheVisuals", () => {
  it("adds, updates, and removes cache visuals through one shared path", () => {
    const activeCacheIds = new Set<number>();
    const cacheVisuals = new Map<number, CacheVisual>();
    const renderedCacheKeysById = new Map<number, string>();
    const added: CacheVisual["group"][] = [];
    const removed: CacheVisual["group"][] = [];
    const disposed: CacheVisual[] = [];
    const created: number[] = [];

    syncSharedCombatCacheVisuals({
      activeCacheIds,
      badgeBaseSize: 80,
      badgeMaterials: {} as never,
      badgeScale: 1,
      cacheVisuals,
      caches: [
        {
          contents: { kind: "repair" } as const,
          id: 7,
          pos: { x: 20, y: 30 },
          radius: 12,
        },
      ],
      createCacheVisual: (cache) => {
        created.push(cache.id);
        return createMockCacheVisual();
      },
      disposeCacheVisual: (visual) => {
        disposed.push(visual);
      },
      getCacheIconKey: (contents) => contents.kind,
      nowSec: 0,
      renderedCacheKeysById: renderedCacheKeysById as Map<number, never>,
      scene: {
        add(object) {
          added.push(object);
        },
        remove(object) {
          removed.push(object);
        },
      },
      updateCacheVisualBadge: (visual, _badgeMaterials, key) => {
        visual.key = key;
      },
    });

    const visual = cacheVisuals.get(7)!;
    expect(created).toEqual([7]);
    expect(added).toHaveLength(1);
    expect(activeCacheIds.has(7)).toBe(true);
    expect(renderedCacheKeysById.get(7)).toBe("repair");
    expect(visual.group.position.x).toBe(20);
    expect(visual.group.position.y).toBe(30);
    expect(visual.group.position.z).toBe(3.5);
    expect(visual.badgeSprite.scale.x).toBeCloseTo(76);
    expect(visual.badgeSprite.scale.y).toBeCloseTo(76);

    syncSharedCombatCacheVisuals({
      activeCacheIds,
      badgeBaseSize: 80,
      badgeMaterials: {} as never,
      badgeScale: 1,
      cacheVisuals,
      caches: [],
      createCacheVisual: () => createMockCacheVisual(),
      disposeCacheVisual: (nextVisual) => {
        disposed.push(nextVisual);
      },
      getCacheIconKey: () => "repair",
      nowSec: 0,
      renderedCacheKeysById: renderedCacheKeysById as Map<number, never>,
      scene: {
        add() {},
        remove(object) {
          removed.push(object);
        },
      },
      updateCacheVisualBadge: () => {},
    });

    expect(cacheVisuals.size).toBe(0);
    expect(renderedCacheKeysById.size).toBe(0);
    expect(removed).toHaveLength(1);
    expect(disposed).toHaveLength(1);
  });
});

describe("shared cache swallow helpers", () => {
  it("checks the black-hole swallow band consistently", () => {
    expect(
      isWithinSharedCombatBlackHoleSwallowBand({
        blackHole: {
          killRadius: 100,
          pos: { x: 0, y: 0 },
        },
        margin: 20,
        pos: { x: 119, y: 0 },
      }),
    ).toBe(true);
    expect(
      isWithinSharedCombatBlackHoleSwallowBand({
        blackHole: {
          killRadius: 100,
          pos: { x: 0, y: 0 },
        },
        margin: 20,
        pos: { x: 121, y: 0 },
      }),
    ).toBe(false);
  });

  it("queues swallow effects only for removed caches that vanish near the hole", () => {
    const previousCachesById = new Map<
      number,
      { pos: { x: number; y: number }; radius: number }
    >();
    syncSharedCombatTrackedCaches({
      caches: [
        { id: 1, pos: { x: 90, y: 0 }, radius: 8 },
        { id: 2, pos: { x: 180, y: 0 }, radius: 8 },
      ],
      previousCachesById,
    });

    const swallowed: number[] = [];
    queueSharedCombatRemovedCacheSwallowEffects({
      activeCacheIds: new Set([2]),
      blackHole: {
        killRadius: 100,
        pos: { x: 0, y: 0 },
      },
      previousCachesById,
      queueEffect: (cache) => {
        swallowed.push(cache.radius);
      },
    });

    expect(swallowed).toEqual([8]);
  });

  it("queues swallow effects only for removed rockets that vanish near the hole", () => {
    const previousRocketsById = new Map<
      number,
      { pos: { x: number; y: number }; radius: number }
    >();
    syncSharedCombatTrackedRockets({
      previousRocketsById,
      rockets: [
        { id: 1, pos: { x: 95, y: 0 }, radius: 6 },
        { id: 2, pos: { x: 220, y: 0 }, radius: 6 },
      ],
    });

    const swallowed: number[] = [];
    queueSharedCombatRemovedRocketSwallowEffects({
      activeRocketIds: new Set([2]),
      blackHole: {
        killRadius: 100,
        pos: { x: 0, y: 0 },
      },
      getMargin: (rocket) => Math.max(72, rocket.radius * 10),
      previousRocketsById,
      queueEffect: (rocket) => {
        swallowed.push(rocket.radius);
      },
    });

    expect(swallowed).toEqual([6]);
  });
});
