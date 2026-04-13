# 3BODY Agent Notes

- Use `.codex/skills/webgpu-threejs-tsl/SKILL.md` for renderer, TSL, shader, WebGPU, WGSL, post-processing, or device-loss work.
- Treat `src/frontend/src/game/createGameViewport.ts` as the current renderer baseline for this repo.
- Keep frontend rendering work on `three/webgpu` and `three/tsl`; do not introduce a parallel raw-GLSL pipeline unless a feature gap forces it.
- This repo currently depends on `three@0.169.x`. Do not assume newer `r17x` or `r18x` APIs without checking compatibility first.
