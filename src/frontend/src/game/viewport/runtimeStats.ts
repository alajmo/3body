export interface ViewportRuntimeStats {
  fps: number;
  frameTimeMs: number;
}

const FPS_SAMPLE_WINDOW_SEC = 0.4;
const FRAME_TIME_EMA_ALPHA = 0.16;

export const createRuntimeStatsTracker = (
  initialFrameTimeMs = 16.7,
): {
  sample: (frameDeltaSec: number) => ViewportRuntimeStats;
} => {
  let fpsSampleAccumSec = 0;
  let fpsSampleFrames = 0;
  let fps = 0;
  let smoothedFrameTimeMs = initialFrameTimeMs;

  return {
    sample(frameDeltaSec: number) {
      if (!(frameDeltaSec > 0)) {
        return {
          fps,
          frameTimeMs: smoothedFrameTimeMs,
        };
      }

      const frameTimeMs = frameDeltaSec * 1000;
      smoothedFrameTimeMs +=
        (frameTimeMs - smoothedFrameTimeMs) * FRAME_TIME_EMA_ALPHA;
      fpsSampleAccumSec += frameDeltaSec;
      fpsSampleFrames += 1;

      if (fpsSampleAccumSec >= FPS_SAMPLE_WINDOW_SEC) {
        fps = fpsSampleFrames / fpsSampleAccumSec;
        fpsSampleAccumSec = 0;
        fpsSampleFrames = 0;
      }

      return {
        fps,
        frameTimeMs: smoothedFrameTimeMs,
      };
    },
  };
};
