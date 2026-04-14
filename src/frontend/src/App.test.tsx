import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  createInitialHudState,
  type GameViewportController,
} from "./game/viewportHud";

const { combatHudSpy, createGameViewportMock } = vi.hoisted(() => ({
  combatHudSpy: vi.fn(),
  createGameViewportMock: vi.fn(),
}));

vi.mock("./game/createGameViewport", () => ({
  createGameViewport: createGameViewportMock,
}));

vi.mock("./CombatHud", () => ({
  CombatHud: (props: {
    controller: GameViewportController | null;
    hud: ReturnType<typeof createInitialHudState>;
  }) => {
    combatHudSpy(props);
    return (
      <div data-testid="combat-hud">
        {props.controller === null ? "no-controller" : "controller"}:
        {props.hud.playerLabel}
      </div>
    );
  },
}));

const createControllerMock = (): GameViewportController =>
  ({
    resetAbilitySettings: vi.fn(),
    resetBlackHoleSettings: vi.fn(),
    resetPlanetVisualSettings: vi.fn(),
    setBoostSetting: vi.fn(),
    setBlackHoleSetting: vi.fn(),
    setCacheBadgeScale: vi.fn(),
    setForesightSetting: vi.fn(),
    setPlanetBodyScale: vi.fn(),
    setPlanetAuraGap: vi.fn(),
    setPlanetAuraScale: vi.fn(),
    pauseSandbox: vi.fn(),
    playSandbox: vi.fn(),
    resetSandbox: vi.fn(),
    setShieldSetting: vi.fn(),
    setOrbitPreset: vi.fn(),
  }) as GameViewportController;

describe("App", () => {
  it("creates the viewport and forwards controller and HUD updates into CombatHud", async () => {
    const controller = createControllerMock();
    const dispose = vi.fn();

    createGameViewportMock.mockImplementation(
      (
        _element: HTMLDivElement,
        options: {
          onControllerReady?: (
            controller: GameViewportController | null,
          ) => void;
          onHudStateChange?: (
            state: ReturnType<typeof createInitialHudState>,
          ) => void;
        },
      ) => {
        options.onControllerReady?.(controller);
        options.onHudStateChange?.({
          ...createInitialHudState(),
          playerLabel: "Ace Pilot",
        });
        return dispose;
      },
    );

    render(<App />);

    expect(createGameViewportMock).toHaveBeenCalledTimes(1);
    expect(createGameViewportMock.mock.calls[0]![0]).toHaveClass("canvas-root");

    await waitFor(() => {
      expect(screen.getByTestId("combat-hud")).toHaveTextContent(
        "controller:Ace Pilot",
      );
    });

    expect(combatHudSpy).toHaveBeenCalled();
    expect(combatHudSpy.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        controller,
        hud: expect.objectContaining({
          playerLabel: "Ace Pilot",
        }),
      }),
    );
  });

  it("runs the viewport disposer on unmount", () => {
    const dispose = vi.fn();
    createGameViewportMock.mockReturnValue(dispose);

    const view = render(<App />);
    view.unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
