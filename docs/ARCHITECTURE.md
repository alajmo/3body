# Frontend Architecture

This is the current route-to-viewport split in the frontend shell.

```text
browser URL
   |
   v
App.tsx
   |
   +--> "/" -----------------------> NetworkGamePage
   |                                 |
   |                                 v
   |                           AuthoritativeGamePanel
   |                                 |
   |                                 v
   |                       createAuthoritativeViewport()
   |
   +--> "/network" -----------------> NetworkGamePage
   |                                 |
   |                                 v
   |                           AuthoritativeGamePanel
   |                                 |
   |                                 v
   |                       createAuthoritativeViewport()
   |
   +--> "/sandbox" -----------------> GamePage
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
   |
   +--> "/?page=soak" --------------> ViewportSoakPage
                                     |
                                     +--> primary: GameViewportPanel
                                     |              |
                                     |              v
                                     |        createGameViewport()
                                     |
                                     +--> secondary: showcase panels
                                     |                |
                                     |                v
                                     |        createModelShowcaseViewport()
                                     |
                                     +--> secondary: sun panel
                                                      |
                                                      v
                                            createSunInteractionViewport()
```

## Why `/sandbox` Still Matters

`/sandbox` is not the shipping primary shell anymore. `/` and `/network` now use the authoritative runtime. But `/sandbox` still matters because it is the route that exercises the local-simulation renderer baseline in `createGameViewport()`.

That path still owns the denser local combat VFX stack:

- local simulation state seeded by `createSandboxState(...)`
- per-frame local combat scene updates in `localViewportScene.ts`
- rocket instancing pools in `localViewportVisualResources.ts`
- launch-burst, flame, trail, debris, boost-burst, and other local-only effects

In practice, `/sandbox` is the route you use when you want to validate or stress:

- the older local rocket/effects rendering path
- sandbox HUD/profiler behavior
- local combat visual load without the authoritative network runtime

One important detail: `/sandbox` starts with bots disabled by default. Simply opening the route verifies bring-up, but it does not fully exercise the rocket-heavy path until bots are enabled or active combat is created manually.
