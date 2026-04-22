import { describe, expect, it } from "vitest";
import { syncSharedCombatPresentationFrame } from "./sharedCombatPresentationFrame";

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

const createMockShieldVisual = () => ({
  arcOpacityUniform: { value: 0 },
  crestOpacityUniform: { value: 0 },
  glowOpacityUniform: { value: 0 },
  group: {
    position: createMockVector(),
    rotation: { z: 0 },
    scale: createMockVector(),
    visible: false,
  },
  panelOpacityUniform: { value: 0 },
});

const createMockGravityPulseVisual = () => ({
  coreMaterial: { opacity: 0 },
  coreMesh: createMockMesh(),
  echoMaterial: { opacity: 0 },
  echoMesh: createMockMesh(),
  ringMaterial: { opacity: 0 },
  ringMesh: createMockMesh(),
});

const createMockCannonVisual = () => {
  let accent = "";
  return {
    barrelBandMesh: createMockMesh(),
    barrelMesh: createMockMesh(),
    breechMesh: createMockMesh(),
    flashMaterial: {
      color: {
        set(_value: string) {},
      },
      opacity: 0,
    },
    flashMesh: createMockMesh(),
    group: {
      position: createMockVector(),
      rotation: { z: 0 },
      visible: false,
    },
    muzzleMesh: createMockMesh(),
    setAccentColor(value: string) {
      accent = value;
    },
    stemMesh: createMockMesh(),
    getAccent: () => accent,
  };
};

describe("syncSharedCombatPresentationFrame", () => {
  it("syncs the shared presentation frame into the common visuals", () => {
    const shieldVisual = createMockShieldVisual();
    const gravityPulseVisual = createMockGravityPulseVisual();
    const cannonVisual = createMockCannonVisual();
    const blackHoleVisual = {
      group: {
        position: createMockVector(),
        scale: createMockVector(),
        visible: false,
      },
      ringMesh: {
        rotation: { z: 0 },
      },
    };

    const pulse = {
      effectRadius: 220,
      origin: { x: 12, y: -6 },
      planetRadius: 18,
      startedAtSec: 1,
    };

    const result = syncSharedCombatPresentationFrame({
      frame: {
        blackHole: {
          killRadius: 44,
          pos: { x: -20, y: 18 },
          z: 4,
        },
        boost: {
          activeBursts: [],
          aimTarget: { x: 10, y: 10 },
          heldBoosting: false,
          maxParticlesPerBurst: 0,
          playerBody: null,
        },
        gravityPulse: {
          durationSec: 0.95,
          pulse,
          visibleWorldHeight: 900,
          z: {
            core: 2.2,
            echo: 2.3,
            ring: 2.35,
          },
        },
        shield: {
          active: true,
          activeAimDir: { x: 1, y: 0 },
          bursts: [],
          planet: {
            id: 7,
            pos: { x: 30, y: -18 },
            shieldLoad: 6,
            shieldMaxLoad: 10,
          },
          shieldRadius: 24,
        },
        weapon: {
          cannon: {
            accent: "#86ecff",
            aimTarget: { x: 52, y: -2 },
            flashAccent: "#ffbf7d",
            flashAgeSec: 0.05,
            layout: {
              bandLenWorld: 2,
              bandRadiusWorld: 0.5,
              barrelLenWorld: 10,
              barrelRadiusWorld: 0.75,
              breechDepthWorld: 1.2,
              breechLenWorld: 4,
              breechWidthWorld: 1.8,
              flashDurationSec: 0.14,
              flashRadiusWorld: 3,
              muzzleLenWorld: 1.4,
              muzzleRadiusWorld: 0.9,
              stemLenWorld: 2.8,
              stemRadiusWorld: 0.55,
            },
            position: { x: 30, y: -18 },
            surfaceOffset: 24,
            visible: true,
            z: 6,
          },
          lockRing: null,
        },
      },
      nowSec: 1.1,
      visuals: {
        blackHole: blackHoleVisual as never,
        boost: null,
        cannon: cannonVisual as never,
        gravityPulse: gravityPulseVisual as never,
        lockRing: null,
        shield: shieldVisual as never,
      },
    });

    expect(result.gravityPulse).toEqual(pulse);
    expect(result.shieldImmediateFeedback).toBeNull();
    expect(blackHoleVisual.group.visible).toBe(true);
    expect(blackHoleVisual.group.position.x).toBe(-20);
    expect(shieldVisual.group.visible).toBe(true);
    expect(cannonVisual.group.visible).toBe(true);
    expect(cannonVisual.getAccent()).toBe("#86ecff");
    expect(gravityPulseVisual.coreMesh.visible).toBe(true);
  });

  it("returns cleared transient state and hides visuals when the frame is inactive", () => {
    const shieldVisual = createMockShieldVisual();
    const gravityPulseVisual = createMockGravityPulseVisual();
    const cannonVisual = createMockCannonVisual();
    const blackHoleVisual = {
      group: {
        position: createMockVector(),
        scale: createMockVector(),
        visible: true,
      },
      ringMesh: {
        rotation: { z: 0 },
      },
    };
    shieldVisual.group.visible = true;
    cannonVisual.group.visible = true;
    gravityPulseVisual.coreMesh.visible = true;

    const result = syncSharedCombatPresentationFrame({
      frame: {
        blackHole: null,
        boost: {
          activeBursts: [],
          aimTarget: { x: 0, y: 0 },
          heldBoosting: false,
          maxParticlesPerBurst: 0,
          playerBody: null,
        },
        gravityPulse: {
          durationSec: 0.95,
          pulse: {
            effectRadius: 220,
            origin: { x: 12, y: -6 },
            planetRadius: 18,
            startedAtSec: 1,
          },
          visibleWorldHeight: 900,
          z: {
            core: 2.2,
            echo: 2.3,
            ring: 2.35,
          },
        },
        shield: {
          active: false,
          activeAimDir: null,
          bursts: [],
          immediateFeedback: {
            aimDir: { x: 1, y: 0 },
            startedAtSec: 1,
          },
          immediateFeedbackDurationSec: 0.2,
          planet: {
            id: 7,
            pos: { x: 30, y: -18 },
            shieldLoad: 0,
            shieldMaxLoad: 10,
          },
          shieldRadius: 24,
        },
        weapon: {
          cannon: null,
          lockRing: null,
        },
      },
      nowSec: 2.1,
      visuals: {
        blackHole: blackHoleVisual as never,
        boost: null,
        cannon: cannonVisual as never,
        gravityPulse: gravityPulseVisual as never,
        lockRing: null,
        shield: shieldVisual as never,
      },
    });

    expect(result.gravityPulse).toBeNull();
    expect(result.shieldImmediateFeedback).toBeNull();
    expect(blackHoleVisual.group.visible).toBe(false);
    expect(shieldVisual.group.visible).toBe(false);
    expect(cannonVisual.group.visible).toBe(false);
    expect(gravityPulseVisual.coreMesh.visible).toBe(false);
  });
});
