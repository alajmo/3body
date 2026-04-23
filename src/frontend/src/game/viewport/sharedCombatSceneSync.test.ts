import { Group, Mesh } from "three/webgpu";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sceneSyncMocks = vi.hoisted(() => ({
  syncSharedCombatBackgroundParallax: vi.fn(),
  syncSharedCombatDynamicNeutronStarPresentation: vi.fn(),
  syncSharedCombatDynamicPlanetPresentation: vi.fn(),
  syncSharedCombatDynamicSunPresentation: vi.fn(),
  syncSharedCombatViewportFrame: vi.fn(),
}));

vi.mock("./sharedCombatBackgroundParallax", () => ({
  syncSharedCombatBackgroundParallax:
    sceneSyncMocks.syncSharedCombatBackgroundParallax,
}));

vi.mock("./sharedCombatDynamicCelestialSync", () => ({
  syncSharedCombatDynamicNeutronStarPresentation:
    sceneSyncMocks.syncSharedCombatDynamicNeutronStarPresentation,
  syncSharedCombatDynamicPlanetPresentation:
    sceneSyncMocks.syncSharedCombatDynamicPlanetPresentation,
  syncSharedCombatDynamicSunPresentation:
    sceneSyncMocks.syncSharedCombatDynamicSunPresentation,
}));

vi.mock("./sharedCombatViewportFrame", () => ({
  syncSharedCombatViewportFrame: sceneSyncMocks.syncSharedCombatViewportFrame,
}));

import { syncSharedCombatScene } from "./sharedCombatSceneSync";

describe("syncSharedCombatScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs background, celestials, then viewport frame in order", () => {
    const viewportState = {
      gravityPulse: { startedAtSec: 1 },
      shieldImmediateFeedback: null,
    };
    sceneSyncMocks.syncSharedCombatViewportFrame.mockReturnValue(viewportState);
    const viewportBundle = {
      frame: {
        entity: {
          caches: null,
          launchBursts: null,
          rockets: null,
        },
        presentation: {
          blackHole: null,
          boost: {
            activeBursts: [],
            aimTarget: { x: 0, y: 0 },
            heldBoosting: false,
            maxParticlesPerBurst: 0,
            playerBody: null,
          },
          gravityPulse: {
            durationSec: 0,
            pulse: null,
            visibleWorldHeight: 0,
            z: {
              core: 0,
              echo: 0,
              ring: 0,
            },
          },
          shield: {
            active: false,
            activeAimDir: null,
            bursts: [],
            planet: null,
            shieldRadius: 0,
          },
          weapon: {
            cannon: null,
            lockRing: null,
          },
        },
        transient: {
          impactBursts: {
            bursts: [],
            nowSec: 1,
            resolveBurst: () => null,
          },
          nowSec: 1,
        },
      },
      resources: {
        entity: {
          caches: null,
          launchBursts: null,
          rockets: null,
        },
        presentation: {
          blackHole: {
            group: new Group(),
            ringMesh: new Mesh(),
          },
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
      },
    };

    const result = syncSharedCombatScene({
      background: {
        backgroundLayers: [],
        nowSec: 1,
        renderCenterX: 2,
        renderCenterY: 3,
      },
      celestial: {
        neutronStar: {
          createVisual: vi.fn(),
          disposeVisual: vi.fn(),
          neutronStarVisuals: new Map(),
          neutronStars: [],
          nowSec: 1,
          previousNeutronStarsById: new Map(),
          syncVisual: vi.fn(),
        },
        planet: {
          createVisual: vi.fn(),
          disposeVisual: vi.fn(),
          planetVisuals: new Map(),
          planets: [],
          syncVisual: vi.fn(),
        },
        sun: {
          blackHole: null,
          createVisual: vi.fn(),
          currentNeutronStars: [],
          disposeVisual: vi.fn(),
          nowSec: 1,
          onSunAbsorbedByNeutronStar: vi.fn(),
          onSunSwallowedByBlackHole: vi.fn(),
          previousNeutronStarsById: new Map(),
          previousSunsById: new Map(),
          resolveSunProfile: vi.fn(),
          sunVisuals: new Map(),
          suns: [],
          syncVisual: vi.fn(),
        },
      },
      viewport: {
        bundle: viewportBundle,
      },
    });

    expect(
      sceneSyncMocks.syncSharedCombatBackgroundParallax,
    ).toHaveBeenCalled();
    expect(
      sceneSyncMocks.syncSharedCombatDynamicSunPresentation,
    ).toHaveBeenCalled();
    expect(
      sceneSyncMocks.syncSharedCombatDynamicNeutronStarPresentation,
    ).toHaveBeenCalled();
    expect(
      sceneSyncMocks.syncSharedCombatDynamicPlanetPresentation,
    ).toHaveBeenCalled();
    expect(sceneSyncMocks.syncSharedCombatViewportFrame).toHaveBeenCalledWith({
      frame: viewportBundle.frame,
      resources: viewportBundle.resources,
    });

    const backgroundOrder =
      sceneSyncMocks.syncSharedCombatBackgroundParallax.mock
        .invocationCallOrder[0]!;
    const sunOrder =
      sceneSyncMocks.syncSharedCombatDynamicSunPresentation.mock
        .invocationCallOrder[0]!;
    const neutronOrder =
      sceneSyncMocks.syncSharedCombatDynamicNeutronStarPresentation.mock
        .invocationCallOrder[0]!;
    const planetOrder =
      sceneSyncMocks.syncSharedCombatDynamicPlanetPresentation.mock
        .invocationCallOrder[0]!;
    const viewportOrder =
      sceneSyncMocks.syncSharedCombatViewportFrame.mock.invocationCallOrder[0]!;

    expect(backgroundOrder).toBeLessThan(sunOrder);
    expect(sunOrder).toBeLessThan(neutronOrder);
    expect(neutronOrder).toBeLessThan(planetOrder);
    expect(planetOrder).toBeLessThan(viewportOrder);
    expect(result).toBe(viewportState);
  });
});
