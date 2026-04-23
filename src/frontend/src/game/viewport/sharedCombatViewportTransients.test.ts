import { describe, expect, it, vi } from "vitest";
import { buildSharedCombatViewportTransientBundle } from "./sharedCombatViewportTransients";

describe("buildSharedCombatViewportTransientBundle", () => {
  it("splits normalized transient input into viewport frame and resources", () => {
    const burst = {
      absorbedByShield: false,
      color: "#fff",
    };
    const resolveBurst = vi.fn();
    const blackHoleSwallows = {
      activeEffects: [],
      inactiveVisuals: [],
    };
    const planetExplosions = {
      activePlanetExplosions: [],
      inactivePlanetExplosionVisuals: [],
    };
    const visuals = [{ id: "impact" }];
    const z = {
      core: 1,
      glow: 2,
      ring: 3,
    };

    const bundle = buildSharedCombatViewportTransientBundle({
      blackHoleSwallows,
      impactBursts: {
        bursts: [burst],
        maxVisibleBursts: 4,
        nowSec: 8,
        resolveBurst,
        visuals: visuals as never,
        z,
      },
      nowSec: 7,
      planetExplosions,
    });

    expect(bundle.frame).toEqual({
      impactBursts: {
        bursts: [burst],
        nowSec: 8,
        resolveBurst,
      },
      nowSec: 7,
    });
    expect(bundle.resources).toEqual({
      blackHoleSwallows,
      impactBursts: {
        maxVisibleBursts: 4,
        visuals,
        z,
      },
      planetExplosions,
    });
  });
});
