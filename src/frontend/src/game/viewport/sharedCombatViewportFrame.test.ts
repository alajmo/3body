import { beforeEach, describe, expect, it, vi } from "vitest";

const viewportFrameMocks = vi.hoisted(() => ({
  syncSharedCombatEntityPresentationFrame: vi.fn(),
  syncSharedCombatPresentationFrame: vi.fn(),
  syncSharedCombatTransientPresentation: vi.fn(),
}));

vi.mock("./sharedCombatEntityPresentationFrame", () => ({
  syncSharedCombatEntityPresentationFrame:
    viewportFrameMocks.syncSharedCombatEntityPresentationFrame,
}));

vi.mock("./sharedCombatPresentationFrame", () => ({
  syncSharedCombatPresentationFrame:
    viewportFrameMocks.syncSharedCombatPresentationFrame,
}));

vi.mock("./sharedCombatTransientPresentation", () => ({
  syncSharedCombatTransientPresentation:
    viewportFrameMocks.syncSharedCombatTransientPresentation,
}));

import { syncSharedCombatViewportFrame } from "./sharedCombatViewportFrame";

describe("syncSharedCombatViewportFrame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs entity, presentation, and transient slices in order", () => {
    const presentationState = {
      gravityPulse: { startedAtSec: 1 },
      shieldImmediateFeedback: { startedAtSec: 2 },
    };
    viewportFrameMocks.syncSharedCombatPresentationFrame.mockReturnValue(
      presentationState,
    );

    const frame = {
      entity: { caches: null, launchBursts: null, rockets: null },
      presentation: { weapon: { cannon: null, lockRing: null } },
      transient: {
        blackHoleSwallows: {
          activeEffects: [],
          inactiveVisuals: [],
        },
        impactBursts: {
          bursts: [],
          maxVisibleBursts: 0,
          nowSec: 1,
          resolveBurst: () => null,
          visuals: [],
          z: {
            core: 1,
            glow: 2,
            ring: 3,
          },
        },
        nowSec: 1,
        planetExplosions: {
          activePlanetExplosions: [],
          inactivePlanetExplosionVisuals: [],
        },
      },
    };
    const visuals = {
      blackHole: { group: {}, ringMesh: {} },
      boost: null,
      cannon: null,
      gravityPulse: null,
      lockRing: null,
      shield: null,
    };

    const result = syncSharedCombatViewportFrame({
      frame: frame as never,
      nowSec: 4,
      visuals: visuals as never,
    });

    expect(
      viewportFrameMocks.syncSharedCombatEntityPresentationFrame,
    ).toHaveBeenCalledWith({
      frame: frame.entity,
    });
    expect(
      viewportFrameMocks.syncSharedCombatPresentationFrame,
    ).toHaveBeenCalledWith({
      frame: frame.presentation,
      nowSec: 4,
      visuals,
    });
    expect(
      viewportFrameMocks.syncSharedCombatTransientPresentation,
    ).toHaveBeenCalledWith(frame.transient);
    const entityCallOrder =
      viewportFrameMocks.syncSharedCombatEntityPresentationFrame
        .mock.invocationCallOrder[0];
    const presentationCallOrder =
      viewportFrameMocks.syncSharedCombatPresentationFrame.mock
        .invocationCallOrder[0];
    const transientCallOrder =
      viewportFrameMocks.syncSharedCombatTransientPresentation.mock
        .invocationCallOrder[0];
    expect(entityCallOrder).toBeDefined();
    expect(presentationCallOrder).toBeDefined();
    expect(transientCallOrder).toBeDefined();
    expect(
      entityCallOrder!,
    ).toBeLessThan(presentationCallOrder!);
    expect(
      presentationCallOrder!,
    ).toBeLessThan(transientCallOrder!);
    expect(result).toBe(presentationState);
  });
});
