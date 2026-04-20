import type { Vec2 } from "@3body/shared";
import { clamp, lerp } from "@3body/shared";
import type { Mesh, OrthographicCamera, WebGPURenderer } from "three/webgpu";
import type { CombatSandboxPlanet } from "../combatSandbox";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import { syncBackdropFrame } from "../showcaseVisuals";
import { getViewportCameraShakeOffsets } from "./cameraShake";
import {
  getViewportHostSize,
  syncViewportRendererSize,
  type ViewportRendererSizeState,
} from "./rendererSizing";

export const LOCAL_VIEWPORT_CAMERA_DISTANCE = 100;
const CAMERA_FOLLOW_LERP = 6.4;
const CAMERA_ZOOM_LERP = 5.2;
const BACKDROP_OVERDRAW = 1.35;
const STAGE_CAMERA_PADDING = 520;

export interface LocalViewportCameraState {
  centerX: number;
  centerY: number;
  renderCenterX: number;
  renderCenterY: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
  visibleWorldHeight: number;
}

interface CameraFrame {
  centerX: number;
  centerY: number;
  visibleWorldHeight: number;
}

const easingAlpha = (rate: number, dtSec: number): number =>
  1 - Math.exp(-rate * dtSec);

const getLocalViewportCameraHeights = (cameraWorldHeightOverride?: number) => {
  const cameraTuning = getRuntimeTuningDocument().gameplay.camera;

  return {
    followWorldHeight:
      cameraWorldHeightOverride ?? cameraTuning.gameplayCameraWorldHeight,
  };
};

const expandCameraBounds = (
  bounds: {
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
  },
  pos: Vec2,
  radius: number,
) => {
  bounds.minX = Math.min(bounds.minX, pos.x - radius);
  bounds.maxX = Math.max(bounds.maxX, pos.x + radius);
  bounds.minY = Math.min(bounds.minY, pos.y - radius);
  bounds.maxY = Math.max(bounds.maxY, pos.y + radius);
};

const getSandboxFocusPlanet = (
  planets: readonly {
    alive: boolean;
    id: number;
    label?: string;
    pos: Vec2;
  }[],
  playerPlanetId: number,
  followAlivePlanetWhenPlayerDown: boolean,
) =>
  planets.find(
    (planet) =>
      planet.id === playerPlanetId &&
      (!followAlivePlanetWhenPlayerDown || planet.alive),
  ) ??
  planets.find((planet) => planet.alive) ??
  planets[0] ??
  null;

const getSandboxFocusBody = (state: {
  planets: readonly {
    alive: boolean;
    id: number;
    label?: string;
    pos: Vec2;
  }[];
  player: {
    planetId: number;
  };
  followAlivePlanetWhenPlayerDown: boolean;
}) => {
  const focusPlanet = getSandboxFocusPlanet(
    state.planets,
    state.player.planetId,
    state.followAlivePlanetWhenPlayerDown,
  );
  return focusPlanet === null
    ? null
    : {
        label: focusPlanet.label ?? "Planet",
        pos: focusPlanet.pos,
      };
};

export const getLocalViewportControlledBody = (state: {
  planets: readonly CombatSandboxPlanet[];
  player: {
    planetId: number;
  };
}) =>
  state.planets.find((planet) => planet.id === state.player.planetId) ?? null;

export const createLocalViewportCameraState = ({
  cameraWorldHeightOverride,
}: {
  cameraWorldHeightOverride?: number;
} = {}): LocalViewportCameraState => ({
  centerX: 0,
  centerY: 0,
  renderCenterX: 0,
  renderCenterY: 0,
  shakeOffsetX: 0,
  shakeOffsetY: 0,
  visibleWorldHeight: getLocalViewportCameraHeights(cameraWorldHeightOverride)
    .followWorldHeight,
});

export const applyLocalViewportCameraFrame = ({
  backdropMesh,
  camera,
  cameraState,
  hostElement,
}: {
  backdropMesh: Mesh | null;
  camera: OrthographicCamera | null;
  cameraState: LocalViewportCameraState;
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
    LOCAL_VIEWPORT_CAMERA_DISTANCE,
  );
  camera.lookAt(renderCenterX, renderCenterY, 0);
  camera.updateProjectionMatrix();

  syncBackdropFrame({
    backdropMesh,
    centerX: renderCenterX,
    centerY: renderCenterY,
    height: worldHalfHeight * 2 * BACKDROP_OVERDRAW,
    width: worldHalfWidth * 2 * BACKDROP_OVERDRAW,
  });
};

export const resizeLocalViewportCamera = ({
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
  cameraState: LocalViewportCameraState;
  hostElement: HTMLDivElement;
  maxPixelRatio: number;
  renderer: WebGPURenderer | null;
  sizeState: ViewportRendererSizeState;
}) => {
  if (renderer === null || camera === null) {
    return;
  }

  syncViewportRendererSize({
    hostElement,
    maxPixelRatio,
    renderer,
    sizeState,
  });
  applyLocalViewportCameraFrame({
    backdropMesh,
    camera,
    cameraState,
    hostElement,
  });
};

export const getLocalViewportCameraFrame = ({
  aspect = 1,
  cameraWorldHeightOverride,
  followAlivePlanetWhenPlayerDown = false,
  useArenaStageCamera = false,
  state,
}: {
  aspect?: number;
  cameraWorldHeightOverride?: number;
  followAlivePlanetWhenPlayerDown?: boolean;
  useArenaStageCamera?: boolean;
  state: {
    blackHole: { pos: Vec2; radius: number } | null;
    planets: readonly CombatSandboxPlanet[];
    player: {
      planetId: number;
    };
    suns: readonly {
      pos: Vec2;
      radius: number;
      swallowedAtSec: number | null;
    }[];
  };
}): CameraFrame => {
  const { followWorldHeight } = getLocalViewportCameraHeights(
    cameraWorldHeightOverride,
  );
  if (useArenaStageCamera) {
    const bounds = {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
    };
    const arenaRadius = Math.max(
      0,
      getRuntimeTuningDocument().gameplay.arena.radius,
    );
    const safeAspect = Math.max(0.1, aspect);

    if (arenaRadius > 0) {
      expandCameraBounds(bounds, { x: 0, y: 0 }, arenaRadius);
    }

    if (state.blackHole !== null) {
      expandCameraBounds(
        bounds,
        state.blackHole.pos,
        state.blackHole.radius * 2.4,
      );
    }

    for (const sun of state.suns) {
      if (sun.swallowedAtSec !== null) {
        continue;
      }

      expandCameraBounds(bounds, sun.pos, sun.radius * 2.25);
    }

    for (const planet of state.planets) {
      if (!planet.alive) {
        continue;
      }

      expandCameraBounds(bounds, planet.pos, planet.radius * 1.8);
    }

    if (Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY)) {
      const halfWidth = (bounds.maxX - bounds.minX) / 2 + STAGE_CAMERA_PADDING;
      const halfHeight = (bounds.maxY - bounds.minY) / 2 + STAGE_CAMERA_PADDING;

      return {
        centerX: (bounds.minX + bounds.maxX) / 2,
        centerY: (bounds.minY + bounds.maxY) / 2,
        visibleWorldHeight: Math.max(
          followWorldHeight,
          halfHeight * 2,
          (halfWidth * 2) / safeAspect,
        ),
      };
    }
  }

  const focusBody = getSandboxFocusBody({
    ...state,
    followAlivePlanetWhenPlayerDown,
  });
  return {
    centerX: focusBody !== null ? focusBody.pos.x : 0,
    centerY: focusBody !== null ? focusBody.pos.y : 0,
    visibleWorldHeight: followWorldHeight,
  };
};

export const syncLocalViewportCameraToFrame = ({
  backdropMesh,
  camera,
  cameraState,
  frame,
  hostElement,
}: {
  backdropMesh: Mesh | null;
  camera: OrthographicCamera | null;
  cameraState: LocalViewportCameraState;
  frame: CameraFrame;
  hostElement: HTMLDivElement;
}) => {
  cameraState.visibleWorldHeight = frame.visibleWorldHeight;
  cameraState.centerX = frame.centerX;
  cameraState.centerY = frame.centerY;
  applyLocalViewportCameraFrame({
    backdropMesh,
    camera,
    cameraState,
    hostElement,
  });
};

export const updateLocalViewportCamera = ({
  backdropMesh,
  camera,
  cameraShake,
  cameraState,
  cameraWorldHeightOverride,
  frame,
  frameDeltaSec,
  hostElement,
  nowSec,
}: {
  backdropMesh: Mesh | null;
  camera: OrthographicCamera | null;
  cameraShake: number;
  cameraState: LocalViewportCameraState;
  cameraWorldHeightOverride?: number;
  frame: CameraFrame;
  frameDeltaSec: number;
  hostElement: HTMLDivElement;
  nowSec: number;
}) => {
  const { followWorldHeight } = getLocalViewportCameraHeights(
    cameraWorldHeightOverride,
  );
  const cameraMoveAlpha = easingAlpha(CAMERA_FOLLOW_LERP, frameDeltaSec);
  const cameraZoomAlpha = easingAlpha(CAMERA_ZOOM_LERP, frameDeltaSec);

  cameraState.centerX = lerp(
    cameraState.centerX,
    frame.centerX,
    cameraMoveAlpha,
  );
  cameraState.centerY = lerp(
    cameraState.centerY,
    frame.centerY,
    cameraMoveAlpha,
  );
  cameraState.visibleWorldHeight = lerp(
    cameraState.visibleWorldHeight,
    frame.visibleWorldHeight,
    cameraZoomAlpha,
  );

  const shakeOffsets = getViewportCameraShakeOffsets({
    cameraShake,
    followWorldHeight,
    nowSec,
    visibleWorldHeight: frame.visibleWorldHeight,
  });
  cameraState.shakeOffsetX = shakeOffsets.x;
  cameraState.shakeOffsetY = shakeOffsets.y;

  applyLocalViewportCameraFrame({
    backdropMesh,
    camera,
    cameraState,
    hostElement,
  });
};

export const screenToLocalViewportWorld = ({
  cameraState,
  clientX,
  clientY,
  renderer,
}: {
  cameraState: LocalViewportCameraState;
  clientX: number;
  clientY: number;
  renderer: WebGPURenderer;
}): Vec2 => {
  const rect = renderer.domElement.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const aspect = width / height;
  const halfHeight = cameraState.visibleWorldHeight / 2;
  const halfWidth = halfHeight * aspect;
  const normalizedX = clamp((clientX - rect.left) / width, 0, 1);
  const normalizedY = clamp((clientY - rect.top) / height, 0, 1);

  return {
    x: cameraState.renderCenterX + lerp(-halfWidth, halfWidth, normalizedX),
    y: cameraState.renderCenterY + lerp(halfHeight, -halfHeight, normalizedY),
  };
};
