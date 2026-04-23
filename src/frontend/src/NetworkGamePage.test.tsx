import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkGamePage } from "./NetworkGamePage";

const { authoritativeGamePanelSpy } = vi.hoisted(() => ({
  authoritativeGamePanelSpy: vi.fn(),
}));

vi.mock("./AuthoritativeGamePanel", () => ({
  AuthoritativeGamePanel: (props: { className?: string }) => {
    authoritativeGamePanelSpy(props);
    return <div data-testid="authoritative-game-panel" />;
  },
}));

describe("NetworkGamePage", () => {
  it("renders the authoritative game panel shell", () => {
    render(<NetworkGamePage />);

    expect(screen.getByTestId("authoritative-game-panel")).toBeInTheDocument();
    expect(authoritativeGamePanelSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        className: "app-shell",
      }),
    );
  });
});
