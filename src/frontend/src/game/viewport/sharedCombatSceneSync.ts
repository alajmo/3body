import type { Vec2 } from "@3body/shared";
import type { SharedCombatCacheBody } from "./cacheVisuals";
import {
  type SharedCombatBackgroundLayerHost,
  syncSharedCombatBackgroundParallax,
} from "./sharedCombatBackgroundParallax";
import {
  type SharedCombatDynamicNeutronStarPresentationArgs,
  type SharedCombatDynamicPlanetPresentationArgs,
  type SharedCombatDynamicSunPresentationArgs,
  syncSharedCombatDynamicNeutronStarPresentation,
  syncSharedCombatDynamicPlanetPresentation,
  syncSharedCombatDynamicSunPresentation,
} from "./sharedCombatDynamicCelestialSync";
import type { SharedCombatRocketBody } from "./sharedCombatRocketPools";
import { syncSharedCombatViewportFrame } from "./sharedCombatViewportFrame";
import type { ViewportFrameBundle } from "./viewportFrameState";

export interface SharedCombatSceneBackgroundSync {
  backgroundLayers: readonly SharedCombatBackgroundLayerHost[];
  nowSec: number;
  renderCenterX: number;
  renderCenterY: number;
}

interface SharedCombatSceneSyncParams<
  SunBody extends {
    id: number;
    pos: Vec2;
    radius: number;
    vel: Vec2;
  },
  SunVisual,
  NeutronStarBody extends {
    id: number;
    mass: number;
    pos: Vec2;
    radius: number;
  },
  NeutronStarVisual,
  PlanetBody extends {
    id: number;
    pos: Vec2;
  },
  PlanetVisual,
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
> {
  background: SharedCombatSceneBackgroundSync;
  celestial: {
    neutronStar: SharedCombatDynamicNeutronStarPresentationArgs<
      NeutronStarBody,
      NeutronStarVisual
    >;
    planet: SharedCombatDynamicPlanetPresentationArgs<PlanetBody, PlanetVisual>;
    sun: SharedCombatDynamicSunPresentationArgs<SunBody, SunVisual>;
  };
  viewport: {
    bundle: ViewportFrameBundle<CacheBody, Rocket, Burst>;
  };
}

export const syncSharedCombatScene = <
  SunBody extends {
    id: number;
    pos: Vec2;
    radius: number;
    vel: Vec2;
  },
  SunVisual,
  NeutronStarBody extends {
    id: number;
    mass: number;
    pos: Vec2;
    radius: number;
  },
  NeutronStarVisual,
  PlanetBody extends {
    id: number;
    pos: Vec2;
  },
  PlanetVisual,
  CacheBody extends SharedCombatCacheBody,
  Rocket extends SharedCombatRocketBody & { radius: number },
  Burst extends {
    absorbedByShield: boolean;
    color: string;
  },
>({
  background,
  celestial,
  viewport,
}: SharedCombatSceneSyncParams<
  SunBody,
  SunVisual,
  NeutronStarBody,
  NeutronStarVisual,
  PlanetBody,
  PlanetVisual,
  CacheBody,
  Rocket,
  Burst
>) => {
  syncSharedCombatBackgroundParallax(background);
  syncSharedCombatDynamicSunPresentation(celestial.sun);
  syncSharedCombatDynamicNeutronStarPresentation(celestial.neutronStar);
  syncSharedCombatDynamicPlanetPresentation(celestial.planet);

  return syncSharedCombatViewportFrame({
    frame: viewport.bundle.frame,
    resources: viewport.bundle.resources,
  });
};
