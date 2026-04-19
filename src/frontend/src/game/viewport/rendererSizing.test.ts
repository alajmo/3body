import { describe, expect, it, vi } from "vitest";
import {
  createViewportRendererSizeState,
  syncViewportRendererSize,
} from "./rendererSizing";

const setHostSize = (
  hostElement: HTMLDivElement,
  width: number,
  height: number,
) => {
  Object.defineProperty(hostElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(hostElement, "clientHeight", {
    configurable: true,
    value: height,
  });
};

const setDevicePixelRatio = (value: number) => {
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value,
  });
};

describe("syncViewportRendererSize", () => {
  it("applies the initial renderer size and clamped pixel ratio", () => {
    setDevicePixelRatio(3);
    const hostElement = document.createElement("div");
    setHostSize(hostElement, 640, 360);
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
    };

    const result = syncViewportRendererSize({
      hostElement,
      maxPixelRatio: 2,
      renderer,
      sizeState: createViewportRendererSizeState(),
    });

    expect(result).toEqual({
      aspect: 640 / 360,
      height: 360,
      pixelRatio: 2,
      width: 640,
    });
    expect(renderer.setPixelRatio).toHaveBeenCalledOnce();
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);
    expect(renderer.setSize).toHaveBeenCalledOnce();
    expect(renderer.setSize).toHaveBeenCalledWith(640, 360, false);
  });

  it("skips renderer size work when nothing changed", () => {
    setDevicePixelRatio(1.5);
    const hostElement = document.createElement("div");
    setHostSize(hostElement, 800, 600);
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
    };
    const sizeState = createViewportRendererSizeState();

    syncViewportRendererSize({
      hostElement,
      maxPixelRatio: 2,
      renderer,
      sizeState,
    });
    syncViewportRendererSize({
      hostElement,
      maxPixelRatio: 2,
      renderer,
      sizeState,
    });

    expect(renderer.setPixelRatio).toHaveBeenCalledOnce();
    expect(renderer.setSize).toHaveBeenCalledOnce();
  });

  it("updates pixel ratio without resizing when only DPR changes", () => {
    setDevicePixelRatio(1);
    const hostElement = document.createElement("div");
    setHostSize(hostElement, 960, 540);
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
    };
    const sizeState = createViewportRendererSizeState();

    syncViewportRendererSize({
      hostElement,
      maxPixelRatio: 2,
      renderer,
      sizeState,
    });

    setDevicePixelRatio(1.75);
    syncViewportRendererSize({
      hostElement,
      maxPixelRatio: 2,
      renderer,
      sizeState,
    });

    expect(renderer.setPixelRatio).toHaveBeenCalledTimes(2);
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1.75);
    expect(renderer.setSize).toHaveBeenCalledOnce();
  });

  it("resizes without resetting pixel ratio when only dimensions change", () => {
    setDevicePixelRatio(2);
    const hostElement = document.createElement("div");
    setHostSize(hostElement, 1024, 768);
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
    };
    const sizeState = createViewportRendererSizeState();

    syncViewportRendererSize({
      hostElement,
      maxPixelRatio: 2,
      renderer,
      sizeState,
    });

    setHostSize(hostElement, 1280, 720);
    syncViewportRendererSize({
      hostElement,
      maxPixelRatio: 2,
      renderer,
      sizeState,
    });

    expect(renderer.setPixelRatio).toHaveBeenCalledOnce();
    expect(renderer.setSize).toHaveBeenCalledTimes(2);
    expect(renderer.setSize).toHaveBeenLastCalledWith(1280, 720, false);
  });
});
