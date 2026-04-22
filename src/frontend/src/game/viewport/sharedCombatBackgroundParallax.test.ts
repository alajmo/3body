import { describe, expect, it } from "vitest";
import { syncSharedCombatBackgroundParallax } from "./sharedCombatBackgroundParallax";

describe("syncSharedCombatBackgroundParallax", () => {
  it("updates and wraps background layer positions around the tile size", () => {
    const layers = [
      {
        driftX: 10,
        driftY: -6,
        group: {
          position: {
            x: 0,
            y: 0,
          },
        },
        parallax: 0.5,
        tileSize: 100,
      },
      {
        driftX: -4,
        driftY: 8,
        group: {
          position: {
            x: 0,
            y: 0,
          },
        },
        parallax: 1.2,
        tileSize: 60,
      },
    ];

    syncSharedCombatBackgroundParallax({
      backgroundLayers: layers,
      nowSec: 4,
      renderCenterX: 90,
      renderCenterY: -50,
    });

    expect(layers[0]!.group.position.x).toBeCloseTo(-15);
    expect(layers[0]!.group.position.y).toBeCloseTo(-49);
    expect(layers[1]!.group.position.x).toBeCloseTo(-28);
    expect(layers[1]!.group.position.y).toBeCloseTo(-28);
  });
});
