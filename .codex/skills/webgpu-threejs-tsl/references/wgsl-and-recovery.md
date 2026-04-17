# WGSL And Recovery

## Custom shader escape hatch

Prefer TSL first. Reach for custom WGSL only when one of these is true:

- a needed math path is impractical in the current node API
- a compute-style workload is clearly a better fit than scene graph updates
- the visual effect depends on shader behavior that would be awkward or opaque in TSL

If you use custom shader code:

- keep the boundary narrow
- document why TSL was not enough
- avoid spreading shader strings across multiple files without a clear reuse case

## Failure handling

WebGPU init and device state can fail. For this repo:

- keep a visible user-facing failure message when renderer init fails
- avoid partial DOM state during failed startup
- make cleanup safe even if init only completed halfway

## Upgrade pressure

If a task needs:

- richer post-processing
- compute-oriented simulation
- a newer TSL helper set

then call out whether the blocker is the current `three@^0.184.0` baseline instead of forcing a brittle workaround.
