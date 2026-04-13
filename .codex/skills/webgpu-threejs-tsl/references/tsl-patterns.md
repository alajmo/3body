# TSL Patterns

## Imports

- Import renderer-facing classes from `three/webgpu`.
- Import shader/node helpers from `three/tsl`.
- Keep those imports separate so the rendering architecture stays obvious.

## Materials

- Prefer `MeshBasicNodeMaterial` for unlit backgrounds, overlays, and stylized emissive looks.
- Use `MeshStandardNodeMaterial` or `MeshPhysicalNodeMaterial` only when the scene actually benefits from lighting response.
- Build color through node composition instead of mutating per-frame CPU-side material values when the effect is purely visual.

## Common graph patterns

- Gradient backdrop: `mix(color(a), color(b), uv().y)`
- Pulsing emissive or tint: `sin(timerLocal().mul(speed)).mul(amplitude).add(bias)`
- Position-based blend: normalize a local position component into `0..1` and use it as the blend factor
- Layering: compose small nodes first, then multiply or mix them into the final output

## Authoring guidance

- Keep node graphs readable; break complex graphs into named local variables.
- Reuse world-space or local-space position nodes deliberately. Do not mix spaces casually.
- Keep CPU animation for transforms and scene orchestration; keep shader animation in TSL when it is purely material-driven.

## For this repo

- The existing bootstrap planet uses a latitude-driven blend plus a low-cost pulse node. Follow that style for near-term work.
- Favor simple, bold procedural looks over physically dense shader graphs. This project is stylized, not a material showcase.
