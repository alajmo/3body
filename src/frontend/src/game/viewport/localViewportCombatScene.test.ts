import type {
  CombatSandboxPlanet,
  CombatSandboxState,
} from "../combatSandbox";
import type { Group, Mesh } from "three/webgpu";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateLocalViewportCombatSceneParams } from "./localViewportCombatScene";

const localCombatSceneMocks = vi.hoisted(() => ({
  buildLocalViewportFrameBundle: vi.fn(),
  getCannonWorldLayout: vi.fn(),
  getLocalSandboxLockProgress: vi.fn(),
  syncSharedCombatScene: vi.fn(),
}));

vi.mock("../rocketVisibility", () => ({
  getCannonWorldLayout: localCombatSceneMocks.getCannonWorldLayout,
}));

vi.mock("./localSandboxSimulation", async () => {
  const actual = await vi.importActual("./localSandboxSimulation");
  return {
    ...actual,
    getLocalSandboxLockProgress:
      localCombatSceneMocks.getLocalSandboxLockProgress,
  };
});

vi.mock("./localViewportFrameAdapter", () => ({
  buildLocalViewportFrameBundle: localCombatSceneMocks.buildLocalViewportFrameBundle,
}));

vi.mock("./sharedCombatSceneSync", async () => {
  const actual = await vi.importActual("./sharedCombatSceneSync");
  return {
    ...actual,
    syncSharedCombatScene: localCombatSceneMocks.syncSharedCombatScene,
  };
});

import { updateLocalViewportCombatScene } from "./localViewportCombatScene";

const createPlanet = (
  overrides: Partial<CombatSandboxPlanet> = {},
): CombatSandboxPlanet =>
  ({
    alive: true,
    angularVel: 0,
    archetype: "terran",
    color: "#fff",
    deathReason: null,
    health: 100,
    id: 1,
    label: "Planet",
    mass: 100,
    playerId: "player-1",
    pos: { x: 10, y: 20 },
    radius: 24,
    shieldActive: false,
    shieldAimDir: null,
    shieldLoad: 0,
    shieldMaxLoad: 100,
    vel: { x: 0, y: 0 },
    ...overrides,
  }) as CombatSandboxPlanet;

const createState = () => {
  const playerPlanet = createPlanet({
    id: 5,
    playerId: "player-1",
    pos: { x: 4, y: 9 },
  });
  const targetPlanet = createPlanet({
    id: 7,
    playerId: "player-2",
    pos: { x: 40, y: -3 },
    radius: 30,
  });

  const renderState = {
    blackHole: null,
    caches: [],
    debris: [],
    elapsedSec: 1.5,
    impactBursts: [],
    launchBursts: [],
    neutronStars: [],
    planets: [playerPlanet, targetPlanet],
    player: {
      ammo: {
        heavy: 1,
        light: 2,
        seeker: 3,
      },
      lockTargetId: 7,
      planetId: 5,
      shieldAimDir: null,
    },
    rockets: [],
    suns: [],
    tick: 42,
  } as unknown as CombatSandboxState;

  const currentState = {
    ...renderState,
    player: {
      ...renderState.player,
      seekerLockAcquiredAtTick: 35,
      shieldActive: false,
      shieldLoad: 0,
    },
  } as unknown as CombatSandboxState;

  return {
    currentState,
    playerPlanet,
    renderState,
    targetPlanet,
  };
};

const createParams = (): UpdateLocalViewportCombatSceneParams => {
  const { currentState, playerPlanet, renderState, targetPlanet } =
    createState();

  return {
    activeBlackHoleSwallowEffects: [],
    activeBoostBursts: [],
    activeCacheIds: new Set<number>(),
    activeGravityPulse: null,
    activePlanetExplosions: [],
    background: {
      backgroundLayers: [],
      nowSec: 2,
      renderCenterX: 3,
      renderCenterY: -2,
    },
    blackHoleGroup: {} as Group,
    blackHoleRing: {} as Mesh,
    blackHoleSwallowTracker: {
      previousCachesById: new Map(),
      previousNeutronStarsById: new Map(),
      previousPlanetAliveById: new Map(),
      previousRocketsById: new Map(),
      previousSunsById: new Map(),
      previousSunSwallowedAtById: new Map(),
    },
    boostBurstParticlesPerBurst: 32,
    boostBurstVisual: null as unknown as UpdateLocalViewportCombatSceneParams["boostBurstVisual"],
    cacheBadgeScale: 1,
    cacheSpriteAssets: {
      badgeMaterials: {} as UpdateLocalViewportCombatSceneParams["cacheSpriteAssets"]["badgeMaterials"],
      iconMaterials: {} as UpdateLocalViewportCombatSceneParams["cacheSpriteAssets"]["iconMaterials"],
    },
    cacheVisuals: new Map(),
    cameraState: {
      visibleWorldHeight: 900,
    },
    cannonFireState: {
      flashStartSec: 0,
      lastAmmo: {
        heavy: 2,
        light: 2,
        seeker: 3,
      },
    },
    cannonVisual: null as unknown as UpdateLocalViewportCombatSceneParams["cannonVisual"],
    controlsEnabled: true,
    createCacheVisual: vi.fn(),
    createNeutronStarVisual: vi.fn(),
    createPlanetVisual: vi.fn(),
    createSunVisual: vi.fn(),
    createTrailVisual: vi.fn(),
    currentState,
    disposeCacheVisual: vi.fn(),
    disposeNeutronStarVisual: vi.fn(),
    disposePlanetVisual: vi.fn(),
    disposeSunVisual: vi.fn(),
    disposeTrailVisual: vi.fn(),
    getCacheIconKey: vi.fn(),
    gravityPulseDurationSec: 0.95,
    gravityPulseVisual: null as unknown as UpdateLocalViewportCombatSceneParams["gravityPulseVisual"],
    hostElement: {
      clientHeight: 450,
    } as HTMLDivElement,
    impactBurstVisuals: [],
    inactiveBlackHoleSwallowVisuals: [],
    inactivePlanetExplosionVisuals: [],
    inputState: {
      aimWorld: { x: 50, y: 60 },
      selectedRocketKind: "seeker",
    },
    launchBurstsByKind: {
      heavy: [],
      light: [],
      seeker: [],
    },
    lockRingVisual: {
      lockedUniform: { value: 0 },
      mesh: {} as Mesh,
      progressUniform: { value: 0 },
      timeUniform: { value: 0 },
    },
    maxRocketTrailSamples: 9,
    maxVisibleImpactBursts: 12,
    playerBoostHeld: true,
    playerPlanet,
    renderPlanetsById: new Map([
      [playerPlanet.id, playerPlanet],
      [targetPlanet.id, targetPlanet],
    ]),
    renderQuality: {
      chromaticAberrationScale: 1,
      debrisBudget: 1,
      effectsQuality: "high",
      launchBurstBudget: 0.8,
      maxPixelRatio: 1,
      rocketTrailBudget: 0.7,
    } as UpdateLocalViewportCombatSceneParams["renderQuality"],
    renderState,
    renderedCacheKeysById: new Map(),
    rocketLaunchBurstPools: {
      heavy: {} as UpdateLocalViewportCombatSceneParams["rocketLaunchBurstPools"]["heavy"],
      light: {} as UpdateLocalViewportCombatSceneParams["rocketLaunchBurstPools"]["light"],
      seeker: {} as UpdateLocalViewportCombatSceneParams["rocketLaunchBurstPools"]["seeker"],
    },
    rocketPools: {
      heavy: {} as UpdateLocalViewportCombatSceneParams["rocketPools"]["heavy"],
      light: {} as UpdateLocalViewportCombatSceneParams["rocketPools"]["light"],
      seeker: {} as UpdateLocalViewportCombatSceneParams["rocketPools"]["seeker"],
    },
    rocketTrailStates: new Map(),
    rocketsByKind: {
      heavy: [],
      light: [],
      seeker: [],
    },
    scene: {
      add: vi.fn(),
      remove: vi.fn(),
    },
    shieldVisual: {
      arcOpacityUniform: { value: 0 },
      crestOpacityUniform: { value: 0 },
      glowOpacityUniform: { value: 0 },
      group: {} as Group,
      panelOpacityUniform: { value: 0 },
    },
    sunVisuals: new Map(),
    neutronStarVisuals: new Map(),
    planetVisuals: new Map(),
    trailVisuals: new Map(),
    updateCacheVisualBadge: vi.fn(),
    weaponKinds: ["heavy", "light", "seeker"],
  };
};

describe("updateLocalViewportCombatScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localCombatSceneMocks.getCannonWorldLayout.mockReturnValue({
      flashDurationSec: 0.25,
    });
    localCombatSceneMocks.getLocalSandboxLockProgress.mockReturnValue(0.6);
    localCombatSceneMocks.buildLocalViewportFrameBundle.mockReturnValue({
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
            resolveBurst: () => null,
          },
          nowSec: 2,
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
            group: {} as Group,
            ringMesh: {} as Mesh,
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
    });
    localCombatSceneMocks.syncSharedCombatScene.mockReturnValue({
      gravityPulse: null,
      shieldImmediateFeedback: null,
    });
  });

  it("updates local fire state and feeds the shared scene bundle", () => {
    const params = createParams();

    updateLocalViewportCombatScene(params);

    expect(params.cannonFireState.flashStartSec).toBe(2);
    expect(
      localCombatSceneMocks.buildLocalViewportFrameBundle,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({
          weaponFrame: {
            cannon: expect.objectContaining({
              flashAgeSec: 0,
              position: { x: 4, y: 9 },
              visible: true,
            }),
            lockRing: expect.objectContaining({
              locked: false,
              progress: 0.6,
              position: { x: 40, y: -3 },
            }),
          },
        }),
        sync: expect.objectContaining({
          launchBurstBudget: 0.8,
          maxRocketTrailSamples: 9,
        }),
      }),
    );
    expect(localCombatSceneMocks.syncSharedCombatScene).toHaveBeenCalledWith(
      expect.objectContaining({
        background: params.background,
        viewport: expect.objectContaining({
          nowSec: 2,
        }),
      }),
    );
  });
});
