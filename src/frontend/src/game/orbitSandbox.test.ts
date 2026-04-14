import type { OrbitPreset } from "./orbitPresets";
import { describe, expect, it } from "vitest";
import {
  PLANET_SOFT_BOUNDARY_RADIUS,
  createSandboxState,
  getSandboxDebugSnapshot,
  getSandboxResetReason,
  interpolateSandboxState,
  stepSandbox,
} from "./orbitSandbox";

const createTestPreset = (): OrbitPreset => ({
  id: "test-preset",
  label: "Test Preset",
  resetPolicy: {
    earlyWindowSec: 10,
    minAliveDuringEarlyWindow: 1,
  },
  suns: [
    {
      id: 1,
      label: "left",
      color: "#ffd36a",
      glowColor: "#fff1a1",
      mass: 0,
      radius: 24,
      pos: { x: -240, y: 0 },
      vel: { x: 0, y: 0 },
    },
    {
      id: 2,
      label: "right",
      color: "#ffb347",
      glowColor: "#ffd6ae",
      mass: 0,
      radius: 24,
      pos: { x: 240, y: 0 },
      vel: { x: 0, y: 0 },
    },
  ],
  planets: [
    {
      id: 101,
      label: "I",
      color: "#8ad8ff",
      trailColor: "#8ad8ff",
      risk: "outer",
      radius: 20,
      pos: { x: 0, y: 420 },
      vel: { x: 0, y: 0 },
    },
    {
      id: 102,
      label: "II",
      color: "#f89bc7",
      trailColor: "#f89bc7",
      risk: "outer",
      radius: 20,
      pos: { x: 0, y: -420 },
      vel: { x: 0, y: 0 },
    },
  ],
});

describe("orbitSandbox", () => {
  it("clones preset entities into mutable sandbox state", () => {
    const preset = createTestPreset();
    const state = createSandboxState(preset);

    expect(state.preset).toBe(preset);
    expect(state.suns).not.toBe(preset.suns);
    expect(state.planets).not.toBe(preset.planets);

    state.suns[0]!.pos.x = 999;
    state.planets[0]!.pos.y = 999;

    expect(preset.suns[0]!.pos.x).toBe(-240);
    expect(preset.planets[0]!.pos.y).toBe(420);
  });

  it("pushes planets back inside the soft arena boundary", () => {
    const state = createSandboxState(createTestPreset());
    state.suns = [];
    state.planets[0] = {
      ...state.planets[0]!,
      pos: { x: PLANET_SOFT_BOUNDARY_RADIUS + 120, y: 0 },
      vel: { x: 80, y: 0 },
    };

    const next = stepSandbox(state);
    const corrected = next.planets[0]!;

    expect(Math.hypot(corrected.pos.x, corrected.pos.y)).toBeLessThanOrEqual(
      PLANET_SOFT_BOUNDARY_RADIUS,
    );
    expect(corrected.vel.x).toBeLessThan(0);
  });

  it("reports sun-collision reset conditions and sandbox debug snapshots", () => {
    const state = createSandboxState(createTestPreset());
    state.suns = [
      {
        ...state.suns[0]!,
        pos: { x: 0, y: 0 },
        radius: 30,
      },
      {
        ...state.suns[1]!,
        pos: { x: 20, y: 0 },
        radius: 30,
      },
    ];

    expect(getSandboxResetReason(state)).toBe("sunCollision");

    const snapshot = getSandboxDebugSnapshot(state);
    expect(snapshot.presetLabel).toBe("Test Preset");
    expect(snapshot.alivePlanets).toBe(2);
    expect(snapshot.minCurrentSunSunGap).toBeLessThanOrEqual(0);
  });

  it("does not interpolate planets that died between frames", () => {
    const previous = createSandboxState(createTestPreset());
    const current = createSandboxState(createTestPreset());

    previous.planets[0] = {
      ...previous.planets[0]!,
      pos: { x: -100, y: -60 },
      vel: { x: -8, y: -4 },
    };
    current.planets[0] = {
      ...current.planets[0]!,
      alive: false,
      deathReason: "sunCollision",
      pos: { x: 140, y: 90 },
      vel: { x: 6, y: 3 },
    };

    const interpolated = interpolateSandboxState(previous, current, 0.25);

    expect(interpolated.planets[0]!.pos).toEqual(current.planets[0]!.pos);
    expect(interpolated.planets[0]!.vel).toEqual(current.planets[0]!.vel);
  });
});
