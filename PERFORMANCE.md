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
- Adaptive render quality that adjusts pixel ratio and SSAA level under load.
- Built-in frame profiling and runtime stats collection.
- Explicit teardown and disposal of renderer-owned resources.
- DOM-based HUD layered over the canvas instead of trying to draw all UI in Three.js.

These are not odd experiments. They are standard good practice.

---

## 2. What Stands Out As Non-Standard

### `WebGPURenderer` forced onto the WebGL backend

The main viewport and the other preview viewports all create `WebGPURenderer` with `forceWebGL: true`.

That is a pragmatic compatibility choice on `three@0.169.x`, especially if native WebGPU currently breaks required point-sprite or SSAA/depth paths. But it is not the shape most mature engines want long-term.

Production code usually does one of these instead:

- use `WebGLRenderer` directly when the shipping backend is WebGL
- or hide backend selection behind a cleaner renderer/bootstrap abstraction

What we have now is reasonable for the current version constraints, but it reads as a transitional setup rather than a final engine boundary.

### One very large viewport orchestrator

`src/frontend/src/game/createGameViewport.ts` currently owns:

- renderer bootstrap
- post-processing setup
- camera control
- input handling
- local sandbox stepping
- HUD emission
- persistence of local tuning settings
- resource lifecycle and disposal

That concentration is typical in an aggressive prototype. It is much less typical in a production engine, where simulation, rendering, input, UI state, and tuning/state persistence are usually separated into smaller subsystems.

The current file is powerful, but it is also acting as the engine shell.

### Duplicated renderer/bootstrap policy across multiple viewports

There are now multiple viewport entrypoints that each repeat the same general setup pattern:

- create `WebGPURenderer`
- await `init()`
- set tone mapping and color space
- install resize listeners
- start an animation loop
- dispose everything manually on teardown

That duplication is common during prototyping. Once a codebase has multiple viewport consumers, production teams usually centralize the shared renderer/bootstrap policy so backend selection, quality caps, failure handling, and disposal rules stay consistent.

### The live game page still runs the local sandbox path

The main `GamePage` mounts `GameViewportPanel`, and the viewport HUD still identifies the session as `"Local sandbox"` or `"Periodic solution viewer"`.

That means the current runtime is still closer to a polished sandbox/editor loop than a production multiplayer game runtime. The underlying code can still be strong, but the architecture is not yet shaped around the final authoritative networked path.

### Failure handling is basic

Renderer initialization failure currently degrades to a visible `"Renderer initialization failed."` message.

That is acceptable as a fallback, but production-grade renderer stacks usually have a clearer strategy for:

- context or device loss
- backend fallback
- retry policy
- observability around renderer failures

This repo currently has solid disposal discipline, but not yet a fully hardened renderer recovery story.

---

## 3. Bottom Line

We are not doing strange rendering work that mature Three.js engines never do.

What is unusual right now is mostly this:

- the backend choice is wrapped in a transitional `WebGPURenderer` + forced WebGL setup
- too many engine concerns are concentrated in one large viewport file
- shared viewport bootstrap is duplicated across multiple entrypoints
- the shipping game path still looks like a local sandbox/runtime harness
- failure and recovery behavior is not yet production-hardened

So the right conclusion is:

The graphics and runtime techniques are broadly production-valid. The current gaps are mostly in engine structure and robustness, not in whether the actual rendering approach is credible.

---

## 4. Highest-Value Refactors

If the goal is to make this feel more like a production-ready Three.js engine, the highest-value changes are:

1. Introduce a shared renderer/bootstrap layer for all viewport entrypoints.
2. Split `createGameViewport.ts` into clearer subsystems: render scene, simulation driver, input/controller state, and HUD adapter.
3. Decide whether the shipping backend is truly WebGL-for-now or whether native WebGPU support needs to be restored; encode that decision explicitly in the engine boundary.
4. Move the main game path toward the authoritative networked runtime instead of keeping the sandbox as the primary shell.
5. Add a more explicit renderer failure and recovery strategy.

---

## 5. Progress Update

Current status of those refactors:

1. Shared renderer/bootstrap layer: partially landed.
   A shared viewport bootstrap module now exists and the viewport entrypoints are being moved onto it so renderer init, tone mapping, backend selection, and failure UI stop being repeated inline.

2. Split `createGameViewport.ts`: partially landed.
   Sandbox settings persistence, local input/controller state, and HUD assembly have already been extracted into dedicated modules. The file is still too large because the local simulation driver and render-scene update loop are still concentrated there.

3. Explicit backend policy: materially improved.
   The shipping decision is now encoded as an explicit centralized `WebGPURenderer`-with-WebGL-fallback policy instead of hidden `forceWebGL: true` flags scattered across viewport files.

4. Main game path toward authoritative runtime: in progress, not complete.
   The work has started on a network-first page shell and authoritative client/runtime path, but that integration is not yet finished and is not the current stable frontend path.

5. Renderer failure/recovery strategy: partially landed.
   Renderer startup failure is being moved behind a shared visible status surface, and basic WebGL context loss / restore handling is being added. Broader retry/fallback hardening is still open.

Practical takeaway:

- `1`, `3`, and `5` have meaningful progress.
- `2` is still only partway done.
- `4` has started but is not yet complete or production-ready.
