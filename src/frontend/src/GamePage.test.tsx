import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GamePage } from "./GamePage";

const { gameViewportPanelSpy } = vi.hoisted(() => ({
  gameViewportPanelSpy: vi.fn(),
}));

vi.mock("./GameViewportPanel", () => ({
  GameViewportPanel: (props: {
    className?: string;
    defaultBotsEnabled?: boolean;
    showPerformanceTools?: boolean;
  }) => {
    gameViewportPanelSpy(props);
    return <div data-testid="game-viewport-panel" />;
  },
}));

describe("GamePage", () => {
  it("renders the local game viewport shell", () => {
    render(<GamePage />);

    expect(screen.getByTestId("game-viewport-panel")).toBeInTheDocument();
    expect(gameViewportPanelSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        className: "app-shell",
        defaultBotsEnabled: false,
        showPerformanceTools: true,
      }),
    );
  });
});
