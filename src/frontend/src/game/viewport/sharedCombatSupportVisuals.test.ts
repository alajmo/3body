import { describe, expect, it } from "vitest";
import {
  getSharedCombatLockRingScale,
  getSharedCombatShieldHitReact,
  syncSharedCombatCannonVisual,
  syncSharedCombatGravityPulsePresentation,
  syncSharedCombatPlayerWeaponPresentation,
  syncSharedCombatPlayerShieldPresentation,
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
  rotation: { z: 0 },
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

const createMockShieldVisual = () => ({
  arcOpacityUniform: { value: 0 },
  crestOpacityUniform: { value: 0 },
  glowOpacityUniform: { value: 0 },
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
  },
  panelOpacityUniform: { value: 0 },
});

const createMockLockRingVisual = () => ({
  lockedUniform: { value: 0 },
  mesh: createMockMesh(),
  progressUniform: { value: 0 },
  timeUniform: { value: 0 },
});

const createMockGravityPulseVisual = () => ({
  coreMaterial: { opacity: 0 },
  coreMesh: createMockMesh(),
  echoMaterial: { opacity: 0 },
  echoMesh: createMockMesh(),
  ringMaterial: { opacity: 0 },
  ringMesh: createMockMesh(),
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

describe("syncSharedCombatGravityPulsePresentation", () => {
  it("updates the shared gravity pulse visual while the pulse is active", () => {
    const visual = createMockGravityPulseVisual();
    const pulse = {
      effectRadius: 200,
      origin: { x: 12, y: -6 },
      planetRadius: 18,
      startedAtSec: 1,
    };

    const nextPulse = syncSharedCombatGravityPulsePresentation({
      durationSec: 0.95,
      nowSec: 1.2,
      pulse,
      visibleWorldHeight: 900,
      visual: visual as never,
      z: {
        core: 2.2,
        echo: 2.3,
        ring: 2.35,
      },
    });

    expect(nextPulse).toEqual(pulse);
    expect(visual.coreMesh.visible).toBe(true);
    expect(visual.ringMesh.visible).toBe(true);
    expect(visual.echoMesh.visible).toBe(true);
    expect(visual.coreMesh.position.x).toBe(12);
    expect(visual.coreMesh.position.y).toBe(-6);
    expect(visual.coreMaterial.opacity).toBeGreaterThan(0);
  });

  it("clears and hides an expired gravity pulse", () => {
    const visual = createMockGravityPulseVisual();

    const nextPulse = syncSharedCombatGravityPulsePresentation({
      durationSec: 0.95,
      nowSec: 2,
      pulse: {
        effectRadius: 200,
        origin: { x: 12, y: -6 },
        planetRadius: 18,
        startedAtSec: 1,
      },
      visibleWorldHeight: 900,
      visual: visual as never,
      z: {
        core: 2.2,
        echo: 2.3,
        ring: 2.35,
      },
    });

    expect(nextPulse).toBeNull();
    expect(visual.coreMesh.visible).toBe(false);
    expect(visual.ringMesh.visible).toBe(false);
    expect(visual.echoMesh.visible).toBe(false);
    expect(visual.coreMaterial.opacity).toBe(0);
    expect(visual.ringMaterial.opacity).toBe(0);
    expect(visual.echoMaterial.opacity).toBe(0);
  });
});

describe("syncSharedCombatPlayerShieldPresentation", () => {
  it("drives the shared shield visual from the active shield state", () => {
    const visual = createMockShieldVisual();

    const immediateFeedback = syncSharedCombatPlayerShieldPresentation({
      active: true,
      activeAimDir: { x: 1, y: 0 },
      bursts: [],
      nowSec: 1,
      planet: {
        id: 12,
        pos: { x: 30, y: -18 },
        shieldLoad: 6,
        shieldMaxLoad: 10,
      },
      shieldRadius: 24,
      visual: visual as never,
    });

    expect(immediateFeedback).toBeNull();
    expect(visual.group.visible).toBe(true);
    expect(visual.group.position.x).toBe(30);
    expect(visual.group.position.y).toBe(-18);
    expect(visual.group.position.z).toBe(0);
    expect(visual.group.rotation.z).toBe(0);
    expect(visual.group.scale.x).toBeGreaterThan(24);
    expect(visual.arcOpacityUniform.value).toBeGreaterThan(0);
    expect(visual.panelOpacityUniform.value).toBeGreaterThan(0);
    expect(visual.crestOpacityUniform.value).toBeGreaterThan(0);
    expect(visual.glowOpacityUniform.value).toBeGreaterThan(0);
  });

  it("shows cosmetic immediate feedback when the authoritative shield has not raised yet", () => {
    const visual = createMockShieldVisual();
    const immediateFeedback = {
      aimDir: { x: 0, y: 1 },
      startedAtSec: 1,
    };

    const nextImmediateFeedback = syncSharedCombatPlayerShieldPresentation({
      active: false,
      activeAimDir: null,
      bursts: [],
      immediateFeedback,
      immediateFeedbackDurationSec: 0.2,
      nowSec: 1.1,
      planet: {
        id: 12,
        pos: { x: 8, y: 14 },
        shieldLoad: 4,
        shieldMaxLoad: 10,
      },
      shieldRadius: 18,
      visual: visual as never,
    });

    expect(nextImmediateFeedback).toEqual(immediateFeedback);
    expect(visual.group.visible).toBe(true);
    expect(visual.group.rotation.z).toBeCloseTo(Math.PI / 2, 5);
    expect(visual.arcOpacityUniform.value).toBeGreaterThan(0.14);
    expect(visual.panelOpacityUniform.value).toBeGreaterThan(0.12);
  });

  it("hides the shield visual and clears expired cosmetic feedback", () => {
    const visual = createMockShieldVisual();

    const nextImmediateFeedback = syncSharedCombatPlayerShieldPresentation({
      active: false,
      activeAimDir: null,
      bursts: [],
      immediateFeedback: {
        aimDir: { x: 1, y: 0 },
        startedAtSec: 1,
      },
      immediateFeedbackDurationSec: 0.2,
      nowSec: 1.3,
      planet: {
        id: 12,
        pos: { x: 0, y: 0 },
        shieldLoad: 0,
        shieldMaxLoad: 10,
      },
      shieldRadius: 18,
      visual: visual as never,
    });

    expect(nextImmediateFeedback).toBeNull();
    expect(visual.group.visible).toBe(false);
    expect(visual.arcOpacityUniform.value).toBe(0);
    expect(visual.panelOpacityUniform.value).toBe(0);
    expect(visual.crestOpacityUniform.value).toBe(0);
    expect(visual.glowOpacityUniform.value).toBe(0);
  });
});

describe("syncSharedCombatPlayerWeaponPresentation", () => {
  it("computes the cannon aim angle from shared presentation state", () => {
    let accent = "";
    const cannonVisual = {
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
    const lockRingVisual = createMockLockRingVisual();

    syncSharedCombatPlayerWeaponPresentation({
      cannon: {
        accent: "#86ecff",
        aimTarget: { x: 20, y: 30 },
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
        position: { x: 10, y: 10 },
        surfaceOffset: 12,
        visible: true,
        z: 6,
      },
      cannonVisual: cannonVisual as never,
      lockRing: {
        baseRadius: 100,
        locked: true,
        nowSec: 1.25,
        position: { x: 40, y: -12 },
        progress: 1,
        z: 5.5,
      },
      lockRingVisual: lockRingVisual as never,
    });

    expect(cannonVisual.group.visible).toBe(true);
    expect(cannonVisual.group.rotation.z).toBeCloseTo(Math.atan2(20, 10), 5);
    expect(lockRingVisual.mesh.visible).toBe(true);
    expect(lockRingVisual.mesh.position.x).toBe(40);
    expect(lockRingVisual.progressUniform.value).toBe(1);
    expect(lockRingVisual.lockedUniform.value).toBe(1);
    expect(accent).toBe("#ffbf7d");
  });

  it("hides the lock ring when the cannon presentation is disabled", () => {
    const cannonVisual = {
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
    const lockRingVisual = createMockLockRingVisual();
    lockRingVisual.mesh.visible = true;
    lockRingVisual.progressUniform.value = 1;
    lockRingVisual.lockedUniform.value = 1;

    syncSharedCombatPlayerWeaponPresentation({
      cannon: null,
      cannonVisual: cannonVisual as never,
      lockRing: {
        baseRadius: 100,
        locked: true,
        nowSec: 1,
        position: { x: 0, y: 0 },
        progress: 1,
        z: 5.5,
      },
      lockRingVisual: lockRingVisual as never,
    });

    expect(cannonVisual.group.visible).toBe(false);
    expect(cannonVisual.flashMesh.visible).toBe(false);
    expect(cannonVisual.flashMaterial.opacity).toBe(0);
    expect(lockRingVisual.mesh.visible).toBe(false);
    expect(lockRingVisual.progressUniform.value).toBe(0);
    expect(lockRingVisual.lockedUniform.value).toBe(0);
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
