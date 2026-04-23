import { describe, expect, it, vi } from "vitest";
import type { BlackHoleSwallowVisual } from "./blackHoleVisuals";
import {
  createAuthoritativeViewportTransientEvents,
  queueAuthoritativeViewportBlackHoleSwallowEvent,
  resetAuthoritativeViewportTransientEvents,
} from "./authoritativeViewportTransientEvents";

const createSwallowVisual = (): BlackHoleSwallowVisual =>
  ({
    material: {
      color: {
        set: vi.fn(),
      },
      opacity: 1,
      rotation: 1,
    },
    sprite: {
      visible: false,
    },
  }) as unknown as BlackHoleSwallowVisual;

describe("authoritative viewport transient events", () => {
  it("initializes and resets authoritative transient queues", () => {
    const events = createAuthoritativeViewportTransientEvents([
      "heavy",
      "light",
      "seeker",
    ]);
    events.activeBoostBursts.push({} as never);
    events.activeImpactBursts.push({} as never);
    events.activeLaunchBurstsByKind.heavy.push({} as never);
    events.activeBlackHoleSwallowEffects.push({} as never);

    resetAuthoritativeViewportTransientEvents({
      events,
      inactivePlanetExplosionVisuals: [],
      rocketKinds: ["heavy", "light", "seeker"],
    });

    expect(events.activeBoostBursts).toHaveLength(0);
    expect(events.activeImpactBursts).toHaveLength(0);
    expect(events.activeLaunchBurstsByKind.heavy).toHaveLength(0);
    expect(events.activeBlackHoleSwallowEffects).toHaveLength(0);
  });

  it("queues black-hole swallow feedback through the shared pool", () => {
    const events = createAuthoritativeViewportTransientEvents([
      "heavy",
      "light",
      "seeker",
    ]);
    const inactiveBlackHoleSwallowVisuals = [createSwallowVisual()];

    queueAuthoritativeViewportBlackHoleSwallowEvent({
      events,
      inactiveBlackHoleSwallowVisuals,
      nowSec: 3,
      swallow: {
        color: "#fff",
        radius: 12,
        startPos: { x: 1, y: 2 },
        targetPos: { x: 3, y: 4 },
      },
    });

    expect(events.activeBlackHoleSwallowEffects).toHaveLength(1);
    expect(inactiveBlackHoleSwallowVisuals).toHaveLength(0);
    expect(events.activeBlackHoleSwallowEffects[0]).toMatchObject({
      radius: 12,
      startedAtSec: 3,
      startPos: { x: 1, y: 2 },
      targetPos: { x: 3, y: 4 },
    });
  });
});
