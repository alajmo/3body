import { describe, expect, it, vi } from "vitest";
import {
  createAuthoritativeViewportImmediateFireFeedbackState,
  queueAuthoritativeViewportImmediateFireFeedback,
  resetAuthoritativeViewportImmediateFireFeedback,
} from "./authoritativeViewportImmediateFire";

describe("authoritative viewport immediate-fire feedback", () => {
  it("queues local cannon feedback without spawning a predicted rocket visual", () => {
    const feedback = createAuthoritativeViewportImmediateFireFeedbackState();

    const result = queueAuthoritativeViewportImmediateFireFeedback({
      aimDir: { x: 1, y: 0 },
      feedback,
      nowSec: 2,
      playerPlanet: {
        pos: { x: 10, y: 20 },
        radius: 30,
      },
      rocketKind: "light",
      screenEffects: {
        cameraShake: 0,
        damageFlash: 0,
        hudFlicker: 0,
      },
    });

    expect(result.immediateCannonFlashState).toEqual({
      rocketKind: "light",
      startedAtSec: 2,
    });
    expect(feedback.burstStatesByKind.has("light")).toBe(false);
    expect(feedback.ghostStatesByKind.has("light")).toBe(false);
  });

  it("removes feedback visuals and clears all immediate-fire maps", () => {
    const feedback = createAuthoritativeViewportImmediateFireFeedbackState();
    const burstMesh = { name: "burst" };
    const ghostGroup = { name: "ghost" };
    const sceneRemoveSafe = vi.fn();

    feedback.feedbackByKind.set("heavy", {
      burstMesh,
      ghost: {
        body: {},
        flame: {},
        group: ghostGroup,
        trail: {},
      },
    } as never);
    feedback.burstStatesByKind.set("heavy", {} as never);
    feedback.ghostStatesByKind.set("heavy", {} as never);

    resetAuthoritativeViewportImmediateFireFeedback({
      feedback,
      sceneRemoveSafe,
    });

    expect(sceneRemoveSafe).toHaveBeenCalledWith(burstMesh, ghostGroup);
    expect(feedback.feedbackByKind).toHaveLength(0);
    expect(feedback.burstStatesByKind).toHaveLength(0);
    expect(feedback.ghostStatesByKind).toHaveLength(0);
  });
});
