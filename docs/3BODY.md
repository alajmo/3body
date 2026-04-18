# 3BODY — Game Design Document

## 1. High-Concept

**3BODY** is a 2D, browser-based multiplayer arena game inspired by the chaotic gravitational dynamics of the three-body problem. Up to 7 players each control a planet orbiting a system of 3 mutually-attracting suns. The suns' chaotic motion makes every match unique — orbits stretch, snap, and fling planets unpredictably. Players use rockets and abilities to destroy rival planets while surviving the chaos. Last planet alive wins.

**Pillars**
- **Chaos as gameplay** — the gravitational field is the primary antagonist; combat rides on top of it.
- **Read the system** — mastery means reading the field, not just aiming.
- **Short, replayable rounds** — 3–7 minute matches; each one feels different because the initial conditions of 3 suns + N planets never repeat exactly.
- **Easy to drop in** — browser-based, no install, AI fills empty seats so a match is always playable.

---

## 2. Target Platform & Tech

- **Platform:** Web (desktop browser first, mobile as stretch).
- **Rendering:** Three.js for the arena render, with React for HUD / lobby / match-flow UI layered over the canvas.
- **Physics:** Custom N-body simulation (no off-the-shelf physics — gravity is the game). Symplectic integrator (Velocity Verlet or Leapfrog) for stable orbits at fixed timestep (120 Hz sim on the server).
- **Networking:** WebSockets over a custom Bun server. The server is authoritative; clients send intent and render/interpolate snapshots.
- **Backend:** Bun + TypeScript. Single-process room model; one room = one match.
- **AI fallback:** Server spawns bot controllers for any unfilled slot at match start, and replaces dropped players mid-match.

---

## 3. The Arena

- **Shape:** Bounded circular play area (radius ~2000 units). Crossing the boundary is an immediate kill. It should also produce stronger visual feedback at the edge (brighter boundary ring, subtle vignette/desaturation), but **not** hide enemies or add fog-of-war.
- **The 3 Suns:** Three massive bodies, themselves mutually attracted (real three-body simulation). They influence planets but planets do *not* meaningfully influence them (one-way gravity for stability; otherwise the system explodes within seconds).
  - All 3 suns use the same `SUN_MASS` in V1. Tune that shared mass so that a stable-ish chaotic dance lasts the full match length; asymmetric masses are a future variant, not part of MVP.
  - Suns are deadly on contact: any planet touching a sun is instantly destroyed.
- **Overtime collapse:** If combat reaches **5:00**, a **Black Hole** spawns at the arena center. It exerts a very strong inward pull on suns, planets, rockets, drones, and caches, and destroys anything that touches its event horizon. This exists to break stalled endgames; the winner is still simply the last planet alive.
- **Planets:** Player-controlled bodies. Subject to gravity from all 3 suns. Treated as point masses for gravity, but have a visible radius for collisions/hits.
- **Spawnable pickups (Caches):** Drift in the **outer ring** of the arena — the region between the typical planetary orbits and the boundary. They are *outside* where planets naturally travel, so you cannot collect them by orbit alone. The only way to grab one is to launch a **Salvage Drone** (see §7.1) and pilot it out and back. Caches respawn on a timer so the outer ring is always worth contesting.
- **No static walls** — only the arena boundary and the suns themselves.

---

## 4. Match Flow

**Entry modes from the title screen**
- **Create Room:** creates a private, shareable room with a code. Friends join by code. This is networked.
- **Quick Game:** joins server-managed public matchmaking. The service drops players into public rooms and fills missing seats with bots. This is networked.
- **Join by Code:** joins an existing private room. This is networked.
- **AI Game:** starts an offline/local match against bots only. It does **not** require or contact the backend server, and it skips the networked room lobby.

**Implementation ownership:** `AI Game` is a frontend-owned local match runner. It reuses `@3body/shared` physics/types/constants plus the same pick/countdown/combat/victory screens as networked play, but it never opens a WebSocket and the backend should not special-case it.

1. **Lobby** (networked modes only, up to 7 humans). Empty seats auto-fill with AI bots when host starts, or after a 30s wait. `AI Game` enters the same pick/countdown/combat loop locally without this room lobby.
2. **Pick screen** — each player picks a planet archetype (see §6). 30s timer; AI picks for AFK players.
3. **Spawn** — planets are placed on stable-ish initial orbits around the centroid of the 3 suns. Initial velocity is set tangentially so each planet starts in a roughly bound orbit. Spawn positions are evenly spaced angularly.
4. **Countdown** — 3-second freeze, then live.
5. **Combat phase** — open play until 1 planet remains. If the match reaches **5:00**, the Black Hole spawns and collapses the arena inward.
6. **Victory screen** — winner or draw, MVP stats (kills, longest survival, near-misses), plus a rematch vote in networked matches. `AI Game` uses a local `Play Again` / `Back to Title` flow instead.

**Match length target:** 3–7 minutes typical. There is no timeout winner; if a match stalls, the Black Hole appears at **5:00** and play continues until only 1 planet remains.

---

## 5. Controls

Designed for keyboard + mouse, with gamepad as a stretch.

**The mouse is the universal direction input.** Any action that has a direction — firing a rocket, raising a shield, applying a boost — uses the cursor's position relative to the player's planet to set that direction. There is no separate aim system per ability.

- **Mouse position:** Sets the *direction vector* from the player's planet to the cursor. A reticle renders at the cursor; a faint line from planet → cursor confirms aim.
- **Left click / Space:** Fire currently-selected rocket *toward cursor*.
- **1 / 2 / 3:** Select rocket type (Light / Heavy / Seeker — see §7).
- **4 / F:** Launch **Salvage Drone** *toward cursor* and immediately enter pilot mode (see §7.1).
- **Q:** Foresight (no direction — predicts your own path).
- **W:** Raise Shield *facing cursor* (see §8 — the shield is a directional arc, not a full bubble).
- **E:** Boost *toward cursor* (impulse direction = planet → cursor vector).
- **Shift (held):** "Read mode" — zooms out and dims UI to study the gravitational field. No effect on gameplay; pure information.
- **Camera:** live play uses a smooth follow camera anchored to your controlled planet. Read mode widens zoom but does not unlock free camera; free camera exists only for spectators.
- **HUD aid:** the combat HUD keeps a compact bottom-right shortcut dock visible so players can always see the current keybinds for rockets, drone, abilities, and contextual controls.

**Salvage Drone pilot mode controls (overrides the above while active):**
- **Mouse position:** Steers the drone (drone applies thrust toward cursor).
- **Left click:** Drone short thrust burst (limited fuel).
- **Right click / F:** Recall — drone self-destructs, dropping its cargo at its current location for anyone to pick up. Use to abort.
- **Esc:** Snap back to planet view (drone keeps flying autonomously back toward the planet, vulnerable in transit).
- Rockets and abilities of the planet are **unavailable** while piloting the drone. The planet keeps orbiting under gravity and is vulnerable.

Players do **not** directly steer their planet. Movement is governed entirely by gravity. The Boost ability is the only way to directly alter trajectory.

---

## 6. Planet Archetypes (7)

Each archetype tweaks rocket loadout stats and ability parameters. The *kinds* of rockets and abilities are the same across all planets — the numbers differ. This keeps the game readable while allowing distinct playstyles.

| # | Name        | Theme               | Stat Profile                                                                    |
|---|-------------|---------------------|---------------------------------------------------------------------------------|
| 1 | **Terra**   | Balanced            | Baseline everything. Good for new players.                                      |
| 2 | **Ignis**   | Glass cannon        | +30% rocket damage, -25% shield duration.                                       |
| 3 | **Glacius** | Tank                | +50% shield duration, -20% rocket reload.                                       |
| 4 | **Volans**  | Mobility            | +50% Boost magnitude, +1 Boost charge, -20% rocket damage.                      |
| 5 | **Oculus**  | Sniper / Strategist | +100% Foresight duration, Seeker rockets get +30% turn rate.                    |
| 6 | **Umbra**   | Disruptor           | Rockets apply a small "drag" effect on hit (briefly slows target). -15% damage. |
| 7 | **Corvus**  | Swarm               | Light rockets fire in a 3-shot burst, individual damage halved.                 |

Cosmetic differences (color, trail, sprite) make each planet visually distinct on screen.

---

## 7. Rockets (3 types, shared by all planets)

Rockets inherit the firing planet's velocity at launch, then add their own thrust. They are **also** affected by the suns' gravity — meaning rockets curve. This is the central skill expression of the game.

| Rocket         | Damage                            | Speed  | Reload       | Notes                                                                                                                      |
|----------------|-----------------------------------|--------|--------------|----------------------------------------------------------------------------------------------------------------------------|
| **Light** (1)  | Low                               | Fast   | Short (1.5s) | Straight, high-velocity. Hard to lead in chaos but cheapest. Ammo: regenerates, max 5 in clip.                             |
| **Heavy** (2)  | High (one-shot vs low HP planets) | Slow   | Long (6s)    | Massive damage, slow projectile, heavily affected by gravity. Reads field for big plays.                                   |
| **Seeker** (3) | Medium                            | Medium | Medium (4s)  | Slow turn rate toward locked target. Locks on the planet under cursor at fire time. Beatable by hard maneuvers + gravity slingshots. |

All rockets self-destruct after ~8 seconds or on contact with a sun, planet, or another rocket.

**Ammo economy**
- **Light:** regenerates to a clip of 5.
- **Heavy:** starts each match with **2 shots**, has a normal carried cap of **2**, and does **not** regenerate naturally.
- **Seeker:** starts each match with **3 shots**, has a normal carried cap of **3**, and does **not** regenerate naturally.
- Cache ammo pickups can push Heavy / Seeker ammo **above** the normal carried cap.

### 7.1 Salvage Drone (the navigable rocket)

A fourth, special projectile used to fetch Caches from the outer ring. Unlike combat rockets, the player **directly pilots** the drone with the mouse.

| Property | Value                                                                                 |
|----------|---------------------------------------------------------------------------------------|
| Speed    | Slow-medium (slower than Light, faster than Heavy)                                    |
| Thrust   | Continuous low thrust toward cursor; click for short burst (limited fuel ~3 bursts)   |
| Gravity  | Affected by suns same as rockets (curves)                                             |
| Health   | 1 hit from any rocket destroys it                                                     |
| Cargo    | Picks up the first Cache it touches; cannot pick up a second until cargo is delivered |
| Delivery | Touch your own planet to deposit cargo (instant apply of contents)                    |
| Lifetime | 20 seconds before auto-self-destruct                                                  |
| Cooldown | 8s between drone launches                                                             |

**Risk/reward:**
- While piloting, your planet is unable to fire rockets, raise shields, or boost. You are split-attention vulnerable.
- A killed drone drops its cargo at its death location — anyone (including the killer) can fetch it with their own drone.
- Smart play: launch a drone *after* firing rockets to keep enemies pressured during the vulnerable window, or coordinate Foresight beforehand so your planet stays safe on its predicted path.

---

## 8. Abilities (3, shared by all planets)

| Key | Name          | Effect                                                                                                                                                                                                                                                          | Cooldown / Charges       |
|-----|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------|
| Q   | **Foresight** | Reveals a predicted trajectory line for your planet for the next ~6 seconds, accounting for current sun positions. The line decays in accuracy further out (gets dotted/faded) because the system is chaotic — small errors compound.                            | 12s cooldown, 4s active. |
| W   | **Shield**    | Raises a directional arc shield (~120° wedge) on the side of your planet *facing the cursor*. Absorbs rockets that hit the arc and negates sun-touch damage on that side. Rockets striking the unshielded side still hit. The shield re-aims with the cursor while active, so the player must actively track threats. | 15s cooldown, 4s active. |
| E   | **Boost**     | Applies a directional impulse *toward the cursor* to your planet, kicking it out of its current orbit. Limited fuel: 2 charges per match by default, regenerates 1 every 45s.                                                                                   | Per-charge 5s lockout.   |

**Design notes:**
- Foresight is the "read the chaos" tool — without it the game would be too punishing for new players, with it the game rewards system-reading skill.
- Shield is the only defensive tool. Using it on a Heavy rocket = great. Burning it on a Light = wasteful. Decision-making.
- Boost is the *only* way a player alters their own trajectory. Conserving Boost for emergencies (avoiding a sun, dodging a Seeker) vs offensive use (slingshotting into a kill) is the core resource decision.

---

## 8.1 Spawnables (Caches)

Caches are pickup objects that drift in the outer ring of the arena. Each Cache contains one of the resources/buffs below. You collect them by sending out a Salvage Drone (§7.1) and delivering the cargo back to your planet.

**Cache spawn rules**
- 3 Caches active in the arena at any time. When one is collected or destroyed, a new one spawns after a 15s timer at a random outer-ring position.
- Caches drift slowly (low velocity, lightly affected by gravity — they can be flung by close passes to a sun, which can make them temporarily uncollectable).
- Visible to all players with a distinct icon indicating the contents. No fog of war.
- Caches are fragile. Any non-pickup impact or lethal hazard destroys them and starts the respawn timer: rocket hits, planet contact, sun contact, and Black Hole contact all remove the Cache. Only a live Salvage Drone touching an intact Cache can collect it.

**Cache contents (rolled per-spawn)**

| Type                   | Effect on delivery                                                                                                                                                                                                                                                            |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Heavy ammo +1**      | Adds one Heavy rocket to your reserve (stacks past the normal cap).                                                                                                                                                                                                           |
| **Seeker pack +2**     | Adds two Seeker rockets to your reserve.                                                                                                                                                                                                                                      |
| **Repair**             | Restores 40 HP to your planet.                                                                                                                                                                                                                                                |
| **Boost charge +1**    | Refills one Boost charge (above the normal max).                                                                                                                                                                                                                              |
| **Shield extender**    | Next Shield activation lasts 2× as long.                                                                                                                                                                                                                                      |
| **Foresight extender** | Next Foresight lasts 2× as long and remains accurate further out.                                                                                                                                                                                                             |
| **Wildcard ability**   | A one-shot fourth ability slot, bound to **R** for the rest of the match (or until used). Possible rolls: gravity-pulse (briefly nudges all nearby objects outward), cloak (planet body stays visible but its trail is hidden for 5s via a public `hideTrailUntilTick` state that tells clients to clear/suppress trail rendering), teleport-swap (swaps positions with the planet under cursor — high-skill, high-impact). |

The Wildcard is intentionally rare (~10% of cache rolls) and game-swinging — it gives behind-players a comeback path and creates dramatic moments.

**Why this mechanic exists**
- Adds an explicit *risk vs reward* loop on top of orbital combat: leave your safe orbit to claim the prize, but expose yourself.
- Gives the outer ring purpose, otherwise it's just dead space.
- Salvage Drone piloting is a skill check separate from rocket-leading or orbit-reading, broadening what the game tests.
- Creates contested objectives that drive engagement when players would otherwise stay defensive.

---

## 9. Damage, Health, Death

- Each planet has **100 HP**.
- Light rocket: 15 dmg. Heavy: 70 dmg. Seeker: 35 dmg.
- Sun contact: instant death.
- Planet-to-planet contact: both planets are instantly destroyed.
- Boundary crossing: immediate death on leaving the arena.
- Black Hole contact: instant death.
- A destroyed planet leaves a brief debris field (visual only, no gameplay effect) and the player enters spectator mode. They can still chat and watch.
- If the final two planets die on the same tick, the round ends in a draw rather than inventing a winner.
- There is **no in-match respawn**. Dead players remain spectators until the round ends and a rematch begins in networked play, or until replay/title in `AI Game`.
- Winner determination is survival-only. There is no kill-credit system that affects victory; end-of-match stats may still show direct kills and other performance metrics, but environmental / chaos deaths are uncredited.

---

## 10. AI Fallback

AI bots fill any seat not held by a human, both at match start and on disconnect.

**Bot behavior tiers:**
- **Easy:** Reactive only. Fires Light rockets at nearest planet. Uses Boost only to avoid sun collisions detected within 1.5s. Never uses Foresight intentionally.
- **Normal:** Plans 2–3 seconds ahead using the same prediction the Foresight ability uses. Leads shots. Uses Shield reactively when a rocket is incoming and within 1s. Uses Boost to escape sun pulls or close on weakened targets.
- **Hard:** Full predictive play. Uses Heavy rockets when target trajectory is predictable (low chaos zone). Coordinates ability use. Targets lowest-HP enemies. Will self-sacrifice Boosts to set up kills.

Default mid-match dropouts spawn at **Normal**. Lobby fill defaults to a difficulty the host sets.

---

## 11. Networking Model

- **Server-authoritative simulation.** Server runs the full N-body sim at 120 Hz, broadcasts state at 30 Hz (positions, velocities, HP, ability states).
- **Immediate local feedback, not local authority:** Firing and abilities should feel instant, but the client never becomes authoritative. Fire may spawn a short-lived ghost rocket; Shield may raise the owner-local arc immediately; Foresight may render immediately from the latest local snapshot; Boost and Wildcard may play owner-local cast VFX/SFX immediately. None of those cues may author movement, hits, cooldowns, teleports, or any other world transform. Movement is *not* client-predicted — the sim is server-only because chaotic systems diverge fast under prediction.
- **Snapshot visibility split:** Snapshots always contain the full **public** world state for every client; owner-only data such as ammo, cooldowns, and wildcard inventory is delivered separately to that owning player.
- **Trust boundary:** Clients send intent only (aim direction, key/button edges, fire/ability/drone actions). Clients never author positions, HP, cooldowns, or hit results.
- **Bandwidth:** 7 planets + 3 suns + ~20 active rockets ≈ 30 entities × ~32 bytes × 30 Hz ≈ 30 KB/s per client. Well within budget.
- **Lag compensation:** Rocket fire is timestamped; server rewinds the firing planet's launch origin by ~100ms before spawning the rocket. It does not rewind target positions or historical hit results.
- **Tick-locked determinism is not required** because the server is authoritative — but the integrator must still be stable and reproducible for replays.

---

## 12. Visual & Audio Direction

**Visual**
- Dark space background with subtle parallax starfield.
- Arena boundary is always visible as a readable ring. Outside-boundary feedback intensifies that ring and adds a subtle screen-space vignette/desaturation; this is feedback only, not fog-of-war.
- Each planet has a **trail** showing recent path (last ~3 seconds, fading). Trails are color-coded per player. This is critical for reading the field at a glance.
- Suns radiate visible gravity-warp rings (purely cosmetic, but readable).
- Rockets have type-distinct visuals: thin white (Light), heavy orange-red (Heavy), pulsing magenta (Seeker).
- The Black Hole must be readable on spawn: dark core, bright accretion band, subtle lensing/distortion, and a clearly legible kill radius so overtime is understandable instantly.
- Foresight predicted path renders as a dashed line that fades from solid → dotted → invisible across its duration.
- Hit effects: brief screen shake (subtle), particle burst, HP bar flash.
- A compact bottom-right shortcuts panel keeps the core controls readable in live play: `1/2/3` rockets, `4/F` drone, `Q/W/E` abilities, `R` wildcard when active, plus contextual drone/spectator hints.

**Audio**
- Ambient drone that intensifies with proximity to suns.
- Distinct firing/impact sounds per rocket type.
- Low rumble when a sun pull becomes dangerous (acts as audio Foresight).
- Black Hole spawn / pull gets its own low-end swell / suction cue so overtime is readable even off-screen.
- Death: a satisfying low boom + brief silence.

---

## 13. Progression & Meta (Out of Scope for V1)

V1 ships with **no progression, no unlocks, no accounts**. Players pick a name, pick a planet, play. Cosmetic unlocks and ranked play are post-launch considerations. This keeps scope focused on the core loop, which is the actual product.

**Scope call:** cross-session persistence, leaderboards, and profile continuity are a follow-on V1 slice, not a blocker for the first playable multiplayer MVP. Match-end screens still show per-match stats; durable storage can land after the core gameplay loop is working and tuned.

If durable highscores / stat history ship before full accounts, they should be keyed by an opaque device-local profile token kept in browser storage and hashed server-side. That is a lightweight identity handle for stats continuity, not a login/account system.

---

## 14. Scope & Milestones

**M1 — Single-player prototype (2 weeks)**
- Renderer, N-body sim, 3 suns + 1 player planet, basic gravity, no rockets.
- Goal: prove the chaos feels good to fly in.

**M2 — Combat sandbox (2 weeks)**
- All 3 rocket types, all 3 abilities, HP and death.
- Local hot-seat or vs single AI.

**M3 — Networking (3 weeks)**
- Authoritative server, lobby, 2–7 players in a room.
- Bot fill on empty seats.

**M4 — Polish & playtest (2 weeks)**
- Sound, visual polish, balance pass, archetype tuning.
- External playtests, iterate.

**M5 — Public beta**
- Hosted, deployable. Telemetry on match length, kill distribution, ability usage.

---

## 15. Resolved / Deferred Notes

- **Boundary:** escalating damage, not instant kill.
- **Rocket collisions:** enabled; defensive shooting is part of the combat language.
- **Replay system:** out of scope for V1, but the deterministic-ish server sim keeps it viable later by recording inputs + initial conditions.
- **Spectator chat:** allowed, but spectators cannot influence the match.

---

## 16. Success Criteria

- Average match length lands in the 3–7 minute target band.
- Players use all 3 rocket types and all 3 abilities in a typical match (no dead options).
- Kill distribution is reasonably spread across archetypes (no single dominant pick > 30% pickrate at equilibrium).
- New players can survive their first match for at least 60 seconds without dying to a sun (i.e. the gravity is learnable in one match, not punishing on first contact).
