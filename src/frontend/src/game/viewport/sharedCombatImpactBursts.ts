import type { Vec2 } from "@3body/shared";
import type { SharedCombatImpactBurstVisual } from "./sharedCombatSceneResources";
import {
  hideSharedCombatImpactBurstVisual,
  syncSharedCombatImpactBurstVisual,
} from "./sharedCombatSupportVisuals";

export interface SharedCombatImpactBurstDepths {
  core: number;
  glow: number;
  ring: number;
}

export interface SharedCombatResolvedImpactBurst {
  absorbedByShield: boolean;
  durationSec: number;
  normal: Vec2;
  startedAtSec: number;
  targetPos: Vec2;
  targetRadius: number;
  targetRenderedRadius: number;
}

export const pruneSharedCombatImpactBursts = <
  Burst extends {
    startedAtSec: number;
  },
>({
  activeBursts,
  durationSec,
  nowSec,
}: {
  activeBursts: Burst[];
  durationSec: number;
  nowSec: number;
}) => {
  let writeIndex = 0;
  for (let index = 0; index < activeBursts.length; index += 1) {
    const burst = activeBursts[index]!;
    if (nowSec - burst.startedAtSec > durationSec) {
      continue;
    }

    activeBursts[writeIndex] = burst;
    writeIndex += 1;
  }
  activeBursts.length = writeIndex;
};

export const syncSharedCombatImpactBurstPool = <Burst>({
  bursts,
  maxVisibleBursts,
  nowSec,
  resolveBurst,
  styleBurstVisual,
  visuals,
  z,
}: {
  bursts: readonly Burst[];
  maxVisibleBursts: number;
  nowSec: number;
  resolveBurst: (burst: Burst) => SharedCombatResolvedImpactBurst | null;
  styleBurstVisual: (args: {
    burst: Burst;
    resolvedBurst: SharedCombatResolvedImpactBurst;
    visual: SharedCombatImpactBurstVisual;
  }) => void;
  visuals: readonly SharedCombatImpactBurstVisual[];
  z: SharedCombatImpactBurstDepths;
}) => {
  const visibleLimit = Math.min(visuals.length, Math.max(0, maxVisibleBursts));
  const firstBurstIndex = Math.max(0, bursts.length - visibleLimit);
  let visibleCount = 0;

  for (
    let burstIndex = firstBurstIndex;
    burstIndex < bursts.length && visibleCount < visibleLimit;
    burstIndex += 1
  ) {
    const burst = bursts[burstIndex]!;
    const resolvedBurst = resolveBurst(burst);
    if (resolvedBurst === null) {
      continue;
    }

    const visual = visuals[visibleCount]!;
    const didSync = syncSharedCombatImpactBurstVisual({
      burst: resolvedBurst,
      nowSec,
      visual,
      z,
    });
    if (!didSync) {
      continue;
    }

    styleBurstVisual({
      burst,
      resolvedBurst,
      visual,
    });
    visibleCount += 1;
  }

  for (let index = visibleCount; index < visuals.length; index += 1) {
    hideSharedCombatImpactBurstVisual(visuals[index]!);
  }
};
