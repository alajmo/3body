---
name: webgpu-threejs-tsl
description: Use for Three.js WebGPU and TSL work in this repo, including renderer setup, node materials, shader composition, WGSL interop, post-processing, and device-loss handling. This repo currently tracks the Three.js r184 line, so prefer existing repo patterns and verify newer examples before applying newer APIs.
---

# WebGPU Three.js TSL For 3BODY

Use this skill when work touches:

- `three/webgpu` renderer setup or lifecycle
- `three/tsl` node graphs or material authoring
- frontend visuals in `src/frontend/src/game/`
- post-processing, render targets, or custom shader work
- custom WGSL helpers or WebGPU failure recovery

## Repo context

- The active frontend stack is documented in `README.md` and `docs/IMPLEMENTATION.md`.
- The current renderer baseline lives in `src/frontend/src/game/createGameViewport.ts`.
- The repo currently depends on `three@^0.184.0` in `src/frontend/package.json`.
- The renderer stack already uses the current `three/webgpu` + `three/tsl` import split and `RenderPipeline` naming.
- Outside examples can still be ahead of this repo's exact API surface. Treat them as ideas, not copy-paste truth.

## Working rules

1. Start from the existing renderer pattern before adding abstractions.
2. Prefer node materials and TSL helpers over raw shader strings.
3. Keep imports split by concern:
   - scene, camera, renderer, geometry, mesh classes from `three/webgpu`
   - node helpers from `three/tsl`
4. Keep renderer init async and disposal-safe.
5. If a change depends on a newer Three.js API, either adapt it to the current r184-line API or note that the repo needs a Three upgrade first.
6. If you need raw WGSL or GLSL, document why TSL is insufficient for that case.

## Read these references as needed

- `references/version-notes.md` for repo-specific compatibility guardrails
- `references/tsl-patterns.md` for common node-material patterns
- `references/rendering-playbook.md` for renderer and scene setup rules
- `references/wgsl-and-recovery.md` for custom shader escape hatches and robustness

## Default approach

For routine rendering changes:

1. Read `src/frontend/src/game/createGameViewport.ts`
2. Read `references/version-notes.md`
3. Read the one focused reference that matches the task
4. Implement the smallest repo-native change

## Escalation guidance

- If post-processing or compute work starts to fight the current Three.js version, stop assuming parity with newer examples and verify the exact API surface first.
- If WebGPU init can fail in the target path, keep a visible failure state in the DOM and make teardown idempotent.
