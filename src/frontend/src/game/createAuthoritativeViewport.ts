import type { ClientMsg, PlanetPublic, RocketKind, World } from "@3body/shared";
import { ARENA_RADIUS, clamp, lerp, SIM_HZ, SNAPSHOT_HZ } from "@3body/shared";
import type {
  Mesh,
  Object3D,
  OrthographicCamera,
  WebGPURenderer,
} from "three/webgpu";
import type { AuthoritativeMatchRuntimeState } from "./authoritativeMatchRuntime";
import { playRocketFireSound } from "./rocketFireSound";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import type { ShowcaseDisplayMode } from "./showcaseDisplayMode";
import { createViewportAnimationLoopController } from "./viewport/animationLoopController";
import {
  decayAuthoritativeFeedbackLevels,
  type ImmediateCannonFlashState,
  type ImmediateGravityPulseFeedbackState,
} from "./viewport/authoritativeCosmeticFeedback";
import type {
  AuthoritativeNetworkDiagnosticsSnapshot,
  AuthoritativeRenderDiagnostics,
} from "./viewport/authoritativeDiagnostics";
import { buildAuthoritativeHudState } from "./viewport/authoritativeHud";
import {
  createAuthoritativeInterpolationCache,
  syncAuthoritativeInterpolatedWorld,
} from "./viewport/authoritativeInterpolation";
import {
  getAuthoritativeAdaptiveInterpolationDelayMs,
  getAuthoritativeBufferedInterpolationFrame,
  getAuthoritativeEstimatedClientTickFrame,
  getAuthoritativeInterpolationDelayMs,
  getAuthoritativeInterpolationMaxAlpha,
  getAuthoritativeRenderClockFrame,
} from "./viewport/authoritativeLatency";
import {
  createAuthoritativeLocalPlanetPresentationState,
  reconcileAuthoritativeLocalPlanetPresentation,
} from "./viewport/authoritativeLocalPlanetReconciliation";
import {
  canDispatchAuthoritativeRocketFire,
  resolveAuthoritativeCombatControlStep,
  smoothAuthoritativeCameraAxis,
} from "./viewport/authoritativeViewportBehavior";
import {
  createAuthoritativeViewportRuntimeAdapter,
  disposeAuthoritativeViewportRuntimeSceneResources,
  disposeAuthoritativeViewportRuntimeSceneStateVisuals,
  queueAuthoritativeViewportRuntimeImmediateAbilityFeedback,
  queueAuthoritativeViewportRuntimeImmediateFireFeedback,
  resetAuthoritativeViewportRuntimeAdapter,
  syncAuthoritativeViewportRuntimeFeedback,
  updateAuthoritativeViewportRuntimeFrame,
} from "./viewport/authoritativeViewportRuntimeAdapter";
import { createAuthoritativeViewportSceneResources } from "./viewport/authoritativeViewportSceneResources";
import { getViewportCameraShakeOffsets } from "./viewport/cameraShake";
import { disposeViewportDisposables } from "./viewport/disposables";
import { createGameViewportInputController } from "./viewport/localInput";
import { createViewportPerformanceProfiler } from "./viewport/performanceProfiler";
import {
  disposeViewportRendererSession,
  type ViewportRendererBootstrap,
} from "./viewport/rendererBootstrap";
import { createViewportRendererSizeState } from "./viewport/rendererSizing";
import {
  DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE,
  type ViewportRenderQualityProfile,
} from "./viewport/renderQuality";
import { createRuntimeStatsTracker } from "./viewport/runtimeStats";
import { getSharedCombatRocketTrailInstanceLimits } from "./viewport/sharedCombatRocketPools";
import type { SharedCombatImmediateShieldFeedbackState } from "./viewport/sharedCombatSupportVisuals";
import {
  createSharedCombatViewportLifecycle,
  createSharedCombatViewportRenderContext,
} from "./viewport/sharedCombatViewport";
import { createVibeJamPortal } from "./viewport/vibeJamPortal";
import {
  applyViewportCameraFrame,
  resizeViewportCameraFrame,
} from "./viewport/viewportCameraFrame";
import { screenToViewportWorld } from "./viewport/viewportScreenToWorld";
import {
  createGameViewportHudEmitter,
  type GameViewportHudState,
} from "./viewportHud";

const CAMERA_FOLLOW_LERP = 6.1;
const CAMERA_ZOOM_LERP = 5.2;
const MAX_FRAME_DELTA_SEC = 0.1;
const HUD_UPDATE_INTERVAL_SEC = 1 / 12;
const INPUT_SEND_INTERVAL_MS = 1000 / SIM_HZ;
const SHIELD_AIM_SEND_INTERVAL_MS = 1000 / SIM_HZ;
const MAX_ACTIVE_BLACK_HOLE_SWALLOWS = 24;
const MAX_ACTIVE_IMPACT_BURSTS = 16;
const MAX_ACTIVE_NEUTRON_STAR_ABSORPTION_EXPLOSIONS = 8;
const MAX_ACTIVE_BOOST_BURSTS = 4;
const BOOST_BURST_PARTICLES = 32;
const MAX_BOOST_BURST_SAMPLES = BOOST_BURST_PARTICLES * MAX_ACTIVE_BOOST_BURSTS;
const MAX_DEBRIS_SAMPLES = 512;
const MAX_ROCKET_TRAIL_SAMPLES = 9;
const MAX_ROCKET_TRAIL_INSTANCES = getSharedCombatRocketTrailInstanceLimits(
  MAX_ROCKET_TRAIL_SAMPLES,
);
const MAX_ROCKET_LAUNCH_BURST_INSTANCES = {
  heavy: 24,
  light: 24,
  seeker: 24,
} satisfies Record<RocketKind, number>;
const AUTHORITATIVE_ROCKET_KINDS = [
  "heavy",
  "light",
  "seeker",
] as const satisfies readonly RocketKind[];
const AUTHORITATIVE_VIEWPORT_RENDER_QUALITY_PROFILE = {
  ...DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE,
  maxPixelRatio: 1.5,
} satisfies ViewportRenderQualityProfile;
const RAW_RENDER_QUERY_PARAM = "rawRender";

const isRawAuthoritativeRenderEnabled = (hostElement: HTMLDivElement) =>
  new URLSearchParams(
    hostElement.ownerDocument.defaultView?.location.search ?? "",
  ).get(RAW_RENDER_QUERY_PARAM) === "1";

interface CreateAuthoritativeViewportOptions {
  dispatchMessage: (message: ClientMsg) => void;
  displayMode: ShowcaseDisplayMode;
  getNetworkDiagnostics: (
    timeMs: number,
  ) => AuthoritativeNetworkDiagnosticsSnapshot;
  getPerformanceState: () => {
    profilingEnabled: boolean;
    resetToken: number;
  };
  getRuntimeState: () => AuthoritativeMatchRuntimeState;
  onHudStateChange?: (state: GameViewportHudState) => void;
}

const getGameplayCameraHeights = () => {
  const cameraTuning = getRuntimeTuningDocument().gameplay.camera;

  return {
    followWorldHeight: cameraTuning.gameplayCameraWorldHeight,
  };
};

const getCameraFrame = (
  world: World | null,
  playerPlanet: PlanetPublic | null,
): { centerX: number; centerY: number; visibleWorldHeight: number } => {
  const { followWorldHeight } = getGameplayCameraHeights();

  if (world === null) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: followWorldHeight,
    };
  }

  if (playerPlanet === null) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: followWorldHeight,
    };
  }

  return {
    centerX: playerPlanet.pos.x,
    centerY: playerPlanet.pos.y,
    visibleWorldHeight: followWorldHeight,
  };
};

export function createAuthoritativeViewport(
  hostElement: HTMLDivElement,
  options: CreateAuthoritativeViewportOptions,
): () => void {
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
  let syncAimWorldToPointer: (() => void) | null = null;
  let lastHudUpdateSec = 0;
  let previousFrameTimeSec: number | null = null;
  let lastInputSentAtMs = 0;
  let lastShieldAimSentAtMs = 0;
  let lastClientTick = 0;
  let lastBoostHeldSent = false;
  const lastFireSentAtTickByKind: Record<RocketKind, number> = {
    heavy: Number.NEGATIVE_INFINITY,
    light: Number.NEGATIVE_INFINITY,
    seeker: Number.NEGATIVE_INFINITY,
  };
  let seekerLockTargetId: number | null = null;
  let seekerLockStartedAtSec: number | null = null;
  let lastProfilingResetToken = options.getPerformanceState().resetToken;
  let rawRenderEnabled = false;
  const renderQuality = AUTHORITATIVE_VIEWPORT_RENDER_QUALITY_PROFILE;
  const currentMaxPixelRatio = renderQuality.maxPixelRatio;
  const performanceProfiler = createViewportPerformanceProfiler();
  const runtimeStatsTracker = createRuntimeStatsTracker();
  const runtimeStats = {
    fps: 0,
    frameTimeMs: 0,
  };
  const disposables: Array<{ dispose: () => void }> = [];
  let cleanupComplete = false;
  let disposeViewportSession = () => {};
  const runtimeAdapter = createAuthoritativeViewportRuntimeAdapter(
    AUTHORITATIVE_ROCKET_KINDS,
  );
  let immediateCannonFlashState: ImmediateCannonFlashState | null = null;
  let gravityPulseFeedbackState: ImmediateGravityPulseFeedbackState | null =
    null;
  let immediateShieldFeedbackState: SharedCombatImmediateShieldFeedbackState | null =
    null;
  const authoritativeInterpolationCache =
    createAuthoritativeInterpolationCache();
  const localPlanetPresentationState =
    createAuthoritativeLocalPlanetPresentationState();
  const cameraState = {
    centerX: 0,
    centerY: 0,
    renderCenterX: 0,
    renderCenterY: 0,
    shakeOffsetX: 0,
    shakeOffsetY: 0,
    visibleWorldHeight: getGameplayCameraHeights().followWorldHeight,
  };
  const rendererSizeState = createViewportRendererSizeState();
  const viewportLifecycle = createSharedCombatViewportLifecycle({
    disposeViewportSession: () => {
      disposeViewportSession();
    },
    failureLogLabel: "authoritative viewport",
    hostElement,
    isDisposed: () => disposed,
  });
  const managedViewportSession = viewportLifecycle.managedViewportSession;
  const snapshotWindowMs = 1000 / SNAPSHOT_HZ;
  const authoritativeBaseInterpolationDelayMs =
    getAuthoritativeInterpolationDelayMs({
      hostname: window.location.hostname,
      snapshotWindowMs,
    });
  let authoritativeAdaptiveInterpolationDelayMs =
    authoritativeBaseInterpolationDelayMs;
  const authoritativeInterpolationMaxAlpha =
    getAuthoritativeInterpolationMaxAlpha({
      hostname: window.location.hostname,
      snapshotWindowMs,
    });
  let cameraShake = 0;
  let damageFlash = 0;
  let hudFlicker = 0;
  let authoritativeRenderTick: number | null = null;
  let lastProcessedEventId: number | null = null;
  let lastProcessedLaunchBurstSnapshotTick: number | null = null;

  const hudEmitter = createGameViewportHudEmitter({
    isDisposed: () => disposed,
    onHudStateChange: options.onHudStateChange,
  });

  const getAuthoritativeClientTick = (
    snapshot: AuthoritativeMatchRuntimeState["snapshot"],
    timeMs: number,
  ): number => {
    if (snapshot === null) {
      lastClientTick += 1;
      return lastClientTick;
    }

    const frame = getAuthoritativeEstimatedClientTickFrame({
      latestSnapshotReceivedAtMs: snapshot.receivedAtMs,
      latestSnapshotTick: snapshot.tick,
      previousClientTick: lastClientTick,
      simHz: SIM_HZ,
      timeMs,
    });
    lastClientTick = frame.clientTick;
    return frame.clientTick;
  };

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

  const resetViewportProfilingState = (profilingEnabled: boolean) => {
    performanceProfiler.reset();
    authoritativeAdaptiveInterpolationDelayMs =
      authoritativeBaseInterpolationDelayMs;
    lastHudUpdateSec = 0;
    hudEmitter.emit({
      ...hudEmitter.getState(),
      debugItems: [],
      profilingEnabled,
    });
  };

  disposeViewportSession = () => {
    viewportLifecycle.disposeBase();
    inputController?.dispose();
    inputController = null;
    syncAimWorldToPointer = null;

    disposeAuthoritativeViewportRuntimeSceneStateVisuals({
      adapter: runtimeAdapter,
      sceneRemoveSafe,
    });
    disposeAuthoritativeViewportRuntimeSceneResources({
      adapter: runtimeAdapter,
      sceneRemoveSafe,
    });
    resetAuthoritativeViewportRuntimeAdapter({
      adapter: runtimeAdapter,
      sceneRemoveSafe,
    });
    seekerLockTargetId = null;
    seekerLockStartedAtSec = null;
    lastBoostHeldSent = false;
    immediateCannonFlashState = null;
    gravityPulseFeedbackState = null;
    immediateShieldFeedbackState = null;
    lastProcessedLaunchBurstSnapshotTick = null;

    disposeViewportDisposables(disposables, "authoritative viewport resource");

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
          rawRenderEnabled = isRawAuthoritativeRenderEnabled(hostElement);

          const renderContext = createSharedCombatViewportRenderContext({
            cameraState,
            currentSsaaLevel: renderQuality.ssaaLevel,
            displayMode: options.displayMode,
            hostElement,
            renderer: nextRenderer,
          });
          const nextCamera = renderContext.camera;
          camera = nextCamera;
          const {
            backgroundLayers,
            backdropMesh: shellBackdropMesh,
            disposables: shellDisposables,
            postProcessing,
            scene,
          } = renderContext.shell;
          backdropMesh = shellBackdropMesh;
          disposables.push(...shellDisposables);

          createAuthoritativeViewportSceneResources({
            adapter: runtimeAdapter,
            blackHoleSwallowCapacity: MAX_ACTIVE_BLACK_HOLE_SWALLOWS,
            boostBurstSampleLimit: MAX_BOOST_BURST_SAMPLES,
            debrisSampleLimit: MAX_DEBRIS_SAMPLES,
            disposables,
            document: hostElement.ownerDocument,
            impactBurstLimit: MAX_ACTIVE_IMPACT_BURSTS,
            launchBurstInstanceLimits: MAX_ROCKET_LAUNCH_BURST_INSTANCES,
            planetExplosionLimit: MAX_ACTIVE_NEUTRON_STAR_ABSORPTION_EXPLOSIONS,
            rocketKinds: AUTHORITATIVE_ROCKET_KINDS,
            rocketTrailInstanceLimits: MAX_ROCKET_TRAIL_INSTANCES,
            scene,
          });

          const vibeJamPortal = createVibeJamPortal({
            scene,
            position: { x: ARENA_RADIUS * 0.7, y: 0 },
          });
          disposables.push({
            dispose: () => {
              vibeJamPortal.dispose();
            },
          });

          const emitConnectionHud = (
            timeMs: number,
            extrapolating: boolean,
            networkDiagnostics: AuthoritativeNetworkDiagnosticsSnapshot,
            renderDiagnostics: AuthoritativeRenderDiagnostics,
          ) => {
            const runtime = options.getRuntimeState();
            const snapshot = runtime.snapshot;
            const world = snapshot?.world ?? null;
            const self = snapshot?.self ?? null;
            const playerId = runtime.playerId;
            const playerPlanet =
              playerId === null || world === null
                ? null
                : (world.planets.find(
                    (planet) => planet.playerId === playerId,
                  ) ?? null);
            const controlsEnabled =
              runtime.phase === "combat" &&
              runtime.connectionState === "connected" &&
              world !== null &&
              self !== null &&
              playerId !== null;
            const connectionLabel = runtime.roomId
              ? `${runtime.roomId} · ${runtime.phase}`
              : runtime.phase;
            const rosterNameByPlayerId = new Map(
              runtime.roomRoster.map((entry) => [entry.playerId, entry.name]),
            );
            const performanceState = options.getPerformanceState();
            hudEmitter.emit(
              buildAuthoritativeHudState({
                connection: {
                  extrapolating,
                  fps: runtimeStats.fps,
                  frameTimeMs: runtimeStats.frameTimeMs,
                  label: connectionLabel,
                  rttMs: runtime.rttMs,
                  state:
                    runtime.connectionState === "connected"
                      ? "connected"
                      : "reconnecting",
                },
                controlsEnabled,
                currentEffectsQuality: renderQuality.effectsQuality,
                currentTick: snapshot?.tick ?? 0,
                currentMaxPixelRatio,
                currentRenderModeLabel: rawRenderEnabled ? "raw" : undefined,
                damageFlash,
                eventLog: runtime.recentEvents,
                extrapolating,
                hudFlicker,
                networkDiagnostics: performanceState.profilingEnabled
                  ? networkDiagnostics
                  : null,
                playerId,
                playerPlanet,
                profilerSnapshot: performanceState.profilingEnabled
                  ? performanceProfiler.getSnapshot()
                  : null,
                profilingEnabled: performanceState.profilingEnabled,
                recentEventsNowMs: timeMs,
                renderDiagnostics: performanceState.profilingEnabled
                  ? renderDiagnostics
                  : null,
                rosterNameByPlayerId,
                runtimeStats,
                selectedWeapon:
                  inputController?.state.inputState.selectedRocketKind ??
                  "light",
                self,
                world,
              }),
            );
          };

          inputController = createGameViewportInputController({
            canvasElement: nextRenderer.domElement,
            isShieldActive: () => {
              const runtime = options.getRuntimeState();
              const world = runtime.snapshot?.world;
              const playerId = runtime.playerId;
              if (world === undefined || playerId === null) {
                return false;
              }

              return (
                world.planets.find((planet) => planet.playerId === playerId)
                  ?.shieldActive === true
              );
            },
            initialPlayer: {
              aimWorld: { x: 0, y: 0 },
              selectedRocketKind: "light",
            },
            isSandboxPaused: () => false,
            sandboxControlsEnabled: () => {
              const runtime = options.getRuntimeState();
              return (
                runtime.phase === "combat" &&
                runtime.connectionState === "connected"
              );
            },
            syncAimWorldToPointer: () => {
              syncAimWorldToPointer?.();
            },
            windowTarget: window,
          });
          const viewportInputController = inputController;

          syncAimWorldToPointer = () => {
            const pointerState = viewportInputController.state.pointerState;
            if (
              viewportInputController.state.keyboardAimActive ||
              !pointerState?.hasPointer
            ) {
              return;
            }

            viewportInputController.state.inputState.aimWorld =
              screenToViewportWorld({
                cameraState,
                clampToViewport: false,
                clientX: pointerState.clientX,
                clientY: pointerState.clientY,
                renderer: nextRenderer,
              });
          };

          resizeViewport();
          viewportLifecycle.addResizeListener(resizeViewport);

          animationLoopController = createViewportAnimationLoopController({
            hostElement,
            onActiveChange: (active) => {
              previousFrameTimeSec = null;
              lastInputSentAtMs = 0;
              lastShieldAimSentAtMs = 0;
              lastBoostHeldSent = false;
              seekerLockTargetId = null;
              seekerLockStartedAtSec = null;
              if (active) {
                resizeViewport();
                syncAimWorldToPointer?.();
              } else {
                viewportInputController.clearPendingGameplayRequests();
              }
            },
            onRenderError: (error) => {
              viewportLifecycle.reportRenderError(error);
            },
            renderFrame: (timeMs = performance.now()) => {
              const performanceState = options.getPerformanceState();
              if (performanceState.resetToken !== lastProfilingResetToken) {
                resetViewportProfilingState(performanceState.profilingEnabled);
                resizeViewport();
                lastProfilingResetToken = performanceState.resetToken;
              }

              const profilingEnabled = performanceState.profilingEnabled;
              const frameProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;
              const nowSec = timeMs * 0.001;
              if (previousFrameTimeSec === null) {
                previousFrameTimeSec = nowSec;
              }

              const rawFrameDeltaSec = Math.max(
                0,
                nowSec - previousFrameTimeSec,
              );
              const frameDeltaSec = clamp(
                rawFrameDeltaSec,
                0,
                MAX_FRAME_DELTA_SEC,
              );
              previousFrameTimeSec = nowSec;
              const sampledRuntimeStats =
                runtimeStatsTracker.sample(frameDeltaSec);
              runtimeStats.fps = sampledRuntimeStats.fps;
              runtimeStats.frameTimeMs = sampledRuntimeStats.frameTimeMs;
              const runtime = options.getRuntimeState();
              const networkDiagnostics = options.getNetworkDiagnostics(timeMs);
              authoritativeAdaptiveInterpolationDelayMs =
                getAuthoritativeAdaptiveInterpolationDelayMs({
                  baseDelayMs: authoritativeBaseInterpolationDelayMs,
                  currentDelayMs: authoritativeAdaptiveInterpolationDelayMs,
                  frameDeltaSec,
                  snapshotGapMaxMs: networkDiagnostics.snapshotGapMaxMs,
                  snapshotGapP90Ms: networkDiagnostics.snapshotGapP90Ms,
                  snapshotWindowMs,
                });
              const snapshot = runtime.snapshot;
              const previousSnapshot = runtime.previousSnapshot ?? snapshot;
              const snapshotBuffer =
                runtime.snapshotBuffer.length > 0
                  ? runtime.snapshotBuffer
                  : snapshot === null
                    ? []
                    : [snapshot];
              const renderClockFrame =
                snapshot === null
                  ? null
                  : getAuthoritativeRenderClockFrame({
                      frameDeltaSec,
                      interpolationDelayMs:
                        authoritativeAdaptiveInterpolationDelayMs,
                      latestSnapshotReceivedAtMs: snapshot.receivedAtMs,
                      latestSnapshotTick: snapshot.tick,
                      previousRenderTick: authoritativeRenderTick,
                      simHz: SIM_HZ,
                      timeMs,
                    });
              if (renderClockFrame === null) {
                authoritativeRenderTick = null;
              }

              const interpolationProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;
              const interpolationFrame =
                renderClockFrame === null
                  ? null
                  : getAuthoritativeBufferedInterpolationFrame({
                      maxAlpha: authoritativeInterpolationMaxAlpha,
                      renderTick: renderClockFrame.renderTick,
                      snapshots: snapshotBuffer,
                    });
              if (renderClockFrame !== null && snapshotBuffer.length < 3) {
                authoritativeRenderTick = renderClockFrame.renderTick;
              } else if (interpolationFrame !== null) {
                authoritativeRenderTick = interpolationFrame.renderTick;
              }
              const renderPreviousSnapshot =
                interpolationFrame?.previous ?? previousSnapshot;
              const renderSnapshot = interpolationFrame?.current ?? snapshot;
              const interpolationAlpha =
                renderSnapshot === null || renderPreviousSnapshot === null
                  ? 1
                  : (interpolationFrame?.alpha ?? 1);
              const interpolationTickSpanSec =
                renderSnapshot === null || renderPreviousSnapshot === null
                  ? undefined
                  : Math.max(
                      0,
                      (renderSnapshot.tick - renderPreviousSnapshot.tick) /
                        SIM_HZ,
                    );
              const extrapolating =
                interpolationFrame?.visuallyExtrapolating ?? false;
              const renderTickForDiagnostics =
                interpolationFrame?.renderTick ??
                renderClockFrame?.renderTick ??
                null;
              const renderDiagnostics: AuthoritativeRenderDiagnostics = {
                bufferDepth: snapshotBuffer.length,
                desiredRenderTick: renderClockFrame?.desiredRenderTick ?? null,
                interpolationAlpha,
                latestSnapshotAgeMs:
                  snapshot === null
                    ? null
                    : Math.max(0, timeMs - snapshot.receivedAtMs),
                renderTick: renderTickForDiagnostics,
                tickBehindLatest:
                  snapshot === null || renderTickForDiagnostics === null
                    ? null
                    : snapshot.tick - renderTickForDiagnostics,
                visuallyExtrapolating: extrapolating,
              };

              const world =
                renderSnapshot === null
                  ? null
                  : syncAuthoritativeInterpolatedWorld(
                      authoritativeInterpolationCache,
                      renderPreviousSnapshot?.world ?? renderSnapshot.world,
                      renderSnapshot.world,
                      interpolationAlpha,
                      interpolationTickSpanSec,
                    );
              const interpolationProfilerEndMs = profilingEnabled
                ? performance.now()
                : 0;
              const renderProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;

              const playerId = runtime.playerId;
              const playerPlanet =
                reconcileAuthoritativeLocalPlanetPresentation({
                  frameDeltaSec,
                  playerId,
                  state: localPlanetPresentationState,
                  world,
                });
              if (playerPlanet !== null) {
                viewportInputController.updateKeyboardAim(
                  playerPlanet.pos,
                  frameDeltaSec,
                );
              }
              vibeJamPortal.update(playerPlanet?.pos ?? null, nowSec);
              ({ cameraShake, damageFlash, hudFlicker } =
                decayAuthoritativeFeedbackLevels({
                  cameraShake,
                  damageFlash,
                  frameDeltaSec,
                  hudFlicker,
                }));
              ({
                cameraShake,
                damageFlash,
                hudFlicker,
                lastProcessedEventId,
                lastProcessedLaunchBurstSnapshotTick,
              } = syncAuthoritativeViewportRuntimeFeedback({
                adapter: runtimeAdapter,
                blackHoleSource:
                  snapshot?.world.blackHole ??
                  previousSnapshot?.world.blackHole ??
                  null,
                currentPlayerId: playerId,
                currentSnapshot: snapshot,
                lastProcessedEventId,
                lastProcessedLaunchBurstSnapshotTick,
                localAimWorld:
                  viewportInputController.state.inputState.aimWorld,
                localPlayerPlanet: playerPlanet,
                maxActiveBoostBursts: MAX_ACTIVE_BOOST_BURSTS,
                maxActiveImpactBursts: MAX_ACTIVE_IMPACT_BURSTS,
                nowSec,
                previousSnapshotWorld: previousSnapshot?.world,
                runtime,
                screenEffects: {
                  cameraShake,
                  damageFlash,
                  hudFlicker,
                },
              }));
              const frame = getCameraFrame(world, playerPlanet);
              const cameraZoomAlpha =
                1 - Math.exp(-CAMERA_ZOOM_LERP * frameDeltaSec);
              cameraState.centerX = smoothAuthoritativeCameraAxis({
                currentValue: cameraState.centerX,
                followLerp: CAMERA_FOLLOW_LERP,
                frameDeltaSec,
                targetValue: frame.centerX,
              });
              cameraState.centerY = smoothAuthoritativeCameraAxis({
                currentValue: cameraState.centerY,
                followLerp: CAMERA_FOLLOW_LERP,
                frameDeltaSec,
                targetValue: frame.centerY,
              });
              cameraState.visibleWorldHeight = lerp(
                cameraState.visibleWorldHeight,
                frame.visibleWorldHeight,
                cameraZoomAlpha,
              );
              const shakeOffsets = getViewportCameraShakeOffsets({
                cameraShake,
                followWorldHeight: getGameplayCameraHeights().followWorldHeight,
                nowSec,
                visibleWorldHeight: cameraState.visibleWorldHeight,
              });
              cameraState.shakeOffsetX = shakeOffsets.x;
              cameraState.shakeOffsetY = shakeOffsets.y;
              applyViewportCameraFrame({
                backdropMesh,
                camera,
                cameraState,
                hostElement,
              });
              syncAimWorldToPointer?.();

              const selectedRocketKind =
                viewportInputController.state.inputState.selectedRocketKind;

              const combatControl = resolveAuthoritativeCombatControlStep({
                connectionState: runtime.connectionState,
                inputSendIntervalMs: INPUT_SEND_INTERVAL_MS,
                inputState: viewportInputController.state.inputState,
                lastBoostHeldSent,
                lastInputSentAtMs,
                lastShieldAimSentAtMs,
                nowSec,
                pendingAbilityRequests:
                  viewportInputController.state.pendingAbilityRequests,
                phase: runtime.phase,
                planets: world?.planets ?? null,
                playerId,
                playerPlanet,
                previousSeekerLockStartedAtSec: seekerLockStartedAtSec,
                previousSeekerLockTargetId: seekerLockTargetId,
                self: snapshot?.self ?? null,
                shieldAimSendIntervalMs: SHIELD_AIM_SEND_INTERVAL_MS,
                timeMs,
              });
              const currentSeekerLockTarget =
                combatControl.seekerLock.seekerLockTarget;
              const currentSeekerLockProgress =
                combatControl.seekerLock.progress;
              seekerLockTargetId = combatControl.seekerLock.seekerLockTargetId;
              seekerLockStartedAtSec =
                combatControl.seekerLock.seekerLockStartedAtSec;

              if (combatControl.sendInput && combatControl.aimDir !== null) {
                lastInputSentAtMs = timeMs;
                lastBoostHeldSent = combatControl.boostHeld;
                options.dispatchMessage({
                  boostHeld: combatControl.boostHeld || undefined,
                  clientTick: getAuthoritativeClientTick(snapshot, timeMs),
                  mouseDir: combatControl.aimDir,
                  type: "input",
                });
              }
              if (
                combatControl.sendShieldAim &&
                combatControl.aimDir !== null
              ) {
                lastShieldAimSentAtMs = timeMs;
                options.dispatchMessage({
                  dir: combatControl.aimDir,
                  type: "shieldAim",
                });
              }

              const fireRequested =
                viewportInputController.consumeShotRequest();
              if (
                fireRequested &&
                combatControl.aimDir !== null &&
                playerPlanet !== null
              ) {
                const seekerTargetId = combatControl.fireTargetId;
                if (
                  selectedRocketKind !== "seeker" ||
                  seekerTargetId !== undefined
                ) {
                  const actionTick = getAuthoritativeClientTick(
                    snapshot,
                    timeMs,
                  );
                  const fireReady = canDispatchAuthoritativeRocketFire({
                    actionTick,
                    lastFireSentAtTick:
                      lastFireSentAtTickByKind[selectedRocketKind],
                    playerPlanet,
                    rocketKind: selectedRocketKind,
                    self: snapshot?.self ?? null,
                  });
                  if (fireReady) {
                    options.dispatchMessage({
                      aimDir: combatControl.aimDir,
                      clientTick: actionTick,
                      kind: selectedRocketKind,
                      targetId: seekerTargetId,
                      type: "fireRocket",
                    });
                    playRocketFireSound();
                    lastFireSentAtTickByKind[selectedRocketKind] = actionTick;
                    ({
                      immediateCannonFlashState,
                      screenEffects: { cameraShake, damageFlash, hudFlicker },
                    } = queueAuthoritativeViewportRuntimeImmediateFireFeedback({
                      aimDir: combatControl.aimDir,
                      adapter: runtimeAdapter,
                      nowSec,
                      playerPlanet,
                      rocketKind: selectedRocketKind,
                      screenEffects: {
                        cameraShake,
                        damageFlash,
                        hudFlicker,
                      },
                    }));
                  }
                }
              }

              if (
                combatControl.dispatchEnabled &&
                combatControl.aimDir !== null &&
                playerPlanet !== null
              ) {
                for (const abilitySlot of combatControl.queuedAbilitySlots) {
                  options.dispatchMessage({
                    aimDir: combatControl.aimDir,
                    slot: abilitySlot,
                    type: "ability",
                  });
                  ({
                    gravityPulseFeedbackState,
                    immediateShieldFeedbackState,
                    screenEffects: { cameraShake, damageFlash, hudFlicker },
                  } = queueAuthoritativeViewportRuntimeImmediateAbilityFeedback(
                    {
                      abilitySlot,
                      adapter: runtimeAdapter,
                      aimDir: combatControl.aimDir,
                      gravityPulseFeedbackState,
                      immediateShieldFeedbackState,
                      maxActiveBoostBursts: MAX_ACTIVE_BOOST_BURSTS,
                      nowSec,
                      playerPlanet,
                      screenEffects: {
                        cameraShake,
                        damageFlash,
                        hudFlicker,
                      },
                      snapshotTick: snapshot?.tick ?? null,
                    },
                  ));
                }
              }

              viewportInputController.clearStepScopedRequests();

              const tuning = getRuntimeTuningDocument();
              ({
                gravityPulse: gravityPulseFeedbackState,
                immediateCannonFlashState,
                shieldImmediateFeedback: immediateShieldFeedbackState,
              } = updateAuthoritativeViewportRuntimeFrame({
                adapter: runtimeAdapter,
                background: {
                  backgroundLayers,
                  nowSec,
                  renderCenterX: cameraState.renderCenterX,
                  renderCenterY: cameraState.renderCenterY,
                },
                cameraState: {
                  visibleWorldHeight: cameraState.visibleWorldHeight,
                },
                combat: {
                  currentSeekerLockProgress,
                  currentSeekerLockTarget,
                  gravityPulseFeedbackState,
                  immediateCannonFlashState,
                  immediateShieldFeedbackState,
                  playerId,
                  playerPlanet,
                  selectedRocketKind,
                },
                hostElement,
                inputRuntime: viewportInputController.state,
                renderQuality,
                runtime,
                scene,
                tuning,
                world,
              }));

              if (nowSec >= lastHudUpdateSec) {
                lastHudUpdateSec = nowSec + HUD_UPDATE_INTERVAL_SEC;
                emitConnectionHud(
                  timeMs,
                  extrapolating,
                  networkDiagnostics,
                  renderDiagnostics,
                );
              }

              const renderProfilerEndMs = profilingEnabled
                ? performance.now()
                : 0;
              const submitProfilerStartMs = profilingEnabled
                ? performance.now()
                : 0;
              if (rawRenderEnabled) {
                nextRenderer.render(scene, nextCamera);
              } else {
                postProcessing.render();
              }
              if (profilingEnabled) {
                const submitProfilerEndMs = performance.now();
                performanceProfiler.record({
                  frameCpuMs: submitProfilerEndMs - frameProfilerStartMs,
                  frameDeltaSec,
                  frameGapSec: rawFrameDeltaSec,
                  interpolationMs:
                    interpolationProfilerEndMs - interpolationProfilerStartMs,
                  renderCpuMs: renderProfilerEndMs - renderProfilerStartMs,
                  simulationMs: 0,
                  stepCount: 0,
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
  };

  void startViewport();

  return () => {
    disposed = true;
    disposeViewport();
  };
}

const sceneRemoveSafe = (...objects: Object3D[]) => {
  for (const object of objects) {
    object.parent?.remove(object);
  }
};
