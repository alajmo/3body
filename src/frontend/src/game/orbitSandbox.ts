import {
  ARENA_RADIUS,
  FIXED_STEP_SEC,
  dist,
  dot,
  len,
  lerp,
  lerpVec2,
  normalize,
  scale,
  stepBody,
  stepSuns,
  sub,
} from "@3body/shared";
import type { EntityBase, Sun } from "@3body/shared";
import {
  DEFAULT_ORBIT_PRESET,
  type OrbitPlanetSeed,
  type OrbitPreset,
  type OrbitRiskProfile,
} from "./orbitPresets";
import { resolveRuntimeOrbitPreset } from "./runtimeOrbitPreset";

export const getPlanetSoftBoundaryRadius = (): number => ARENA_RADIUS + 36;

const PLANET_BOUNDARY_INSET = 28;
const PLANET_BOUNDARY_PUSH_BASE = 16;
const PLANET_BOUNDARY_PUSH_SCALE = 0.5;
const PLANET_BOUNDARY_MAX_PUSH = 84;
const PLANET_BOUNDARY_OUTWARD_DAMPING = 0.45;
const PLANET_BOUNDARY_MIN_INWARD_SPEED = 26;

type PlanetDeathReason = "sunCollision";
type SandboxResetReason =
  | "sunCollision"
  | "allPlanetsLost"
  | "tooFewPlanetsTooEarly";

interface SandboxPlanet extends EntityBase {
  kind: "planet";
  label: string;
  color: string;
  trailColor: string;
  risk: OrbitRiskProfile;
  alive: boolean;
  deathReason?: PlanetDeathReason;
}

interface SandboxState {
  tick: number;
  elapsedSec: number;
  preset: OrbitPreset;
  suns: Sun[];
  planets: SandboxPlanet[];
}

interface SandboxDebugSnapshot {
  elapsedSec: number;
  alivePlanets: number;
  minCurrentPlanetSunGap: number;
  minCurrentSunSunGap: number;
  presetLabel: string;
}

const clonePlanetSeed = (planetSeed: OrbitPlanetSeed): SandboxPlanet => ({
  ...planetSeed,
  kind: "planet",
  alive: true,
  pos: { x: planetSeed.pos.x, y: planetSeed.pos.y },
  vel: { x: planetSeed.vel.x, y: planetSeed.vel.y },
});

export const createSandboxState = (
  preset: OrbitPreset = DEFAULT_ORBIT_PRESET,
): SandboxState => {
  const resolvedPreset = resolveRuntimeOrbitPreset(preset);

  return {
    tick: 0,
    elapsedSec: 0,
    preset: resolvedPreset,
    suns: resolvedPreset.suns.map((sunSeed) => ({
      id: sunSeed.id,
      kind: "sun",
      mass: sunSeed.mass,
      radius: sunSeed.radius,
      pos: { x: sunSeed.pos.x, y: sunSeed.pos.y },
      vel: { x: sunSeed.vel.x, y: sunSeed.vel.y },
    })),
    planets: resolvedPreset.planets.map(clonePlanetSeed),
  };
};

export const findMinSunSunGap = (suns: readonly Sun[]): number => {
  let minGap = Number.POSITIVE_INFINITY;

  for (let index = 0; index < suns.length; index += 1) {
    for (
      let otherIndex = index + 1;
      otherIndex < suns.length;
      otherIndex += 1
    ) {
      const gap =
        dist(suns[index]!.pos, suns[otherIndex]!.pos) -
        suns[index]!.radius -
        suns[otherIndex]!.radius;
      minGap = Math.min(minGap, gap);
    }
  }

  return minGap;
};

export const findMinPlanetSunGap = (
  planets: readonly Pick<SandboxPlanet, "alive" | "pos" | "radius">[],
  suns: readonly Sun[],
): number => {
  let minGap = Number.POSITIVE_INFINITY;

  for (const planet of planets) {
    if (!planet.alive) {
      continue;
    }

    for (const sun of suns) {
      minGap = Math.min(
        minGap,
        dist(planet.pos, sun.pos) - planet.radius - sun.radius,
      );
    }
  }

  return minGap;
};

const didAnySunsCollide = (suns: readonly Sun[]): boolean =>
  findMinSunSunGap(suns) <= 0;

const keepPlanetInsideArena = (planet: SandboxPlanet): SandboxPlanet => {
  const distanceFromCenter = len(planet.pos);
  const softBoundaryRadius = getPlanetSoftBoundaryRadius();
  if (distanceFromCenter <= softBoundaryRadius) {
    return planet;
  }

  const outward = normalize(planet.pos);
  const overflow = distanceFromCenter - softBoundaryRadius;
  const inwardPush = Math.min(
    PLANET_BOUNDARY_PUSH_BASE + overflow * PLANET_BOUNDARY_PUSH_SCALE,
    PLANET_BOUNDARY_MAX_PUSH,
  );
  const correctedRadius = Math.max(
    ARENA_RADIUS - PLANET_BOUNDARY_INSET,
    softBoundaryRadius - inwardPush,
  );
  const radialSpeed = dot(planet.vel, outward);
  const tangentialVelocity = sub(planet.vel, scale(outward, radialSpeed));

  return {
    ...planet,
    pos: scale(outward, correctedRadius),
    vel:
      radialSpeed > 0
        ? sub(
            tangentialVelocity,
            scale(
              outward,
              Math.max(
                PLANET_BOUNDARY_MIN_INWARD_SPEED,
                radialSpeed * PLANET_BOUNDARY_OUTWARD_DAMPING,
              ),
            ),
          )
        : planet.vel,
  };
};

const markPlanetOutcome = (
  planet: SandboxPlanet,
  suns: readonly Sun[],
): SandboxPlanet => {
  if (!planet.alive) {
    return planet;
  }

  for (const sun of suns) {
    if (dist(planet.pos, sun.pos) <= planet.radius + sun.radius) {
      return {
        ...planet,
        alive: false,
        deathReason: "sunCollision",
      };
    }
  }

  return planet;
};

export const stepSandbox = (state: SandboxState): SandboxState => {
  const suns = stepSuns(state.suns, FIXED_STEP_SEC);
  const planets = state.planets.map((planet) => {
    if (!planet.alive) {
      return planet;
    }

    return markPlanetOutcome(
      keepPlanetInsideArena(stepBody(planet, suns, FIXED_STEP_SEC)),
      suns,
    );
  });

  return {
    tick: state.tick + 1,
    elapsedSec: state.elapsedSec + FIXED_STEP_SEC,
    preset: state.preset,
    suns,
    planets,
  };
};

export const getSandboxResetReason = (
  state: SandboxState,
): SandboxResetReason | null => {
  if (
    didAnySunsCollide(state.suns) &&
    state.preset.resetPolicy.resetOnSunCollision !== false
  ) {
    return "sunCollision";
  }

  const alivePlanets = state.planets.filter((planet) => planet.alive).length;
  if (
    alivePlanets === 0 &&
    state.preset.resetPolicy.resetOnAllPlanetsLost !== false
  ) {
    return "allPlanetsLost";
  }

  if (
    state.elapsedSec <= state.preset.resetPolicy.earlyWindowSec &&
    alivePlanets <= state.preset.resetPolicy.minAliveDuringEarlyWindow
  ) {
    return "tooFewPlanetsTooEarly";
  }

  return null;
};

export const interpolateSandboxState = (
  previousState: SandboxState,
  currentState: SandboxState,
  alpha: number,
): SandboxState => ({
  tick: currentState.tick,
  elapsedSec: lerp(previousState.elapsedSec, currentState.elapsedSec, alpha),
  preset: currentState.preset,
  suns: currentState.suns.map((sun, index) => ({
    ...sun,
    pos: lerpVec2(previousState.suns[index]!.pos, sun.pos, alpha),
    vel: lerpVec2(previousState.suns[index]!.vel, sun.vel, alpha),
  })),
  planets: currentState.planets.map((planet, index) => {
    const previousPlanet = previousState.planets[index]!;

    return {
      ...planet,
      pos:
        previousPlanet.alive && planet.alive
          ? lerpVec2(previousPlanet.pos, planet.pos, alpha)
          : { x: planet.pos.x, y: planet.pos.y },
      vel:
        previousPlanet.alive && planet.alive
          ? lerpVec2(previousPlanet.vel, planet.vel, alpha)
          : { x: planet.vel.x, y: planet.vel.y },
    };
  }),
});

export const getSandboxDebugSnapshot = (
  state: SandboxState,
): SandboxDebugSnapshot => ({
  elapsedSec: state.elapsedSec,
  alivePlanets: state.planets.filter((planet) => planet.alive).length,
  minCurrentPlanetSunGap: findMinPlanetSunGap(state.planets, state.suns),
  minCurrentSunSunGap: findMinSunSunGap(state.suns),
  presetLabel: state.preset.label,
});
