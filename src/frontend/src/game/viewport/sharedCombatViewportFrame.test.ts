import { beforeEach, describe, expect, it, vi } from "vitest";

const viewportFrameMocks = vi.hoisted(() => ({
  syncSharedCombatEntityPresentationFrame: vi.fn(),
  syncSharedCombatPresentationFrame: vi.fn(),
  syncSharedCombatTransientPresentation: vi.fn(),
}));

vi.mock("./sharedCombatEntityPresentationFrame", () => ({
  syncSharedCombatEntityPresentationFrame:
    viewportFrameMocks.syncSharedCombatEntityPresentationFrame,
}));

vi.mock("./sharedCombatPresentationFrame", () => ({
  syncSharedCombatPresentationFrame:
    viewportFrameMocks.syncSharedCombatPresentationFrame,
}));

vi.mock("./sharedCombatTransientPresentation", () => ({
  syncSharedCombatTransientPresentation:
    viewportFrameMocks.syncSharedCombatTransientPresentation,
}));

import { syncSharedCombatViewportFrame } from "./sharedCombatViewportFrame";

describe("syncSharedCombatViewportFrame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs entity, presentation, and transient slices in order", () => {
    const presentationState = {
      gravityPulse: { startedAtSec: 1 },
      shieldImmediateFeedback: { startedAtSec: 2 },
    };
    viewportFrameMocks.syncSharedCombatPresentationFrame.mockReturnValue(
      presentationState,
    );

    const frame = {
      entity: {
        caches: {
          blackHole: null,
          caches: [],
          nowSec: 1,
          previousCachesById: new Map(),
          queueSwallowEffect: vi.fn(),
        },
        launchBursts: {
          burstsByKind: {
            heavy: [],
            light: [],
            seeker: [],
          },
          cannonLayout: {
            flashDurationSec: 0.2,
          },
          currentPlayerId: null,
          nowSec: 1,
          worldUnitsPerPixel: 2,
        },
        rockets: {
          blackHole: null,
          nowSec: 1,
          rockets: [],
        },
      },
      presentation: { weapon: { cannon: null, lockRing: null } },
      transient: {
        impactBursts: {
          bursts: [],
          nowSec: 0.75,
          resolveBurst: () => null,
        },
        nowSec: 1,
      },
    };
    const resources = {
      entity: {
        caches: {
          activeCacheIds: new Set<number>(),
          badgeBaseSize: 12,
          badgeMaterials: {},
          badgeScale: 1,
          cacheVisuals: new Map(),
          createCacheVisual: vi.fn(),
          disposeCacheVisual: vi.fn(),
          getCacheIconKey: vi.fn(),
          renderedCacheKeysById: new Map(),
          scene: {
            add: vi.fn(),
            remove: vi.fn(),
          },
          updateCacheVisualBadge: vi.fn(),
        },
        launchBursts: {
          launchBurstBudget: 1,
          launchBurstPools: {
            heavy: {},
            light: {},
            seeker: {},
          },
          pruneBeforeSync: true,
          rocketKinds: ["heavy", "light", "seeker"],
          rocketPools: {
            heavy: {},
            light: {},
            seeker: {},
          },
        },
        rockets: {
          getSwallowMargin: () => 1,
          maxRocketTrailSamples: 2,
          previousRocketsById: new Map(),
          queueSwallowEffect: vi.fn(),
          rocketKinds: ["heavy", "light", "seeker"],
          rocketPools: {
            heavy: {},
            light: {},
            seeker: {},
          },
          rocketTrailBudget: 1,
          rocketTrailStates: new Map(),
          rocketsByKind: {
            heavy: [],
            light: [],
            seeker: [],
          },
        },
      },
      presentation: {
        blackHole: { group: {}, ringMesh: {} },
        boost: null,
        cannon: null,
        gravityPulse: null,
        lockRing: null,
        shield: null,
      },
      transient: {
        blackHoleSwallows: {
          activeEffects: [],
          inactiveVisuals: [],
        },
        impactBursts: {
          maxVisibleBursts: 0,
          visuals: [],
          z: {
            core: 1,
            glow: 2,
            ring: 3,
          },
        },
        planetExplosions: {
          activePlanetExplosions: [],
          inactivePlanetExplosionVisuals: [],
        },
      },
    };

    const result = syncSharedCombatViewportFrame({
      frame: frame as never,
      resources: resources as never,
    });

    expect(
      viewportFrameMocks.syncSharedCombatEntityPresentationFrame,
    ).toHaveBeenCalledWith({
      frame: {
        caches: {
          ...resources.entity.caches,
          ...frame.entity.caches,
        },
        launchBursts: {
          ...resources.entity.launchBursts,
          ...frame.entity.launchBursts,
        },
        rockets: {
          ...resources.entity.rockets,
          ...frame.entity.rockets,
        },
      },
    });
    expect(
      viewportFrameMocks.syncSharedCombatPresentationFrame,
    ).toHaveBeenCalledWith({
      frame: frame.presentation,
      nowSec: 1,
      visuals: resources.presentation,
    });
    expect(
      viewportFrameMocks.syncSharedCombatTransientPresentation,
    ).toHaveBeenCalledWith({
      blackHoleSwallows: resources.transient.blackHoleSwallows,
      impactBursts: {
        ...resources.transient.impactBursts,
        ...frame.transient.impactBursts,
      },
      nowSec: frame.transient.nowSec,
      planetExplosions: resources.transient.planetExplosions,
    });
    const entityCallOrder =
      viewportFrameMocks.syncSharedCombatEntityPresentationFrame.mock
        .invocationCallOrder[0];
    const presentationCallOrder =
      viewportFrameMocks.syncSharedCombatPresentationFrame.mock
        .invocationCallOrder[0];
    const transientCallOrder =
      viewportFrameMocks.syncSharedCombatTransientPresentation.mock
        .invocationCallOrder[0];
    expect(entityCallOrder).toBeDefined();
    expect(presentationCallOrder).toBeDefined();
    expect(transientCallOrder).toBeDefined();
    expect(entityCallOrder!).toBeLessThan(presentationCallOrder!);
    expect(presentationCallOrder!).toBeLessThan(transientCallOrder!);
    expect(result).toBe(presentationState);
  });
});
