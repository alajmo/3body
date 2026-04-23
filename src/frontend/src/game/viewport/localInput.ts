import type { RocketKind, Vec2 } from "@3body/shared";

const DEFAULT_KEYBOARD_AIM_DISTANCE = 180;
const KEYBOARD_AIM_ROTATION_SPEED_RAD_PER_SEC = 2.6;

interface PendingAbilityRequests {
  boost: boolean;
  shield: boolean;
  gravityPulse: boolean;
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
  keyboardAimActive: boolean;
  pendingAbilityRequests: PendingAbilityRequests;
  pendingShots: number;
  pointerState: PointerState;
}

interface ViewportInputPlayerSeed {
  aimWorld: Vec2;
  selectedRocketKind: RocketKind;
}

interface CreateGameViewportInputControllerOptions {
  canvasElement: HTMLCanvasElement;
  isShieldActive: () => boolean;
  initialPlayer: ViewportInputPlayerSeed;
  isSandboxPaused: () => boolean;
  sandboxControlsEnabled: () => boolean;
  syncAimWorldToPointer: () => void;
  windowTarget: Window;
}

const createPendingAbilityRequests = (): PendingAbilityRequests => ({
  boost: false,
  shield: false,
  gravityPulse: false,
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
  updateKeyboardAim: (playerPos: Vec2, deltaSec: number) => void;
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
    keyboardAimActive: false,
    pendingAbilityRequests: createPendingAbilityRequests(),
    pendingShots: 0,
    pointerState: {
      clientX: 0,
      clientY: 0,
      hasPointer: false,
    },
  };
  let boostHeld = false;
  let keyboardRotateLeftHeld = false;
  let keyboardRotateRightHeld = false;
  let keyboardAimAngleRad: number | null = null;
  let keyboardAimDistance = DEFAULT_KEYBOARD_AIM_DISTANCE;

  const clearKeyboardAim = () => {
    state.keyboardAimActive = false;
    keyboardRotateLeftHeld = false;
    keyboardRotateRightHeld = false;
    keyboardAimAngleRad = null;
    keyboardAimDistance = DEFAULT_KEYBOARD_AIM_DISTANCE;
  };

  const initializeKeyboardAim = (playerPos: Vec2) => {
    if (keyboardAimAngleRad !== null) {
      return;
    }

    if (state.pointerState.hasPointer) {
      const dx = state.inputState.aimWorld.x - playerPos.x;
      const dy = state.inputState.aimWorld.y - playerPos.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 1e-3) {
        keyboardAimAngleRad = Math.atan2(dy, dx);
        keyboardAimDistance = distance;
        return;
      }
    }

    keyboardAimAngleRad = 0;
    keyboardAimDistance = DEFAULT_KEYBOARD_AIM_DISTANCE;
  };

  const clearStepScopedRequests = () => {
    state.pendingAbilityRequests.shield = false;
    // Preserve held boost input across simulation steps while still keeping
    // quick taps latched until the next frame consumes them.
    state.pendingAbilityRequests.boost = boostHeld;
    state.pendingAbilityRequests.gravityPulse = false;
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
    clearKeyboardAim();
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

  const updateKeyboardAim = (playerPos: Vec2, deltaSec: number) => {
    if (!state.keyboardAimActive) {
      return;
    }

    initializeKeyboardAim(playerPos);

    if (keyboardAimAngleRad === null) {
      return;
    }

    const rotateDirection =
      (keyboardRotateLeftHeld ? 1 : 0) - (keyboardRotateRightHeld ? 1 : 0);
    if (rotateDirection !== 0 && deltaSec > 0) {
      keyboardAimAngleRad +=
        rotateDirection * KEYBOARD_AIM_ROTATION_SPEED_RAD_PER_SEC * deltaSec;
    }

    state.inputState.aimWorld = {
      x: playerPos.x + Math.cos(keyboardAimAngleRad) * keyboardAimDistance,
      y: playerPos.y + Math.sin(keyboardAimAngleRad) * keyboardAimDistance,
    };
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

    if (event.code === "ArrowLeft" && !event.repeat) {
      state.keyboardAimActive = true;
      keyboardRotateLeftHeld = true;
      keyboardRotateRightHeld = false;
      event.preventDefault();
      return;
    }

    if (event.code === "ArrowRight" && !event.repeat) {
      state.keyboardAimActive = true;
      keyboardRotateLeftHeld = false;
      keyboardRotateRightHeld = true;
      event.preventDefault();
      return;
    }

    if (event.code === "Space" && !event.repeat) {
      state.pendingShots += 1;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyQ" && !event.repeat) {
      state.pendingAbilityRequests.shield = true;
      event.preventDefault();
      return;
    }

    if ((event.code === "KeyW" || event.code === "ArrowUp") && !event.repeat) {
      boostHeld = true;
      state.pendingAbilityRequests.boost = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyG" && !event.repeat) {
      state.pendingAbilityRequests.gravityPulse = true;
      event.preventDefault();
      return;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === "KeyW" || event.code === "ArrowUp") {
      boostHeld = false;
      if (!isEditableTarget(event.target) && options.sandboxControlsEnabled()) {
        event.preventDefault();
      }
      return;
    }

    if (event.code === "ArrowLeft") {
      keyboardRotateLeftHeld = false;
      if (!isEditableTarget(event.target) && options.sandboxControlsEnabled()) {
        event.preventDefault();
      }
      return;
    }

    if (event.code === "ArrowRight") {
      keyboardRotateRightHeld = false;
      if (!isEditableTarget(event.target) && options.sandboxControlsEnabled()) {
        event.preventDefault();
      }
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    clearKeyboardAim();
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
    clearKeyboardAim();
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
    updateKeyboardAim,
  };
};
