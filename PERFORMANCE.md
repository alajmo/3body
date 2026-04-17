# 3BODY — Three.js Production Readiness Notes

This document answers a narrow question:

> Are we doing anything that production-ready Three.js game engines do not do?

Short answer: mostly no.

The rendering and runtime techniques in this repo are generally in line with serious Three.js game work. The unusual parts are mostly about packaging, abstraction boundaries, and resilience rather than the core graphics approach.

---

## 1. What Already Looks Production-Like

These choices are normal and defensible in a production Three.js game:

- Fixed-step simulation with interpolation between states.
- Instancing and pooled render paths for repeated gameplay objects.
- Adaptive render quality that adjusts both raster quality and transient FX budgets under load.
- Built-in frame profiling and runtime stats collection.
- Explicit teardown and disposal of renderer-owned resources.
- DOM-based HUD layered over the canvas instead of trying to draw all UI in Three.js.
- Visibility-aware viewport loops that stop rendering when the page or host viewport is not visible.

These are not odd experiments. They are standard good practice.

---

## 2. What Stands Out As Non-Standard

### Native WebGPU is now primary, but the compatibility surface is still version-sensitive

The shared bootstrap now creates `WebGPURenderer` with the default Three.js policy: use native WebGPU when available, and fall back to the built-in WebGL 2 backend when WebGPU is unavailable or fails to initialize.

That is the shape Three.js itself recommends, so the high-level engine boundary is no longer unusual.

What still stands out is the version pressure around it. This repo is pinned to `three@0.169.x` while also relying heavily on TSL post-processing and point-sprite/canvas-texture visuals. The architecture is now standard, but the compatibility surface still needs explicit validation.

### One very large viewport orchestrator

`src/frontend/src/game/createGameViewport.ts` currently owns:

- renderer bootstrap
- post-processing setup
- scene/material construction
- reset and reinitialization paths
- local viewport orchestration across camera, simulation, scene update, and HUD modules
- persistence of local tuning settings
- resource lifecycle and disposal

That concentration is typical in an aggressive prototype. It is much less typical in a production engine, where bootstrap, simulation, rendering, input, UI state, and tuning/state persistence are usually separated into smaller subsystems.

The current file is in a better state than it was before because the hot loop now delegates to focused viewport modules. It is still acting as the engine shell.

### Duplicated renderer/bootstrap policy across multiple viewports

There are now multiple viewport entrypoints that each repeat the same general setup pattern:

- create `WebGPURenderer`
- await `init()`
- set tone mapping and color space
- install resize listeners
- start an animation loop
- dispose everything manually on teardown

That duplication is common during prototyping. Once a codebase has multiple viewport consumers, production teams usually centralize the shared renderer/bootstrap policy so backend selection, quality caps, failure handling, and disposal rules stay consistent.

### The primary game page now runs the authoritative path

The default `/` route now mounts the authoritative `NetworkGamePage` shell instead of the local `GamePage` sandbox shell. The sandbox viewport still exists, but it is now an explicit `/sandbox` tooling route instead of the page users hit by default.

That is an important product-alignment change. The runtime users actually open is now the authoritative match path the renderer, HUD, profiling, and failure-handling work has been trying to harden. The sandbox remains useful, but it is no longer pretending to be the shipping shell.

### Failure handling is basic

Renderer initialization failure currently clears the viewport host and logs the failure.

That is acceptable as a fallback, but production-grade renderer stacks usually have a clearer strategy for:

- context or device loss
- backend fallback
- retry policy
- observability around renderer failures

This repo now keeps renderer failure handling intentionally simple: shared bootstrap code still owns backend selection, init, teardown, and centralized logging across viewport entrypoints, but the explicit recovery drills, banner UI, restart instrumentation, and context-loss retry hooks are gone. What is still missing is the broader product decision around backend validation and the remaining non-renderer error cases in the authoritative runtime.

---

## 3. Bottom Line

We are not doing strange rendering work that mature Three.js engines never do.

What is unusual right now is mostly this:

- the backend policy now matches Three.js guidance, but its native-WebGPU validation and failure story are still incomplete on `three@0.169.x`
- too many engine-bootstrap and teardown concerns are concentrated in one large viewport file
- the sandbox path is still the deeper tooling harness, so optimization effort can still drift away from the authoritative path if profiling discipline slips
- failure behavior is centralized, but intentionally minimal and not recovery-oriented

So the right conclusion is:

The graphics and runtime techniques are broadly production-valid. The current gaps are mostly in engine structure and robustness, not in whether the actual rendering approach is credible.

---

## 4. Highest-Value Refactors

If the goal is to make this feel more like a production-ready Three.js engine, the highest-value changes are:

1. Introduce a shared renderer/bootstrap layer for all viewport entrypoints.
2. Split `createGameViewport.ts` into clearer subsystems: render scene, simulation driver, input/controller state, and HUD adapter.
3. Settle the shipping backend policy and encode it explicitly in the engine boundary.
4. Promote the main game path to the authoritative networked runtime and keep the sandbox as an explicit secondary tooling shell.
5. Add a more explicit renderer failure strategy.

---

## 5. Progress Update

Current status of those refactors:

1. Shared renderer/bootstrap layer: materially landed.
   The viewport entrypoints now run through the same shared renderer session path in `viewport/rendererBootstrap.ts`, so renderer init, tone mapping, backend selection, logging, and renderer/bootstrap teardown are enforced centrally instead of being re-implemented in each viewport constructor. A shared visibility-aware animation loop controller now also pauses offscreen or hidden viewport loops instead of letting every viewport render continuously.

2. Split `createGameViewport.ts`: materially landed, not finished.
   Sandbox settings persistence, local input/controller state, HUD assembly, local camera policy, fixed-step simulation driver, and the per-frame scene/effects update flow now live in dedicated viewport modules: `viewport/sandboxSettingsStore.ts`, `viewport/localInput.ts`, `viewport/localHud.ts`, `viewport/localViewportCamera.ts`, `viewport/localSandboxSimulation.ts`, and `viewport/localViewportScene.ts`. Non-hot orchestration and setup extraction also landed materially: the render shell/bootstrap surface, scene-reset helper path, disposal helper path, bulk visual/material resource assembly, and the remaining renderer-local visual factory code now live in dedicated modules including `viewport/localViewportRenderShell.ts`, `viewport/localViewportDisposal.ts`, `viewport/localViewportVisualResources.ts`, and `viewport/localViewportVisualFactories.ts`. The viewport entrypoint is now much closer to an orchestration shell rather than a renderer implementation dump.

3. Explicit backend policy: landed.
   The shipping decision is now encoded as an explicit centralized `WebGPURenderer` policy that follows the Three.js default shape: native WebGPU first, with the built-in WebGL fallback retained when WebGPU is unavailable or cannot initialize.

4. Main game path toward authoritative runtime: landed.
   The default `/` route now opens the authoritative game shell, while the local sandbox remains available explicitly at `/sandbox` for tooling, local AI, and soak/profiling scenarios. The authoritative viewport already has comparable profiling/debug visibility, persisted performance controls, and the same last-downgrade pressure capture that exists in the sandbox HUD, and the repeatable `/network` profiling harness can keep using the compatibility alias without changing the production-facing route. There are still authoritative UX/runtime issues worth tightening, but the shipping shell is no longer pointed at the wrong runtime.

5. Renderer failure strategy: centralized, intentionally minimal.
   Renderer startup failure and render-loop failure now go through the same shared logging and teardown path across viewport entrypoints. The earlier recovery drills, banner UI, restart instrumentation, and automatic retry hooks were removed, so the remaining gap is straightforward target-browser validation plus any future decision about whether richer device-loss handling is worth reintroducing.

Practical takeaway:

- `1`, `2`, `3`, `4`, and `5` now all have meaningful implementation behind them.

---

## 6. Where The Real Performance Risk Still Lives

If frame rate becomes a problem, the first suspects are not "Three.js" or "DOM HUD". They are more specific.

### `createGameViewport.ts` is still too large, but less performance-critical than before

The local sandbox viewport is still a meaningful orchestrator, but the hottest live-path pieces are no longer trapped there. The fixed-step simulation driver, the local camera policy, the per-frame scene/effects mutation pass, the bulk visual/resource assembly, and the renderer-local visual factories now live in dedicated viewport modules.

That is a real structural improvement for performance work because the parts that most directly affect frame cost can now be measured and changed independently. The remaining issue is mostly orchestrator density and shared-policy duplication, not embedded renderer helper code. `createGameViewport.ts` still coordinates a lot of runtime state, but it no longer needs to own the material/shader factories, cache sprite drawing, planet-explosion factory assembly, or starfield construction directly.

The practical effect is important:

- camera policy can now change without touching the simulation driver
- fixed-step stepping and interpolation can now be profiled without dragging the whole scene update path with them
- scene/effects mutation can now be optimized independently of bootstrap and reset code

### The expensive path is the effects stack

The likely GPU ceiling is the combined cost of:

- SSAA and post-processing passes
- bloom and chromatic aberration
- trails, impact bursts, debris, and other transient FX
- overdraw-heavy glow, sprite, and backdrop layers

That is normal. It is what many polished Three.js games spend their frame budget on.

The important update here is that the quality ladder no longer only changes pixel ratio and SSAA. It now also scales FX budgets directly:

- rocket trails
- rocket launch bursts
- impact bursts
- debris samples
- boost burst particles
- chromatic aberration strength

So this is now a more explicitly managed risk than it was before.

### Multiple live viewports still multiply cost

Shared bootstrap policy removes duplication, but it does not change the basic runtime math: each active viewport still owns its own renderer, resize handling, scene graph, and GPU resources.

What is better now is that hidden or offscreen viewport hosts no longer keep burning a full animation loop. The shared animation-loop controller pauses rendering when the page is hidden or when a viewport is no longer intersecting the visible page.

That is perfectly acceptable for tooling, previews, or one main viewport plus occasional secondary views. The remaining production issue is specifically the case where the shipping UX expects several visible animated viewports to remain live together for long periods.

### Native WebGPU is now enabled, but backend validation is still real work

Centralizing the backend policy was the right move, and switching it back to the Three.js default path was the right follow-up. The engine now allows native WebGPU where it actually exists instead of permanently capping itself to the fallback backend.

That does not eliminate the real work. The practical consequence now is:

- some browsers and devices will still run the WebGL fallback path
- native WebGPU behavior now has to be validated on the current `three@0.169.x` stack, especially around post-processing, sprites/canvas textures, and the current log-and-teardown error path

The first real native-WebGPU validation pass is no longer hypothetical. On April 16, 2026, the route-level browser validation hook was exercised on the user’s normal browser session with `?rendererValidation=1`, and all of the primary routes initialized successfully on native WebGPU:

- `/` initialized the primary `authoritative viewport` on `backend: "webgpu"`.
- `/network` initialized the `authoritative viewport` on `backend: "webgpu"`.
- `/edit` initialized the `showcase viewport` on `backend: "webgpu"`.
- `/?page=soak&secondary=1` initialized both the `TSL viewport` and the secondary `showcase viewport` on `backend: "webgpu"`.

That closes the basic question of whether the current app routes can actually come up on native WebGPU on target hardware. The engine is no longer merely attempting WebGPU in a headless lab path; the main browser routes do initialize on native WebGPU in a real user session.

The earlier headless profiling runs are still useful because they show where the trust gap remains. Those runs localized repeated `GPUDevice.createBuffer(... mappedAtCreation=true)` failures to the older sandbox-heavy rocket visual path, while the authoritative and showcase routes were much cleaner. That means the remaining risk is no longer "does WebGPU initialize at all?" It is "are the longer-running visual and stress paths fully trustworthy on the current `three@0.169.x` stack?"

The repo now prefers a simpler failure model: if native WebGPU fails after init, the viewport tears down and logs the failure instead of attempting an automatic restart or fallback hop. That keeps the shared bootstrap easier to reason about, but it also raises the importance of validating the native path under real gameplay, post-processing, and multi-viewport pressure instead of only confirming route bring-up.

So the upside from native WebGPU is no longer deferred by policy, but it is still gated by validation and hardening work.

### Sandbox-first maturity can pull optimization effort off the final path

The sandbox viewport is still the most mature path overall. That is useful, but it also means performance effort can naturally keep flowing toward the local harness rather than the final authoritative match path.

This is less true than it was before because the authoritative viewport now has its own profiler sampling, HUD debug items, and persisted profiling toggle/reset path. The risk still exists; it is just no longer an instrumentation gap.

That is not wasted work, but it is a real prioritization risk.

---

## 7. What Is Better Than Average Already

This repo is already ahead of many game prototypes in one important way:

It can observe itself.

- `viewport/performanceProfiler.ts` breaks frame cost into simulation, interpolation, scene update, submit, and step-count buckets.
- `viewport/renderQuality.ts` now encodes a concrete raster-plus-FX quality ladder instead of a vague "high/low" toggle.
- `viewport/runtimeStats.ts` provides smoothed operator-facing FPS and frame-time reporting.
- The HUD debug surface already exposes quality level, entity counts, and active FX counts.
- The live sandbox now records the last quality downgrade with the dominant profiler bucket and active combat context, so pressure events can be captured repeatably instead of reconstructed from feel.
- `npm run profile:local-sandbox -- --duration-sec 20 --out /tmp/3body-local-sandbox-profile.json` now drives the real sandbox page in headless Chrome and captures a structured JSON report instead of relying on a one-off manual pass.
- The authoritative viewport now records the last quality downgrade with the same dominant-bucket/context surface, so the networked path can preserve pressure events instead of only showing the current aggregate sample.
- `npm run profile:authoritative-match -- --duration-sec 20 --out /tmp/3body-authoritative-profile.json` now drives the real `/network` page in headless Chrome, starts an isolated profiling frontend/backend pair on `2337` and `28380` by default, forces a fresh private room, and captures the authoritative HUD as structured JSON.
- The authoritative viewport now exposes comparable profiler/debug information instead of leaving that visibility only in the sandbox path.
- Hidden or offscreen viewports now suspend their render loops instead of consuming frame budget indefinitely in the background.
- `/?page=soak&secondary=N` now provides a repeatable multi-viewport soak page around the same sandbox HUD/profiler baseline, so the profiler can measure one gameplay viewport while additional animated viewports stay visible on the same page.

The current loopback measurements are already directionally useful:

- The latest local sandbox headless pass captured a real downgrade from `medium` to `low`, and `Submit CPU` was the dominant bucket for that pressure event.
- A fresh isolated authoritative loopback pass on `/network` now stays in clean connected combat with no overlay error, and it also points at `Submit CPU` as the dominant cost under combat load. The latest clean run captured `Last drop: 20.3s · medium -> low · 99.9 ms` with `Drop context: Submit CPU avg 136.78 · max 1947.10 · R 2 · D 0 · Deb 78 · Imp 0`.
- The multi-viewport soak page now makes the support boundary explicit instead of hypothetical. On the current headless loopback runs, the soak-layout baseline with no secondary animated viewports (`/?page=soak&secondary=0`) only reached `3f · 0.3s`, the `3`-viewport page (`/?page=soak&secondary=2`) only reached `4f · 0.4s`, the `4`-viewport page (`/?page=soak&secondary=3`) only reached `1f · 0.1s`, and the `2`-viewport page (`/?page=soak&secondary=1`) failed to keep profiler stats alive through the capture window. That is more than enough evidence to set the current supported production limit at one visible animated viewport.

That combination matters. Many Three.js projects only know they are slow after they feel slow. This repo is closer to production practice because it already has a measurement loop and a response loop.

---

## 8. A Sensible Production Performance Bar

Before chasing deeper renderer rewrites, the project should be able to say "yes" to most of these statements:

1. The primary live-match viewport holds a stable 60 Hz feel on target hardware at the default quality tier.
2. Typical gameplay stays comfortably below the sustained downgrade pressure in the current quality controller, and stronger machines can recover upward without quality thrash.
3. Worst-case combat scenes are profiled with the built-in instrumentation enabled, not judged only by feel.
4. Renderer failures tear down cleanly and log consistently instead of leaving the viewport silently half-dead.
5. If a page can host multiple active viewports, that scenario is tested explicitly rather than assumed to be fine.
6. The authoritative match viewport has comparable profiling and debug visibility, not just the sandbox viewport.

A useful detail here is that the repo already has concrete thresholds in code. The adaptive quality controller downgrades after sustained pressure around `19.5 ms` frame time and upgrades after sustained headroom around `13 ms`. That gives the team a real operational range instead of an abstract performance target.

Another useful detail is that those thresholds now move more than raster settings. They also step the FX budget up and down, which is much closer to how a production game should actually shed load.

Another useful operational detail is that both the sandbox HUD and the authoritative HUD can now keep the last downgrade event around with its dominant bucket and scene counts. That does not replace a real profiling pass on target hardware, but it does make that pass much easier to run and document consistently.

Another useful robustness detail is that renderer startup and render-loop failures now still route through one shared logging and teardown path instead of every viewport inventing its own inconsistent partial failure behavior.

The new soak page adds a similar benefit for multi-viewport load: the repo can now run that experiment on demand instead of discussing it abstractly, and the current answer is conservative but clear. One visible animated viewport is supported. Anything beyond that is explicitly outside the supported production envelope until the renderer/backend policy changes or the measured results improve materially.

---

## 9. What Does Not Need A Rewrite Yet

Nothing in the current codebase says we need to panic-rewrite the rendering stack.

We do not currently have evidence that we must:

- abandon `three/webgpu` + TSL for a lower-level custom renderer
- replace the DOM HUD with canvas-rendered UI
- remove post-processing entirely
- introduce an ECS/job-system architecture just to look more "engine-like"
- switch to raw WGSL or GLSL across the board

Those could become justified later for a specific bottleneck or feature gap. They are not justified by the current state of the repo alone.

The more disciplined next move is to extend the now-confirmed native-WebGPU bring-up on target hardware into longer-running sandbox, authoritative, and soak validation passes instead of assuming that a clean init implies a fully trustworthy runtime path.

---

## 10. Remaining Execution Checklist

These are the items that still remain after the runtime work already landed:

- [x] Split the local simulation driver, per-frame scene/effects update flow, and camera policy out of `src/frontend/src/game/createGameViewport.ts`.
- [x] Finish extracting the remaining non-hot orchestration from `src/frontend/src/game/createGameViewport.ts`, including the render-shell setup, reset/disposal flow, and bulk visual/material resource construction.
- [x] Extract the remaining renderer-local helper/build code from `src/frontend/src/game/createGameViewport.ts`, including material/shader factories, cache texture and badge generation ownership, planet-explosion helper assembly, and starfield construction.
- [x] Finish moving all viewport entrypoints onto the same shared renderer/bootstrap and failure-handling path so backend policy, logging, and teardown rules are enforced in one place.
- [x] Profile the primary live-match viewport in worst-case combat scenes with the built-in profiler enabled and record which buckets actually trigger downgrade pressure.
- [x] Run the same profiling pass on the authoritative runtime under realistic networked load so optimization effort is not guided only by the sandbox path.
- [x] Centralize renderer startup and render-loop failure handling so broken viewports tear down cleanly and log consistently instead of each entrypoint inventing its own partial error path.
- [x] Soak-test the "multiple visible animated viewports" case and define an explicit supported production limit instead of assuming that all combinations are acceptable.
- [x] Decide whether the next shipping backend remains the explicit WebGL fallback on `three@0.169.x` or whether restoring native WebGPU support is now worth the compatibility work.
- [ ] Finish the longer-running native-WebGPU validation pass on target browsers and hardware now that route bring-up is confirmed, with attention to post-processing, sprite/canvas-texture behavior, the sandbox rocket path under real native WebGPU load, and whether a richer native device-loss strategy is actually worth reintroducing beyond the current log-and-teardown model.
- [x] Promote the authoritative path to the primary game shell while retaining the local sandbox as an explicit secondary route for tooling, profiling, and soak scenarios.
