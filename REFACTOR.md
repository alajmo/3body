# Refactor Backlog

This backlog has been cleared on the current tree. The previous high-value
frontend refactor pass is now landed and validated.

## Current Baseline

- `npm run typecheck` is green.
- `npm run test:frontend` is green.
- Authoritative viewport interpolation now reuses cached render-world state
  instead of rebuilding broad per-frame `Map` and entity allocations.
- Sandbox interpolation and local simulation state now avoid the previous
  cloning-heavy hot path.
- Viewport session lifecycle is centralized behind
  `createManagedViewportSession()` across the viewport entry points.
- Local foresight-body occlusion no longer uses repeated linear `.find()`
  lookups in the render path.
- The largest frontend files now have dedicated helper modules for:
  - sandbox interpolation
  - authoritative trail visuals
  - local viewport foresight helpers
  - shared edit inspector field controls

## Completed In This Pass

1. Removed per-frame authoritative interpolation allocations in
   `src/frontend/src/game/createAuthoritativeViewport.ts` by moving
   interpolation/state-reuse logic into
   `src/frontend/src/game/viewport/authoritativeInterpolation.ts`.

2. Reduced sandbox simulation cloning in
   `src/frontend/src/game/combatSandbox.ts` and the renderer-facing sandbox
   interpolation path, with the interpolation helpers now split into
   `src/frontend/src/game/combatSandboxInterpolation.ts`.

3. Finished the shared viewport shell extraction for the duplicated renderer
   session lifecycle (`startViewport`, invalidation, failure reporting, teardown)
   through `src/frontend/src/game/viewport/managedViewportSession.ts`.

4. Split the previously largest frontend files by domain using focused helper
   modules rather than leaving those concerns embedded in the parent files.

5. Replaced the remaining local viewport hot-path linear entity lookups in the
   foresight occlusion flow with cached lookup maps.

## Next Use

If more refactor work is needed, add new items here based on fresh profiling or
maintainability pain rather than continuing the already-completed list above.
