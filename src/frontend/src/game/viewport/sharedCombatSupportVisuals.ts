import { add, clamp, len, lerp, scale, type Vec2 } from "@3body/shared";
import type { Group, Mesh, MeshBasicMaterial } from "three/webgpu";
import { getRenderedShieldOuterRadius } from "../shieldPresentation";
import { getBlackHoleVisualScale } from "./blackHoleVisuals";
import type { getCannonWorldLayout } from "../rocketVisibility";
import type {
  SharedCombatGravityPulseVisual,
  SharedCombatImpactBurstVisual,
} from "./sharedCombatSceneResources";

const DEFAULT_IMPACT_NORMAL = { x: 1, y: 0 } satisfies Vec2;
const DEFAULT_SHIELD_HIT_REACT_DURATION_SEC = 0.26;

export interface SharedCombatGravityPulseState {
  effectRadius: number;
  origin: Vec2;
  planetRadius: number;
  startedAtSec: number;
}

interface SharedCombatGravityPulseDepths {
  core: number;
  echo: number;
  ring: number;
}

interface SharedCombatImpactBurstPresentation {
  absorbedByShield: boolean;
  durationSec: number;
  normal: Vec2;
  startedAtSec: number;
  targetPos: Vec2;
  targetRadius: number;
  targetRenderedRadius: number;
}

interface SharedCombatImpactBurstDepths {
  core: number;
  glow: number;
  ring: number;
}

export interface SharedCombatShieldImpactBurst {
  absorbedByShield: boolean;
  normal: Vec2;
  planetId: number;
  startedAtSec: number;
}

interface SharedCombatShieldHitReact {
  arcBoost: number;
  glowBoost: number;
  offset: Vec2;
  rotation: number;
  scale: number;
}

export interface SharedCombatShieldVisual {
  arcOpacityUniform: { value: unknown };
  crestOpacityUniform: { value: unknown };
  glowOpacityUniform: { value: unknown };
  group: Group;
  panelOpacityUniform: { value: unknown };
}

interface SharedCombatShieldPresentation {
  arcOpacity: number;
  center: Vec2;
  crestOpacity: number;
  glowOpacity: number;
  panelOpacity: number;
  radius: number;
  rotation: number;
  z: number;
}

export interface SharedCombatLockRingVisual {
  lockedUniform: { value: unknown };
  mesh: Mesh;
  progressUniform: { value: unknown };
  timeUniform: { value: unknown };
}

export interface SharedCombatLockRingPresentation {
  baseRadius: number;
  locked: boolean;
  nowSec: number;
  position: Vec2;
  progress: number;
  z: number;
}

export interface SharedCombatBlackHoleVisual {
  group: Group;
  ringMesh: Mesh;
}

export interface SharedCombatBlackHolePresentation {
  killRadius: number;
  pos: Vec2;
  z: number;
}

export interface SharedCombatCannonVisual {
  barrelBandMesh: Mesh;
  barrelMesh: Mesh;
  breechMesh: Mesh;
  flashMaterial: MeshBasicMaterial;
  flashMesh: Mesh;
  group: Group;
  muzzleMesh: Mesh;
  setAccentColor: (value: string) => void;
  stemMesh: Mesh;
}

interface SharedCombatCannonPresentation {
  accent: string;
  aimAngle: number;
  flashAccent: string | null;
  flashAgeSec: number | null;
  layout: ReturnType<typeof getCannonWorldLayout>;
  position: Vec2;
  surfaceOffset: number;
  visible: boolean;
  z: number;
}

export interface SharedCombatAimedCannonPresentation
  extends Omit<SharedCombatCannonPresentation, "aimAngle"> {
  aimTarget: Vec2;
}

export interface SharedCombatImmediateShieldFeedbackState {
  aimDir: Vec2;
  startedAtSec: number;
}

const hideSharedCombatGravityPulseVisual = (
  visual: SharedCombatGravityPulseVisual,
) => {
  visual.coreMesh.visible = false;
  visual.ringMesh.visible = false;
  visual.echoMesh.visible = false;
  visual.coreMaterial.opacity = 0;
  visual.ringMaterial.opacity = 0;
  visual.echoMaterial.opacity = 0;
};

const updateSharedCombatGravityPulseVisual = ({
  durationSec,
  nowSec,
  pulse,
  visibleWorldHeight,
  visual,
  z,
}: {
  durationSec: number;
  nowSec: number;
  pulse: SharedCombatGravityPulseState | null;
  visibleWorldHeight: number;
  visual: SharedCombatGravityPulseVisual;
  z: SharedCombatGravityPulseDepths;
}) => {
  if (pulse === null) {
    hideSharedCombatGravityPulseVisual(visual);
    return;
  }

  const ageSec = nowSec - pulse.startedAtSec;
  if (ageSec < 0 || ageSec > durationSec) {
    hideSharedCombatGravityPulseVisual(visual);
    return;
  }

  const progress = clamp(ageSec / Math.max(durationSec, 1e-6), 0, 1);
  const fade = (1 - progress) ** 1.6;
  const visiblePulseRadius = Math.min(
    pulse.effectRadius,
    Math.max(pulse.planetRadius * 6, visibleWorldHeight * 0.42),
  );
  const primaryRadius = lerp(
    pulse.planetRadius * 1.25,
    visiblePulseRadius,
    progress,
  );
  const echoRadius = lerp(
    pulse.planetRadius * 1.55,
    visiblePulseRadius * 0.88,
    progress,
  );
  const coreRadius = lerp(
    pulse.planetRadius * 1.2,
    pulse.planetRadius * 3.6,
    Math.min(1, progress * 1.6),
  );

  visual.coreMesh.visible = true;
  visual.ringMesh.visible = true;
  visual.echoMesh.visible = true;
  visual.coreMesh.position.set(pulse.origin.x, pulse.origin.y, z.core);
  visual.ringMesh.position.set(pulse.origin.x, pulse.origin.y, z.ring);
  visual.echoMesh.position.set(pulse.origin.x, pulse.origin.y, z.echo);
  visual.coreMesh.scale.set(coreRadius, coreRadius, 1);
  visual.ringMesh.scale.set(primaryRadius, primaryRadius, 1);
  visual.echoMesh.scale.set(echoRadius, echoRadius, 1);
  visual.ringMesh.rotation.z = progress * 0.42;
  visual.echoMesh.rotation.z = -progress * 0.28;
  visual.coreMaterial.opacity = fade * (0.28 + (1 - progress) * 0.3);
  visual.ringMaterial.opacity = fade * 0.96;
  visual.echoMaterial.opacity = fade * 0.56;
};

export const syncSharedCombatGravityPulsePresentation = ({
  durationSec,
  nowSec,
  pulse,
  visibleWorldHeight,
  visual,
  z,
}: {
  durationSec: number;
  nowSec: number;
  pulse: SharedCombatGravityPulseState | null;
  visibleWorldHeight: number;
  visual: SharedCombatGravityPulseVisual | null;
  z: SharedCombatGravityPulseDepths;
}): SharedCombatGravityPulseState | null => {
  if (visual === null) {
    return pulse;
  }

  const nextPulse =
    pulse !== null && nowSec - pulse.startedAtSec > durationSec ? null : pulse;
  updateSharedCombatGravityPulseVisual({
    durationSec,
    nowSec,
    pulse: nextPulse,
    visibleWorldHeight,
    visual,
    z,
  });
  return nextPulse;
};

export const getSharedCombatShieldHitReact = ({
  bursts,
  durationSec = DEFAULT_SHIELD_HIT_REACT_DURATION_SEC,
  nowSec,
  planetId,
  shieldRadius,
}: {
  bursts: readonly SharedCombatShieldImpactBurst[];
  durationSec?: number;
  nowSec: number;
  planetId: number;
  shieldRadius: number;
}): SharedCombatShieldHitReact => {
  let strongestBurst: SharedCombatShieldImpactBurst | null = null;
  let strongestEnvelope = 0;

  for (const burst of bursts) {
    if (!burst.absorbedByShield || burst.planetId !== planetId) {
      continue;
    }

    const ageSec = nowSec - burst.startedAtSec;
    if (ageSec < 0 || ageSec > durationSec) {
      continue;
    }

    const envelope = 1 - ageSec / durationSec;
    if (envelope > strongestEnvelope) {
      strongestEnvelope = envelope;
      strongestBurst = burst;
    }
  }

  if (strongestBurst === null) {
    return {
      arcBoost: 0,
      glowBoost: 0,
      offset: { x: 0, y: 0 },
      rotation: 0,
      scale: 1,
    };
  }

  const ageSec = nowSec - strongestBurst.startedAtSec;
  const normal =
    len(strongestBurst.normal) > 0.001
      ? strongestBurst.normal
      : DEFAULT_IMPACT_NORMAL;
  const tangent = { x: -normal.y, y: normal.x } satisfies Vec2;
  const shake = Math.sin(ageSec * 72) * strongestEnvelope;
  const rebound = Math.sin(ageSec * 24) * strongestEnvelope;

  return {
    arcBoost: strongestEnvelope * 0.3,
    glowBoost: strongestEnvelope * 0.22,
    offset: add(
      scale(normal, shieldRadius * 0.02 * strongestEnvelope),
      scale(tangent, shieldRadius * 0.045 * shake),
    ),
    rotation: shake * 0.1,
    scale: 1 + strongestEnvelope * 0.08 + Math.abs(rebound) * 0.04,
  };
};

const hideSharedCombatShieldVisual = (visual: SharedCombatShieldVisual) => {
  visual.group.visible = false;
  visual.glowOpacityUniform.value = 0;
  visual.arcOpacityUniform.value = 0;
  visual.panelOpacityUniform.value = 0;
  visual.crestOpacityUniform.value = 0;
};

const syncSharedCombatShieldVisual = ({
  state,
  visual,
}: {
  state: SharedCombatShieldPresentation | null;
  visual: SharedCombatShieldVisual;
}) => {
  if (state === null) {
    hideSharedCombatShieldVisual(visual);
    return;
  }

  visual.group.visible = true;
  visual.group.position.set(state.center.x, state.center.y, state.z);
  visual.group.scale.set(state.radius, state.radius, 1);
  visual.group.rotation.z = state.rotation;
  visual.glowOpacityUniform.value = state.glowOpacity;
  visual.arcOpacityUniform.value = state.arcOpacity;
  visual.panelOpacityUniform.value = state.panelOpacity;
  visual.crestOpacityUniform.value = state.crestOpacity;
};

export const syncSharedCombatPlayerShieldPresentation = ({
  active,
  activeAimDir,
  bursts,
  immediateFeedback = null,
  immediateFeedbackDurationSec = 0,
  nowSec,
  planet,
  shieldRadius,
  visual,
}: {
  active: boolean;
  activeAimDir: Vec2 | null;
  bursts: readonly SharedCombatShieldImpactBurst[];
  immediateFeedback?: SharedCombatImmediateShieldFeedbackState | null;
  immediateFeedbackDurationSec?: number;
  nowSec: number;
  planet: {
    id: number;
    pos: Vec2;
    shieldLoad: number;
    shieldMaxLoad: number;
  } | null;
  shieldRadius: number;
  visual: SharedCombatShieldVisual | null;
}): SharedCombatImmediateShieldFeedbackState | null => {
  if (visual === null) {
    return immediateFeedback;
  }

  if (planet === null) {
    syncSharedCombatShieldVisual({
      state: null,
      visual,
    });
    return immediateFeedback;
  }

  let nextImmediateFeedback = immediateFeedback;
  if (active) {
    nextImmediateFeedback = null;
  }

  const immediateShieldAgeSec =
    nextImmediateFeedback === null
      ? Number.POSITIVE_INFINITY
      : nowSec - nextImmediateFeedback.startedAtSec;
  const immediateShieldVisible =
    nextImmediateFeedback !== null &&
    immediateShieldAgeSec >= 0 &&
    immediateShieldAgeSec <= immediateFeedbackDurationSec;

  if (!active && !immediateShieldVisible) {
    syncSharedCombatShieldVisual({
      state: null,
      visual,
    });
    if (
      nextImmediateFeedback !== null &&
      immediateShieldAgeSec > immediateFeedbackDurationSec
    ) {
      nextImmediateFeedback = null;
    }
    return nextImmediateFeedback;
  }

  const shieldAimDir = active
    ? activeAimDir
    : (nextImmediateFeedback?.aimDir ?? null);
  if (shieldAimDir === null) {
    syncSharedCombatShieldVisual({
      state: null,
      visual,
    });
    return nextImmediateFeedback;
  }

  const shieldLoadRatio =
    planet.shieldMaxLoad > 0
      ? clamp(planet.shieldLoad / planet.shieldMaxLoad, 0, 1)
      : 0;
  const pulse = 1 + Math.sin(nowSec * 8.2) * 0.035;
  const shieldAngle = Math.atan2(shieldAimDir.y, shieldAimDir.x);

  if (active) {
    const shieldHitReact = getSharedCombatShieldHitReact({
      bursts,
      nowSec,
      planetId: planet.id,
      shieldRadius,
    });
    syncSharedCombatShieldVisual({
      state: {
        arcOpacity: clamp(
          0.16 +
            shieldLoadRatio * 0.3 +
            Math.sin(nowSec * 7.6) * 0.05 +
            shieldHitReact.arcBoost,
          0,
          1,
        ),
        center: add(planet.pos, shieldHitReact.offset),
        crestOpacity: clamp(
          0.16 +
            shieldLoadRatio * 0.36 +
            Math.sin(nowSec * 10.8) * 0.06 +
            shieldHitReact.arcBoost * 0.88,
          0,
          1,
        ),
        glowOpacity: clamp(
          0.05 +
            shieldLoadRatio * 0.11 +
            Math.sin(nowSec * 9.4) * 0.03 +
            shieldHitReact.glowBoost,
          0,
          1,
        ),
        panelOpacity: clamp(
          0.18 +
            shieldLoadRatio * 0.42 +
            Math.sin(nowSec * 9.8) * 0.05 +
            shieldHitReact.arcBoost * 0.84,
          0,
          1,
        ),
        radius: shieldRadius * pulse * shieldHitReact.scale,
        rotation: shieldAngle + shieldHitReact.rotation,
        z: 0,
      },
      visual,
    });
    return nextImmediateFeedback;
  }

  const immediateShieldFade =
    1 -
    clamp(
      immediateShieldAgeSec / Math.max(immediateFeedbackDurationSec, 1e-6),
      0,
      1,
    );
  syncSharedCombatShieldVisual({
    state: {
      arcOpacity: clamp(0.14 + immediateShieldFade * 0.34, 0, 1),
      center: planet.pos,
      crestOpacity: clamp(0.1 + immediateShieldFade * 0.3, 0, 1),
      glowOpacity: clamp(
        0.04 + immediateShieldFade * 0.18 + Math.sin(nowSec * 10.2) * 0.02,
        0,
        1,
      ),
      panelOpacity: clamp(0.12 + immediateShieldFade * 0.28, 0, 1),
      radius: shieldRadius * pulse * (1 + immediateShieldFade * 0.06),
      rotation: shieldAngle,
      z: 0,
    },
    visual,
  });
  return nextImmediateFeedback;
};

export const getSharedCombatLockRingScale = ({
  baseRadius,
  locked,
  nowSec,
}: {
  baseRadius: number;
  locked: boolean;
  nowSec: number;
}): number => {
  const chargePulse = 1 + Math.sin(nowSec * 3.6) * 0.015;
  const lockedPulse = 1 + Math.sin(nowSec * 6.5) * 0.06;

  return baseRadius * (locked ? lockedPulse : chargePulse);
};

const hideSharedCombatLockRingVisual = (visual: SharedCombatLockRingVisual) => {
  visual.mesh.visible = false;
  visual.progressUniform.value = 0;
  visual.lockedUniform.value = 0;
};

const syncSharedCombatLockRingVisual = ({
  state,
  visual,
}: {
  state: SharedCombatLockRingPresentation | null;
  visual: SharedCombatLockRingVisual;
}) => {
  if (state === null) {
    hideSharedCombatLockRingVisual(visual);
    return;
  }

  visual.progressUniform.value = state.progress;
  visual.lockedUniform.value = state.locked ? 1 : 0;
  visual.timeUniform.value = state.nowSec;
  visual.mesh.visible = true;
  visual.mesh.position.set(state.position.x, state.position.y, state.z);
  const scale = getSharedCombatLockRingScale({
    baseRadius: state.baseRadius,
    locked: state.locked,
    nowSec: state.nowSec,
  });
  visual.mesh.scale.set(scale, scale, 1);
};

export const syncSharedCombatBlackHoleVisual = ({
  blackHole,
  nowSec,
  visual,
}: {
  blackHole: SharedCombatBlackHolePresentation | null;
  nowSec: number;
  visual: SharedCombatBlackHoleVisual;
}) => {
  visual.group.visible = blackHole !== null;
  if (blackHole === null) {
    visual.group.scale.set(1, 1, 1);
    return;
  }

  visual.group.position.set(blackHole.pos.x, blackHole.pos.y, blackHole.z);
  visual.ringMesh.rotation.z = nowSec * 0.16;
  const blackHoleScale = getBlackHoleVisualScale(blackHole.killRadius);
  visual.group.scale.set(blackHoleScale, blackHoleScale, 1);
};

export const syncSharedCombatCannonVisual = ({
  state,
  visual,
}: {
  state: SharedCombatCannonPresentation;
  visual: SharedCombatCannonVisual;
}) => {
  if (!state.visible) {
    hideSharedCombatCannonVisual(visual);
    return;
  }

  const stemStart = state.surfaceOffset;
  const breechStart = stemStart + state.layout.stemLenWorld;
  const barrelStart = breechStart + state.layout.breechLenWorld;
  const barrelEnd = barrelStart + state.layout.barrelLenWorld;

  visual.group.visible = true;
  visual.group.position.set(state.position.x, state.position.y, state.z);
  visual.group.rotation.z = state.aimAngle;
  visual.setAccentColor(state.accent);
  visual.stemMesh.position.set(
    stemStart + state.layout.stemLenWorld * 0.5,
    0,
    0,
  );
  visual.stemMesh.scale.set(
    state.layout.stemLenWorld,
    state.layout.stemRadiusWorld,
    state.layout.stemRadiusWorld,
  );
  visual.breechMesh.position.set(
    breechStart + state.layout.breechLenWorld * 0.5,
    0,
    0,
  );
  visual.breechMesh.scale.set(
    state.layout.breechLenWorld,
    state.layout.breechWidthWorld,
    state.layout.breechDepthWorld,
  );
  visual.barrelMesh.position.set(
    barrelStart + state.layout.barrelLenWorld * 0.5,
    0,
    0,
  );
  visual.barrelMesh.scale.set(
    state.layout.barrelLenWorld,
    state.layout.barrelRadiusWorld,
    state.layout.barrelRadiusWorld,
  );
  visual.barrelBandMesh.position.set(
    barrelStart + state.layout.barrelLenWorld * 0.32,
    0,
    0,
  );
  visual.barrelBandMesh.scale.set(
    state.layout.bandLenWorld,
    state.layout.bandRadiusWorld,
    state.layout.bandRadiusWorld,
  );
  visual.muzzleMesh.position.set(
    barrelEnd - state.layout.muzzleLenWorld * 0.5,
    0,
    0,
  );
  visual.muzzleMesh.scale.set(
    state.layout.muzzleLenWorld,
    state.layout.muzzleRadiusWorld,
    state.layout.muzzleRadiusWorld,
  );

  if (
    state.flashAgeSec === null ||
    state.flashAccent === null ||
    state.flashAgeSec < 0 ||
    state.flashAgeSec > state.layout.flashDurationSec
  ) {
    visual.flashMesh.visible = false;
    visual.flashMaterial.opacity = 0;
    return;
  }

  const flashProgress = clamp(
    state.flashAgeSec / state.layout.flashDurationSec,
    0,
    1,
  );
  const flashOpacity = (1 - flashProgress) ** 2.1;
  const flashLength =
    state.layout.flashRadiusWorld * (1.15 + (1 - flashProgress) * 1.35);
  const flashWidth =
    state.layout.flashRadiusWorld * (0.3 + (1 - flashProgress) * 0.42);
  visual.flashMesh.visible = true;
  visual.flashMaterial.opacity = flashOpacity;
  visual.flashMaterial.color.set(state.flashAccent);
  visual.flashMesh.position.set(barrelEnd + flashLength * 0.26, 0, 0);
  visual.flashMesh.scale.set(flashLength, flashWidth, flashWidth);
};

const hideSharedCombatCannonVisual = (visual: SharedCombatCannonVisual) => {
  visual.group.visible = false;
  visual.flashMesh.visible = false;
  visual.flashMaterial.opacity = 0;
};

export const syncSharedCombatPlayerWeaponPresentation = ({
  cannon,
  cannonVisual,
  lockRing,
  lockRingVisual,
}: {
  cannon: SharedCombatAimedCannonPresentation | null;
  cannonVisual: SharedCombatCannonVisual | null;
  lockRing: SharedCombatLockRingPresentation | null;
  lockRingVisual: SharedCombatLockRingVisual | null;
}) => {
  if (cannonVisual !== null) {
    if (cannon === null || !cannon.visible) {
      hideSharedCombatCannonVisual(cannonVisual);
    } else {
      syncSharedCombatCannonVisual({
        state: {
          ...cannon,
          aimAngle: Math.atan2(
            cannon.aimTarget.y - cannon.position.y,
            cannon.aimTarget.x - cannon.position.x,
          ),
        },
        visual: cannonVisual,
      });
    }
  }

  if (lockRingVisual !== null) {
    if (cannon === null || !cannon.visible || lockRing === null) {
      hideSharedCombatLockRingVisual(lockRingVisual);
    } else {
      syncSharedCombatLockRingVisual({
        state: lockRing,
        visual: lockRingVisual,
      });
    }
  }
};

export const hideSharedCombatImpactBurstVisual = (
  visual: SharedCombatImpactBurstVisual,
) => {
  visual.coreMesh.visible = false;
  visual.glowMesh.visible = false;
  visual.ringMesh.visible = false;
  visual.coreMaterial.opacity = 0;
  visual.glowMaterial.opacity = 0;
  visual.ringMaterial.opacity = 0;
};

export const syncSharedCombatImpactBurstVisual = ({
  burst,
  nowSec,
  visual,
  z,
}: {
  burst: SharedCombatImpactBurstPresentation;
  nowSec: number;
  visual: SharedCombatImpactBurstVisual;
  z: SharedCombatImpactBurstDepths;
}): boolean => {
  const ageSec = nowSec - burst.startedAtSec;
  if (ageSec < 0 || ageSec > burst.durationSec) {
    hideSharedCombatImpactBurstVisual(visual);
    return false;
  }

  const progress = clamp(ageSec / Math.max(burst.durationSec, 1e-6), 0, 1);
  const fade = (1 - progress) ** 1.6;
  const normal =
    len(burst.normal) > 0.001 ? burst.normal : DEFAULT_IMPACT_NORMAL;
  const impactSurfaceRadius = burst.absorbedByShield
    ? getRenderedShieldOuterRadius(burst.targetRadius)
    : burst.targetRenderedRadius;
  const radialDrift =
    impactSurfaceRadius *
    (burst.absorbedByShield ? 0.98 + progress * 0.05 : 0.94 + progress * 0.08);
  const impactPos = add(burst.targetPos, scale(normal, radialDrift));
  const glowAlpha =
    fade *
    (burst.absorbedByShield
      ? 0.34 + (1 - progress) * 0.24
      : 0.28 + (1 - progress) * 0.16);
  const flashAlpha =
    fade *
    (burst.absorbedByShield
      ? 0.58 + (1 - progress) * 0.26
      : 0.72 + (1 - progress) * 0.18);
  const ringAlpha = fade * (burst.absorbedByShield ? 0.56 : 0.44);
  const glowScale =
    impactSurfaceRadius *
    (burst.absorbedByShield ? 0.22 + progress * 0.24 : 0.3 + progress * 0.34);
  const coreScale =
    impactSurfaceRadius *
    (burst.absorbedByShield
      ? 0.09 + (1 - progress) * 0.11
      : 0.12 + (1 - progress) * 0.12);
  const ringScale =
    impactSurfaceRadius *
    (burst.absorbedByShield ? 0.14 + progress * 0.34 : 0.16 + progress * 0.42);

  visual.glowMesh.visible = glowAlpha > 0.01;
  visual.coreMesh.visible = flashAlpha > 0.01;
  visual.ringMesh.visible = ringAlpha > 0.01;
  visual.glowMesh.position.set(impactPos.x, impactPos.y, z.glow);
  visual.coreMesh.position.set(impactPos.x, impactPos.y, z.core);
  visual.ringMesh.position.set(impactPos.x, impactPos.y, z.ring);
  visual.glowMesh.scale.set(glowScale, glowScale, 1);
  visual.coreMesh.scale.set(coreScale, coreScale, 1);
  visual.ringMesh.scale.set(ringScale, ringScale, 1);
  visual.glowMaterial.opacity = glowAlpha;
  visual.coreMaterial.opacity = flashAlpha;
  visual.ringMaterial.opacity = ringAlpha;

  return true;
};
