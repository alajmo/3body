import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const { editPageSpy, gamePageSpy } = vi.hoisted(() => ({
  editPageSpy: vi.fn(),
  gamePageSpy: vi.fn(),
}));

vi.mock("./EditPage", () => ({
  EditPage: () => {
    editPageSpy();
    return <div data-testid="edit-page">edit</div>;
  },
}));

vi.mock("./GamePage", () => ({
  GamePage: () => {
    gamePageSpy();
    return <div data-testid="game-page">game</div>;
  },
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("renders the game page on the root route", () => {
    render(<App />);

    expect(screen.getByTestId("game-page")).toBeInTheDocument();
    expect(editPageSpy).not.toHaveBeenCalled();
  });

  it("renders the edit page on /edit", () => {
    window.history.pushState({}, "", "/edit");

    render(<App />);

    expect(screen.getByTestId("edit-page")).toBeInTheDocument();
    expect(gamePageSpy).not.toHaveBeenCalled();
  });
});
