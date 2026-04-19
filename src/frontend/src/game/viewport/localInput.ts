import type { RocketKind, Vec2 } from "@3body/shared";

interface PendingAbilityRequests {
  boost: boolean;
  foresight: boolean;
  shield: boolean;
  gravityPulse: boolean;
  cloak: boolean;
}

interface PendingDroneRequests {
  launch: boolean;
}

interface DroneSteeringState {
  leftHeld: boolean;
  rightHeld: boolean;
}

interface PointerState {
  clientX: number;
  clientY: number;
  hasPointer: boolean;
}

export interface GameViewportInputRuntimeState {
  fullViewEnabled: boolean;
  inputState: {
    aimWorld: Vec2;
    selectedRocketKind: RocketKind;
  };
  pendingAbilityRequests: PendingAbilityRequests;
  pendingDroneRequests: PendingDroneRequests;
  pendingShots: number;
  pointerState: PointerState;
  droneSteering: DroneSteeringState;
}

export interface ViewportInputPlayerSeed {
  aimWorld: Vec2;
  selectedRocketKind: RocketKind;
}

export interface ViewportPlayerControlState {
  activeDroneId: number | null;
  controlMode: "planet" | "drone";
}

interface CreateGameViewportInputControllerOptions {
  canvasElement: HTMLCanvasElement;
  getPlayerControlState: () => ViewportPlayerControlState;
  isShieldActive: () => boolean;
  initialPlayer: ViewportInputPlayerSeed;
  isSandboxPaused: () => boolean;
  sandboxControlsEnabled: () => boolean;
  syncAimWorldToPointer: () => void;
  windowTarget: Window;
}

const createPendingAbilityRequests = (): PendingAbilityRequests => ({
  boost: false,
  foresight: false,
  shield: false,
  gravityPulse: false,
  cloak: false,
});

const createPendingDroneRequests = (): PendingDroneRequests => ({
  launch: false,
});

const createDroneSteeringState = (): DroneSteeringState => ({
  leftHeld: false,
  rightHeld: false,
});

const isEditableTarget = (target: EventTarget | null): target is HTMLElement =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

const blurActiveSandboxPanelControl = (windowTarget: Window) => {
  const activeElement = windowTarget.document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return;
  }

  if (activeElement.closest(".sandbox-panel") === null) {
    return;
  }

  activeElement.blur();
};

export const createGameViewportInputController = (
  options: CreateGameViewportInputControllerOptions,
): {
  clearPendingGameplayRequests: () => void;
  clearStepScopedRequests: () => void;
  consumeShotRequest: () => boolean;
  dispose: () => void;
  resetForPlayer: (player: ViewportInputPlayerSeed) => void;
  state: GameViewportInputRuntimeState;
} => {
  const state: GameViewportInputRuntimeState = {
    fullViewEnabled: false,
    inputState: {
      aimWorld: {
        x: options.initialPlayer.aimWorld.x,
        y: options.initialPlayer.aimWorld.y,
      },
      selectedRocketKind: options.initialPlayer.selectedRocketKind,
    },
    pendingAbilityRequests: createPendingAbilityRequests(),
    pendingDroneRequests: createPendingDroneRequests(),
    pendingShots: 0,
    pointerState: {
      clientX: 0,
      clientY: 0,
      hasPointer: false,
    },
    droneSteering: createDroneSteeringState(),
  };
  let boostHeld = false;

  const clearStepScopedRequests = () => {
    state.pendingAbilityRequests.foresight = false;
    state.pendingAbilityRequests.shield = false;
    // Preserve held boost input across simulation steps while still keeping
    // quick taps latched until the next frame consumes them.
    state.pendingAbilityRequests.boost = boostHeld;
    state.pendingAbilityRequests.gravityPulse = false;
    state.pendingAbilityRequests.cloak = false;
    state.pendingDroneRequests.launch = false;
  };

  const clearPendingGameplayRequests = () => {
    state.pendingShots = 0;
    boostHeld = false;
    clearStepScopedRequests();
  };

  const resetForPlayer = (player: ViewportInputPlayerSeed) => {
    state.inputState.aimWorld = {
      x: player.aimWorld.x,
      y: player.aimWorld.y,
    };
    state.inputState.selectedRocketKind = player.selectedRocketKind;
    state.droneSteering.leftHeld = false;
    state.droneSteering.rightHeld = false;
    clearPendingGameplayRequests();
  };

  const consumeShotRequest = (): boolean => {
    if (state.pendingShots <= 0) {
      return false;
    }

    state.pendingShots -= 1;
    return true;
  };

  const selectWeapon = (rocketKind: RocketKind) => {
    state.inputState.selectedRocketKind = rocketKind;
    if (options.isShieldActive()) {
      state.pendingAbilityRequests.shield = true;
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (!options.sandboxControlsEnabled()) {
      return;
    }

    if (options.isSandboxPaused()) {
      event.preventDefault();
      return;
    }

    if (event.code === "Digit1" && !event.repeat) {
      selectWeapon("light");
      event.preventDefault();
      return;
    }

    if (event.code === "Digit2" && !event.repeat) {
      selectWeapon("heavy");
      event.preventDefault();
      return;
    }

    if (event.code === "Digit3" && !event.repeat) {
      selectWeapon("seeker");
      event.preventDefault();
      return;
    }

    if (event.code === "KeyQ" && !event.repeat) {
      state.pendingAbilityRequests.shield = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyW" && !event.repeat) {
      boostHeld = true;
      state.pendingAbilityRequests.boost = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyE" && !event.repeat) {
      state.pendingAbilityRequests.foresight = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyG" && !event.repeat) {
      state.pendingAbilityRequests.gravityPulse = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyC" && !event.repeat) {
      state.pendingAbilityRequests.cloak = true;
      event.preventDefault();
      return;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.code !== "KeyW") {
      return;
    }

    boostHeld = false;
    if (!isEditableTarget(event.target) && options.sandboxControlsEnabled()) {
      event.preventDefault();
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    state.pointerState.clientX = event.clientX;
    state.pointerState.clientY = event.clientY;
    state.pointerState.hasPointer = true;
    options.syncAimWorldToPointer();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    blurActiveSandboxPanelControl(options.windowTarget);
    state.pointerState.clientX = event.clientX;
    state.pointerState.clientY = event.clientY;
    state.pointerState.hasPointer = true;
    options.syncAimWorldToPointer();

    if (!options.sandboxControlsEnabled()) {
      event.preventDefault();
      return;
    }

    if (options.isSandboxPaused()) {
      event.preventDefault();
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      return;
    }

    if (options.getPlayerControlState().controlMode === "drone") {
      event.preventDefault();
      return;
    }
    state.pendingShots += 1;
    event.preventDefault();
  };

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  options.windowTarget.addEventListener("keydown", handleKeyDown);
  options.windowTarget.addEventListener("keyup", handleKeyUp);
  options.canvasElement.addEventListener("pointermove", handlePointerMove);
  options.canvasElement.addEventListener("pointerdown", handlePointerDown);
  options.canvasElement.addEventListener("contextmenu", handleContextMenu);

  return {
    clearPendingGameplayRequests,
    clearStepScopedRequests,
    consumeShotRequest,
    dispose: () => {
      options.windowTarget.removeEventListener("keydown", handleKeyDown);
      options.windowTarget.removeEventListener("keyup", handleKeyUp);
      options.canvasElement.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
      options.canvasElement.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      options.canvasElement.removeEventListener(
        "contextmenu",
        handleContextMenu,
      );
    },
    resetForPlayer,
    state,
  };
};
