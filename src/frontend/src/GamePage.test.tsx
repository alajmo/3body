import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GamePage } from "./GamePage";

const { authoritativeGamePanelSpy } = vi.hoisted(() => ({
  authoritativeGamePanelSpy: vi.fn(),
}));

vi.mock("./AuthoritativeGamePanel", () => ({
  AuthoritativeGamePanel: (props: {
    className?: string;
  }) => {
    authoritativeGamePanelSpy(props);
    return <div data-testid="authoritative-game-panel" />;
  },
}));

describe("GamePage", () => {
  it("renders the authoritative game panel shell", () => {
    render(<GamePage />);

    expect(screen.getByTestId("authoritative-game-panel")).toBeInTheDocument();
    expect(authoritativeGamePanelSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        className: "app-shell",
      }),
    );
  });
});
