import type { Mesh, WebGPURenderer } from "three/webgpu";
import { OrthographicCamera } from "three/webgpu";
import { syncBackdropFrame } from "../showcaseVisuals";
import {
  getViewportHostSize,
  syncViewportRendererSize,
  type ViewportRendererSizeState,
} from "./rendererSizing";

export const COMBAT_VIEWPORT_CAMERA_DISTANCE = 100;
const COMBAT_VIEWPORT_BACKDROP_OVERDRAW = 1.35;

export interface ViewportCameraFrameState {
  centerX: number;
  centerY: number;
  renderCenterX: number;
  renderCenterY: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
  visibleWorldHeight: number;
}

export const createCombatViewportCamera = () => {
  const camera = new OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
  camera.position.set(0, 0, COMBAT_VIEWPORT_CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);
  return camera;
};

export const applyViewportCameraFrame = ({
  backdropMesh,
  camera,
  cameraState,
  hostElement,
}: {
  backdropMesh: Mesh | null;
  camera: OrthographicCamera | null;
  cameraState: ViewportCameraFrameState;
  hostElement: HTMLDivElement;
}) => {
  if (camera === null) {
    return;
  }

  const { aspect } = getViewportHostSize(hostElement);
  const worldHalfHeight = cameraState.visibleWorldHeight / 2;
  const worldHalfWidth = worldHalfHeight * aspect;
  const renderCenterX = cameraState.centerX + cameraState.shakeOffsetX;
  const renderCenterY = cameraState.centerY + cameraState.shakeOffsetY;

  cameraState.renderCenterX = renderCenterX;
  cameraState.renderCenterY = renderCenterY;

  camera.left = -worldHalfWidth;
  camera.right = worldHalfWidth;
  camera.top = worldHalfHeight;
  camera.bottom = -worldHalfHeight;
  camera.position.set(
    renderCenterX,
    renderCenterY,
    COMBAT_VIEWPORT_CAMERA_DISTANCE,
  );
  camera.lookAt(renderCenterX, renderCenterY, 0);
  camera.updateProjectionMatrix();

  syncBackdropFrame({
    backdropMesh,
    centerX: renderCenterX,
    centerY: renderCenterY,
    height: worldHalfHeight * 2 * COMBAT_VIEWPORT_BACKDROP_OVERDRAW,
    width: worldHalfWidth * 2 * COMBAT_VIEWPORT_BACKDROP_OVERDRAW,
  });
};

export const resizeViewportCameraFrame = ({
  backdropMesh,
  camera,
  cameraState,
  hostElement,
  maxPixelRatio,
  renderer,
  sizeState,
}: {
  backdropMesh: Mesh | null;
  camera: OrthographicCamera | null;
  cameraState: ViewportCameraFrameState;
  hostElement: HTMLDivElement;
  maxPixelRatio: number;
  renderer: WebGPURenderer | null;
  sizeState: ViewportRendererSizeState;
}) => {
  if (renderer === null) {
    return;
  }

  syncViewportRendererSize({
    hostElement,
    maxPixelRatio,
    renderer,
    sizeState,
  });
  applyViewportCameraFrame({
    backdropMesh,
    camera,
    cameraState,
    hostElement,
  });
};
