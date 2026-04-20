import {
  SPECIAL_PERIODIC_ORBIT_PATTERNS,
  createOrbitPatternCanonicalSuns,
  scaleOrbitPatternVelocity,
  type Vec2,
} from "@3body/shared";

export type OrbitRiskProfile = "inner" | "transfer" | "outer";

export interface OrbitSunSeed {
  id: number;
  label: string;
  color: string;
  glowColor: string;
  mass: number;
  radius: number;
  pos: Vec2;
  vel: Vec2;
}

export interface OrbitPlanetSeed {
  id: number;
  label: string;
  color: string;
  trailColor: string;
  risk: OrbitRiskProfile;
  radius: number;
  pos: Vec2;
  vel: Vec2;
}

export interface OrbitResetPolicy {
  earlyWindowSec: number;
  minAliveDuringEarlyWindow: number;
  resetOnAllPlanetsLost?: boolean;
  resetOnSunCollision?: boolean;
}

export interface OrbitPreset {
  id: string;
  label: string;
  suns: OrbitSunSeed[];
  planets: OrbitPlanetSeed[];
  resetPolicy: OrbitResetPolicy;
}

const SUN_VISUALS = [
  {
    label: "Auric",
    color: "#ffd36a",
    glowColor: "#ffefb5",
  },
  {
    label: "Ember",
    color: "#ffb347",
    glowColor: "#ffd6ae",
  },
  {
    label: "Halo",
    color: "#fff1a1",
    glowColor: "#fff8d0",
  },
] as const;

const PLANET_PACK: OrbitPlanetSeed[] = [
  {
    id: 101,
    label: "I",
    color: "#8ad8ff",
    trailColor: "#8ad8ff",
    risk: "inner",
    radius: 22,
    pos: { x: 828.1364926901275, y: -382.83759947735126 },
    vel: { x: 233.58660284165978, y: 491.9908222812772 },
  },
  {
    id: 102,
    label: "II",
    color: "#f89bc7",
    trailColor: "#f89bc7",
    risk: "transfer",
    radius: 22,
    pos: { x: 974.173366771523, y: 390.0090230449333 },
    vel: { x: -184.11360327792204, y: 451.65478924721646 },
  },
  {
    id: 103,
    label: "III",
    color: "#9df2ae",
    trailColor: "#9df2ae",
    risk: "transfer",
    radius: 22,
    pos: { x: 362.31856974595314, y: 1225.5062184963572 },
    vel: { x: -419.96223893213505, y: 125.90218747822072 },
  },
  {
    id: 104,
    label: "IV",
    color: "#ffd98c",
    trailColor: "#ffd98c",
    risk: "outer",
    radius: 22,
    pos: { x: -942.1000578198099, y: 1203.850955878943 },
    vel: { x: -307.5529931192288, y: -244.43190989718101 },
  },
  {
    id: 105,
    label: "V",
    color: "#b8b0ff",
    trailColor: "#b8b0ff",
    risk: "outer",
    radius: 22,
    pos: { x: -1563.5771047641508, y: 156.6676294851039 },
    vel: { x: -42.04444072391674, y: -392.8978418085715 },
  },
  {
    id: 106,
    label: "VI",
    color: "#ff9e9e",
    trailColor: "#ff9e9e",
    risk: "outer",
    radius: 24,
    pos: { x: -1174.4152002457483, y: -1392.4570564322728 },
    vel: { x: 272.1399209532841, y: -231.3176502179315 },
  },
  {
    id: 107,
    label: "VII",
    color: "#c5f2ff",
    trailColor: "#c5f2ff",
    risk: "outer",
    radius: 24,
    pos: { x: 402.2519098782003, y: -1826.710068499484 },
    vel: { x: 343.2035061640994, y: 76.546164230828 },
  },
];

const IA1_PERIODIC_SANDBOX_WORLD_SCALE = 1_600;
const IA1_PERIODIC_SANDBOX_MASS = 140_000;
// Keep the sandbox opener forgiving while the combat spawn is still being tuned.
const IA1_PERIODIC_SANDBOX_PLANET_POSITION_SCALE = 1.27;
const IA1_PERIODIC_SANDBOX_NORMALIZED_SUNS = [
  {
    label: "Auric",
    color: "#ffd36a",
    glowColor: "#ffefb5",
    radius: 88,
    pos: { x: -1, y: 0 },
    vel: { x: 0.345763425340569, y: 0.5303825022600904 },
  },
  {
    label: "Ember",
    color: "#ffb347",
    glowColor: "#ffd6ae",
    radius: 124,
    pos: { x: 1, y: 0 },
    vel: { x: 0.345763425340569, y: 0.5303825022600904 },
  },
  {
    label: "Halo",
    color: "#fff1a1",
    glowColor: "#fff8d0",
    radius: 160,
    pos: { x: 0, y: 0 },
    vel: { x: -0.691526850681138, y: -1.0607650045201806 },
  },
] as const;

const DEFAULT_RESET_POLICY: OrbitResetPolicy = {
  earlyWindowSec: 18,
  minAliveDuringEarlyWindow: 2,
};

const PERIODIC_SOLUTION_RESET_POLICY: OrbitResetPolicy = {
  earlyWindowSec: 0,
  minAliveDuringEarlyWindow: 0,
  resetOnAllPlanetsLost: false,
  resetOnSunCollision: false,
};

const scalePlanetSeedRadially = (
  planet: OrbitPlanetSeed,
  positionScale: number,
): OrbitPlanetSeed => {
  const velocityScale = 1 / Math.sqrt(positionScale);

  return {
    ...planet,
    pos: {
      x: planet.pos.x * positionScale,
      y: planet.pos.y * positionScale,
    },
    vel: {
      x: planet.vel.x * velocityScale,
      y: planet.vel.y * velocityScale,
    },
  };
};

const IA1_PERIODIC_SANDBOX_PRESET: OrbitPreset = {
  // Seeded from the published equal-mass IA1 periodic orbit, then scaled for the sandbox.
  id: "ia1-periodic-sandbox",
  label: "IA1 Periodic Sandbox",
  resetPolicy: DEFAULT_RESET_POLICY,
  suns: IA1_PERIODIC_SANDBOX_NORMALIZED_SUNS.map((sun, index) => ({
    id: index + 1,
    label: sun.label,
    color: sun.color,
    glowColor: sun.glowColor,
    mass: IA1_PERIODIC_SANDBOX_MASS,
    radius: sun.radius,
    pos: {
      x: sun.pos.x * IA1_PERIODIC_SANDBOX_WORLD_SCALE,
      y: sun.pos.y * IA1_PERIODIC_SANDBOX_WORLD_SCALE,
    },
    vel: scaleOrbitPatternVelocity(
      sun.vel,
      IA1_PERIODIC_SANDBOX_MASS,
      IA1_PERIODIC_SANDBOX_WORLD_SCALE,
    ),
  })),
  planets: PLANET_PACK.map((planet) =>
    scalePlanetSeedRadially(planet, IA1_PERIODIC_SANDBOX_PLANET_POSITION_SCALE),
  ),
};

const createSpecialPeriodicPreset = (
  pattern: (typeof SPECIAL_PERIODIC_ORBIT_PATTERNS)[number],
): OrbitPreset => ({
  id: pattern.id,
  label: pattern.label,
  resetPolicy: PERIODIC_SOLUTION_RESET_POLICY,
  suns: createOrbitPatternCanonicalSuns(pattern).map((sun, index) => ({
    id: sun.id,
    label: SUN_VISUALS[index]!.label,
    color: SUN_VISUALS[index]!.color,
    glowColor: SUN_VISUALS[index]!.glowColor,
    mass: sun.mass,
    radius: sun.radius,
    pos: { x: sun.pos.x, y: sun.pos.y },
    vel: { x: sun.vel.x, y: sun.vel.y },
  })),
  planets: PLANET_PACK,
});

// These seeds follow the equal-mass, zero-angular-momentum periodic solutions linked from Wikipedia.
export const SPECIAL_PERIODIC_ORBIT_PRESETS: OrbitPreset[] =
  SPECIAL_PERIODIC_ORBIT_PATTERNS.map(createSpecialPeriodicPreset);

export const ORBIT_PRESETS: OrbitPreset[] = [
  IA1_PERIODIC_SANDBOX_PRESET,
  ...SPECIAL_PERIODIC_ORBIT_PRESETS,
];

export const ORBIT_PRESET_BY_ID = new Map(
  ORBIT_PRESETS.map((preset) => [preset.id, preset] as const),
);

export const DEFAULT_ORBIT_PRESET = ORBIT_PRESETS[0]!;

export const getDefaultOrbitSunLabel = (index: number): string =>
  DEFAULT_ORBIT_PRESET.suns[index]?.label ?? `Sun ${index + 1}`;
