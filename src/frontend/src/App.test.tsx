import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const { editPageSpy, gamePageSpy, networkGamePageSpy, playMenuPageSpy } =
  vi.hoisted(() => ({
    editPageSpy: vi.fn(),
    gamePageSpy: vi.fn(),
    networkGamePageSpy: vi.fn(),
    playMenuPageSpy: vi.fn(),
  }));

vi.mock("./EditPage", () => ({
  EditPage: ({ mode }: { mode: string }) => {
    editPageSpy();
    return <div data-testid="edit-page">edit {mode}</div>;
  },
}));

vi.mock("./editorAccess", () => ({
  isEditorEnabled: () => true,
}));

vi.mock("./GamePage", () => ({
  GamePage: () => {
    gamePageSpy();
    return <div data-testid="game-page">game</div>;
  },
}));

vi.mock("./NetworkGamePage", () => ({
  NetworkGamePage: () => {
    networkGamePageSpy();
    return <div data-testid="network-game-page">network</div>;
  },
}));

vi.mock("./PlayMenuPage", () => ({
  PlayMenuPage: () => {
    playMenuPageSpy();
    return <div data-testid="play-menu-page">menu</div>;
  },
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("renders the play menu on the root route", () => {
    render(<App />);

    expect(screen.getByTestId("play-menu-page")).toBeInTheDocument();
    expect(networkGamePageSpy).not.toHaveBeenCalled();
    expect(gamePageSpy).not.toHaveBeenCalled();
    expect(editPageSpy).not.toHaveBeenCalled();
  });

  it("renders the online edit page on /online/edit", () => {
    window.history.pushState({}, "", "/online/edit");

    render(<App />);

    expect(screen.getByTestId("edit-page")).toBeInTheDocument();
    expect(screen.getByText("edit online")).toBeInTheDocument();
    expect(gamePageSpy).not.toHaveBeenCalled();
  });

  it("renders the offline edit page on /offline/edit", () => {
    window.history.pushState({}, "", "/offline/edit");

    render(<App />);

    expect(screen.getByTestId("edit-page")).toBeInTheDocument();
    expect(screen.getByText("edit offline")).toBeInTheDocument();
    expect(networkGamePageSpy).not.toHaveBeenCalled();
  });

  it("renders the network page on /online", () => {
    window.history.pushState({}, "", "/online");

    render(<App />);

    expect(screen.getByTestId("network-game-page")).toBeInTheDocument();
    expect(gamePageSpy).not.toHaveBeenCalled();
    expect(editPageSpy).not.toHaveBeenCalled();
  });

  it("renders the offline page on /offline", () => {
    window.history.pushState({}, "", "/offline");

    render(<App />);

    expect(screen.getByTestId("game-page")).toBeInTheDocument();
    expect(editPageSpy).not.toHaveBeenCalled();
    expect(networkGamePageSpy).not.toHaveBeenCalled();
  });

  it("redirects unknown routes to the play menu", () => {
    window.history.pushState({}, "", "/kaka");

    render(<App />);

    expect(screen.getByTestId("play-menu-page")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(gamePageSpy).not.toHaveBeenCalled();
    expect(editPageSpy).not.toHaveBeenCalled();
    expect(networkGamePageSpy).not.toHaveBeenCalled();
  });
});
