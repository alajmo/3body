import {
  type Mesh,
  OrthographicCamera,
  type WebGPURenderer,
} from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import {
  applyViewportCameraFrame,
  COMBAT_VIEWPORT_CAMERA_DISTANCE,
  createCombatViewportCamera,
  resizeViewportCameraFrame,
} from "./viewportCameraFrame";

const createHostElement = ({
  height,
  width,
}: {
  height: number;
  width: number;
}) => {
  const hostElement = document.createElement("div") as HTMLDivElement;
  Object.defineProperty(hostElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(hostElement, "clientHeight", {
    configurable: true,
    value: height,
  });
  return hostElement;
};

describe("viewportCameraFrame", () => {
  it("creates the standard combat orthographic camera", () => {
    const camera = createCombatViewportCamera();

    expect(camera.left).toBe(-1);
    expect(camera.right).toBe(1);
    expect(camera.top).toBe(1);
    expect(camera.bottom).toBe(-1);
    expect(camera.near).toBe(-2000);
    expect(camera.far).toBe(2000);
    expect(camera.position.z).toBe(COMBAT_VIEWPORT_CAMERA_DISTANCE);
  });

  it("applies the camera frame and backdrop from the host aspect ratio", () => {
    const camera = new OrthographicCamera();
    const backdropMesh = {
      material: {},
      position: {
        set: vi.fn(),
      },
      scale: {
        set: vi.fn(),
      },
    } as unknown as Mesh;
    const cameraState = {
      centerX: 10,
      centerY: -20,
      renderCenterX: 0,
      renderCenterY: 0,
      shakeOffsetX: 3,
      shakeOffsetY: -4,
      visibleWorldHeight: 100,
    };

    applyViewportCameraFrame({
      backdropMesh,
      camera,
      cameraState,
      hostElement: createHostElement({
        height: 100,
        width: 200,
      }),
    });

    expect(cameraState.renderCenterX).toBe(13);
    expect(cameraState.renderCenterY).toBe(-24);
    expect(camera.left).toBe(-100);
    expect(camera.right).toBe(100);
    expect(camera.top).toBe(50);
    expect(camera.bottom).toBe(-50);
    expect(camera.position.x).toBe(13);
    expect(camera.position.y).toBe(-24);
    expect(camera.position.z).toBe(COMBAT_VIEWPORT_CAMERA_DISTANCE);
    expect(backdropMesh.position.set).toHaveBeenCalledWith(13, -24, -40);
    expect(backdropMesh.scale.set).toHaveBeenCalledWith(270, 135, 1);
  });

  it("resizes the renderer before applying the camera frame", () => {
    const camera = new OrthographicCamera();
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
    };
    const cameraState = {
      centerX: 5,
      centerY: 6,
      renderCenterX: 0,
      renderCenterY: 0,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
      visibleWorldHeight: 80,
    };

    resizeViewportCameraFrame({
      backdropMesh: null,
      camera,
      cameraState,
      hostElement: createHostElement({
        height: 100,
        width: 300,
      }),
      maxPixelRatio: 2,
      renderer: renderer as unknown as WebGPURenderer,
      sizeState: {
        height: null,
        pixelRatio: null,
        width: null,
      },
    });

    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
    expect(renderer.setSize).toHaveBeenCalledWith(300, 100, false);
    expect(camera.left).toBe(-120);
    expect(camera.right).toBe(120);
    expect(cameraState.renderCenterX).toBe(5);
    expect(cameraState.renderCenterY).toBe(6);
  });

  it("ignores resize requests before the renderer is available", () => {
    const camera = new OrthographicCamera();
    const cameraState = {
      centerX: 5,
      centerY: 6,
      renderCenterX: 0,
      renderCenterY: 0,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
      visibleWorldHeight: 80,
    };

    resizeViewportCameraFrame({
      backdropMesh: null,
      camera,
      cameraState,
      hostElement: createHostElement({
        height: 100,
        width: 300,
      }),
      maxPixelRatio: 2,
      renderer: null,
      sizeState: {
        height: null,
        pixelRatio: null,
        width: null,
      },
    });

    expect(cameraState.renderCenterX).toBe(0);
    expect(cameraState.renderCenterY).toBe(0);
  });
});
