import currentTuningDocument from "./tuning/current.json";
import { ARCHETYPE_IDS } from "./archetypes";
import type {
  AbilitySpec,
  BlackHoleSpec,
  BoostSpec,
  CacheSpec,
  DroneSpec,
  MatchTimerSpec,
  RocketSpec,
} from "./constants";
import type { ArchetypeId, RocketKind } from "./entities";
import type { Vec2 } from "./vec2";

export interface ShieldSpec extends AbilitySpec {
  arcDeg: number;
}

export interface PlanetArchetypeVisualSpec {
  color: string;
  trailColor: string;
  forestColor: string;
  forestDensity: number;
}

export interface PlanetVisualTuning {
  archetypes: Record<ArchetypeId, PlanetArchetypeVisualSpec>;
  auraGap: number;
  auraScale: number;
  bodyScale: number;
}

export interface SunVisualTuning {
  glowScale: number;
  warpScale: number;
}

export interface BlackHoleVisualTuning {
  coreRadius: number;
  lensRadius: number;
  ringRadius: number;
}

export interface RocketVisualTuning {
  bodyScale: Vec2;
  core: string;
  flameScale: Vec2;
  hudAccent: string;
  trail: string;
  trailScale: Vec2;
}

export interface AbilityVisualTuning {
  boostColor: string;
  foresightColor: string;
  shieldColor: string;
  wildcardColor: string;
}

export interface DroneVisualTuning {
  activeColor: string;
  returnColor: string;
}

export interface CacheVisualTuning {
  badgeBaseSize: number;
  badgeScale: number;
}

export interface HudVisualTuning {
  bottomInset: number;
  cardRadius: number;
  compactCardRadius: number;
  connectionWidth: number;
  dockGap: number;
  killFeedEntryRadius: number;
  leftColumnWidth: number;
  panelBlurPx: number;
  panelGap: number;
  panelRadius: number;
  pillRadius: number;
  sideInset: number;
  timerWidth: number;
  topInset: number;
}

export interface VisualTuning {
  abilities: AbilityVisualTuning;
  blackHole: BlackHoleVisualTuning;
  caches: CacheVisualTuning;
  drone: DroneVisualTuning;
  hud: HudVisualTuning;
  planets: PlanetVisualTuning;
  rockets: Record<RocketKind, RocketVisualTuning>;
  suns: SunVisualTuning;
}

export interface GameplayTuning {
  abilities: {
    boost: BoostSpec;
    foresight: AbilitySpec;
    shield: ShieldSpec;
  };
  blackHole: BlackHoleSpec;
  cache: CacheSpec;
  drone: DroneSpec;
  rockets: Record<RocketKind, RocketSpec>;
  timers: MatchTimerSpec;
}

export interface GameTuningDocument {
  gameplay: GameplayTuning;
  version: 1;
  visuals: VisualTuning;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampInteger = (value: number, min: number, max: number): number =>
  Math.round(clamp(value, min, max));

const sanitizeHexColor = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;

const sanitizeNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;

const sanitizeInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? clampInteger(value, min, max)
    : fallback;

const sanitizeVec2 = (value: unknown, fallback: Vec2): Vec2 => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof Vec2, unknown>>)
      : {};

  return {
    x: sanitizeNumber(source.x, fallback.x, 1, 256),
    y: sanitizeNumber(source.y, fallback.y, 1, 256),
  };
};

export const DEFAULT_GAME_TUNING: GameTuningDocument = {
  version: 1,
  visuals: {
    planets: {
      bodyScale: 2,
      auraScale: 2.2,
      auraGap: 0,
      archetypes: {
        terra: {
          color: "#9fc66f",
          trailColor: "#d6ef8a",
          forestColor: "#2c5a2a",
          forestDensity: 0.95,
        },
        ignis: {
          color: "#ff8550",
          trailColor: "#ffb07c",
          forestColor: "#6e3422",
          forestDensity: 0,
        },
        glacius: {
          color: "#8ed8ff",
          trailColor: "#d5f4ff",
          forestColor: "#6e8797",
          forestDensity: 0,
        },
        volans: {
          color: "#5fe7da",
          trailColor: "#8ff7ee",
          forestColor: "#1f6b5b",
          forestDensity: 0.55,
        },
        oculus: {
          color: "#ffd56b",
          trailColor: "#fff1a4",
          forestColor: "#786a2d",
          forestDensity: 0,
        },
        umbra: {
          color: "#8c7dff",
          trailColor: "#b3a8ff",
          forestColor: "#3a2a52",
          forestDensity: 0.4,
        },
        corvus: {
          color: "#d7e4ff",
          trailColor: "#f3f7ff",
          forestColor: "#496170",
          forestDensity: 0,
        },
      },
    },
    suns: {
      glowScale: 1.7,
      warpScale: 3.2,
    },
    blackHole: {
      coreRadius: 110,
      ringRadius: 205,
      lensRadius: 330,
    },
    rockets: {
      light: {
        core: "#f4f9ff",
        trail: "#b7e6ff",
        hudAccent: "#f5fbff",
        bodyScale: { x: 24, y: 4.8 },
        flameScale: { x: 22, y: 9 },
        trailScale: { x: 30, y: 6 },
      },
      heavy: {
        core: "#ff8d4a",
        trail: "#ff6130",
        hudAccent: "#ff7a3d",
        bodyScale: { x: 31, y: 7.8 },
        flameScale: { x: 28, y: 14 },
        trailScale: { x: 36, y: 9 },
      },
      seeker: {
        core: "#f564ff",
        trail: "#ff4dd4",
        hudAccent: "#ff61eb",
        bodyScale: { x: 27, y: 6.2 },
        flameScale: { x: 25, y: 11 },
        trailScale: { x: 33, y: 7.5 },
      },
    },
    abilities: {
      foresightColor: "#80d7ff",
      shieldColor: "#86ecff",
      boostColor: "#8bc6ff",
      wildcardColor: "#ffd37a",
    },
    drone: {
      activeColor: "#91ffd2",
      returnColor: "#ffe08d",
    },
    caches: {
      badgeScale: 1,
      badgeBaseSize: 80,
    },
    hud: {
      topInset: 20,
      sideInset: 20,
      bottomInset: 20,
      leftColumnWidth: 320,
      panelRadius: 18,
      pillRadius: 16,
      cardRadius: 14,
      compactCardRadius: 10,
      killFeedEntryRadius: 12,
      panelBlurPx: 14,
      panelGap: 12,
      dockGap: 10,
      timerWidth: 240,
      connectionWidth: 220,
    },
  },
  gameplay: {
    blackHole: {
      spawnSec: 300,
      mass: 8_000_000,
      killRadius: 150,
      rampSec: 30,
    },
    rockets: {
      light: {
        damage: 15,
        speed: 950,
        reloadSec: 1.5,
        ttlSec: 8,
        radius: 10,
        turnRate: 0,
        startAmmo: 5,
        maxAmmo: 5,
      },
      heavy: {
        damage: 70,
        speed: 560,
        reloadSec: 6,
        ttlSec: 8,
        radius: 14,
        turnRate: 0,
        startAmmo: 2,
        maxAmmo: 2,
      },
      seeker: {
        damage: 35,
        speed: 760,
        reloadSec: 4,
        ttlSec: 8,
        radius: 12,
        turnRate: Math.PI * 0.75,
        startAmmo: 3,
        maxAmmo: 3,
      },
    },
    abilities: {
      foresight: {
        cooldownSec: 12,
        durationSec: 4,
      },
      shield: {
        cooldownSec: 15,
        durationSec: 4,
        arcDeg: 120,
      },
      boost: {
        charges: 1,
        cooldownSec: 5,
        magnitude: 280,
      },
    },
    drone: {
      speed: 620,
      thrust: 220,
      fuel: 3,
      ttlSec: 20,
      cooldownSec: 8,
      burstImpulse: 320,
    },
    cache: {
      count: 3,
      respawnSec: 15,
      wildcardChance: 0.1,
    },
    timers: {
      lobbySec: 30,
      pickSec: 30,
      countdownSec: 3,
      rematchVoteSec: 20,
    },
  },
};

const sanitizeRocketSpec = (
  value: unknown,
  fallback: RocketSpec,
): RocketSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof RocketSpec, unknown>>)
      : {};
  const maxAmmo = sanitizeInteger(source.maxAmmo, fallback.maxAmmo, 1, 32);

  return {
    damage: sanitizeNumber(source.damage, fallback.damage, 0, 500),
    maxAmmo,
    radius: sanitizeNumber(source.radius, fallback.radius, 1, 128),
    reloadSec: sanitizeNumber(source.reloadSec, fallback.reloadSec, 0.05, 120),
    speed: sanitizeNumber(source.speed, fallback.speed, 10, 4_000),
    startAmmo: sanitizeInteger(
      source.startAmmo,
      fallback.startAmmo,
      0,
      maxAmmo,
    ),
    turnRate: sanitizeNumber(
      source.turnRate,
      fallback.turnRate,
      0,
      Math.PI * 8,
    ),
    ttlSec: sanitizeNumber(source.ttlSec, fallback.ttlSec, 0.1, 120),
  } as RocketSpec;
};

const sanitizeAbilitySpec = (
  value: unknown,
  fallback: AbilitySpec,
): AbilitySpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof AbilitySpec, unknown>>)
      : {};

  return {
    cooldownSec: sanitizeNumber(
      source.cooldownSec,
      fallback.cooldownSec,
      0,
      300,
    ),
    durationSec: sanitizeNumber(
      source.durationSec,
      fallback.durationSec,
      0.05,
      120,
    ),
  };
};

const sanitizeShieldSpec = (
  value: unknown,
  fallback: ShieldSpec,
): ShieldSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof ShieldSpec, unknown>>)
      : {};

  return {
    ...sanitizeAbilitySpec(source, fallback),
    arcDeg: sanitizeNumber(source.arcDeg, fallback.arcDeg, 1, 359),
  };
};

const sanitizeBoostSpec = (value: unknown, fallback: BoostSpec): BoostSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof BoostSpec, unknown>>)
      : {};

  return {
    charges: sanitizeInteger(source.charges, fallback.charges, 1, 5),
    cooldownSec: sanitizeNumber(
      source.cooldownSec,
      fallback.cooldownSec,
      0.05,
      120,
    ),
    magnitude: sanitizeNumber(source.magnitude, fallback.magnitude, 0, 4_000),
  };
};

const sanitizeDroneSpec = (value: unknown, fallback: DroneSpec): DroneSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof DroneSpec, unknown>>)
      : {};

  return {
    burstImpulse: sanitizeNumber(
      source.burstImpulse,
      fallback.burstImpulse,
      0,
      4_000,
    ),
    cooldownSec: sanitizeNumber(
      source.cooldownSec,
      fallback.cooldownSec,
      0.05,
      300,
    ),
    fuel: sanitizeNumber(source.fuel, fallback.fuel, 0.1, 120),
    speed: sanitizeNumber(source.speed, fallback.speed, 1, 4_000),
    thrust: sanitizeNumber(source.thrust, fallback.thrust, 0, 4_000),
    ttlSec: sanitizeNumber(source.ttlSec, fallback.ttlSec, 0.1, 300),
  };
};

const sanitizeCacheSpec = (value: unknown, fallback: CacheSpec): CacheSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof CacheSpec, unknown>>)
      : {};

  return {
    count: sanitizeInteger(source.count, fallback.count, 0, 20),
    respawnSec: sanitizeNumber(source.respawnSec, fallback.respawnSec, 0, 300),
    wildcardChance: sanitizeNumber(
      source.wildcardChance,
      fallback.wildcardChance,
      0,
      1,
    ),
  };
};

const sanitizeBlackHoleSpec = (
  value: unknown,
  fallback: BlackHoleSpec,
): BlackHoleSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof BlackHoleSpec, unknown>>)
      : {};

  return {
    killRadius: sanitizeNumber(
      source.killRadius,
      fallback.killRadius,
      1,
      2_000,
    ),
    mass: sanitizeNumber(source.mass, fallback.mass, 0, 50_000_000),
    rampSec: sanitizeNumber(source.rampSec, fallback.rampSec, 0.1, 600),
    spawnSec: sanitizeNumber(source.spawnSec, fallback.spawnSec, 0, 600),
  };
};

const sanitizeMatchTimerSpec = (
  value: unknown,
  fallback: MatchTimerSpec,
): MatchTimerSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof MatchTimerSpec, unknown>>)
      : {};

  return {
    countdownSec: sanitizeInteger(
      source.countdownSec,
      fallback.countdownSec,
      1,
      30,
    ),
    lobbySec: sanitizeInteger(source.lobbySec, fallback.lobbySec, 1, 300),
    pickSec: sanitizeInteger(source.pickSec, fallback.pickSec, 1, 300),
    rematchVoteSec: sanitizeInteger(
      source.rematchVoteSec,
      fallback.rematchVoteSec,
      1,
      300,
    ),
  };
};

const sanitizeRocketVisualSpec = (
  value: unknown,
  fallback: RocketVisualTuning,
): RocketVisualTuning => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof RocketVisualTuning, unknown>>)
      : {};

  return {
    bodyScale: sanitizeVec2(source.bodyScale, fallback.bodyScale),
    core: sanitizeHexColor(source.core, fallback.core),
    flameScale: sanitizeVec2(source.flameScale, fallback.flameScale),
    hudAccent: sanitizeHexColor(source.hudAccent, fallback.hudAccent),
    trail: sanitizeHexColor(source.trail, fallback.trail),
    trailScale: sanitizeVec2(source.trailScale, fallback.trailScale),
  };
};

const sanitizePlanetArchetypeVisualSpec = (
  value: unknown,
  fallback: PlanetArchetypeVisualSpec,
): PlanetArchetypeVisualSpec => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<Record<keyof PlanetArchetypeVisualSpec, unknown>>)
      : {};

  return {
    color: sanitizeHexColor(source.color, fallback.color),
    forestColor: sanitizeHexColor(source.forestColor, fallback.forestColor),
    forestDensity: sanitizeNumber(
      source.forestDensity,
      fallback.forestDensity,
      0,
      1,
    ),
    trailColor: sanitizeHexColor(source.trailColor, fallback.trailColor),
  };
};

export const sanitizeGameTuning = (value: unknown): GameTuningDocument => {
  const source =
    value !== null && typeof value === "object"
      ? (value as Partial<GameTuningDocument>)
      : {};
  const visuals =
    source.visuals !== null && typeof source.visuals === "object"
      ? (source.visuals as Partial<VisualTuning>)
      : ({} as Partial<VisualTuning>);
  const gameplay =
    source.gameplay !== null && typeof source.gameplay === "object"
      ? (source.gameplay as Partial<GameplayTuning>)
      : ({} as Partial<GameplayTuning>);
  const fallback = DEFAULT_GAME_TUNING;

  const nextArchetypes = Object.fromEntries(
    ARCHETYPE_IDS.map((archetype) => [
      archetype,
      sanitizePlanetArchetypeVisualSpec(
        visuals.planets?.archetypes?.[archetype],
        fallback.visuals.planets.archetypes[archetype],
      ),
    ]),
  ) as Record<ArchetypeId, PlanetArchetypeVisualSpec>;

  return {
    version: 1,
    visuals: {
      planets: {
        archetypes: nextArchetypes,
        auraGap: sanitizeNumber(
          visuals.planets?.auraGap,
          fallback.visuals.planets.auraGap,
          0,
          10,
        ),
        auraScale: sanitizeNumber(
          visuals.planets?.auraScale,
          fallback.visuals.planets.auraScale,
          1,
          10,
        ),
        bodyScale: sanitizeNumber(
          visuals.planets?.bodyScale,
          fallback.visuals.planets.bodyScale,
          0.75,
          10,
        ),
      },
      suns: {
        glowScale: sanitizeNumber(
          visuals.suns?.glowScale,
          fallback.visuals.suns.glowScale,
          0.5,
          8,
        ),
        warpScale: sanitizeNumber(
          visuals.suns?.warpScale,
          fallback.visuals.suns.warpScale,
          0.5,
          8,
        ),
      },
      blackHole: {
        coreRadius: sanitizeNumber(
          visuals.blackHole?.coreRadius,
          fallback.visuals.blackHole.coreRadius,
          20,
          1_500,
        ),
        lensRadius: sanitizeNumber(
          visuals.blackHole?.lensRadius,
          fallback.visuals.blackHole.lensRadius,
          20,
          2_500,
        ),
        ringRadius: sanitizeNumber(
          visuals.blackHole?.ringRadius,
          fallback.visuals.blackHole.ringRadius,
          20,
          2_000,
        ),
      },
      rockets: {
        light: sanitizeRocketVisualSpec(
          visuals.rockets?.light,
          fallback.visuals.rockets.light,
        ),
        heavy: sanitizeRocketVisualSpec(
          visuals.rockets?.heavy,
          fallback.visuals.rockets.heavy,
        ),
        seeker: sanitizeRocketVisualSpec(
          visuals.rockets?.seeker,
          fallback.visuals.rockets.seeker,
        ),
      },
      abilities: {
        boostColor: sanitizeHexColor(
          visuals.abilities?.boostColor,
          fallback.visuals.abilities.boostColor,
        ),
        foresightColor: sanitizeHexColor(
          visuals.abilities?.foresightColor,
          fallback.visuals.abilities.foresightColor,
        ),
        shieldColor: sanitizeHexColor(
          visuals.abilities?.shieldColor,
          fallback.visuals.abilities.shieldColor,
        ),
        wildcardColor: sanitizeHexColor(
          visuals.abilities?.wildcardColor,
          fallback.visuals.abilities.wildcardColor,
        ),
      },
      drone: {
        activeColor: sanitizeHexColor(
          visuals.drone?.activeColor,
          fallback.visuals.drone.activeColor,
        ),
        returnColor: sanitizeHexColor(
          visuals.drone?.returnColor,
          fallback.visuals.drone.returnColor,
        ),
      },
      caches: {
        badgeBaseSize: sanitizeNumber(
          visuals.caches?.badgeBaseSize,
          fallback.visuals.caches.badgeBaseSize,
          16,
          240,
        ),
        badgeScale: sanitizeNumber(
          visuals.caches?.badgeScale,
          fallback.visuals.caches.badgeScale,
          0.5,
          3,
        ),
      },
      hud: {
        bottomInset: sanitizeNumber(
          visuals.hud?.bottomInset,
          fallback.visuals.hud.bottomInset,
          0,
          120,
        ),
        cardRadius: sanitizeNumber(
          visuals.hud?.cardRadius,
          fallback.visuals.hud.cardRadius,
          4,
          40,
        ),
        compactCardRadius: sanitizeNumber(
          visuals.hud?.compactCardRadius,
          fallback.visuals.hud.compactCardRadius,
          4,
          32,
        ),
        connectionWidth: sanitizeNumber(
          visuals.hud?.connectionWidth,
          fallback.visuals.hud.connectionWidth,
          120,
          480,
        ),
        dockGap: sanitizeNumber(
          visuals.hud?.dockGap,
          fallback.visuals.hud.dockGap,
          0,
          32,
        ),
        killFeedEntryRadius: sanitizeNumber(
          visuals.hud?.killFeedEntryRadius,
          fallback.visuals.hud.killFeedEntryRadius,
          4,
          32,
        ),
        leftColumnWidth: sanitizeNumber(
          visuals.hud?.leftColumnWidth,
          fallback.visuals.hud.leftColumnWidth,
          180,
          520,
        ),
        panelBlurPx: sanitizeNumber(
          visuals.hud?.panelBlurPx,
          fallback.visuals.hud.panelBlurPx,
          0,
          48,
        ),
        panelGap: sanitizeNumber(
          visuals.hud?.panelGap,
          fallback.visuals.hud.panelGap,
          0,
          32,
        ),
        panelRadius: sanitizeNumber(
          visuals.hud?.panelRadius,
          fallback.visuals.hud.panelRadius,
          4,
          40,
        ),
        pillRadius: sanitizeNumber(
          visuals.hud?.pillRadius,
          fallback.visuals.hud.pillRadius,
          4,
          40,
        ),
        sideInset: sanitizeNumber(
          visuals.hud?.sideInset,
          fallback.visuals.hud.sideInset,
          0,
          120,
        ),
        timerWidth: sanitizeNumber(
          visuals.hud?.timerWidth,
          fallback.visuals.hud.timerWidth,
          120,
          480,
        ),
        topInset: sanitizeNumber(
          visuals.hud?.topInset,
          fallback.visuals.hud.topInset,
          0,
          120,
        ),
      },
    },
    gameplay: {
      blackHole: sanitizeBlackHoleSpec(
        gameplay.blackHole,
        fallback.gameplay.blackHole,
      ),
      rockets: {
        light: sanitizeRocketSpec(
          gameplay.rockets?.light,
          fallback.gameplay.rockets.light,
        ),
        heavy: sanitizeRocketSpec(
          gameplay.rockets?.heavy,
          fallback.gameplay.rockets.heavy,
        ),
        seeker: sanitizeRocketSpec(
          gameplay.rockets?.seeker,
          fallback.gameplay.rockets.seeker,
        ),
      },
      abilities: {
        foresight: sanitizeAbilitySpec(
          gameplay.abilities?.foresight,
          fallback.gameplay.abilities.foresight,
        ),
        shield: sanitizeShieldSpec(
          gameplay.abilities?.shield,
          fallback.gameplay.abilities.shield,
        ),
        boost: sanitizeBoostSpec(
          gameplay.abilities?.boost,
          fallback.gameplay.abilities.boost,
        ),
      },
      drone: sanitizeDroneSpec(gameplay.drone, fallback.gameplay.drone),
      cache: sanitizeCacheSpec(gameplay.cache, fallback.gameplay.cache),
      timers: sanitizeMatchTimerSpec(gameplay.timers, fallback.gameplay.timers),
    },
  };
};

export const cloneGameTuningDocument = (
  value: GameTuningDocument,
): GameTuningDocument => structuredClone(value);

export const CURRENT_GAME_TUNING: GameTuningDocument = sanitizeGameTuning(
  currentTuningDocument,
);
