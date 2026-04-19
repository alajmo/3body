import {
  createNeutronStars,
  CURRENT_GAME_TUNING,
  mulberry32,
  sanitizeGameTuning,
} from "@3body/shared";
import { describe, expect, it } from "vitest";

describe("sanitizeGameTuning", () => {
  it("does not cap orbit sun start distance scale", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      gameplay: {
        ...CURRENT_GAME_TUNING.gameplay,
        orbits: {
          ...CURRENT_GAME_TUNING.gameplay.orbits,
          sunStartDistanceScale: 4.2,
        },
      },
    });

    expect(nextTuning.gameplay.orbits.sunStartDistanceScale).toBe(4.2);
  });

  it("does not cap orbit planet circle radius", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      gameplay: {
        ...CURRENT_GAME_TUNING.gameplay,
        orbits: {
          ...CURRENT_GAME_TUNING.gameplay.orbits,
          planetCircleRadius: 7200,
        },
      },
    });

    expect(nextTuning.gameplay.orbits.planetCircleRadius).toBe(7200);
  });

  it("does not cap orbit sun radius", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      gameplay: {
        ...CURRENT_GAME_TUNING.gameplay,
        orbits: {
          ...CURRENT_GAME_TUNING.gameplay.orbits,
          suns: CURRENT_GAME_TUNING.gameplay.orbits.suns.map((sun, index) =>
            index === 0 ? { ...sun, radius: 1200 } : { ...sun },
          ) as typeof CURRENT_GAME_TUNING.gameplay.orbits.suns,
        },
      },
    });

    expect(nextTuning.gameplay.orbits.suns[0]!.radius).toBe(1200);
  });

  it("does not cap neutron star size", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      gameplay: {
        ...CURRENT_GAME_TUNING.gameplay,
        neutronStars: {
          ...CURRENT_GAME_TUNING.gameplay.neutronStars,
          minSize: 320,
          maxSize: 420,
        },
      },
    });

    expect(nextTuning.gameplay.neutronStars.minSize).toBe(320);
    expect(nextTuning.gameplay.neutronStars.maxSize).toBe(420);
  });

  it("does not cap neutron star mass", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      gameplay: {
        ...CURRENT_GAME_TUNING.gameplay,
        neutronStars: {
          ...CURRENT_GAME_TUNING.gameplay.neutronStars,
          minMassKg: 2500,
          maxMassKg: 2400000,
        },
      },
    });

    expect(nextTuning.gameplay.neutronStars.minMassKg).toBe(2500);
    expect(nextTuning.gameplay.neutronStars.maxMassKg).toBe(2400000);
  });

  it("preserves neutron star visual tuning values inside the supported range", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      visuals: {
        ...CURRENT_GAME_TUNING.visuals,
        neutronStars: {
          ...CURRENT_GAME_TUNING.visuals.neutronStars,
          haloScale: 3.75,
          jetOpacity: 0.42,
        },
      },
    });

    expect(nextTuning.visuals.neutronStars.haloScale).toBe(3.75);
    expect(nextTuning.visuals.neutronStars.jetOpacity).toBe(0.42);
  });

  it("does not cap rocket visual scale", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      visuals: {
        ...CURRENT_GAME_TUNING.visuals,
        rockets: {
          ...CURRENT_GAME_TUNING.visuals.rockets,
          light: {
            ...CURRENT_GAME_TUNING.visuals.rockets.light,
            scale: 3.2,
          },
        },
      },
    });

    expect(nextTuning.visuals.rockets.light.scale).toBe(3.2);
  });

  it("preserves seeker lock seconds in gameplay tuning", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      gameplay: {
        ...CURRENT_GAME_TUNING.gameplay,
        rockets: {
          ...CURRENT_GAME_TUNING.gameplay.rockets,
          seeker: {
            ...CURRENT_GAME_TUNING.gameplay.rockets.seeker,
            lockSec: 1.25,
          },
        },
      },
    });

    expect(nextTuning.gameplay.rockets.seeker.lockSec).toBe(1.25);
  });

  it("does not cap named camera world heights", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      gameplay: {
        ...CURRENT_GAME_TUNING.gameplay,
        camera: {
          ...CURRENT_GAME_TUNING.gameplay.camera,
          gameplayCameraWorldHeight: 2400,
          previewCameraWorldHeight: 22000,
        },
      },
    });

    expect(nextTuning.gameplay.camera.gameplayCameraWorldHeight).toBe(2400);
    expect(nextTuning.gameplay.camera.previewCameraWorldHeight).toBe(22000);
  });

  it("supports neutron star mass values in either order", () => {
    expect(() =>
      createNeutronStars({
        arenaRadius: 4000,
        createId: () => 1,
        rng: mulberry32(1234),
        spec: {
          ...CURRENT_GAME_TUNING.gameplay.neutronStars,
          count: 1,
          minMassKg: 900000,
          maxMassKg: 2500,
        },
      }),
    ).not.toThrow();
  });

  it("does not cap planet archetype scale", () => {
    const nextTuning = sanitizeGameTuning({
      ...CURRENT_GAME_TUNING,
      visuals: {
        ...CURRENT_GAME_TUNING.visuals,
        planets: {
          ...CURRENT_GAME_TUNING.visuals.planets,
          archetypes: {
            ...CURRENT_GAME_TUNING.visuals.planets.archetypes,
            terra: {
              ...CURRENT_GAME_TUNING.visuals.planets.archetypes.terra,
              auraScale: 14.5,
              bodyScale: 12.5,
            },
          },
        },
      },
    });

    expect(nextTuning.visuals.planets.archetypes.terra.auraScale).toBe(14.5);
    expect(nextTuning.visuals.planets.archetypes.terra.bodyScale).toBe(12.5);
  });
});
