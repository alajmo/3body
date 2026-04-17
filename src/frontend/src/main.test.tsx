import { ARENA_RADIUS } from "@3body/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createRootMock, fetchMock, renderMock } = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  fetchMock: vi.fn(),
  renderMock: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));

vi.mock("./App", () => ({
  App: () => <div data-testid="mock-app" />,
}));

describe("main", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts the app into #app and logs the shared package handshake", async () => {
    vi.resetModules();
    createRootMock.mockReturnValue({ render: renderMock });
    fetchMock.mockResolvedValue(
      new Response("{}", {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    document.body.innerHTML = '<div id="app"></div>';
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("./main");

    expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById("app"));
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("[frontend] @3body/shared loaded", {
      arenaRadius: ARENA_RADIUS,
    });
  });

  it("throws if the frontend mount element is missing", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);
    document.body.innerHTML = "";

    await expect(import("./main")).rejects.toThrow(
      "Missing #app mount element.",
    );
  });
});
