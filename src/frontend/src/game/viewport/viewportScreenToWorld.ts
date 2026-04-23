import type { Vec2 } from "@3body/shared";
import { clamp, lerp } from "@3body/shared";
import type { WebGPURenderer } from "three/webgpu";

interface ViewportScreenToWorldCameraState {
  renderCenterX: number;
  renderCenterY: number;
  visibleWorldHeight: number;
}

export const screenToViewportWorld = ({
  cameraState,
  clampToViewport = true,
  clientX,
  clientY,
  renderer,
}: {
  cameraState: ViewportScreenToWorldCameraState;
  clampToViewport?: boolean;
  clientX: number;
  clientY: number;
  renderer: Pick<WebGPURenderer, "domElement">;
}): Vec2 => {
  const rect = renderer.domElement.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const aspect = width / height;
  const halfHeight = cameraState.visibleWorldHeight / 2;
  const halfWidth = halfHeight * aspect;
  const normalize = (value: number) =>
    clampToViewport ? clamp(value, 0, 1) : value;
  const normalizedX = normalize((clientX - rect.left) / width);
  const normalizedY = normalize((clientY - rect.top) / height);

  return {
    x: cameraState.renderCenterX + lerp(-halfWidth, halfWidth, normalizedX),
    y: cameraState.renderCenterY + lerp(halfHeight, -halfHeight, normalizedY),
  };
};
