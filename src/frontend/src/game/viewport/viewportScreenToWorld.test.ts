import type { WebGPURenderer } from "three/webgpu";
import { describe, expect, it } from "vitest";
import { screenToViewportWorld } from "./viewportScreenToWorld";

const createRendererStub = ({
  height,
  left,
  top,
  width,
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}): Pick<WebGPURenderer, "domElement"> =>
  ({
    domElement: {
      getBoundingClientRect: () => ({
        height,
        left,
        top,
        width,
      }),
    },
  }) as Pick<WebGPURenderer, "domElement">;

describe("screenToViewportWorld", () => {
  it("maps viewport center to the camera render center", () => {
    const world = screenToViewportWorld({
      cameraState: {
        renderCenterX: 100,
        renderCenterY: -50,
        visibleWorldHeight: 100,
      },
      clientX: 110,
      clientY: 70,
      renderer: createRendererStub({
        height: 100,
        left: 10,
        top: 20,
        width: 200,
      }),
    });

    expect(world).toEqual({
      x: 100,
      y: -50,
    });
  });

  it("clamps off-viewport positions by default", () => {
    const world = screenToViewportWorld({
      cameraState: {
        renderCenterX: 100,
        renderCenterY: -50,
        visibleWorldHeight: 100,
      },
      clientX: 310,
      clientY: 70,
      renderer: createRendererStub({
        height: 100,
        left: 10,
        top: 20,
        width: 200,
      }),
    });

    expect(world).toEqual({
      x: 200,
      y: -50,
    });
  });

  it("can preserve off-viewport normalized positions", () => {
    const world = screenToViewportWorld({
      cameraState: {
        renderCenterX: 100,
        renderCenterY: -50,
        visibleWorldHeight: 100,
      },
      clampToViewport: false,
      clientX: 310,
      clientY: 70,
      renderer: createRendererStub({
        height: 100,
        left: 10,
        top: 20,
        width: 200,
      }),
    });

    expect(world).toEqual({
      x: 300,
      y: -50,
    });
  });
});
