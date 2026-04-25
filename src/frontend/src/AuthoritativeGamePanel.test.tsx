import {
  decodeProtocolMessage,
  encodeProtocolMessage,
  type ProtocolMessage,
} from "@3body/shared";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

  binaryType: BinaryType = "blob";
  readonly sent: Array<string | BufferSource> = [];
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

  send(data: string | BufferSource) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {
      code,
      reason,
      wasClean: code === 1000,
    });
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  receive(message: unknown) {
    this.emit("message", {
      data: encodeProtocolMessage(message as ProtocolMessage),
    });
  }

  private emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const getSentMessage = (socket: FakeWebSocket, index: number) => {
  const payload = socket.sent[index];
  if (payload === undefined) {
    throw new Error(`Expected sent socket message at index ${index}`);
  }
  return decodeProtocolMessage(payload);
};

describe("AuthoritativeGamePanel", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    combatHudSpy.mockClear();
    createAuthoritativeViewportMock.mockClear();
    getRuntimeTuningDocumentMock.mockReset();
    window.history.pushState({}, "", "/");
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the post-match card inside the match modal", async () => {
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

    const newMatchButton = await screen.findByRole("button", {
      name: /new match/i,
    });
    expect(newMatchButton.closest(".match-modal")).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /play again/i }),
    ).not.toBeInTheDocument();
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

  it("keeps the room session for reconnects after match end", async () => {
    vi.useFakeTimers();

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

    expect(window.localStorage.getItem("3body.resumeToken")).toBe(
      "resume-token",
    );
    expect(window.localStorage.getItem("3body.roomId")).toBe("room-1");

    firstSocket!.close(1001, "network");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    const secondSocket = FakeWebSocket.instances[1]!;
    secondSocket.open();

    expect(getSentMessage(secondSocket, 0)).toEqual(
      expect.objectContaining({
        join: {
          kind: "joinRoom",
          roomId: "room-1",
        },
        resumeToken: "resume-token",
        snapshotVersion: 2,
        type: "hello",
      }),
    );
  });

  it("starts a fresh quick match when the stored room no longer exists", async () => {
    window.localStorage.setItem("3body.resumeToken", "resume-token");
    window.localStorage.setItem("3body.roomId", "room-1");

    render(<AuthoritativeGamePanel />);

    const firstSocket = FakeWebSocket.instances[0];
    expect(firstSocket).toBeDefined();
    firstSocket!.open();
    expect(getSentMessage(firstSocket!, 0)).toEqual(
      expect.objectContaining({
        join: {
          kind: "joinRoom",
          roomId: "room-1",
        },
        resumeToken: "resume-token",
        snapshotVersion: 2,
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
      expect(getSentMessage(secondSocket, 0)).toEqual(
        expect.objectContaining({
          join: {
            kind: "quickGame",
          },
          name: "Pilot",
          snapshotVersion: 2,
          type: "hello",
        }),
      );
    });
    expect(window.localStorage.getItem("3body.resumeToken")).toBeNull();
    expect(window.localStorage.getItem("3body.roomId")).toBeNull();
  });

  it("can connect directly to the backend websocket for proxy diagnostics", () => {
    window.history.pushState({}, "", "/?directWs=1");

    render(<AuthoritativeGamePanel />);

    expect(FakeWebSocket.instances[0]?.url).toBe("ws://localhost:8080/ws");
  });

  it("does not reconnect when a stale socket closes after a newer socket exists", async () => {
    vi.useFakeTimers();

    render(<AuthoritativeGamePanel />);

    const firstSocket = FakeWebSocket.instances[0];
    expect(firstSocket).toBeDefined();
    firstSocket!.open();
    firstSocket!.close();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    const secondSocket = FakeWebSocket.instances[1]!;
    secondSocket.open();

    firstSocket!.close();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("does not reconnect after the active session is reclaimed elsewhere", async () => {
    vi.useFakeTimers();

    render(<AuthoritativeGamePanel />);

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    await act(async () => {
      socket!.open();
      socket!.close(4001, "session_reclaimed");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(
      screen.getAllByText(/opened somewhere else/i).length,
    ).toBeGreaterThan(0);
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
      expect(document.querySelector('[data-phase="combat"]')).not.toBeNull();
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
