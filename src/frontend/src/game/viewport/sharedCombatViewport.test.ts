import type { Vec2 } from "@3body/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedCombatCacheBody } from "./cacheVisuals";
import type { SharedCombatRocketBody } from "./sharedCombatRocketPools";
import type { SharedCombatViewportUpdateParams } from "./sharedCombatViewport";
import type { ViewportFrameBundle } from "./viewportFrameState";

const sharedViewportMocks = vi.hoisted(() => ({
  createBackdropMaterial: vi.fn(),
  createBackgroundLayer: vi.fn(),
  createBackgroundLayerConfigs: vi.fn(),
  createManagedViewportSession: vi.fn(),
  createSceneBackgroundColor: vi.fn(),
  createCombatViewportCamera: vi.fn(),
  createSharedCombatRenderShell: vi.fn(),
  getRuntimeTuningDocument: vi.fn(),
  syncSharedCombatScene: vi.fn(),
}));

vi.mock("../runtimeTuning", () => ({
  getRuntimeTuningDocument: sharedViewportMocks.getRuntimeTuningDocument,
}));

vi.mock("../showcaseVisuals", () => ({
  createBackdropMaterial: sharedViewportMocks.createBackdropMaterial,
  createBackgroundLayer: sharedViewportMocks.createBackgroundLayer,
  createBackgroundLayerConfigs:
    sharedViewportMocks.createBackgroundLayerConfigs,
  createSceneBackgroundColor: sharedViewportMocks.createSceneBackgroundColor,
}));

vi.mock("./managedViewportSession", () => ({
  createManagedViewportSession:
    sharedViewportMocks.createManagedViewportSession,
}));

vi.mock("./sharedCombatRenderShell", () => ({
  createSharedCombatRenderShell:
    sharedViewportMocks.createSharedCombatRenderShell,
}));

vi.mock("./sharedCombatSceneSync", () => ({
  syncSharedCombatScene: sharedViewportMocks.syncSharedCombatScene,
}));

vi.mock("./viewportCameraFrame", () => ({
  createCombatViewportCamera: sharedViewportMocks.createCombatViewportCamera,
}));

import {
  createSharedCombatViewportLifecycle,
  createSharedCombatViewportRenderContext,
  createSharedCombatViewportRenderShell,
  updateSharedCombatViewport,
} from "./sharedCombatViewport";

type TestSunBody = {
  id: number;
  pos: Vec2;
  radius: number;
  vel: Vec2;
};
type TestNeutronStarBody = {
  id: number;
  mass: number;
  pos: Vec2;
  radius: number;
};
type TestPlanetBody = {
  id: number;
  pos: Vec2;
};
type TestRocketBody = SharedCombatRocketBody & { radius: number };
type TestBurst = {
  absorbedByShield: boolean;
  color: string;
};
type TestViewportUpdateParams = SharedCombatViewportUpdateParams<
  TestSunBody,
  object,
  TestNeutronStarBody,
  object,
  TestPlanetBody,
  object,
  SharedCombatCacheBody,
  TestRocketBody,
  TestBurst
>;

describe("updateSharedCombatViewport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("owns shared resize-listener and render-error lifecycle wiring", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const invalidate = vi.fn();
    const reportFailure = vi.fn();
    const disposeViewportSession = vi.fn();
    sharedViewportMocks.createManagedViewportSession.mockReturnValue({
      invalidate,
      reportFailure,
      start: vi.fn(),
    });
    const hostElement = {
      ownerDocument: {
        defaultView: {
          addEventListener,
          removeEventListener,
        },
      },
    } as unknown as HTMLDivElement;
    const firstResize = vi.fn();
    const secondResize = vi.fn();
    const lifecycle = createSharedCombatViewportLifecycle({
      disposeViewportSession,
      failureLogLabel: "combat viewport",
      hostElement,
      isDisposed: () => false,
    });

    lifecycle.addResizeListener(firstResize);
    lifecycle.addResizeListener(secondResize);
    lifecycle.disposeBase();
    const error = new Error("render failed");
    lifecycle.reportRenderError(error);

    expect(
      sharedViewportMocks.createManagedViewportSession,
    ).toHaveBeenCalledWith({
      failureLogLabel: "combat viewport",
      hostElement,
      isDisposed: expect.any(Function),
    });
    expect(addEventListener).toHaveBeenNthCalledWith(1, "resize", firstResize);
    expect(removeEventListener).toHaveBeenNthCalledWith(
      1,
      "resize",
      firstResize,
    );
    expect(addEventListener).toHaveBeenNthCalledWith(2, "resize", secondResize);
    expect(removeEventListener).toHaveBeenNthCalledWith(
      2,
      "resize",
      secondResize,
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(disposeViewportSession).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith(error);
  });

  it("creates the shared render shell from runtime background tuning", () => {
    const backgroundVisuals = { dust: true };
    const backdropMaterial = { name: "backdrop" };
    const backgroundLayers = [{ kind: "stars" }];
    const sceneBackground = { name: "scene-background" };
    const shell = { scene: {} };
    sharedViewportMocks.getRuntimeTuningDocument.mockReturnValue({
      visuals: {
        background: backgroundVisuals,
      },
    });
    sharedViewportMocks.createBackdropMaterial.mockReturnValue(
      backdropMaterial,
    );
    sharedViewportMocks.createBackgroundLayerConfigs.mockReturnValue(
      backgroundLayers,
    );
    sharedViewportMocks.createSceneBackgroundColor.mockReturnValue(
      sceneBackground,
    );
    sharedViewportMocks.createSharedCombatRenderShell.mockReturnValue(shell);
    const params = {
      camera: {},
      cameraState: {},
      currentSsaaLevel: 2,
      displayMode: "default",
      hostElement: {},
      renderer: {},
    } as unknown as Parameters<typeof createSharedCombatViewportRenderShell>[0];

    const result = createSharedCombatViewportRenderShell(params);

    expect(sharedViewportMocks.createBackdropMaterial).toHaveBeenCalledWith(
      backgroundVisuals,
    );
    expect(
      sharedViewportMocks.createBackgroundLayerConfigs,
    ).toHaveBeenCalledWith(backgroundVisuals);
    expect(sharedViewportMocks.createSceneBackgroundColor).toHaveBeenCalledWith(
      backgroundVisuals,
    );
    expect(
      sharedViewportMocks.createSharedCombatRenderShell,
    ).toHaveBeenCalledWith({
      ...params,
      backdropMaterial,
      backgroundLayers,
      createBackgroundLayer: sharedViewportMocks.createBackgroundLayer,
      sceneBackground,
    });
    expect(result).toBe(shell);
  });

  it("creates a shared camera and render shell context", () => {
    const camera = { name: "combat-camera" };
    const backgroundVisuals = { dust: true };
    const backdropMaterial = { name: "backdrop" };
    const backgroundLayers = [{ kind: "stars" }];
    const sceneBackground = { name: "scene-background" };
    const shell = { scene: {} };
    sharedViewportMocks.createCombatViewportCamera.mockReturnValue(camera);
    sharedViewportMocks.getRuntimeTuningDocument.mockReturnValue({
      visuals: {
        background: backgroundVisuals,
      },
    });
    sharedViewportMocks.createBackdropMaterial.mockReturnValue(
      backdropMaterial,
    );
    sharedViewportMocks.createBackgroundLayerConfigs.mockReturnValue(
      backgroundLayers,
    );
    sharedViewportMocks.createSceneBackgroundColor.mockReturnValue(
      sceneBackground,
    );
    sharedViewportMocks.createSharedCombatRenderShell.mockReturnValue(shell);
    const params = {
      cameraState: {},
      currentSsaaLevel: 2,
      displayMode: "default",
      hostElement: {},
      renderer: {},
    } as unknown as Parameters<
      typeof createSharedCombatViewportRenderContext
    >[0];

    const result = createSharedCombatViewportRenderContext(params);

    expect(sharedViewportMocks.createCombatViewportCamera).toHaveBeenCalled();
    expect(
      sharedViewportMocks.createSharedCombatRenderShell,
    ).toHaveBeenCalledWith({
      ...params,
      backdropMaterial,
      backgroundLayers,
      camera,
      createBackgroundLayer: sharedViewportMocks.createBackgroundLayer,
      sceneBackground,
    });
    expect(result).toEqual({
      camera,
      shell,
    });
  });

  it("wraps the normalized frame bundle for shared scene sync", () => {
    const presentationState = {
      gravityPulse: null,
      shieldImmediateFeedback: null,
    };
    sharedViewportMocks.syncSharedCombatScene.mockReturnValue(
      presentationState,
    );
    const background: TestViewportUpdateParams["background"] = {
      backgroundLayers: [],
      nowSec: 1,
      renderCenterX: 2,
      renderCenterY: 3,
    };
    const celestial = {
      neutronStar: {},
      planet: {},
      sun: {},
    } as unknown as TestViewportUpdateParams["celestial"];
    const viewportFrameBundle = {
      frame: {},
      resources: {},
    } as unknown as ViewportFrameBundle<
      SharedCombatCacheBody,
      TestRocketBody,
      TestBurst
    >;

    const result = updateSharedCombatViewport({
      background,
      celestial,
      viewportFrameBundle,
    });

    expect(sharedViewportMocks.syncSharedCombatScene).toHaveBeenCalledWith({
      background,
      celestial,
      viewport: {
        bundle: viewportFrameBundle,
      },
    });
    expect(result).toBe(presentationState);
  });
});
