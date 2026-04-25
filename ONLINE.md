# Plan

## 1. One big room, 15 players, waitlist, 5 default easy bots

**Capacity**
- `src/shared/src/constants.ts:100` — bump `ROOM_CAPACITY` from `7` to `15`.
- `src/backend/src/config.ts:95` — set `maxRooms` default to `1` (single shared room).

**Bot floor (decouple from capacity) — decision: bots stay until they die**
- `src/backend/src/room.ts:903-925` — rewrite `fillBots()`. Today it fills empty seats to `ROOM_CAPACITY`. New rule: target `botCount >= 5` whenever `humanCount + botCount < 5`. Never kick a bot just because a human joined; bots only leave by dying in combat.
- Constant `DEFAULT_BOT_FLOOR = 5` local to `room.ts`. `fillBots()` adds bots until floor met; never displaces.
- Once humans push the seat count above 5, no further bots are added. Existing bots remain participants for the duration of the (now-continuous) combat.
- `room.ts:190` — `botDifficulty` already defaults to `"easy"`. Keep.

**Single room, no overflow — decision: waitlist only**
- `src/backend/src/matchmaking.ts:740-779` — change `tryAdmitToPublicRoom`: if room 1 exists and is not in `lobby` (i.e. in `pick`/`combat`), or is full, return `server_full` to trigger waitlist instead of creating a 2nd room.
- `src/backend/src/config.ts:95` — `maxRooms = 1` is now belt-and-suspenders.
- Verify waitlist drain (`drainWaitlist`, matchmaking.ts:352) fires whenever a seat opens (player disconnect, bot death — see below).
- With capacity 15 and a 5-bot floor, the room holds up to 10 humans + 5 bots, or 15 humans + 0 bots.

**Continuous arena with 10-minute auto-restart**
Largest piece. Implications across `src/backend/src/room.ts`:
- **No win-condition end**: gut the `"lastAlive" / "mutualKill"` transition (room.ts:662-697). Last-alive does not end the match.
- **10-minute match cycle**: introduce a match duration (read from online tuning, default 600s). When elapsed, perform a full world reset — re-spawn planets, reset black hole, reset boundary ramp, clear rockets/debris — without disturbing the participant roster. All dead players are auto-respawned at the cycle boundary; the bot floor is re-applied. Participants stay connected throughout. **No HUD match timer during the cycle** — players don't see a running clock.
- **Cycle reset countdown overlay**: in the final ~15 seconds before reset, server emits a `cycleResetCountdown` message; frontend shows a centered "Round restarts in N…" overlay (1-second tick), then on reset clears any death/rejoin overlays and snaps to the fresh world. The overlay is the only time players see the cycle clock.
- **Cycle bookkeeping defaults** (taking my recommendations unless you say otherwise):
  - Per-cycle kills/deaths wipe at reset (consistent with "no stats").
  - Bots keep their seat names ("Bot 1"…"Bot 5") across cycles; only their bodies respawn.
  - Cycle clock starts when the first human is admitted to the room — an empty bot-only room doesn't burn cycles.
- **Skip pick phase entirely for online**: no archetype picker UI. On first join, **assign a random archetype** (`pickRandomArchetype()`) server-side. Lobby phase becomes a brief warm-up (e.g. 5s) or is skipped entirely; recommend skipping — the joiner spawns straight into combat.
- **Mid-combat join**: when a player is admitted, spawn them immediately with a random archetype via a new `room.spawnLatePlayer(playerId)` path. No more spectator branch.
- **Spawn invulnerability**: late joiners and rejoiners get ~2–3s of i-frames (configurable in tuning, e.g. `spawnInvulnSec`). Implement as a flag/expiry on the player's planet; damage is no-op'd while active. Visualize on the frontend (e.g. shimmering shield).
- **Spectator role removed online**: delete the `else` at matchmaking.ts:860-867 that demotes mid-combat joiners to spectators. `Connection.role === "spectator"` is no longer reachable in online flow; can leave the type for now but stop emitting it.
- **Player death — manual rejoin**: on death, show the player a death screen with a "Rejoin" button (reuse the existing match-end UI shell). Clicking rejoin sends a new client message that re-spawns them with a random archetype at a free spawn slot in the live arena. No automatic respawn loop. At the 10-minute cycle reset, dead-but-not-rejoined players are auto-respawned alongside the world reset.
  - New shared message: `RejoinMsg { type: "rejoin" }` (no archetype field — server picks random).
  - Backend handler: `handleRejoin(connection)` → if player is dead, call `room.respawnPlayer(playerId)` which assigns a random archetype, adds a fresh planet/ship at a free spawn slot, and re-populates `privateStates`.
  - Frontend: `NetworkGamePage` — when `self` becomes dead, render a "You died — Rejoin" overlay (mirror of current match-end screen) with a button that emits `rejoin`.

**Stats / leaderboards — disabled online**
- `enqueueFinishedMatchSummary`, `pickMatchMvp`, MVP/K-D writes — gate behind a check that skips when the room is online/continuous. Per-life stats are out of scope per your call.

**Reclaim grace removed for dead online players**
- `markDisconnected` (room.ts) currently keeps a disconnected player's seat for `reclaimGraceMs` so they can resume. For online: if the disconnecting player is **dead** (no privateState / planet destroyed), free the seat immediately so the bot floor + waitlist can move. Alive disconnected players keep the existing grace window — they may want to reconnect into their live planet.
- **Bot death**: bot stays dead, seat freed. `fillBots()` runs again next tick — if total drops below 5, a fresh bot is added. Otherwise no replacement.
- **Stats/MVP**: `pickMatchMvp`, finished-match summaries, rematch voting, `matchEnd` message — all become dead code for online. Either remove or gate behind an `isContinuous` room flag.
- Rematch flow (`applyRematchVote`, `rematchDeadlineAtMs`, `voteRematch` handler) — disable for online.

## 2. Split editor-tuning into online/offline

**Files**
- Rename `.data/editor-tuning.json` → `.data/editor-tuning.online.json` (current values seed online).
- Create `.data/editor-tuning.offline.json` as a clone of online with the AI difficulty section pre-tuned softer than the current `easy` preset (e.g. lower `confidenceThresholds`, shorter `targetPredictionHorizonSec`, fewer `simulationSteps` / `threatSimulationSteps`, shorter `evaluationHorizonSec`). Concrete values to drop in: I'll halve the current `easy` thresholds and horizons unless you want specific numbers.

**Backend** (`src/backend/src/editor-tuning.ts`)
- Replace single `runtimeEditorTuningDocument` with a `Map<"online" | "offline", GameTuningDocument>` (or two named refs).
- Replace `TUNING_FILE_PATH` constant with a function `tuningPathFor(mode)`.
- Refactor exports: `readEditorTuningDocument(mode)`, `writeEditorTuningDocument(mode, value)`, `getRuntimeEditorTuningDocument(mode)`, `loadEditorTuningIntoRuntime()` loads both.
- **Important**: `applyGameplayTuning()` mutates shared singletons globally. The backend only runs online matches, so on the backend, only the **online** tuning should be `applyGameplayTuning`'d. The offline document is just stored/served for the frontend to apply in-browser. Update `loadEditorTuningIntoRuntime()` accordingly.

**Two canonical tuning files in `shared/src/tuning/`**
- Replace `shared/src/tuning/current.json` with **two** files: `current.online.json` and `current.offline.json`.
- `shared/src/tuning/index.ts` (or wherever `CURRENT_GAME_TUNING` is exported) — export `CURRENT_ONLINE_TUNING` and `CURRENT_OFFLINE_TUNING`. Existing `CURRENT_GAME_TUNING` callers need to be updated to pick the right one based on context (or re-aliased to online for backend bootstrap).
- `syncEditorTuningDocumentToCurrent(mode)` writes to the matching file: `online` → `current.online.json`, `offline` → `current.offline.json`.
- API: `POST /api/editor/tuning/:mode/sync-current` invokes the same-mode sync.

**API** (`src/backend/src/main.ts:218-232`)
- Replace `GET/PUT /api/editor/tuning` with `GET/PUT /api/editor/tuning/:mode` where `mode ∈ {"online","offline"}`. Validate or 400.
- Same for `POST /api/editor/tuning/sync-current` → `/api/editor/tuning/:mode/sync-current`.

**Frontend runtime tuning** (`src/frontend/src/game/runtimeTuning.ts:37`)
- `loadRuntimeTuningDocument(mode)` fetches `/api/editor/tuning/<mode>`.
- `main.tsx:14` — choose mode based on current route: `/online*` → online, `/offline*` → offline, `/` → online (or skip until route resolves).
- `GamePage` (offline) loads offline doc; `NetworkGamePage` (online) loads online doc. Make sure `applyGameplayTuning` is called with whichever doc the page uses.

## 3. Split `/edit` into `/online/edit` and `/offline/edit` (dev-only)

**Editor disabled in prod via env var**
- New env var: `EDITOR_ENABLED` (backend) — defaults `true` in dev, must be set `false` in prod deploys. `src/backend/src/config.ts` adds the parsed flag.
- When `EDITOR_ENABLED=false`:
  - Backend `main.ts` does NOT register the `GET/PUT /api/editor/tuning/:mode` or `.../sync-current` routes (returns 404 if hit).
  - Backend serves a small `GET /api/editor/enabled` (or includes the flag in an existing bootstrap payload) so the frontend knows.
  - Frontend `App.tsx` resolves `/online/edit` and `/offline/edit` to `<NotFoundPage />` when the flag is false.
  - `PlayMenuPage` hides the edit buttons in prod.
- Frontend reads the flag at boot (small `/api/editor/enabled` fetch in `main.tsx`, or inline it on the index page) and stashes it in a top-level context.

**Routing**
- `src/frontend/src/routes.ts` — replace `"/edit"` with `"/online/edit"` and `"/offline/edit"`. Update `KNOWN_ROUTES` set.
- `src/frontend/src/App.tsx:31` — switch on the new routes; render `<EditPage mode="online" />` or `<EditPage mode="offline" />` only when `EDITOR_ENABLED`; otherwise `<NotFoundPage />`.
- `src/frontend/src/vite.config.ts:4` — already uses `APP_ROUTES`, will pick up the change automatically.

**EditPage** (`src/frontend/src/EditPage.tsx`)
- Add `mode: "online" | "offline"` prop.
- Lines 1605, 1663, 1711 — replace hardcoded `/api/editor/tuning` with `` `/api/editor/tuning/${mode}` `` (and `.../sync-current`).
- Title/header: show "Online tuning" or "Offline tuning" so the user knows which file they're editing.

**Discoverability**
- `PlayMenuPage` — add two "Edit" buttons (online / offline), or add links from each game page header. Existing `NotFoundPage.tsx:14-15` text needs updating to mention the new edit URLs.

**Tests** (heads-up — these will need updating)
- `src/frontend/src/App.test.tsx:69-90` — add cases for `/online/edit`, `/offline/edit`.
- `src/frontend/src/EditPage.test.tsx` — every `/api/editor/tuning` expectation (~40+ sites) needs the mode suffix; pick a default mode for the test suite or parameterize.
- `src/frontend/src/main.test.tsx:38` — same.

## Resolved decisions

1. **Bots stay until they die** — never kicked by humans joining; replenished only via the 5-bot floor.
2. **Waitlist only, no overflow** — if the singleton room is in pick/combat or full, new joiners wait.
3. **Offline tuning** — clone online; AI softened. Online tuning will set black hole + boundary ramp timers longer than offline.
4. **Player death** — Rejoin overlay; click respawns mid-arena with a fresh random archetype.
5. **Continuous arena with 10-min cycle** — no win-condition end; world resets every 10 minutes (configurable in online tuning) and auto-respawns everyone.
6. **Random archetype on join/rejoin** — no pick UI online.
7. **No spectators online** — mid-combat joiners spawn as players.
8. **No stats writes online** — leaderboards/MVP gated off for the continuous room.
9. **Editor dev-only** — `/online/edit` and `/offline/edit` (and their API endpoints) gated behind an `EDITOR_ENABLED` env var; disabled in prod.
10. **Spawn invulnerability** — ~2–3s i-frames for late joiners and rejoiners.
11. **Reclaim grace** — removed for dead online players (seat frees immediately on disconnect when dead). Alive players keep existing grace.
12. **No HUD match timer** — players don't see the 10-min cycle countdown.
13. **Two canonical tuning files** — `shared/src/tuning/current.online.json` + `current.offline.json`. Sync writes to the same-mode file.
14. **Cycle reset countdown overlay** — last ~15s of each cycle, centered "Round restarts in N…" banner; world snaps on reset.

## Ready to implement

No remaining open questions — say the word and I'll start.
