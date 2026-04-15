# /edit Tuning Editor Plan

## Goal

Build a single editor page at `/edit` for tuning:

- visual presentation: planets, suns, black hole, missiles, abilities, caches, HUD
- gameplay values: black hole timing, ammo counts, reload timings, ability timings, cache behavior, and similar knobs

The editor should:

- exist only as the `/edit` page in the frontend
- show a 3-column layout:
  - left: selectable object list with previews
  - middle: live in-game preview
  - right: configurable values for the selected object
- update the preview immediately while typing
- persist a field when the user presses `Enter` or blurs the input
- save to a real file so builds use the current tuned values

## Current Repo Constraints

- Routes are hand-rolled in `src/frontend/src/routes.ts` and `src/frontend/src/App.tsx`.
- `src/frontend/src/DesignPage.tsx` already provides a full-canvas page pattern.
- `src/frontend/src/CombatHud.tsx` already has a strong grouped-control pattern for numeric tuning inputs.
- `src/frontend/src/game/createGameViewport.ts` currently hardcodes many visual constants and already supports local browser tuning through `viewport/settings.ts`.
- `src/shared/src/constants.ts` is the current shared source for gameplay knobs used by both frontend sandbox and backend simulation.
- The backend is a Bun server with simple fetch routes in `src/backend/src/main.ts`.

## Core Architecture

Do not make `/edit` rewrite `constants.ts` or `createGameViewport.ts` directly.

Instead:

1. Create a typed shared tuning layer.
2. Store the current tuning in one versioned file.
3. Load that tuning in both frontend and backend.
4. Let `/edit` change the tuning through a backend API that validates and writes the file.

This keeps visual preview, frontend sandbox, and backend gameplay aligned.

## Source Of Truth

Create a shared tuning module, likely under:

- `src/shared/src/tuning/schema.ts`
- `src/shared/src/tuning/defaults.ts`
- `src/shared/src/tuning/current.json`
- `src/shared/src/tuning/load.ts`
- `src/shared/src/tuning/index.ts`

Use `current.json` as the editable persisted file.

Reasons:

- the repo already supports JSON imports via `resolveJsonModule`
- JSON is easy for the backend to write safely
- both frontend and backend can import it without codegen

Suggested high-level shape:

```json
{
  "version": 1,
  "visuals": {
    "planets": {},
    "suns": {},
    "blackHole": {},
    "rockets": {},
    "abilities": {},
    "caches": {},
    "hud": {}
  },
  "gameplay": {
    "blackHole": {},
    "rockets": {},
    "abilities": {},
    "drone": {},
    "cache": {},
    "timers": {}
  }
}
```

## Data Modeling Rules

Split tuning into two domains:

- `visuals`
  - frontend-only rendering and HUD presentation
- `gameplay`
  - shared simulation and balance values used by backend and frontend sandbox

Prefer stable identities over loose labels.

Examples:

- `visuals.planets.byArchetype.terra`
- `visuals.planets.byArchetype.ignis`
- `visuals.suns.primary`
- `visuals.rockets.light`
- `visuals.hud.weaponCard`
- `gameplay.rockets.light`
- `gameplay.blackHole`
- `gameplay.abilities.shield`

Use archetype-based planet tuning, not per-spawn-slot tuning.
That matches the current game model better than “planet #3 in the match.”

## /edit Page Layout

Create a new page, likely:

- `src/frontend/src/EditPage.tsx`

Add `/edit` to:

- `src/frontend/src/routes.ts`
- `src/frontend/src/App.tsx`

Layout:

### Left Panel

Purpose:

- object browser and selection

Groups:

- Planets
- Suns
- Black Hole
- Missiles
- Abilities
- Caches
- HUD

Each item should show:

- name
- small preview chip or thumbnail
- selected state

HUD subsection should include items such as:

- timer
- kill feed
- weapon cards
- ability cards
- player bars
- shortcut strips
- panel chrome

### Middle Panel

Purpose:

- live preview in context

Behavior:

- always show the actual in-game composition, not an isolated inspector mockup
- when editing planets, suns, missiles, black hole, abilities, or caches, center the preview on representative gameplay objects
- when editing HUD, keep the HUD visible over the scene and focus the selected HUD element

Preferred implementation:

- reuse the `createGameViewport` rendering baseline for the center panel
- introduce an editor preview mode that renders a representative frozen or looped state
- allow selection changes to focus or highlight the target object in the viewport

Avoid building a second unrelated rendering stack for `/edit`.

### Right Panel

Purpose:

- field inspector for the selected object

Behavior:

- fields are driven by typed editor schemas, not handwritten one-off JSX for every object
- show grouped inputs
- support number, color, select, toggle, and vector-like paired numeric fields where needed
- show defaults and reset actions per section

Save semantics:

- typing updates local draft state and preview immediately
- `Enter` commits the field
- blur commits the field
- save response replaces the field with the server-sanitized value
- save failures leave the draft visible and show inline error state

## Save Flow

Frontend flow:

1. Load current tuning from backend on `/edit` mount.
2. Keep local draft state for the selected fields.
3. Update preview immediately from draft state.
4. On blur or `Enter`, send a patch request for the affected path.
5. Merge the sanitized server response back into local state.

Backend flow:

1. Accept patch requests only for editor tuning routes.
2. Validate path and value against the shared tuning schema.
3. Sanitize and clamp values.
4. Persist the updated JSON file.
5. Return the accepted value and the updated revision.

Suggested endpoints:

- `GET /api/editor/tuning`
- `PATCH /api/editor/tuning`

If stronger restriction is needed than “only visible under `/edit`”, gate these endpoints to local/dev mode.

## Validation And Sanitizing

Move clamping and sanitizing logic into shared tuning code instead of keeping it only in the current viewport storage helpers.

That means:

- keep one canonical sanitizer per field
- use it in backend writes
- use it in frontend optimistic preview logic

The existing logic in `src/frontend/src/game/viewport/settings.ts` can be used as a reference when extracting these rules.

## Preview Strategy

The editor needs two preview modes inside the same middle panel:

### World Preview

Used for:

- planets
- suns
- black hole
- missiles
- abilities
- caches

Behavior:

- render a stable, representative sandbox scene
- keep objects visible at once when possible
- highlight the selected object

### HUD Preview

Used for:

- timer
- kill feed
- weapon cards
- ability cards
- bars
- shortcut rows

Behavior:

- render HUD on top of the same world preview
- use a deterministic fake game state so values are visible and repeatable
- allow clicking HUD elements in the middle panel to select them in the editor

## Migration Strategy

Do not migrate every constant at once.

Phase the work:

### Phase 1: Editor Shell

- add `/edit` route
- build 3-column page shell
- add left-side object list
- add right-side inspector shell
- add middle preview container

### Phase 2: Shared Tuning Foundation

- add tuning schema, defaults, JSON file, and sanitizers in `src/shared`
- add backend read/write editor endpoints
- load tuning into `/edit`

### Phase 3: First Migrated Knobs

Start with the highest-value items:

- planet body size
- planet aura scale and gap
- sun glow and warp scaling
- black hole timing and visual scale
- rocket ammo and reload values
- HUD timer and weapon-card presentation

### Phase 4: Runtime Integration

- refactor `createGameViewport` to consume tuning instead of hardcoded editor-only constants where appropriate
- refactor frontend sandbox to consume shared gameplay tuning
- refactor backend simulation to consume shared gameplay tuning

### Phase 5: Expand Coverage

- missile visuals
- ability visuals
- cache visuals
- additional HUD groups
- advanced balance knobs

## Refactor Targets

Likely files to touch:

- `src/frontend/src/routes.ts`
- `src/frontend/src/App.tsx`
- `src/frontend/src/EditPage.tsx`
- `src/frontend/src/styles.css`
- `src/frontend/src/game/createGameViewport.ts`
- `src/frontend/src/game/createModelShowcaseViewport.ts` or a new editor-specific preview controller
- `src/frontend/src/game/viewport/settings.ts` for migration or reduction of local-only behavior
- `src/shared/src/constants.ts`
- `src/shared/src/archetypes.ts` if some per-archetype values move into tuning
- `src/shared/src/tuning/*`
- `src/backend/src/main.ts`

Potential new frontend modules:

- `src/frontend/src/edit/editorSchema.ts`
- `src/frontend/src/edit/useTuningDraft.ts`
- `src/frontend/src/edit/EditObjectList.tsx`
- `src/frontend/src/edit/EditInspector.tsx`
- `src/frontend/src/edit/EditPreview.tsx`
- `src/frontend/src/edit/api.ts`

## Important Technical Decisions

### 1. No localStorage as source of truth

The current `viewport/settings.ts` pattern is useful for quick local tuning, but `/edit` should persist to the shared tuning file instead.

### 2. Shared gameplay values must drive backend

Anything affecting match rules or combat outcomes must come from shared tuning consumed by backend code.

Examples:

- rocket ammo
- rocket reload
- black hole spawn and ramp timing
- cache respawn
- shield, boost, foresight, drone timings

### 3. Visual-only values can stay frontend-only

Examples:

- glow scales
- aura thickness
- bloom-adjacent presentation values
- HUD spacing, sizes, colors, opacity

### 4. Preview updates should be optimistic

The middle panel should respond immediately to typing.
Persistence happens only on blur or `Enter`.

## Risks

### Hardcoded Constant Spread

`createGameViewport.ts` currently has many embedded render constants.
Not all of them should be editor-exposed.

Mitigation:

- expose only deliberate tuning values
- keep low-level renderer constants internal unless there is a real editing need

### Global Spec Mutation

Some current tuning behavior mutates shared spec objects at runtime.

Mitigation:

- move toward explicit tuning objects passed into preview and simulation code
- reduce reliance on mutable imported constants for editor flows

### Frontend/Backend Drift

Gameplay values can diverge if `/edit` only updates the frontend preview.

Mitigation:

- write through the backend
- import the same shared tuning in both runtime paths

## Definition Of Done

The feature is done when:

- `/edit` exists and is the only editor page
- left panel lists editable objects with previews
- middle panel shows live world + HUD preview
- right panel shows typed configurable fields for the selected item
- preview updates immediately while typing
- blur and `Enter` persist field changes
- changes are written to a real shared tuning file
- frontend build uses saved visual values
- backend simulation uses saved gameplay values
- HUD tuning is editable through the same editor flow
