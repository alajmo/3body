import type { ArchetypeId } from "./entities";

export interface ArchetypeStats {
  id: ArchetypeId;
  name: string;
  theme: string;
  rocketDamageMultiplier: number;
  rocketReloadMultiplier: number;
  shieldDurationMultiplier: number;
  boostMagnitudeMultiplier: number;
  boostChargeBonus: number;
  seekerTurnRateMultiplier: number;
  umbraDrag: boolean;
}

export const ARCHETYPE_IDS = [
  "terra",
  "ignis",
  "glacius",
  "volans",
  "oculus",
  "umbra",
  "corvus",
] as const satisfies readonly ArchetypeId[];

export const ARCHETYPES = {
  terra: {
    id: "terra",
    name: "Terra",
    theme: "Balanced",
    rocketDamageMultiplier: 1,
    rocketReloadMultiplier: 1,
    shieldDurationMultiplier: 1,
    boostMagnitudeMultiplier: 1,
    boostChargeBonus: 0,
    seekerTurnRateMultiplier: 1,
    umbraDrag: false,
  },
  ignis: {
    id: "ignis",
    name: "Ignis",
    theme: "Glass cannon",
    rocketDamageMultiplier: 1.3,
    rocketReloadMultiplier: 1,
    shieldDurationMultiplier: 0.75,
    boostMagnitudeMultiplier: 1,
    boostChargeBonus: 0,
    seekerTurnRateMultiplier: 1,
    umbraDrag: false,
  },
  glacius: {
    id: "glacius",
    name: "Glacius",
    theme: "Tank",
    rocketDamageMultiplier: 1,
    rocketReloadMultiplier: 0.8,
    shieldDurationMultiplier: 1.5,
    boostMagnitudeMultiplier: 1,
    boostChargeBonus: 0,
    seekerTurnRateMultiplier: 1,
    umbraDrag: false,
  },
  volans: {
    id: "volans",
    name: "Volans",
    theme: "Mobility",
    rocketDamageMultiplier: 0.8,
    rocketReloadMultiplier: 1,
    shieldDurationMultiplier: 1,
    boostMagnitudeMultiplier: 1.5,
    boostChargeBonus: 1,
    seekerTurnRateMultiplier: 1,
    umbraDrag: false,
  },
  oculus: {
    id: "oculus",
    name: "Oculus",
    theme: "Sniper / Strategist",
    rocketDamageMultiplier: 1,
    rocketReloadMultiplier: 1,
    shieldDurationMultiplier: 1,
    boostMagnitudeMultiplier: 1,
    boostChargeBonus: 0,
    seekerTurnRateMultiplier: 1.3,
    umbraDrag: false,
  },
  umbra: {
    id: "umbra",
    name: "Umbra",
    theme: "Disruptor",
    rocketDamageMultiplier: 0.85,
    rocketReloadMultiplier: 1,
    shieldDurationMultiplier: 1,
    boostMagnitudeMultiplier: 1,
    boostChargeBonus: 0,
    seekerTurnRateMultiplier: 1,
    umbraDrag: true,
  },
  corvus: {
    id: "corvus",
    name: "Corvus",
    theme: "Swarm",
    rocketDamageMultiplier: 1,
    rocketReloadMultiplier: 1,
    shieldDurationMultiplier: 1,
    boostMagnitudeMultiplier: 1,
    boostChargeBonus: 0,
    seekerTurnRateMultiplier: 1,
    umbraDrag: false,
  },
} satisfies Record<ArchetypeId, ArchetypeStats>;
