import { describe, expect, it } from "vitest";
import {
  getAuthoritativeAbilitySlots,
  smoothAuthoritativeCameraAxis,
} from "./authoritativeViewportBehavior";

describe("authoritativeViewportBehavior", () => {
  it("keeps held boost active on every sampled frame", () => {
    const pendingAbilityRequests = {
      boost: true,
      gravityPulse: false,
      shield: false,
    };

    const firstFrameSlots = getAuthoritativeAbilitySlots(
      pendingAbilityRequests,
    );
    const secondFrameSlots = getAuthoritativeAbilitySlots(
      pendingAbilityRequests,
    );

    expect(firstFrameSlots).toBe(secondFrameSlots);
    expect(secondFrameSlots).toEqual(["w"]);
  });

  it("preserves shield, boost, then gravity pulse ordering", () => {
    expect(
      getAuthoritativeAbilitySlots({
        boost: true,
        gravityPulse: true,
        shield: true,
      }),
    ).toEqual(["q", "w", "g"]);
  });

  it("smooths camera motion toward the target instead of snapping", () => {
    const nextCenter = smoothAuthoritativeCameraAxis({
      currentValue: 0,
      followLerp: 6.1,
      frameDeltaSec: 1 / 60,
      targetValue: 240,
    });

    expect(nextCenter).toBeGreaterThan(0);
    expect(nextCenter).toBeLessThan(240);
  });

  it("leaves the camera in place when no frame time has elapsed", () => {
    expect(
      smoothAuthoritativeCameraAxis({
        currentValue: 48,
        followLerp: 6.1,
        frameDeltaSec: 0,
        targetValue: 240,
      }),
    ).toBe(48);
  });
});
