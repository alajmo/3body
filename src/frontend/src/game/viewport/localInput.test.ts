import { describe, expect, it } from "vitest";
import { createGameViewportInputController } from "./localInput";

describe("createGameViewportInputController", () => {
  it("keeps the camera mode fixed when F is pressed", () => {
    const canvasElement = document.createElement("canvas");
    const controller = createGameViewportInputController({
      canvasElement,
      getPlayerControlState: () => ({
        activeDroneId: null,
        controlMode: "planet",
      }),
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
      getPlayerControlState: () => ({
        activeDroneId: null,
        controlMode: "planet",
      }),
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
      getPlayerControlState: () => ({
        activeDroneId: null,
        controlMode: "planet",
      }),
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

  it("queues gravity pulse and cloak on G and C", () => {
    const canvasElement = document.createElement("canvas");
    const controller = createGameViewportInputController({
      canvasElement,
      getPlayerControlState: () => ({
        activeDroneId: null,
        controlMode: "planet",
      }),
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
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC" }));

    expect(controller.state.pendingAbilityRequests.gravityPulse).toBe(true);
    expect(controller.state.pendingAbilityRequests.cloak).toBe(true);

    controller.dispose();
  });
});
