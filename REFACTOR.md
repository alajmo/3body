# Refactor Backlog

This document captures the next high-value refactor and performance tasks for
the codebase, ordered by likely payoff.

## Priority Order

1. Fix the existing typecheck failures first.

   Files currently failing:

   - `src/frontend/src/EditPage.tsx`
   - `src/frontend/src/game/showcaseVisuals.ts`

   Reason:

   - Further refactoring on top of a red `npm run typecheck` baseline slows down
     verification and makes regressions harder to isolate.

2. Remove per-frame interpolation allocations in the authoritative viewport.

   File:

   - `src/frontend/src/game/createAuthoritativeViewport.ts`

   Problem:

   - The render loop rebuilds multiple `Map` instances and interpolated entity
     arrays every frame.

   Why this matters:

   - This is the strongest remaining frontend performance target.
   - It should reduce garbage pressure and frame-time spikes without changing
     gameplay behavior.

3. Reduce sandbox simulation cloning.

   File:

   - `src/frontend/src/game/combatSandbox.ts`

   Problem:

   - The local simulation clones bots, planets, rockets, drones, and caches on
     each step.

   Why this matters:

   - This is allocation-heavy.
   - It matters if `/sandbox` remains the renderer stress and profiling route.

4. Replace repeated linear entity lookups in hot visual paths.

   File:

   - `src/frontend/src/game/viewport/localViewportScene.ts`

   Problem:

   - Some update paths still use repeated `.find()` lookups for entities.

   Why this matters:

   - Each lookup is small on its own, but the cost compounds in per-frame
     rendering code.

5. Finish viewport shell extraction.

   Scope:

   - Shared viewport constructor lifecycle across the various
     `create*Viewport.ts` files.

   Problem:

   - The start/session-token/error/teardown flow is still duplicated across
     viewport entry points.

   Why this matters:

   - A shared `createManagedViewport`-style helper would remove more boilerplate
     and reduce lifecycle drift between viewports.

   Note:

   - Hold off on folding in `createSunInteractionViewport.ts` until its current
     in-progress edits are stable.

6. Split the largest files by domain.

   Files:

   - `src/frontend/src/EditPage.tsx`
   - `src/frontend/src/game/combatSandbox.ts`
   - `src/frontend/src/game/viewport/localViewportScene.ts`

   Why this matters:

   - This is mostly a maintainability and duplication-control task rather than a
     direct frame-rate optimization.
   - Large files increase the chance of logic drift and make safe iteration
     slower.

## Recommended Next Move

If continuing immediately, start with the authoritative interpolation path in
`src/frontend/src/game/createAuthoritativeViewport.ts`.

Reason:

- It has the best chance of improving frame time and reducing garbage
  generation.
- It is more likely to produce a measurable performance win than cosmetic
  structural cleanup.
