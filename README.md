- Shake camera when get hit by missile, I think we already have something for when a planet is destroyed 
- Flicker HUD and screen on missile hit (when a missile hits the player) , be able to test in /edit&item=HUD
- Asteroids losing from the circle radius going into the game, big, small, etc. shouldnt maybe destroy but damage depending on the asteroid size

# 3BODY

A 2D multiplayer arena game built on the chaotic dynamics of the three-body problem.

boulders in map, speed stuff

Design: [`docs/3BODY.md`](docs/3BODY.md) · Stack: [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md)

## Stack

- **Frontend:** Vite + React + TypeScript + Three.js
  Renderer stack: `three/webgpu` + TSL (`three/tsl`).
- **Backend:** Bun + TypeScript (WebSocket game server)
- **Shared:** TypeScript module imported by both sides (physics, types, constants)
- **Workspaces:** npm

## Requirements

- Node ≥ 20
- npm ≥ 10
- Bun ≥ 1.3

## Setup

```sh
npm install
```

## Development

Run frontend and backend together:

```sh
npm run dev
```

Or individually:

```sh
npm run dev -w @3body/frontend   # http://localhost:1337
npm run dev -w @3body/backend    # bun --watch
```

The primary authoritative game shell now lives on:

```text
http://localhost:1337/
```

The local sandbox and tooling route live separately on:

```text
http://localhost:1337/sandbox
```

The authoritative route also remains available on the legacy compatibility path:

```text
http://localhost:1337/network
```

## Typecheck

```sh
npm run typecheck
```

## Build

```sh
npm run build
```

Produces `src/frontend/dist/` (static site) and `src/backend/dist/3body-server` (compiled Bun binary, linux-x64).

## Deploy

Starter deployment templates live in `deploy/`:

- `deploy/Caddyfile` — same-origin static hosting + `/ws` reverse proxy
- `deploy/3body-server.service` — systemd unit template
- `deploy/deploy.sh` — manual `rsync` + restart helper template

## Layout

```
src/
  shared/    # @3body/shared — physics, entity types, constants
  frontend/  # @3body/frontend — React + Three.js client
  backend/   # @3body/backend — Bun game server
docs/        # design and implementation docs
```
