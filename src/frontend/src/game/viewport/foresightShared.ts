import type { Vec2 } from "@3body/shared";
import { FIXED_STEP_SEC, clamp } from "@3body/shared";

export const FORESIGHT_TARGET_DISTANCE = 2_200;
export const FORESIGHT_WINDOW_SEC = 12;
const FORESIGHT_STEP_INTERVAL = 2;
export const FORESIGHT_STEP_SEC = FIXED_STEP_SEC * FORESIGHT_STEP_INTERVAL;
const FORESIGHT_DISPLAY_SAMPLE_COUNT = Math.ceil(6 / FORESIGHT_STEP_SEC) + 2;
export const MAX_FORESIGHT_SAMPLES = FORESIGHT_DISPLAY_SAMPLE_COUNT;

const getDistance = (from: Vec2, to: Vec2) =>
  Math.hypot(to.x - from.x, to.y - from.y);

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

export const trimForesightPathToDistance = (
  pathPoints: readonly Vec2[],
  maxDistance: number,
): Vec2[] => {
  if (pathPoints.length === 0) {
    return [];
  }

  if (pathPoints.length === 1 || maxDistance <= 0) {
    return [pathPoints[0]!];
  }

  const trimmedPath = [{ ...pathPoints[0]! }];
  let distance = 0;

  for (let index = 1; index < pathPoints.length; index += 1) {
    const previousPoint = pathPoints[index - 1]!;
    const point = pathPoints[index]!;
    const segmentLength = getDistance(previousPoint, point);
    if (segmentLength <= Number.EPSILON) {
      continue;
    }

    const nextDistance = distance + segmentLength;
    if (nextDistance >= maxDistance) {
      const remainingDistance = maxDistance - distance;
      const alpha = remainingDistance / segmentLength;
      trimmedPath.push({
        x: previousPoint.x + (point.x - previousPoint.x) * alpha,
        y: previousPoint.y + (point.y - previousPoint.y) * alpha,
      });
      return trimmedPath;
    }

    trimmedPath.push(point);
    distance = nextDistance;
  }

  return trimmedPath;
};

export const getForesightPathDistance = (pathPoints: readonly Vec2[]): number => {
  let distance = 0;

  for (let index = 1; index < pathPoints.length; index += 1) {
    distance += getDistance(pathPoints[index - 1]!, pathPoints[index]!);
  }

  return distance;
};

export const resampleForesightPath = (
  pathPoints: readonly Vec2[],
  sampleCount: number,
): Vec2[] => {
  if (pathPoints.length === 0 || sampleCount <= 0) {
    return [];
  }

  if (pathPoints.length === 1 || sampleCount === 1) {
    return [{ ...pathPoints[0]! }];
  }

  const normalizedSampleCount = Math.max(2, sampleCount);
  const totalDistance = getForesightPathDistance(pathPoints);
  if (totalDistance <= Number.EPSILON) {
    return [{ ...pathPoints[0]! }];
  }

  const resampledPath: Vec2[] = [];
  let traversedDistance = 0;
  let segmentIndex = 1;
  let segmentStart = pathPoints[0]!;
  let segmentEnd = pathPoints[1]!;
  let segmentLength = getDistance(segmentStart, segmentEnd);

  for (
    let sampleIndex = 0;
    sampleIndex < normalizedSampleCount;
    sampleIndex += 1
  ) {
    const targetDistance =
      (totalDistance * sampleIndex) / (normalizedSampleCount - 1);

    while (segmentIndex < pathPoints.length - 1) {
      if (segmentLength > Number.EPSILON) {
        const segmentEndDistance = traversedDistance + segmentLength;
        if (segmentEndDistance >= targetDistance) {
          break;
        }
        traversedDistance = segmentEndDistance;
      }

      segmentIndex += 1;
      segmentStart = pathPoints[segmentIndex - 1]!;
      segmentEnd = pathPoints[segmentIndex]!;
      segmentLength = getDistance(segmentStart, segmentEnd);
    }

    if (segmentLength <= Number.EPSILON) {
      resampledPath.push({ ...segmentEnd });
      continue;
    }

    const alpha = clamp(
      (targetDistance - traversedDistance) / segmentLength,
      0,
      1,
    );
    resampledPath.push({
      x: segmentStart.x + (segmentEnd.x - segmentStart.x) * alpha,
      y: segmentStart.y + (segmentEnd.y - segmentStart.y) * alpha,
    });
  }

  return resampledPath;
};
