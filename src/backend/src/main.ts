import { config } from "./config";
import type { ConnectionWebSocketData } from "./connection";
import { log } from "./log";
import { MatchmakingService } from "./matchmaking";
import { isLeaderboardMetric, StatsStore } from "./stats-store";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isLoopbackIp = (ip: string): boolean =>
  ip === "127.0.0.1" ||
  ip === "::1" ||
  ip.startsWith("::ffff:127.") ||
  ip === "localhost";

const hasForwardedHeaders = (request: Request): boolean =>
  request.headers.has("x-forwarded-for") || request.headers.has("x-real-ip");

const deriveClientIp = (
  request: Request,
  peerIp: string | null | undefined,
): string => {
  const directIp = peerIp?.trim() || "unknown";
  if (!isLoopbackIp(directIp)) {
    return directIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(",")[0]?.trim();
    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return directIp;
};

const isOriginAllowed = (origin: string | null, clientIp: string): boolean => {
  if (origin === null) {
    return isLoopbackIp(clientIp);
  }

  return (
    config.allowedOrigins.includes("*") ||
    config.allowedOrigins.includes(origin)
  );
};

const jsonError = (status: number, message: string): Response =>
  Response.json({ error: message }, { status });

const statsStore = new StatsStore(config.dataDir);
const matchmaking = new MatchmakingService(config, statsStore);
let shuttingDown = false;

const server: Bun.Server<ConnectionWebSocketData> = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch(request, bunServer) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return Response.json({
        ok: true,
        host: config.host,
        port: config.port,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/leaderboards") {
      const metric = url.searchParams.get("metric") ?? "wins";
      if (!isLeaderboardMetric(metric)) {
        return jsonError(400, "Invalid leaderboard metric");
      }

      const rawLimit = Number.parseInt(
        url.searchParams.get("limit") ?? "50",
        10,
      );
      return Response.json({
        metric,
        entries: statsStore.getLeaderboard(metric, rawLimit),
      });
    }

    const playerStatsMatch = url.pathname.match(
      /^\/api\/players\/([^/]+)\/stats$/,
    );
    if (request.method === "GET" && playerStatsMatch) {
      const playerId = decodeURIComponent(playerStatsMatch[1]!);
      const playerStats = statsStore.getPlayerStats(playerId);
      if (!playerStats) {
        return jsonError(404, "Player not found");
      }

      return Response.json(playerStats);
    }

    if (request.method === "GET" && url.pathname === "/ws") {
      const peerIp = bunServer.requestIP(request)?.address?.trim() || "unknown";
      const trustedProxyPeer = isLoopbackIp(peerIp);
      if (!trustedProxyPeer && hasForwardedHeaders(request)) {
        log.warn("rejected_proxy_headers", { peerIp });
        return jsonError(403, "Forwarded headers not trusted");
      }

      if (!trustedProxyPeer) {
        log.warn("rejected_direct_upgrade", { peerIp });
        return jsonError(403, "Direct websocket traffic not allowed");
      }

      const clientIp = deriveClientIp(request, peerIp);
      const origin = request.headers.get("origin");

      if (!isOriginAllowed(origin, clientIp)) {
        log.warn("rejected_origin", { clientIp, origin });
        return jsonError(403, "Origin not allowed");
      }

      const pending = matchmaking.createPendingConnection(clientIp);
      if (!pending.ok) {
        return jsonError(pending.status, pending.message);
      }

      const upgraded = bunServer.upgrade(request, {
        data: {
          connId: pending.connection.id,
          clientIp,
        },
      });

      if (!upgraded) {
        matchmaking.disposePendingConnection(pending.connection.id);
        return jsonError(400, "WebSocket upgrade failed");
      }

      return;
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    maxPayloadLength: config.wsMaxMsgBytes,
    backpressureLimit: config.outboundQueueMaxBytes,
    closeOnBackpressureLimit: true,
    idleTimeout: Math.max(30, Math.ceil(config.reclaimGraceMs / 1000)),
    open(ws) {
      matchmaking.connectionForId(ws.data.connId)?.attachSocket(ws);
    },
    message(ws, message) {
      matchmaking.connectionForId(ws.data.connId)?.onMessage(message);
    },
    close(ws) {
      matchmaking.connectionForId(ws.data.connId)?.onClose();
    },
    drain(ws) {
      matchmaking.connectionForId(ws.data.connId)?.onDrain();
    },
  },
  error(error) {
    log.error("server_error", error);
    return jsonError(500, "Internal server error");
  },
});

const roomTickTimer = setInterval(() => {
  matchmaking.pruneRooms(Date.now());
}, 250);

const waitForShutdownDrain = async (): Promise<{
  drained: boolean;
  pendingMatchIds: string[];
  activeRoomIds: string[];
}> => {
  const deadlineAtMs = Date.now() + config.shutdownGraceMs;

  while (Date.now() <= deadlineAtMs) {
    const activeRoomIds = matchmaking.activeMatchRoomIds();
    const statsDrain = await matchmaking.drainStatsWrites(0);
    if (activeRoomIds.length === 0 && statsDrain.drained) {
      return {
        drained: true,
        pendingMatchIds: [],
        activeRoomIds: [],
      };
    }

    await sleep(50);
  }

  const finalDrain = await matchmaking.drainStatsWrites(0);
  return {
    drained: false,
    pendingMatchIds: finalDrain.pendingMatchIds,
    activeRoomIds: matchmaking.activeMatchRoomIds(),
  };
};

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  log.info("shutdown_begin", { signal });
  matchmaking.beginShutdown();

  await server.stop(false);
  const drainResult = await waitForShutdownDrain();
  clearInterval(roomTickTimer);
  if (!drainResult.drained) {
    log.warn("shutdown_drain_incomplete", {
      signal,
      pendingMatchIds: drainResult.pendingMatchIds,
      activeRoomIds: drainResult.activeRoomIds,
    });
  }
  matchmaking.closeAllConnections();
  statsStore.close();

  log.info("shutdown_complete", { signal });
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

log.info("listening", {
  host: config.host,
  port: config.port,
});
