# 3BODY — Backend Parallel Work

Most backend work can proceed **in parallel** with the frontend once [`TODO.md`](TODO.md) Phase L0 (shared module) is complete. Bootstrap work can start earlier; linear/coordinated work — shared types, networking handshake, lobby/combat sync-up, MVP exit — lives in [`TODO.md`](TODO.md); don't duplicate it here.

Scope: `src/backend` only. "Parallel-safe" means the work can be exercised against `curl`, a bot, or a saved fixture without requiring the frontend to be running — but each item still powers a corresponding `TODO-FE.md` feature once `TODO.md` L1–L3 wires the two sides together.

Work top-to-bottom — later items depend on earlier ones. Exception: the durable stats slice below is intentionally sidecar and must not block the first playable `L1`–`L4` gameplay path.

---

## Backend bootstrap  `(L1)`

- [x] `src/backend/src/config.ts` — read `PORT` (default 8080), `HOST` (default `127.0.0.1`), `DATA_DIR` (default repo-local `.data/`), `TICK_HZ`, `MAX_ROOMS`, `ROOM_IDLE_TIMEOUT_MS`, `RECLAIM_GRACE_MS`, `SHUTDOWN_GRACE_MS`, `ALLOWED_ORIGINS`, `WS_MAX_MSG_BYTES`, `MAX_SOCKETS_PER_IP`, `HANDSHAKES_PER_IP_PER_MIN`, `CREATES_PER_IP_PER_10M`, `JOINS_PER_IP_PER_MIN`, `CHAT_BURST`, `CHAT_WINDOW_MS`, `CHAT_MAX_CHARS`, and `OUTBOUND_QUEUE_MAX_BYTES` from `process.env` with defaults; coerce/validate numeric envs once; derive or validate any `TICK_HZ` → snapshot-interval math here so later code does not hard-code fixed-rate assumptions.
- [x] `src/backend/src/log.ts` — minimal `log.info/warn/error(msg, data?)` writing JSON to stdout. No external dep for MVP.
- [x] `src/backend/src/ids.ts` — monotonic `nextEntityId()` per room; `newPlayerId()` (uuid via `crypto.randomUUID()`); `newRoomId()` (short base36).
- [x] `src/backend/src/main.ts` — replace empty stub with `Bun.serve({ fetch, websocket, port, hostname })`. `fetch`: `GET /healthz` → 200; later, serve read-only stats endpoints such as `GET /api/leaderboards?metric=&limit=` and `GET /api/players/:playerId/stats`; `GET /ws` validates `Origin` against `ALLOWED_ORIGINS`, derives the client IP from the trusted local proxy headers, enforces handshake/IP quotas, then calls `server.upgrade(req, { data: { connId, clientIp } })`. `websocket`: `open/message/close/drain` delegates to `Connection`. Install `SIGINT`/`SIGTERM` shutdown that stops new admits, gives the stats-write queue up to `SHUTDOWN_GRACE_MS` to drain, then closes rooms and the SQLite handle.

**Integration point:** `TODO.md` Phase L1 handshake.

---

## Durable stats persistence

Scope call: durable cross-session stats / leaderboards are a follow-on V1 slice. Keep the design here, but if you are pushing toward first playable, skip ahead to connection / matchmaking and return once match-end summaries exist.

- [x] `src/backend/src/db.ts` — open a single SQLite database file (for example `${DATA_DIR}/3body.sqlite`) via `bun:sqlite`; apply startup PRAGMAs once: `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`, and a bounded `wal_autocheckpoint`. Live room / sim state must stay out of this database.
- [x] Identity rule: V1 has no login accounts. The frontend persists an opaque device-local `profileToken`; the backend stores only its hash and uses it to recover the same durable `playerId` across sessions. `resumeToken` remains room-scoped reclaim state only and must never be reused as a stats identity key.
- [x] Add a tiny migration runner with a `schema_migrations` table so schema changes are explicit and repeatable; do not let the schema drift via permanent `CREATE TABLE IF NOT EXISTS` sprawl.
- [x] Schema shape for durable data:
  `players(id, profileTokenHash, createdAtMs, lastSeenAtMs, lastKnownName)`;
  `player_names(playerId, name, firstSeenAtMs, lastSeenAtMs)`;
  `matches(id, roomKind, seed, startedAtMs, endedAtMs, durationMs, winnerPlayerId?, reason, mvpPlayerId?, mvpReason)`;
  `match_players(matchId, playerId?, seat, isBot, nameAtMatch, archetypeId?, placement?, kills, survivalMs, nearMisses, damageDealt, won)`;
  `player_stats(playerId, matchesPlayed, wins, kills, nearMisses, damageDealt, totalSurvivalMs, bestSurvivalMs, updatedAtMs)`.
- [x] `src/backend/src/stats-store.ts` — expose transaction helpers that persist one finished match atomically: upsert player/profile rows, insert the match row, insert all `match_players` rows, and update `player_stats` aggregates in the same transaction so leaderboards never see partial writes.
- [x] Bot rule: bots get `match_players` rows with `isBot=1` and `playerId=NULL`, but they do **not** get rows in `players` or `player_stats` and must never appear on public leaderboards.
- [x] Keep writes off the hot path: when a room reaches `matchEnd`, copy the final summary into a persistence job and let the tick loop continue tearing down the room in memory. SQLite must not sit on the 60 Hz simulation path.
- [x] Failure policy: if a stats write fails after the match has already been resolved in-memory, log it with the match id, keep the payload for retry, and do not mutate the simulated outcome trying to "roll back" a finished game.
- [x] Read APIs: expose read-only JSON endpoints from `fetch` such as `GET /api/leaderboards?metric=wins|kills|bestSurvivalMs|damageDealt&limit=50` and `GET /api/players/:playerId/stats`. These are the intended read path for highscores / cumulative stats; do not move leaderboard traffic onto the gameplay WebSocket.
- [x] Read model: build highscores / leaderboard queries from `player_stats` plus targeted indexes (`wins`, `kills`, `bestSurvivalMs`, `damageDealt`) instead of scanning raw match history on every request.
- [x] Shutdown rule: on `SIGTERM`, stop accepting new matches, let in-flight rooms finish their final stats enqueue, and drain the persistence queue before exit or until `SHUTDOWN_GRACE_MS` elapses. If the process must give up, emit a clear log of any unflushed match ids.

---

## Connection + matchmaking

- [x] `src/backend/src/connection.ts` — `Connection` wraps a `ServerWebSocket`, holds `playerId`, `profileToken`, `resumeToken`, normalized `name`, `roomId?`, `clientIp`, `lastAckTick`, `alive:boolean`, inbound token buckets, and outbound queued-byte accounting. Typed `send<T extends ServerMsg>(m: T)` JSON-stringifies; typed `onMessage(raw)` rejects frames over `WS_MAX_MSG_BYTES`, JSON-parses into `ClientMsg` union, applies per-socket rate limits, and dispatches to the owning room.
- [x] `src/backend/src/matchmaking.ts` — in-process `Map<roomId, Room>` plus a public quick-game pool and lightweight per-IP counters / cooldown maps; `admit(conn, hello)` branches on `hello.join.kind`: `createRoom` creates a new **private** room with a shareable code, `joinRoom` joins an existing private room by code, and `quickGame` joins or spawns a **public** room managed by the server. `AI Game` is not handled here because it is frontend-local and never connects. Enforce join/create quotas before room allocation. Invalid code / full pre-match lobby / bad resume returns `error{code:'invalid_room'|'room_full'|'bad_resume_token', ...}`. Late joins to `combat|ended` enter as spectators. `leave(conn)` reserves a seat for `RECLAIM_GRACE_MS` in `lobby|pick`; in combat it swaps the player to a Normal bot immediately but keeps the slot reclaimable until match end.
- [x] Enforce `MAX_ROOMS` on room creation admits. When the process is already hosting the configured maximum, reject `createRoom` or `quickGame` room-spawn using `error{code:'server_full', ...}` instead of creating more rooms. Also cap concurrent sockets per IP (`MAX_SOCKETS_PER_IP`) so one host cannot monopolize the process.
- [x] Handle first client msg as `hello{name, join, profileToken?, resumeToken?}`: normalize name exactly as shared `PlayerName` rules require (trim, collapse whitespace, reject control chars, enforce length `1..16`), resolve or mint the durable `playerId` from `profileToken`, mint or echo the current `profileToken`, mint or reuse `resumeToken`, send `welcome{..., profileToken, roomKind, roster}` or `error`, then current `lobbyState` / `pickState` / `fullSnapshot` depending on room phase. Rotate `resumeToken` on successful reclaim so captured old tokens cannot be replayed indefinitely.
- [x] Input trust boundary: clients send intent only (`input.mouseDir`, `shieldAim`, `fireRocket`, `launchDrone`, `droneInput`, `ability`, `ackSnapshot`). Never accept client-authored positions, velocities, HP, cooldowns, ammo counts, or collision outcomes. For repeated `input{mouseDir, clientTick}` samples, keep last-write-wins semantics and ignore stale `clientTick` values per player.

---

## Abuse / spam hardening

- [x] WebSocket edge trust: only accept upgrade requests whose `Origin` is in `ALLOWED_ORIGINS`; only trust `X-Forwarded-For` / `X-Real-IP` when the TCP peer is the local reverse proxy. Direct internet traffic to the Bun port must not be accepted in production.
- [x] Frame / schema validation: close connections that send oversized frames, malformed JSON, unknown message `type`s, or impossible payloads; return `error{code:'invalid_message'}` only when the connection is still safe to keep open.
- [x] Per-IP quotas: token-bucket or sliding-window limits for handshakes, room creates, room joins/resumes, and concurrent open sockets. On breach, reject with `error{code:'rate_limited'}` or close the upgrade path before allocating room state.
- [x] Chat anti-spam: trim control characters, cap `chat.text` length (`CHAT_MAX_CHARS`, e.g. 200), rate-limit to a small burst per window, suppress identical repeated lines from the same sender, and temporarily mute repeat offenders in-memory instead of rebroadcasting everything.
- [x] Slow-consumer protection: track queued outbound bytes per socket; if a client stops draining and exceeds `OUTBOUND_QUEUE_MAX_BYTES`, drop it and let reconnect/resume logic recover rather than stalling room broadcast loops.
- [x] Abuse observability: structured logs for `rate_limited`, `invalid_message`, muted chat, rejected origins, and slow-consumer disconnects so ops can tune limits from real traffic.

---

## Room + match lifecycle  `(L2)`

- [x] `src/backend/src/room.ts` — `Room` class owns the authoritative room lifecycle and state: `id`, `kind:'private'|'public'`, `seed`, `phase: 'lobby'|'pick'|'countdown'|'combat'|'ended'`, `participants: Map<playerId, RoomParticipant>`, `botControllers`, `spectatorConnIds`, `world`, `privateStates`, `tick`, `rng`, `combatInputQueue`, `pendingEvents`, snapshot / lag-comp history, rematch state, and phase timers.
- [x] Lobby phase rules by room kind:
  - `private`: accept up to 7 human-controlled seats, mark first joiner as host, broadcast `lobbyState{roomKind:'private', hostPlayerId, autoStartAtMs, ...}` on every join/leave/ready-toggle/bot-difficulty change; 3s auto-start timer; host can update global bot difficulty via `setBotDifficulty` and can force-start via `hostStart`; on start, transition to `pick` and **fill all empty seats with bots** at that difficulty (default Normal).
  - `public`: server-managed quick-game lobby, no room code and no host controls; assign players into open public rooms, broadcast `lobbyState{roomKind:'public', autoStartAtMs, ...}`, auto-start when full or when the timer expires, and fill any remaining seats with Normal bots.
- [x] Pick phase: 30s timer; apply `pickArchetype` messages; AFK humans and all bots get a pseudo-random but non-duplicate pick from remaining archetypes (duplicates allowed per doc but prefer spread). Broadcast `pickState{deadlineAtMs, ...}` on change. Advance to `countdown` when timer hits or all picked.
- [x] Countdown phase: build initial `World` via `spawn.ts`, send `fullSnapshot`, broadcast `countdown{endsAtMs}`, freeze the sim for 3s (no integration, no inputs applied).
- [x] Combat phase: start sim loop; run until `alivePlanets <= 1`. At **300s** elapsed combat time, if the match is still live, spawn a Black Hole at origin and keep simming until one planet survives or the final survivors die on the same tick. There is no timeout winner and no in-match respawn.
- [x] Match end: compute MVP stats (kills, longest-survival seconds, near-misses = rocket passed within N units without hit); include `reason:'lastAlive'|'mutualKill'` in `matchEnd`; when the final two planets die on the same tick, omit `winnerId` and emit `reason:'mutualKill'`; broadcast it with `rematchDeadlineAtMs`; open 20s rematch vote; rebroadcast `rematchState{deadlineAtMs, ...}` on each vote; require a majority of human players in the roster (bots abstain) to return to `pick` with the same roster and same room kind. Private rooms keep the same room code on rematch; public rooms stay in their server-assigned public room. After broadcasting the result, enqueue the finished-match summary for SQLite persistence; do not persist tick-by-tick combat state.
- [x] Idle-room cleanup: once a room has no connected humans, no active reclaim window, and no rematch vote pending, start `ROOM_IDLE_TIMEOUT_MS`; on expiry, stop the tick/timers, close lingering spectators, and remove the room from the matchmaking map.

**Integration point:** `TODO.md` Phase L2 (lobby → pick → countdown end-to-end).

---

## Simulation loop  `(L3)`

- [x] `src/backend/src/tick.ts` — per-room fixed-timestep loop at configured `TICK_HZ` using `setTimeout` recursion with accumulator for drift correction. Integrate `Math.max(1, Math.floor(accum/dt))` sim steps per call. Abort loop when room ends.
- [x] Tick order per step: (1) enqueue bot inputs, then drain `combatInputQueue` to update intent from newest `input.mouseDir` / `shieldAim` samples and resolve discrete events (`fireRocket`, `launchDrone`, `droneInput`, `ability`, drone return/recall); (2) spawn or sync the Black Hole once combat has reached 300s; (3) `stepSuns(world.suns, dt, world.blackHole?)`; (4) `stepBody` for planets under suns + optional Black Hole, then resolve planet collisions and boundary damage; (5) `stepBody` for rockets, drones, and caches; (6) resolve rocket / drone / cache collisions, damage, drops, kills, and append `event`s; (7) tick timers and maintenance (`cacheRespawnAtTicks`, cooldown clears, light reload, boost regen, debris TTL, snapshot / lag-comp history); (8) finalize the match when `alivePlanets <= 1`.
- [x] Snapshot scheduler: every `snapshotIntervalTicks` sim ticks (derived from `TICK_HZ` and `SNAPSHOT_HZ`) build and broadcast `deltaSnapshot` per connection (see Networking below).

**Integration point:** `TODO.md` Phase L3 (combat snapshot sync + interpolation).

---

## World setup + spawning

- [x] `src/backend/src/spawn.ts` — `initialWorld(seed, players[])`: seeded RNG places 3 suns on an equilateral triangle around origin with small tangential velocities so they chaotically dance; places each planet evenly spaced in angle around the centroid at radius ≈ 900 with tangential velocity = √(G·ΣM/r) (roughly bound orbit); initializes ammo with Light clip 5 / Heavy 2 / Seeker 3; spawns initial 3 Caches at random outer-ring angles with slow tangential drift; rolls cache contents via weighted table. No in-match respawn path exists for dead planets.
- [x] Cache respawn: track `cachesDestroyedAt[]`; every tick, if `world.caches.length < 3` and oldest-destroyed elapsed ≥ 15s, spawn replacement in outer ring.

---

## Combat — rockets

- [x] `fireRocket(planet, kind, aimDir, targetId?, clientTick)`: check cooldown + ammo (Light regens to 5 cap; Heavy starts at 2 / caps at 2 / does not regen; Seeker starts at 3 / caps at 3 / does not regen; cache ammo may push Heavy / Seeker above cap). Spawn rocket at planet edge with velocity `planetVel + aimDir * kindSpeed`, apply archetype modifiers (Corvus Light = 3 rockets in a 10° spread with halved damage; Ignis +30% damage; Oculus Seeker +30% turn rate). Store `ownerId`, `kind`, `targetId` (Seeker only), `ttl=8s`, `damage`, `drag?` (Umbra flag).
- [x] Rocket integration: each tick under `stepBody` (Verlet under sun gravity). Seekers additionally call `stepSeeker` using turn-rate cap.
- [x] Rocket TTL + sun self-destruct: any rocket touching a sun or exceeding `ttl` vanishes silently (no damage event).
- [x] Rocket↔planet collision: circle-circle vs each alive planet (skip owner for first 150ms to avoid self-hit on launch). On hit: check shield arc (see Abilities); apply damage; apply Umbra drag debuff if flagged (2s 30% velocity multiplier); emit `event:'hit'`; kill planet if HP ≤ 0 and emit `event:'kill'`; consume rocket.
- [x] Rocket↔rocket collision: both die, no damage event. Enables defensive shooting per doc §15.
- [x] Lag compensation: on `fireRocket`, rewind the firing planet's launch origin ≤100ms using a small per-planet `positionHistory` ring buffer, then spawn the rocket from that rewound origin using the current validated input. For Seeker `targetId`, validate the target existed at the rewind tick. Do **not** rewind target positions or re-run historical hit tests; movement is not client-predicted — this is lag comp for fire origin only.

---

## Combat — abilities

- [x] **Shield (Q):** on `ability{slot:'q', aimDir}` set `shieldActiveUntil = now + duration * archetypeMod * cacheExtMod` and `shieldAimDir = aimDir`. On subsequent `shieldAim` messages, update `shieldAimDir` live. In rocket damage resolution, if hit within the 120° arc around `shieldAimDir`, rocket is absorbed (no damage, no debuff). Also negates sun-touch kill on that side; note: test hit point direction vs planet center, only negate if vector lies inside arc.
- [x] **Boost (W):** on `ability{slot:'w', aimDir}` if `boostCharges > 0` and not in per-charge lockout, apply impulse `planet.vel += aimDir * BOOST_MAG * archetypeMag`; decrement charge; start 5s per-charge lockout. Regen 1 charge every 45s up to max (Volans +1 max, +50% mag). Emit `event:'boost'`.
- [x] **Gravity Pulse (G):** only firable when the player is holding the wildcard charge. Apply a radial impulse to all planets, rockets, boundary asteroids, and caches within radius (falloff by distance), emit `event:'wildcardUse'` on successful activation, then consume the held charge.

---

## Combat — salvage drone + caches

- [x] `launchDrone` handler: reject if drone launch cooldown (8s) still active or `planet.pilotingDroneId` is already set. Spawn `Drone` at planet edge in `aimDir` with small initial velocity; set `planet.pilotingDroneId = droneId`; start cooldown.
- [x] Drone tick: while alive, apply continuous low thrust toward last `droneInput.aimDir`; on `burst` edge, apply impulse if `fuel > 0` (3 bursts total); integrate under sun gravity; decrement `ttl` (20s).
- [x] `droneAutoReturn` handler / Esc transition: set `drone.mode = 'return'`; on each tick in that mode, thrust toward the owner planet until delivered, recalled, destroyed, or `ttl` expires.
- [x] Drone death: any rocket hit kills it (1 HP). On death or `droneRecall`, if carrying cargo, drop a free-floating `Cache` at drone position (same contents), emit `event:'cacheDrop'`. Clear `planet.pilotingDroneId`. Emit `event:'droneDown'`.
- [x] Drone↔cache pickup: if drone has no cargo, touching a Cache assigns it as cargo and removes the Cache from `world.caches`.
- [x] Drone↔owner planet delivery: if drone has cargo, touching owner planet applies `CacheContents` effect (Heavy+1, Seeker+2, Repair 40 clamped to 100, ShieldExt flag on next shield, Wildcard → set `planet.gravityPulseHeld = true`). Always emit `event:'cachePickup'`; if the delivered contents were a Wildcard, also emit `event:'wildcardRoll'` exactly once when the charge is granted. Drone then self-destructs and `planet.pilotingDroneId` is cleared.
- [x] Cache drift: caches accept light sun gravity (reduced mass coefficient) so close passes fling them, per doc §8.1.
- [x] Cache destruction: any non-pickup hazard or impact destroys a Cache and starts its respawn timer. That includes rocket hits, planet contact, sun contact, and Black Hole contact. Only an intact drone with no cargo may collect a Cache.

---

## Damage, death, boundary

- [x] Planet↔sun contact: if not negated by shield arc, instant kill (HP→0). Emit `event:'kill'` with `cause:'sun'`.
- [x] Planet↔planet contact: both planets are instantly destroyed, regardless of remaining HP or shield state. Emit `event:'kill'` for both with `cause:'planetCollision'`.
- [x] Boundary killzone: if a planet moves outside `arenaRadius`, kill it immediately.
- [x] Black Hole spawn: at 300s elapsed combat, create `world.blackHole` at origin, broadcast `event:'blackHoleSpawn'`, and apply its pull to suns, planets, rockets, drones, and caches. Any entity touching the kill radius, including suns, is destroyed immediately.
- [x] Planet death → `Debris` entity (visual-only, short TTL, broadcast in snapshot); remove planet from sim; connection transitions to spectator (still receives snapshots, can send `chat`); subsequent snapshots for that connection must send `self:null` so FE can switch to spectator mode without inferring from world diffs. Dead players remain spectators until rematch; there is no in-match respawn.
- [x] Win check: after every tick, if `alivePlanets.length === 1`, transition room to end-of-match with `reason:'lastAlive'`; if `alivePlanets.length === 0`, transition with `reason:'mutualKill'`.

---

## Bot AI

- [x] `src/backend/src/bot.ts` — `Bot` class owns `playerId`, `difficulty:'easy'|'normal'|'hard'`, `archetype`. Runs `decide(world, self)` each tick and pushes synthetic `ClientMsg`s into the room input queue (same path humans use, so sim code treats them identically).
- [x] Easy bot: aim at nearest alive planet, fire Light whenever reload permits; call `predictPath(self, suns, 180, dt)` each tick and Boost away if any step lies within a sun radius.
- [x] Normal bot: 2–3s lookahead on target planet, lead shots against predicted intercept, reactive Shield when an incoming rocket's predicted distance to self < hitRadius within 1s, Boost to escape or close weakened targets, pick Light/Heavy/Seeker by target predictability (use a simple chaos score: sum of angular deviations over lookahead). When the Black Hole is active, bias pathing away from origin and spend Boosts more aggressively to survive collapse.
- [x] Hard bot: full predictive play — chooses Heavy when target lookahead is low-chaos; times Foresight+Heavy combos; targets lowest-HP alive planet; spends Boosts offensively; uses drones opportunistically when a Cache is within reach and no rocket is tracking it. When the Black Hole is active, switch to survival-first behavior unless it can secure an immediate kill.
- [x] Disconnect handoff: on `Connection` close mid-combat, replace with Normal bot inheriting the planet's full state (HP, ammo, cooldowns, position, velocity).

---

## Networking — snapshots & protocol  `(L3)`

- [x] `welcome` always includes stable `roster: RoomRosterEntry[]` so mid-match spectators, reconnects, and post-match viewers can resolve player names/seats without depending on prior lobby traffic.
- [x] Full snapshot: sent on `welcome` (for spectators mid-match), countdown start, and after any structural change (fresh world on rematch). Payload is `fullSnapshot{tick, world, self}` where `world` is the entire **public** `World` and `self` is that connection's `PlanetPrivateState | null`. `self:null` is the authoritative spectator signal.
- [x] Delta snapshot: per-connection `lastAckTick` tracked from explicit `ackSnapshot{tick}` messages so spectators and low-input clients still advance their snapshot base. Every 60 Hz emit `deltaSnapshot{tick, baseTick:lastAckTick, changed, removed, self?}` where `changed` is collection-keyed arrays of full replacement entity records (`suns|planets|rockets|drones|caches|debris|blackHole`), `removed` is collection-keyed `EntityId[]` (plus `blackHole?: true`), and `self` is omitted unless the owner's private HUD state changed. When a player dies or otherwise loses control, send explicit `self:null` once; if `lastAckTick` is too old to diff, fall back to `fullSnapshot` instead of inventing partial patches.
- [x] Events channel: broadcast `event{event: SnapshotEvent}` separately for one-shot messages (`hit`, `kill`, `cachePickup`, `cacheDrop`, `droneDown`, `boost`, `wildcardRoll`, `wildcardUse`, `blackHoleSpawn`) so clients can trigger SFX/VFX independent of interpolation.
- [x] Chat: rebroadcast `chat{text}` as `chatMessage{fromPlayerId, text, atMs}` to everyone in the room, including spectators, but only after the chat anti-spam / length / duplicate checks pass. On mute / throttle, keep the message server-side and surface `error{code:'rate_limited'}` to the sender instead.
- [x] App-level RTT: respond to `ping{id, clientSentAtMs}` with `pong{id, clientSentAtMs, serverSentAtMs}` so the FE latency indicator has a real measurement path; browser WS APIs do not expose control-frame ping/pong.
- [x] Wire format: JSON for MVP. Leave a `// TODO: swap to @msgpack/msgpack when snapshot size matters` comment at serialization points.
- [x] Input rate-limit: cap per-connection inbound to ~60 msg/s, drop excess; prevents single client from flooding the tick. Keep separate lower buckets for non-input actions like chat / matchmaking so a spammer cannot trade chat noise for gameplay bandwidth.

**Integration point:** `TODO.md` Phase L3 (combat snapshot sync + interpolation).

---

## Local dev UX

- [x] Confirm root `npm run dev` launches both workspaces (`npm-run-all --parallel dev:*` already wired); if backend needs Bun presence check, print a helpful error.
- [x] Confirm root `npm run lint` and `npm run format:check` pass once Biome is wired.
- [x] Confirm `npm run typecheck` passes with shared project references (`tsc -b`).
- [x] `src/backend/README.md` — short note: how to start only the backend (`npm run dev -w @3body/backend`), default URL (`ws://127.0.0.1:8080/ws`), and the supported env vars / defaults (`PORT`, `HOST`, `TICK_HZ`, `MAX_ROOMS`, `ROOM_IDLE_TIMEOUT_MS`, `RECLAIM_GRACE_MS`, plus `ROOM_SEED` or bot overrides if/when added).

---

MVP exit and the full end-to-end verification checklist live in [`TODO.md`](TODO.md) Phase L4.

---

## Explicitly out of scope for this list

Not MVP-blocking; capture here so they aren't forgotten:

- Production build/deploy flow lives in [`PRODUCTION.md`](PRODUCTION.md); it is intentionally separate from the gameplay MVP checklist.
- MessagePack wire encoding (switch once JSON bandwidth is a measured problem).
- `pino` structured logging (stdout JSON is enough for MVP).
- Replay recording / seed playback tooling.
- PostHog analytics, Sentry error tracking, Prometheus/Grafana.
- Automated tests (Vitest for shared physics would be a natural first addition).
- Persistent player accounts.
- Cosmetic unlocks, ranked matchmaking.
