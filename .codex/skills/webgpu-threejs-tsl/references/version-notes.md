# Version Notes

This repo currently uses `three@^0.184.0` in `src/frontend/package.json`, so renderer guidance should assume the Three.js r184 line.

Implications:

- Many public WebGPU + TSL examples now align more closely with this repo than they did on the old r169-era stack.
- Examples and docs from newer releases can still mention helpers or behavior that landed after r184.
- This repo already uses the newer `RenderPipeline` naming instead of the older `PostProcessing` name.
- Prefer patterns already proven in `src/frontend/src/game/createGameViewport.ts`.

Guardrails:

- Keep using `three/webgpu` for renderer-side imports.
- Keep using `three/tsl` for node helpers.
- Treat `timerLocal()`, `positionLocal`, `uv()`, `mix()`, `sin()`, and `color()` as known-good examples in this repo.
- Do not swap in raw WGSL, raw GLSL, or third-party post-processing packages just because a newer example does.

When adapting external examples:

1. Reduce them to the underlying idea: gradient, fresnel, noise, bloom, distortion.
2. Rebuild that idea with the repo's current node vocabulary.
3. If the example depends on an unavailable post-r184 API, either simplify it or note that the repo needs a Three.js upgrade.
