import type { WebGPURenderer } from "three/webgpu";

interface CreateViewportAnimationLoopControllerOptions {
  hostElement: HTMLElement;
  onActiveChange?: (active: boolean) => void;
  onRenderError?: (error: unknown) => void;
  renderFrame: (timeMs?: number) => void;
  renderer: Pick<WebGPURenderer, "setAnimationLoop">;
}

export const createViewportAnimationLoopController = ({
  hostElement,
  onActiveChange,
  onRenderError,
  renderFrame,
  renderer,
}: CreateViewportAnimationLoopControllerOptions): {
  dispose: () => void;
  setSuspended: (value: boolean) => void;
} => {
  const documentTarget = hostElement.ownerDocument;
  const windowTarget = documentTarget.defaultView;
  const IntersectionObserverCtor = windowTarget?.IntersectionObserver;
  let disposed = false;
  let active = false;
  let suspended = false;
  let pageVisible = documentTarget.visibilityState !== "hidden";
  let hostVisible = IntersectionObserverCtor === undefined;
  let intersectionObserver: IntersectionObserver | null = null;
  const renderFrameSafely = (timeMs?: number) => {
    try {
      renderFrame(timeMs);
    } catch (error) {
      suspended = true;
      syncLoopState();
      onRenderError?.(error);
    }
  };

  const syncLoopState = () => {
    const nextActive =
      !disposed &&
      !suspended &&
      pageVisible &&
      hostVisible &&
      hostElement.isConnected;

    if (nextActive === active) {
      return;
    }

    active = nextActive;
    renderer.setAnimationLoop(active ? renderFrameSafely : null);
    onActiveChange?.(active);
  };

  const handleVisibilityChange = () => {
    pageVisible = documentTarget.visibilityState !== "hidden";
    syncLoopState();
  };

  documentTarget.addEventListener("visibilitychange", handleVisibilityChange);

  if (IntersectionObserverCtor !== undefined) {
    intersectionObserver = new IntersectionObserverCtor((entries) => {
      const entry = entries.find(
        (candidate) => candidate.target === hostElement,
      );
      if (entry === undefined) {
        return;
      }

      hostVisible = entry.isIntersecting;
      syncLoopState();
    });
    intersectionObserver.observe(hostElement);
  }

  syncLoopState();

  return {
    setSuspended(value) {
      if (disposed) {
        return;
      }

      const nextSuspended = value === true;
      if (nextSuspended === suspended) {
        return;
      }

      suspended = nextSuspended;
      syncLoopState();
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      documentTarget.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      intersectionObserver?.disconnect();
      intersectionObserver = null;
      if (active) {
        active = false;
        renderer.setAnimationLoop(null);
        onActiveChange?.(false);
      } else {
        renderer.setAnimationLoop(null);
      }
    },
  };
};
