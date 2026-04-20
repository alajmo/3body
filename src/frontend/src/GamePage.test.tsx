import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GamePage } from "./GamePage";

const { gameViewportPanelSpy, getRuntimeTuningDocumentMock } = vi.hoisted(
  () => ({
    gameViewportPanelSpy: vi.fn(),
    getRuntimeTuningDocumentMock: vi.fn(),
  }),
);

vi.mock("./GameViewportPanel", () => ({
  GameViewportPanel: (props: {
    className?: string;
    defaultBotsEnabled?: boolean;
    displayMode?: string;
    showPerformanceTools?: boolean;
  }) => {
    gameViewportPanelSpy(props);
    return <div data-testid="game-viewport-panel" />;
  },
}));

vi.mock("./game/runtimeTuning", () => ({
  getRuntimeTuningDocument: () => getRuntimeTuningDocumentMock(),
}));

describe("GamePage", () => {
  beforeEach(() => {
    gameViewportPanelSpy.mockClear();
    getRuntimeTuningDocumentMock.mockReset();
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
        defaultBotsEnabled: false,
        displayMode: "vhs",
        showPerformanceTools: true,
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
        defaultBotsEnabled: false,
        displayMode: "default",
        showPerformanceTools: true,
      }),
    );
  });
});
