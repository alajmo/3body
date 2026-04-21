# @3body/backend

Run only the backend:

```bash
npm run dev -w @3body/backend
```

Default WebSocket URL:

```text
ws://127.0.0.1:8080/ws
```

Default data directory:

```text
.data/
```

Supported env vars:

- `PORT` default `8080`
- `HOST` default `127.0.0.1`
- `DATA_DIR` default repo-local `.data/`
- `TICK_HZ` default shared `SIM_HZ`
- `MAX_ROOMS` default `64`
- `ROOM_IDLE_TIMEOUT_MS` default `60000`
- `RECLAIM_GRACE_MS` default `30000`
- `SHUTDOWN_GRACE_MS` default `10000`
- `ALLOWED_ORIGINS` default local Vite origins (`1337` and legacy `5173`)
- `WS_MAX_MSG_BYTES` default `65536`
- `MAX_SOCKETS_PER_IP` default `8`
- `HANDSHAKES_PER_IP_PER_MIN` default `30`
- `CREATES_PER_IP_PER_10M` default `12`
- `JOINS_PER_IP_PER_MIN` default `60`
- `CHAT_BURST` default `4`
- `CHAT_WINDOW_MS` default `5000`
- `CHAT_MAX_CHARS` default `200`
- `OUTBOUND_QUEUE_MAX_BYTES` default `1048576`
