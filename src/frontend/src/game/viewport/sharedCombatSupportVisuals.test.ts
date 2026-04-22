import { describe, expect, it } from "vitest";
import {
  getSharedCombatLockRingScale,
  getSharedCombatShieldHitReact,
  syncSharedCombatCannonVisual,
} from "./sharedCombatSupportVisuals";

const createMockMesh = () => ({
  position: {
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
    x: 0,
    y: 0,
    z: 0,
  },
  scale: {
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
    x: 0,
    y: 0,
    z: 0,
  },
  visible: false,
});

describe("getSharedCombatShieldHitReact", () => {
  it("returns the neutral presentation when there is no matching shield burst", () => {
    expect(
      getSharedCombatShieldHitReact({
        bursts: [],
        nowSec: 1,
        planetId: 12,
        shieldRadius: 24,
      }),
    ).toEqual({
      arcBoost: 0,
      glowBoost: 0,
      offset: { x: 0, y: 0 },
      rotation: 0,
      scale: 1,
    });
  });

  it("derives a visible shield reaction from the freshest matching burst", () => {
    const react = getSharedCombatShieldHitReact({
      bursts: [
        {
          absorbedByShield: true,
          normal: { x: 0, y: 1 },
          planetId: 12,
          startedAtSec: 0.88,
        },
        {
          absorbedByShield: true,
          normal: { x: 1, y: 0 },
          planetId: 99,
          startedAtSec: 0.95,
        },
      ],
      nowSec: 1,
      planetId: 12,
      shieldRadius: 24,
    });

    expect(react.arcBoost).toBeGreaterThan(0);
    expect(react.glowBoost).toBeGreaterThan(0);
    expect(react.scale).toBeGreaterThan(1);
    expect(Math.hypot(react.offset.x, react.offset.y)).toBeGreaterThan(0);
    expect(react.rotation).not.toBe(0);
  });
});

describe("getSharedCombatLockRingScale", () => {
  it("uses the seeker charge pulse while locking", () => {
    expect(
      getSharedCombatLockRingScale({
        baseRadius: 100,
        locked: false,
        nowSec: Math.PI / (2 * 3.6),
      }),
    ).toBeCloseTo(101.5, 5);
  });

  it("uses the stronger pulse once the lock is acquired", () => {
    expect(
      getSharedCombatLockRingScale({
        baseRadius: 100,
        locked: true,
        nowSec: Math.PI / (2 * 6.5),
      }),
    ).toBeCloseTo(106, 5);
  });
});

describe("syncSharedCombatCannonVisual", () => {
  it("hides the cannon when presentation is disabled", () => {
    const visual = {
      barrelBandMesh: createMockMesh(),
      barrelMesh: createMockMesh(),
      breechMesh: createMockMesh(),
      flashMaterial: {
        color: { set() {} },
        opacity: 1,
      },
      flashMesh: { ...createMockMesh(), visible: true },
      group: {
        position: {
          set() {},
        },
        rotation: { z: 0 },
        visible: true,
      },
      muzzleMesh: createMockMesh(),
      setAccentColor() {},
      stemMesh: createMockMesh(),
    };

    syncSharedCombatCannonVisual({
      state: {
        accent: "#fff",
        aimAngle: 0,
        flashAccent: null,
        flashAgeSec: null,
        layout: {
          bandLenWorld: 1,
          bandRadiusWorld: 1,
          barrelLenWorld: 1,
          barrelRadiusWorld: 1,
          breechDepthWorld: 1,
          breechLenWorld: 1,
          breechWidthWorld: 1,
          flashDurationSec: 0.1,
          flashRadiusWorld: 1,
          muzzleLenWorld: 1,
          muzzleRadiusWorld: 1,
          stemLenWorld: 1,
          stemRadiusWorld: 1,
        },
        position: { x: 0, y: 0 },
        surfaceOffset: 0,
        visible: false,
        z: 6,
      },
      visual: visual as never,
    });

    expect(visual.group.visible).toBe(false);
    expect(visual.flashMesh.visible).toBe(false);
    expect(visual.flashMaterial.opacity).toBe(0);
  });

  it("positions the cannon and shows the flash from shared presentation state", () => {
    let accent = "";
    const visual = {
      barrelBandMesh: createMockMesh(),
      barrelMesh: createMockMesh(),
      breechMesh: createMockMesh(),
      flashMaterial: {
        color: {
          set(value: string) {
            accent = value;
          },
        },
        opacity: 0,
      },
      flashMesh: createMockMesh(),
      group: {
        position: {
          set(x: number, y: number, z: number) {
            this.x = x;
            this.y = y;
            this.z = z;
          },
          x: 0,
          y: 0,
          z: 0,
        },
        rotation: { z: 0 },
        visible: false,
      },
      muzzleMesh: createMockMesh(),
      setAccentColor(value: string) {
        accent = value;
      },
      stemMesh: createMockMesh(),
    };

    syncSharedCombatCannonVisual({
      state: {
        accent: "#86ecff",
        aimAngle: 1.2,
        flashAccent: "#ffbf7d",
        flashAgeSec: 0.05,
        layout: {
          bandLenWorld: 2,
          bandRadiusWorld: 0.5,
          barrelLenWorld: 10,
          barrelRadiusWorld: 0.75,
          breechDepthWorld: 1.2,
          breechLenWorld: 4,
          breechWidthWorld: 1.6,
          flashDurationSec: 0.1,
          flashRadiusWorld: 6,
          muzzleLenWorld: 2,
          muzzleRadiusWorld: 0.8,
          stemLenWorld: 3,
          stemRadiusWorld: 0.4,
        },
        position: { x: 20, y: -10 },
        surfaceOffset: 12,
        visible: true,
        z: 6,
      },
      visual: visual as never,
    });

    expect(visual.group.visible).toBe(true);
    expect(visual.group.position.x).toBe(20);
    expect(visual.group.position.y).toBe(-10);
    expect(visual.group.position.z).toBe(6);
    expect(visual.group.rotation.z).toBe(1.2);
    expect(visual.stemMesh.position.x).toBeCloseTo(13.5);
    expect(visual.muzzleMesh.position.x).toBeCloseTo(28);
    expect(visual.flashMesh.visible).toBe(true);
    expect(visual.flashMaterial.opacity).toBeGreaterThan(0);
    expect(accent).toBe("#ffbf7d");
  });
});
