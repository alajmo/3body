import type { CombatSandboxState } from "../combatSandbox";
import type { CacheVisual } from "./cacheVisuals";
import type { GameViewportInputRuntimeState } from "./localInput";
import {
  buildLocalViewportRuntimeSceneFrame,
  createLocalViewportRuntimeAdapter,
} from "./localViewportRuntimeAdapter";
import { DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE } from "./renderQuality";
import { describe, expect, it } from "vitest";

const weaponKinds = ["heavy", "light", "seeker"] as const;

const createInitialState = (): CombatSandboxState =>
  ({
    neutronStars: [],
    planets: [],
    suns: [],
  }) as unknown as CombatSandboxState;

const createSceneResources = () => ({
  effects: {
    impactBurstVisuals: [] as never[],
  },
  lockRing: {
    lockedUniform: { value: false },
    mesh: {} as never,
    progressUniform: { value: 0 },
    timeUniform: { value: 0 },
  },
  shield: {
    arcOpacityUniform: { value: 0 },
    crestOpacityUniform: { value: 0 },
    glowOpacityUniform: { value: 0 },
    group: {} as never,
    panelOpacityUniform: { value: 0 },
  },
  visualBudgetCaps: {
    boostBurstParticlesPerBurst: 1,
    maxDebrisSamples: 1,
    maxRocketTrailSamples: 1,
    maxVisibleImpactBursts: 1,
  },
  visuals: {
    blackHoleGroup: {} as never,
    blackHoleRing: {} as never,
    boostBurstVisual: {} as never,
    boundaryDebrisVisual: {} as never,
    cacheSpriteAssets: {} as never,
    cannonFireState: {} as never,
    cannonVisual: {} as never,
    chromaticAberrationNode: {} as never,
    debrisVisual: {} as never,
    gravityPulseVisual: {} as never,
    rocketLaunchBurstPools: {} as never,
    rocketPools: {} as never,
  },
});

describe("localViewportRuntimeAdapter", () => {
  it("couples local transient and scene-state ownership around one tracker", () => {
    const cacheVisuals = new Map<number, CacheVisual>();
    const renderedCacheKeysById = new Map();
    const maps = {
      neutronStarVisuals: new Map(),
      planetVisuals: new Map(),
      sunVisuals: new Map(),
    };
    const sceneSync = {
      createNeutronStarVisual: () => ({}) as never,
      createPlanetVisual: () => ({}) as never,
      createSunVisual: () => ({}) as never,
      disposeNeutronStarVisual: () => {},
      disposePlanetVisual: () => {},
      disposeSunVisual: () => {},
    };
    const transientVisualPools = {
      inactiveBlackHoleSwallowVisuals: [],
      inactivePlanetExplosionVisuals: [],
    };
    const sceneResources = createSceneResources();

    const adapter = createLocalViewportRuntimeAdapter({
      cacheVisuals,
      initialState: createInitialState(),
      maps,
      renderedCacheKeysById,
      sceneResources,
      sceneSync,
      transientVisualPools,
      weaponKinds,
    });

    expect(adapter.sceneState.blackHoleSwallowTracker).toBe(
      adapter.transientEvents.blackHoleSwallowTracker,
    );
    expect(adapter.sceneState.cacheVisuals).toBe(cacheVisuals);
    expect(adapter.sceneState.renderedCacheKeysById).toBe(
      renderedCacheKeysById,
    );
    expect(adapter.sceneState.maps).toBe(maps);
    expect(adapter.sceneResources).toBe(sceneResources);
    expect(adapter.sceneSync).toBe(sceneSync);
    expect(adapter.transientVisualPools).toBe(transientVisualPools);
    expect(adapter.weaponKinds).toBe(weaponKinds);
  });

  it("builds scene-frame input from local runtime state and visual budgets", () => {
    const currentState = createInitialState();
    const renderState = createInitialState();
    const activeBoostBursts = [{} as never];
    const backgroundLayers = [] as never;
    const cameraState = {
      centerX: 0,
      centerY: 0,
      renderCenterX: 5,
      renderCenterY: -2,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
      visibleWorldHeight: 900,
    };
    const effects = {
      impactBurstVisuals: [] as never[],
    };
    const lockRing = {
      lockedUniform: { value: false },
      mesh: {} as never,
      progressUniform: { value: 0 },
      timeUniform: { value: 0 },
    };
    const renderPlanetsById = new Map();
    const shield = {
      arcOpacityUniform: { value: 0 },
      crestOpacityUniform: { value: 0 },
      glowOpacityUniform: { value: 0 },
      group: {} as never,
      panelOpacityUniform: { value: 0 },
    };
    const visuals = {
      blackHoleGroup: {} as never,
      blackHoleRing: {} as never,
      boostBurstVisual: {} as never,
      boundaryDebrisVisual: {} as never,
      cacheSpriteAssets: {} as never,
      cannonFireState: {} as never,
      cannonVisual: {} as never,
      chromaticAberrationNode: {} as never,
      debrisVisual: {} as never,
      gravityPulseVisual: {} as never,
      rocketLaunchBurstPools: {} as never,
      rocketPools: {} as never,
    };
    const sceneResources = {
      effects,
      lockRing,
      shield,
      visualBudgetCaps: {
        boostBurstParticlesPerBurst: 32,
        maxDebrisSamples: 512,
        maxRocketTrailSamples: 9,
        maxVisibleImpactBursts: 20,
      },
      visuals,
    };
    const adapter = { sceneResources } as never;
    const inputRuntime: GameViewportInputRuntimeState = {
      fullViewEnabled: false,
      inputState: {
        aimWorld: { x: 12, y: -3 },
        selectedRocketKind: "heavy",
      },
      keyboardAimActive: false,
      pendingAbilityRequests: {
        boost: true,
        gravityPulse: false,
        shield: false,
      },
      pendingShots: 0,
      pointerState: {
        clientX: 0,
        clientY: 0,
        hasPointer: false,
      },
    };
    const playerPlanet = { id: 7 } as never;

    const frame = buildLocalViewportRuntimeSceneFrame({
      adapter,
      backgroundLayers,
      cameraState,
      cacheBadgeScale: 1.35,
      controlsEnabled: false,
      inputRuntime,
      nowSec: 12.5,
      renderQuality: {
        ...DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE,
        boostBurstBudget: 0.5,
        debrisBudget: 0,
        impactBurstBudget: 1.25,
      },
      simulationFrame: { playerPlanet },
      simulationState: {
        activeBoostBursts,
        activeGravityPulse: null,
        currentState,
        renderPlanetsById,
        renderState,
      },
    });

    expect(frame.activeBoostBursts).toBe(activeBoostBursts);
    expect(frame.backgroundLayers).toBe(backgroundLayers);
    expect(frame.blackHoleGroup).toBe(visuals.blackHoleGroup);
    expect(frame.blackHoleRing).toBe(visuals.blackHoleRing);
    expect(frame.boostBurstVisual).toBe(visuals.boostBurstVisual);
    expect(frame.boostBurstParticlesPerBurst).toBe(16);
    expect(frame.boundaryDebrisVisual).toBe(visuals.boundaryDebrisVisual);
    expect(frame.cameraState).toBe(cameraState);
    expect(frame.cacheBadgeScale).toBe(1.35);
    expect(frame.cacheSpriteAssets).toBe(visuals.cacheSpriteAssets);
    expect(frame.cannonFireState).toBe(visuals.cannonFireState);
    expect(frame.cannonVisual).toBe(visuals.cannonVisual);
    expect(frame.chromaticAberrationNode).toBe(visuals.chromaticAberrationNode);
    expect(frame.controlsEnabled).toBe(false);
    expect(frame.currentState).toBe(currentState);
    expect(frame.debrisVisual).toBe(visuals.debrisVisual);
    expect(frame.gravityPulseVisual).toBe(visuals.gravityPulseVisual);
    expect(frame.impactBurstVisuals).toBe(effects.impactBurstVisuals);
    expect(frame.inputState).toBe(inputRuntime.inputState);
    expect(frame.lockRingLockedUniform).toBe(lockRing.lockedUniform);
    expect(frame.lockRingMesh).toBe(lockRing.mesh);
    expect(frame.lockRingProgressUniform).toBe(lockRing.progressUniform);
    expect(frame.lockRingTimeUniform).toBe(lockRing.timeUniform);
    expect(frame.maxDebrisSamples).toBe(0);
    expect(frame.maxRocketTrailSamples).toBe(9);
    expect(frame.maxVisibleImpactBursts).toBe(25);
    expect(frame.nowSec).toBe(12.5);
    expect(frame.playerBoostHeld).toBe(true);
    expect(frame.playerPlanet).toBe(playerPlanet);
    expect(frame.renderPlanetsById).toBe(renderPlanetsById);
    expect(frame.renderQuality.impactBurstBudget).toBe(1.25);
    expect(frame.renderState).toBe(renderState);
    expect(frame.rocketLaunchBurstPools).toBe(visuals.rocketLaunchBurstPools);
    expect(frame.rocketPools).toBe(visuals.rocketPools);
    expect(frame.shieldArcOpacityUniform).toBe(shield.arcOpacityUniform);
    expect(frame.shieldCrestOpacityUniform).toBe(shield.crestOpacityUniform);
    expect(frame.shieldGlowOpacityUniform).toBe(shield.glowOpacityUniform);
    expect(frame.shieldGroup).toBe(shield.group);
    expect(frame.shieldPanelOpacityUniform).toBe(shield.panelOpacityUniform);
  });
});
