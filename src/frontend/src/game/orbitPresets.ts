import { G, type Vec2 } from "@3body/shared";

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

interface PublishedPeriodicSeed {
  id: string;
  label: string;
  p1: number;
  p2: number;
  worldScale: number;
  mass?: number;
  radius?: number;
}

const SUN_VISUALS = [
  {
    label: "amber",
    color: "#ffd36a",
    glowColor: "#ffefb5",
  },
  {
    label: "coral",
    color: "#ffb347",
    glowColor: "#ffd6ae",
  },
  {
    label: "ivory",
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

const PERIODIC_SUN_MASS = 120_000;
const PERIODIC_SUN_RADIUS = 32;

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

const scaleVelocity = (
  normalizedVelocity: Vec2,
  mass: number,
  worldScale: number,
): Vec2 => {
  const velocityScale = Math.sqrt((G * mass) / worldScale);

  return {
    x: normalizedVelocity.x * velocityScale,
    y: normalizedVelocity.y * velocityScale,
  };
};

const createEqualMassPeriodicPreset = ({
  id,
  label,
  p1,
  p2,
  worldScale,
  mass = PERIODIC_SUN_MASS,
  radius = PERIODIC_SUN_RADIUS,
}: PublishedPeriodicSeed): OrbitPreset => {
  const normalizedSuns = [
    {
      pos: { x: -1, y: 0 },
      vel: { x: p1, y: p2 },
    },
    {
      pos: { x: 0, y: 0 },
      vel: { x: -2 * p1, y: -2 * p2 },
    },
    {
      pos: { x: 1, y: 0 },
      vel: { x: p1, y: p2 },
    },
  ] as const;

  return {
    id,
    label,
    resetPolicy: PERIODIC_SOLUTION_RESET_POLICY,
    suns: normalizedSuns.map((sun, index) => ({
      id: index + 1,
      label: SUN_VISUALS[index]!.label,
      color: SUN_VISUALS[index]!.color,
      glowColor: SUN_VISUALS[index]!.glowColor,
      mass,
      radius,
      pos: {
        x: sun.pos.x * worldScale,
        y: sun.pos.y * worldScale,
      },
      vel: scaleVelocity(sun.vel, mass, worldScale),
    })),
    planets: PLANET_PACK,
  };
};

const IA1_PERIODIC_SANDBOX_PRESET: OrbitPreset = {
  // Seeded from the published equal-mass IA1 periodic orbit, then scaled for the sandbox.
  id: "ia1-periodic-sandbox",
  label: "IA1 Periodic Sandbox",
  resetPolicy: DEFAULT_RESET_POLICY,
  suns: [
    {
      id: 1,
      label: "small",
      color: "#ffd36a",
      glowColor: "#ffefb5",
      mass: 140_000,
      radius: 88,
      pos: { x: -560, y: 0 },
      vel: { x: 122.24583137230245, y: 187.51853198539965 },
    },
    {
      id: 2,
      label: "medium",
      color: "#ffb347",
      glowColor: "#ffd6ae",
      mass: 140_000,
      radius: 124,
      pos: { x: 560, y: 0 },
      vel: { x: 122.24583137230245, y: 187.51853198539965 },
    },
    {
      id: 3,
      label: "large",
      color: "#fff1a1",
      glowColor: "#fff8d0",
      mass: 140_000,
      radius: 160,
      pos: { x: 0, y: 0 },
      vel: { x: -244.4916627446049, y: -375.0370639707993 },
    },
  ],
  planets: PLANET_PACK,
};

// These seeds follow the equal-mass, zero-angular-momentum periodic solutions linked from Wikipedia.
export const SPECIAL_PERIODIC_ORBIT_PRESETS: OrbitPreset[] = [
  createEqualMassPeriodicPreset({
    id: "figure-eight-v1a",
    label: "Figure-Eight (V.1.A)",
    p1: 0.347113,
    p2: 0.532727,
    worldScale: 760,
  }),
  createEqualMassPeriodicPreset({
    id: "butterfly-i-i2a",
    label: "Butterfly I (I.2.A)",
    p1: 0.306893,
    p2: 0.125507,
    worldScale: 990,
  }),
  createEqualMassPeriodicPreset({
    id: "butterfly-ii-i2b",
    label: "Butterfly II (I.2.B)",
    p1: 0.392955,
    p2: 0.097579,
    worldScale: 970,
  }),
  createEqualMassPeriodicPreset({
    id: "bumblebee-ii11a",
    label: "Bumblebee (II.11.A)",
    p1: 0.184279,
    p2: 0.587188,
    worldScale: 840,
  }),
  createEqualMassPeriodicPreset({
    id: "moth-i-iva2a",
    label: "Moth I (IVa.2.A)",
    p1: 0.464445,
    p2: 0.39606,
    worldScale: 830,
  }),
  createEqualMassPeriodicPreset({
    id: "moth-ii-iva4a",
    label: "Moth II (IVa.4.A)",
    p1: 0.439166,
    p2: 0.452968,
    worldScale: 860,
  }),
  createEqualMassPeriodicPreset({
    id: "butterfly-iii-ivb3a",
    label: "Butterfly III (IVb.3.A)",
    p1: 0.405916,
    p2: 0.230163,
    worldScale: 840,
  }),
  createEqualMassPeriodicPreset({
    id: "moth-iii-ivc5a",
    label: "Moth III (IVc.5.A)",
    p1: 0.383444,
    p2: 0.377364,
    worldScale: 830,
  }),
  createEqualMassPeriodicPreset({
    id: "goggles-prl",
    label: "Goggles",
    p1: 0.0833,
    p2: 0.12789,
    worldScale: 1020,
  }),
  createEqualMassPeriodicPreset({
    id: "butterfly-iv-ivb24a",
    label: "Butterfly IV (IVb.24.A)",
    p1: 0.350112,
    p2: 0.079339,
    worldScale: 810,
  }),
  createEqualMassPeriodicPreset({
    id: "dragonfly-ii4a",
    label: "Dragonfly (II.4.A)",
    p1: 0.080584,
    p2: 0.588836,
    worldScale: 770,
  }),
  createEqualMassPeriodicPreset({
    id: "yarn-prl",
    label: "Yarn",
    p1: 0.55906,
    p2: 0.34919,
    worldScale: 690,
  }),
  createEqualMassPeriodicPreset({
    id: "yin-yang-i-alpha-iii3a-alpha",
    label: "Yin-Yang I alpha (III.3.A)",
    p1: 0.513918,
    p2: 0.304736,
    worldScale: 940,
  }),
  createEqualMassPeriodicPreset({
    id: "yin-yang-i-beta-iii3a-beta",
    label: "Yin-Yang I beta (III.3.A)",
    p1: 0.282699,
    p2: 0.327209,
    worldScale: 890,
  }),
  createEqualMassPeriodicPreset({
    id: "yin-yang-ii-alpha-iii12a-alpha",
    label: "Yin-Yang II alpha (III.12.A)",
    p1: 0.416822,
    p2: 0.330333,
    worldScale: 760,
  }),
  createEqualMassPeriodicPreset({
    id: "yin-yang-ii-beta-iii12a-beta",
    label: "Yin-Yang II beta (III.12.A)",
    p1: 0.417343,
    p2: 0.3131,
    worldScale: 750,
  }),
  createEqualMassPeriodicPreset({
    id: "dragonfly-ii6a",
    label: "Dragonfly II.6.A",
    p1: 0.186238,
    p2: 0.578713,
    worldScale: 740,
  }),
  createEqualMassPeriodicPreset({
    id: "dragonfly-ii8a",
    label: "Dragonfly II.8.A",
    p1: 0.144812,
    p2: 0.542898,
    worldScale: 760,
  }),
  createEqualMassPeriodicPreset({
    id: "yin-yang-iii9a-alpha",
    label: "Yin-Yang III.9.A alpha",
    p1: 0.51315,
    p2: 0.289437,
    worldScale: 710,
  }),
  createEqualMassPeriodicPreset({
    id: "yin-yang-iii9a-beta",
    label: "Yin-Yang III.9.A beta",
    p1: 0.276237,
    p2: 0.331714,
    worldScale: 700,
  }),
];

export const ORBIT_PRESETS: OrbitPreset[] = [
  IA1_PERIODIC_SANDBOX_PRESET,
  ...SPECIAL_PERIODIC_ORBIT_PRESETS,
];

export const ORBIT_PRESET_BY_ID = new Map(
  ORBIT_PRESETS.map((preset) => [preset.id, preset] as const),
);

export const DEFAULT_ORBIT_PRESET = ORBIT_PRESETS[0]!;
