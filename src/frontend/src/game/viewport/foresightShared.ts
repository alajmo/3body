import type { ForesightPathVisualTuning, Vec2 } from "@3body/shared";
import { FIXED_STEP_SEC, clamp } from "@3body/shared";

const FORESIGHT_NEAR_THRESHOLD = 0.28;
const FORESIGHT_MID_THRESHOLD = 0.68;
const FORESIGHT_FADE_END = 0.92;

export const FORESIGHT_WINDOW_SEC = 6;
export const FORESIGHT_STEP_INTERVAL = 2;
export const FORESIGHT_STEP_SEC = FIXED_STEP_SEC * FORESIGHT_STEP_INTERVAL;
export const MAX_FORESIGHT_SAMPLES =
  Math.ceil(FORESIGHT_WINDOW_SEC / FORESIGHT_STEP_SEC) + 2;

const getDistance = (from: Vec2, to: Vec2) =>
  Math.hypot(to.x - from.x, to.y - from.y);

const getPointProgress = (index: number, pointCount: number) =>
  pointCount <= 1 ? 0 : index / (pointCount - 1);

const getPointStride = (progress: number, tuning: ForesightPathVisualTuning) =>
  Math.max(
    1,
    progress < FORESIGHT_NEAR_THRESHOLD
      ? tuning.nearStride
      : progress < FORESIGHT_MID_THRESHOLD
        ? tuning.midStride
        : tuning.farStride,
  );

export const clipForesightPathAtDistance = (
  pathPoints: readonly Vec2[],
  hiddenDistance: number,
): Vec2[] => {
  if (pathPoints.length < 2 || hiddenDistance <= 0) {
    return [...pathPoints];
  }

  let remainingHiddenDistance = hiddenDistance;

  for (let index = 1; index < pathPoints.length; index += 1) {
    const previousPoint = pathPoints[index - 1]!;
    const point = pathPoints[index]!;
    const segmentLength = getDistance(previousPoint, point);
    if (segmentLength <= Number.EPSILON) {
      continue;
    }

    if (remainingHiddenDistance >= segmentLength) {
      remainingHiddenDistance -= segmentLength;
      continue;
    }

    const progress = remainingHiddenDistance / segmentLength;
    return [
      {
        x: previousPoint.x + (point.x - previousPoint.x) * progress,
        y: previousPoint.y + (point.y - previousPoint.y) * progress,
      },
      ...pathPoints.slice(index),
    ];
  }

  return [];
};

export const getForesightPointOpacity = ({
  index,
  pointCount,
  tuning,
}: {
  index: number;
  pointCount: number;
  tuning: ForesightPathVisualTuning;
}) => {
  const progress = getPointProgress(index, pointCount);
  const fade = clamp(1 - progress / FORESIGHT_FADE_END, 0, 1);
  const step = getPointStride(progress, tuning);
  const visible =
    tuning.showDots && progress < FORESIGHT_FADE_END && index % step === 0;

  return visible ? fade : 0;
};
