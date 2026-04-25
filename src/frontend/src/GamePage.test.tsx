import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GamePage } from "./GamePage";

const {
  gameViewportPanelSpy,
  getRuntimeTuningDocumentMock,
  loadRuntimeTuningDocumentMock,
} = vi.hoisted(() => ({
  gameViewportPanelSpy: vi.fn(),
  getRuntimeTuningDocumentMock: vi.fn(),
  loadRuntimeTuningDocumentMock: vi.fn(),
}));

vi.mock("./GameViewportPanel", () => ({
  GameViewportPanel: (props: {
    className?: string;
    defaultBotsEnabled?: boolean;
    displayMode?: string;
    restartOnDeath?: boolean;
    showPerformanceTools?: boolean;
  }) => {
    gameViewportPanelSpy(props);
    return <div data-testid="game-viewport-panel" />;
  },
}));

vi.mock("./game/runtimeTuning", () => ({
  getRuntimeTuningDocument: () => getRuntimeTuningDocumentMock(),
  loadRuntimeTuningDocument: (mode: string) =>
    loadRuntimeTuningDocumentMock(mode),
}));

describe("GamePage", () => {
  beforeEach(() => {
    gameViewportPanelSpy.mockClear();
    getRuntimeTuningDocumentMock.mockReset();
    loadRuntimeTuningDocumentMock.mockResolvedValue(undefined);
  });

  it("renders the local game viewport shell with the tuned display mode", () => {
    getRuntimeTuningDocumentMock.mockReturnValue({
      visuals: {
        displayMode: "vhs",
      },
    });

    render(<GamePage />);

    expect(screen.getByTestId("game-viewport-panel")).toBeInTheDocument();
    expect(gameViewportPanelSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        className: "app-shell",
        defaultBotsEnabled: true,
        restartOnDeath: true,
        displayMode: "vhs",
        showPerformanceTools: import.meta.env.DEV,
      }),
    );
  });

  it("renders the local game viewport shell", () => {
    getRuntimeTuningDocumentMock.mockReturnValue({
      visuals: {
        displayMode: "default",
      },
    });

    render(<GamePage />);

    expect(screen.getByTestId("game-viewport-panel")).toBeInTheDocument();
    expect(gameViewportPanelSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        className: "app-shell",
        defaultBotsEnabled: true,
        restartOnDeath: true,
        displayMode: "default",
        showPerformanceTools: import.meta.env.DEV,
      }),
    );
  });
});
