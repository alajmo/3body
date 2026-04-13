# Version Notes

This repo currently uses `three@0.169.x` in `src/frontend/package.json`.

Implications:

- Many public WebGPU + TSL examples now target materially newer Three.js releases.
- Newer docs may mention renamed nodes, newer helpers, or post-processing APIs that do not exist here yet.
- Prefer patterns already proven in `src/frontend/src/game/createGameViewport.ts`.

Guardrails:

- Keep using `three/webgpu` for renderer-side imports.
- Keep using `three/tsl` for node helpers.
- Treat `timerLocal()`, `positionLocal`, `uv()`, `mix()`, `sin()`, and `color()` as known-good examples in this repo.
- Do not swap in raw WGSL, raw GLSL, or third-party post-processing packages just because a newer example does.

When adapting external examples:

1. Reduce them to the underlying idea: gradient, fresnel, noise, bloom, distortion.
2. Rebuild that idea with the repo's current node vocabulary.
3. If the example depends on an unavailable API, either simplify it or note that the repo needs a Three.js upgrade.
