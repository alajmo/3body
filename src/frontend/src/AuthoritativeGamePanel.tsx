import {
  ARCHETYPE_IDS,
  type ClientMsg,
  type DeltaSnapshotMsg,
  type ErrorMsg,
  type EventMsg,
  type FullSnapshotMsg,
  type LobbyStateMsg,
  type MatchEndMsg,
  type PickStateMsg,
  type PongMsg,
  type RematchStateMsg,
  type WelcomeMsg,
} from "@3body/shared";
import { startTransition, useEffect, useRef, useState } from "react";
import { CombatHud } from "./CombatHud";
import {
  applyDeltaSnapshotToWorld,
  createInitialAuthoritativeMatchRuntimeState,
  type AuthoritativeMatchRuntimeState,
} from "./game/authoritativeMatchRuntime";
import { createAuthoritativeViewport } from "./game/createAuthoritativeViewport";
import { getRuntimeTuningDocument } from "./game/runtimeTuning";
import {
  createInitialHudState,
  type GameViewportController,
} from "./game/viewportHud";
import {
  loadViewportSettings,
  persistProfilingEnabled,
} from "./game/viewport/settings";

const PROFILE_TOKEN_STORAGE_KEY = "3body.profileToken";
const RESUME_TOKEN_STORAGE_KEY = "3body.resumeToken";
const ROOM_ID_STORAGE_KEY = "3body.roomId";
const PLAYER_NAME_STORAGE_KEY = "3body.playerName";

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
  roomId: string | null;
  roomRoster: AuthoritativeMatchRuntimeState["roomRoster"];
}

const buildSocketUrl = (windowTarget: Window): string => {
  const url = new URL(windowTarget.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
};

const readStoredPlayerName = (storage: Storage | null): string =>
  storage?.getItem(PLAYER_NAME_STORAGE_KEY)?.trim() || "Pilot";

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
  roomId: runtime.roomId,
  roomRoster: [...runtime.roomRoster],
});

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
            : `Winner: ${uiState.matchEnd.winnerId ?? "Mutual kill"}.`,
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
  const [hudState, setHudState] = useState(() => ({
    ...createInitialHudState(),
    profilingEnabled: initialProfilingEnabledRef.current ?? false,
  }));
  const [uiState, setUiState] = useState<MatchPanelUiState>(() =>
    snapshotUiState(runtimeRef.current),
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  const resetAuthoritativeProfiling = () => {
    authoritativePerformanceStateRef.current.resetToken += 1;
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
      setForesightSetting: () => {},
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
      dispatchMessage: (message: ClientMsg) => {
        const socket = socketRef.current;
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      },
      getPerformanceState: () => authoritativePerformanceStateRef.current,
      getRuntimeState: () => runtimeRef.current,
      onHudStateChange: (nextHudState) => {
        startTransition(() => {
          setHudState(nextHudState);
        });
      },
    });
  }, []);

  useEffect(() => {
    const storage = window.localStorage;
    let disposed = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;

    const syncUiState = () => {
      if (disposed) {
        return;
      }

      const snapshot = snapshotUiState(runtimeRef.current);
      startTransition(() => {
        setUiState(snapshot);
      });
    };

    const clearSession = () => {
      storage.removeItem(RESUME_TOKEN_STORAGE_KEY);
      storage.removeItem(ROOM_ID_STORAGE_KEY);
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

        socket.send(
          JSON.stringify({
            clientSentAtMs: Date.now(),
            id: `${Date.now()}`,
            type: "ping",
          }),
        );
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
      socket.send(
        JSON.stringify({
          id: nextArchetype,
          type: "pickArchetype",
        }),
      );
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) {
        return;
      }

      runtimeRef.current.connectionState = "reconnecting";
      runtimeRef.current.phase = "reconnecting";
      syncUiState();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1500);
    };

    const connect = () => {
      runtimeRef.current.connectionError = null;
      runtimeRef.current.connectionState =
        runtimeRef.current.roomId === null ? "connecting" : "reconnecting";
      runtimeRef.current.phase =
        runtimeRef.current.roomId === null ? "connecting" : "reconnecting";
      syncUiState();

      const socket = new WebSocket(buildSocketUrl(window));
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (disposed) {
          socket.close();
          return;
        }

        const roomId = storage.getItem(ROOM_ID_STORAGE_KEY)?.trim();
        const resumeToken = storage.getItem(RESUME_TOKEN_STORAGE_KEY)?.trim();
        const profileToken = storage.getItem(PROFILE_TOKEN_STORAGE_KEY)?.trim();
        socket.send(
          JSON.stringify({
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
            type: "hello",
          }),
        );
        runtimeRef.current.connectionState = "connected";
        syncUiState();
        startPingLoop(socket);
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        let parsed: { type?: string } | null = null;
        try {
          parsed = JSON.parse(event.data) as { type?: string } | null;
        } catch {
          return;
        }
        if (parsed === null || typeof parsed.type !== "string") {
          return;
        }

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
            const nowAtMs = performance.now();
            runtimeRef.current.previousSnapshot = runtimeRef.current.snapshot;
            runtimeRef.current.snapshot = {
              receivedAtMs: nowAtMs,
              self: message.self,
              tick: message.tick,
              world: message.world,
            };
            socket.send(
              JSON.stringify({
                tick: message.tick,
                type: "ackSnapshot",
              }),
            );
            syncUiState();
            return;
          }

          case "deltaSnapshot": {
            const currentSnapshot = runtimeRef.current.snapshot;
            if (currentSnapshot === null) {
              return;
            }

            const deltaSnapshot = parsed as DeltaSnapshotMsg;
            runtimeRef.current.previousSnapshot = currentSnapshot;
            runtimeRef.current.snapshot = {
              receivedAtMs: performance.now(),
              self:
                deltaSnapshot.self === undefined
                  ? currentSnapshot.self
                  : (deltaSnapshot.self ?? null),
              tick: deltaSnapshot.tick,
              world: applyDeltaSnapshotToWorld(
                currentSnapshot.world,
                deltaSnapshot,
              ),
            };
            runtimeRef.current.phase = "combat";
            socket.send(
              JSON.stringify({
                tick: deltaSnapshot.tick,
                type: "ackSnapshot",
              }),
            );
            syncUiState();
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
              clearSession();
              runtimeRef.current.roomId = null;
              runtimeRef.current.phase = "reconnecting";
              socket.close();
              syncUiState();
              return;
            }

            runtimeRef.current.phase = "error";
            syncUiState();
            return;
          }
        }
      });

      socket.addEventListener("close", () => {
        stopPingLoop();
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (!disposed) {
          scheduleReconnect();
        }
      });

      socket.addEventListener("error", () => {
        runtimeRef.current.connectionError =
          "Authoritative match connection failed.";
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
  }, []);

  const phaseCopy = describePhase(uiState, nowMs);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
      <div className="hud-root">
        <CombatHud
          controller={controllerRef.current}
          hud={hudState}
          hudTuning={getRuntimeTuningDocument().visuals.hud}
          showPerformanceTools
        />
      </div>
      <div className="page-overlay page-overlay--page">
        <div className="page-chrome">
          <section className="page-copy">
            <div className="edit-panel__eyebrow">{phaseCopy.eyebrow}</div>
            <h1 className="edit-panel__title">{phaseCopy.title}</h1>
            <div className="edit-panel__body">{phaseCopy.body}</div>
            {uiState.connectionError ? (
              <div className="edit-status edit-status--error">
                {uiState.connectionError}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
