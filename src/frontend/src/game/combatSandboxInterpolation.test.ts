import { describe, expect, it } from "vitest";
import { createSandboxState } from "./combatSandbox";
import {
  createInterpolatedSandboxState,
  createSandboxInterpolationCache,
  syncInterpolatedSandboxState,
} from "./combatSandboxInterpolation";

describe("combat sandbox interpolation", () => {
  it("matches surviving suns by id after a sun is removed", () => {
    const previousState = createSandboxState();
    const currentState = createSandboxState();

    previousState.suns = [
      {
        id: 91_001,
        kind: "sun",
        mass: 800_000,
        pos: { x: 0, y: 0 },
        radius: 120,
        vel: { x: 5, y: 0 },
        swallowedAtSec: null,
      },
      {
        id: 91_002,
        kind: "sun",
        mass: 900_000,
        pos: { x: 100, y: 20 },
        radius: 140,
        vel: { x: 10, y: 30 },
        swallowedAtSec: null,
      },
    ];
    currentState.suns = [
      {
        id: 91_002,
        kind: "sun",
        mass: 960_000,
        pos: { x: 140, y: 60 },
        radius: 150,
        vel: { x: 14, y: 34 },
        swallowedAtSec: null,
      },
    ];

    const interpolatedState = syncInterpolatedSandboxState(
      createInterpolatedSandboxState(currentState),
      createSandboxInterpolationCache(),
      previousState,
      currentState,
      0.5,
    );

    expect(interpolatedState.suns).toHaveLength(1);
    expect(interpolatedState.suns[0]!.id).toBe(91_002);
    expect(interpolatedState.suns[0]!.pos).toEqual({ x: 120, y: 40 });
    expect(interpolatedState.suns[0]!.vel).toEqual({ x: 12, y: 32 });
    expect(interpolatedState.suns[0]!.radius).toBe(150);
    expect(interpolatedState.suns[0]!.mass).toBe(960_000);
  });
});
