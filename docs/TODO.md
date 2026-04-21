# 3BODY — Linear / Coordinated Work

Work in this file must be done **in order** and **gates** the shared contract plus the live FE/BE integration points in [`TODO-FE.md`](TODO-FE.md) and [`TODO-BE.md`](TODO-BE.md). Purely local bootstrap work that does not depend on `@3body/shared` or a live socket round-trip may start earlier; everything else should treat this file as the critical path.

Convention: `[ ]` = not started, `[x]` = done. Phases are labelled `L*` for "linear" to avoid confusion with per-side phase numbers.

---

## How to use these three TODOs

1. **Start with Phase L0 below** (shared module) — do it yourself or hand it to one agent. Nothing shared-dependent unblocks until `@3body/shared` exports exist and typecheck; only pure local bootstrap work should run ahead of it.
2. **Then fan out in parallel** — one agent works top-to-bottom through [`TODO-BE.md`](TODO-BE.md), another through [`TODO-FE.md`](TODO-FE.md). They don't need to coordinate; both just import from `@3body/shared`.
3. **Sync at the `(L1/L2/L3)` checkpoints** — when both sides reach a tagged phase, run the integration step here together (e.g. L1 needs BE "Backend bootstrap" + FE "Phase 8 WS wrapper" before the handshake can be verified).
4. **Finish with Phase L4** — joint playtest against both workspaces live.
5. **Treat durable stats as sidecar work** — the SQLite / leaderboard slice in [`TODO-BE.md`](TODO-BE.md) is a follow-on V1 task. Do **not** let it block `L1`–`L4`; the first playable gameplay loop ships first.

Rule of thumb: solo → L0, then a BE chunk, the matching FE chunk, the L-phase that joins them, repeat. With two agents → run BE and FE concurrently and only pause them at L1/L2/L3.

---

## Phase L0 — Shared module (blocks shared-dependent work on both sides)

This is the contract boundary. **Both agents import from `@3body/shared`**, so every type or constant defined below must be agreed before the dependent FE/BE phases unlock. Whichever agent gets here first writes the file; the other reads and reuses — do **not** duplicate.

Any gameplay rule that must behave identically in networked rooms and `AI Game` should be extracted into `@3body/shared` as a pure helper instead of being re-authored separately in FE and BE.

- [x] `src/shared/src/vec2.ts` — `Vec2 = { x: number; y: number }` + pure helpers: `add`, `sub`, `scale`, `dot`, `len`, `lenSq`, `normalize`, `rot`, `angleBetween`, `fromAngle`, `dist`, `distSq`, `clampLen`. No classes.
- [x] `src/shared/src/rng.ts` — `mulberry32(seed: number) => () => number`. Export `nextFloat`, `nextInt(rng, min, max)`, `pick(rng, arr)`, `weightedPick(rng, weightedArr)`.
- [x] `src/shared/src/constants.ts` — balance constants: `G`, softening `EPS2`, `SUN_MASS`, `PLANET_MASS`, `ARENA_RADIUS=2000`, `OUTER_RING_MIN/MAX`, `SIM_HZ=120`, `SNAPSHOT_HZ=30`, `PLANET_HP=100`, rocket specs (`LIGHT/HEAVY/SEEKER` damage/speed/reload/TTL/radius/turnRate/startAmmo/maxAmmo; Heavy starts 2, Seeker starts 3), ability specs (Shield cd/dur/arcDeg=120, Boost charges/cd/mag/lockout, Gravity Pulse radius/impulse), drone specs (speed/thrust/fuel/ttl/cooldown), cache specs (count=3, respawnSec=15, wildcardChance=0.10), boundary killzone, Black Hole specs (`spawnSec=300`, mass, killRadius), match timers (lobby=3s, pick=30s, countdown=3s, rematchVote=20s).
- [x] `src/shared/src/entities.ts` — concrete snapshot contract, not just names. Define `EntityId = number` and `EntityBase = { id: EntityId, pos: Vec2, vel: Vec2, radius: number }` so every live entity is serializable without invention. `World` is the **public** snapshot state only: `World = { suns, planets, rockets, caches, blackHole?, debris, arenaRadius }`, where `suns: Sun[]`, `planets: PlanetPublic[]`, `rockets: Rocket[]`, `caches: Cache[]`, `debris: Debris[]`. Required shapes: `Sun = EntityBase & { kind:'sun', mass:number }`; `PlanetPublic = EntityBase & { kind:'planet', playerId, archetype, hp, shieldAimDir: Vec2, shieldActive: boolean, shieldLoad: number, shieldMaxLoad: number, debuffs:{ dragUntilTick?: number } }`; `PlanetPrivateState = { planetId: EntityId, ammo:{ light:number, heavy:number, seeker:number }, cooldowns:{ lightReloadUntilTick:number, heavyReloadUntilTick:number, seekerReloadUntilTick:number, nextBoostChargeAtTick?: number }, boostCharges:number, gravityPulseHeld:boolean, nextShieldExt:boolean }`; `PlanetState = PlanetPublic & PlanetPrivateState` for backend-authoritative runtime storage only; never send `PlanetState` over the wire directly. `Rocket = EntityBase & { kind:'rocket', rocketKind:'light'|'heavy'|'seeker', ownerId, targetId?, ttlUntilTick:number }`; `Cache = EntityBase & { kind:'cache', contents: CacheContents }`; `BlackHole = EntityBase & { kind:'blackHole', mass:number, killRadius:number }`; `Debris = EntityBase & { kind:'debris', ttlUntilTick:number, ownerPlayerId?: string }`. Include `CacheContents` union with fixed pickup kinds plus `kind:'wildcard', wildcard:{kind:'gravityPulse'}`. Rule: backend `Room.planets` stores `PlanetState`; snapshots derive `world.planets` from the public half and `self` from the private half. Everything inside `World` is broadcast to every client; owner-only ammo/cooldowns/held-ability/cache-extender state lives in `PlanetPrivateState` and never gets stuffed into `World`.
- [x] `src/shared/src/archetypes.ts` — `ARCHETYPES: Record<ArchetypeId, ArchetypeStats>` covering Terra/Ignis/Glacius/Volans/Oculus/Umbra/Corvus per `3BODY.md` §6 (damage mults, shield duration mult, boost mag/charges, seeker turn-rate mult, corvus burst flag, umbra drag flag).
- [x] `src/shared/src/physics.ts` — `gravityAccel(pos, suns, blackHole?): Vec2` using softened `G·m / (r²+ε²)`; `stepSuns(suns, dt, blackHole?)` (mutual Verlet plus optional Black Hole pull); `stepBody(body, suns, dt, blackHole?)` (Verlet, one-way gravity from suns and optional Black Hole); `stepSeeker(rocket, target, suns, dt, blackHole?)` (turn-rate-limited steering before integration); `predictPath(pos, vel, suns, steps, dt, blackHole?): Vec2[]` for bot AI and sandbox previews. Verlet only, no Euler. Deterministic (no `Math.random`). Shared physics is for backend authority plus FE-side previews/sandbox only — live match positions/velocities still come from the backend.
- [x] `src/shared/src/protocol.ts` — wire message discriminated unions using `type` as the discriminant.
  **Timer rule:** lobby/pick/countdown/rematch UI timers use absolute server timestamps in Unix ms and are always named `*AtMs`; sim/runtime state inside snapshots uses `tick` / `*UntilTick`.
  **Identity rule:** V1 has no login accounts. `hello.profileToken?` is an opaque device-local token persisted by the frontend; the backend stores only its hash and uses it to recover the same durable `playerId` across sessions. `resumeToken` stays room-scoped reclaim state only and must never be used as a stats key.
  **Name rule:** `hello.name` is normalized as `PlayerName` before accept: trim leading/trailing whitespace, collapse internal whitespace runs to a single space, length `1..16` chars after normalization, and reject control characters with `error{code:'name_invalid'}`.
  **Client→server:** `hello{name, join: JoinRequest, profileToken?, resumeToken?}`, `setBotDifficulty{difficulty:'easy'|'normal'|'hard'}`, `pickArchetype{id}`, `readyToggle`, `hostStart`, `input{mouseDir, clientTick}`, `ackSnapshot{tick}`, `ping{id, clientSentAtMs}`, `fireRocket{kind, aimDir, targetId?, clientTick}`, `launchDrone{aimDir}`, `droneInput{aimDir, burst}`, `droneAutoReturn`, `droneRecall`, `ability{slot:'q'|'w'|'e'|'g', aimDir?}`, `shieldAim{dir}`, `chat{text}`, `voteRematch{yes}`.
  `JoinRequest = { kind:'createRoom' } | { kind:'quickGame' } | { kind:'joinRoom', roomId:string }`.
  `AI Game` is **not** a wire-level join mode; it is a frontend-local/offline mode that does not open a WebSocket at all.
  `input` is last-write-wins cursor intent only; there is no `keysDown[]` array in the wire contract.
  **Server→client:** `welcome{playerId, profileToken, roomId, roomKind:'private'|'public', resumeToken, role:'host'|'player'|'spectator', roster: RoomRosterEntry[]}`, `error{code: ErrorCode, message}`, `pong{id, clientSentAtMs, serverSentAtMs}`, `lobbyState{players: LobbyPlayerSummary[], hostPlayerId?, autoStartAtMs, botDifficulty, roomKind:'private'|'public'}`, `pickState{picks: PickEntry[], deadlineAtMs}`, `countdown{endsAtMs}`, `fullSnapshot{tick, world: World, self: PlanetPrivateState | null}`, `deltaSnapshot{tick, baseTick, changed: SnapshotDelta, removed: SnapshotRemoved, self?: PlanetPrivateState | null}`, `event{event: SnapshotEvent}`, `chatMessage{fromPlayerId, text, atMs}`, `rematchState{yesPlayerIds[], neededVotes, deadlineAtMs}`, `matchEnd{winnerId?, reason:'lastAlive'|'mutualKill', mvp: MatchMvp, stats: MatchStats[], rematchDeadlineAtMs}`.
  `self:null` means this connection currently owns no living planet and should be treated as spectating; in `deltaSnapshot`, omitted `self` means "no private-state change", while explicit `self:null` means "transitioned to spectating."
  Also define helper payload types in the same file: `ProfileToken = string`, `PlayerName = string` following the normalization rule above, `JoinRequest` as above, `RoomRosterEntry{playerId,name,seat,isBot}`, `LobbyPlayerSummary{playerId,name,seat,isBot,connected,ready,archetypeId?,difficulty?}`, `PickEntry{playerId,archetypeId?,lockedIn,isBot}`, `SnapshotDelta{ suns?: Sun[], planets?: PlanetPublic[], rockets?: Rocket[], caches?: Cache[], debris?: Debris[], blackHole?: BlackHole | null }` where entries are full replacement records, never per-field patches, `SnapshotRemoved{ suns?: EntityId[], planets?: EntityId[], rockets?: EntityId[], caches?: EntityId[], debris?: EntityId[], blackHole?: true }`, `ErrorCode = 'invalid_room'|'room_full'|'server_full'|'bad_resume_token'|'name_invalid'|'not_host'|'phase_invalid'|'invalid_action'|'invalid_message'|'rate_limited'`, `SnapshotEvent = hit{kind:'hit', tick, victimPlanetId, attackerPlayerId?, rocketId, rocketKind, damage, hpAfter, absorbedByShield:boolean} | kill{kind:'kill', tick, victimPlayerId, victimPlanetId, killerPlayerId?, cause:'rocket'|'sun'|'neutronStar'|'planetCollision'|'boundaryAsteroid'|'boundary'|'blackHole'} | cachePickup{kind:'cachePickup', tick, playerId, planetId, contents} | boost{kind:'boost', tick, playerId, planetId} | wildcardRoll{kind:'wildcardRoll', tick, playerId, wildcard:'gravityPulse'} | wildcardUse{kind:'wildcardUse', tick, playerId, wildcard:'gravityPulse'} | blackHoleSpawn{kind:'blackHoleSpawn', tick, blackHoleId}`, `MatchStats{playerId,kills,survivalMs,nearMisses,damageDealt}`, and `MatchMvp{playerId,reason}`.
  `wildcardRoll` is the grant event on cache delivery; `wildcardUse` is the successful activation event.
  `winnerId` is omitted when `reason='mutualKill'`. `SIM_HZ`-aligned `tick` numbers throughout.
- [x] `src/shared/src/index.ts` — replace empty `export {}` with barrel re-exports of every module above.

**Done when:** `npm run typecheck` is green; both `src/frontend` and `src/backend` can `import { … } from '@3body/shared'`.

**Unlocks:** every shared-dependent phase in `TODO-FE.md` and `TODO-BE.md`. Purely local frontend/bootstrap tasks may already be underway.

---

## Phase L1 — Connection handshake (FE ↔ BE first contact)

Wire the simplest possible round-trip so both sides can develop against a live loopback.

- [ ] BE exposes `Bun.serve` on `127.0.0.1:8080` with `GET /healthz` 200 and `GET /ws` upgrading to WebSocket (`TODO-BE.md` → "Backend bootstrap" complete).
- [ ] FE WebSocket wrapper connects from the title flow, sends `hello{name, join, profileToken?, resumeToken?}`, stores the returned `profileToken` and `resumeToken`, logs `welcome{playerId, roomId, roomKind}`.
- [ ] BE validates the requested `join.kind` / profile token / resume token, replies with `welcome` or `error`, then broadcasts current `lobbyState` when the target flow has a lobby.
- [ ] Verify in a single tab: `Create Room` → connection open → `welcome.roomKind='private'` → room code printed → refresh the tab and reclaim the same lobby seat with the saved `resumeToken`.

**Done when:** opening the Vite client, creating a room, and refreshing the tab shows a "connected to <roomId>" line and reclaims the same player identity instead of creating a duplicate.

**Unlocks:** `TODO-FE.md` Phase 8 can hook real transport + resume/error handling; `TODO-BE.md` can admit players beyond healthz.

---

## Phase L2 — Lobby → pick → countdown end-to-end

First full screen flow across the wire. Combat sim can remain stubbed.

- [ ] BE private-room lobby broadcasts `lobbyState` on every join/leave/ready-toggle/host bot-difficulty change; quick-game public rooms also broadcast `lobbyState` but have no room code and no host controls.
- [ ] FE lobby screen renders one of two networked variants from `welcome.roomKind` / `lobbyState.roomKind`: `private` shows room code + host-only difficulty/start controls, `public` shows "Quick Game" queue/lobby with no room code or host controls. `AI Game` bypasses the networked lobby completely and boots the local match flow.
- [ ] BE pick phase fills empty seats with bots at the chosen difficulty on start, broadcasts `pickState` on archetype changes, 30s timer.
- [ ] FE pick screen shows 7 archetype cards with stat blurbs, 30s timer, AI fallback for AFK.
- [ ] BE countdown phase sends `fullSnapshot` + `countdown{endsAtMs}`, freezes sim 3s.
- [ ] FE renders 3-2-1 overlay, transitions into combat HUD.
- [ ] Two browser tabs can join the same private room code, both ready, host starts, both see the same picked archetypes and countdown. Separate check: `Quick Game` drops two clients into a public room without code entry. `AI Game` is verified separately as a frontend-local flow with no backend socket.

**Done when:** two humans + 5 bots reach the combat HUD in sync without errors.

**Unlocks:** FE HUD / combat rendering can bind to real server state; BE combat phase is free to run real sim.

---

## Phase L3 — Combat snapshot sync + interpolation

Server-authoritative combat is visible and smooth on the client.

- [ ] BE sim loop runs at 120 Hz; snapshot scheduler emits `deltaSnapshot` at 30 Hz per connection; FE acks each applied snapshot with `ackSnapshot{tick}` (see `TODO-BE.md` sim loop + snapshots).
- [ ] FE receives snapshots, merges `changed` as full entity replacements by collection + `id`, drops entities listed in `removed`, applies optional `self` owner-state updates (`self:null` means local spectator mode), and interpolates rendered transforms between the two latest server states — **no** client-side prediction of live planet/drone/cache movement, per design.
- [ ] FE client-side fire prediction is cosmetic only (muzzle flash + ghost rocket on click, reconcile/discard on server confirm). Authoritative rocket positions, hits, HP, cooldowns, and deaths still come from backend snapshots/events.
- [ ] FE immediate local input feedback is presentation-only: fire may show a ghost rocket; Shield may raise the owner-local arc instantly; Foresight may render immediately from the latest snapshot; Boost and Wildcard may play owner-local cast VFX/SFX/HUD cues immediately. Do **not** locally move planets, teleport targets, or mutate authoritative cooldowns/outcomes.
- [ ] `event` channel (`hit`, `kill`, `cachePickup`, `cacheDrop`, `droneDown`, `boost`, `wildcardRoll`, `wildcardUse`, `blackHoleSpawn`) drives SFX/VFX independently of snapshot interpolation.
- [ ] Two tabs see the same orbits and rocket impacts within one interpolation window.
- [ ] Graceful extrapolation ≤200 ms on dropped snapshots, then freeze.

**Done when:** two browsers show visibly identical combat state; a rocket fired in tab A lands on planet B at the same tick on both clients.

**Unlocks:** all remaining parallel polish and feature work in FE/BE can finish against a real match.

---

## Phase L4 — MVP exit checklist (joint verification)

Run against both workspaces live (`npm run dev`). Every item requires FE + BE cooperation.

- [ ] Server logs `listening 127.0.0.1:8080`; Vite serves at `5173`.
- [ ] **AI Game:** one tab chooses `AI Game` → local/offline match boots with 6 Normal bots immediately → pick → countdown → combat → victory screen with MVP stats, without opening a backend WebSocket.
- [ ] **Multi-human match:** two tabs, 2 humans + 5 bots, match completes.
- [ ] **Quick Game:** two tabs choose `Quick Game` and land in the same public room or another public room with equivalent fill behavior, without using a room code.
- [ ] All three rocket types fire and can hit.
- [ ] Rocket visuals are type-distinct and readable at a glance: Light = thin white, Heavy = orange-red and heavier, Seeker = pulsing magenta.
- [ ] Light rocket-vs-rocket collision resolves (fire two Lights into each other).
- [ ] Foresight (Q) shows prediction client-side; server cooldown ticks.
- [ ] Shield (W) blocks rocket on arc side, fails on back side.
- [ ] Shield (W) also negates sun-touch death on the protected arc side in both offline sandbox and networked play.
- [ ] Boost (E) visibly changes trajectory; per-charge lockout works.
- [ ] Salvage Drone: launch → pilot → grab Cache → deliver → effect applied.
- [ ] Drone killed mid-flight drops its cache for anyone to collect.
- [ ] Cache hit by a rocket, planet, sun, or the Black Hole is destroyed and respawns after 15s.
- [ ] Wildcard roll observed (may require ~10 cache pickups).
- [ ] All 7 archetypes selectable; stat differences observable (Corvus 3-shot burst, Ignis damage, etc.).
- [ ] Planet↔planet collision destroys both planets.
- [ ] Arena boundary ring is always visible; crossing it kills instantly and gives clear feedback (stronger ring + subtle vignette/desaturation), but does not hide enemies.
- [ ] Boundary: fly past arena edge → immediate death.
- [ ] Death has no in-match respawn: dead players stay spectators until match end / rematch.
- [ ] No timeout winner: at 5:00 combat time, a central Black Hole spawns, pulls the whole system inward, and the match still resolves only when one planet remains or the last survivors die together.
- [ ] Mutual kill: if the final two planets die on the same tick, `matchEnd.reason='mutualKill'`, `winnerId` is absent, the FE shows a draw banner, and rematch voting still works.
- [ ] Mid-match disconnect: close a human tab, Normal bot takes over with state intact; reopening with the saved `resumeToken` reclaims control.
- [ ] Rematch: vote yes in both tabs (`2` humans = majority of human players), new match starts with same roster.
- [ ] Remote kills render a short-lived debris field from server-authored `Debris` entities, not just local effects.
- [ ] `npm run lint` green.
- [ ] `npm run typecheck` green.
- [ ] Every section of `3BODY.md` §3–§12 (arena, match flow, controls, archetypes, rockets, drone, abilities, caches, HP/damage, AI, networking, visuals/audio) is represented.
- [ ] §16 success-criteria instrumentation hooks (event emit on match end, kill, ability use) are in place for later PostHog wiring.

**Ship.**

---

## Out of scope for this list

Captured in `TODO-BE.md`'s out-of-scope section and [`PRODUCTION.md`](PRODUCTION.md) (deploy/build). Nothing here ships in MVP.
