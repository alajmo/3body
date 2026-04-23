import type { World } from "@3body/shared";
import { describe, expect, it, vi } from "vitest";
import type { GameViewportInputRuntimeState } from "./localInput";
import {
  buildAuthoritativeViewportRuntimeSceneFrame,
  createAuthoritativeViewportRuntimeAdapter,
  queueAuthoritativeViewportRuntimeImmediateAbilityFeedback,
  queueAuthoritativeViewportRuntimeImmediateFireFeedback,
  resetAuthoritativeViewportRuntimeAdapter,
  setAuthoritativeViewportRuntimeSceneResources,
  setAuthoritativeViewportRuntimeTransientVisualPools,
  syncAuthoritativeViewportRuntimePlanetsById,
} from "./authoritativeViewportRuntimeAdapter";
import { DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE } from "./renderQuality";

const rocketKinds = ["heavy", "light", "seeker"] as const;

describe("authoritativeViewportRuntimeAdapter", () => {
  it("owns authoritative scene, transient, and immediate-fire state together", () => {
    const adapter = createAuthoritativeViewportRuntimeAdapter(rocketKinds);

    expect(adapter.sceneState.activeCacheIds.size).toBe(0);
    expect(adapter.rocketKinds).toBe(rocketKinds);
    expect(adapter.sceneResources).toBeNull();
    expect(adapter.transientEvents.activeBoostBursts).toHaveLength(0);
    expect(adapter.immediateFireFeedback.feedbackByKind.size).toBe(0);
  });

  it("syncs planet lookup through the owned scene state", () => {
    const adapter = createAuthoritativeViewportRuntimeAdapter(rocketKinds);
    const planet = { id: 7 } as World["planets"][number];

    syncAuthoritativeViewportRuntimePlanetsById({
      adapter,
      world: {
        planets: [planet],
      } as World,
    });

    expect(adapter.sceneState.authoritativePlanetsById.get(7)).toBe(planet);
  });

  it("resets owned lookup and transient state", () => {
    const adapter = createAuthoritativeViewportRuntimeAdapter(rocketKinds);
    adapter.sceneState.activeCacheIds.add(1);
    adapter.sceneState.rocketsByKind.heavy.push({
      rocketKind: "heavy",
    } as never);
    adapter.transientEvents.activeBoostBursts.push({} as never);
    adapter.immediateFireFeedback.burstStatesByKind.set("heavy", {} as never);

    resetAuthoritativeViewportRuntimeAdapter({
      adapter,
      sceneRemoveSafe: vi.fn(),
    });

    expect(adapter.sceneState.activeCacheIds.size).toBe(0);
    expect(adapter.sceneState.rocketsByKind.heavy).toHaveLength(0);
    expect(adapter.transientEvents.activeBoostBursts).toHaveLength(0);
    expect(adapter.immediateFireFeedback.burstStatesByKind.size).toBe(0);
  });

  it("queues immediate cannon feedback without predicted projectile state", () => {
    const adapter = createAuthoritativeViewportRuntimeAdapter(rocketKinds);

    queueAuthoritativeViewportRuntimeImmediateFireFeedback({
      adapter,
      aimDir: { x: 1, y: 0 },
      nowSec: 2,
      playerPlanet: {
        pos: { x: 10, y: 5 },
        radius: 20,
      },
      rocketKind: "heavy",
      screenEffects: {
        cameraShake: 0,
        damageFlash: 0,
        hudFlicker: 0,
      },
    });

    expect(adapter.immediateFireFeedback.burstStatesByKind.has("heavy")).toBe(
      false,
    );
    expect(adapter.immediateFireFeedback.ghostStatesByKind.has("heavy")).toBe(
      false,
    );
  });

  it("queues immediate ability boost feedback through owned transient state", () => {
    const adapter = createAuthoritativeViewportRuntimeAdapter(rocketKinds);
    const inactiveBlackHoleSwallowVisuals = [{} as never];
    const inactivePlanetExplosionVisuals = [{} as never];

    setAuthoritativeViewportRuntimeTransientVisualPools({
      adapter,
      inactiveBlackHoleSwallowVisuals,
      inactivePlanetExplosionVisuals,
    });

    queueAuthoritativeViewportRuntimeImmediateAbilityFeedback({
      abilitySlot: "w",
      adapter,
      aimDir: { x: 0, y: 1 },
      gravityPulseFeedbackState: null,
      immediateShieldFeedbackState: null,
      maxActiveBoostBursts: 4,
      nowSec: 4,
      playerPlanet: {
        id: 9,
        pos: { x: 2, y: 3 },
        radius: 11,
      },
      screenEffects: {
        cameraShake: 0,
        damageFlash: 0,
        hudFlicker: 0,
      },
      snapshotTick: 12,
    });

    expect(adapter.transientEvents.activeBoostBursts).toHaveLength(1);
    expect(adapter.transientEvents.activeBoostBursts[0]?.planetId).toBe(9);
    expect(adapter.transientVisualPools.inactiveBlackHoleSwallowVisuals).toBe(
      inactiveBlackHoleSwallowVisuals,
    );
    expect(adapter.transientVisualPools.inactivePlanetExplosionVisuals).toBe(
      inactivePlanetExplosionVisuals,
    );
  });

  it("builds authoritative scene-frame input from runtime state and nullable visuals", () => {
    const inputRuntime: GameViewportInputRuntimeState = {
      fullViewEnabled: false,
      inputState: {
        aimWorld: { x: 4, y: -8 },
        selectedRocketKind: "seeker",
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
    const impactBurstVisuals: never[] = [];
    const lockRingMesh = {} as never;
    const lockRingProgressUniform = { value: 0 };
    const lockRingLockedUniform = { value: false };
    const lockRingTimeUniform = { value: 0 };
    const shieldGroup = {} as never;
    const shieldArcOpacityUniform = { value: 0 };
    const shieldPanelOpacityUniform = { value: 0 };
    const shieldCrestOpacityUniform = { value: 0 };
    const shieldGlowOpacityUniform = { value: 0 };
    const playerPlanet = { id: 3 } as World["planets"][number];
    const geometries = {
      glowGeometry: {} as never,
      planetGeometry: {} as never,
      ribbonGeometry: {} as never,
      sunGeometry: {} as never,
      warpGeometry: {} as never,
    };
    const rocketLaunchBurstPools = {} as never;
    const rocketPools = {} as never;
    const tuning = {} as never;
    const world = { planets: [playerPlanet] } as World;
    const visuals = {
      blackHoleGroup: {} as never,
      blackHoleRing: {} as never,
      boostBurstVisual: null,
      cacheSpriteAssets: {} as never,
      cannonVisual: null,
      gravityPulseVisual: null,
    };
    const adapter = createAuthoritativeViewportRuntimeAdapter(rocketKinds);
    setAuthoritativeViewportRuntimeSceneResources({
      adapter,
      resources: {
        debris: {
          boundaryDebrisVisual: {} as never,
          debrisVisual: {} as never,
          maxDebrisSamples: 512,
        },
        effects: {
          impactBurstVisuals,
        },
        geometries,
        lockRing: {
          lockedUniform: lockRingLockedUniform,
          mesh: lockRingMesh,
          progressUniform: lockRingProgressUniform,
          timeUniform: lockRingTimeUniform,
        },
        rocketLaunchBurstPools,
        rocketPools,
        shield: {
          arcOpacityUniform: shieldArcOpacityUniform,
          crestOpacityUniform: shieldCrestOpacityUniform,
          glowOpacityUniform: shieldGlowOpacityUniform,
          group: shieldGroup,
          panelOpacityUniform: shieldPanelOpacityUniform,
        },
        visuals,
      },
    });

    const frame = buildAuthoritativeViewportRuntimeSceneFrame({
      adapter,
      background: {
        backgroundLayers: [],
        nowSec: 3,
        renderCenterX: 11,
        renderCenterY: -2,
      },
      cameraState: {
        visibleWorldHeight: 640,
      },
      combat: {
        currentSeekerLockProgress: 0.75,
        currentSeekerLockTarget: null,
        gravityPulseFeedbackState: null,
        immediateCannonFlashState: null,
        immediateShieldFeedbackState: null,
        playerId: "p1",
        playerPlanet,
        selectedRocketKind: "seeker",
      },
      inputRuntime,
      renderQuality: DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE,
      runtime: {
        connectionState: "connected",
        phase: "combat",
        snapshot: {
          self: { boostCharges: 1 },
        },
      } as never,
      tuning,
      world,
    });

    expect(frame.background.renderCenterX).toBe(11);
    expect(frame.cameraState.visibleWorldHeight).toBe(640);
    expect(frame.combat.boostHeld).toBe(true);
    expect(frame.combat.controlsEnabled).toBe(true);
    expect(frame.combat.playerPlanet).toBe(playerPlanet);
    expect(frame.combat.viewportAimWorld).toBe(
      inputRuntime.inputState.aimWorld,
    );
    expect(frame.effects.impactBurstVisuals).toBe(impactBurstVisuals);
    expect(frame.geometries).toBe(geometries);
    expect(frame.renderQuality).toBe(DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE);
    expect(frame.rocketLaunchBurstPools).toBe(rocketLaunchBurstPools);
    expect(frame.rocketPools).toBe(rocketPools);
    expect(frame.tuning).toBe(tuning);
    expect(frame.world).toBe(world);
    expect(frame.visuals.blackHoleGroup).toBe(visuals.blackHoleGroup);
    expect(frame.visuals.cacheSpriteAssets).toBe(visuals.cacheSpriteAssets);
    expect(frame.visuals.lockRingVisual?.mesh).toBe(lockRingMesh);
    expect(frame.visuals.lockRingVisual?.lockedUniform).toBe(
      lockRingLockedUniform,
    );
    expect(frame.visuals.shieldVisual?.group).toBe(shieldGroup);
    expect(frame.visuals.shieldVisual?.glowOpacityUniform).toBe(
      shieldGlowOpacityUniform,
    );
  });
});
