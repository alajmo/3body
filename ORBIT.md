# Orbit Retune Plan

## Goal

Retune the Phase 1 sandbox MVP so it feels closer to the actual three-body problem.

The MVP target is:

- 3 suns
- 7 planets

The orbital behavior should satisfy all of the following:

- the 3 suns should move in ordered chaos, not read as a locked circular ornament
- the 3 suns should be visibly different sizes: one small, one medium, one large
- suns should render as solid filled bodies, not ring / donut silhouettes
- the system should be unstable in a believable way, not perfectly clockwork
- planets should sometimes pass between suns and sometimes get uncomfortably close to a sun
- those close calls should be part of the intended feel, not always an immediate death spiral
- sun-on-sun crashes should still be uncommon enough that the sandbox remains watchable for at least ~60 seconds
- the 7 planets should not all occupy the same safe outer ring

## Constraints

- Keep the shared physics path: `stepSuns` + `stepBody` from `@3body/shared`
- Keep the Phase 1 fixed-step loop at `SIM_HZ = 120`
- Keep the arena ring visible from the start
- Do not solve this by making the suns static
- Prefer retuning initial conditions first
- Only touch shared constants like `G` or `SUN_MASS` if no acceptable initial-condition window exists

## Target Feel

The intended motion is not:

- 3 suns calmly rotating around origin forever
- 7 planets stacked into nearly identical safe outer-lane orbits

The intended motion is:

- suns drifting, breathing, and reconfiguring around the center
- the small / medium / large suns remaining easy to distinguish during motion
- the triangle sometimes stretching or compressing without immediately collapsing
- multiple planets crossing through the inner system often enough that they can weave between suns
- the 7 planets using different orbital profiles instead of a cloned seed with phase offsets only
- occasional near-sun passes that look dangerous and would later be recoverable with Boost

## Acceptance Criteria

Treat the retune as successful when the default Phase 1 sandbox does all of the following:

- the suns remain alive and readable for at least 60 seconds in a typical run
- the suns visibly move relative to each other instead of preserving a nearly rigid triangle
- the suns are easy to identify as small / medium / large at a glance
- the suns read as filled circular bodies rather than hollow rings
- all 7 planets spawn with distinct trajectories that are readable at a glance
- several planets spend meaningful time inside or near the sun band, not only outside it
- some planets remain on wider orbits so the sandbox has a mix of risk levels
- close solar passes happen sometimes, but most runs do not immediately become a full-planet wipe
- in a typical run, several planets are still alive and moving after ~60 seconds
- the overall motion feels unstable and alive, not random-spaz and not sterile

## Strategy

### 1. Tune suns first, planet pack second

Do not search both at once initially.

First find a sun-only seed that:

- starts from an equilateral triangle
- uses small asymmetric offsets / velocity perturbations
- stays alive long enough
- produces visible shape changes in the sun triangle

Then search a 7-planet initial-condition pack against that sun seed.

### 2. Move away from the conservative outer-orbit preset

The current conservative setup keeps the suns too orderly and the planet too far out.

The retune should instead:

- use a looser sun seed closer to the unstable edge
- move several planet spawns inward, closer to the radial band occupied by the suns
- reduce the “safe outer lane” feeling

### 3. Treat instability as a design target

Take inspiration from the real three-body problem:

- the system should be unstable
- the suns should not look mechanically synchronized
- planets occasionally getting too close to stars is desirable
- some planets being lost over time is acceptable

But cap that instability so the default sandbox still produces usable gameplay space.

### 4. Reuse known three-body reference seeds when possible

Do not assume all starting conditions need to be invented from scratch.

Before hand-tuning everything, search for known three-body problem reference setups that already publish:

- body masses
- starting positions
- starting velocity directions and magnitudes

The goal is not to copy a physics paper blindly into gameplay, but to use real three-body initial-condition sets as candidate seeds for:

- the 3 suns themselves
- planet insertion tests around those suns

If a known reference seed produces better chaotic-but-readable motion than an ad hoc guess, prefer adapting that seed over deriving everything manually.

Example starting point for that research:

- Wikipedia: `https://en.wikipedia.org/wiki/Three-body_problem`

## Tuning Workflow

### Step A. Build a deterministic seed search harness

Use a local script or temporary helper that imports the shared physics and evaluates candidate seeds over 60-90 seconds.

Before or alongside that harness work, do a short reference search for existing three-body initial conditions so the search space includes both:

- known reference seeds from three-body literature / simulations
- custom gameplay-tuned seeds

Metrics to record:

- time until sun-sun collision
- minimum sun-sun gap
- minimum planet-sun gap per planet
- time until escape per planet
- fraction of time each planet is inside the sun radial band
- count of “close pass” events per planet below a chosen threshold
- alive planet count over time
- minimum planet-planet gap, even if collisions are not yet active, to avoid unreadable spawn clumping

### Step B. Find 3-5 viable sun seeds

Search around:

- equilateral sun placement
- small angular offsets
- small tangential speed differences
- small radial drift terms

Keep only candidates where:

- sun collisions are delayed long enough
- the sun formation visibly deforms over time
- the movement is readable, not chaotic noise
- the size contrast between the three suns remains visually legible during motion

### Step C. Search a 7-planet seed pack against the best sun seed(s)

Search planet starts with:

- smaller starting radius than the current outer-lane setup
- tangential velocity that encourages transfers and inner passes
- slight inward or outward radial kick

Build the pack intentionally instead of cloning one orbit 7 times.

Use a mix such as:

- 2 high-risk inner planets
- 3 medium-risk transfer planets
- 2 wider stabilizer planets

Prefer packs where:

- multiple planets thread between suns at least sometimes
- near-sun passes happen repeatedly across the whole set, not only on one special planet
- the sandbox keeps visual variety across all 7 orbits
- most runs still survive long enough to watch

### Step D. Keep a reset path for sandbox usability

Phase 1 is still a watchable sandbox, so keep auto-reset behavior when:

- suns collide
- all planets are dead or escaped
- too few planets remain too early in the run for the sandbox to stay interesting

The reset is a usability fallback, not the primary behavior.

## Recommended Implementation Shape

### 1. Extract initial-condition presets

Replace single hard-coded orbit constants with a small preset structure:

- sun placement / velocity parameters
- per-sun radius and any matching mass tuning needed to keep the motion believable
- an array of 7 planet placement / velocity seeds
- optional label for debugging

Start with one default preset, but keep the code ready for fast iteration.

### 2. Keep one default “volatile but survivable” preset

The default preset should prioritize:

- watchability
- inner-system motion
- occasional danger
- variety across the 7 planets
- a clear small / medium / large sun read

Not:

- perfect sun stability
- 7 guaranteed safe planet orbits
- visually identical suns
- ring / donut-looking suns

### 3. Add lightweight debug readouts during tuning

Useful temporary readouts:

- elapsed time since reset
- alive planet count
- minimum current planet-sun gap
- minimum current sun-sun gap
- preset name

These can be removed or simplified once the orbit is tuned.

## Verification

Before calling the retune done:

- watch the default preset for at least 3 separate runs
- confirm suns visibly wander relative to each other
- confirm multiple planets enter the inner system
- confirm the 7 planets do not read as the same orbit copied 7 times
- confirm at least one run shows near-sun scares without immediate total wipe
- confirm the sandbox still feels coherent for roughly a minute

## Order Of Work

1. Extract initial-condition constants into a preset object.
2. Build the deterministic orbit-evaluation helper.
3. Tune a sun-only seed that is unstable but survives long enough.
4. Design a 7-planet seed pack with different orbital risk profiles.
5. Tune the pack so several planets use the inner system instead of the outer lane.
6. Replace the current conservative preset.
7. Manually verify in the browser and adjust until the motion feels right.

## Out Of Scope

This plan does not include:

- combat
- abilities
- visual material polish
- network sync
- Black Hole behavior

It is only for fixing the orbital behavior and core body presentation of the Phase 1 sandbox.
