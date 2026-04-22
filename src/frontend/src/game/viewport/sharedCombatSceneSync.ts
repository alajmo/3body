import type { Vec2 } from "@3body/shared";
import type { SharedCombatCacheBody } from "./cacheVisuals";
import { syncSharedCombatBackgroundParallax, type SharedCombatBackgroundLayerHost } from "./sharedCombatBackgroundParallax";
import {
  syncSharedCombatDynamicNeutronStarPresentation,
  syncSharedCombatDynamicPlanetPresentation,
  syncSharedCombatDynamicSunPresentation,
  type SharedCombatDynamicNeutronStarPresentationArgs,
  type SharedCombatDynamicPlanetPresentationArgs,
  type SharedCombatDynamicSunPresentationArgs,
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

export interface SharedCombatSceneSyncParams<
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
  TrailVisual,
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
    planet: SharedCombatDynamicPlanetPresentationArgs<
      PlanetBody,
      PlanetVisual,
      TrailVisual
    >;
    sun: SharedCombatDynamicSunPresentationArgs<SunBody, SunVisual>;
  };
  viewport: {
    bundle: ViewportFrameBundle<CacheBody, Rocket, Burst>;
    nowSec: number;
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
  TrailVisual,
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
  TrailVisual,
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
    nowSec: viewport.nowSec,
    resources: viewport.bundle.resources,
  });
};
