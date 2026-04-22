import { describe, expect, it } from "vitest";
import type { SharedCombatImpactBurstVisual } from "./sharedCombatSceneResources";
import {
  pruneSharedCombatImpactBursts,
  styleSharedCombatImpactBurstVisual,
  syncSharedCombatImpactBurstPool,
} from "./sharedCombatImpactBursts";

const createMockVector = () => ({
  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  },
  x: 0,
  y: 0,
  z: 0,
});

const createMockColor = () => ({
  copy(value: { getHexString?: () => string; value?: string }) {
    this.value =
      "getHexString" in value && typeof value.getHexString === "function"
        ? `#${value.getHexString()}`
        : (value.value ?? "");
    return this;
  },
  lerp(value: { getHexString?: () => string; value?: string }, alpha: number) {
    const nextValue =
      "getHexString" in value && typeof value.getHexString === "function"
        ? `#${value.getHexString()}`
        : (value.value ?? "");
    this.value = `${this.value}|${nextValue}|${alpha}`;
    return this;
  },
  set(value: string) {
    this.value = value;
    return this;
  },
  value: "",
});

const createMockMesh = () => ({
  position: createMockVector(),
  scale: createMockVector(),
  visible: false,
});

const createMockMaterial = () => ({
  color: createMockColor(),
  opacity: 0,
});

const createMockImpactBurstVisual = (): SharedCombatImpactBurstVisual => ({
  coreMaterial: createMockMaterial() as never,
  coreMesh: createMockMesh() as never,
  glowMaterial: createMockMaterial() as never,
  glowMesh: createMockMesh() as never,
  ringMaterial: createMockMaterial() as never,
  ringMesh: createMockMesh() as never,
});

describe("pruneSharedCombatImpactBursts", () => {
  it("removes expired burst states in place", () => {
    const activeBursts = [
      { id: 1, startedAtSec: 0 },
      { id: 2, startedAtSec: 0.4 },
      { id: 3, startedAtSec: 0.8 },
    ];

    pruneSharedCombatImpactBursts({
      activeBursts,
      durationSec: 0.5,
      nowSec: 1,
    });

    expect(activeBursts).toEqual([{ id: 3, startedAtSec: 0.8 }]);
  });
});

describe("syncSharedCombatImpactBurstPool", () => {
  it("syncs the newest visible bursts and hides unused visuals", () => {
    const visuals = [
      createMockImpactBurstVisual(),
      createMockImpactBurstVisual(),
    ];
    const styledBurstIds: number[] = [];

    syncSharedCombatImpactBurstPool({
      bursts: [
        { color: "#ff7733", id: 1, startedAtSec: 0.1 },
        { color: "#44ccff", id: 2, startedAtSec: 0.2 },
      ],
      maxVisibleBursts: 1,
      nowSec: 0.25,
      resolveBurst: (burst) => ({
        absorbedByShield: false,
        durationSec: 0.5,
        normal: { x: 1, y: 0 },
        startedAtSec: burst.startedAtSec,
        targetPos: { x: burst.id * 10, y: 5 },
        targetRadius: 12,
        targetRenderedRadius: 12,
      }),
      styleBurstVisual: ({ burst, visual }) => {
        styledBurstIds.push(burst.id);
        visual.glowMaterial.color.set(burst.color);
      },
      visuals,
      z: {
        core: 5.15,
        glow: 5.05,
        ring: 5.25,
      },
    });

    expect(styledBurstIds).toEqual([2]);
    expect(visuals[0]!.glowMesh.visible).toBe(true);
    expect(
      (visuals[0]!.glowMaterial.color as unknown as { value: string }).value,
    ).toBe("#44ccff");
    expect(visuals[1]!.glowMesh.visible).toBe(false);
    expect(visuals[1]!.glowMaterial.opacity).toBe(0);
  });
});

describe("styleSharedCombatImpactBurstVisual", () => {
  it("applies the shared sandbox-style tinting for impact bursts", () => {
    const visual = createMockImpactBurstVisual();

    styleSharedCombatImpactBurstVisual({
      absorbedByShield: false,
      burstColor: "#44ccff",
      visual,
    });

    expect(
      (visual.glowMaterial.color as unknown as { value: string }).value,
    ).toContain("#");
    expect(
      (visual.ringMaterial.color as unknown as { value: string }).value,
    ).toContain("#");
    expect(
      (visual.coreMaterial.color as unknown as { value: string }).value,
    ).toContain("#fff5dd");
  });

  it("switches shield-absorbed bursts to the shared shield color treatment", () => {
    const visual = createMockImpactBurstVisual();

    styleSharedCombatImpactBurstVisual({
      absorbedByShield: true,
      burstColor: "#ff7733",
      visual,
    });

    expect(
      (visual.glowMaterial.color as unknown as { value: string }).value,
    ).not.toContain("#ff7733");
    expect(
      (visual.ringMaterial.color as unknown as { value: string }).value,
    ).not.toContain("#ff7733");
  });
});
