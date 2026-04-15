interface TimedMetricSnapshot {
  averageMs: number;
  latestMs: number;
  maxMs: number;
}

interface ScalarMetricSnapshot {
  average: number;
  latest: number;
  max: number;
}

export interface ViewportPerformanceFrameSample {
  frameCpuMs: number;
  frameDeltaSec: number;
  interpolationMs: number;
  renderCpuMs: number;
  simulationMs: number;
  stepCount: number;
  submitMs: number;
}

export interface ViewportPerformanceSnapshot {
  frameCpu: TimedMetricSnapshot;
  frames: number;
  interpolation: TimedMetricSnapshot;
  renderCpu: TimedMetricSnapshot;
  sampledDurationSec: number;
  simulation: TimedMetricSnapshot;
  steps: ScalarMetricSnapshot;
  submit: TimedMetricSnapshot;
}

interface TimedMetricState {
  latestMs: number;
  maxMs: number;
  totalMs: number;
}

interface ScalarMetricState {
  latest: number;
  max: number;
  total: number;
}

const createTimedMetricState = (): TimedMetricState => ({
  latestMs: 0,
  maxMs: 0,
  totalMs: 0,
});

const createScalarMetricState = (): ScalarMetricState => ({
  latest: 0,
  max: 0,
  total: 0,
});

const recordTimedMetric = (state: TimedMetricState, valueMs: number) => {
  state.latestMs = valueMs;
  state.totalMs += valueMs;
  state.maxMs = Math.max(state.maxMs, valueMs);
};

const recordScalarMetric = (state: ScalarMetricState, value: number) => {
  state.latest = value;
  state.total += value;
  state.max = Math.max(state.max, value);
};

const getTimedMetricSnapshot = (
  state: TimedMetricState,
  frames: number,
): TimedMetricSnapshot => ({
  averageMs: frames > 0 ? state.totalMs / frames : 0,
  latestMs: state.latestMs,
  maxMs: state.maxMs,
});

const getScalarMetricSnapshot = (
  state: ScalarMetricState,
  frames: number,
): ScalarMetricSnapshot => ({
  average: frames > 0 ? state.total / frames : 0,
  latest: state.latest,
  max: state.max,
});

export const createViewportPerformanceProfiler = (): {
  getSnapshot: () => ViewportPerformanceSnapshot;
  record: (sample: ViewportPerformanceFrameSample) => void;
  reset: () => void;
} => {
  let frames = 0;
  let sampledDurationSec = 0;
  let frameCpu = createTimedMetricState();
  let simulation = createTimedMetricState();
  let interpolation = createTimedMetricState();
  let renderCpu = createTimedMetricState();
  let submit = createTimedMetricState();
  let steps = createScalarMetricState();

  return {
    getSnapshot() {
      return {
        frameCpu: getTimedMetricSnapshot(frameCpu, frames),
        frames,
        interpolation: getTimedMetricSnapshot(interpolation, frames),
        renderCpu: getTimedMetricSnapshot(renderCpu, frames),
        sampledDurationSec,
        simulation: getTimedMetricSnapshot(simulation, frames),
        steps: getScalarMetricSnapshot(steps, frames),
        submit: getTimedMetricSnapshot(submit, frames),
      };
    },
    record(sample) {
      frames += 1;
      sampledDurationSec += sample.frameDeltaSec;
      recordTimedMetric(frameCpu, sample.frameCpuMs);
      recordTimedMetric(simulation, sample.simulationMs);
      recordTimedMetric(interpolation, sample.interpolationMs);
      recordTimedMetric(renderCpu, sample.renderCpuMs);
      recordTimedMetric(submit, sample.submitMs);
      recordScalarMetric(steps, sample.stepCount);
    },
    reset() {
      frames = 0;
      sampledDurationSec = 0;
      frameCpu = createTimedMetricState();
      simulation = createTimedMetricState();
      interpolation = createTimedMetricState();
      renderCpu = createTimedMetricState();
      submit = createTimedMetricState();
      steps = createScalarMetricState();
    },
  };
};
