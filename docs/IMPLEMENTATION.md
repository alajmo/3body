# 3BODY — Implementation Stack

Opinionated, concrete picks for building the game described in `3BODY.md`. Everything is free / open-source unless noted.

**Stack at a glance:** React + Three.js (TypeScript) on the client, **Bun** (TypeScript) on the server, npm workspaces, deployed to a Hetzner Cloud VPS behind Caddy. TypeScript end-to-end means the N-body simulation, entity types, and constants are written **once** in `src/shared` and imported by both sides.

**Renderer / shader direction:** use **`three/webgpu` + `three/tsl` node materials** as the frontend rendering architecture.

---

## 1. Repo layout

npm workspaces (npm ≥ 7 supports them natively).

```
/3body
├── package.json                 # workspaces: ["src/shared", "src/frontend", "src/backend"]
├── src/
│   ├── frontend/                # Vite + React + Three.js (browser)
│   │   ├── package.json
│   │   └── src/
│   ├── backend/                 # Bun runtime, authoritative game server
│   │   ├── package.json
│   │   └── src/main.ts
│   └── shared/                  # TS code imported by both frontend and backend
│       ├── package.json
│       └── src/
│           ├── vec2.ts
│           ├── physics.ts       # Velocity Verlet integrator
│           ├── constants.ts     # G, sun mass, HP, damage, cooldowns
│           ├── entities.ts      # Planet, Rocket, Sun, Cache types
│           └── protocol.ts      # input + snapshot message types
└── deploy/                      # Caddyfile, systemd unit, deploy script/template
```

Because both ends are TypeScript, **the simulation, entity types, balance constants, and wire-message shapes all live in `src/shared` and are imported directly** — no codegen, no Protobuf, no parity tests. One place to change a number, both sides pick it up.

---

## 2. Client tooling

| Need                 | Pick                  | Why                                                   |
|----------------------|-----------------------|-------------------------------------------------------|
| Bundler / dev server | **Vite**              | Instant HMR, ESM-native, zero-config TS.              |
| Language             | **TypeScript** strict | Catches everything before runtime.                    |
| Linter / formatter   | **Biome**             | One tool, fast, no config soup.                       |
| Tests                | **Vitest**            | Vite-native; useful for shared physics, interpolation, and protocol logic. |

---

## 3. Rendering — Three.js

- **three** (latest) with an **OrthographicCamera** by default. This gives you crisp 2D positioning while keeping the option of subtle 3D effects.
- **Renderer target:** **`WebGPURenderer` from `three/webgpu`** with the built-in WebGL 2 fallback path where the browser cannot do WebGPU yet. Do not maintain two separate shader authoring systems unless forced by a missing feature.
- **Camera language:** live play should smooth-follow the locally controlled planet and keep it near screen center. Read Mode widens zoom but does not unlock free camera; drone mode follows the drone; free camera is spectator-only.
- **Shader authoring:** prefer **TSL node materials** (`three/tsl`) over handwritten GLSL strings. TSL keeps shader logic in TS/JS, aligns with Three's WebGPU path, and still targets the fallback backend.
- **Planets as actual spheres** using `SphereGeometry` + a **TSL-driven node material**. The procedural planet shader runs on the sphere surface, so planets visibly rotate. Costs nothing visually compared to flat discs and looks dramatically better.
- **Suns** as larger spheres with their own animated **TSL** material + corona via post-processing bloom.
- **Arena boundary** as an always-visible ring mesh at `ARENA_RADIUS`; when a planet is outside it, intensify the ring and add a subtle screen-space vignette/desaturation as feedback.
- **Rockets** as three instanced-mesh pools (`InstancedMesh`), one per kind, so you keep type-distinct materials without exploding draw calls. Light = thin white, Heavy = orange-red and thicker, Seeker = pulsing magenta.
- **Black Hole** as an overtime-only render stack: dark core mesh, emissive accretion ring, and a light screen-space distortion/lensing pass. Its transform/radius still come from authoritative server state.
- **Trails** with custom geometry: a ribbon of recent positions per planet, rebuilt each frame (≤60 verts per planet, trivial).
- **Debris** as short-lived particle bursts driven by authoritative `Debris` entities from the server, not just local hit effects.
- **Background** starfield as a single `Points` cloud with a custom **TSL** point material.

**Post-processing (the visual ceiling-raiser):**
- Use Three's **renderer-native node/TSL post-processing path** on `WebGPURenderer`.

**Particles:**
- Prefer repo-native `PointsNodeMaterial` / `InstancedPointsNodeMaterial` or custom TSL-backed `Points` effects for explosions and rocket exhaust.
- Only reach for a third-party particle library if the repo-native TSL path proves insufficient for a specific effect.

**UI / HUD:** DOM-based, layered over the canvas (don't draw HUD in Three.js).
- **React** for lobby, pick screen, HUD overlays.
- Plain CSS / CSS modules is enough for MVP; add a utility framework later only if styling becomes a bottleneck.

---

## 4. Physics (written once, in `src/shared`)

The N-body simulation lives in `src/shared/src/physics.ts` and is imported by both the server (authoritative) and the client (Foresight prediction, offline sandbox, and debug tooling).

- **Integrator:** Velocity Verlet (symplectic — stable orbits over long timescales). Avoid plain Euler (orbits decay) and RK4 (energy still drifts and 4× the cost).
- **Time step:** Server runs sim at 120 Hz (fixed). In live multiplayer, the client does **not** advance authoritative planet state locally; it renders server snapshots and interpolates between them. The shared integrator on the client is only for non-authoritative preview work such as Foresight or offline sandboxing.
- **Offline ownership:** `AI Game` should live in the frontend as a local `LocalMatch` / `LocalRoom` runner that drives the same phase flow without a WebSocket. Keep its state shape aligned with the networked room model so React screens and HUD selectors can be shared. When a gameplay rule is needed by both local and networked play, extract it into `src/shared` as a pure helper rather than silently forking behavior.
- **Overtime hazard:** the same shared integrator should accept an optional Black Hole attractor so the server's overtime collapse and any client-side preview/debug tooling use identical math.
- **Vector math:** Hand-rolled `Vec2` in `src/shared/src/vec2.ts`. ~30 lines.
- **Softening:** Add ε² in the denominator: `F = G·m1·m2 / (r² + ε²)` so close passes don't explode numerically.
- **Determinism:** Use a seeded PRNG for any randomness (initial conditions, cache spawns) so replays from the same seed reproduce exactly. `mulberry32` is fine.

---

## 5. Server — Bun

- **Runtime:** **Bun ≥ 1.3.** TypeScript runs natively (no transpile step), startup is sub-100 ms, and `Bun.serve` ships with a first-class WebSocket API that's faster than `ws` on Node.
- **WebSocket:** `Bun.serve({ websocket: { open, message, close }, fetch })`. No library needed.
- **Room model:** one `Room` object per match. A single `setInterval`-style loop using `setTimeout` recursion or `Bun`'s timer drives the 120 Hz tick. Inputs from each socket land in the room's input queue; the tick consumes them, advances the sim, and broadcasts a snapshot.
- **Matchmaking:** in-process `Map<RoomId, Room>` plus a small public quick-game pool. Networked V1 supports private room codes and public quick-game rooms; the separate `AI Game` path stays local/offline in the frontend and reuses the shared sim.
- **Persistence boundary:** live room state, authoritative physics, input queues, bot state, cooldowns, and snapshot buffers stay **in memory only**. Do not write per-tick gameplay state to SQLite.
- **Durable data:** use Bun's built-in SQLite (`bun:sqlite`) for coarse-grained persistence only: player profiles, cumulative stats, highscores / leaderboards, match history, and later moderation or account metadata.
- **Scope call:** durable cross-session stats / leaderboards are a follow-on V1 slice. Keep the schema and deploy path designed now, but do **not** let SQLite work block the first playable gameplay loop.
- **Profile identity without accounts:** for durable stats in V1, persist an opaque device-local `profileToken` in the browser, send it on `hello`, and store only its hash server-side. That token maps back to the same durable `playerId` across sessions. `resumeToken` remains room-scoped reconnect state only.
- **Write timing:** only hit SQLite at coarse events such as match end, profile/settings updates, or moderation actions. Match-end persistence should run outside the 120 Hz tick and commit the match row, per-player stat rows, and aggregate stat updates in one transaction.
- **SQLite hardening:** keep one process-local database on local disk with schema migrations, prepared statements, `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout`, and `synchronous=FULL`. SQLite is the durable record for scores and history, not the hot path for the simulation.
- **Stats read path:** serve public highscores / leaderboards and per-player cumulative stats through read-only HTTP endpoints on `fetch`, not through the gameplay WebSocket.
- **Wire format:** start with **JSON** (Bun parses/serializes very fast and it's debuggable). Switch to **MessagePack** (`@msgpack/msgpack`) once snapshot bandwidth becomes an issue. Both sides import the same TS message types from `src/shared/src/protocol.ts` — no schema duplication.
- **Snapshot delta encoding:** hand-rolled — only send fields that changed since the last snapshot per client. Keep a per-connection `lastAckTick` updated by explicit snapshot ACK messages to bound memory.
- **Latency measurement:** use app-level `ping` / `pong` messages for the HUD RTT indicator; browser WebSocket APIs do not expose control-frame ping/pong timing.
- **Trust boundary:** the client sends intent only (aim, button edges, fire/ability/drone actions, snapshot ACKs). Positions, velocities, HP, cooldowns, ammo, collisions, and deaths are server-authored only.
- **Abuse controls belong in the app, not only the proxy:** validate `Origin`, cap WS frame size, apply token-bucket limits per IP and per socket, rate-limit chat separately from gameplay input, rotate resume tokens on reclaim, and disconnect slow consumers whose outbound queue keeps growing.
- **Bot AI:** plain TS in the server, fed into the same input queue as humans. Bots and players are indistinguishable to the sim.
- **Single-binary deploy:** `npm run build -w @3body/backend` produces `src/backend/dist/3body-server`, a standalone executable with the Bun runtime baked in. Copy to the box, run. No Node, no `npm install` on the server.

**Useful libs (server):**
- `@msgpack/msgpack` — when you outgrow JSON.
- `pino` — structured logging (works on Bun).
- Nothing else needed for V1.

---

## 6. Production Build & Deploy

Production build/deploy details live in [`PRODUCTION.md`](PRODUCTION.md) so this document stays focused on runtime architecture and repo choices. Use `IMPLEMENTATION.md` for how the game is built; use `PRODUCTION.md` for how it is shipped.

---

## 7. Audio

- **Howler.js** for SFX (pooling, spatial pan, fade). Tiny, battle-tested.
- **Web Audio API directly** for the gravity-proximity drone — continuous filter modulation tied to nearest-sun distance is easier raw than through a wrapper.

---

## 8. Sprites & visual assets

The look is **mostly procedural / shader-driven**, with a small amount of sprite work for UI and icons.

**Procedural (core entities):**
- **Planets:** TSL material using simplex / FBM-style noise on `SphereGeometry`. Per-planet seed → unique surface. Each archetype gets a hue palette + noise params. ShaderToy / IQ references are still useful, but the implementation should be ported into TSL helpers rather than kept as raw GLSL blobs.
- **Suns:** Animated TSL material on a sphere + bloom for the corona.
- **Gravity warp rings:** TSL distortion material over the background, sampled radially from each sun.
- **Rocket exhaust:** Custom `Points` material authored in TSL with additive blending.

**Sprite / icon sources:**
- **Kenney.nl** (CC0) — Space packs with rockets, planets, UI elements. No attribution required.
- **Game-icons.net** (CC-BY) — clean SVG icons for ability buttons, rocket-type icons, HUD glyphs.
- **OpenGameArt.org** — wider variety; check license per asset.
- **itch.io** asset packs — many free or cheap; "space" / "sci-fi" tags. Watch licenses.

**Fonts:**
- **Google Fonts** — one display font (Orbitron or Audiowide) and one body font (Inter).

---

## 9. Shaders / TSL — where to get them

**Primary sources for the actual implementation path:**
- **Three.js TSL docs** — the source of truth for shader authoring in this repo's target architecture. Learn the node vocabulary, built-ins, and material composition here first.
- **Three.js `webgpu_*` / node-material examples** — best references for how Three expects TSL materials and render passes to be assembled in practice.
- **`mrdoob/three.js` repo**, `examples/jsm/tsl/` and node-material examples — concrete patterns for reusable helpers, uniforms, noise composition, and post-processing in the same paradigm we want in the game.

**Algorithm / look-development references to port into TSL:**
- **ShaderToy.com** — still the largest library of procedural shader ideas. Treat it as a math and look-dev source; port the useful parts into TSL rather than embedding the original GLSL directly.
- **Inigo Quilez's site** (iquilezles.org/articles) — canonical noise, SDF, raymarching, and shaping functions. Excellent raw material for TSL helper functions.
- **GLSL Sandbox** (glslsandbox.com) — another archive of ideas worth porting when the effect is simple enough.
- **Three.js examples** (threejs.org/examples/) — useful for both old WebGL GLSL effects and newer node/TSL examples. Prefer the node / WebGPU examples when both exist.

**Prebuilt effect libraries:**
- **Three's renderer-native node / TSL post-processing stack** is the default post FX path.
- **Three's node-material stack for `Points`, `InstancedPoints`, sprites, and instanced meshes** is the default VFX path before adding extra runtime dependencies.
- **`maath`** (pmndrs) can be useful as a math/noise reference, but prefer porting any kept pieces into local TSL helpers instead of broadening the runtime stack.

**Shader-authoring rule:**
- Prefer local reusable **TSL helper functions** over external shader-snippet dependencies. If an existing GLSL snippet has the exact math we want, port the underlying algorithm into TSL so the codebase stays on one shader language.

**Curated lists worth bookmarking:**
- **awesome-webgl** — index of WebGL libs, tools, demos.
- **awesome-three.js** — curated Three.js resources including shader collections.

---

## 10. Sound effects & music

- **freesound.org** — large CC library; search "laser", "explosion", "drone". Filter for CC0 to skip attribution.
- **Sonniss GDC Game Audio Bundle** — free annual drop, 30+ GB of pro SFX, royalty-free for game use.
- **jsfxr** / **sfxr.me** — procedural retro SFX generator. Quick placeholder shoot/hit/pickup sounds during prototyping.
- **Music:** incompetech.com (Kevin MacLeod, CC-BY) — one moody ambient loop is enough for V1.

---

## 11. Suggested build order

Mirrors the milestones in `3BODY.md` §14 with libs called out:

1. `npm init` workspace with `src/frontend/`, `src/backend/`, `src/shared/`. Install Vite + React + TS + Three.js in the frontend, and wire Biome at repo root early.
2. Write `Vec2` + Velocity Verlet in `shared/`. Import into client. Render 3 suns + 1 planet under N-body gravity. **Single-player only.** Tune until the chaos feels good. This is the most important gate.
3. Procedural planet and sun materials in **TSL** on `SphereGeometry`. Add bloom and other post FX through the renderer-native path. The visual identity should land here.
4. Add rockets (Light first), Howler for SFX, particle exhaust.
5. Add abilities — Foresight first because it's the diagnostic tool you'll use to tune everything else.
6. Stand up the Bun server: `Bun.serve` with WebSocket, private room-code create/join flow, public quick-game rooms, one `Room` object, 120 Hz tick, explicit snapshot ACKs, and resume tokens. Import the same physics from `shared/`. Move authoritative sim from client to server. Client becomes renderer + input sender + interpolator for networked play, while `AI Game` continues to reuse the local/offline loop. Test 2-player on localhost.
7. Follow [`PRODUCTION.md`](PRODUCTION.md) to build and deploy a production slice. Test 2-player over the internet.
8. Bots (Easy tier first, plain TS in the server), Caches, Salvage Drone, archetypes, polish.
