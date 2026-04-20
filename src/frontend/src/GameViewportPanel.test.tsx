import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameViewportPanel } from "./GameViewportPanel";
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
    displayMode?: string;
    hud: ReturnType<typeof createInitialHudState>;
    hudTuning: unknown;
    showPerformanceTools?: boolean;
  }) => {
    combatHudSpy(props);
    return (
      <div data-testid="combat-hud">
        {props.controller === null ? "no-controller" : "controller"}:
        {props.hud.playerLabel}:
        {props.showPerformanceTools ? "perf" : "no-perf"}
      </div>
    );
  },
}));

vi.mock("./game/runtimeTuning", () => ({
  getRuntimeTuningDocument: () => ({
    visuals: {
      hud: {
        topInset: 20,
        sideInset: 20,
        bottomInset: 20,
        leftColumnWidth: 320,
        panelRadius: 18,
        pillRadius: 16,
        cardRadius: 14,
        compactCardRadius: 10,
        killFeedEntryRadius: 12,
        panelBlurPx: 14,
        panelGap: 12,
        dockGap: 10,
        shortcutsSectionGap: 18,
        timerWidth: 240,
        connectionWidth: 220,
      },
    },
  }),
}));

const createControllerMock = (): GameViewportController =>
  ({
    resetProfiling: vi.fn(),
    resetAbilitySettings: vi.fn(),
    resetBlackHoleSettings: vi.fn(),
    resetPlanetVisualSettings: vi.fn(),
    setBotsEnabled: vi.fn(),
    setBoostSetting: vi.fn(),
    setBlackHoleSetting: vi.fn(),
    setCacheBadgeScale: vi.fn(),
    setForesightSetting: vi.fn(),
    setPlanetBodyScale: vi.fn(),
    setPlanetAuraGap: vi.fn(),
    setPlanetAuraScale: vi.fn(),
    setProfilingEnabled: vi.fn(),
    pauseSandbox: vi.fn(),
    playSandbox: vi.fn(),
    resetSandbox: vi.fn(),
    setShieldSetting: vi.fn(),
    setOrbitPreset: vi.fn(),
  }) as GameViewportController;

describe("GameViewportPanel", () => {
  beforeEach(() => {
    combatHudSpy.mockClear();
    createGameViewportMock.mockReset();
  });

  it("creates the viewport and forwards controller and HUD updates into CombatHud", async () => {
    const controller = createControllerMock();
    const dispose = vi.fn();

    createGameViewportMock.mockImplementation(
      (
        _element: HTMLDivElement,
        options: {
          defaultBotsEnabled?: boolean;
          displayMode?: string;
          enableSandboxStorage?: boolean;
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

    render(<GameViewportPanel showPerformanceTools={false} />);

    expect(createGameViewportMock).toHaveBeenCalledTimes(1);
    expect(createGameViewportMock.mock.calls[0]![0]).toHaveClass("canvas-root");
    expect(createGameViewportMock.mock.calls[0]![1]).toEqual(
      expect.objectContaining({
        defaultBotsEnabled: true,
        enableSandboxStorage: false,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("combat-hud")).toHaveTextContent(
        "controller:Ace Pilot:no-perf",
      );
    });

    expect(combatHudSpy.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        controller,
        displayMode: undefined,
        hud: expect.objectContaining({
          playerLabel: "Ace Pilot",
        }),
        showPerformanceTools: false,
      }),
    );
  });

  it("runs the viewport disposer on unmount", () => {
    const dispose = vi.fn();
    createGameViewportMock.mockReturnValue(dispose);

    const view = render(<GameViewportPanel />);
    view.unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("forwards the requested display mode into the viewport", () => {
    createGameViewportMock.mockReturnValue(vi.fn());

    render(<GameViewportPanel displayMode="vectorAsteroids" />);

    expect(createGameViewportMock).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        displayMode: "vectorAsteroids",
      }),
    );
    expect(combatHudSpy.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        displayMode: "vectorAsteroids",
      }),
    );
  });
});
