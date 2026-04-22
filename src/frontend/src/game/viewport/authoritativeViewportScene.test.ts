import type { PlanetPublic, World } from "@3body/shared";
import type {
  CircleGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
} from "three/webgpu";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import type { UpdateAuthoritativeViewportSceneParams } from "./authoritativeViewportScene";

const authoritativeSceneMocks = vi.hoisted(() => ({
  buildAuthoritativeViewportFrameBundle: vi.fn(),
  getCannonWorldLayout: vi.fn(),
  pruneSharedCombatImpactBursts: vi.fn(),
  syncSharedCombatScene: vi.fn(),
}));

vi.mock("../rocketVisibility", () => ({
  getCannonWorldLayout: authoritativeSceneMocks.getCannonWorldLayout,
}));

vi.mock("./authoritativeViewportFrameAdapter", () => ({
  buildAuthoritativeViewportFrameBundle:
    authoritativeSceneMocks.buildAuthoritativeViewportFrameBundle,
}));

vi.mock("./sharedCombatImpactBursts", () => ({
  pruneSharedCombatImpactBursts:
    authoritativeSceneMocks.pruneSharedCombatImpactBursts,
}));

vi.mock("./sharedCombatSceneSync", async () => {
  const actual = await vi.importActual("./sharedCombatSceneSync");
  return {
    ...actual,
    syncSharedCombatScene: authoritativeSceneMocks.syncSharedCombatScene,
  };
});

import { updateAuthoritativeViewportScene } from "./authoritativeViewportScene";

const createPlanet = (
  overrides: Partial<PlanetPublic> = {},
): PlanetPublic =>
  ({
    ammo: {
      heavy: 0,
      light: 0,
      seeker: 0,
    },
    angularVel: 0,
    archetype: "terran",
    color: "#fff",
    health: 100,
    id: 7,
    mass: 100,
    ownerDisconnected: false,
    playerId: "player-1",
    pos: { x: 12, y: -4 },
    radius: 18,
    shieldActive: false,
    shieldAimDir: null,
    shieldLoad: 0,
    shieldMaxLoad: 100,
    shieldReloadRate: 1,
    vel: { x: 0, y: 0 },
    ...overrides,
  }) as PlanetPublic;

const createParams = (): UpdateAuthoritativeViewportSceneParams => {
  const playerPlanet = createPlanet({
    id: 1,
    playerId: "player-1",
    pos: { x: 3, y: 4 },
    radius: 24,
    shieldActive: false,
    shieldLoad: 0,
  });
  const lockTarget = createPlanet({
    id: 8,
    playerId: "player-2",
    pos: { x: 30, y: 12 },
    radius: 22,
  });

  return {
    authoritativePlanetsById: new Map<number, PlanetPublic>([
      [playerPlanet.id, playerPlanet],
      [lockTarget.id, lockTarget],
    ]),
    background: {
      backgroundLayers: [],
      nowSec: 2,
      renderCenterX: 11,
      renderCenterY: -6,
    },
    cameraState: {
      visibleWorldHeight: 900,
    },
    combat: {
      boostHeld: true,
      controlsEnabled: true,
      currentSeekerLockProgress: 0.5,
      currentSeekerLockTarget: lockTarget,
      gravityPulseFeedbackState: null,
      immediateCannonFlashState: {
        rocketKind: "heavy",
        startedAtSec: 1,
      },
      immediateShieldFeedbackState: null,
      playerId: "player-1",
      playerPlanet,
      selectedRocketKind: "seeker",
      viewportAimWorld: { x: 50, y: 75 },
    },
    effects: {
      activeBlackHoleSwallowEffects: [],
      activeBoostBursts: [],
      activeCacheIds: new Set<number>(),
      activeImpactBursts: [],
      activeLaunchBurstsByKind: {
        heavy: [],
        light: [],
        seeker: [],
      },
      activePlanetExplosions: [],
      impactBurstVisuals: [],
      inactiveBlackHoleSwallowVisuals: [],
      inactivePlanetExplosionVisuals: [],
    },
    geometries: {
      glowGeometry: {} as CircleGeometry,
      planetGeometry: {} as SphereGeometry,
      ribbonGeometry: {} as PlaneGeometry,
      sunGeometry: {} as SphereGeometry,
      warpGeometry: {} as RingGeometry,
    },
    hostElement: {
      clientHeight: 450,
    } as HTMLDivElement,
    maps: {
      neutronStarVisuals: new Map(),
      planetTrails: new Map(),
      planetVisuals: new Map(),
      sunVisuals: new Map(),
    },
    previousState: {
      previousCacheBodiesById: new Map(),
      previousNeutronStarsById: new Map(),
      previousRocketBodiesById: new Map(),
      previousSunBodiesById: new Map(),
    },
    renderQuality: {
      launchBurstBudget: 0.75,
      rocketTrailBudget: 0.5,
    } as UpdateAuthoritativeViewportSceneParams["renderQuality"],
    rocketKinds: ["heavy", "light", "seeker"],
    rocketLaunchBurstPools: null,
    rocketPools: null,
    rocketTrailStates: new Map(),
    rocketsByKind: {
      heavy: [],
      light: [],
      seeker: [],
    },
    scene: {
      add: vi.fn(),
      remove: vi.fn(),
    } as unknown as Scene,
    tuning: ({
      gameplay: {
        neutronStars: {
          maxMassKg: 1,
          minMassKg: 0,
        },
      },
      version: 1,
      visuals: {
        caches: {
          badgeBaseSize: 80,
          badgeScale: 1,
        },
        cannon: {},
        neutronStars: {},
        planets: {
          archetypes: {
            terran: {
              auraGap: 0,
              auraScale: 1,
              color: "#fff",
              trailColor: "#fff",
            },
          },
        },
        rockets: {
          heavy: { hudAccent: "#f80" },
          light: { hudAccent: "#8ff" },
          seeker: { hudAccent: "#f6f" },
        },
        suns: [],
      },
    } as unknown) as ReturnType<typeof getRuntimeTuningDocument>,
    visuals: {
      blackHoleGroup: {} as Group,
      blackHoleRing: {} as Mesh,
      boostBurstVisual: null,
      cacheSpriteAssets: {
        badgeMaterials: {} as UpdateAuthoritativeViewportSceneParams["visuals"]["cacheSpriteAssets"]["badgeMaterials"],
        iconMaterials: {} as UpdateAuthoritativeViewportSceneParams["visuals"]["cacheSpriteAssets"]["iconMaterials"],
      },
      cacheVisuals: new Map(),
      cannonVisual: null,
      gravityPulseVisual: null,
      lockRingVisual: null,
      shieldVisual: null,
    },
    world: ({
      arenaRadius: 1200,
      blackHole: null,
      caches: [],
      debris: [],
      neutronStars: [],
      planets: [],
      rockets: [],
      suns: [],
    } as unknown) as World,
  };
};

describe("updateAuthoritativeViewportScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authoritativeSceneMocks.getCannonWorldLayout.mockReturnValue({
      flashDurationSec: 0.2,
    });
    authoritativeSceneMocks.buildAuthoritativeViewportFrameBundle.mockReturnValue({
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
    authoritativeSceneMocks.syncSharedCombatScene.mockReturnValue({
      gravityPulse: null,
      shieldImmediateFeedback: { aimDir: { x: 0, y: 1 }, startedAtSec: 2 },
    });
  });

  it("builds the authoritative frame bundle and shared scene params", () => {
    const params = createParams();

    const result = updateAuthoritativeViewportScene(params);

    expect(
      authoritativeSceneMocks.pruneSharedCombatImpactBursts,
    ).toHaveBeenCalledWith({
      activeBursts: params.effects.activeImpactBursts,
      durationSec: 0.32,
      nowSec: 2,
    });
    expect(
      authoritativeSceneMocks.buildAuthoritativeViewportFrameBundle,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({
          aimTarget: params.combat.viewportAimWorld,
          boostHeld: true,
          currentPlayerId: "player-1",
          weaponFrame: expect.objectContaining({
            cannon: expect.objectContaining({
              accent: "#f6f",
              flashAccent: null,
            }),
            lockRing: expect.objectContaining({
              locked: false,
              progress: 0.5,
            }),
          }),
        }),
        sync: expect.objectContaining({
          launchBurstBudget: 0.75,
          rocketTrailBudget: 0.5,
        }),
      }),
    );
    expect(authoritativeSceneMocks.syncSharedCombatScene).toHaveBeenCalledWith(
      expect.objectContaining({
        background: params.background,
        viewport: expect.objectContaining({
          nowSec: 2,
        }),
      }),
    );
    expect(result).toEqual({
      gravityPulse: null,
      immediateCannonFlashState: null,
      shieldImmediateFeedback: { aimDir: { x: 0, y: 1 }, startedAtSec: 2 },
    });
  });
});
