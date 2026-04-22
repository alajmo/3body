import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthoritativeGamePanel } from "./AuthoritativeGamePanel";

const {
  combatHudSpy,
  createAuthoritativeViewportMock,
  getRuntimeTuningDocumentMock,
} = vi.hoisted(() => ({
  combatHudSpy: vi.fn(),
  createAuthoritativeViewportMock: vi.fn(
    (_hostElement: HTMLDivElement, _options: unknown) => vi.fn(),
  ),
  getRuntimeTuningDocumentMock: vi.fn(),
}));

vi.mock("./CombatHud", () => ({
  CombatHud: (props: unknown) => {
    combatHudSpy(props);
    return <div data-testid="combat-hud" />;
  },
}));

vi.mock("./game/createAuthoritativeViewport", () => ({
  createAuthoritativeViewport: (
    hostElement: HTMLDivElement,
    options: unknown,
  ) => createAuthoritativeViewportMock(hostElement, options),
}));

vi.mock("./game/runtimeTuning", () => ({
  getRuntimeTuningDocument: () => getRuntimeTuningDocumentMock(),
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readyState = FakeWebSocket.CONNECTING;
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  receive(message: unknown) {
    this.emit("message", { data: JSON.stringify(message) });
  }

  private emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const getLastSentMessage = (socket: FakeWebSocket) =>
  JSON.parse(socket.sent[socket.sent.length - 1] ?? "{}");

describe("AuthoritativeGamePanel", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    combatHudSpy.mockClear();
    createAuthoritativeViewportMock.mockClear();
    getRuntimeTuningDocumentMock.mockReset();
    getRuntimeTuningDocumentMock.mockReturnValue({
      visuals: {
        displayMode: "default",
        hud: {},
      },
    });
    window.localStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes the post-match card interactive and sends rematch votes", async () => {
    render(<AuthoritativeGamePanel />);

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    socket!.open();
    socket!.receive({
      playerId: "player-1",
      profileToken: "profile-token",
      resumeToken: "resume-token",
      role: "player",
      roomId: "room-1",
      roster: [
        {
          isBot: false,
          name: "Pilot",
          playerId: "player-1",
          seat: 0,
        },
      ],
      type: "welcome",
    });
    socket!.receive({
      type: "matchEnd",
      winnerId: "player-1",
    });

    const playAgainButton = await screen.findByRole("button", {
      name: /play again/i,
    });
    expect(playAgainButton.closest(".page-copy")).toHaveStyle({
      pointerEvents: "auto",
    });

    fireEvent.click(playAgainButton);

    expect(getLastSentMessage(socket!)).toEqual({
      type: "voteRematch",
      yes: true,
    });
  });

  it("starts a fresh connection when new match is clicked", async () => {
    window.localStorage.setItem("3body.resumeToken", "resume-token");
    window.localStorage.setItem("3body.roomId", "room-1");

    render(<AuthoritativeGamePanel />);

    const firstSocket = FakeWebSocket.instances[0];
    expect(firstSocket).toBeDefined();
    firstSocket!.open();
    firstSocket!.receive({
      playerId: "player-1",
      profileToken: "profile-token",
      resumeToken: "resume-token",
      role: "player",
      roomId: "room-1",
      roster: [],
      type: "welcome",
    });
    firstSocket!.receive({
      type: "matchEnd",
      winnerId: "player-1",
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: /new match/i,
      }),
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(2);
    });
    expect(window.localStorage.getItem("3body.resumeToken")).toBeNull();
    expect(window.localStorage.getItem("3body.roomId")).toBeNull();
  });

  it("starts a fresh quick match when the stored room no longer exists", async () => {
    window.localStorage.setItem("3body.resumeToken", "resume-token");
    window.localStorage.setItem("3body.roomId", "room-1");

    render(<AuthoritativeGamePanel />);

    const firstSocket = FakeWebSocket.instances[0];
    expect(firstSocket).toBeDefined();
    firstSocket!.open();
    expect(JSON.parse(firstSocket!.sent[0] ?? "{}")).toEqual(
      expect.objectContaining({
        join: {
          kind: "joinRoom",
          roomId: "room-1",
        },
        resumeToken: "resume-token",
        type: "hello",
      }),
    );

    firstSocket!.receive({
      code: "invalid_room",
      message: "Room no longer exists",
      type: "error",
    });

    await waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(2);
    });
    const secondSocket = FakeWebSocket.instances[1]!;
    secondSocket.open();

    await waitFor(() => {
      expect(JSON.parse(secondSocket.sent[0] ?? "{}")).toEqual(
        expect.objectContaining({
          join: {
            kind: "quickGame",
          },
          name: "Pilot",
          type: "hello",
        }),
      );
    });
    expect(window.localStorage.getItem("3body.resumeToken")).toBeNull();
    expect(window.localStorage.getItem("3body.roomId")).toBeNull();
  });

  it("does not rerender the React shell for unchanged combat snapshots", async () => {
    render(<AuthoritativeGamePanel />);

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    socket!.open();
    socket!.receive({
      playerId: "player-1",
      profileToken: "profile-token",
      resumeToken: "resume-token",
      role: "player",
      roomId: "room-1",
      roster: [],
      type: "welcome",
    });
    socket!.receive({
      self: null,
      tick: 1,
      type: "fullSnapshot",
      world: {
        arenaRadius: 2_000,
        blackHole: undefined,
        caches: [],
        debris: [],
        neutronStars: [],
        orbitStarMotion: undefined,
        planets: [],
        rockets: [],
        suns: [],
      },
    });
    socket!.receive({
      baseTick: 1,
      changed: {},
      removed: {},
      tick: 2,
      type: "deltaSnapshot",
    });

    await waitFor(() => {
      expect(screen.getByText("Combat")).toBeInTheDocument();
    });
    const renderCountAfterCombatTransition = combatHudSpy.mock.calls.length;

    socket!.receive({
      baseTick: 2,
      changed: {},
      removed: {},
      tick: 3,
      type: "deltaSnapshot",
    });

    await new Promise((resolve) => window.setTimeout(resolve, 10));
    expect(combatHudSpy.mock.calls).toHaveLength(
      renderCountAfterCombatTransition,
    );
  });

  it("threads the configured display mode into the authoritative viewport and HUD shell", () => {
    getRuntimeTuningDocumentMock.mockReturnValue({
      visuals: {
        displayMode: "vhs",
        hud: {},
      },
    });

    render(<AuthoritativeGamePanel />);

    expect(createAuthoritativeViewportMock).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        displayMode: "vhs",
      }),
    );
    expect(combatHudSpy.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        displayMode: "vhs",
      }),
    );
    expect(screen.getByTestId("combat-hud").parentElement).toHaveClass(
      "hud-root--inside-crt",
    );
  });
});
