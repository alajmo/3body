import type { RocketKind } from "@3body/shared";

export interface RocketMeshSilhouette {
  bodyLength: number;
  bodyRadius: number;
  canardAngle: number;
  canardHeight: number;
  canardLength: number;
  canardX: number;
  finAngle: number;
  finHeight: number;
  finLength: number;
  finX: number;
  flameOffset: number;
  noseLength: number;
  noseRadius: number;
  roll: number;
  sensorScale: number;
  sensorX: number;
  trailOffset: number;
}

export const ROCKET_MESH_SILHOUETTES = {
  heavy: {
    bodyLength: 0.8,
    bodyRadius: 0.84,
    canardAngle: 0.18,
    canardHeight: 0.34,
    canardLength: 0.18,
    canardX: 0.1,
    finAngle: 0.32,
    finHeight: 1.04,
    finLength: 0.34,
    finX: 0.2,
    flameOffset: 0.74,
    noseLength: 0.18,
    noseRadius: 0.84,
    roll: 0.03,
    sensorScale: 0.22,
    sensorX: 0.22,
    trailOffset: 0.98,
  },
  light: {
    bodyLength: 0.72,
    bodyRadius: 0.68,
    canardAngle: 0.24,
    canardHeight: 0.42,
    canardLength: 0.14,
    canardX: 0.22,
    finAngle: 0.48,
    finHeight: 1.18,
    finLength: 0.26,
    finX: 0.18,
    flameOffset: 0.72,
    noseLength: 0.24,
    noseRadius: 0.72,
    roll: 0.035,
    sensorScale: 0.26,
    sensorX: 0.3,
    trailOffset: 0.94,
  },
  seeker: {
    bodyLength: 0.7,
    bodyRadius: 0.66,
    canardAngle: 0.34,
    canardHeight: 0.52,
    canardLength: 0.18,
    canardX: 0.24,
    finAngle: 0.54,
    finHeight: 0.8,
    finLength: 0.22,
    finX: 0.2,
    flameOffset: 0.7,
    noseLength: 0.3,
    noseRadius: 0.66,
    roll: 0.04,
    sensorScale: 0.28,
    sensorX: 0.34,
    trailOffset: 0.92,
  },
} as const satisfies Record<RocketKind, RocketMeshSilhouette>;
