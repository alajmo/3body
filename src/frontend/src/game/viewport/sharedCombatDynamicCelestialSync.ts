import type { NeutronStar, SunVisualProfile, Vec2 } from "@3body/shared";
import { findAbsorbingNeutronStar } from "../neutronStarAbsorption";
import type { SharedCombatBlackHoleBody } from "./cacheVisuals";
import { isWithinSharedCombatBlackHoleSwallowBand } from "./sharedCombatBlackHoleSwallowTracking";

const getSharedCombatSunSwallowMargin = (sun: { radius: number }) =>
  Math.max(120, sun.radius * 3);

export interface SharedCombatTrackedSunBody {
  color: string;
  pos: Vec2;
  radius: number;
  vel: Vec2;
}

export interface SharedCombatTrackedNeutronStarBody {
  mass: number;
  pos: Vec2;
  radius: number;
}

export interface SharedCombatDynamicSunPresentationArgs<
  SunBody extends {
    id: number;
    pos: Vec2;
    radius: number;
    vel: Vec2;
  },
  SunVisual,
> {
  blackHole: SharedCombatBlackHoleBody | null;
  createVisual: (args: {
    index: number;
    sun: SunBody;
    sunProfile: SunVisualProfile;
  }) => SunVisual;
  currentNeutronStars: readonly NeutronStar[];
  disposeVisual: (visual: SunVisual) => void;
  nowSec: number;
  onSunAbsorbedByNeutronStar: (args: {
    neutronStar: NeutronStar;
    sun: SharedCombatTrackedSunBody;
    sunId: number;
  }) => void;
  onSunStartedBlackHoleSwallow?:
    | ((args: {
        sun: SunBody;
        sunId: number;
        sunProfile: SunVisualProfile;
        swallowedAtSec: number;
      }) => void)
    | undefined;
  onSunSwallowedByBlackHole: (args: {
    sun: SharedCombatTrackedSunBody;
    sunId: number;
  }) => void;
  previousNeutronStarsById: ReadonlyMap<
    number,
    SharedCombatTrackedNeutronStarBody
  >;
  previousSunSwallowedAtById?: Map<number, number | null> | undefined;
  previousSunsById: Map<number, SharedCombatTrackedSunBody>;
  resolveSunProfile: (args: {
    index: number;
    sun: SunBody;
  }) => SunVisualProfile;
  resolveSwallowedAtSec?:
    | ((args: { index: number; sun: SunBody }) => number | null)
    | undefined;
  sunVisuals: Map<number, SunVisual>;
  suns: readonly SunBody[];
  syncVisual: (args: {
    index: number;
    nowSec: number;
    sun: SunBody;
    sunProfile: SunVisualProfile;
    swallowedAtSec: number | null;
    visual: SunVisual;
  }) => void;
}

export const syncSharedCombatDynamicSunPresentation = <
  SunBody extends {
    id: number;
    pos: Vec2;
    radius: number;
    vel: Vec2;
  },
  SunVisual,
>({
  blackHole,
  createVisual,
  currentNeutronStars,
  disposeVisual,
  nowSec,
  onSunAbsorbedByNeutronStar,
  onSunStartedBlackHoleSwallow,
  onSunSwallowedByBlackHole,
  previousNeutronStarsById,
  previousSunSwallowedAtById,
  previousSunsById,
  resolveSunProfile,
  resolveSwallowedAtSec,
  sunVisuals,
  suns,
  syncVisual,
}: SharedCombatDynamicSunPresentationArgs<SunBody, SunVisual>) => {
  const activeSunIds = new Set<number>();

  for (const [index, sun] of suns.entries()) {
    activeSunIds.add(sun.id);
    const sunProfile = resolveSunProfile({
      index,
      sun,
    });
    const swallowedAtSec =
      resolveSwallowedAtSec?.({
        index,
        sun,
      }) ?? null;
    let visual = sunVisuals.get(sun.id);
    if (visual === undefined) {
      visual = createVisual({
        index,
        sun,
        sunProfile,
      });
      sunVisuals.set(sun.id, visual);
    }
    syncVisual({
      index,
      nowSec,
      sun,
      sunProfile,
      swallowedAtSec,
      visual,
    });

    const previousSwallowedAt = previousSunSwallowedAtById?.get(sun.id) ?? null;
    if (
      onSunStartedBlackHoleSwallow !== undefined &&
      previousSwallowedAt === null &&
      swallowedAtSec !== null
    ) {
      onSunStartedBlackHoleSwallow({
        sun,
        sunId: sun.id,
        sunProfile,
        swallowedAtSec,
      });
    }
  }

  for (const [sunId, visual] of sunVisuals) {
    if (activeSunIds.has(sunId)) {
      continue;
    }

    disposeVisual(visual);
    sunVisuals.delete(sunId);
  }

  for (const [sunId, previousSun] of previousSunsById) {
    if (activeSunIds.has(sunId)) {
      continue;
    }

    if (
      blackHole !== null &&
      isWithinSharedCombatBlackHoleSwallowBand({
        blackHole,
        margin: getSharedCombatSunSwallowMargin(previousSun),
        pos: previousSun.pos,
      })
    ) {
      onSunSwallowedByBlackHole({
        sun: previousSun,
        sunId,
      });
      continue;
    }

    const absorbingNeutronStar = findAbsorbingNeutronStar({
      currentNeutronStars,
      previousNeutronStarsById,
      sun: previousSun,
    });
    if (absorbingNeutronStar === null) {
      continue;
    }

    onSunAbsorbedByNeutronStar({
      neutronStar: absorbingNeutronStar,
      sun: previousSun,
      sunId,
    });
  }

  previousSunsById.clear();
  for (const [index, sun] of suns.entries()) {
    const sunProfile = resolveSunProfile({
      index,
      sun,
    });
    previousSunsById.set(sun.id, {
      color: sunProfile.glowColor,
      pos: { ...sun.pos },
      radius: sun.radius,
      vel: { ...sun.vel },
    });
  }

  if (previousSunSwallowedAtById !== undefined) {
    previousSunSwallowedAtById.clear();
    for (const [index, sun] of suns.entries()) {
      previousSunSwallowedAtById.set(
        sun.id,
        resolveSwallowedAtSec?.({
          index,
          sun,
        }) ?? null,
      );
    }
  }
};

export interface SharedCombatDynamicNeutronStarPresentationArgs<
  NeutronStarBody extends {
    id: number;
    mass: number;
    pos: Vec2;
    radius: number;
  },
  NeutronStarVisual,
> {
  createVisual: (args: {
    index: number;
    neutronStar: NeutronStarBody;
  }) => NeutronStarVisual;
  disposeVisual: (visual: NeutronStarVisual) => void;
  neutronStarVisuals: Map<number, NeutronStarVisual>;
  neutronStars: readonly NeutronStarBody[];
  nowSec: number;
  previousNeutronStarsById: Map<number, SharedCombatTrackedNeutronStarBody>;
  syncVisual: (args: {
    index: number;
    neutronStar: NeutronStarBody;
    nowSec: number;
    visual: NeutronStarVisual;
  }) => void;
}

export const syncSharedCombatDynamicNeutronStarPresentation = <
  NeutronStarBody extends {
    id: number;
    mass: number;
    pos: Vec2;
    radius: number;
  },
  NeutronStarVisual,
>({
  createVisual,
  disposeVisual,
  neutronStarVisuals,
  neutronStars,
  nowSec,
  previousNeutronStarsById,
  syncVisual,
}: SharedCombatDynamicNeutronStarPresentationArgs<
  NeutronStarBody,
  NeutronStarVisual
>) => {
  const activeNeutronStarIds = new Set<number>();

  for (const [index, neutronStar] of neutronStars.entries()) {
    activeNeutronStarIds.add(neutronStar.id);
    let visual = neutronStarVisuals.get(neutronStar.id);
    if (visual === undefined) {
      visual = createVisual({
        index,
        neutronStar,
      });
      neutronStarVisuals.set(neutronStar.id, visual);
    }
    syncVisual({
      index,
      neutronStar,
      nowSec,
      visual,
    });
  }

  for (const [neutronStarId, visual] of neutronStarVisuals) {
    if (activeNeutronStarIds.has(neutronStarId)) {
      continue;
    }

    disposeVisual(visual);
    neutronStarVisuals.delete(neutronStarId);
  }

  previousNeutronStarsById.clear();
  for (const neutronStar of neutronStars) {
    previousNeutronStarsById.set(neutronStar.id, {
      mass: neutronStar.mass,
      pos: { ...neutronStar.pos },
      radius: neutronStar.radius,
    });
  }
};

export interface SharedCombatDynamicPlanetPresentationArgs<
  PlanetBody extends {
    id: number;
    pos: Vec2;
  },
  PlanetVisual,
> {
  createVisual: (args: { index: number; planet: PlanetBody }) => PlanetVisual;
  disposeVisual: (visual: PlanetVisual) => void;
  onPlanetStartedBlackHoleSwallow?:
    | ((args: { planet: PlanetBody; planetId: number }) => void)
    | undefined;
  planetVisuals: Map<number, PlanetVisual>;
  planets: readonly PlanetBody[];
  previousPlanetAliveById?: Map<number, boolean> | undefined;
  resolveAlive?:
    | ((args: { index: number; planet: PlanetBody }) => boolean)
    | undefined;
  shouldTriggerBlackHoleSwallow?:
    | ((args: { index: number; planet: PlanetBody }) => boolean)
    | undefined;
  syncVisual: (args: {
    alive: boolean;
    index: number;
    planet: PlanetBody;
    visual: PlanetVisual;
  }) => void;
}

export const syncSharedCombatDynamicPlanetPresentation = <
  PlanetBody extends {
    id: number;
    pos: Vec2;
  },
  PlanetVisual,
>({
  createVisual,
  disposeVisual,
  onPlanetStartedBlackHoleSwallow,
  planetVisuals,
  planets,
  previousPlanetAliveById,
  resolveAlive,
  syncVisual,
  shouldTriggerBlackHoleSwallow,
}: SharedCombatDynamicPlanetPresentationArgs<PlanetBody, PlanetVisual>) => {
  const activePlanetIds = new Set<number>();

  for (const [index, planet] of planets.entries()) {
    activePlanetIds.add(planet.id);
    const alive =
      resolveAlive?.({
        index,
        planet,
      }) ?? true;
    const wasAlive = previousPlanetAliveById?.get(planet.id) ?? alive;
    let visual = planetVisuals.get(planet.id);

    if (visual === undefined) {
      visual = createVisual({
        index,
        planet,
      });
      planetVisuals.set(planet.id, visual);
    }

    syncVisual({
      alive,
      index,
      planet,
      visual,
    });

    if (
      onPlanetStartedBlackHoleSwallow !== undefined &&
      wasAlive &&
      !alive &&
      (shouldTriggerBlackHoleSwallow?.({
        index,
        planet,
      }) ??
        true)
    ) {
      onPlanetStartedBlackHoleSwallow({
        planet,
        planetId: planet.id,
      });
    }
  }

  for (const [planetId, visual] of planetVisuals) {
    if (activePlanetIds.has(planetId)) {
      continue;
    }

    disposeVisual(visual);
    planetVisuals.delete(planetId);
  }

  if (previousPlanetAliveById !== undefined) {
    previousPlanetAliveById.clear();
    for (const [index, planet] of planets.entries()) {
      previousPlanetAliveById.set(
        planet.id,
        resolveAlive?.({
          index,
          planet,
        }) ?? true,
      );
    }
  }
};
