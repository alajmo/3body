# Refactor Backlog

This document captures the current high-value refactor and performance tasks for
the codebase, ordered by likely payoff on the current tree.

## Current Baseline

- `npm run typecheck` is green.
- Shared renderer/bootstrap policy is already centralized.
- Shared visibility-aware animation-loop control is already centralized.
- The remaining work is now mostly about hot-path allocations, duplicated
  viewport shell lifecycle code, and very large files.

## Priority Order

1. Remove per-frame interpolation allocations in the authoritative viewport.

   File:

   - `src/frontend/src/game/createAuthoritativeViewport.ts`

   Problem:

   - The render loop still rebuilds multiple `Map` instances and interpolated
     entity arrays every frame.

   Why this matters:

   - This is still the strongest remaining frontend performance target.
   - It should reduce garbage pressure and frame-time spikes without changing
     gameplay behavior.

2. Reduce sandbox simulation cloning.

   File:

   - `src/frontend/src/game/combatSandbox.ts`

   Problem:

   - The local simulation still clones controller state, bots, planets,
     rockets, caches, and related transient data on each step.
   - The interpolated sandbox-state helper also performs broad cloning for the
     renderer-facing state.

   Why this matters:

   - This is still allocation-heavy.
   - It matters if `/sandbox` remains the renderer stress and profiling route.

3. Finish viewport shell extraction.

   Scope:

   - Shared viewport constructor lifecycle across the various
     `create*Viewport.ts` files.

   Current reality:

   - Shared renderer/bootstrap and shared animation-loop control have already
     landed.
   - The remaining `rendererSessionToken` / `startViewport` /
     error-reporting / teardown flow is still duplicated across viewport entry
     points.

   Why this matters:

   - A shared `createManagedViewport`-style helper would remove more boilerplate
     and reduce lifecycle drift between viewports.

4. Split the largest files by domain.

   Files:

   - `src/frontend/src/EditPage.tsx`
   - `src/frontend/src/game/combatSandbox.ts`
   - `src/frontend/src/game/viewport/localViewportScene.ts`
   - `src/frontend/src/game/createAuthoritativeViewport.ts`

   Why this matters:

   - This is mostly a maintainability and duplication-control task rather than a
     direct frame-rate optimization.
   - Large files increase the chance of logic drift and make safe iteration
     slower.

5. Replace the remaining linear entity lookups in local viewport hot paths.

   File:

   - `src/frontend/src/game/viewport/localViewportScene.ts`

   Current reality:

   - This is now narrower than it used to be.
   - The remaining repeated `.find()` lookups appear to be concentrated in the
     foresight-body occlusion path rather than spread broadly across the scene
     update code.

   Why this matters:

   - Each lookup is small on its own, but the cost still compounds in per-frame
     rendering code.
   - This is a cleanup/perf pass, but it is lower priority than the
     authoritative interpolation and sandbox cloning work.

## Recommended Next Move

If continuing immediately, start with the authoritative interpolation path in
`src/frontend/src/game/createAuthoritativeViewport.ts`.

Reason:

- It still has the best chance of improving frame time and reducing garbage
  generation.
- It is more likely to produce a measurable performance win than structural
  cleanup alone.
- The typecheck baseline is already green, so there is no longer a blocked
  prerequisite ahead of it.
