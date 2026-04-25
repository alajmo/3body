import {
  CURRENT_GAME_TUNING,
  clampOrbitPatternDistanceScale,
  getOrbitPatternTrack,
  sampleOrbitPatternTrack,
} from "@3body/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { OrbitPreset } from "./orbitPresets";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import {
  createSandboxState,
  getPlanetSoftBoundaryRadius,
  getSandboxDebugSnapshot,
  getSandboxResetReason,
  interpolateSandboxState,
  stepSandbox,
} from "./orbitSandbox";
import { applyRuntimeTuningDocument } from "./runtimeTuning";

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
  beforeEach(() => {
    applyRuntimeTuningDocument(CURRENT_GAME_TUNING);
  });

  it("clones preset entities into mutable sandbox state", () => {
    const preset = createTestPreset();
    const state = createSandboxState(preset);

    expect(state.preset.id).toBe(preset.id);
    expect(state.suns).not.toBe(preset.suns);
    expect(state.planets).not.toBe(preset.planets);

    state.suns[0]!.pos.x = 999;
    state.planets[0]!.pos.y = 999;

    expect(preset.suns[0]!.pos.x).toBe(-240);
    expect(preset.planets[0]!.pos.y).toBe(420);
  });

  it("pushes planets back inside the soft arena boundary", () => {
    const state = createSandboxState(createTestPreset());
    const softBoundaryRadius = getPlanetSoftBoundaryRadius();
    state.suns = [];
    state.planets[0] = {
      ...state.planets[0]!,
      pos: { x: softBoundaryRadius + 120, y: 0 },
      vel: { x: 80, y: 0 },
    };

    const next = stepSandbox(state);
    const corrected = next.planets[0]!;

    expect(Math.hypot(corrected.pos.x, corrected.pos.y)).toBeLessThanOrEqual(
      softBoundaryRadius,
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

  it("samples fixed-pattern suns kinematically when that orbit mode is active", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.starMotion = {
      mode: "fixedPattern",
      patternId: "figure-eight-v1a",
      speed: 0,
    };
    tunedDocument.gameplay.orbits.starPatternDistanceScale = 1.75;
    tunedDocument.gameplay.orbits.suns[0] = {
      ...tunedDocument.gameplay.orbits.suns[0]!,
      pos: { x: 9_999, y: -9_999 },
      vel: { x: 1_234, y: -5_678 },
    };
    applyRuntimeTuningDocument(tunedDocument);

    const clampedDistanceScale = clampOrbitPatternDistanceScale(
      "figure-eight-v1a",
      tunedDocument.gameplay.orbits.starPatternDistanceScale,
      tunedDocument.gameplay.orbits.suns,
    );
    const state = createSandboxState(DEFAULT_ORBIT_PRESET);
    const nextState = stepSandbox(state);
    const sampledSuns = sampleOrbitPatternTrack(
      getOrbitPatternTrack("figure-eight-v1a"),
      0,
      0,
      clampedDistanceScale,
    );

    expect(state.suns[0]!.pos.x).not.toBeCloseTo(
      tunedDocument.gameplay.orbits.suns[0]!.pos.x,
      2,
    );
    expect(state.suns[0]!.pos.x).toBeCloseTo(sampledSuns[0]!.pos.x, 6);
    expect(state.suns[0]!.pos.y).toBeCloseTo(sampledSuns[0]!.pos.y, 6);
    expect(nextState.suns[0]!.pos.x).toBeCloseTo(state.suns[0]!.pos.x, 6);
    expect(nextState.suns[0]!.pos.y).toBeCloseTo(state.suns[0]!.pos.y, 6);
    expect(nextState.suns[0]!.vel.x).toBeCloseTo(state.suns[0]!.vel.x, 6);
    expect(nextState.suns[0]!.vel.y).toBeCloseTo(state.suns[0]!.vel.y, 6);
  });

  it("falls back to the supported fixed-pattern set when legacy ids are loaded", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.starMotion = {
      mode: "fixedPattern",
      patternId: "yarn-prl",
      speed: 0,
    };
    applyRuntimeTuningDocument(tunedDocument);

    const clampedDistanceScale = clampOrbitPatternDistanceScale(
      "figure-eight-v1a",
      tunedDocument.gameplay.orbits.starPatternDistanceScale,
      tunedDocument.gameplay.orbits.suns,
    );
    const state = createSandboxState(DEFAULT_ORBIT_PRESET);
    const sampledSuns = sampleOrbitPatternTrack(
      getOrbitPatternTrack("figure-eight-v1a"),
      0,
      0,
      clampedDistanceScale,
    );

    expect(state.suns[0]!.pos.x).toBeCloseTo(sampledSuns[0]!.pos.x, 6);
    expect(state.suns[0]!.pos.y).toBeCloseTo(sampledSuns[0]!.pos.y, 6);
  });

  it("clamps fixed-pattern distance scale for large suns before seeding the sandbox", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.starMotion = {
      mode: "fixedPattern",
      patternId: "equilateral-circle",
      speed: 0,
    };
    tunedDocument.gameplay.orbits.starPatternDistanceScale = 0.5;
    tunedDocument.gameplay.orbits.suns = tunedDocument.gameplay.orbits.suns.map(
      (sun) => ({
        ...sun,
        radius: 800,
      }),
    ) as typeof tunedDocument.gameplay.orbits.suns;
    applyRuntimeTuningDocument(tunedDocument);

    const clampedDistanceScale = clampOrbitPatternDistanceScale(
      "equilateral-circle",
      tunedDocument.gameplay.orbits.starPatternDistanceScale,
      tunedDocument.gameplay.orbits.suns,
    );
    const sampledSuns = sampleOrbitPatternTrack(
      getOrbitPatternTrack("equilateral-circle"),
      0,
      0,
      clampedDistanceScale,
    );
    const state = createSandboxState(DEFAULT_ORBIT_PRESET);

    expect(clampedDistanceScale).toBeGreaterThan(0.5);
    expect(state.suns[0]!.pos.x).toBeCloseTo(sampledSuns[0]!.pos.x, 6);
    expect(state.suns[0]!.pos.y).toBeCloseTo(sampledSuns[0]!.pos.y, 6);
    expect(state.suns[0]!.radius).toBe(800);
  });
});
