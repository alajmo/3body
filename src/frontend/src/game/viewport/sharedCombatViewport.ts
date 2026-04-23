import type { Vec2 } from "@3body/shared";
import type { OrthographicCamera, WebGPURenderer } from "three/webgpu";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import type { ShowcaseDisplayMode } from "../showcaseDisplayMode";
import {
  createBackdropMaterial,
  createBackgroundLayer,
  createBackgroundLayerConfigs,
  createSceneBackgroundColor,
} from "../showcaseVisuals";
import type { SharedCombatCacheBody } from "./cacheVisuals";
import { createManagedViewportSession } from "./managedViewportSession";
import type {
  SharedCombatDynamicNeutronStarPresentationArgs,
  SharedCombatDynamicPlanetPresentationArgs,
  SharedCombatDynamicSunPresentationArgs,
} from "./sharedCombatDynamicCelestialSync";
import { createSharedCombatRenderShell } from "./sharedCombatRenderShell";
import type { SharedCombatRocketBody } from "./sharedCombatRocketPools";
import {
  type SharedCombatSceneBackgroundSync,
  syncSharedCombatScene,
} from "./sharedCombatSceneSync";
import { createCombatViewportCamera } from "./viewportCameraFrame";
import type { ViewportFrameBundle } from "./viewportFrameState";

type SharedCombatRenderShellParams = Parameters<
  typeof createSharedCombatRenderShell
>[0];

type SharedCombatViewportResizeHandler = () => void;

interface CreateSharedCombatViewportRenderShellParams {
  camera: OrthographicCamera;
  cameraState: SharedCombatRenderShellParams["cameraState"];
  currentSsaaLevel: number;
  displayMode: ShowcaseDisplayMode;
  hostElement: HTMLDivElement;
  renderer: WebGPURenderer;
}

interface CreateSharedCombatViewportLifecycleParams {
  disposeViewportSession: () => void;
  failureLogLabel: string;
  hostElement: HTMLDivElement;
  isDisposed: () => boolean;
}

type CreateSharedCombatViewportRenderContextParams = Omit<
  CreateSharedCombatViewportRenderShellParams,
  "camera"
>;

export const createSharedCombatViewportLifecycle = ({
  disposeViewportSession,
  failureLogLabel,
  hostElement,
  isDisposed,
}: CreateSharedCombatViewportLifecycleParams) => {
  const managedViewportSession = createManagedViewportSession({
    failureLogLabel,
    hostElement,
    isDisposed,
  });
  const resizeTarget = hostElement.ownerDocument.defaultView;
  let resizeHandler: SharedCombatViewportResizeHandler | null = null;

  const removeResizeListener = () => {
    if (resizeHandler === null) {
      return;
    }

    resizeTarget?.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  };

  return {
    addResizeListener: (handler: SharedCombatViewportResizeHandler) => {
      removeResizeListener();
      resizeHandler = handler;
      resizeTarget?.addEventListener("resize", handler);
    },
    disposeBase: () => {
      managedViewportSession.invalidate();
      removeResizeListener();
    },
    managedViewportSession,
    reportRenderError: (error: unknown) => {
      disposeViewportSession();
      managedViewportSession.reportFailure(error);
    },
  };
};

export const createSharedCombatViewportRenderShell = ({
  camera,
  cameraState,
  currentSsaaLevel,
  displayMode,
  hostElement,
  renderer,
}: CreateSharedCombatViewportRenderShellParams) => {
  const backgroundVisuals = getRuntimeTuningDocument().visuals.background;

  return createSharedCombatRenderShell({
    backdropMaterial: createBackdropMaterial(backgroundVisuals),
    backgroundLayers: createBackgroundLayerConfigs(backgroundVisuals),
    camera,
    cameraState,
    createBackgroundLayer,
    currentSsaaLevel,
    displayMode,
    hostElement,
    renderer,
    sceneBackground: createSceneBackgroundColor(backgroundVisuals),
  });
};

export const createSharedCombatViewportRenderContext = (
  params: CreateSharedCombatViewportRenderContextParams,
) => {
  const camera = createCombatViewportCamera();

  return {
    camera,
    shell: createSharedCombatViewportRenderShell({
      ...params,
      camera,
    }),
  };
};

export interface SharedCombatViewportUpdateParams<
  SunBody extends {
    id: number;
    pos: Vec2;
    radius: number;
    vel: Vec2;
  },
  SunVisual,
  NeutronStarBody extends {
    id: number;
    mass: number;
    pos: Vec2;
    radius: number;
  },
  NeutronStarVisual,
  PlanetBody extends {
    id: number;
    pos: Vec2;
  },
  PlanetVisual,
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  background: SharedCombatSceneBackgroundSync;
  celestial: {
    neutronStar: SharedCombatDynamicNeutronStarPresentationArgs<
      NeutronStarBody,
      NeutronStarVisual
    >;
    planet: SharedCombatDynamicPlanetPresentationArgs<PlanetBody, PlanetVisual>;
    sun: SharedCombatDynamicSunPresentationArgs<SunBody, SunVisual>;
  };
  viewportFrameBundle: ViewportFrameBundle<CacheBody, Rocket, Burst>;
}

export const updateSharedCombatViewport = <
  SunBody extends {
    id: number;
    pos: Vec2;
    radius: number;
    vel: Vec2;
  },
  SunVisual,
  NeutronStarBody extends {
    id: number;
    mass: number;
    pos: Vec2;
    radius: number;
  },
  NeutronStarVisual,
  PlanetBody extends {
    id: number;
    pos: Vec2;
  },
  PlanetVisual,
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
>({
  background,
  celestial,
  viewportFrameBundle,
}: SharedCombatViewportUpdateParams<
  SunBody,
  SunVisual,
  NeutronStarBody,
  NeutronStarVisual,
  PlanetBody,
  PlanetVisual,
  CacheBody,
  Rocket,
  Burst
>) =>
  syncSharedCombatScene({
    background,
    celestial,
    viewport: {
      bundle: viewportFrameBundle,
    },
  });
