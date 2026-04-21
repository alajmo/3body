import { describe, expect, it } from "vitest";
import { createGameViewportInputController } from "./localInput";

describe("createGameViewportInputController", () => {
  it("keeps the camera mode fixed when F is pressed", () => {
    const canvasElement = document.createElement("canvas");
    const controller = createGameViewportInputController({
      canvasElement,
      isShieldActive: () => false,
      initialPlayer: {
        aimWorld: { x: 0, y: 0 },
        selectedRocketKind: "light",
      },
      isSandboxPaused: () => false,
      sandboxControlsEnabled: () => true,
      syncAimWorldToPointer: () => {},
      windowTarget: window,
    });

    expect(controller.state.fullViewEnabled).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF" }));

    expect(controller.state.fullViewEnabled).toBe(false);

    controller.dispose();
  });

  it("turns off an active shield when selecting a weapon hotkey", () => {
    const canvasElement = document.createElement("canvas");
    let shieldActive = true;
    const controller = createGameViewportInputController({
      canvasElement,
      isShieldActive: () => shieldActive,
      initialPlayer: {
        aimWorld: { x: 0, y: 0 },
        selectedRocketKind: "light",
      },
      isSandboxPaused: () => false,
      sandboxControlsEnabled: () => true,
      syncAimWorldToPointer: () => {},
      windowTarget: window,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit2" }));

    expect(controller.state.inputState.selectedRocketKind).toBe("heavy");
    expect(controller.state.pendingAbilityRequests.shield).toBe(true);

    shieldActive = false;
    controller.clearStepScopedRequests();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit3" }));

    expect(controller.state.inputState.selectedRocketKind).toBe("seeker");
    expect(controller.state.pendingAbilityRequests.shield).toBe(false);

    controller.dispose();
  });

  it("rotates aim on left and right arrows, shoots on space, and boosts on up", () => {
    const canvasElement = document.createElement("canvas");
    const controller = createGameViewportInputController({
      canvasElement,
      isShieldActive: () => false,
      initialPlayer: {
        aimWorld: { x: 0, y: 0 },
        selectedRocketKind: "light",
      },
      isSandboxPaused: () => false,
      sandboxControlsEnabled: () => true,
      syncAimWorldToPointer: () => {},
      windowTarget: window,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft" }));
    controller.updateKeyboardAim({ x: 0, y: 0 }, 0.5);
    expect(controller.state.keyboardAimActive).toBe(true);
    expect(controller.state.inputState.aimWorld.x).toBeGreaterThan(0);
    expect(controller.state.inputState.aimWorld.y).toBeGreaterThan(0);

    const leftRotatedAim = {
      x: controller.state.inputState.aimWorld.x,
      y: controller.state.inputState.aimWorld.y,
    };

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowLeft" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight" }));
    controller.updateKeyboardAim({ x: 0, y: 0 }, 0.5);
    expect(Math.abs(controller.state.inputState.aimWorld.y)).toBeLessThan(
      Math.abs(leftRotatedAim.y),
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    expect(controller.state.pendingShots).toBe(1);
    expect(controller.state.pendingAbilityRequests.boost).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }));
    expect(controller.state.pendingAbilityRequests.boost).toBe(true);

    controller.dispose();
  });

  it("blurs sandbox panel inputs when the viewport is clicked", () => {
    const canvasElement = document.createElement("canvas");
    const sandboxPanel = document.createElement("div");
    const sandboxInput = document.createElement("input");
    sandboxPanel.className = "sandbox-panel";
    sandboxPanel.appendChild(sandboxInput);
    document.body.appendChild(canvasElement);
    document.body.appendChild(sandboxPanel);

    const controller = createGameViewportInputController({
      canvasElement,
      isShieldActive: () => false,
      initialPlayer: {
        aimWorld: { x: 0, y: 0 },
        selectedRocketKind: "light",
      },
      isSandboxPaused: () => false,
      sandboxControlsEnabled: () => true,
      syncAimWorldToPointer: () => {},
      windowTarget: window,
    });

    sandboxInput.focus();
    expect(document.activeElement).toBe(sandboxInput);

    canvasElement.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 24,
        clientY: 48,
      }),
    );

    expect(document.activeElement).not.toBe(sandboxInput);

    controller.dispose();
    canvasElement.remove();
    sandboxPanel.remove();
  });

  it("queues gravity pulse on G", () => {
    const canvasElement = document.createElement("canvas");
    const controller = createGameViewportInputController({
      canvasElement,
      isShieldActive: () => false,
      initialPlayer: {
        aimWorld: { x: 0, y: 0 },
        selectedRocketKind: "light",
      },
      isSandboxPaused: () => false,
      sandboxControlsEnabled: () => true,
      syncAimWorldToPointer: () => {},
      windowTarget: window,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyG" }));

    expect(controller.state.pendingAbilityRequests.gravityPulse).toBe(true);

    controller.dispose();
  });

  it("ignores Shift entirely", () => {
    const canvasElement = document.createElement("canvas");
    const controller = createGameViewportInputController({
      canvasElement,
      isShieldActive: () => false,
      initialPlayer: {
        aimWorld: { x: 0, y: 0 },
        selectedRocketKind: "light",
      },
      isSandboxPaused: () => false,
      sandboxControlsEnabled: () => true,
      syncAimWorldToPointer: () => {},
      windowTarget: window,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft" }));

    expect(controller.state.pendingShots).toBe(0);
    expect(controller.state.pendingAbilityRequests).toEqual({
      boost: false,
      gravityPulse: false,
      shield: false,
    });
    expect(controller.state.inputState.selectedRocketKind).toBe("light");

    controller.dispose();
  });

  it("maps shield to Q and boost to W", () => {
    const canvasElement = document.createElement("canvas");
    const controller = createGameViewportInputController({
      canvasElement,
      isShieldActive: () => false,
      initialPlayer: {
        aimWorld: { x: 0, y: 0 },
        selectedRocketKind: "light",
      },
      isSandboxPaused: () => false,
      sandboxControlsEnabled: () => true,
      syncAimWorldToPointer: () => {},
      windowTarget: window,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ" }));
    expect(controller.state.pendingAbilityRequests.shield).toBe(true);
    expect(controller.state.pendingAbilityRequests.boost).toBe(false);

    controller.clearStepScopedRequests();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect(controller.state.pendingAbilityRequests.shield).toBe(false);
    expect(controller.state.pendingAbilityRequests.boost).toBe(true);

    controller.dispose();
  });

  it("keeps boost queued while ArrowUp is held and releases it on keyup", () => {
    const canvasElement = document.createElement("canvas");
    const controller = createGameViewportInputController({
      canvasElement,
      isShieldActive: () => false,
      initialPlayer: {
        aimWorld: { x: 0, y: 0 },
        selectedRocketKind: "light",
      },
      isSandboxPaused: () => false,
      sandboxControlsEnabled: () => true,
      syncAimWorldToPointer: () => {},
      windowTarget: window,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }));
    expect(controller.state.pendingAbilityRequests.boost).toBe(true);

    controller.clearStepScopedRequests();
    expect(controller.state.pendingAbilityRequests.boost).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowUp" }));
    expect(controller.state.pendingAbilityRequests.boost).toBe(true);

    controller.clearStepScopedRequests();
    expect(controller.state.pendingAbilityRequests.boost).toBe(false);

    controller.dispose();
  });
});
