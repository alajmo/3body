# 3BODY — UI / Screen Design

This document turns the gameplay and TODO docs into a concrete screen layout proposal. It is intentionally low-fidelity and ASCII-first so the team can agree on information hierarchy before styling.

Principles
- Keep the center of the arena clear. Core world reading wins over decorative HUD chrome.
- Use corners for secondary information: kill feed top-left, connection top-right, controls bottom-right.
- Keep one stable muscle-memory anchor: the bottom-right shortcuts dock should exist in every match-state screen, changing contents by context instead of disappearing.
- Match-critical numbers should be glanceable, not modal: HP, selected weapon, ammo, cooldowns, timer, latency.
- Spectator and end-state screens should feel like variants of the combat screen, not a different app.

---

## 1. Title / Entry

```text
+----------------------------------------------------------------------------------+
| 3BODY                                                                            |
| Chaotic orbital arena combat                                                     |
|                                                                                  |
|                            [ animated background / suns ]                        |
|                                                                                  |
|                       +----------------------------------+                       |
|                       | Name       [ samir          ]    |                       |
|                       | Room code  [ optional       ]    |                       |
|                       |                                  |                       |
|                       | [ Create Room ] [ Quick Game ]   |                       |
|                       | [ Join by Code ] [ AI Game ]     |                       |
|                       +----------------------------------+                       |
|                                                                                  |
|                    Last used name auto-filled from localStorage                  |
|                                                                                  |
| Desktop-first V1                                                Version / Build  |
+----------------------------------------------------------------------------------+
```

Notes
- `Create Room` is the primary private-room action.
- `Quick Game` is the no-code networked path into public matchmaking.
- The room-code field is only used for `Join by Code`.
- `AI Game` starts local/offline play and bypasses reconnect and room-lobby UI entirely.
- Background should already communicate the visual language: suns, trails, distortion, no flat menu screen.

---

## 2. Lobby Screen

Private-room variant
```text
+----------------------------------------------------------------------------------+
| Private Room: AB12CD                       Auto-start 00:27        Ping 32 ms    |
|                                                                                  |
| +--------------------------------------+  +------------------------------------+ |
| | Players / Seats                      |  | Match Settings                     | |
| |                                      |  | Bot difficulty: [ Normal v ]       | |
| | 1. samir       Host   Ready          |  | Humans: 2 / 7                      | |
| | 2. alex               Ready          |  | Bots on start: 5                   | |
| | 3. empty                               |  |                                    | |
| | 4. empty                               |  | [ Start now ]  host only          | |
| | 5. empty                               |  +------------------------------------+ |
| | 6. empty                                                                      | |
| | 7. empty                                                                      | |
| +--------------------------------------+                                        | |
|                                                                                  |
| [ Copy room code ]   [ Ready / Unready ]   [ Leave room ]                       |
|                                                                                  |
| Chat / system messages                                                           |
+----------------------------------------------------------------------------------+
```

Notes
- This mockup is the `private` room variant.
- Left side is the roster; right side is host controls and match summary.
- Ready button should be visually louder than chat.
- Empty slots should look intentional, not like missing rows.
- `Quick Game` reuses the roster-heavy layout but removes room code, host controls, and manual bot-difficulty changes.
- `AI Game` skips this screen entirely and goes straight into local pick/countdown/combat flow.

---

## 3. Archetype Pick Screen

```text
+----------------------------------------------------------------------------------+
| Pick Your Planet                                                Time left 00:23  |
|                                                                                  |
| +----------+ +----------+ +----------+ +----------+                              |
| | Terra    | | Ignis    | | Glacius  | | Volans   |                              |
| | balanced | | damage   | | shield   | | mobility |                              |
| | [pick]   | | [pick]   | | [pick]   | | [pick]   |                              |
| +----------+ +----------+ +----------+ +----------+                              |
|                                                                                  |
| +----------+ +----------+ +----------+                                           |
| | Oculus   | | Umbra    | | Corvus   |                                           |
| | foresight| | drag     | | burst    |                                           |
| | [pick]   | | [pick]   | | [pick]   |                                           |
| +----------+ +----------+ +----------+                                           |
|                                                                                  |
| Picks locked so far: samir=Volans, alex=Ignis, bot1=pending ...                  |
|                                                                                  |
| [ Confirm pick ]                                            [ Back to lobby ]    |
+----------------------------------------------------------------------------------+
```

Notes
- Each card needs one-line identity, 2-3 stat deltas, and a strong color/material cue.
- Confirmed picks should show a locked state in the roster strip.

---

## 4. Countdown Overlay

```text
+----------------------------------------------------------------------------------+
| Kill Feed                                                            Ping 31 ms  |
|                                                                                  |
|                                                                                  |
|                               [ world visible under freeze ]                     |
|                                                                                  |
|                                        3                                         |
|                                                                                  |
|                              Match begins in 3...                                |
|                                                                                  |
| HP / Ammo / Abilities hidden or dimmed during freeze                             |
+----------------------------------------------------------------------------------+
```

Notes
- The world should already be visible so players can read initial trajectories.
- This is an overlay, not a separate page.

---

## 5. In-Match HUD

```text
+----------------------------------------------------------------------------------+
| Kill Feed                               Match 04:18                Ping 34 ms    |
| samir hit alex                                                                   |
| alex destroyed bot-2                                                             |
|                                                                                  |
|                               [ arena / planets / rockets ]                      |
|                               [ trails / suns / boundary ]                       |
|                                                                                  |
|                      enemy HP bars projected in world space                      |
|                                                                                  |
|                                                                                  |
|                                                                                  |
|                                                         +----------------------+ |
|                                                         | SHORTCUTS            | |
|                                                         | >1 Light      3/5    | |
|                                                         |  2 Heavy      2      | |
|                                                         |  3 Seeker     1      | |
|                                                         |  4/F Drone    ready  | |
| +--------------------------------------------------+    |  Q Foresight  ready  | |
| | HP 72/100  WEAPON Light  AMMO 3/5               |    |  W Shield     09.4s  | |
| | Heavy 2  Seeker 1  Drone ready                  |    |  E Boost      x2     | |
| | Abilities: Q ready  W 09.4s  E x2  R empty      |    |  R Wildcard   empty  | |
| +--------------------------------------------------+    | Shift Read Mode      | |
|                                                         +----------------------+ |
+----------------------------------------------------------------------------------+
```

Notes
- Put the primary combat tray in the bottom-left corner for match-critical state: HP, selected weapon, reserve ammo, drone status, and ability state.
- Bottom-right is the stable shortcuts dock the user asked for; it can mirror terse values, but it should read as secondary to the bottom-left combat tray.
- Selected weapon should be emphasized twice: named in the bottom-left combat tray and highlighted strongly in the dock.
- `R Wildcard` is conditional. If the game treats empty wildcard as important, show it muted; otherwise omit that row entirely.
- Live self-controlled play uses a smooth follow camera anchored to the controlled body; free camera is spectator-only.

---

## 6. Drone Pilot Variant

```text
+----------------------------------------------------------------------------------+
| Kill Feed                             Match 03:02                 Ping 37 ms     |
|                                                                                  |
|                         [ camera follows drone, planet still visible ]           |
|                                                                                  |
|                                                                                  |
|           Planet status minimized: vulnerable / no rockets / abilities locked    |
|                                                                                  |
|                                                                                  |
|                                                                                  |
|                                                         +----------------------+ |
|                                                         | DRONE CONTROLS       | |
|                                                         | Mouse Steer          | |
|                                                         | LMB Burst            | |
| +--------------------------------------------------+    | RMB/F Recall         | |
| | PLANET HP 72/100   STATUS vulnerable             |    | Esc Return to planet | |
| | AUTOPILOT on   DRONE FUEL 2 bursts               |    | 4/F Launch disabled  | |
| | CARGO Shield Ext                                 |    | Shift Read Mode      | |
| +--------------------------------------------------+    +----------------------+ |
+----------------------------------------------------------------------------------+
```

Notes
- The bottom-right dock persists, but swaps from combat shortcuts to drone-specific controls.
- Keep planet HP in the same bottom-left status tray zone used by the combat HUD so the status anchor does not jump.

---

## 7. Spectator Screen

```text
+----------------------------------------------------------------------------------+
| Spectating: alex                         Match 05:41              Ping 29 ms     |
|                                                                                  |
|                               [ live arena continues ]                           |
|                                                                                  |
|                                                                                  |
|                    You are out. Chat is still enabled.                           |
|                                                                                  |
| Chat                                              Remaining players              |
| > gg                                             1. alex  42 HP                  |
| > black hole soon                                2. bot-4 18 HP                  |
|                                                  3. bot-6 72 HP                  |
|                                                                                  |
|                                                         +----------------------+ |
|                                                         | SPECTATOR            | |
|                                                         | Tab Next Player      | |
|                                                         | F Follow / Free Cam  | |
|                                                         | Enter Chat           | |
|                                                         | Esc Menu             | |
|                                                         +----------------------+ |
+----------------------------------------------------------------------------------+
```

Notes
- Spectator mode should not look like a dead-end overlay; it is still a live match screen.
- Remaining players list gives context without forcing world-space label hunting.
- Free camera lives here, not in normal self-controlled combat.

---

## 8. End Screen / Victory / Draw

```text
+----------------------------------------------------------------------------------+
|                                   VICTORY                                        |
|                              samir survived longest                              |
|                                                                                  |
| +-------------------------------------------------------------------------+      |
| | MVP: samir  |  kills 4  |  survival 06:12  |  near misses 9            |      |
| +-------------------------------------------------------------------------+      |
|                                                                                  |
| Final standings                                                                   |
| 1. samir      kills 4   survival 06:12   damage 280                              |
| 2. alex       kills 2   survival 05:58   damage 190                              |
| 3. bot-4      kills 1   survival 05:11   damage 120                              |
| ...                                                                              |
|                                                                                  |
| Rematch vote: 1 / 2 humans yes                              Deadline 00:14       |
|                                                                                  |
| [ Vote Rematch ]   [ Return to Lobby ]                                           |
+----------------------------------------------------------------------------------+
```

Draw variant
```text
+----------------------------------------------------------------------------------+
|                                 MUTUAL KILL                                      |
|                        Final two planets died on the same tick                   |
+----------------------------------------------------------------------------------+
```

Notes
- End screen should preserve the game's identity with blurred arena background behind the panel.
- In networked matches, the rematch tally should explicitly count humans only.
- In `AI Game`, replace the vote/timer row with `[ Play Again ]` and `[ Back to Title ]`; there is no rematch vote.

---

## 9. Connection Loss / Reconnect Overlay

```text
+----------------------------------------------------------------------------------+
|                                                                                  |
|                               [ frozen / dimmed arena ]                          |
|                                                                                  |
|                        Reconnecting to room AB12CD...                            |
|                                                                                  |
|                           Attempt 2 / 5    01.8s RTT                            |
|                                                                                  |
|                           [ Leave match ]   [ Retry now ]                        |
|                                                                                  |
+----------------------------------------------------------------------------------+
```

Notes
- Use this instead of silently dropping to the title screen.
- If reclaim fails, transition to a room-error state with a direct explanation.
- This overlay is only for networked modes; `AI Game` never reconnects.

---

## 10. Room Error State

```text
+----------------------------------------------------------------------------------+
| Room unavailable                                                                  |
|                                                                                  |
| The room code is invalid, the room is full, or matchmaking is unavailable.       |
|                                                                                  |
| [ Back to title ]   [ Create new room ]                                          |
+----------------------------------------------------------------------------------+
```

---

## 11. Bottom-Right Shortcuts Dock

Default combat contents
```text
+----------------------+
| SHORTCUTS            |
| >1 Light      3/5    |
|  2 Heavy      2      |
|  3 Seeker     1      |
|  4/F Drone    ready  |
|  Q Foresight  ready  |
|  W Shield     09.4s  |
|  E Boost      x2     |
|  R Wildcard   empty  |
| Shift Read Mode      |
+----------------------+
```

Rules
- Always present during match-state screens.
- Context-sensitive last rows are allowed, but the panel should not jump around the screen.
- Selected weapon row should highlight strongly.
- Cooldowns should not rely only on the dock; the main combat tray remains the authoritative status view.
- In drone mode, swap the rows to drone-specific actions.
- In spectator mode, swap the rows to follow/camera/chat actions.

---

## 12. Information Hierarchy Summary

Priority 1
- Center arena readability
- Own HP / ammo / cooldowns
- Visible selected weapon
- Match timer / Black Hole state

Priority 2
- Kill feed
- Latency / connection health
- Drone cargo / cooldown
- Spectator remaining-player context

Priority 3
- Controls reminder / shortcuts dock
- Chat
- Build/version text

---

## 13. Implementation Notes

- Build these screens in React, not in Three.js.
- Keep world labels minimal; prefer projected HP bars over verbose floating text.
- The shortcuts dock should be data-driven so combat, drone, and spectator modes all reuse one component.
- Start with this structure before visual styling. Once the layout is stable, apply the stronger visual direction from `3BODY.md` and `IMPLEMENTATION.md`.
