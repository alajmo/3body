import { cloneGameTuningDocument, CURRENT_GAME_TUNING } from "@3body/shared";
import { afterEach, describe, expect, it } from "vitest";
import { applyRuntimeTuningDocument } from "../runtimeTuning";
import {
  createAmbientBoundaryDebrisVisual,
  updateAmbientBoundaryDebrisVisual,
  type AmbientBoundaryDebrisVisual,
} from "./ambientBoundaryDebris";

const ARENA_RADIUS = 15000;
const OUTER_RADIUS = 17000;

const countActiveFallingShards = (
  visual: AmbientBoundaryDebrisVisual,
): number =>
  visual.fallingLayers.reduce((count, layer) => count + layer.shards.length, 0);

const getClosestActiveFallingShardRadius = (
  visual: AmbientBoundaryDebrisVisual,
): number => {
  let closest = Number.POSITIVE_INFINITY;

  for (const layer of visual.fallingLayers) {
    for (const shard of layer.shards) {
      closest = Math.min(closest, Math.hypot(shard.posX, shard.posY));
    }
  }

  return closest;
};

const getClosestActiveFallingShardRadiusForKind = (
  visual: AmbientBoundaryDebrisVisual,
  kind: "primary" | "secondary",
): number => {
  let closest = Number.POSITIVE_INFINITY;

  for (const layer of visual.fallingLayers) {
    if (layer.kind !== kind) {
      continue;
    }
    for (const shard of layer.shards) {
      closest = Math.min(closest, Math.hypot(shard.posX, shard.posY));
    }
  }

  return closest;
};

const disposeAmbientBoundaryDebrisVisual = (
  visual: AmbientBoundaryDebrisVisual,
) => {
  for (const geometry of visual.bandGeometries) {
    geometry.dispose();
  }
  for (const material of visual.bandMaterials) {
    material.dispose();
  }
  visual.geometry.dispose();
  (visual.points.material as { dispose: () => void }).dispose();
};

afterEach(() => {
  applyRuntimeTuningDocument(CURRENT_GAME_TUNING);
});

describe("ambientBoundaryDebris", () => {
  it("does not spawn falling debris when inward drift is disabled", () => {
    const tunedDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.arena.asteroidField.large.randomization = 0;
    tunedDocument.gameplay.arena.asteroidField.micro.randomization = 0;
    tunedDocument.gameplay.arena.asteroidField.small.randomization = 0;
    applyRuntimeTuningDocument(tunedDocument);

    const visual = createAmbientBoundaryDebrisVisual();

    try {
      let maxActiveShards = 0;
      for (let step = 0; step <= 180; step += 1) {
        updateAmbientBoundaryDebrisVisual({
          innerRadius: ARENA_RADIUS,
          nowSec: step,
          outerRadius: OUTER_RADIUS,
          visual,
        });
        maxActiveShards = Math.max(
          maxActiveShards,
          countActiveFallingShards(visual),
        );
      }

      expect(maxActiveShards).toBe(0);
    } finally {
      disposeAmbientBoundaryDebrisVisual(visual);
    }
  });

  it("spawns falling debris that can travel deep toward the center", () => {
    const tunedDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.arena.asteroidField.large.randomization = 1;
    tunedDocument.gameplay.arena.asteroidField.micro.randomization = 1;
    tunedDocument.gameplay.arena.asteroidField.small.randomization = 1;
    applyRuntimeTuningDocument(tunedDocument);

    const visual = createAmbientBoundaryDebrisVisual();

    try {
      let maxActiveShards = 0;
      let closestRadius = Number.POSITIVE_INFINITY;
      for (let step = 0; step <= 180; step += 1) {
        updateAmbientBoundaryDebrisVisual({
          innerRadius: ARENA_RADIUS,
          nowSec: step,
          outerRadius: OUTER_RADIUS,
          visual,
        });
        maxActiveShards = Math.max(
          maxActiveShards,
          countActiveFallingShards(visual),
        );
        closestRadius = Math.min(
          closestRadius,
          getClosestActiveFallingShardRadius(visual),
        );
      }

      expect(maxActiveShards).toBeGreaterThan(0);
      expect(closestRadius).toBeLessThan(ARENA_RADIUS * 0.2);
    } finally {
      disposeAmbientBoundaryDebrisVisual(visual);
    }
  });

  it("uses per-tier spawn-rate tuning to change how many large shards fall", () => {
    const lowRateDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);
    lowRateDocument.gameplay.arena.asteroidField.large.randomization = 1;
    lowRateDocument.gameplay.arena.asteroidField.large.spawnRatePerSec = 0.1;
    lowRateDocument.gameplay.arena.asteroidField.micro.randomization = 0;
    lowRateDocument.gameplay.arena.asteroidField.small.randomization = 0;
    applyRuntimeTuningDocument(lowRateDocument);

    const lowRateVisual = createAmbientBoundaryDebrisVisual();
    let lowPeakPrimaryCount = 0;

    try {
      for (let step = 0; step <= 180; step += 1) {
        updateAmbientBoundaryDebrisVisual({
          innerRadius: ARENA_RADIUS,
          nowSec: step,
          outerRadius: OUTER_RADIUS,
          visual: lowRateVisual,
        });
        lowPeakPrimaryCount = Math.max(
          lowPeakPrimaryCount,
          lowRateVisual.fallingLayers.find((layer) => layer.kind === "primary")
            ?.shards.length ?? 0,
        );
      }
    } finally {
      disposeAmbientBoundaryDebrisVisual(lowRateVisual);
    }

    const highRateDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);
    highRateDocument.gameplay.arena.asteroidField.large.randomization = 1;
    highRateDocument.gameplay.arena.asteroidField.large.spawnRatePerSec = 1.2;
    highRateDocument.gameplay.arena.asteroidField.micro.randomization = 0;
    highRateDocument.gameplay.arena.asteroidField.small.randomization = 0;
    applyRuntimeTuningDocument(highRateDocument);

    const highRateVisual = createAmbientBoundaryDebrisVisual();
    let highPeakPrimaryCount = 0;

    try {
      for (let step = 0; step <= 180; step += 1) {
        updateAmbientBoundaryDebrisVisual({
          innerRadius: ARENA_RADIUS,
          nowSec: step,
          outerRadius: OUTER_RADIUS,
          visual: highRateVisual,
        });
        highPeakPrimaryCount = Math.max(
          highPeakPrimaryCount,
          highRateVisual.fallingLayers.find((layer) => layer.kind === "primary")
            ?.shards.length ?? 0,
        );
      }
    } finally {
      disposeAmbientBoundaryDebrisVisual(highRateVisual);
    }

    expect(highPeakPrimaryCount).toBeGreaterThan(lowPeakPrimaryCount);
  });

  it("can suppress ambient falling debris while keeping the ring active", () => {
    const tunedDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.arena.asteroidField.large.randomization = 1;
    tunedDocument.gameplay.arena.asteroidField.micro.randomization = 1;
    tunedDocument.gameplay.arena.asteroidField.small.randomization = 1;
    applyRuntimeTuningDocument(tunedDocument);

    const visual = createAmbientBoundaryDebrisVisual();

    try {
      for (let step = 0; step <= 30; step += 1) {
        updateAmbientBoundaryDebrisVisual({
          enableFallingDebris: false,
          innerRadius: ARENA_RADIUS,
          nowSec: step,
          outerRadius: OUTER_RADIUS,
          visual,
        });

        expect(countActiveFallingShards(visual)).toBe(0);
        expect(visual.fallingGroup.visible).toBe(false);
        expect(visual.bandGroup.visible).toBe(true);
        expect(visual.points.visible).toBe(true);
      }
    } finally {
      disposeAmbientBoundaryDebrisVisual(visual);
    }
  });

  it("uses large inward drift randomization to change the large shard path depth", () => {
    const lowDriftDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);
    lowDriftDocument.gameplay.arena.asteroidField.large.randomization = 0.2;
    lowDriftDocument.gameplay.arena.asteroidField.micro.randomization = 0;
    lowDriftDocument.gameplay.arena.asteroidField.small.randomization = 0;
    applyRuntimeTuningDocument(lowDriftDocument);

    const lowDriftVisual = createAmbientBoundaryDebrisVisual();
    let lowClosestRadius = Number.POSITIVE_INFINITY;

    try {
      for (let step = 0; step <= 180; step += 1) {
        updateAmbientBoundaryDebrisVisual({
          innerRadius: ARENA_RADIUS,
          nowSec: step,
          outerRadius: OUTER_RADIUS,
          visual: lowDriftVisual,
        });
        lowClosestRadius = Math.min(
          lowClosestRadius,
          getClosestActiveFallingShardRadiusForKind(lowDriftVisual, "primary"),
        );
      }
    } finally {
      disposeAmbientBoundaryDebrisVisual(lowDriftVisual);
    }

    const highDriftDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);
    highDriftDocument.gameplay.arena.asteroidField.large.randomization = 1;
    highDriftDocument.gameplay.arena.asteroidField.micro.randomization = 0;
    highDriftDocument.gameplay.arena.asteroidField.small.randomization = 0;
    applyRuntimeTuningDocument(highDriftDocument);

    const highDriftVisual = createAmbientBoundaryDebrisVisual();
    let highClosestRadius = Number.POSITIVE_INFINITY;

    try {
      for (let step = 0; step <= 180; step += 1) {
        updateAmbientBoundaryDebrisVisual({
          innerRadius: ARENA_RADIUS,
          nowSec: step,
          outerRadius: OUTER_RADIUS,
          visual: highDriftVisual,
        });
        highClosestRadius = Math.min(
          highClosestRadius,
          getClosestActiveFallingShardRadiusForKind(highDriftVisual, "primary"),
        );
      }
    } finally {
      disposeAmbientBoundaryDebrisVisual(highDriftVisual);
    }

    expect(highClosestRadius).toBeLessThan(lowClosestRadius);
  });
});
