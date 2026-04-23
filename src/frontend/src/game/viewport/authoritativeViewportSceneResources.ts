import type { RocketKind } from "@3body/shared";
import { ROOM_CAPACITY, SHIELD_SPEC } from "@3body/shared";
import {
  AdditiveBlending,
  CircleGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  type Scene,
  SphereGeometry,
} from "three/webgpu";
import { getScaledRocketVisuals } from "../rocketVisualTuning";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import {
  SHIELD_GLOW_OUTER_SCALE,
  SHIELD_INNER_SCALE,
  SHIELD_OUTER_SCALE,
} from "../shieldPresentation";
import {
  createRocketFlameMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
} from "../showcaseVisuals";
import {
  createAuthoritativeViewportRuntimeImmediateFireFeedbackVisuals,
  getAuthoritativeViewportRuntimeCacheVisuals,
  setAuthoritativeViewportRuntimeSceneResources,
  setAuthoritativeViewportRuntimeTransientVisualPools,
  type AuthoritativeViewportRuntimeAdapter,
} from "./authoritativeViewportRuntimeAdapter";
import {
  createBlackHoleCoreMaterial,
  createBlackHoleLensMaterial,
  createBlackHoleRingMaterial,
  createBoostWakeMaterial,
  createPlanetExplosionVisual,
  createRocketLaunchBurstMaterial,
} from "./localViewportVisualFactories";
import { createSharedCombatViewportVisualResources } from "./sharedCombatViewportResources";

export const createAuthoritativeViewportSceneResources = ({
  adapter,
  blackHoleSwallowCapacity,
  boostBurstSampleLimit,
  debrisSampleLimit,
  disposables,
  document,
  impactBurstLimit,
  launchBurstInstanceLimits,
  planetExplosionLimit,
  rocketKinds,
  rocketTrailInstanceLimits,
  scene,
}: {
  adapter: AuthoritativeViewportRuntimeAdapter;
  blackHoleSwallowCapacity: number;
  boostBurstSampleLimit: number;
  debrisSampleLimit: number;
  disposables: Array<{ dispose: () => void }>;
  document: Document;
  impactBurstLimit: number;
  launchBurstInstanceLimits: Record<RocketKind, number>;
  planetExplosionLimit: number;
  rocketKinds: readonly RocketKind[];
  rocketTrailInstanceLimits: Record<RocketKind, number>;
  scene: Scene;
}) => {
  const sunGeometry = new SphereGeometry(1, 40, 40);
  const planetGeometry = new SphereGeometry(1, 56, 56);
  const glowGeometry = new CircleGeometry(1, 48);
  const warpGeometry = new RingGeometry(0.55, 1, 72);
  const rocketGeometry = new CylinderGeometry(0.58, 1, 1, 18, 1);
  const ribbonGeometry = new PlaneGeometry(1, 1);
  rocketGeometry.rotateZ(-Math.PI / 2);
  disposables.push(
    sunGeometry,
    planetGeometry,
    glowGeometry,
    warpGeometry,
    rocketGeometry,
    ribbonGeometry,
  );

  const initialTuning = getRuntimeTuningDocument();
  const abilityVisuals = initialTuning.visuals.abilities;
  const cannonMetalMaterial = new MeshBasicMaterial({
    color: "#7c8ea8",
  });
  const cannonAccentMaterial = new MeshBasicMaterial({
    color: initialTuning.visuals.rockets.light.hudAccent,
  });
  const cannonFlashMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: "#fff1c2",
    depthWrite: false,
    opacity: 0,
    transparent: true,
  });
  const initialScaledRocketVisualTuning = getScaledRocketVisuals(
    initialTuning.visuals.rockets,
  );
  const {
    blackHoleGroup,
    blackHoleRing,
    boostBurstVisual,
    boundaryDebrisVisual,
    cacheSpriteAssets,
    cannonVisual,
    debrisVisual,
    gravityPulseVisual,
    impactBurstVisuals,
    inactiveBlackHoleSwallowVisuals,
    inactivePlanetExplosionVisuals,
    lockRingLockedUniform,
    lockRingMesh,
    lockRingProgressUniform,
    lockRingTimeUniform,
    rocketLaunchBurstPools,
    rocketPools,
    shieldArcOpacityUniform,
    shieldPanelOpacityUniform,
    shieldCrestOpacityUniform,
    shieldGlowOpacityUniform,
    shieldGroup,
  } = createSharedCombatViewportVisualResources({
    blackHoleDepthOffsets: {
      ring: -1,
    },
    blackHoleSwallowCapacity,
    boostBurstSampleLimit,
    boostColor: abilityVisuals.boostColor,
    boundaryAsteroidMeshNamePrefix: "authoritativeBoundaryAsteroid",
    cacheVisuals: getAuthoritativeViewportRuntimeCacheVisuals(adapter),
    cannon: {
      accentMaterial: cannonAccentMaterial,
      flashMaterial: cannonFlashMaterial,
      metalMaterial: cannonMetalMaterial,
      setAccentColor: (value: string) => {
        cannonAccentMaterial.color.set(value);
      },
    },
    createBlackHoleCoreMaterial,
    createBlackHoleLensMaterial,
    createBlackHoleRingMaterial,
    createBoostWakeMaterial,
    createPlanetExplosionVisual,
    createRocketFlameMaterial,
    createRocketLaunchBurstMaterial,
    createRocketMaterial,
    createRocketTrailMaterial,
    debrisSampleLimit,
    disposeCacheVisual: () => {},
    disposables,
    document,
    getBlackHoleCoreRadius: () => initialTuning.visuals.blackHole.coreRadius,
    getBlackHoleLensRadius: () => initialTuning.visuals.blackHole.lensRadius,
    getBlackHoleRingRadius: () => initialTuning.visuals.blackHole.ringRadius,
    gravityPulseColors: {
      core: abilityVisuals.wildcardColor,
      echo: abilityVisuals.wildcardColor,
      ring: abilityVisuals.wildcardColor,
    },
    gravityPulseRenderOrders: {
      core: 6,
      echo: 7,
      ring: 8,
    },
    impactBurstLimit,
    launchBurstInstanceLimits,
    lockRingAccentColor: initialTuning.visuals.rockets.seeker.hudAccent,
    planetExplosionLimit,
    rocketKinds,
    rocketRenderProfiles: initialScaledRocketVisualTuning,
    rocketTrailInstanceLimits,
    scene,
    shieldArcDeg:
      initialTuning.gameplay.abilities.shield?.arcDeg ?? SHIELD_SPEC.arcDeg,
    shieldColor: abilityVisuals.shieldColor,
    shieldGlowOuterScale: SHIELD_GLOW_OUTER_SCALE,
    shieldInnerScale: SHIELD_INNER_SCALE,
    shieldOuterScale: SHIELD_OUTER_SCALE,
    wakeCount: ROOM_CAPACITY,
  });

  setAuthoritativeViewportRuntimeTransientVisualPools({
    adapter,
    inactiveBlackHoleSwallowVisuals,
    inactivePlanetExplosionVisuals,
  });
  setAuthoritativeViewportRuntimeSceneResources({
    adapter,
    resources: {
      debris: {
        boundaryDebrisVisual,
        debrisVisual,
        maxDebrisSamples: debrisSampleLimit,
      },
      effects: {
        impactBurstVisuals,
      },
      geometries: {
        glowGeometry,
        planetGeometry,
        ribbonGeometry,
        sunGeometry,
        warpGeometry,
      },
      lockRing: {
        lockedUniform: lockRingLockedUniform,
        mesh: lockRingMesh,
        progressUniform: lockRingProgressUniform,
        timeUniform: lockRingTimeUniform,
      },
      rocketLaunchBurstPools,
      rocketPools,
      shield: {
        arcOpacityUniform: shieldArcOpacityUniform,
        crestOpacityUniform: shieldCrestOpacityUniform,
        glowOpacityUniform: shieldGlowOpacityUniform,
        group: shieldGroup,
        panelOpacityUniform: shieldPanelOpacityUniform,
      },
      visuals: {
        blackHoleGroup,
        blackHoleRing,
        boostBurstVisual,
        cacheSpriteAssets,
        cannonVisual,
        gravityPulseVisual,
      },
    },
  });

  createAuthoritativeViewportRuntimeImmediateFireFeedbackVisuals({
    adapter,
    createRocketFlameMaterial,
    createRocketLaunchBurstMaterial,
    createRocketMaterial,
    createRocketTrailMaterial,
    disposables,
    ribbonGeometry,
    rocketAppearances: initialScaledRocketVisualTuning,
    rocketGeometry,
    scene,
  });
};
