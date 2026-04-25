# Frontend Architecture

This is the current route-to-viewport split in the frontend shell.

```text
browser URL
   |
   v
App.tsx
   |
   +--> "/" -----------------------> PlayMenuPage
   |
   +--> "/online" ------------------> NetworkGamePage
   |                                 |
   |                                 v
   |                           AuthoritativeGamePanel
   |                                 |
   |                                 v
   |                       createAuthoritativeViewport()
   |
   +--> "/offline" -----------------> GamePage
   |                                 |
   |                                 v
   |                           GameViewportPanel
   |                                 |
   |                                 v
   |                           createGameViewport()
   |                                 |
   |                                 +--> local sandbox simulation
   |                                 +--> localViewportScene per-frame FX
   |                                 +--> rocketPools / rocketLaunchBurstPools
   |                                 +--> older local rocket/effects path
   |
   +--> "/edit" --------------------> EditPage
   |                                 |
   |                                 v
   |                         editor preview panels
   |                                 |
   |                                 +--> createModelShowcaseViewport()
   |                                 +--> createEditorItemPreviewViewport()
```

## Why `/offline` Still Matters

`/offline` is the route that exercises the local-simulation renderer baseline in `createGameViewport()`. `/online` runs the authoritative network runtime instead.

That path still owns the denser local combat VFX stack:

- local simulation state seeded by `createSandboxState(...)`
- per-frame local combat scene updates in `localViewportScene.ts`
- rocket instancing pools in `localViewportVisualResources.ts`
- launch-burst, flame, trail, debris, boost-burst, and other local-only effects

In practice, `/offline` is the route you use when you want to validate or stress:

- the older local rocket/effects rendering path
- sandbox HUD/profiler behavior
- local combat visual load without the authoritative network runtime

One important detail: `/offline` starts with bots disabled by default. Simply opening the route verifies bring-up, but it does not fully exercise the rocket-heavy path until bots are enabled or active combat is created manually.
