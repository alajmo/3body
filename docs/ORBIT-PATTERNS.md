# Orbit Pattern Mode Proposal

Status
- Proposal only. No behavior changes are implemented in this patch.
- Scope: the orbit editor at `/edit?item=orbits`, the orbit preview viewport, and the local sandbox/runtime that already consumes tuning.
- Explicitly out of scope for the first pass: authoritative backend match spawns in `src/backend/src/spawn.ts` and server-side sun stepping in `src/backend/src/tick.ts`.

## Problem

The current orbit editor is tuning a live three-sun simulation.

- `src/frontend/src/EditPage.tsx` exposes raw per-sun `pos` and `vel` fields.
- `src/frontend/src/game/runtimeOrbitPreset.ts` keeps the current default preset stable only by scaling distance and deriving matching velocity ratios.
- Once a user edits sun speed directly, the initial conditions are no longer on the same stable family, so the three-sun system quickly falls apart.

One important clarification from the current code: planets are **already not pulling suns**. `stepSuns` in `src/shared/src/physics.ts` only integrates sun-on-sun gravity plus the black hole. The current instability is caused by editing the suns' own mutually gravitating seed, not by planets feeding force back into the stars.

## Goal

Add a mode where stars follow a named fixed three-body pattern while still acting as gravity sources for planets.

Desired behavior:

- The user can choose a named orbit pattern from a select menu.
- The user can change star motion speed without collapsing the pattern.
- Stars keep pulling planets, rockets, drones, and caches inward.
- Stars do not get perturbed by planets.
- In fixed-pattern mode, stars also do not get re-integrated against each other. Their motion is kinematic.
- The user can tune planet starting speed separately from star pattern speed.

## Product Behavior

Add a top-level `Star motion` control in `/edit?item=orbits`:

- `Physics seed`
- `Fixed pattern`

### `Physics seed`

This is the current behavior.

- Keep `Start distance scale`
- Keep raw per-sun `Start X`, `Start Y`, `Velocity X`, `Velocity Y`
- Keep the existing seed-based simulation path

### `Fixed pattern`

Replace the fragile raw velocity workflow with pattern-driven controls:

- `Pattern`: select menu of named three-body patterns
- `Star pattern speed`: multiplies how fast the stars advance around the loop
- `Planet start speed`: multiplies the planets' initial tangential velocity
- Keep `Planet Orbit Radius`
- Keep per-sun visual/collision fields that still make sense, especially `radius`

In fixed-pattern mode, raw sun `Start X/Y` and `Velocity X/Y` controls should be hidden or disabled because they no longer drive the live result.

## Pattern Catalog

The repo already contains a useful pattern list in `src/frontend/src/game/orbitPresets.ts`.

These are the best candidates for the first select menu because they already match the user's Wikipedia request and already have gameplay-facing names:

- Figure-Eight
- Butterfly variants
- Bumblebee
- Moth variants
- Dragonfly variants
- Yarn
- Yin-Yang variants

The current `IA1 Periodic Sandbox` preset can remain as the default gameplay-friendly option, but the fixed-pattern menu should primarily surface the named periodic families already curated from the three-body-problem references.

Reference:
- https://en.wikipedia.org/wiki/Three-body_problem

Pragmatic scope for V1:

- Use the periodic families already present in the repo.
- Do not try to support every special-case family listed on the Wikipedia page in the first implementation.
- Euler/Lagrange analytic families can be added later if they turn out to be useful in gameplay and UI.

## Runtime Model

The key change is this:

**Fixed-pattern mode cannot just swap in different initial velocities. It needs a reusable closed-loop track.**

If we keep integrating suns with `stepSuns` and only change their initial speed, the orbit deforms or collapses. To make star speed editable without breaking the pattern, the stars need to follow a precomputed loop.

### Proposed model

For each supported pattern:

1. Define a canonical loop for the three stars.
2. Store sampled positions and velocities across one full period.
3. At runtime, derive the current phase from elapsed time and `Star pattern speed`.
4. Interpolate between neighboring samples.
5. Use the sampled stars as gravity sources for planets and other bodies.
6. Do not call `stepSuns` while fixed-pattern mode is active.

That gives us:

- stable, repeatable star motion
- adjustable star speed
- one-way gravity from stars into everything else

## Tuning Model

Add an explicit motion section under orbit gameplay tuning.

```ts
type OrbitStarMotionMode = "physicsSeed" | "fixedPattern";

interface OrbitStarMotionTuning {
  mode: OrbitStarMotionMode;
  patternId: string;
  speed: number;
}

interface OrbitGameplayTuning {
  starMotion: OrbitStarMotionTuning;
  planetStartSpeedScale: number;
  sunStartDistanceScale: number;
  planetCircleRadius: number;
  suns: [
    OrbitSunGameplayTuning,
    OrbitSunGameplayTuning,
    OrbitSunGameplayTuning,
  ];
  planets: [
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
    OrbitPlanetGameplayTuning,
  ];
}
```

Interpretation:

- `starMotion.mode`
  - `physicsSeed`: current seed/integrator path
  - `fixedPattern`: kinematic sampled-track path
- `starMotion.patternId`
  - selects the periodic family
- `starMotion.speed`
  - loop playback multiplier for the stars
- `planetStartSpeedScale`
  - multiplies the derived initial planet tangential speed in `resolveRuntimeOrbitPreset`
- `sunStartDistanceScale`
  - remains meaningful only in `physicsSeed` mode

## Implementation Shape

### 1. Extract pattern metadata out of frontend-only presets

Right now the periodic pattern catalog lives in `src/frontend/src/game/orbitPresets.ts`.

To make the tuning model and runtime cleaner, extract the reusable pattern metadata into a shared module such as:

- `src/shared/src/orbitPatternCatalog.ts`

That module should own:

- stable pattern ids
- labels for the editor select menu
- default period metadata
- any canonical seed data needed to build fixed tracks

### 2. Introduce sampled pattern tracks

Add a dedicated track dataset, for example:

- `src/shared/src/orbitPatternTracks.ts`

Each pattern should contain:

- `periodSec`
- ordered samples across the loop
- per-sample positions for all three suns
- per-sample velocities for all three suns

This can be hand-authored, generated once from the existing periodic seeds, or generated by a local script and committed as data. The important part is that runtime sampling is cheap and deterministic.

### 3. Resolve stars differently by mode

Update `src/frontend/src/game/runtimeOrbitPreset.ts` so that:

- `physicsSeed` mode keeps the current scaling behavior
- `fixedPattern` mode ignores raw sun `pos/vel` as live motion inputs and instead attaches pattern metadata the sandbox can sample

### 4. Step planets against sampled stars

Update the local orbit/combat sandboxes so they can source stars from either:

- `stepSuns(...)` in `physicsSeed` mode
- `sampleOrbitPattern(...)` in `fixedPattern` mode

Likely touch points:

- `src/frontend/src/game/orbitSandbox.ts`
- `src/frontend/src/game/combatSandbox.ts`
- `src/frontend/src/game/createSunInteractionViewport.ts`

### 5. Add editor controls

Update `src/frontend/src/EditPage.tsx` to add:

- `Star motion` select
- `Pattern` select
- `Star pattern speed` slider/number input
- `Planet start speed` slider/number input

And to conditionally hide or disable:

- raw per-sun start position fields
- raw per-sun velocity fields
- any helper copy that only applies to seed-scaling mode

### 6. Add tests

Minimum test coverage:

- tuning sanitization for new fields in `src/shared/src/tuning.ts`
- orbit editor save/load behavior in `src/frontend/src/EditPage.test.tsx`
- fixed-pattern sampling stability in `src/frontend/src/game/orbitSandbox.test.ts`
- local combat sandbox using sampled suns in `src/frontend/src/game/combatSandbox.test.ts`

## Planet Speed Behavior

`Planet start speed` should affect only the planets' initial orbit velocity, not the simulation clock.

That means:

- keep the current planet ring placement logic
- derive the base tangential speed the same way as today
- multiply that speed by `planetStartSpeedScale`

This lets the user make planets more or less aggressive relative to the same star pattern without changing the stars' path itself.

## Known Tradeoffs

### Fixed-pattern mode is intentionally less physically pure

Once stars are kinematic, the pattern is no longer reacting to edited sun masses or to the black hole in a fully physical way.

That is acceptable for this feature because the goal is editor control and readable gameplay, not strict scientific fidelity.

### Existing periodic presets are seeds, not tracks

The current repo has good starting conditions, but those are still initial conditions for integration. To make star speed truly editable, they must become sampled loops.

### Per-sun mass editing may become misleading

If fixed-pattern mode keeps arbitrary per-sun mass editing, the named solution stops being physically self-consistent. That is probably acceptable in V1, but if it feels confusing we should follow up by either:

- locking masses in fixed-pattern mode, or
- collapsing them into one shared `pattern mass` control

## Recommended Rollout

Implement in this order:

1. Shared tuning fields + sanitization
2. Shared pattern catalog/track data
3. Fixed-pattern star sampling in local orbit sandbox
4. Editor UI controls
5. Local combat sandbox support
6. Tests

Do not mix this with backend multiplayer spawn changes in the same patch. The editor/local sandbox feature can land independently first.
