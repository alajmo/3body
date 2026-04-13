# 3BODY — Production Build & Deploy

This document is the production counterpart to [`IMPLEMENTATION.md`](IMPLEMENTATION.md). `IMPLEMENTATION.md` defines the runtime stack and architecture; this file defines how to build, ship, and run it in production.

---

## 1. Build Outputs

Two artifacts ship:

- Frontend: static files from `npm run build -w @3body/frontend`, emitted to `src/frontend/dist/`
- Backend: standalone Bun binary from `npm run build -w @3body/backend`, emitted to `src/backend/dist/3body-server`

The production server only needs the static frontend bundle and the compiled backend binary.

---

## 2. Reference Host

Recommended V1 target:

- Hetzner Cloud `CX22`
- Ubuntu 24.04 LTS
- `Caddy` for HTTPS + static file serving + WebSocket reverse proxy
- `systemd` for backend process supervision
- `ufw` with only `22`, `80`, and `443` open
- `fail2ban` on SSH
- Optional CDN / proxy shield (Cloudflare or similar) if the game will be exposed to the broader public internet and not just a small beta audience

This is intentionally simple. One box is enough for V1.

---

## 3. Server Layout

Recommended filesystem layout:

- Frontend static files: `/var/www/3body/`
- Backend binary: `/usr/local/bin/3body-server`
- Optional env/config file: `/etc/3body/3body.env`
- Optional SQLite database + WAL files: `/var/lib/3body/3body.sqlite`
- Optional SQLite backups: `/var/backups/3body/`
- Optional deploy workspace: `/opt/3body/releases/`

The backend should listen on `127.0.0.1:8080`; only Caddy should be public.

---

## 4. Caddy

Minimal Caddyfile:

```caddyfile
3body.example.com {
    encode zstd gzip

    handle /ws* {
        reverse_proxy 127.0.0.1:8080
    }

    handle {
        root * /var/www/3body
        try_files {path} /index.html
        file_server
    }
}
```

This serves the SPA and upgrades `/ws` to the Bun server. The frontend should default to same-origin `/ws` behind this reverse proxy; use `VITE_WS_URL` only when intentionally overriding the backend origin for split-host deployments. Caddy is not the primary anti-spam layer; the backend must still enforce app-aware limits.

If you want explicit forwarded-IP headers in config, keep them local-only:

```caddyfile
3body.example.com {
    encode zstd gzip

    handle /ws* {
        reverse_proxy 127.0.0.1:8080 {
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Forwarded-Host {host}
        }
    }

    handle {
        root * /var/www/3body
        try_files {path} /index.html
        file_server
    }
}
```

---

## 5. Abuse Controls

Production-ready spam / flood defense should be layered:

- Network layer: only Caddy is public; Bun listens on `127.0.0.1`. Keep `ufw` tight and never expose the Bun port directly.
- Upgrade layer: validate `Origin` against an allowlist before accepting `/ws`; reject bad origins before room allocation.
- Identity layer: trust `X-Forwarded-For` only from the local proxy, not from arbitrary clients.
- Message layer: close on malformed JSON, unknown message types, or oversized frames (recommended `WS_MAX_MSG_BYTES` around 4 KiB).
- Quota layer: recommended starting limits are `MAX_SOCKETS_PER_IP=8`, `HANDSHAKES_PER_IP_PER_MIN=20`, `CREATES_PER_IP_PER_10M=6`, `JOINS_PER_IP_PER_MIN=60`. Tune from real traffic.
- Chat layer: recommended starting limits are `CHAT_BURST=4`, `CHAT_WINDOW_MS=10000`, `CHAT_MAX_CHARS=200`, plus duplicate-message suppression and temporary in-memory mute on repeated abuse.
- Backpressure layer: disconnect slow clients whose queued outbound bytes exceed `OUTBOUND_QUEUE_MAX_BYTES` (for example 1 MiB) so one dead socket cannot bloat room memory or stall broadcasts.
- Observability layer: log every reject / throttle / mute / slow-consumer disconnect with client IP, room id if known, and reason.

For real public exposure, a CDN / proxy shield in front of Caddy is strongly recommended for volumetric junk traffic. The backend and Caddy rules above are for app abuse and moderate floods, not for absorbing a large DDoS by themselves.

---

## 6. SQLite

SQLite is for durable, low-frequency data only. It is optional for the first playable gameplay slice; if cross-session stats are deferred, keep gameplay fully in memory and add the database when the follow-on V1 persistence slice lands.

- When enabled, store player profiles, cumulative stats, highscores / leaderboards, and match history here.
- Keep live rooms, the 120 Hz simulation, transient reconnect state, and snapshot buffers in memory.
- If you use device-local `profileToken`s for no-account stats continuity, store only token hashes in SQLite; keep the raw token client-side.
- Put the database on local SSD-backed disk, not on a network filesystem.
- Enable `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, and a non-zero `busy_timeout`.
- Write match results in one transaction after `matchEnd`; never stream per-tick gameplay data into SQLite.
- Preserve `/var/lib/3body/` across deploys and treat the database as stateful host data, not a release artifact.
- Back it up on a schedule using SQLite-aware backups, and verify restores occasionally instead of assuming the backup worked.

Because this game's hot path is the simulation loop, SQLite durability should improve scores/history robustness without becoming a latency dependency for combat.

---

## 7. systemd

Example unit:

```ini
[Unit]
Description=3BODY backend
After=network.target

[Service]
User=www-data
Group=www-data
EnvironmentFile=-/etc/3body/3body.env
Environment=DATA_DIR=/var/lib/3body
ExecStart=/usr/local/bin/3body-server
Restart=always
RestartSec=2
KillSignal=SIGTERM
TimeoutStopSec=15
WorkingDirectory=/var/www/3body
StateDirectory=3body
StateDirectoryMode=0750
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

---

## 8. Manual Deploy Flow

1. Build locally:
   - `npm run build -w @3body/frontend`
   - `npm run build -w @3body/backend`
2. Copy `src/frontend/dist/` to `/var/www/3body/`.
3. Copy `src/backend/dist/3body-server` to `/usr/local/bin/3body-server`.
4. If the SQLite slice is enabled, ensure the service can own `/var/lib/3body/` for database state. The sample `StateDirectory=3body` will create it automatically on first start; do not replace the SQLite files during deploy.
5. Reload or restart services:
   - `systemctl daemon-reload` if the unit changed
   - `systemctl restart 3body-server`
   - `systemctl reload caddy`
6. Verify:
   - `curl https://3body.example.com`
   - `curl http://127.0.0.1:8080/healthz` on the box
   - open the game and confirm the WebSocket connects

Manual deploy is fine for V1. Add CI/CD later if it becomes repetitive.

---

## 9. Rollback

Keep the previous backend binary and previous frontend bundle one release behind.

Rollback procedure:

1. Restore prior frontend files.
2. Restore prior backend binary.
3. `systemctl restart 3body-server`
4. Smoke-test `/healthz` and one browser connection.

---

## 10. Backups & Ops

- Enable Hetzner snapshots/backups.
- Keep logs in journald initially.
- If SQLite is enabled, back up `/var/lib/3body/3body.sqlite*` on a schedule and retain multiple restore points.
- Track these counters from day one: current sockets, sockets per IP, room creates/min, join rejects, rate-limited messages, muted chat events, and slow-consumer disconnects.
- Alert if handshake rejects or rate-limited events spike sharply; that is your earliest abuse signal.
- Add Sentry / PostHog / Prometheus later if needed; they are not MVP blockers.

---

## 11. Out of Scope for MVP

- Docker / Kubernetes
- Zero-downtime deploy orchestration
- Multi-region rollout
- Automatic CI/CD pipelines
- Horizontal room sharding across multiple hosts
