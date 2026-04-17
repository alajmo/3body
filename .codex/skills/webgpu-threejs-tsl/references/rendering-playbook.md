# Rendering Playbook

## Renderer setup

- Create `WebGPURenderer` asynchronously and `await renderer.init()`.
- Do not touch the live DOM until init succeeds.
- Set `outputColorSpace` explicitly.
- Clamp pixel ratio; the current baseline caps it at `2`.

## Scene setup

- Keep camera math deterministic on resize.
- For 2D play, use `OrthographicCamera` unless the change explicitly needs a perspective camera.
- Treat the arena size constants from `@3body/shared` as the driver for visible world bounds.

## Lifecycle

- Keep teardown idempotent.
- Remove listeners on dispose.
- Clear animation loops before disposing the renderer.
- Dispose geometries and materials created in the viewport module.

## Effects

- Start with node-material effects inside the scene before reaching for full-screen passes.
- For glow, gradients, atmospheric edges, and distortion hints, prefer cheap material tricks first.
- Introduce post-processing only when there is a clear visual need and the current r184-line API surface supports it cleanly.

## Code shape

- Keep viewport bootstrap code in one place until there is a second real renderer consumer.
- Add helpers only when they remove duplication or isolate a non-trivial visual effect.
