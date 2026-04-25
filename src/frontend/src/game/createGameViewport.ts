import type { RocketKind } from "@3body/shared";
import { ARCHETYPES, ARENA_RADIUS } from "@3body/shared";
import {
  Matrix4,
  type Mesh,
  type OrthographicCamera,
  Quaternion,
  Vector3,
  type WebGPURenderer,
} from "three/webgpu";
import { createSandboxState, getSandboxDebugSnapshot } from "./combatSandbox";
import { getPlanetArchetypeVisuals } from "./planetVisualTuning";
import { ROCKET_RENDER_INSTANCE_LIMITS } from "./rocketVisibility";
import { getScaledRocketVisuals } from "./rocketVisualTuning";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import {
  SHIELD_GLOW_OUTER_SCALE,
  SHIELD_INNER_SCALE,
  SHIELD_OUTER_SCALE,
} from "./shieldPresentation";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import type { CacheVisual } from "./viewport/cacheVisuals";
import { buildLocalSandboxHudState } from "./viewport/localHud";
import { createGameViewportInputController } from "./viewport/localInput";
import {
  createLocalSandboxSimulationState,
  decayLocalSandboxFrameEffects,
  pruneLocalSandboxKillFeedEntries,
  resetLocalSandboxSimulationProfiling,
  resetLocalSandboxSimulationState,
  runLocalSandboxSimulationFrame,
  shouldEmitLocalSandboxHudUpdate,
} from "./viewport/localSandboxSimulation";
import {
  createLocalViewportCameraState,
  getLocalViewportCameraFrame,
  syncLocalViewportCameraToFrame,
  updateLocalViewportCamera,
} from "./viewport/localViewportCamera";
import { disposeLocalViewportDisposables } from "./viewport/localViewportDisposal";
import {
  clearLocalViewportRuntimePlanetExplosionEvents,
  createLocalViewportRuntimeAdapterFromVisualResources,
  queueLocalViewportRuntimePlanetExplosionEvent,
  resetLocalViewportRuntimeSceneState,
  updateLocalViewportRuntimeFrame,
} from "./viewport/localViewportRuntimeAdapter";
import {
  createBlackHoleCoreMaterial,
  createBlackHoleLensMaterial,
  createBlackHoleRingMaterial,
  createBoostWakeMaterial,
  createNeutronStarCoreMaterial,
  createNeutronStarHaloMaterial,
  createNeutronStarJetMaterial,
  createNeutronStarLensMaterial,
  createPlanetExplosionVisual,
  createPlanetGlowMaterial,
  createPlanetMaterial,
  createPlanetSpinAxis,
  createRocketFlameMaterial,
  createRocketLaunchBurstMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  getPlanetForestProfile,
} from "./viewport/localViewportVisualFactories";
import { createLocalViewportVisualResources } from "./viewport/localViewportVisualResources";
import {
  disposeViewportRendererSession,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";
import { createViewportRendererSizeState } from "./viewport/rendererSizing";
import { DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE } from "./viewport/renderQuality";
import {
  createGameViewportSandboxSettingsStore,
  sandboxControlsEnabled as sandboxSettingsControlsEnabled,
} from "./viewport/sandboxSettingsStore";
import {
  createSharedCombatViewportLifecycle,
  createSharedCombatViewportRenderContext,
} from "./viewport/sharedCombatViewport";
import { resizeViewportCameraFrame } from "./viewport/viewportCameraFrame";
import { screenToViewportWorld } from "./viewport/viewportScreenToWorld";
import {
  type CreateGameViewportOptions,
  createGameViewportHudEmitter,
} from "./viewportHud";

const SUN_GEOMETRY_SEGMENTS = 40;
const GLOW_GEOMETRY_SEGMENTS = 52;
const WARP_GEOMETRY_SEGMENTS = 72;
const PLANET_GEOMETRY_SEGMENTS = 80;
const MAX_ROCKET_TRAIL_SAMPLES = 9;
const MAX_ROCKET_TRAIL_SEGMENTS = MAX_ROCKET_TRAIL_SAMPLES - 1;
const MAX_ROCKET_TRAIL_INSTANCES = {
  heavy: ROCKET_RENDER_INSTANCE_LIMITS.heavy * MAX_ROCKET_TRAIL_SEGMENTS,
  light: ROCKET_RENDER_INSTANCE_LIMITS.light * MAX_ROCKET_TRAIL_SEGMENTS,
  seeker: ROCKET_RENDER_INSTANCE_LIMITS.seeker * MAX_ROCKET_TRAIL_SEGMENTS,
} satisfies Record<RocketKind, number>;
const MAX_ROCKET_LAUNCH_BURST_INSTANCES = {
  heavy: 24,
  light: 24,
  seeker: 24,
} satisfies Record<RocketKind, number>;
const MAX_DEBRIS_SAMPLES = 512;
const BOOST_BURST_PARTICLES = 32;
const MAX_ACTIVE_BOOST_BURSTS = 4;
const MAX_BOOST_BURST_SAMPLES = BOOST_BURST_PARTICLES * MAX_ACTIVE_BOOST_BURSTS;
const MAX_VISIBLE_IMPACT_BURSTS = 20;
const MAX_ACTIVE_PLANET_EXPLOSIONS = 6;
const MAX_ACTIVE_BLACK_HOLE_SWALLOWS = 24;
const RETICLE_BASE_COLOR = "#dff3ff";
const _CANNON_STEM_LENGTH_PX = 4;
const _CANNON_STEM_WIDTH_PX = 8;
const _CANNON_BREECH_LENGTH_PX = 11;
const _CANNON_BREECH_WIDTH_PX = 16;
const _CANNON_BREECH_DEPTH_PX = 14;
const _CANNON_BARREL_LENGTH_PX = 26;
const _CANNON_BARREL_WIDTH_PX = 9;
const _CANNON_BARREL_BAND_LENGTH_PX = 3.5;
const _CANNON_BARREL_BAND_WIDTH_PX = 11.5;
const _CANNON_MUZZLE_LENGTH_PX = 4;
const _CANNON_MUZZLE_RADIUS_PX = 5.6;
const _CANNON_FLASH_RADIUS_PX = 16;
const _CANNON_FLASH_DURATION_SEC = 0.14;
const WEAPON_KINDS = [
  "light",
  "heavy",
  "seeker",
] as const satisfies readonly RocketKind[];
const getRuntimeVisuals = () => getRuntimeTuningDocument().visuals;
const getBlackHoleCoreRadius = () => getRuntimeVisuals().blackHole.coreRadius;
const getBlackHoleRingRadius = () => getRuntimeVisuals().blackHole.ringRadius;
const getBlackHoleLensRadius = () => getRuntimeVisuals().blackHole.lensRadius;
const getShieldColor = () => getRuntimeVisuals().abilities.shieldColor;
const getBoostColor = () => getRuntimeVisuals().abilities.boostColor;
const getWildcardColor = () => getRuntimeVisuals().abilities.wildcardColor;
const getWeaponColors = (): Record<RocketKind, { accent: string }> => ({
  heavy: {
    accent: getRuntimeVisuals().rockets.heavy.hudAccent,
  },
  light: {
    accent: getRuntimeVisuals().rockets.light.hudAccent,
  },
  seeker: {
    accent: getRuntimeVisuals().rockets.seeker.hudAccent,
  },
});
const getRocketRenderProfiles = () =>
  getScaledRocketVisuals(getRuntimeVisuals().rockets);
const disposeCacheVisual = (_visual: CacheVisual) => {};

export function createGameViewport(
  hostElement: HTMLDivElement,
  options: CreateGameViewportOptions = {},
): () => void {
  const sandboxSessionConfig = options.sandboxSessionConfig ?? {};
  const cameraWorldHeightOverride = options.cameraWorldHeightOverride;
  const displayMode =
    options.displayMode ?? getRuntimeTuningDocument().visuals.displayMode;
  const observerMode = sandboxSessionConfig.playerBehavior === "bot";
  const sandboxStorageEnabled = options.enableSandboxStorage === true;
  const storage = sandboxStorageEnabled
    ? (hostElement.ownerDocument.defaultView?.localStorage ?? null)
    : null;
  const renderQuality = DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE;
  const currentMaxPixelRatio = renderQuality.maxPixelRatio;
  const currentSsaaLevel = renderQuality.ssaaLevel;
  let disposed = false;
  let renderer: WebGPURenderer | null = null;
  let rendererBootstrap: ViewportRendererBootstrap | null = null;
  let animationLoopController: ReturnType<
    typeof createViewportAnimationLoopController
  > | null = null;
  let camera: OrthographicCamera | null = null;
  let backdropMesh: Mesh | null = null;
  let inputController: ReturnType<
    typeof createGameViewportInputController
  > | null = null;
  let resetSimulationAccumulator = false;
  let resetSandbox: (() => void) | null = null;
  let clearPlanetExplosions = () => {};
  let syncAimWorldToPointer: (() => void) | null = null;
  const disposables: Array<{ dispose: () => void }> = [];
  let cleanupComplete = false;
  let resetProfiling = () => {};
  let disposeViewportSession = () => {};
  const hudEmitter = createGameViewportHudEmitter({
    isDisposed: () => disposed,
    onHudStateChange: options.onHudStateChange,
  });
  const sandboxSettingsStore = createGameViewportSandboxSettingsStore({
    defaultBotsEnabled: options.defaultBotsEnabled ?? true,
    emitHudState: hudEmitter.emit,
    getCurrentHudState: hudEmitter.getState,
    onResetProfilingRequested: () => {
      resetProfiling();
    },
    onResetSandboxRequested: () => {
      resetSandbox?.();
    },
    onSimulationAccumulatorResetRequested: () => {
      resetSimulationAccumulator = true;
    },
    storage,
  });
  const sandboxSettings = sandboxSettingsStore.state;
  const sandboxControlsEnabled = () =>
    !observerMode && sandboxSettingsControlsEnabled(sandboxSettings);
  options.onControllerReady?.(sandboxSettingsStore.controller);
  sandboxSettingsStore.emitInitialHudState();
  const cameraState = createLocalViewportCameraState({
    cameraWorldHeightOverride,
  });
  const rendererSizeState = createViewportRendererSizeState();
  const viewportLifecycle = createSharedCombatViewportLifecycle({
    disposeViewportSession: () => {
      disposeViewportSession();
    },
    failureLogLabel: "TSL viewport",
    hostElement,
    isDisposed: () => disposed,
  });
  const managedViewportSession = viewportLifecycle.managedViewportSession;
  const createLocalSandboxState = () =>
    createSandboxState(sandboxSettings.activePreset, {
      botDifficulty: sandboxSessionConfig.botDifficulty,
      botsEnabled: sandboxSettings.botsEnabled,
      participantCount: sandboxSessionConfig.participantCount,
      playerBehavior: sandboxSessionConfig.playerBehavior,
    });
  const getViewportAspect = () =>
    Math.max(1, hostElement.clientWidth) /
    Math.max(1, hostElement.clientHeight);

  const resizeViewport = () => {
    resizeViewportCameraFrame({
      backdropMesh,
      camera,
      cameraState,
      hostElement,
      maxPixelRatio: currentMaxPixelRatio,
      renderer,
      sizeState: rendererSizeState,
    });
    syncAimWorldToPointer?.();
  };

  disposeViewportSession = () => {
    viewportLifecycle.disposeBase();
    inputController?.dispose();
    inputController = null;
    syncAimWorldToPointer = null;
    resetSandbox = null;
    resetProfiling = () => {};

    clearPlanetExplosions();
    clearPlanetExplosions = () => {};
    disposeLocalViewportDisposables(disposables);
    disposeViewportRendererSession({
      animationLoopController,
      bootstrap: rendererBootstrap,
      hostElement,
      renderer,
    });
    animationLoopController = null;
    rendererBootstrap = null;
    renderer = null;
    camera = null;
    backdropMesh = null;
  };

  const startViewport = async () => {
    try {
      await managedViewportSession.start({
        onReady: ({ bootstrap, renderer: nextRenderer }) => {
          rendererBootstrap = bootstrap;
          renderer = nextRenderer;

          const renderContext = createSharedCombatViewportRenderContext({
            cameraState,
            currentSsaaLevel,
            displayMode,
            hostElement,
            renderer: nextRenderer,
          });
          camera = renderContext.camera;
          const {
            backgroundLayers,
            backdropMesh: shellBackdropMesh,
            chromaticAberrationNode,
            disposables: shellDisposables,
            postProcessing,
            scene,
          } = renderContext.shell;
          backdropMesh = shellBackdropMesh;
          disposables.push(...shellDisposables);

          const initialState = createLocalSandboxState();
          const visualResources = createLocalViewportVisualResources({
            blackHoleSwallowCapacity: MAX_ACTIVE_BLACK_HOLE_SWALLOWS,
            boostBurstSampleLimit: MAX_BOOST_BURST_SAMPLES,
            boostColor: getBoostColor(),
            createBlackHoleCoreMaterial,
            createBlackHoleLensMaterial,
            createBlackHoleRingMaterial,
            createBoostWakeMaterial,
            createNeutronStarCoreMaterial,
            createNeutronStarHaloMaterial,
            createNeutronStarJetMaterial,
            createNeutronStarLensMaterial,
            createPlanetExplosionVisual,
            createPlanetGlowMaterial,
            createPlanetMaterial,
            createPlanetSpinAxis,
            createRocketFlameMaterial,
            createRocketLaunchBurstMaterial,
            createRocketMaterial,
            createRocketTrailMaterial,
            createSunCoreMaterial,
            createSunGlowMaterial,
            createWarpMaterial,
            debrisSampleLimit: MAX_DEBRIS_SAMPLES,
            disposeCacheVisual,
            disposables,
            getBlackHoleCoreRadius,
            getBlackHoleLensRadius,
            getBlackHoleRingRadius,
            getPlanetForestProfile,
            glowGeometrySegments: GLOW_GEOMETRY_SEGMENTS,
            hostElement,
            impactBurstLimit: MAX_VISIBLE_IMPACT_BURSTS,
            initialState,
            launchBurstInstanceLimits: MAX_ROCKET_LAUNCH_BURST_INSTANCES,
            planetExplosionLimit: MAX_ACTIVE_PLANET_EXPLOSIONS,
            planetGeometrySegments: PLANET_GEOMETRY_SEGMENTS,
            reticleBaseColor: RETICLE_BASE_COLOR,
            rocketRenderProfiles: getRocketRenderProfiles(),
            rocketTrailInstanceLimits: MAX_ROCKET_TRAIL_INSTANCES,
            rocketWeaponKinds: WEAPON_KINDS,
            scene,
            shieldColor: getShieldColor(),
            shieldGlowOuterScale: SHIELD_GLOW_OUTER_SCALE,
            shieldInnerScale: SHIELD_INNER_SCALE,
            shieldOuterScale: SHIELD_OUTER_SCALE,
            sunGeometrySegments: SUN_GEOMETRY_SEGMENTS,
            warpGeometrySegments: WARP_GEOMETRY_SEGMENTS,
            wildcardColor: getWildcardColor(),
            weaponColors: getWeaponColors(),
          });
          const { reticleDotMesh, reticleRingMesh } = visualResources;

          const simulationState =
            createLocalSandboxSimulationState(initialState);
          const runtimeAdapter =
            createLocalViewportRuntimeAdapterFromVisualResources({
              chromaticAberrationNode,
              initialState,
              visualBudgetCaps: {
                boostBurstParticlesPerBurst: BOOST_BURST_PARTICLES,
                maxDebrisSamples: MAX_DEBRIS_SAMPLES,
                maxRocketTrailSamples: MAX_ROCKET_TRAIL_SAMPLES,
                maxVisibleImpactBursts: MAX_VISIBLE_IMPACT_BURSTS,
              },
              visualResources,
              weaponKinds: WEAPON_KINDS,
            });
          const hiddenRocketMatrix = new Matrix4();
          const hiddenRocketPosition = new Vector3(
            ARENA_RADIUS * 8,
            ARENA_RADIUS * 8,
            0,
          );
          const hiddenRocketRotation = new Quaternion();
          const hiddenRocketScale = new Vector3(0.001, 0.001, 0.001);

          clearPlanetExplosions = () => {
            clearLocalViewportRuntimePlanetExplosionEvents({
              adapter: runtimeAdapter,
            });
          };

          inputController = createGameViewportInputController({
            canvasElement: nextRenderer.domElement,
            isShieldActive: () =>
              simulationState.currentState.player.shieldActive,
            initialPlayer: initialState.player,
            isSandboxPaused: () => sandboxSettings.sandboxPaused,
            sandboxControlsEnabled,
            syncAimWorldToPointer: () => {
              syncAimWorldToPointer?.();
            },
            windowTarget: window,
          });
          const inputRuntime = inputController.state;
          const inputState = inputRuntime.inputState;
          const pointerState = inputRuntime.pointerState;
          const syncCameraToFocus = (
            state: typeof simulationState.currentState,
          ) => {
            syncLocalViewportCameraToFrame({
              backdropMesh,
              camera,
              cameraState,
              frame: getLocalViewportCameraFrame({
                aspect: getViewportAspect(),
                cameraWorldHeightOverride,
                followAlivePlanetWhenPlayerDown: observerMode,
                useArenaStageCamera: observerMode,
                state,
              }),
              hostElement,
            });
            syncAimWorldToPointer?.();
          };

          syncAimWorldToPointer = () => {
            if (inputRuntime.keyboardAimActive || !pointerState.hasPointer) {
              return;
            }

            inputState.aimWorld = screenToViewportWorld({
              cameraState,
              clientX: pointerState.clientX,
              clientY: pointerState.clientY,
              renderer: nextRenderer,
            });
          };

          resetSandbox = () => {
            const nextState = createLocalSandboxState();
            resetLocalSandboxSimulationState({
              inputController,
              nextState,
              simulationState,
            });
            resetProfiling();
            clearPlanetExplosions();
            cameraState.shakeOffsetX = 0;
            cameraState.shakeOffsetY = 0;
            resetLocalViewportRuntimeSceneState({
              adapter: runtimeAdapter,
              activeGravityPulse: simulationState.activeGravityPulse,
              activeBoostBursts: simulationState.activeBoostBursts,
              currentState: simulationState.currentState,
              hiddenRocketMatrix,
              hiddenRocketPosition,
              hiddenRocketRotation,
              hiddenRocketScale,
              hostScene: scene,
              renderPlanetsById: simulationState.renderPlanetsById,
            });

            syncCameraToFocus(simulationState.currentState);
            syncAimWorldToPointer?.();
          };
          resetProfiling = () => {
            resetLocalSandboxSimulationProfiling(simulationState);
            hudEmitter.emit({
              ...hudEmitter.getState(),
              debugItems: [],
              profilingEnabled: sandboxSettings.profilingEnabled,
            });
          };

          resizeViewport();
          viewportLifecycle.addResizeListener(resizeViewport);
          syncCameraToFocus(simulationState.currentState);

          animationLoopController = createViewportAnimationLoopController({
            hostElement,
            onActiveChange: (active) => {
              resetSimulationAccumulator = true;
              if (active) {
                resizeViewport();
                syncAimWorldToPointer?.();
              } else {
                inputController?.clearPendingGameplayRequests();
              }
            },
            onRenderError: (error) => {
              viewportLifecycle.reportRenderError(error);
            },
            renderFrame: (timeMs = performance.now()) => {
              const nowSec = timeMs * 0.001;
              const activePreset = sandboxSettings.activePreset;
              const blackHoleSettings = sandboxSettings.blackHoleSettings;
              const boostSettings = sandboxSettings.boostSettings;
              const cacheBadgeScale = sandboxSettings.cacheBadgeScale;
              const fullViewEnabled = inputRuntime.fullViewEnabled;
              const profilingEnabled = sandboxSettings.profilingEnabled;
              const sandboxPaused = sandboxSettings.sandboxPaused;
              const shieldSettings = sandboxSettings.shieldSettings;
              const frameProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;

              const simulationFrame = runLocalSandboxSimulationFrame({
                blackHoleSettings,
                inputController,
                inputRuntime,
                nowSec,
                onPlanetExplosionRequested: (planet, startedAtSec) => {
                  queueLocalViewportRuntimePlanetExplosionEvent({
                    adapter: runtimeAdapter,
                    planet,
                    startedAtSec,
                  });
                },
                onViewportFocusChanged: (state) => {
                  syncCameraToFocus(state);
                },
                profilingEnabled,
                resetAccumulator: resetSimulationAccumulator,
                sandboxPaused,
                simulationState,
              });
              resetSimulationAccumulator = false;
              if (simulationFrame.playerPlanet !== null) {
                inputController?.updateKeyboardAim(
                  simulationFrame.playerPlanet.pos,
                  0,
                );
              }

              const currentEffectsQuality = renderQuality.effectsQuality;
              updateLocalViewportRuntimeFrame({
                adapter: runtimeAdapter,
                backgroundLayers,
                cameraState,
                cacheBadgeScale,
                controlsEnabled: sandboxControlsEnabled(),
                hostElement,
                inputRuntime,
                nowSec,
                renderQuality,
                scene,
                simulationFrame,
                simulationState,
              });

              syncAimWorldToPointer?.();
              decayLocalSandboxFrameEffects({
                frameDeltaSec: simulationFrame.frameDeltaSec,
                simulationState,
              });

              updateLocalViewportCamera({
                backdropMesh,
                camera,
                cameraShake: simulationState.cameraShake,
                cameraState,
                cameraWorldHeightOverride,
                frame: getLocalViewportCameraFrame({
                  aspect: getViewportAspect(),
                  cameraWorldHeightOverride,
                  followAlivePlanetWhenPlayerDown: observerMode,
                  useArenaStageCamera: observerMode,
                  state: simulationState.renderState,
                }),
                frameDeltaSec: simulationFrame.frameDeltaSec,
                hostElement,
                nowSec,
              });
              syncAimWorldToPointer?.();

              reticleRingMesh.visible = false;
              reticleDotMesh.visible = false;

              const renderProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;
              if (
                shouldEmitLocalSandboxHudUpdate({
                  nowSec,
                  simulationState,
                })
              ) {
                const currentState = simulationState.currentState;
                const playerPlanet = simulationFrame.playerPlanet;
                const debug = getSandboxDebugSnapshot(currentState);
                const boostCapacity = Math.max(
                  1,
                  boostSettings.charges +
                    (playerPlanet === null
                      ? 0
                      : ARCHETYPES[playerPlanet.archetype].boostChargeBonus),
                );
                const boostLoadRatio = Math.max(
                  0,
                  Math.min(1, currentState.player.boostCharges / boostCapacity),
                );
                const boostRecoveryDurationSec = boostSettings.cooldownSec;
                const boostRecoveryRemainingSec =
                  boostLoadRatio >= 1
                    ? 0
                    : (1 - boostLoadRatio) * boostRecoveryDurationSec;
                const shieldMode = currentState.player.shieldActive
                  ? "active"
                  : currentState.player.shieldLoad <
                      currentState.player.shieldMaxLoad
                    ? "cooldown"
                    : "ready";
                const boostMode =
                  inputRuntime.pendingAbilityRequests.boost &&
                  boostLoadRatio > 0
                    ? "active"
                    : boostLoadRatio < 1
                      ? "cooldown"
                      : "ready";

                pruneLocalSandboxKillFeedEntries({
                  nowSec,
                  simulationState,
                });
                const blackHoleRemainingSec = Math.max(
                  0,
                  blackHoleSettings.spawnSec - currentState.elapsedSec,
                );
                const profilerSnapshot = profilingEnabled
                  ? simulationState.performanceProfiler.getSnapshot()
                  : null;
                const killFeed = simulationState.killFeedEntries.map(
                  (entry) => ({
                    accent: entry.accent,
                    ageSec: nowSec - entry.startedAtSec,
                    id: entry.id,
                    text: entry.text,
                  }),
                );
                const playerPlanetVisuals =
                  playerPlanet === null
                    ? null
                    : getPlanetArchetypeVisuals(playerPlanet.archetype);
                const currentHudState = hudEmitter.getState();
                hudEmitter.emit(
                  buildLocalSandboxHudState({
                    blackHoleRemainingSec,
                    blackHoleSettings,
                    botsEnabled: sandboxSettings.botsEnabled,
                    boostMode,
                    boostRecoveryDurationSec,
                    boostRecoveryRemainingSec,
                    boostSettings,
                    cacheBadgeScale,
                    colors: {
                      boost: getBoostColor(),
                      shield: getShieldColor(),
                      weapon: getWeaponColors(),
                      wildcard: getWildcardColor(),
                    },
                    controlsEnabled: sandboxControlsEnabled(),
                    currentEffectsQuality,
                    currentMaxPixelRatio,
                    currentPresetId: activePreset.id,
                    currentSsaaLevel,
                    currentState,
                    debug,
                    fullViewEnabled,
                    killFeed,
                    planetAuraGap:
                      playerPlanetVisuals?.auraGap ??
                      currentHudState.planetAuraGap,
                    planetAuraScale:
                      playerPlanetVisuals?.auraScale ??
                      currentHudState.planetAuraScale,
                    planetBodyScale:
                      playerPlanetVisuals?.bodyScale ??
                      currentHudState.planetBodyScale,
                    playerDamageFlash: simulationState.playerDamageFlash,
                    playerHudFlicker: simulationState.playerHudFlicker,
                    playerHpPulse: simulationState.playerHpPulse,
                    playerLabel:
                      playerPlanet?.displayName ??
                      playerPlanet?.label ??
                      "Player",
                    profilingEnabled,
                    profilerSnapshot,
                    runtimeStats: simulationState.runtimeStats,
                    sandboxPaused,
                    selectedWeapon: inputState.selectedRocketKind,
                    shieldLoad: currentState.player.shieldLoad,
                    shieldMaxLoad: currentState.player.shieldMaxLoad,
                    shieldMode,
                    shieldSettings,
                  }),
                );
              }

              const renderProfilerEndMs = profilingEnabled
                ? performance.now()
                : 0;
              const submitProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;
              postProcessing.render();
              if (profilingEnabled) {
                const submitProfilerEndMs = performance.now();
                simulationState.performanceProfiler.record({
                  frameCpuMs: submitProfilerEndMs - frameProfilerStartMs,
                  frameDeltaSec: simulationFrame.frameDeltaSec,
                  frameGapSec: simulationFrame.frameGapSec,
                  interpolationMs: simulationFrame.interpolationMs,
                  renderCpuMs: renderProfilerEndMs - renderProfilerStartMs,
                  simulationMs: simulationFrame.simulationMs,
                  stepCount: simulationFrame.stepCount,
                  submitMs: submitProfilerEndMs - submitProfilerStartMs,
                });
              }
            },
            renderer: nextRenderer,
          });
        },
      });
    } catch (error) {
      viewportLifecycle.reportRenderError(error);
    }
  };

  const disposeViewport = () => {
    if (cleanupComplete) {
      return;
    }

    cleanupComplete = true;
    disposeViewportSession();
    options.onControllerReady?.(null);
  };

  void startViewport();

  return () => {
    disposed = true;
    disposeViewport();
  };
}
