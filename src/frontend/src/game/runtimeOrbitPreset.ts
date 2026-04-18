import {
  ARENA_RADIUS,
  getOrbitGameplayPlanet,
  getOrbitPlanetCircleRadius,
  getOrbitGameplaySun,
} from "@3body/shared";
import { DEFAULT_ORBIT_PRESET, type OrbitPreset } from "./orbitPresets";
import { getRuntimeTuningDocument } from "./runtimeTuning";

const createScaledSunSeeds = (
  orbitTuning: ReturnType<typeof getRuntimeTuningDocument>["gameplay"]["orbits"],
  preset: OrbitPreset,
  distanceScale: number,
): OrbitPreset["suns"] => {
  const tunedSuns = preset.suns.map((sun, index) => {
    const tunedSun = getOrbitGameplaySun(orbitTuning, index);

    return {
      ...sun,
      mass: tunedSun.mass,
      pos: { x: tunedSun.pos.x, y: tunedSun.pos.y },
      radius: tunedSun.radius,
      vel: { x: tunedSun.vel.x, y: tunedSun.vel.y },
    };
  });

  if (distanceScale === 1) {
    return tunedSuns;
  }

  const totalMass = tunedSuns.reduce((sum, sun) => sum + sun.mass, 0);
  const centerPosition =
    totalMass > 0
      ? tunedSuns.reduce(
          (center, sun) => ({
            x: center.x + (sun.pos.x * sun.mass) / totalMass,
            y: center.y + (sun.pos.y * sun.mass) / totalMass,
          }),
          { x: 0, y: 0 },
        )
      : { x: 0, y: 0 };
  const centerVelocity =
    totalMass > 0
      ? tunedSuns.reduce(
          (center, sun) => ({
            x: center.x + (sun.vel.x * sun.mass) / totalMass,
            y: center.y + (sun.vel.y * sun.mass) / totalMass,
          }),
          { x: 0, y: 0 },
        )
      : { x: 0, y: 0 };
  const velocityScale = 1 / Math.sqrt(distanceScale);

  return tunedSuns.map((sun) => ({
    ...sun,
    pos: {
      x: centerPosition.x + (sun.pos.x - centerPosition.x) * distanceScale,
      y: centerPosition.y + (sun.pos.y - centerPosition.y) * distanceScale,
    },
    vel: {
      x: centerVelocity.x + (sun.vel.x - centerVelocity.x) * velocityScale,
      y: centerVelocity.y + (sun.vel.y - centerVelocity.y) * velocityScale,
    },
  }));
};

export const resolveRuntimeOrbitPreset = (preset: OrbitPreset): OrbitPreset => {
  if (preset.id !== DEFAULT_ORBIT_PRESET.id) {
    return preset;
  }

  const orbitTuning = getRuntimeTuningDocument().gameplay.orbits;
  const sunDistanceScale = orbitTuning.sunStartDistanceScale;
  // Keep the local sandbox orbit ring inside the arena killzone.
  const circleRadius = Math.min(
    getOrbitPlanetCircleRadius(orbitTuning),
    ARENA_RADIUS,
  );
  const angleStep = (Math.PI * 2) / Math.max(1, preset.planets.length);
  const leadPlanet = getOrbitGameplayPlanet(orbitTuning, 0);
  const leadAngle = Math.atan2(leadPlanet.pos.y, leadPlanet.pos.x);

  return {
    ...preset,
    suns: createScaledSunSeeds(orbitTuning, preset, sunDistanceScale),
    planets: preset.planets.map((planet, index) => {
      const tunedPlanet = getOrbitGameplayPlanet(orbitTuning, index);
      const angle = leadAngle + angleStep * index;
      const templateRadius = Math.max(
        Math.hypot(tunedPlanet.pos.x, tunedPlanet.pos.y),
        1,
      );
      const templateSpeed = Math.hypot(tunedPlanet.vel.x, tunedPlanet.vel.y);
      const speed = templateSpeed * Math.sqrt(templateRadius / circleRadius);
      const angularDirection =
        Math.sign(
          tunedPlanet.pos.x * tunedPlanet.vel.y -
            tunedPlanet.pos.y * tunedPlanet.vel.x,
        ) || 1;
      const tangent =
        angularDirection >= 0
          ? {
              x: -Math.sin(angle),
              y: Math.cos(angle),
            }
          : {
              x: Math.sin(angle),
              y: -Math.cos(angle),
            };

      return {
        ...planet,
        pos: {
          x: Math.cos(angle) * circleRadius,
          y: Math.sin(angle) * circleRadius,
        },
        radius: tunedPlanet.radius,
        vel: {
          x: tangent.x * speed,
          y: tangent.y * speed,
        },
      };
    }),
  };
};
