# Unify `/sandbox` and `/` Rendering

## Goal

Ship one combat rendering stack.

`/sandbox` is the canonical visual baseline. It already has the post-processing,
HUD treatment, denser VFX stack, and overall presentation we want. The root
route should stop being a separate renderer and instead become a different
runtime feeding the same renderer.

The desired split is:

```text
one renderer
  + one scene/resource graph
  + one post-processing/display-mode pipeline
  + one HUD styling/model
  + one transient VFX/event system
  + one frame-state -> scene sync path

fed by two runtime sources
  + local sandbox runtime
  + authoritative network runtime
```

What changes between modes should be the world/state source and authority model,
not the rendering implementation.

## Why This Exists

The frontend currently diverges below the route layer:

```text
/sandbox
  -> GamePage
  -> GameViewportPanel
  -> createGameViewport()
  -> local sandbox simulation
  -> localViewportScene
  -> localViewportRenderShell
  -> richer local combat VFX stack

/
  -> NetworkGamePage
  -> AuthoritativeGamePanel
  -> createAuthoritativeViewport()
  -> snapshot/event interpolation
  -> separate scene setup/render loop
  -> direct renderer.render(...)
```

That split has real visual consequences:

- `/sandbox` owns the display-mode/post-processing pipeline.
- `/sandbox` owns the denser rocket/debris/boost/trail/effects path.
- `/` recreates many scene concerns separately.
- `/` has its own immediate-feedback logic instead of feeding the same local
  VFX/event path.
- HUD styling is partially shared through `CombatHud`, but route-specific
  wiring still diverges.

As long as these remain separate viewport implementations, visual parity will
keep drifting.

## Non-Goals

- Do not make the networked client locally authoritative.
- Do not remove interpolation, snapshot buffering, ACKs, or other networking
  correctness work from the root route.
- Do not force offline sandbox behavior to exactly match network latency.
- Do not rewrite the backend protocol as part of the first pass.
- Do not big-bang replace both viewports in one patch.

## Hard Requirements

These are the invariants the refactor should preserve.

1. `/sandbox` remains visually correct throughout the migration.
2. `/` remains server-authoritative.
3. The shared renderer must support both:
   - locally simulated world state
   - interpolated authoritative world state
4. Display mode and post-processing must come from the shared render shell in
   both modes.
5. Immediate local presentation feedback is allowed in networked mode, but it
   must remain cosmetic unless the authoritative runtime explicitly owns the
   change.
6. Renderer teardown must stay idempotent and keep using the managed viewport
   session/bootstrap patterns already in the repo.

## Target Architecture

### 1. Runtime and Renderer Become Separate Layers

Introduce a deliberate split:

```text
ViewportRuntimeAdapter
  -> produces a normalized ViewportFrameState
  -> owns mode-specific authority and timing logic

SharedCombatViewport
  -> consumes ViewportFrameState
  -> updates scene/resources/post-processing/HUD
```

The runtime layer decides:

- where world state comes from
- whether fixed-step simulation runs locally
- how snapshots are buffered/interpolated
- when local-only cosmetic feedback should appear
- what HUD/controller capabilities are enabled

The renderer layer decides:

- how suns, planets, rockets, caches, black holes, trails, and debris look
- how transient boosts, impacts, explosions, swallow effects, and shield
  visuals look
- how backgrounds, bloom, VHS mode, chromatic aberration, and camera effects
  render
- how the HUD display mode and minimap presentation look

### 2. Shared `ViewportFrameState`

Define a normalized frame-state shape that the renderer can consume no matter
where the data came from.

At minimum it should include:

- camera target / framing inputs
- arena/world metadata
- renderable entities:
  - suns
  - neutron stars
  - planets
  - rockets
  - caches
  - black hole
- transient visual events:
  - rocket launch burst
  - impact burst
  - boost burst/wake
  - gravity pulse
  - shield raise/hit feedback
  - planet explosion
  - black hole swallow
  - boundary debris events
- player-centric presentation state:
  - aim
  - selected weapon
  - lock target
  - hit flash / HUD flicker / camera shake
- HUD model
- profiler/debug state
- route/mode flags:
  - controls enabled
  - local vs authoritative
  - profiling allowed
  - sandbox playback controls available

The shared renderer should not care whether a rocket came from:

- `CombatSandboxState`
- an interpolated authoritative `World`
- a short-lived local cosmetic ghost

It should only care that the frame-state says a rocket visual exists with the
needed transform, appearance, and lifetime.

### 3. Shared Combat Viewport

Promote the sandbox renderer stack into the canonical shared combat viewport.

The likely long-term home is a new module set alongside the existing viewport
helpers, for example:

- `src/frontend/src/game/viewport/sharedCombatViewport.ts`
- `src/frontend/src/game/viewport/sharedCombatScene.ts`
- `src/frontend/src/game/viewport/sharedCombatFrameState.ts`
- `src/frontend/src/game/viewport/sharedCombatEvents.ts`

The shared combat viewport should absorb and standardize:

- `localViewportRenderShell.ts`
- `localViewportVisualResources.ts`
- the reusable portions of `localViewportScene.ts`
- display mode/post-processing usage from `createGameViewport.ts`
- the common HUD wiring around `CombatHud`

The naming does not need to be exactly this, but the architecture should make
it obvious that there is one combat renderer and multiple runtimes.

## Recommended Migration Strategy

Use a staged migration. The order matters.

## Current Status (April 22, 2026)

This section is the working handoff status for the refactor. The architecture
above is still the target. The notes below describe what has already landed,
what is only partially complete, and what the next useful seam is.

### What is done

- The authoritative route now uses the same display-mode/post-processing render
  shell direction as sandbox. The original "authoritative route has no display
  mode" gap is no longer the main blocker.
- Shared renderer-side helpers now cover a meaningful portion of the combat
  presentation stack, including:
  - background parallax
  - cannon presentation
  - sun / neutron star / planet visual modules
  - planet trail visuals
  - dynamic celestial add/remove/special-case sync
  - shared entity/presentation/transient frame sync wrappers
  - authoritative cosmetic/event translation for hits, boosts, black-hole
    swallows, immediate fire, shield feedback, and gravity pulse feedback
- The local sandbox path has already been moved further toward shared visual
  modules, especially around celestial visuals and frame sync orchestration.
- Authoritative-only cosmetic feedback is now more clearly isolated as runtime
  adapter behavior instead of being mixed directly into renderer-specific code.
- The last dense authoritative aim/lock/input-throttling decision block has
  been extracted into `viewport/authoritativeViewportBehavior.ts`, so
  `createAuthoritativeViewport()` is no longer the owner of that control seam.
- An explicit shared `ViewportFrameState` contract now exists at the shared
  frame-sync boundary, and both local and authoritative paths emit that
  contract before renderer-owned sync resources are applied.
- Local and authoritative frame/bundle shaping now live in dedicated runtime
  adapter modules:
  - `viewport/localViewportFrameAdapter.ts`
  - `viewport/authoritativeViewportFrameAdapter.ts`
- Both local and authoritative routes now update background parallax, dynamic
  celestial visuals, and the shared viewport frame through the same explicit
  scene-sync layer:
  - `viewport/sharedCombatSceneSync.ts`
- The authoritative route scene-update path is now extracted into
  `viewport/authoritativeViewportScene.ts`, so
  `createAuthoritativeViewport()` no longer owns the dense shared-scene bundle
  assembly inline.
- The local sandbox route scene-update bundle is now extracted into
  `viewport/localViewportCombatScene.ts`, so `localViewportScene.ts` no longer
  owns the dense weapon-frame + shared-scene bundle assembly inline.

### What is partially done

- Shared scene/resource bootstrap extraction is still incomplete. Both routes
  still allocate renderer-owned resources, capability wiring, and too much
  lifecycle orchestration directly inside `createGameViewport()` /
  `createAuthoritativeViewport()`.
- Shared scene sync now exists, but the route-specific scene modules still own
  the last large argument-bundle assembly that feeds
  `sharedCombatSceneSync.ts`; there is not yet one shared combat viewport
  owner above them.
- Transient event unification is meaningfully better, but local and
  authoritative runtimes still feed shared VFX/event systems through
  different route-shaped plumbing instead of one normalized event adapter
  boundary.
- Renderer-owned sync resources are now split from the shared frame-state and
  assembled through dedicated runtime adapter modules, but lower-level
  entity/transient sync helpers still internally consume merged args.

### What is still missing

- One shared combat viewport layer that:
  - owns shared scene/resource bootstrap
  - accepts runtime adapter output
  - drives `sharedCombatSceneSync.ts`
  - wires shared render-shell/HUD-facing concerns in one place
- Thin viewport entry points:
  - `createGameViewport()` should become local runtime bootstrap + lifecycle
    glue
  - `createAuthoritativeViewport()` should become authoritative runtime
    bootstrap + lifecycle glue
- Final simplification of the route-specific scene modules so they become thin
  runtime shims or disappear entirely behind one shared combat viewport API.

### Current Best Next Step

Do not keep extracting isolated helpers below the new seams.

The next useful move is:

1. Introduce a real shared combat viewport owner around
   `sharedCombatSceneSync.ts` and move shared scene/resource bootstrap into it.
2. Convert `localViewportCombatScene.ts` and
   `authoritativeViewportScene.ts` from route-owned bundle assemblers into
   thin adapters that provide runtime-specific inputs to that shared owner.
3. Reduce `createGameViewport()` and `createAuthoritativeViewport()` to
   runtime bootstrap, capability wiring, and teardown.
4. Once that owner exists, simplify the remaining merged-arg
   entity/transient sync helpers and normalize the event adapter boundary.

The explicit `ViewportFrameState` seam, the dedicated runtime adapter modules,
and the shared scene-sync layer now exist. The remaining work is ownership
consolidation: shared bootstrap, shared scene-update ownership, and thinner
route wrappers.

## Phase 0: Freeze the Direction

Before code movement:

- treat `/sandbox` as the visual source of truth
- treat `createAuthoritativeViewport()` as temporary runtime-specific glue
- reject new route-specific visual features in `/` unless they are immediately
  extracted toward the shared path

This prevents the gap from widening during the refactor.

## Phase 1: Quick Visual Parity Wins

Get the obvious mismatches out of the way first.

### Deliverables

- Root route uses the same display-mode selection as sandbox.
- Root route uses the same post-processing/display pipeline as sandbox.
- Root route passes the same HUD display mode styling into `CombatHud`.

### Likely changes

- Thread `visuals.displayMode` through `AuthoritativeGamePanel`.
- Replace the root route's direct final render with the shared render shell
  based on `localViewportRenderShell.ts`.
- Remove any remaining "authoritative route has no display mode" assumptions.

### Why do this first

It shrinks the visible mismatch quickly without yet touching the deeper scene
sync logic.

## Phase 2: Extract Shared Scene/Resource Initialization

Move scene bootstrap out of `createGameViewport()` and
`createAuthoritativeViewport()` into a shared initializer.

### Shared concerns to extract

- scene creation
- backdrop/background layers
- black hole meshes/materials
- shield visuals
- cache sprite assets
- reusable geometries/materials
- rocket pool setup where possible
- impact burst pools
- planet explosion pools
- black hole swallow pools
- boundary debris visuals

### Result

Both routes should be able to do:

```text
create runtime adapter
create shared combat viewport
run frame loop
```

instead of each route manually re-creating scene resources.

## Phase 3: Define the Shared Frame-State Contract

This is the real architectural pivot.

Introduce a stable frame-state contract and adapt both paths to produce it.

### Local sandbox adapter

The local sandbox adapter should:

- keep fixed-step simulation in `localSandboxSimulation.ts`
- keep local input handling and pause/reset controls
- translate sandbox state and sandbox-local transient effects into
  `ViewportFrameState`

### Authoritative adapter

The authoritative adapter should:

- keep snapshot buffering and ACK flow
- keep interpolation and capped local prediction
- keep input dispatch to the server
- translate authoritative world snapshots and protocol events into
  `ViewportFrameState`

### Important rule

Do not make the shared renderer understand both sandbox-specific and
authoritative-specific data structures directly. That just re-creates the split
one level deeper.

## Phase 4: Reuse the Sandbox Scene Sync Path

Move the body of `localViewportScene.ts` toward a mode-agnostic scene sync.

The end state should be:

```text
shared scene sync
  <- normalized frame-state
  -> updates meshes, instancing pools, trails, bursts, debris, shield visuals,
     black hole effects, camera effects, and post-processing parameters
```

### Concrete target

The authoritative route should stop owning bespoke versions of:

- rocket visual spawning/update
- black hole presentation logic
- shield presentation wiring
- impact burst presentation wiring
- boost visual feedback wiring
- cache visual updates
- per-entity scene add/remove logic

Instead, it should translate authoritative state/events into the same renderer
inputs the sandbox path already uses.

## Phase 5: Unify Transient Events

This is the part most likely to bite if skipped.

The sandbox renderer looks better not only because of static materials, but
because it has a richer event model. The authoritative path must be able to
feed the same transient VFX system.

### Shared transient events should cover

- rocket fired
- rocket impact
- shield raised
- shield absorbed hit
- boost cast / held boost feedback
- gravity pulse cast
- cache pickup
- planet death / explosion
- black hole swallow
- boundary debris interaction

### Data sources by mode

Local sandbox:

- runtime can emit these directly from simulation steps

Authoritative:

- runtime should derive them from protocol events, snapshot diffs, or
  local-owner cosmetic intent where allowed

If this phase is done well, the authoritative route can inherit the sandbox's
visual language instead of approximating it in a separate code path.

## Phase 6: Collapse Route-Specific Viewport Entry Points

After both modes use the same renderer, simplify the top-level API.

### Desired end state

- `createGameViewport()` becomes a thin local-runtime entry point around the
  shared combat viewport.
- `createAuthoritativeViewport()` becomes a thin authoritative-runtime entry
  point around the shared combat viewport.

Potentially later:

- replace both with one `createCombatViewport({ runtime })` entry point

At that point the route split is legitimate again, because the split is only at
the runtime adapter layer.

## Proposed Module Ownership

This is the recommended line between shared and mode-specific code.

### Shared renderer-side modules

- render shell / post-processing / display mode
- scene bootstrap / resource pools / material factories
- scene sync from normalized frame-state
- shared combat HUD view model shaping where possible
- shared minimap projection/presentation helpers
- shared camera shake and presentation-only screen effects

### Local sandbox-specific modules

- fixed-step local simulation
- sandbox pause/reset/profiler controls
- local-only settings store and observer-mode rules
- sandbox-specific controller affordances

### Authoritative-specific modules

- socket/session handling
- snapshot ACK flow
- full/delta snapshot application
- interpolation buffer
- capped local-player prediction
- conversion from protocol events/snapshots into transient render events

## File-Level Starting Point

These are the files that should anchor the first refactor passes.

### Keep and promote

- `src/frontend/src/game/viewport/localViewportRenderShell.ts`
- `src/frontend/src/game/viewport/localViewportVisualResources.ts`
- `src/frontend/src/game/viewport/localViewportScene.ts`
- `src/frontend/src/game/showcaseDisplayMode.ts`
- `src/frontend/src/CombatHud.tsx`

### Keep but narrow to runtime concerns

- `src/frontend/src/game/createGameViewport.ts`
- `src/frontend/src/game/createAuthoritativeViewport.ts`
- `src/frontend/src/AuthoritativeGamePanel.tsx`
- `src/frontend/src/game/viewport/localSandboxSimulation.ts`
- `src/frontend/src/game/viewport/authoritativeInterpolation.ts`
- `src/frontend/src/game/viewport/authoritativeLocalPlayerPrediction.ts`
- `src/frontend/src/game/viewport/authoritativeHud.ts`
- `src/frontend/src/game/viewport/localHud.ts`

### Likely new glue modules

- shared frame-state types
- runtime adapter interfaces
- authoritative event-to-VFX translator
- sandbox event-to-VFX translator
- shared viewport controller capability model

## Risks

## Risk 1: Fake Unification

It is easy to move code into common files while still keeping two separate data
paths and two separate scene sync implementations.

Avoid this by making the frame-state contract explicit and narrow.

## Risk 2: Overfitting to Sandbox Internals

The sandbox renderer is the correct presentation source of truth, but its raw
simulation data structures are not automatically the right shared interface.

Avoid this by normalizing into shared render data rather than passing
`CombatSandboxState` directly into the shared renderer.

## Risk 3: Authoritative Route Loses Responsiveness

If the refactor removes immediate cosmetic feedback while waiting for server
events, the root route will feel worse even if it looks prettier.

Keep owner-local cosmetic feedback as part of the authoritative adapter.

## Risk 4: Performance Regressions

The sandbox path uses instancing/pools in places where the authoritative path
still does more ad hoc object creation.

Unification should move the authoritative route toward pooled resources, not the
other way around.

## Risk 5: Controller/HUD Capability Creep

Sandbox has pause/reset and local tuning controls that should not leak into the
live match route.

The shared HUD should be driven by capability flags, not route checks sprinkled
through rendering code.

## Milestones

The work is in a good place when these are true.

### Milestone A

- `/` uses the same display mode and post-processing path as `/sandbox`.

Status on April 22, 2026: effectively done.

### Milestone B

- `/` and `/sandbox` allocate scene resources through the same shared bootstrap.

Status on April 22, 2026: partially done. The shared scene-update seam exists,
but scene/resource bootstrap is still not owned by one shared viewport.

### Milestone C

- both routes produce the same normalized frame-state shape.

Status on April 22, 2026: effectively done. The shared contract exists and both
routes emit it through dedicated runtime adapter modules.

### Milestone D

- both routes update the scene through the same sync function.

Status on April 22, 2026: effectively done. Both routes now flow through
`sharedCombatSceneSync.ts`, although the higher-level viewport ownership is
still split.

### Milestone E

- `createGameViewport()` and `createAuthoritativeViewport()` are thin wrappers
  around one shared combat viewport.

Status on April 22, 2026: partially done. The biggest control and scene seams
are extracted, but the route entry points are not yet thin wrappers around one
shared viewport.

## Validation

Run the narrowest useful checks at each stage, then broaden.

Minimum validation for renderer unification work:

- `npm run typecheck`
- `npm run test:frontend`

Targeted runtime checks after each milestone:

- `/sandbox` still shows the full current VFX stack
- `/` now matches sandbox display mode and post-processing
- local fire / shield / boost / gravity pulse feedback still appears instantly
  where intended
- authoritative interpolation remains smooth under dropped/late snapshots
- teardown remains clean across route changes and remounts

Useful profiling checks:

- `npm run profile:local-sandbox`
- `npm run profile:authoritative-match`

Latest validation on April 22, 2026: `npm run typecheck` and
`npm run test:frontend` both passed after the shared scene-sync and
route-scene extraction work.

## Recommended Next Patch

Do not go back to display-mode parity work. That part is already landed.

Start with the next ownership move:

1. Introduce a real shared combat viewport owner that combines shared
   scene/resource bootstrap with `sharedCombatSceneSync.ts`.
2. Have `localViewportCombatScene.ts` and
   `authoritativeViewportScene.ts` provide runtime-specific state/callbacks to
   that shared owner instead of assembling route-owned sync bundles.
3. Delete duplicated bootstrap/orchestration from `createGameViewport()` and
   `createAuthoritativeViewport()` as the shared owner takes over.

That keeps the next patch on the real remaining problem: shared ownership, not
another round of route-specific cleanup.
