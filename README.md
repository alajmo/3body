- UI for gameplay, node based?
    - when black hole
    - when asteroids, ramp up
    - sun orientation, etc.

  - / menu: Sketchbook 2024-11-7
  - gameplay loop: Sketchbook 2024-10-30
  - intense/end-cycle variant: Sketchbook 2024-08-01

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

The play menu lives at the root, with online and offline routes:

```text
http://localhost:1337/          # play menu (Online / Offline)
http://localhost:1337/online    # authoritative network game
http://localhost:1337/offline   # local simulation (formerly /sandbox)
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

Run the full production build locally:

```sh
HOST=127.0.0.1 PORT=8080 DATA_DIR=.data ./src/backend/dist/3body-server
```

Then open:

```text
http://localhost:8080/
```

The Bun server serves `/ws`, `/api`, and the built frontend from
`src/frontend/dist/`. Use `STATIC_DIR=/path/to/dist` if the frontend files live
elsewhere.

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
