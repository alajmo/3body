# AI Gameplay Tuning Wiring

## Question

Why do edits at `/online/edit?item=ai-gameplay` seem not to be respected by the
online AI?

## What works (verified end‑to‑end)

The movement / threat / shots / execution number fields DO reach the live
online AI. The chain:

1. `EditPage` `commitChange` (`src/frontend/src/EditPage.tsx:1695`) → PUT
   `/api/editor/tuning/online`.
2. `writeEditorTuningDocument("online", body)` in
   `src/backend/src/editor-tuning.ts:50` writes
   `.data/editor-tuning.online.json` and then calls
   `applyGameplayTuning(nextDocument.gameplay)` (line 65).
3. `applyGameplayTuning` (`src/shared/src/constants.ts:248`) calls
   `applyCombatAiTuning(gameplay.ai)`.
4. `applyCombatAiTuning` (`src/shared/src/ai/runtimeTuning.ts:57`) `Object.assign`s
   into the module‑level `COMBAT_AI_TUNING`.
5. Every bot reads `COMBAT_AI_TUNING` live each tick from
   `scoring.ts`, `planner.ts`, `perception.ts` — no caching, no destructuring
   that would break the live binding.

A runtime test that imported the same modules and ran an actual
`writeEditorTuningDocument("online", …)` cycle confirmed
`COMBAT_AI_TUNING.movement.candidateDirections` flipped 12 → 28 and
`boostCommitScoreDelta` 7.5 → 17 immediately.

## What is NOT respected

Two things in this editor pane do not reach online matches — these are the
likely sources of the "not respected" feeling.

### 1. "AI Setup" section is sandbox‑only

`EditPage.tsx:1526-1530` keeps the controls as local React state:

```ts
const [aiGameplayParticipantCount, setAiGameplayParticipantCount] = useState(
  AI_GAMEPLAY_MAX_PARTICIPANTS,
);
const [aiGameplayDifficulty, setAiGameplayDifficulty] =
  useState<BotDifficulty>("normal");
```

They feed `aiGameplaySandboxConfig` (`EditPage.tsx:5492-5500`) for the
in‑pane sandbox preview. They are never written to the tuning document and
never reach the backend. The section header says "Observer sandbox seeded
from the current runtime tuning", but the AI pilots count and Difficulty
selector under it do not persist or apply to online.

### 2. Online bots are hardcoded to `"easy"`

`src/backend/src/room.ts:192`:

```ts
botDifficulty: BotDifficulty = "easy";
```

`botDifficultyFor` returns this for lobby‑seeded bots
(`room.ts:668`). Disconnected‑human handoffs use `"normal"`
(`room.ts:317-318`), but those are the only "normal" bots online.

Implication: editing the `normal` or `hard` columns of
`evaluationHorizonSec`, `lookaheadSec`, `confidenceThresholds`,
`targetPredictionHorizonSec`, `targetPredictionSteps`, `simulationSteps` has
no effect on a normal online match. Only the `easy` column applies to
lobby bots.

`gameplay.ai.execution.*` fields (`boostCommitScoreDelta`,
`pressureLightOverride*`, `cacheRunFireConfidence`,
`repositionFireConfidence`) are difficulty‑independent and DO apply.

## Other gaps noticed during the trace

- `aiGameplay` reset is intentionally a no‑op
  (`EditPage.tsx:888,908`) — separate UX issue, not a wiring problem.
- `boostPenaltySingleCharge` / `boostPenaltyMultipleCharges` exist in the
  schema and sanitizer (`tuning.ts:2295-2306`) and are read by
  `scoring.ts:1499-1500`, but are not exposed as fields in the `aiGameplay`
  editor section.

## Suggested fixes

- **Plumb the editor's Difficulty/AI pilots down to the room.** Either
  persist them into the tuning document (e.g.
  `gameplay.ai.online.difficulty`, `gameplay.ai.online.botCount`) or send a
  separate room‑config payload, and have `Room` read it instead of the
  hardcoded `"easy"`. This matches the implied intent of the editor.
- **OR document the sandbox‑only nature** of those controls in the section
  note, and surface the active online difficulty somewhere obvious so the
  user knows which difficulty column actually matters.
- **Expose** `boostPenaltySingleCharge` / `boostPenaltyMultipleCharges` in
  the editor if you want them tunable, or remove them from the sanitizer if
  you don't.

## Files that mattered

| Concern | File | Lines |
| --- | --- | --- |
| Editor save handler | `src/frontend/src/EditPage.tsx` | 1657-1693 |
| AI Setup local state | `src/frontend/src/EditPage.tsx` | 1526-1530 |
| AI Setup sandbox feed | `src/frontend/src/EditPage.tsx` | 5492-5500 |
| Backend write + apply | `src/backend/src/editor-tuning.ts` | 50-68, 80 |
| Editor PUT endpoint | `src/backend/src/main.ts` | 220-244 |
| `applyGameplayTuning` | `src/shared/src/constants.ts` | 248-278 |
| `applyCombatAiTuning` | `src/shared/src/ai/runtimeTuning.ts` | 57-99 |
| Live `COMBAT_AI_TUNING` reads | `src/shared/src/ai/{scoring,planner,perception}.ts` | various |
| Hardcoded online difficulty | `src/backend/src/room.ts` | 192, 317 |
