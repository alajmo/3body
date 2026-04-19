import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY,
  reportViewportRendererFailure,
} from "./rendererBootstrap";

describe("renderer bootstrap backend policy", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    delete (window as Window & { __3bodyRendererValidation?: unknown })
      .__3bodyRendererValidation;
  });

  it("ships with native WebGPU as the primary backend", () => {
    expect(PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY.forceWebGL).toBe(false);
    expect(PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY.label).toBe("webgpu");
  });

  it("replaces the host with a visible failure message for renderer runtime errors", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const hostElement = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    hostElement.append(canvas);

    reportViewportRendererFailure({
      error: new Error("GPUDevice createBuffer failed"),
      failureLogLabel: "test viewport",
      hostElement,
      isDisposed: () => false,
    });

    expect(hostElement.childElementCount).toBe(1);
    const failureElement = hostElement.querySelector(".viewport-renderer-failure");
    expect(failureElement).not.toBeNull();
    expect(failureElement?.textContent).toContain("test viewport failed");
    expect(failureElement?.textContent).toContain(
      "Error: GPUDevice createBuffer failed",
    );
    consoleErrorSpy.mockRestore();
  });

  it("does not replace the host with a failure message after disposal", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const hostElement = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    hostElement.append(canvas);

    reportViewportRendererFailure({
      error: new Error("some unrelated render error"),
      failureLogLabel: "test viewport",
      hostElement,
      isDisposed: () => true,
    });

    expect(hostElement.querySelector(".game-canvas")).toBe(canvas);
    consoleErrorSpy.mockRestore();
  });

  it("records failure entries when renderer validation is enabled", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    window.history.pushState({}, "", "/?rendererValidation=1");
    const hostElement = document.createElement("div");

    reportViewportRendererFailure({
      error: new Error("GPUDevice createBuffer failed"),
      failureLogLabel: "test viewport",
      hostElement,
      isDisposed: () => false,
    });

    const validationApi = (
      window as Window & {
        __3bodyRendererValidation?: { getState: () => Array<Record<string, unknown>> };
      }
    ).__3bodyRendererValidation;

    expect(validationApi?.getState()).toEqual([
      expect.objectContaining({
        backend: null,
        backendPolicy: null,
        error: "Error: GPUDevice createBuffer failed",
        label: "test viewport",
        status: "failed",
      }),
    ]);
    consoleErrorSpy.mockRestore();
  });
});
