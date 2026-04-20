import { describe, expect, it } from "vitest";
import {
  getRocketImpactCameraShake,
  getRocketImpactHudFlicker,
  getRocketImpactScreenFlash,
  getViewportCameraShakeOffsets,
} from "./cameraShake";

describe("cameraShake", () => {
  it("gives heavier rockets a stronger camera impulse than lighter ones", () => {
    expect(
      getRocketImpactCameraShake({
        absorbedByShield: false,
        rocketKind: "heavy",
      }),
    ).toBeGreaterThan(
      getRocketImpactCameraShake({
        absorbedByShield: false,
        rocketKind: "light",
      }),
    );
    expect(
      getRocketImpactCameraShake({
        absorbedByShield: false,
        rocketKind: "seeker",
      }),
    ).toBeGreaterThan(
      getRocketImpactCameraShake({
        absorbedByShield: false,
        rocketKind: "light",
      }),
    );
  });

  it("softens the impulse when a rocket is absorbed by the shield", () => {
    expect(
      getRocketImpactCameraShake({
        absorbedByShield: true,
        rocketKind: "heavy",
      }),
    ).toBeLessThan(
      getRocketImpactCameraShake({
        absorbedByShield: false,
        rocketKind: "heavy",
      }),
    );
  });

  it("gives missile hits both a screen flash and a HUD flicker envelope", () => {
    expect(
      getRocketImpactScreenFlash({
        absorbedByShield: false,
        rocketKind: "heavy",
      }),
    ).toBeGreaterThan(
      getRocketImpactScreenFlash({
        absorbedByShield: false,
        rocketKind: "light",
      }),
    );
    expect(
      getRocketImpactHudFlicker({
        absorbedByShield: false,
        rocketKind: "heavy",
      }),
    ).toBeGreaterThan(
      getRocketImpactHudFlicker({
        absorbedByShield: false,
        rocketKind: "light",
      }),
    );
  });

  it("softens the screen flash and HUD flicker when the shield catches the hit", () => {
    expect(
      getRocketImpactScreenFlash({
        absorbedByShield: true,
        rocketKind: "seeker",
      }),
    ).toBeLessThan(
      getRocketImpactScreenFlash({
        absorbedByShield: false,
        rocketKind: "seeker",
      }),
    );
    expect(
      getRocketImpactHudFlicker({
        absorbedByShield: true,
        rocketKind: "seeker",
      }),
    ).toBeLessThan(
      getRocketImpactHudFlicker({
        absorbedByShield: false,
        rocketKind: "seeker",
      }),
    );
  });

  it("returns zero offset when there is no shake", () => {
    const offsets = getViewportCameraShakeOffsets({
      cameraShake: 0,
      followWorldHeight: 1_400,
      nowSec: 2,
      visibleWorldHeight: 1_400,
    });

    expect(offsets.x).toBe(0);
    expect(offsets.y).toBe(0);
  });
});
