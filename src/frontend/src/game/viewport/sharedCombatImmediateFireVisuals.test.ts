import type { RocketKind } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  hideSharedCombatImmediateFireFeedbackVisual,
  syncSharedCombatImmediateFireFeedback,
  syncSharedCombatRocketVisualTransform,
  type SharedCombatImmediateFireBurstState,
  type SharedCombatImmediateFireFeedbackVisual,
  type SharedCombatImmediateGhostRocketState,
  type SharedCombatRocketAppearance,
  type SharedCombatRocketVisual,
} from "./sharedCombatImmediateFireVisuals";

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

const createMockMesh = () => ({
  position: createMockVector(),
  rotation: { z: 0 },
  scale: createMockVector(),
  visible: false,
});

const createMockRocketVisual = (): SharedCombatRocketVisual => ({
  body: createMockMesh() as never,
  flame: createMockMesh() as never,
  group: {
    position: createMockVector(),
    rotation: { z: 0 },
    visible: false,
  } as never,
  trail: createMockMesh() as never,
});

const createMockFeedbackVisual =
  (): SharedCombatImmediateFireFeedbackVisual => ({
    burstMesh: createMockMesh() as never,
    ghost: createMockRocketVisual(),
  });

const rocketAppearances: Record<
  "heavy" | "light" | "seeker",
  SharedCombatRocketAppearance
> = {
  heavy: {
    bodyScale: { x: 20, y: 6 },
    flameScale: { x: 9, y: 4 },
    trailScale: { x: 14, y: 3 },
  },
  light: {
    bodyScale: { x: 14, y: 4 },
    flameScale: { x: 7, y: 3 },
    trailScale: { x: 10, y: 2.5 },
  },
  seeker: {
    bodyScale: { x: 16, y: 5 },
    flameScale: { x: 7.5, y: 3.2 },
    trailScale: { x: 11, y: 2.8 },
  },
};

describe("syncSharedCombatRocketVisualTransform", () => {
  it("positions and scales the shared rocket visual", () => {
    const visual = createMockRocketVisual();

    syncSharedCombatRocketVisualTransform({
      appearance: rocketAppearances.light,
      position: { x: 24, y: -8 },
      velocity: { x: 0, y: 10 },
      visual,
      z: 5.9,
    });

    expect(visual.group.visible).toBe(true);
    expect(visual.group.position.x).toBe(24);
    expect(visual.group.position.y).toBe(-8);
    expect(visual.group.position.z).toBe(5.9);
    expect(visual.group.rotation.z).toBeCloseTo(Math.PI / 2);
    expect(visual.body.scale.x).toBe(14);
    expect(visual.trail.position.x).toBeCloseTo(-8.4);
    expect(visual.flame.scale.y).toBe(3);
  });
});

describe("hideSharedCombatImmediateFireFeedbackVisual", () => {
  it("hides both the burst mesh and the ghost rocket", () => {
    const visual = createMockFeedbackVisual();
    visual.burstMesh.visible = true;
    visual.ghost.group.visible = true;

    hideSharedCombatImmediateFireFeedbackVisual(visual);

    expect(visual.burstMesh.visible).toBe(false);
    expect(visual.ghost.group.visible).toBe(false);
  });
});

describe("syncSharedCombatImmediateFireFeedback", () => {
  it("updates burst placement and keeps the ghost active when it should not yield", () => {
    const feedbackByKind = new Map<
      RocketKind,
      SharedCombatImmediateFireFeedbackVisual
    >([["light", createMockFeedbackVisual()] as const]);
    const burstStatesByKind = new Map<
      RocketKind,
      SharedCombatImmediateFireBurstState
    >([
      [
        "light",
        {
          direction: { x: 1, y: 0 },
          origin: { x: 10, y: 12 },
          radius: 5,
          startedAtSec: 1,
        },
      ],
    ]);
    const ghostStatesByKind = new Map<
      RocketKind,
      SharedCombatImmediateGhostRocketState
    >([
      [
        "light",
        {
          direction: { x: 1, y: 0 },
          origin: { x: 20, y: 12 },
          startedAtSec: 1,
          velocity: { x: 50, y: 0 },
        },
      ],
    ]);

    syncSharedCombatImmediateFireFeedback({
      burstDurationSec: 0.12,
      burstStatesByKind,
      feedbackByKind,
      ghostDurationSec: 0.18,
      ghostStatesByKind,
      nowSec: 1.05,
      rocketAppearances,
      rocketSpeeds: {
        heavy: 220,
        light: 300,
        seeker: 260,
      },
      shouldYieldGhost: () => false,
    });

    const visual = feedbackByKind.get("light")!;
    expect(visual.burstMesh.visible).toBe(true);
    expect(visual.burstMesh.position.x).toBeGreaterThan(10);
    expect(visual.ghost.group.visible).toBe(true);
    expect(ghostStatesByKind.has("light")).toBe(true);
  });

  it("drops expired bursts and yields ghosts when authoritative rockets take over", () => {
    const feedbackByKind = new Map<
      RocketKind,
      SharedCombatImmediateFireFeedbackVisual
    >([["seeker", createMockFeedbackVisual()] as const]);
    const burstStatesByKind = new Map<
      RocketKind,
      SharedCombatImmediateFireBurstState
    >([
      [
        "seeker",
        {
          direction: { x: 0, y: 1 },
          origin: { x: 0, y: 0 },
          radius: 5,
          startedAtSec: 0,
        },
      ],
    ]);
    const ghostStatesByKind = new Map<
      RocketKind,
      SharedCombatImmediateGhostRocketState
    >([
      [
        "seeker",
        {
          direction: { x: 0, y: 1 },
          origin: { x: 0, y: 0 },
          startedAtSec: 0.02,
          velocity: { x: 0, y: 100 },
        },
      ],
    ]);

    syncSharedCombatImmediateFireFeedback({
      burstDurationSec: 0.12,
      burstStatesByKind,
      feedbackByKind,
      ghostDurationSec: 0.18,
      ghostStatesByKind,
      nowSec: 0.2,
      rocketAppearances,
      rocketSpeeds: {
        heavy: 220,
        light: 300,
        seeker: 260,
      },
      shouldYieldGhost: () => true,
    });

    const visual = feedbackByKind.get("seeker")!;
    expect(visual.burstMesh.visible).toBe(false);
    expect(visual.ghost.group.visible).toBe(false);
    expect(burstStatesByKind.has("seeker")).toBe(false);
    expect(ghostStatesByKind.has("seeker")).toBe(false);
  });
});
