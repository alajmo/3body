# 3BODY Agent Notes

This file is the repo-local operating guide for agents working in `/home/samir/projects/game/3body`.

## Stack Snapshot

- Frontend: Vite + React + TypeScript
- Renderer stack: `three/webgpu` + `three/tsl`
- Backend: Bun + TypeScript WebSocket server
- Shared package: `src/shared`
- Package manager: npm workspaces
- Formatter/linter: Biome
- Frontend tests: Vitest
- Current Three.js line: `three@^0.184.0`

Do not copy older guidance that assumes `three@0.169.x`; it is stale.

## Repo Map

- `src/shared/src`
  Shared gameplay math, physics, protocol types, constants, and utilities.
  If logic must match between frontend and backend, it usually belongs here.
- `src/frontend/src`
  React UI, viewport creation, local sandbox flow, interpolation, HUD, and
  renderer-facing helpers.
- `src/backend/src`
  Authoritative room/server logic.
- `docs/IMPLEMENTATION.md`
  Architectural source of truth for the stack and renderer direction.
- `REFACTOR.md`
  Current refactor backlog / status.

## Core Rules

- Keep shared gameplay behavior in `src/shared` when both frontend and backend
  need it. Do not fork math or protocol behavior silently across packages.
- Treat `/offline` as the local renderer stress/profiling route and `/online`
  as the authoritative match shell. `/` is the play menu.
- Prefer extending the extracted helper modules before adding more logic back
  into the giant entry files.
- Keep changes consistent with the current refactor direction: lower allocation
  pressure in hot paths, narrower helper modules, and less duplicated viewport
  lifecycle code.

## Renderer Rules

- Use `.codex/skills/webgpu-threejs-tsl/SKILL.md` for renderer, TSL, shader,
  WebGPU, WGSL, post-processing, or device-loss work.
- Treat `src/frontend/src/game/createGameViewport.ts` as the renderer baseline
  for local sandbox / gameplay viewport patterns.
- Treat `src/frontend/src/game/createAuthoritativeViewport.ts` as the baseline
  for authoritative interpolation/render-loop behavior.
- Keep frontend rendering on `three/webgpu` and `three/tsl`.
- Do not introduce a parallel raw-GLSL or alternate renderer pipeline unless a
  real feature gap forces it.
- Prefer the shared viewport lifecycle helpers that already exist:
  - `src/frontend/src/game/viewport/managedViewportSession.ts`
  - `src/frontend/src/game/viewport/animationLoopController.ts`
  - `src/frontend/src/game/viewport/rendererBootstrap.ts`
- Prefer the extracted hot-path helpers instead of re-inlining them:
  - `src/frontend/src/game/viewport/authoritativeInterpolation.ts`
  - `src/frontend/src/game/combatSandboxInterpolation.ts`
  - `src/frontend/src/game/viewport/localViewportForesight.ts`
  - `src/frontend/src/game/viewport/authoritativeTrailVisual.ts`

## Frontend Guidance

- HUD/UI stays DOM/React-based; do not move HUD rendering into Three unless the
  existing architecture clearly cannot support the feature.
- `EditPage.tsx` is still large, but generic inspector controls now live in
  `src/frontend/src/editInspectorFields.tsx`. Reuse those instead of creating
  one-off form controls inline.
- When touching local sandbox rendering, prefer cached lookup maps and reusable
  mutable render state over repeated cloning or per-frame `.find()` scans.

## Validation

Run the narrowest useful validation first, then broaden if the touched area has
wide fanout.

- Full repo typecheck:
  - `npm run typecheck`
- Frontend tests:
  - `npm run test:frontend`
- Format:
  - `npm run format`
- Lint:
  - `npm run lint`

Useful targeted commands:

- Single frontend test file:
  - `npx vitest run src/game/...`
- Local sandbox profiling:
  - `npm run profile:local-sandbox`
- Authoritative/local profiling variant:
  - `npm run profile:authoritative-match`

If you change viewport hot paths, interpolation, or sandbox simulation, run at
least `npm run typecheck` and `npm run test:frontend`.

## Change Strategy

- Prefer small helper extractions over expanding already-large files.
- Preserve existing naming and structure when adding new viewport helpers.
- When changing performance-sensitive code, avoid broad object cloning unless
  correctness requires it.
- When changing lifecycle code, keep teardown idempotent and failure reporting
  consistent with the managed viewport session helpers.

## Good Defaults

- Shared simulation/protocol change: check `src/shared` first.
- Local sandbox issue: inspect `createGameViewport.ts`,
  `localSandboxSimulation.ts`, and `localViewportScene.ts`.
- Authoritative interpolation/render issue: inspect
  `createAuthoritativeViewport.ts` and
  `viewport/authoritativeInterpolation.ts`.
- Renderer bootstrap/session issue: inspect `rendererBootstrap.ts` and
  `managedViewportSession.ts`.
