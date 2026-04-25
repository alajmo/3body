# Game Loop Overview

This repo has three related loops rather than one single monolithic "game loop":

1. a coarse server room/lifecycle loop
2. an authoritative combat simulation loop
3. frontend viewport loops that either interpolate server snapshots or run a
   local fixed-step sandbox

## Authoritative Server Loop

The real multiplayer game state lives on the backend.

- `src/backend/src/main.ts`
  A coarse maintenance timer runs periodically to prune rooms and advance room
  lifecycle state.
- `src/backend/src/room.ts`
  Rooms move through `lobby`, `pick`, `countdown`, and `combat`.
- `src/backend/src/tick.ts`
  `RoomTicker` is the actual combat ticker for a room in `combat`.

`RoomTicker` uses a time accumulator and the configured tick rate to decide how
many fixed simulation steps to run. Each step calls `updateWorld(...)`, which:

- drains queued player and bot combat messages
- applies player intent and bot decisions
- updates black hole state
- steps suns, planets, rockets, caches, and debris
- resolves collisions, deaths, boundary effects, and ability outcomes
- applies regen and cooldown changes
- increments the authoritative room tick
- records lag-compensation and snapshot history
- finalizes the match when only one planet remains

This is the source of truth for online play.

## Snapshot Broadcast Layer

After authoritative steps run, the server emits snapshots to clients.

- `src/backend/src/matchmaking.ts`

During combat, the server usually broadcasts delta snapshots. If a match ends or
the client cannot safely apply a delta from an acknowledged base tick, the
server falls back to a full snapshot.

So the authoritative loop does two things:

1. advance the world
2. publish enough state for clients to render it

## Authoritative Frontend Loop

The multiplayer client does not simulate the authoritative match locally.

- `src/frontend/src/AuthoritativeGamePanel.tsx`
  Receives `fullSnapshot` and `deltaSnapshot` messages, stores both the current
  and previous snapshots, and ACKs received ticks back to the server.
- `src/frontend/src/game/createAuthoritativeViewport.ts`
  Runs the viewport render loop.
- `src/frontend/src/game/viewport/animationLoopController.ts`
  Owns the visibility-aware animation loop setup/teardown.

Each render frame, the authoritative frontend loop:

- samples frame timing and profiler state
- reads the current and previous snapshots
- computes interpolation alpha from snapshot age
- builds a reusable interpolated render-world
- updates camera state and background motion
- sends current player intent back to the server at a capped cadence
- updates HUD state
- renders the frame

So for online play, the frontend loop is primarily:

- render
- interpolate
- collect input
- send intent

It is not the authority on gameplay outcomes.

## Local Sandbox Loop

The `/offline` route is different. It runs a local simulation on the frontend.

- `src/frontend/src/game/createGameViewport.ts`
  Owns the local sandbox viewport render loop.
- `src/frontend/src/game/viewport/localSandboxSimulation.ts`
  Runs fixed-step local simulation inside an accumulator-driven frame loop.
- `src/frontend/src/game/combatSandbox.ts`
  `stepSandbox(...)` is the per-tick local combat simulation.

On each render frame, the local sandbox loop:

- measures frame delta
- accumulates elapsed time
- runs as many fixed simulation steps as needed
- caps steps per frame to avoid spiral-of-death behavior
- interpolates from previous to current local sandbox state for rendering
- rebuilds render lookups
- updates camera, VFX, HUD, and scene rendering

Inside `stepSandbox(...)`, one local simulation tick:

- clones/syncs controller state for the next step
- applies player input and bot actions
- handles abilities, boosts, reloads, and cooldowns
- spawns rockets and bursts
- steps celestial bodies and combat entities
- resolves impacts, deaths, cache pickups, debris, and respawns
- returns the next sandbox state with incremented `tick` and `elapsedSec`

This path exists so the local sandbox can behave like the real game while still
running entirely in the frontend.

## Practical Summary

If someone asks "what does the game loop do here?", the answer depends on which
layer they mean:

- Backend authoritative loop:
  advances the real match state.
- Authoritative frontend loop:
  interpolates and renders snapshots while sending player intent.
- Local sandbox loop:
  runs a fixed-step local simulation and then renders between steps.

That split is intentional:

- simulation runs at a fixed tick rate
- rendering runs at display frame rate
- multiplayer correctness stays on the server
- local sandbox still uses the same style of fixed-step simulation
