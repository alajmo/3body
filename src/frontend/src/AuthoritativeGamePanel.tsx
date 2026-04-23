import {
  ARCHETYPE_IDS,
  type ClientMsg,
  type DeltaSnapshotMsg,
  decodeProtocolMessage,
  type ErrorMsg,
  type EventMsg,
  encodeProtocolMessage,
  type FullSnapshotMsg,
  type LobbyStateMsg,
  type MatchEndMsg,
  type PickStateMsg,
  type PongMsg,
  type RematchStateMsg,
  type SnapshotV2Msg,
  type WelcomeMsg,
} from "@3body/shared";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { formatAuthoritativeWinnerLabel } from "./authoritativeMatchLabels";
import { CombatHud } from "./CombatHud";
import {
  type AuthoritativeMatchRuntimeState,
  appendAuthoritativeSnapshot,
  applyDeltaSnapshotToWorld,
  applySnapshotV2ToWorld,
  createInitialAuthoritativeMatchRuntimeState,
  resetAuthoritativeSnapshotBuffer,
} from "./game/authoritativeMatchRuntime";
import { createAuthoritativeViewport } from "./game/createAuthoritativeViewport";
import { getRuntimeTuningDocument } from "./game/runtimeTuning";
import {
  createAuthoritativeNetworkDiagnostics,
  getSocketPayloadByteLength,
} from "./game/viewport/authoritativeDiagnostics";
import {
  loadViewportSettings,
  persistProfilingEnabled,
} from "./game/viewport/settings";
import {
  createInitialHudState,
  type GameViewportController,
} from "./game/viewportHud";

const PROFILE_TOKEN_STORAGE_KEY = "3body.profileToken";
const RESUME_TOKEN_STORAGE_KEY = "3body.resumeToken";
const ROOM_ID_STORAGE_KEY = "3body.roomId";
const PLAYER_NAME_STORAGE_KEY = "3body.playerName";
const DIRECT_WS_QUERY_PARAM = "directWs";
const DIRECT_WS_BACKEND_PORT = "8080";

const readStoredViewportProfilingEnabled = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return loadViewportSettings(window.localStorage).profilingEnabled;
};

interface MatchPanelUiState {
  connectionError: string | null;
  connectionState: AuthoritativeMatchRuntimeState["connectionState"];
  countdownEndsAtMs: number | null;
  lobbyState: AuthoritativeMatchRuntimeState["lobbyState"];
  matchEnd: AuthoritativeMatchRuntimeState["matchEnd"];
  phase: AuthoritativeMatchRuntimeState["phase"];
  pickState: AuthoritativeMatchRuntimeState["pickState"];
  playerId: AuthoritativeMatchRuntimeState["playerId"];
  rematchState: AuthoritativeMatchRuntimeState["rematchState"];
  roomId: string | null;
  roomRoster: AuthoritativeMatchRuntimeState["roomRoster"];
}

const buildSocketUrl = (windowTarget: Window): string => {
  const configuredUrl = import.meta.env.VITE_WS_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const url = new URL(windowTarget.location.href);
  if (url.searchParams.get(DIRECT_WS_QUERY_PARAM) === "1") {
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.port = DIRECT_WS_BACKEND_PORT;
    url.pathname = "/ws";
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
};

const INITIAL_RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 12_000;
const SESSION_RECLAIMED_CLOSE_CODE = 4001;
const SLOW_CONSUMER_CLOSE_CODE = 1013;

const formatSocketCloseError = (event: CloseEvent): string => {
  const reason = event.reason.trim();
  if (event.code === SESSION_RECLAIMED_CLOSE_CODE) {
    return "This session was opened somewhere else, so this tab stopped reconnecting.";
  }
  if (event.code === SLOW_CONSUMER_CLOSE_CODE) {
    return "The server closed this connection because the browser fell behind reading snapshots.";
  }
  if (reason.length > 0) {
    return `Connection closed (${event.code}: ${reason}).`;
  }
  return `Connection closed (${event.code}).`;
};

const sendClientMessage = (socket: WebSocket, message: ClientMsg): number => {
  const payload = encodeProtocolMessage(message);
  socket.send(payload);
  return payload.byteLength;
};

const isSupportedSocketPayload = (
  value: unknown,
): value is string | ArrayBuffer | ArrayBufferView =>
  typeof value === "string" ||
  value instanceof ArrayBuffer ||
  ArrayBuffer.isView(value);

const decodeServerMessage = (value: unknown): { type?: string } | null => {
  if (!isSupportedSocketPayload(value)) {
    return null;
  }

  try {
    const decoded = decodeProtocolMessage(value);
    if (typeof decoded !== "object" || decoded === null) {
      return null;
    }
    return decoded as { type?: string };
  } catch {
    return null;
  }
};

const readStoredPlayerName = (storage: Storage | null): string =>
  storage?.getItem(PLAYER_NAME_STORAGE_KEY)?.trim() || "Pilot";

const clearStoredRoomSession = (storage: Storage | null): void => {
  storage?.removeItem(RESUME_TOKEN_STORAGE_KEY);
  storage?.removeItem(ROOM_ID_STORAGE_KEY);
};

const snapshotUiState = (
  runtime: AuthoritativeMatchRuntimeState,
): MatchPanelUiState => ({
  connectionError: runtime.connectionError,
  connectionState: runtime.connectionState,
  countdownEndsAtMs: runtime.countdownEndsAtMs,
  lobbyState: runtime.lobbyState,
  matchEnd: runtime.matchEnd,
  phase: runtime.phase,
  pickState: runtime.pickState,
  playerId: runtime.playerId,
  rematchState: runtime.rematchState,
  roomId: runtime.roomId,
  roomRoster: [...runtime.roomRoster],
});

const areRoomRostersEqual = (
  current: MatchPanelUiState["roomRoster"],
  next: MatchPanelUiState["roomRoster"],
): boolean => {
  if (current.length !== next.length) {
    return false;
  }

  for (let index = 0; index < current.length; index += 1) {
    const left = current[index]!;
    const right = next[index]!;
    if (
      left.playerId !== right.playerId ||
      left.name !== right.name ||
      left.seat !== right.seat ||
      left.isBot !== right.isBot
    ) {
      return false;
    }
  }

  return true;
};

const areMatchPanelUiStatesEqual = (
  current: MatchPanelUiState,
  next: MatchPanelUiState,
): boolean =>
  current.connectionError === next.connectionError &&
  current.connectionState === next.connectionState &&
  current.countdownEndsAtMs === next.countdownEndsAtMs &&
  current.lobbyState === next.lobbyState &&
  current.matchEnd === next.matchEnd &&
  current.phase === next.phase &&
  current.pickState === next.pickState &&
  current.playerId === next.playerId &&
  current.rematchState === next.rematchState &&
  current.roomId === next.roomId &&
  areRoomRostersEqual(current.roomRoster, next.roomRoster);

const formatCountdown = (targetAtMs: number, nowMs: number): string => {
  const remainingSec = Math.max(0, Math.ceil((targetAtMs - nowMs) / 1000));
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const describePhase = (uiState: MatchPanelUiState, nowMs: number) => {
  switch (uiState.phase) {
    case "connecting":
      return {
        body: "Opening the authoritative match connection.",
        eyebrow: "Network Runtime",
        title: "Connecting",
      };
    case "reconnecting":
      return {
        body: "Rejoining the current room with the stored resume token.",
        eyebrow: "Network Runtime",
        title: "Reconnecting",
      };
    case "lobby":
      return {
        body:
          uiState.lobbyState === null
            ? "Waiting for lobby state."
            : `${uiState.lobbyState.players.length} pilots staged. Auto-start in ${formatCountdown(
                uiState.lobbyState.autoStartAtMs,
                nowMs,
              )}.`,
        eyebrow: "Lobby",
        title: uiState.roomId ?? "Public Room",
      };
    case "pick":
      return {
        body:
          uiState.pickState === null
            ? "Waiting for picks."
            : `Selecting archetypes. Deadline ${formatCountdown(
                uiState.pickState.deadlineAtMs,
                nowMs,
              )}.`,
        eyebrow: "Pick Phase",
        title: uiState.roomId ?? "Public Room",
      };
    case "countdown":
      return {
        body:
          uiState.countdownEndsAtMs === null
            ? "Match staging."
            : `Deployment in ${formatCountdown(
                uiState.countdownEndsAtMs,
                nowMs,
              )}.`,
        eyebrow: "Countdown",
        title: uiState.roomId ?? "Public Room",
      };
    case "combat":
      return {
        body: "Authoritative combat is live.",
        eyebrow: "Combat",
        title: uiState.roomId ?? "Public Room",
      };
    case "ended":
      return {
        body:
          uiState.matchEnd === null
            ? "Match finished."
            : `Winner: ${formatAuthoritativeWinnerLabel(
                uiState.matchEnd.winnerId,
                uiState.roomRoster,
              )}.`,
        eyebrow: "Match End",
        title: uiState.roomId ?? "Public Room",
      };
    case "error":
      return {
        body: uiState.connectionError ?? "The authoritative runtime failed.",
        eyebrow: "Error",
        title: "Connection Error",
      };
  }
};

export function AuthoritativeGamePanel({
  className = "app-shell",
}: {
  className?: string;
}) {
  const displayMode = getRuntimeTuningDocument().visuals.displayMode;
  const initialProfilingEnabledRef = useRef<boolean | null>(null);
  if (initialProfilingEnabledRef.current === null) {
    initialProfilingEnabledRef.current = readStoredViewportProfilingEnabled();
  }
  const authoritativePerformanceStateRef = useRef({
    profilingEnabled: initialProfilingEnabledRef.current,
    resetToken: 0,
  });
  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<GameViewportController | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const runtimeRef = useRef(createInitialAuthoritativeMatchRuntimeState());
  const networkDiagnosticsRef = useRef(createAuthoritativeNetworkDiagnostics());
  const uiStateRef = useRef<MatchPanelUiState>(
    snapshotUiState(runtimeRef.current),
  );
  const [connectionSessionVersion, setConnectionSessionVersion] = useState(0);
  const [hudState, setHudState] = useState(() => ({
    ...createInitialHudState(),
    profilingEnabled: initialProfilingEnabledRef.current ?? false,
  }));
  const [uiState, setUiState] = useState<MatchPanelUiState>(
    () => uiStateRef.current,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  const sendMeasuredClientMessage = useCallback(
    (socket: WebSocket, message: ClientMsg): void => {
      const byteLength = sendClientMessage(socket, message);
      networkDiagnosticsRef.current.recordOutbound(
        message.type,
        byteLength,
        performance.now(),
      );
    },
    [],
  );

  const dispatchRuntimeMessage = useCallback(
    (message: ClientMsg): boolean => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) {
        return false;
      }

      sendMeasuredClientMessage(socket, message);
      return true;
    },
    [sendMeasuredClientMessage],
  );

  const resetAuthoritativeProfiling = () => {
    authoritativePerformanceStateRef.current.resetToken += 1;
    networkDiagnosticsRef.current.reset(performance.now());
    startTransition(() => {
      setHudState((current) => ({
        ...current,
        debugItems: [],
      }));
    });
  };

  const setAuthoritativeProfilingEnabled = (value: boolean) => {
    authoritativePerformanceStateRef.current.profilingEnabled = value;
    authoritativePerformanceStateRef.current.resetToken += 1;
    persistProfilingEnabled(window.localStorage, value);
    startTransition(() => {
      setHudState((current) => ({
        ...current,
        debugItems: [],
        profilingEnabled: value,
      }));
    });
  };

  if (controllerRef.current === null) {
    controllerRef.current = {
      resetProfiling: () => {
        resetAuthoritativeProfiling();
      },
      resetAbilitySettings: () => {},
      resetBlackHoleSettings: () => {},
      resetPlanetVisualSettings: () => {},
      setBotsEnabled: () => {},
      setBoostSetting: () => {},
      setBlackHoleSetting: () => {},
      setCacheBadgeScale: () => {},
      setPlanetBodyScale: () => {},
      setPlanetAuraGap: () => {},
      setPlanetAuraScale: () => {},
      setProfilingEnabled: (value) => {
        setAuthoritativeProfilingEnabled(value);
      },
      pauseSandbox: () => {},
      playSandbox: () => {},
      resetSandbox: () => {},
      setShieldSetting: () => {},
      setOrbitPreset: () => {},
    };
  }

  const queueFreshMatch = useCallback(() => {
    clearStoredRoomSession(window.localStorage);
    runtimeRef.current = createInitialAuthoritativeMatchRuntimeState();
    networkDiagnosticsRef.current.reset(performance.now());
    uiStateRef.current = snapshotUiState(runtimeRef.current);
    startTransition(() => {
      setUiState(uiStateRef.current);
      setHudState((current) => ({
        ...createInitialHudState(),
        profilingEnabled: current.profilingEnabled,
      }));
    });
    setConnectionSessionVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      startTransition(() => {
        setNowMs(Date.now());
      });
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }

    return createAuthoritativeViewport(viewportElement, {
      dispatchMessage: dispatchRuntimeMessage,
      displayMode,
      getNetworkDiagnostics: (timeMs) =>
        networkDiagnosticsRef.current.getSnapshot(timeMs),
      getPerformanceState: () => authoritativePerformanceStateRef.current,
      getRuntimeState: () => runtimeRef.current,
      onHudStateChange: (nextHudState) => {
        startTransition(() => {
          setHudState(nextHudState);
        });
      },
    });
  }, [displayMode, dispatchRuntimeMessage]);

  useEffect(() => {
    void connectionSessionVersion;
    const storage = window.localStorage;
    let disposed = false;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let pingTimer: number | null = null;

    const syncUiState = () => {
      if (disposed) {
        return;
      }

      const nextUiState = snapshotUiState(runtimeRef.current);
      if (areMatchPanelUiStatesEqual(uiStateRef.current, nextUiState)) {
        return;
      }

      uiStateRef.current = nextUiState;
      startTransition(() => {
        setUiState(nextUiState);
      });
    };

    const pruneEvents = (currentAtMs: number) => {
      runtimeRef.current.recentEvents = runtimeRef.current.recentEvents.filter(
        (event) => currentAtMs - event.receivedAtMs <= 4000,
      );
    };

    const startPingLoop = (socket: WebSocket) => {
      if (pingTimer !== null) {
        window.clearInterval(pingTimer);
      }

      pingTimer = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        sendMeasuredClientMessage(socket, {
          clientSentAtMs: Date.now(),
          id: `${Date.now()}`,
          type: "ping",
        });
      }, 2000);
    };

    const stopPingLoop = () => {
      if (pingTimer !== null) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const maybeAutoPick = () => {
      const socket = socketRef.current;
      const runtime = runtimeRef.current;
      if (
        socket?.readyState !== WebSocket.OPEN ||
        runtime.phase !== "pick" ||
        runtime.pickState === null ||
        runtime.playerId === null
      ) {
        return;
      }

      const myPick = runtime.pickState.picks.find(
        (pick) => pick.playerId === runtime.playerId,
      );
      if (myPick?.archetypeId !== undefined) {
        return;
      }

      const usedArchetypes = new Set(
        runtime.pickState.picks
          .map((pick) => pick.archetypeId)
          .filter(
            (archetype): archetype is NonNullable<typeof archetype> =>
              archetype !== undefined,
          ),
      );
      const nextArchetype =
        ARCHETYPE_IDS.find((archetype) => !usedArchetypes.has(archetype)) ??
        ARCHETYPE_IDS[0];
      sendMeasuredClientMessage(socket, {
        id: nextArchetype,
        type: "pickArchetype",
      });
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) {
        return;
      }

      runtimeRef.current.connectionState = "reconnecting";
      runtimeRef.current.phase = "reconnecting";
      syncUiState();
      const reconnectDelayMs = Math.min(
        MAX_RECONNECT_DELAY_MS,
        INITIAL_RECONNECT_DELAY_MS * 2 ** Math.min(3, reconnectAttempt),
      );
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelayMs);
    };

    const connect = () => {
      runtimeRef.current.connectionError = null;
      runtimeRef.current.connectionState =
        runtimeRef.current.roomId === null ? "connecting" : "reconnecting";
      runtimeRef.current.phase =
        runtimeRef.current.roomId === null ? "connecting" : "reconnecting";
      syncUiState();

      const socket = new WebSocket(buildSocketUrl(window));
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (disposed || socketRef.current !== socket) {
          socket.close();
          return;
        }
        reconnectAttempt = 0;

        const roomId = storage.getItem(ROOM_ID_STORAGE_KEY)?.trim();
        const resumeToken = storage.getItem(RESUME_TOKEN_STORAGE_KEY)?.trim();
        const profileToken = storage.getItem(PROFILE_TOKEN_STORAGE_KEY)?.trim();
        sendMeasuredClientMessage(socket, {
          join:
            roomId && resumeToken
              ? {
                  kind: "joinRoom",
                  roomId,
                }
              : {
                  kind: "quickGame",
                },
          name: readStoredPlayerName(storage),
          profileToken: profileToken || undefined,
          resumeToken: resumeToken || undefined,
          snapshotVersion: 2,
          type: "hello",
        });
        runtimeRef.current.connectionState = "connected";
        syncUiState();
        startPingLoop(socket);
      });

      socket.addEventListener("message", (event) => {
        if (disposed || socketRef.current !== socket) {
          return;
        }

        const receivedAtMs = performance.now();
        const inboundByteLength = getSocketPayloadByteLength(event.data);
        const parsed = decodeServerMessage(event.data);
        if (parsed === null || typeof parsed.type !== "string") {
          networkDiagnosticsRef.current.recordInbound(
            "unreadable",
            inboundByteLength,
            receivedAtMs,
          );
          return;
        }
        networkDiagnosticsRef.current.recordInbound(
          parsed.type,
          inboundByteLength,
          receivedAtMs,
        );

        pruneEvents(Date.now());

        switch (parsed.type) {
          case "welcome": {
            const message = parsed as WelcomeMsg;
            runtimeRef.current.playerId = message.playerId;
            runtimeRef.current.role = message.role;
            runtimeRef.current.roomId = message.roomId;
            runtimeRef.current.roomRoster = message.roster;
            storage.setItem(PROFILE_TOKEN_STORAGE_KEY, message.profileToken);
            storage.setItem(RESUME_TOKEN_STORAGE_KEY, message.resumeToken);
            storage.setItem(ROOM_ID_STORAGE_KEY, message.roomId);
            runtimeRef.current.phase = "lobby";
            syncUiState();
            return;
          }

          case "lobbyState": {
            const message = parsed as LobbyStateMsg;
            runtimeRef.current.lobbyState = message;
            runtimeRef.current.roomRoster = message.players.map((player) => ({
              isBot: player.isBot,
              name: player.name,
              playerId: player.playerId,
              seat: player.seat,
            }));
            runtimeRef.current.phase = "lobby";
            syncUiState();
            return;
          }

          case "pickState":
            runtimeRef.current.pickState = parsed as PickStateMsg;
            runtimeRef.current.phase = "pick";
            syncUiState();
            maybeAutoPick();
            return;

          case "countdown":
            runtimeRef.current.countdownEndsAtMs = (
              parsed as { endsAtMs: number }
            ).endsAtMs;
            runtimeRef.current.phase = "countdown";
            syncUiState();
            return;

          case "fullSnapshot": {
            const message = parsed as FullSnapshotMsg;
            const phaseChanged = runtimeRef.current.phase !== "combat";
            networkDiagnosticsRef.current.recordSnapshot(
              parsed.type,
              message.tick,
              receivedAtMs,
              message.sentAtMs,
            );
            resetAuthoritativeSnapshotBuffer(runtimeRef.current, {
              receivedAtMs,
              self: message.self,
              tick: message.tick,
              world: message.world,
            });
            runtimeRef.current.phase = "combat";
            sendMeasuredClientMessage(socket, {
              tick: message.tick,
              type: "ackSnapshot",
            });
            if (phaseChanged) {
              syncUiState();
            }
            return;
          }

          case "deltaSnapshot": {
            const currentSnapshot = runtimeRef.current.snapshot;
            if (currentSnapshot === null) {
              return;
            }

            const deltaSnapshot = parsed as DeltaSnapshotMsg;
            const phaseChanged = runtimeRef.current.phase !== "combat";
            networkDiagnosticsRef.current.recordSnapshot(
              parsed.type,
              deltaSnapshot.tick,
              receivedAtMs,
              deltaSnapshot.sentAtMs,
            );
            appendAuthoritativeSnapshot(runtimeRef.current, {
              receivedAtMs,
              self:
                deltaSnapshot.self === undefined
                  ? currentSnapshot.self
                  : (deltaSnapshot.self ?? null),
              tick: deltaSnapshot.tick,
              world: applyDeltaSnapshotToWorld(
                currentSnapshot.world,
                deltaSnapshot,
              ),
            });
            runtimeRef.current.phase = "combat";
            sendMeasuredClientMessage(socket, {
              tick: deltaSnapshot.tick,
              type: "ackSnapshot",
            });
            if (phaseChanged) {
              syncUiState();
            }
            return;
          }

          case "snapshotV2": {
            const currentSnapshot = runtimeRef.current.snapshot;
            if (currentSnapshot === null) {
              return;
            }

            const snapshot = parsed as SnapshotV2Msg;
            const phaseChanged = runtimeRef.current.phase !== "combat";
            networkDiagnosticsRef.current.recordSnapshot(
              parsed.type,
              snapshot.tick,
              receivedAtMs,
              snapshot.sentAtMs,
            );
            appendAuthoritativeSnapshot(runtimeRef.current, {
              receivedAtMs,
              self:
                snapshot.self === undefined
                  ? currentSnapshot.self
                  : (snapshot.self ?? null),
              tick: snapshot.tick,
              world: applySnapshotV2ToWorld(currentSnapshot.world, snapshot),
            });
            runtimeRef.current.phase = "combat";
            sendMeasuredClientMessage(socket, {
              tick: snapshot.tick,
              type: "ackSnapshot",
            });
            if (phaseChanged) {
              syncUiState();
            }
            return;
          }

          case "event":
            runtimeRef.current.recentEvents.push({
              event: (parsed as EventMsg).event,
              id: runtimeRef.current.nextEventId,
              receivedAtMs: Date.now(),
            });
            runtimeRef.current.nextEventId += 1;
            return;

          case "matchEnd":
            runtimeRef.current.matchEnd = parsed as MatchEndMsg;
            runtimeRef.current.phase = "ended";
            clearStoredRoomSession(storage);
            syncUiState();
            return;

          case "rematchState":
            runtimeRef.current.rematchState = parsed as RematchStateMsg;
            return;

          case "pong":
            runtimeRef.current.rttMs = Math.max(
              0,
              Date.now() - (parsed as PongMsg).clientSentAtMs,
            );
            return;

          case "error": {
            const message = parsed as ErrorMsg;
            runtimeRef.current.connectionError = message.message;
            if (
              message.code === "bad_resume_token" ||
              message.code === "invalid_room"
            ) {
              queueFreshMatch();
              return;
            }

            runtimeRef.current.phase = "error";
            syncUiState();
            return;
          }
        }
      });

      socket.addEventListener("close", (event) => {
        if (socketRef.current !== socket) {
          return;
        }

        stopPingLoop();
        socketRef.current = null;
        if (disposed) {
          return;
        }

        runtimeRef.current.connectionError = formatSocketCloseError(event);
        if (event.code === SESSION_RECLAIMED_CLOSE_CODE) {
          runtimeRef.current.connectionState = "error";
          runtimeRef.current.phase = "error";
          syncUiState();
          return;
        }

        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        if (disposed || socketRef.current !== socket) {
          return;
        }

        runtimeRef.current.connectionError =
          "Authoritative match socket failed before a close code was reported.";
        runtimeRef.current.connectionState = "reconnecting";
        syncUiState();
      });
    };

    connect();

    return () => {
      disposed = true;
      stopPingLoop();
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connectionSessionVersion, queueFreshMatch, sendMeasuredClientMessage]);

  const requestRematch = () => {
    if (
      !dispatchRuntimeMessage({
        type: "voteRematch",
        yes: true,
      })
    ) {
      queueFreshMatch();
    }
  };

  const phaseCopy = describePhase(uiState, nowMs);
  const rematchVotePending =
    uiState.phase === "ended" &&
    uiState.rematchState !== null &&
    uiState.playerId !== null &&
    uiState.rematchState.yesPlayerIds.includes(uiState.playerId);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
      <div
        className={`hud-root${displayMode === "vhs" ? " hud-root--inside-crt" : ""}`}
      >
        <CombatHud
          controller={controllerRef.current}
          displayMode={displayMode}
          hud={hudState}
          hudTuning={getRuntimeTuningDocument().visuals.hud}
          showPerformanceTools
        />
      </div>
      <div className="page-overlay page-overlay--page">
        <div className="page-chrome">
          <section className="page-copy" style={{ pointerEvents: "auto" }}>
            <div className="edit-panel__eyebrow">{phaseCopy.eyebrow}</div>
            <h1 className="edit-panel__title">{phaseCopy.title}</h1>
            <div className="edit-panel__body">{phaseCopy.body}</div>
            {uiState.connectionError ? (
              <div className="edit-status edit-status--error">
                {uiState.connectionError}
              </div>
            ) : null}
            {uiState.phase === "ended" || uiState.phase === "error" ? (
              <div className="edit-panel__actions">
                {uiState.phase === "ended" ? (
                  <button
                    type="button"
                    className="edit-action-button"
                    onClick={requestRematch}
                  >
                    {rematchVotePending ? "Vote Sent" : "Play Again"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="edit-action-button"
                  onClick={queueFreshMatch}
                >
                  New Match
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
