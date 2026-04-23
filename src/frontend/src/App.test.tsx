import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const {
  editPageSpy,
  gamePageSpy,
  networkGamePageSpy,
  notFoundPageSpy,
  viewportSoakPageSpy,
} = vi.hoisted(() => ({
  editPageSpy: vi.fn(),
  gamePageSpy: vi.fn(),
  networkGamePageSpy: vi.fn(),
  notFoundPageSpy: vi.fn(),
  viewportSoakPageSpy: vi.fn(),
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

vi.mock("./NetworkGamePage", () => ({
  NetworkGamePage: () => {
    networkGamePageSpy();
    return <div data-testid="network-game-page">network</div>;
  },
}));

vi.mock("./ViewportSoakPage", () => ({
  ViewportSoakPage: () => {
    viewportSoakPageSpy();
    return <div data-testid="viewport-soak-page">soak</div>;
  },
}));

vi.mock("./NotFoundPage", () => ({
  NotFoundPage: () => {
    notFoundPageSpy();
    return <div data-testid="not-found-page">not-found</div>;
  },
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("renders the authoritative page on the root route", () => {
    render(<App />);

    expect(screen.getByTestId("network-game-page")).toBeInTheDocument();
    expect(editPageSpy).not.toHaveBeenCalled();
    expect(gamePageSpy).not.toHaveBeenCalled();
  });

  it("renders the edit page on /edit", () => {
    window.history.pushState({}, "", "/edit");

    render(<App />);

    expect(screen.getByTestId("edit-page")).toBeInTheDocument();
    expect(gamePageSpy).not.toHaveBeenCalled();
  });

  it("renders the network page on /network", () => {
    window.history.pushState({}, "", "/network");

    render(<App />);

    expect(screen.getByTestId("network-game-page")).toBeInTheDocument();
    expect(gamePageSpy).not.toHaveBeenCalled();
    expect(editPageSpy).not.toHaveBeenCalled();
  });

  it("renders the sandbox page on /sandbox", () => {
    window.history.pushState({}, "", "/sandbox");

    render(<App />);

    expect(screen.getByTestId("game-page")).toBeInTheDocument();
    expect(editPageSpy).not.toHaveBeenCalled();
    expect(networkGamePageSpy).not.toHaveBeenCalled();
  });

  it("renders the viewport soak page on /soak", () => {
    window.history.pushState({}, "", "/soak");

    render(<App />);

    expect(screen.getByTestId("viewport-soak-page")).toBeInTheDocument();
    expect(gamePageSpy).not.toHaveBeenCalled();
    expect(editPageSpy).not.toHaveBeenCalled();
    expect(networkGamePageSpy).not.toHaveBeenCalled();
  });

  it("renders the viewport soak page from the root query override", () => {
    window.history.pushState({}, "", "/?page=soak");

    render(<App />);

    expect(screen.getByTestId("viewport-soak-page")).toBeInTheDocument();
    expect(gamePageSpy).not.toHaveBeenCalled();
    expect(editPageSpy).not.toHaveBeenCalled();
    expect(networkGamePageSpy).not.toHaveBeenCalled();
  });

  it("renders the not-found page on unknown routes", () => {
    window.history.pushState({}, "", "/kaka");

    render(<App />);

    expect(screen.getByTestId("not-found-page")).toBeInTheDocument();
    expect(gamePageSpy).not.toHaveBeenCalled();
    expect(editPageSpy).not.toHaveBeenCalled();
    expect(networkGamePageSpy).not.toHaveBeenCalled();
  });
});
