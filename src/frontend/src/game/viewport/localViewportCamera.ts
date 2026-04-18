import type { Vec2 } from "@3body/shared";
import { clamp, lerp } from "@3body/shared";
import type { Mesh, OrthographicCamera, WebGPURenderer } from "three/webgpu";
import type { CombatSandboxDrone, CombatSandboxPlanet } from "../combatSandbox";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import { syncBackdropFrame } from "../showcaseVisuals";

export const LOCAL_VIEWPORT_CAMERA_DISTANCE = 100;
const CAMERA_FOLLOW_LERP = 6.4;
const CAMERA_ZOOM_LERP = 5.2;
const MAX_CAMERA_SHAKE_WORLD_OFFSET = 34;
const BACKDROP_OVERDRAW = 1.35;

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

const getLocalViewportCameraHeights = () => {
  const cameraTuning = getRuntimeTuningDocument().gameplay.camera;

  return {
    followWorldHeight: cameraTuning.viewportWorldHeight,
    readModeWorldHeight: cameraTuning.readModeWorldHeight,
  };
};

const getSandboxFocusPlanet = (
  planets: readonly {
    alive: boolean;
    id: number;
    label?: string;
    pos: Vec2;
  }[],
  playerPlanetId: number,
) =>
  planets.find((planet) => planet.id === playerPlanetId) ??
  planets.find((planet) => planet.alive) ??
  planets[0] ??
  null;

const getSandboxFocusBody = (state: {
  drones: readonly {
    id: number;
    pos: Vec2;
  }[];
  planets: readonly {
    alive: boolean;
    id: number;
    label?: string;
    pos: Vec2;
  }[];
  player: {
    activeDroneId: number | null;
    controlMode: "planet" | "drone";
    planetId: number;
  };
}) => {
  const activeDrone =
    state.player.controlMode === "drone" && state.player.activeDroneId !== null
      ? (state.drones.find(
          (drone) => drone.id === state.player.activeDroneId,
        ) ?? null)
      : null;

  if (activeDrone !== null) {
    return {
      label: "Drone",
      pos: activeDrone.pos,
    };
  }

  const focusPlanet = getSandboxFocusPlanet(
    state.planets,
    state.player.planetId,
  );
  return focusPlanet === null
    ? null
    : {
        label: focusPlanet.label ?? "Planet",
        pos: focusPlanet.pos,
      };
};

export const getLocalViewportControlledBody = (state: {
  drones: readonly CombatSandboxDrone[];
  planets: readonly CombatSandboxPlanet[];
  player: {
    activeDroneId: number | null;
    controlMode: "planet" | "drone";
    planetId: number;
  };
}) => {
  if (
    state.player.controlMode === "drone" &&
    state.player.activeDroneId !== null
  ) {
    return (
      state.drones.find((drone) => drone.id === state.player.activeDroneId) ??
      null
    );
  }

  return (
    state.planets.find((planet) => planet.id === state.player.planetId) ?? null
  );
};

export const createLocalViewportCameraState = (): LocalViewportCameraState => ({
  centerX: 0,
  centerY: 0,
  renderCenterX: 0,
  renderCenterY: 0,
  shakeOffsetX: 0,
  shakeOffsetY: 0,
  visibleWorldHeight: getLocalViewportCameraHeights().followWorldHeight,
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

  const width = Math.max(1, hostElement.clientWidth);
  const height = Math.max(1, hostElement.clientHeight);
  const aspect = width / height;
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
}: {
  backdropMesh: Mesh | null;
  camera: OrthographicCamera | null;
  cameraState: LocalViewportCameraState;
  hostElement: HTMLDivElement;
  maxPixelRatio: number;
  renderer: WebGPURenderer | null;
}) => {
  if (renderer === null || camera === null) {
    return;
  }

  const width = Math.max(1, hostElement.clientWidth);
  const height = Math.max(1, hostElement.clientHeight);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.setSize(width, height, false);
  applyLocalViewportCameraFrame({
    backdropMesh,
    camera,
    cameraState,
    hostElement,
  });
};

export const getLocalViewportCameraFrame = ({
  readModeHeld,
  state,
}: {
  readModeHeld: boolean;
  state: {
    blackHole: { pos: Vec2; radius: number } | null;
    drones: readonly CombatSandboxDrone[];
    planets: readonly CombatSandboxPlanet[];
    player: {
      activeDroneId: number | null;
      controlMode: "planet" | "drone";
      planetId: number;
    };
    suns: readonly {
      pos: Vec2;
      radius: number;
      swallowedAtSec: number | null;
    }[];
  };
}): CameraFrame => {
  const { followWorldHeight, readModeWorldHeight } =
    getLocalViewportCameraHeights();

  const focusBody = getSandboxFocusBody(state);
  return {
    centerX: focusBody !== null ? focusBody.pos.x : 0,
    centerY: focusBody !== null ? focusBody.pos.y : 0,
    visibleWorldHeight: readModeHeld ? readModeWorldHeight : followWorldHeight,
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
  frame,
  frameDeltaSec,
  hostElement,
  nowSec,
}: {
  backdropMesh: Mesh | null;
  camera: OrthographicCamera | null;
  cameraShake: number;
  cameraState: LocalViewportCameraState;
  frame: CameraFrame;
  frameDeltaSec: number;
  hostElement: HTMLDivElement;
  nowSec: number;
}) => {
  const { followWorldHeight } = getLocalViewportCameraHeights();
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

  const shakeMagnitude =
    MAX_CAMERA_SHAKE_WORLD_OFFSET *
    (frame.visibleWorldHeight / followWorldHeight) *
    cameraShake *
    cameraShake;
  cameraState.shakeOffsetX =
    shakeMagnitude *
    (Math.sin(nowSec * 64 + 0.4) * 0.68 + Math.sin(nowSec * 117 + 1.7) * 0.32);
  cameraState.shakeOffsetY =
    shakeMagnitude *
    (Math.cos(nowSec * 73 + 0.8) * 0.62 + Math.sin(nowSec * 109 + 2.1) * 0.38);

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
