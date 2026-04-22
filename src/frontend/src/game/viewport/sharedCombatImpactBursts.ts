import type { Vec2 } from "@3body/shared";
import { Color } from "three/webgpu";
import { getRuntimeTuningDocument } from "../runtimeTuning";
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

const IMPACT_CORE_BASE = new Color("#fff5dd");
const CACHED_COLORS = new Map<string, Color>();
const TINTED_COLORS = new Map<string, Color>();

const getCachedColor = (value: string): Color => {
  let cached = CACHED_COLORS.get(value);
  if (cached === undefined) {
    cached = new Color(value);
    CACHED_COLORS.set(value, cached);
  }

  return cached;
};

const getTintedColor = (
  value: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): Color => {
  const cacheKey = `${value}|${hueOffset}|${saturationOffset}|${lightnessOffset}`;
  let cached = TINTED_COLORS.get(cacheKey);
  if (cached === undefined) {
    cached = new Color(value);
    cached.offsetHSL(hueOffset, saturationOffset, lightnessOffset);
    TINTED_COLORS.set(cacheKey, cached);
  }

  return cached;
};

export const styleSharedCombatImpactBurstVisual = ({
  absorbedByShield,
  burstColor,
  visual,
}: {
  absorbedByShield: boolean;
  burstColor: string;
  visual: SharedCombatImpactBurstVisual;
}) => {
  const impactColor = absorbedByShield
    ? getRuntimeTuningDocument().visuals.abilities.shieldColor
    : burstColor;
  const glowTint = getTintedColor(
    impactColor,
    absorbedByShield ? -0.04 : -0.02,
    absorbedByShield ? 0.2 : 0.12,
    absorbedByShield ? 0.24 : 0.14,
  );
  const ringTint = getTintedColor(
    impactColor,
    absorbedByShield ? -0.03 : -0.01,
    absorbedByShield ? 0.24 : 0.18,
    absorbedByShield ? 0.34 : 0.28,
  );

  visual.glowMaterial.color.copy(glowTint);
  visual.coreMaterial.color
    .copy(IMPACT_CORE_BASE)
    .lerp(getCachedColor(impactColor), absorbedByShield ? 0.4 : 0.28);
  visual.ringMaterial.color.copy(ringTint);
};

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
