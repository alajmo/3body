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

interface SpikeMetricSnapshot {
  count: number;
  lastAgeSec: number | null;
  thresholdMs: number;
}

interface ViewportPerformanceFrameSample {
  frameCpuMs: number;
  frameDeltaSec: number;
  frameGapSec: number;
  interpolationMs: number;
  renderCpuMs: number;
  simulationMs: number;
  stepCount: number;
  submitMs: number;
}

export interface ViewportPerformanceSnapshot {
  frameCpu: TimedMetricSnapshot;
  frameGap: TimedMetricSnapshot;
  frameGapSpikes: SpikeMetricSnapshot;
  frames: number;
  interpolation: TimedMetricSnapshot;
  renderCpu: TimedMetricSnapshot;
  sampledDurationSec: number;
  simulation: TimedMetricSnapshot;
  steps: ScalarMetricSnapshot;
  submit: TimedMetricSnapshot;
  submitSpikes: SpikeMetricSnapshot;
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

interface SpikeMetricState {
  count: number;
  lastAtSec: number | null;
  thresholdMs: number;
}

const FRAME_GAP_SPIKE_THRESHOLD_MS = 1000 / 30;
const SUBMIT_SPIKE_THRESHOLD_MS = 20;

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

const createSpikeMetricState = (thresholdMs: number): SpikeMetricState => ({
  count: 0,
  lastAtSec: null,
  thresholdMs,
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

const recordSpikeMetric = (
  state: SpikeMetricState,
  valueMs: number,
  atSec: number,
) => {
  if (valueMs <= state.thresholdMs) {
    return;
  }

  state.count += 1;
  state.lastAtSec = atSec;
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

const getSpikeMetricSnapshot = (
  state: SpikeMetricState,
  sampledDurationSec: number,
): SpikeMetricSnapshot => ({
  count: state.count,
  lastAgeSec:
    state.lastAtSec === null
      ? null
      : Math.max(0, sampledDurationSec - state.lastAtSec),
  thresholdMs: state.thresholdMs,
});

export const createViewportPerformanceProfiler = (): {
  getSnapshot: () => ViewportPerformanceSnapshot;
  record: (sample: ViewportPerformanceFrameSample) => void;
  reset: () => void;
} => {
  let frames = 0;
  let sampledDurationSec = 0;
  let frameCpu = createTimedMetricState();
  let frameGap = createTimedMetricState();
  let simulation = createTimedMetricState();
  let interpolation = createTimedMetricState();
  let renderCpu = createTimedMetricState();
  let submit = createTimedMetricState();
  let steps = createScalarMetricState();
  let frameGapSpikes = createSpikeMetricState(FRAME_GAP_SPIKE_THRESHOLD_MS);
  let submitSpikes = createSpikeMetricState(SUBMIT_SPIKE_THRESHOLD_MS);

  return {
    getSnapshot() {
      return {
        frameCpu: getTimedMetricSnapshot(frameCpu, frames),
        frameGap: getTimedMetricSnapshot(frameGap, frames),
        frameGapSpikes: getSpikeMetricSnapshot(
          frameGapSpikes,
          sampledDurationSec,
        ),
        frames,
        interpolation: getTimedMetricSnapshot(interpolation, frames),
        renderCpu: getTimedMetricSnapshot(renderCpu, frames),
        sampledDurationSec,
        simulation: getTimedMetricSnapshot(simulation, frames),
        steps: getScalarMetricSnapshot(steps, frames),
        submit: getTimedMetricSnapshot(submit, frames),
        submitSpikes: getSpikeMetricSnapshot(submitSpikes, sampledDurationSec),
      };
    },
    record(sample) {
      frames += 1;
      sampledDurationSec += sample.frameGapSec;
      const frameGapMs = sample.frameGapSec * 1000;
      recordTimedMetric(frameCpu, sample.frameCpuMs);
      recordTimedMetric(frameGap, frameGapMs);
      recordTimedMetric(simulation, sample.simulationMs);
      recordTimedMetric(interpolation, sample.interpolationMs);
      recordTimedMetric(renderCpu, sample.renderCpuMs);
      recordTimedMetric(submit, sample.submitMs);
      recordScalarMetric(steps, sample.stepCount);
      recordSpikeMetric(frameGapSpikes, frameGapMs, sampledDurationSec);
      recordSpikeMetric(submitSpikes, sample.submitMs, sampledDurationSec);
    },
    reset() {
      frames = 0;
      sampledDurationSec = 0;
      frameCpu = createTimedMetricState();
      frameGap = createTimedMetricState();
      simulation = createTimedMetricState();
      interpolation = createTimedMetricState();
      renderCpu = createTimedMetricState();
      submit = createTimedMetricState();
      steps = createScalarMetricState();
      frameGapSpikes = createSpikeMetricState(FRAME_GAP_SPIKE_THRESHOLD_MS);
      submitSpikes = createSpikeMetricState(SUBMIT_SPIKE_THRESHOLD_MS);
    },
  };
};
