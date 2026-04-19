# Orbit Plans

## Current Inventory

The repo currently has `20` special periodic three-body patterns in code, plus `1` extra default gameplay preset (`IA1 Periodic Sandbox`).

The `20` special patterns are defined in `src/frontend/src/game/orbitPresets.ts`.

1. `Figure-Eight (V.1.A)`
2. `Butterfly I (I.2.A)`
3. `Butterfly II (I.2.B)`
4. `Bumblebee (II.11.A)`
5. `Moth I (IVa.2.A)`
6. `Moth II (IVa.4.A)`
7. `Butterfly III (IVb.3.A)`
8. `Moth III (IVc.5.A)`
9. `Goggles`
10. `Butterfly IV (IVb.24.A)`
11. `Dragonfly (II.4.A)`
12. `Yarn`
13. `Yin-Yang I alpha (III.3.A)`
14. `Yin-Yang I beta (III.3.A)`
15. `Yin-Yang II alpha (III.12.A)`
16. `Yin-Yang II beta (III.12.A)`
17. `Dragonfly II.6.A`
18. `Dragonfly II.8.A`
19. `Yin-Yang III.9.A alpha`
20. `Yin-Yang III.9.A beta`

## Scope Note

Wikipedia's special-case solutions coverage is broader than these `20`.

What the repo currently includes:

- a curated subset of equal-mass periodic-orbit families
- the named periodic families already encoded in `src/frontend/src/game/orbitPresets.ts`

What Wikipedia also covers, but the repo does not currently expose as selectable patterns:

- Euler's collinear families
- Lagrange's equilateral family
- the Pythagorean three-body problem
- the Broucke-Henon-Hadjidemetriou family
- other special-case or analytic families outside the current periodic subset

## Practical Read

For the planned orbit-pattern selector, the clean first pass is:

- expose exactly these `20` existing periodic patterns
- keep `IA1 Periodic Sandbox` as the gameplay-friendly default
- treat Euler, Lagrange, Pythagorean, and BHH as later additions

## References

- Local source: `src/frontend/src/game/orbitPresets.ts`
- Wikipedia: `https://en.wikipedia.org/wiki/Three-body_problem`
