import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewportAnimationLoopController } from "./animationLoopController";

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  emit(entry: Partial<IntersectionObserverEntry>) {
    this.callback(
      [
        {
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: entry.isIntersecting ? 1 : 0,
          intersectionRect: {} as DOMRectReadOnly,
          isIntersecting: false,
          rootBounds: null,
          target: entry.target as Element,
          time: 0,
          ...entry,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

const setDocumentVisibilityState = (value: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
};

afterEach(() => {
  MockIntersectionObserver.instances = [];
  vi.unstubAllGlobals();
  setDocumentVisibilityState("visible");
});

describe("createViewportAnimationLoopController", () => {
  it("starts and stops the renderer loop as the host viewport enters and leaves view", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const hostElement = document.createElement("div");
    document.body.append(hostElement);
    const renderer = {
      setAnimationLoop: vi.fn(),
    };
    const onActiveChange = vi.fn();

    createViewportAnimationLoopController({
      hostElement,
      onActiveChange,
      renderFrame: vi.fn(),
      renderer,
    });

    expect(renderer.setAnimationLoop).not.toHaveBeenCalled();

    MockIntersectionObserver.instances[0]!.emit({
      isIntersecting: true,
      target: hostElement,
    });

    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(
      expect.any(Function),
    );
    expect(onActiveChange).toHaveBeenLastCalledWith(true);

    MockIntersectionObserver.instances[0]!.emit({
      isIntersecting: false,
      target: hostElement,
    });

    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps the loop paused while the page is hidden and resumes it when visibility returns", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    setDocumentVisibilityState("hidden");
    const hostElement = document.createElement("div");
    document.body.append(hostElement);
    const renderer = {
      setAnimationLoop: vi.fn(),
    };

    createViewportAnimationLoopController({
      hostElement,
      renderFrame: vi.fn(),
      renderer,
    });

    MockIntersectionObserver.instances[0]!.emit({
      isIntersecting: true,
      target: hostElement,
    });

    expect(renderer.setAnimationLoop).not.toHaveBeenCalled();

    setDocumentVisibilityState("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(
      expect.any(Function),
    );
  });

  it("suspends the loop when requested and resumes when cleared", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const hostElement = document.createElement("div");
    document.body.append(hostElement);
    const renderer = {
      setAnimationLoop: vi.fn(),
    };

    const controller = createViewportAnimationLoopController({
      hostElement,
      renderFrame: vi.fn(),
      renderer,
    });

    MockIntersectionObserver.instances[0]!.emit({
      isIntersecting: true,
      target: hostElement,
    });

    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(
      expect.any(Function),
    );

    controller.setSuspended(true);

    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);

    controller.setSuspended(false);

    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(
      expect.any(Function),
    );
  });
});
