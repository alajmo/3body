# Frontend MVP — Parallel Work

Most frontend work can proceed **in parallel** with the backend once [`TODO.md`](TODO.md) Phase L0 (shared module) is complete. Phase 0 bootstrap can start earlier; linear/coordinated work — shared types, networking handshake, lobby/combat sync-up, MVP exit — lives in [`TODO.md`](TODO.md); don't duplicate it here.

Convention: `[ ]` = not started, `[x]` = done. `(L*)` = pairs with a linear phase in `TODO.md`.

> **Coordination:** the backend is being built in parallel by another agent following [`TODO-BE.md`](TODO-BE.md). `src/shared/` is owned by `TODO.md` Phase L0 — read what's there and reuse it, do **not** re-author.
>
> **Rendering direction:** use **`three/webgpu` + `three/tsl`** for the viewport, materials, and post-processing path.

---

## Phase 0 — Project bootstrap

Runs immediately; no backend dependency beyond the workspace wiring. Anything that imports `@3body/shared` waits for `TODO.md` L0 to land.

- [x] Run `npm install` at repo root, confirm workspaces resolve (`@3body/shared` importable from frontend).
- [x] Add Biome at repo root with `lint`, `format`, and `format:check` scripts covering `src/frontend`, `src/backend`, and `src/shared`.
- [x] Convert the frontend bootstrap to React (`main.tsx` + ReactDOM + Vite React plugin) and mount an empty React HUD root above the Three.js canvas so Phase 7/9 do not require a renderer rewrite later.
- [x] Add Vite + Three.js boot: render an empty dark canvas covering the viewport, with `OrthographicCamera` centered on origin.
- [x] Add a window-resize handler that keeps world units consistent (visible world height ≈ arena diameter).
- [x] Use `WebGPURenderer` from `three/webgpu` for the viewport bootstrap.
- [x] Replace the string-shader bootstrap with a minimal TSL material/bootstrap path (`three/tsl`).
- [x] Remove the legacy shader/bootstrap dependencies from the frontend boot path.

**Done when:** dark canvas renders, resizes correctly, an empty React overlay layer sits above it, and the viewport boot path is on the TSL renderer stack.

---

## Phase 1 — Single-player physics sandbox

Goal: default offline orbit sandbox with 3 suns + 7 planets under N-body gravity, **no networking, no combat**. Depends on `TODO.md` L0 shared physics. The retune/acceptance details for this phase live in [`ORBIT.md`](../ORBIT.md).

- [x] Instantiate 3 suns near an equilateral triangle with small asymmetric offsets/velocities for chaos.
- [x] Add a 7-planet pack with distinct inner / transfer / outer orbit profiles instead of a single safe orbit.
- [x] Run the sim at 120 Hz in a fixed-step accumulator loop; render at vsync.
- [x] Render suns + planets as simple filled unlit bodies for now.
- [x] Render the arena boundary ring at `ARENA_RADIUS` from the start so the playable space is always readable.
- [x] Add per-frame **trail** rendering (last ~3s, fading alpha) for planets.
- [x] Tune the default preset until typical runs remain watchable for 60+ seconds of interesting orbital chaos before sun collision / reset.
- [x] Add sandbox auto-reset when suns collide, all planets are lost, or the run becomes uninteresting too early.
- [x] Add lightweight debug readouts during tuning (`preset`, elapsed time, alive planets, min gaps).

**Done when:** you can watch the default preset for about a minute and the motion feels unstable but readable, with mixed-risk planets still alive and making believable close solar passes.

---

## Phase 2 — Visual identity

- [x] Procedural **planet material** in TSL: simplex noise → surface bands, per-planet seed uniform, hue palette uniform. Apply to `SphereGeometry` so the planet visibly rotates.
- [x] Procedural **sun material** in TSL: animated noise + corona falloff. Bright emissive output for bloom.
- [x] Add bloom through the target renderer/post-processing path so suns and rocket exhausts glow without re-introducing a raw-GLSL-only dependency.
- [x] Add **starfield background**: large `Points` cloud with custom TSL point material, very subtle parallax tied to camera.
- [x] Default the sandbox camera to a smooth player-follow view instead of permanent full-map framing, with `F` toggling full view / follow view.
- [x] Add **gravity warp rings** around each sun — radial distortion material sampled over the background, intensity falls off with `1/r²`.
- [x] Add subtle **chromatic aberration** post-effect, intensity scaled by the sandbox's nearest live planet↔sun distance (player-distance proxy until local control exists).
- [x] Prototype the Black Hole visual stack now: dark core, accretion band, and slight lensing/distortion. Keep it hidden until overtime so the asset/effect work is solved before networking.
- [x] Color-code planet trails per planet ID (palette of 7).

**Done when:** screenshot of the sandbox would make someone go "oh".

---

## Phase 3 — Local combat sandbox

Still single-player and local-sim. Build the loop, then network it.

- [x] Implement mouse → world coordinate conversion. Render aim **reticle** at cursor + faint line planet → cursor.
- [x] Implement **Light rocket** firing on click. Inherit planet velocity + add muzzle velocity toward cursor. Visual: thin white bolt.
- [x] Add **rocket trails** via custom `Points` material in TSL with additive blending and output tuned for the renderer-native bloom threshold.
- [x] Implement **Heavy rocket** + **Seeker rocket** (Seeker locks on planet under cursor at fire time, applies turn-rate-limited steering). Visuals: Heavy = thicker orange-red shot, Seeker = pulsing magenta shot with readable lock feedback.
- [x] Render active rockets through three `InstancedMesh` pools (one per rocket kind) so high rocket counts keep draw calls flat while preserving distinct materials.
- [x] Implement rocket selection (`1`/`2`/`3` keys) with currently-selected indicator on the reticle.
- [x] Implement reload / clip rules per rocket type from constants.
- [x] Implement HP per planet (default 100) and damage on hit.
- [x] Implement **death**: planet destroyed on HP=0, sun contact, Black Hole contact, or planet↔planet collision. Spawn debris particle burst.
- [ ] In networked mode, render authoritative `Debris` entities from snapshots/events so remote deaths use the same visual language as local ones.
- [x] Implement **deep space damage** when outside arena boundary (5 HP/s ramping to 20), plus clear feedback: stronger boundary ring + subtle vignette/desaturation. No fog-of-war or hidden enemies.
- [x] After 5:00 elapsed combat time, reveal and render the central Black Hole from authoritative match state: readable event horizon, strong inward pull, and instant-kill radius on contact.

**Done when:** you can fly around, fire all 3 rocket types, tell them apart at a glance, kill a stationary dummy planet, and die to a sun.

---

## Phase 4 — Abilities

- [x] **Foresight (Q):** run the shared physics forward N steps from current state, render predicted path as a polyline that fades solid → dotted → invisible across its 6s window. Active for 4s, 12s cooldown.
- [x] **Shield (W):** directional 120° arc on the side facing the cursor. Re-aims with cursor while active. Render as a glowing arc mesh attached to the planet. Absorb rockets that hit the arc; ignore those that hit the unshielded side. In local sandbox parity, front-side sun contact should also be negated by the shield arc. 4s active, 15s cooldown.
- [x] **Boost (E):** apply impulse toward cursor. Render a thrust burst (particles + brief glow). 2 charges, regen 1 per 5s.
- [x] HUD ability indicators (Q/W/E icons with cooldown sweep + charge count for Boost).

**Done when:** Foresight visibly predicts; Shield blocks rockets and protected-side sun contact only on its facing arc; Boost noticeably alters trajectory.

---

## Phase 5 — Caches & Salvage Drone

- [x] Spawn 3 Caches in the outer ring with content-typed icons (procedural sprite atlas placeholder for now).
- [x] Add Caches to physics step (low velocity, light gravity influence).
- [x] **Salvage Drone:** launch on `4`/`F` toward cursor, immediately switch to **drone pilot mode**.
  - [x] In pilot mode: mouse steers (continuous low thrust toward cursor), left-click for short burst (limited fuel).
  - [x] In pilot mode: planet's rockets/abilities are disabled.
  - [x] Right-click / F: recall (drone self-destructs, drops cargo).
  - [x] Esc: snap camera back to planet view and send `droneAutoReturn`; drone enters return-to-owner autopilot until delivery, recall, death, or TTL.
- [x] Drone collides with Cache → picks up cargo. Touch own planet → deposits cargo.
- [x] Drone destroyed on rocket hit; cargo drops at death position for anyone to collect.
- [x] Render Cache destruction on rocket / planet / sun / Black Hole contact and remove it cleanly from the scene until respawn.
- [x] Implement each Cache effect on delivery: Heavy ammo +1, Seeker pack +2, Repair, Boost charge +1, Shield extender, Foresight extender.
- [x] Implement **Wildcard ability** roll (~10%): adds a fourth ability slot bound to `R` until used. Variants: gravity-pulse, cloak, teleport-swap. `cloak` must follow authoritative public `planet.hideTrailUntilTick`: clear that planet's current trail on activation and stop appending trail samples until the flag expires.
- [x] Drone cooldown: 8s between launches.

**Done when:** you can fly a drone out, grab a Cache, deliver it, and the effect applies. Wildcards trigger on R.

---

## Phase 6 — Planet archetypes

- [x] Wire archetype multipliers into rocket/ability logic (damage, reload, durations, charges).
- [x] Distinct visual palette + trail color per archetype.
- [x] Special-case **Corvus** Light burst (3-shot), **Umbra** drag-on-hit, **Oculus** Seeker turn-rate buff, **Volans** extra Boost charge.

---

## Phase 7 — HUD & screens (DOM/React layer)

DOM-layered over the canvas. Use React over the Three.js canvas. Can bind to local sim data until L2/L3 wire it to server state.

- [x] HUD overlay container component, transparent, pointer-events scoped to interactive elements.
- [x] **Combat tray** (bottom-left): own HP, selected weapon, clip ammo, Heavy/Seeker reserves, ability cooldowns/charges, drone readiness/cargo, and wildcard status when occupied.
- [x] **Mini-HP bars** floating above other planets in world space (project from world to screen).
- [x] Selected weapon is emphasized in both the combat tray and the shortcuts dock.
- [x] **Shortcuts dock** (bottom-right): always-visible compact legend for `1/2/3` rocket swap, `4/F` drone, `Q/W/E` abilities, `R` wildcard when present, `Shift` read mode, and contextual drone-mode actions (`LMB` burst, `RMB/F` recall, `Esc` auto-return camera snap).
- [x] **Default combat camera:** smooth-follow the locally controlled body and keep it near screen center; Read Mode only widens zoom; free camera is spectator-only.
- [x] **Read mode** (`Shift` held): smooth camera zoom-out, HUD opacity 0.2, no input changes.
- [x] **Connection / latency indicator** (top-right): connected/reconnecting state, RTT from app-level `ping`/`pong`, and a degraded marker when snapshot buffering is in extrapolation mode.
- [x] **Match timer** (top-center), including a 5:00 Black Hole warning / active overtime state.
- [x] **Kill feed** (top-left, fades after 4s).

---

## Phase 8 — Networking client infrastructure  `(L1, L3)`

Client-side pieces of networking that can be built against mock data before BE integration, then wired up in `TODO.md` L1 / L3.

- [ ] WebSocket client wrapper with reconnect + state machine (`title | connecting | lobby | pick | countdown | in-match | spectating | disconnected | room-error`) that preserves the originating **networked** entry mode (`createRoom | quickGame | joinRoom`) across reconnect/resume. `AI Game` bypasses this wrapper entirely.
- [ ] Add frontend runtime network config (`src/frontend/src/config.ts` or equivalent): honor `import.meta.env.VITE_WS_URL`; when unset, default to `ws://127.0.0.1:8080/ws` for local dev and same-origin `/ws` (`wss` on HTTPS) for production so the client works behind Caddy without code changes.
- [ ] Document the frontend connection contract in repo docs: `VITE_WS_URL` override, local default, and same-origin production fallback for reverse-proxy deploys.
- [ ] Persist player name + device-local `profileToken` + per-room `resumeToken` in `localStorage`; normalize the name locally with the same rules as shared `PlayerName` (trim, collapse whitespace, reject control chars, enforce length `1..16`) before sending `hello{name, join, profileToken?, resumeToken?}` for networked modes so cross-session stats can map to a stable player identity and refresh/reconnect can reclaim control instead of creating a second player.
- [ ] Send `input{mouseDir, clientTick}` at 60 Hz as the current cursor-intent sample. Do not invent a `keysDown[]` transport field; discrete actions continue to use their own messages.
- [ ] Send app-level `ping{id, clientSentAtMs}` on a short interval, measure RTT from `pong`, and feed that into the HUD latency indicator because browser WebSockets do not expose control-frame ping/pong.
- [ ] Treat every timer field ending in `AtMs` as an absolute server timestamp, not a duration. Use recent `pong.serverSentAtMs` samples to estimate clock offset for lobby/pick/countdown/rematch/match-end timers.
- [ ] Store `welcome.roster` plus `welcome.roomKind` as the canonical metadata for **networked** combat/spectator/victory UI, and refresh the roster map from later lobby/pick data when those phases are active.
- [ ] Ack every applied `fullSnapshot` / `deltaSnapshot` with `ackSnapshot{tick}`; merge `changed` as full entity replacements by collection + `id`, remove entities listed in `removed`, and update owner-only HUD state from snapshot `self`. When an applied snapshot carries explicit `self:null`, transition the client state to `spectating`. Handle `error`, `pong`, `chatMessage`, and `rematchState` outside the snapshot buffer.
- [ ] Map protocol `ErrorCode` values deterministically in the client: `invalid_room|bad_resume_token|room_full|server_full` route to `room-error`; `name_invalid|not_host|phase_invalid|invalid_action|rate_limited|invalid_message` stay in-place and surface inline feedback.
- [ ] Handle time-critical one-shot events outside the snapshot buffer: `blackHoleSpawn` switches overtime HUD/VFX immediately, `wildcardRoll` drives grant UI/SFX when a wildcard slot is awarded, and `wildcardUse` drives activation VFX/SFX when `R` resolves successfully.
- [ ] Receive snapshots at 30 Hz, buffer, and **interpolate** rendered transforms between the two latest server snapshots for smooth render.
- [ ] Respect public `planet.hideTrailUntilTick` during interpolation/rendering: cloak never removes the planet from snapshots, it only clears/suppresses trail accumulation until the flagged tick passes.
- [ ] **Client-side prediction** for *firing actions only* is cosmetic: show muzzle flash + a short-lived ghost rocket immediately, then reconcile/discard when the authoritative server rocket arrives.
- [ ] Immediate local ability feedback is presentation-only: Shield may raise the owner-local arc instantly, Foresight may render instantly from the latest local state, and Boost / Wildcard may play cast VFX/SFX and HUD state immediately. Do **not** locally move planets, apply teleport swaps, or mutate authoritative world state before the matching snapshot / event arrives.
- [ ] Do **not** predict live planet movement or trust local gameplay state. In networked mode, planets, rockets, drones, caches, HP, cooldowns, and kills render from server snapshots/events only. (Per design: chaos diverges fast.)
- [ ] Reconcile dropped/late snapshots gracefully (extrapolate ≤200 ms then freeze).
- [ ] `AI Game` launch path: bypass WebSocket entirely and route through a frontend-owned `LocalMatch` / `LocalRoom` controller that owns local phase state (`pick | countdown | combat | ended`), bot stepping, and local snapshots. Reuse the same React screens, HUD selectors, and shared sim/types/constants as networked play wherever practical. There is no `hello`, no `welcome`, no snapshots from the backend, and no reconnect state.
- [ ] Replace local sandbox loop with networked mode behind a flag (keep sandbox for offline testing).

**Integration point:** `TODO.md` Phase L1 (handshake) and L3 (snapshot sync).

---

## Phase 9 — Lobby & match-flow screens  `(L2)`

Screens can be built and styled against mock state; they go live in `TODO.md` L2.

- [ ] **Title screen:** name input, join-code input, four primary actions: `Create Room`, `Quick Game`, `Join by Code`, and `AI Game`. The first three open a WebSocket and send the appropriate `hello.join`; `AI Game` starts local/offline mode instead. Also include invalid-room / bad-resume error state and inline `name_invalid` validation/error copy that matches the shared name rules (`1..16` chars after trim/collapse, no control chars).
- [ ] **Lobby screen:** render by networked `roomKind`. `private` shows room code, up to 7 player slots, ready toggles, host-only global AI difficulty selector, and host start controls; `public` shows a Quick Game waiting room with no room code and no host controls. `AI Game` bypasses the networked lobby entirely and routes into the local pick/countdown flow.
- [ ] **Pick screen:** 7 archetype cards with stat blurbs. In networked modes, the 30s timer comes from `pickState.deadlineAtMs`; in `AI Game`, the same screen runs from local/offline state.
- [ ] **Countdown** overlay (3-2-1) with brief freeze. In networked modes, derive it from `countdown.endsAtMs`; in `AI Game`, drive the same overlay from local/offline state.
- [ ] **In-match HUD** (Phase 7) becomes active.
- [ ] **Spectator mode** on death: enter when `welcome.role==='spectator'` or an applied snapshot explicitly sets `self:null`; show free camera or follow-leader toggle, chat panel visible, and no in-match respawn UI.
- [ ] **Spectator HUD variant**: reuse the bottom-right shortcuts dock for spectator actions (`Tab` player cycle, follow/free-camera toggle, chat hint) instead of leaving the corner empty.
- [ ] **Victory screen:** winner banner when `winnerId` exists, draw banner when `reason='mutualKill'`, MVP stats (kills, longest survival, near-misses). In networked modes, show rematch vote + tally (`majority of human players` → re-pick screen) with the timer sourced from `matchEnd.rematchDeadlineAtMs` / `rematchState.deadlineAtMs`; in `AI Game`, replace that area with `[ Play Again ]` / `[ Back to Title ]` and no vote timer.
- [ ] **Lobby/spectator chat** panel.

**Integration point:** `TODO.md` Phase L2 (lobby → pick → countdown end-to-end).

---

## Phase 10 — Audio

- [ ] Howler.js setup, master volume slider in HUD.
- [ ] SFX: Light fire, Heavy fire, Seeker fire, rocket impact, shield raise/break, boost, drone launch, drone destroyed, cache pickup, cache delivered, wildcard activate, Black Hole spawn / pull, planet death (low boom + brief silence).
- [ ] **Ambient drone** loop intensifying with proximity to nearest sun (Web Audio API directly, lowpass-filter cutoff tied to distance).
- [ ] **Sun-pull rumble** when the predicted sun-collision time drops below 2s (audio Foresight).
- [ ] One ambient music loop (incompetech.com), low volume by default.

---

## Phase 11 — Polish

- [x] Hit effects: short screen shake, additive flash, HP bar pulse.
- [ ] Death effects: debris burst, fade-to-spectator transition.
- [ ] Boost feedback: brief radial speed-line effect authored on the TSL renderer path.
- [ ] Foresight visual: soft gradient fade on the predicted path, accuracy "fuzz" widening over time.
- [ ] Pause menu (`Esc` outside drone-pilot mode): volume, controls reference, leave match.
- [ ] Settings persisted in `localStorage` (volume, name, last archetype).
- [ ] Optional post-MVP title-screen leaderboard / career-stats panel: fetch read-only HTTP endpoints (`/api/leaderboards`, `/api/players/:playerId/stats`) rather than routing stats traffic through the gameplay WebSocket.
- [ ] FPS / latency overlay toggle (`F3`).
- [ ] Mobile fallback: detect touch, show "desktop only for V1" message (mobile is post-MVP).

---

MVP exit and the joint §3–§12 feature-coverage checklist live in [`TODO.md`](TODO.md) Phase L4.
