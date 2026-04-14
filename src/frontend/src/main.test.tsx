import { ARENA_RADIUS } from "@3body/shared";
import { describe, expect, it, vi } from "vitest";

const { createRootMock, renderMock } = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  renderMock: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));

vi.mock("./App", () => ({
  App: () => <div data-testid="mock-app" />,
}));

describe("main", () => {
  it("mounts the app into #app and logs the shared package handshake", async () => {
    vi.resetModules();
    createRootMock.mockReturnValue({ render: renderMock });
    document.body.innerHTML = '<div id="app"></div>';
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("./main");

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById("app"));
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("[frontend] @3body/shared loaded", {
      arenaRadius: ARENA_RADIUS,
    });
  });

  it("throws if the frontend mount element is missing", async () => {
    vi.resetModules();
    document.body.innerHTML = "";

    await expect(import("./main")).rejects.toThrow(
      "Missing #app mount element.",
    );
  });
});
