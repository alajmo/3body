import type { Vec2 } from "@3body/shared";
import { ARENA_RADIUS, clamp, lerp } from "@3body/shared";
import type { Mesh, OrthographicCamera, WebGPURenderer } from "three/webgpu";
import type {
  CombatSandboxDrone,
  CombatSandboxPlanet,
} from "../combatSandbox";
import { getRenderedPlanetRadius } from "../planetVisualTuning";

export const LOCAL_VIEWPORT_CAMERA_DISTANCE = 100;
const FULL_VIEW_WORLD_HEIGHT = ARENA_RADIUS * 2.25;
const FOLLOW_VIEW_WORLD_HEIGHT = ARENA_RADIUS * 0.92;
const READ_MODE_WORLD_HEIGHT = ARENA_RADIUS * 1.52;
const FULL_VIEW_PADDING = 260;
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

const getSandboxFocusPlanet = (
  planets: readonly {
    alive: boolean;
    id: number;
    label?: string;
    pos: Vec2;
  }[],
  playerPlanetId: number,
) =>
  planets.find((planet) => planet.id === playerPlanetId && planet.alive) ??
  planets.find((planet) => planet.alive) ??
  planets.find((planet) => planet.id === playerPlanetId) ??
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

const getFullViewFrame = (
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
  },
  viewportAspect: number,
): CameraFrame => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includeCircle = (x: number, y: number, radius: number) => {
    minX = Math.min(minX, x - radius);
    maxX = Math.max(maxX, x + radius);
    minY = Math.min(minY, y - radius);
    maxY = Math.max(maxY, y + radius);
  };

  for (const sun of state.suns) {
    if (sun.swallowedAtSec !== null) {
      continue;
    }

    includeCircle(sun.pos.x, sun.pos.y, sun.radius);
  }

  for (const planet of state.planets) {
    if (!planet.alive) {
      continue;
    }

    includeCircle(
      planet.pos.x,
      planet.pos.y,
      getRenderedPlanetRadius(planet),
    );
  }

  if (state.blackHole !== null) {
    includeCircle(
      state.blackHole.pos.x,
      state.blackHole.pos.y,
      state.blackHole.radius,
    );
  }

  const controlledBody = getLocalViewportControlledBody(state);
  if (controlledBody !== null) {
    includeCircle(
      controlledBody.pos.x,
      controlledBody.pos.y,
      controlledBody.radius,
    );
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      centerX: 0,
      centerY: 0,
      visibleWorldHeight: FULL_VIEW_WORLD_HEIGHT,
    };
  }

  const paddedWidth = maxX - minX + FULL_VIEW_PADDING * 2;
  const paddedHeight = maxY - minY + FULL_VIEW_PADDING * 2;
  const safeAspect = Math.max(0.5, viewportAspect);

  return {
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
    visibleWorldHeight: Math.max(
      FULL_VIEW_WORLD_HEIGHT,
      paddedHeight,
      paddedWidth / safeAspect,
    ),
  };
};

export const createLocalViewportCameraState = (): LocalViewportCameraState => ({
  centerX: 0,
  centerY: 0,
  renderCenterX: 0,
  renderCenterY: 0,
  shakeOffsetX: 0,
  shakeOffsetY: 0,
  visibleWorldHeight: FOLLOW_VIEW_WORLD_HEIGHT,
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

  if (backdropMesh !== null) {
    backdropMesh.position.set(renderCenterX, renderCenterY, -40);
    backdropMesh.scale.set(
      worldHalfWidth * 2 * BACKDROP_OVERDRAW,
      worldHalfHeight * 2 * BACKDROP_OVERDRAW,
      1,
    );
  }
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

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, maxPixelRatio),
  );
  renderer.setSize(width, height, false);
  applyLocalViewportCameraFrame({
    backdropMesh,
    camera,
    cameraState,
    hostElement,
  });
};

export const getLocalViewportCameraFrame = ({
  fullViewEnabled,
  hostElement,
  readModeHeld,
  state,
}: {
  fullViewEnabled: boolean;
  hostElement: HTMLDivElement;
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
  if (fullViewEnabled) {
    const width = Math.max(1, hostElement.clientWidth);
    const height = Math.max(1, hostElement.clientHeight);
    return getFullViewFrame(state, width / height);
  }

  const focusBody = getSandboxFocusBody(state);
  return {
    centerX: focusBody !== null ? focusBody.pos.x : 0,
    centerY: focusBody !== null ? focusBody.pos.y : 0,
    visibleWorldHeight: readModeHeld
      ? READ_MODE_WORLD_HEIGHT
      : FOLLOW_VIEW_WORLD_HEIGHT,
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
    (frame.visibleWorldHeight / FOLLOW_VIEW_WORLD_HEIGHT) *
    cameraShake *
    cameraShake;
  cameraState.shakeOffsetX =
    shakeMagnitude *
    (Math.sin(nowSec * 64 + 0.4) * 0.68 +
      Math.sin(nowSec * 117 + 1.7) * 0.32);
  cameraState.shakeOffsetY =
    shakeMagnitude *
    (Math.cos(nowSec * 73 + 0.8) * 0.62 +
      Math.sin(nowSec * 109 + 2.1) * 0.38);

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
