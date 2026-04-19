import type { WebGPURenderer } from "three/webgpu";

export interface ViewportHostSize {
  aspect: number;
  height: number;
  width: number;
}

export interface ViewportRendererSizeState {
  height: number | null;
  pixelRatio: number | null;
  width: number | null;
}

export const createViewportRendererSizeState =
  (): ViewportRendererSizeState => ({
    height: null,
    pixelRatio: null,
    width: null,
  });

export const getViewportHostSize = (
  hostElement: HTMLDivElement,
): ViewportHostSize => {
  const width = Math.max(1, hostElement.clientWidth);
  const height = Math.max(1, hostElement.clientHeight);

  return {
    aspect: width / height,
    height,
    width,
  };
};

const getViewportPixelRatio = (
  hostElement: HTMLDivElement,
  maxPixelRatio: number,
) =>
  Math.min(
    hostElement.ownerDocument.defaultView?.devicePixelRatio || 1,
    maxPixelRatio,
  );

export const syncViewportRendererSize = ({
  hostElement,
  maxPixelRatio,
  renderer,
  sizeState,
}: {
  hostElement: HTMLDivElement;
  maxPixelRatio: number;
  renderer: Pick<WebGPURenderer, "setPixelRatio" | "setSize">;
  sizeState: ViewportRendererSizeState;
}) => {
  const hostSize = getViewportHostSize(hostElement);
  const pixelRatio = getViewportPixelRatio(hostElement, maxPixelRatio);

  if (sizeState.pixelRatio !== pixelRatio) {
    renderer.setPixelRatio(pixelRatio);
    sizeState.pixelRatio = pixelRatio;
  }

  if (
    sizeState.width !== hostSize.width ||
    sizeState.height !== hostSize.height
  ) {
    renderer.setSize(hostSize.width, hostSize.height, false);
    sizeState.width = hostSize.width;
    sizeState.height = hostSize.height;
  }

  return {
    ...hostSize,
    pixelRatio,
  };
};
