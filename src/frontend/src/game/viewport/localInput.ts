import type { RocketKind, Vec2 } from "@3body/shared";

interface PendingAbilityRequests {
  boost: boolean;
  foresight: boolean;
  shield: boolean;
  wildcard: boolean;
}

interface PendingDroneRequests {
  autoReturn: boolean;
  burst: boolean;
  launch: boolean;
  recall: boolean;
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
  readModeHeld: boolean;
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
  wildcard: false,
});

const createPendingDroneRequests = (): PendingDroneRequests => ({
  autoReturn: false,
  burst: false,
  launch: false,
  recall: false,
});

const isEditableTarget = (
  target: EventTarget | null,
): target is HTMLElement =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

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
    readModeHeld: false,
  };

  const clearStepScopedRequests = () => {
    state.pendingAbilityRequests.foresight = false;
    state.pendingAbilityRequests.shield = false;
    state.pendingAbilityRequests.boost = false;
    state.pendingAbilityRequests.wildcard = false;
    state.pendingDroneRequests.autoReturn = false;
    state.pendingDroneRequests.burst = false;
    state.pendingDroneRequests.launch = false;
    state.pendingDroneRequests.recall = false;
  };

  const clearPendingGameplayRequests = () => {
    state.pendingShots = 0;
    clearStepScopedRequests();
  };

  const resetForPlayer = (player: ViewportInputPlayerSeed) => {
    state.inputState.aimWorld = {
      x: player.aimWorld.x,
      y: player.aimWorld.y,
    };
    state.inputState.selectedRocketKind = player.selectedRocketKind;
    clearPendingGameplayRequests();
  };

  const consumeShotRequest = (): boolean => {
    if (state.pendingShots <= 0) {
      return false;
    }

    state.pendingShots -= 1;
    return true;
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      state.readModeHeld = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyF" && !event.repeat) {
      state.fullViewEnabled = !state.fullViewEnabled;
      event.preventDefault();
      return;
    }

    if (!options.sandboxControlsEnabled()) {
      return;
    }

    if (options.isSandboxPaused()) {
      event.preventDefault();
      return;
    }

    if (event.code === "Digit1") {
      state.inputState.selectedRocketKind = "light";
      event.preventDefault();
      return;
    }

    if (event.code === "Digit2") {
      state.inputState.selectedRocketKind = "heavy";
      event.preventDefault();
      return;
    }

    if (event.code === "Digit3") {
      state.inputState.selectedRocketKind = "seeker";
      event.preventDefault();
      return;
    }

    if (event.code === "Digit4" && !event.repeat) {
      if (options.getPlayerControlState().activeDroneId !== null) {
        state.pendingDroneRequests.recall = true;
      } else {
        state.pendingDroneRequests.launch = true;
      }
      event.preventDefault();
      return;
    }

    if (event.code === "KeyQ" && !event.repeat) {
      state.pendingAbilityRequests.foresight = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyW" && !event.repeat) {
      state.pendingAbilityRequests.shield = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyE" && !event.repeat) {
      state.pendingAbilityRequests.boost = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyR" && !event.repeat) {
      state.pendingAbilityRequests.wildcard = true;
      event.preventDefault();
      return;
    }

    if (
      event.code === "Escape" &&
      !event.repeat &&
      options.getPlayerControlState().controlMode === "drone"
    ) {
      state.pendingDroneRequests.autoReturn = true;
      event.preventDefault();
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      state.readModeHeld = false;
      event.preventDefault();
    }
  };

  const handleWindowBlur = () => {
    state.readModeHeld = false;
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
      if (options.getPlayerControlState().activeDroneId !== null) {
        state.pendingDroneRequests.recall = true;
      }
      event.preventDefault();
      return;
    }

    if (options.getPlayerControlState().controlMode === "drone") {
      state.pendingDroneRequests.burst = true;
    } else {
      state.pendingShots += 1;
    }
    event.preventDefault();
  };

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  options.windowTarget.addEventListener("keydown", handleKeyDown);
  options.windowTarget.addEventListener("keyup", handleKeyUp);
  options.windowTarget.addEventListener("blur", handleWindowBlur);
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
      options.windowTarget.removeEventListener("blur", handleWindowBlur);
      options.canvasElement.removeEventListener("pointermove", handlePointerMove);
      options.canvasElement.removeEventListener("pointerdown", handlePointerDown);
      options.canvasElement.removeEventListener("contextmenu", handleContextMenu);
    },
    resetForPlayer,
    state,
  };
};
