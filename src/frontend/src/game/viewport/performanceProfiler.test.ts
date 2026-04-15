import { describe, expect, it } from "vitest";
import { createViewportPerformanceProfiler } from "./performanceProfiler";

describe("createViewportPerformanceProfiler", () => {
  it("tracks averages, latest values, maxima, and resets cleanly", () => {
    const profiler = createViewportPerformanceProfiler();

    profiler.record({
      frameCpuMs: 8,
      frameDeltaSec: 1 / 60,
      interpolationMs: 0.5,
      renderCpuMs: 4,
      simulationMs: 1.25,
      stepCount: 1,
      submitMs: 0.2,
    });
    profiler.record({
      frameCpuMs: 12,
      frameDeltaSec: 1 / 30,
      interpolationMs: 0.75,
      renderCpuMs: 5,
      simulationMs: 2.5,
      stepCount: 2,
      submitMs: 0.35,
    });

    expect(profiler.getSnapshot()).toEqual({
      frameCpu: {
        averageMs: 10,
        latestMs: 12,
        maxMs: 12,
      },
      frames: 2,
      interpolation: {
        averageMs: 0.625,
        latestMs: 0.75,
        maxMs: 0.75,
      },
      renderCpu: {
        averageMs: 4.5,
        latestMs: 5,
        maxMs: 5,
      },
      sampledDurationSec: 1 / 20,
      simulation: {
        averageMs: 1.875,
        latestMs: 2.5,
        maxMs: 2.5,
      },
      steps: {
        average: 1.5,
        latest: 2,
        max: 2,
      },
      submit: {
        averageMs: 0.275,
        latestMs: 0.35,
        maxMs: 0.35,
      },
    });

    profiler.reset();

    expect(profiler.getSnapshot()).toEqual({
      frameCpu: {
        averageMs: 0,
        latestMs: 0,
        maxMs: 0,
      },
      frames: 0,
      interpolation: {
        averageMs: 0,
        latestMs: 0,
        maxMs: 0,
      },
      renderCpu: {
        averageMs: 0,
        latestMs: 0,
        maxMs: 0,
      },
      sampledDurationSec: 0,
      simulation: {
        averageMs: 0,
        latestMs: 0,
        maxMs: 0,
      },
      steps: {
        average: 0,
        latest: 0,
        max: 0,
      },
      submit: {
        averageMs: 0,
        latestMs: 0,
        maxMs: 0,
      },
    });
  });
});
