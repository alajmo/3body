import { add, scale, type RocketKind, type Vec2 } from "@3body/shared";
import type { Group, Mesh } from "three/webgpu";
import { getSharedCombatLaunchBurstLayout } from "./sharedCombatLaunchBurstVisuals";

export interface SharedCombatRocketVisual {
  body: Mesh;
  flame: Mesh;
  group: Group;
  trail: Mesh;
}

export interface SharedCombatRocketAppearance {
  bodyScale: Vec2;
  flameScale: Vec2;
  trailScale: Vec2;
}

export interface SharedCombatImmediateFireBurstState {
  direction: Vec2;
  origin: Vec2;
  radius: number;
  startedAtSec: number;
}

export interface SharedCombatImmediateGhostRocketState {
  direction: Vec2;
  origin: Vec2;
  startedAtSec: number;
  velocity: Vec2;
}

export interface SharedCombatImmediateFireFeedbackVisual {
  burstMesh: Mesh;
  ghost: SharedCombatRocketVisual;
}

export const hideSharedCombatRocketVisual = (
  visual: SharedCombatRocketVisual,
) => {
  visual.group.visible = false;
};

export const hideSharedCombatImmediateFireFeedbackVisual = (
  visual: SharedCombatImmediateFireFeedbackVisual,
) => {
  visual.burstMesh.visible = false;
  hideSharedCombatRocketVisual(visual.ghost);
};

export const syncSharedCombatRocketVisualTransform = ({
  appearance,
  position,
  velocity,
  visual,
  z = 3,
}: {
  appearance: SharedCombatRocketAppearance;
  position: Vec2;
  velocity: Vec2;
  visual: SharedCombatRocketVisual;
  z?: number;
}) => {
  const angle = Math.atan2(velocity.y, velocity.x);
  visual.group.visible = true;
  visual.group.position.set(position.x, position.y, z);
  visual.group.rotation.z = angle;
  visual.body.scale.set(
    appearance.bodyScale.x,
    appearance.bodyScale.y,
    appearance.bodyScale.y,
  );
  visual.trail.position.set(-appearance.bodyScale.x * 0.6, 0, -0.1);
  visual.trail.scale.set(appearance.trailScale.x, appearance.trailScale.y, 1);
  visual.flame.position.set(-appearance.bodyScale.x * 0.45, 0, 0.05);
  visual.flame.scale.set(appearance.flameScale.x, appearance.flameScale.y, 1);
};

export const syncSharedCombatImmediateFireFeedback = ({
  burstDurationSec,
  burstStatesByKind,
  feedbackByKind,
  ghostDurationSec,
  ghostStatesByKind,
  nowSec,
  rocketAppearances,
  rocketSpeeds,
  shouldYieldGhost,
}: {
  burstDurationSec: number;
  burstStatesByKind: Map<RocketKind, SharedCombatImmediateFireBurstState>;
  feedbackByKind: ReadonlyMap<
    RocketKind,
    SharedCombatImmediateFireFeedbackVisual
  >;
  ghostDurationSec: number;
  ghostStatesByKind: Map<RocketKind, SharedCombatImmediateGhostRocketState>;
  nowSec: number;
  rocketAppearances: Record<RocketKind, SharedCombatRocketAppearance>;
  rocketSpeeds: Record<RocketKind, number>;
  shouldYieldGhost: (args: {
    ghostPosition: Vec2;
    rocketKind: RocketKind;
  }) => boolean;
}) => {
  for (const [rocketKind, feedbackVisual] of feedbackByKind) {
    const burstState = burstStatesByKind.get(rocketKind) ?? null;
    if (burstState === null) {
      feedbackVisual.burstMesh.visible = false;
    } else {
      const burstAgeSec = nowSec - burstState.startedAtSec;
      const rocketAppearance = rocketAppearances[rocketKind];
      const burstLayout = getSharedCombatLaunchBurstLayout({
        ageSec: burstAgeSec,
        baseScale: rocketAppearance.bodyScale,
        direction: burstState.direction,
        durationSec: burstDurationSec,
        lengthMultiplierEnd: 0.9,
        lengthMultiplierStart: 1.08,
        origin: burstState.origin,
        speed: rocketSpeeds[rocketKind],
        widthMultiplierEnd: 0.76,
        widthMultiplierStart: 1.18,
      });
      if (burstLayout === null) {
        feedbackVisual.burstMesh.visible = false;
        burstStatesByKind.delete(rocketKind);
      } else {
        feedbackVisual.burstMesh.visible = true;
        feedbackVisual.burstMesh.position.set(
          burstLayout.center.x,
          burstLayout.center.y,
          6.2,
        );
        feedbackVisual.burstMesh.rotation.z = burstLayout.angle;
        feedbackVisual.burstMesh.scale.set(
          burstLayout.length,
          burstLayout.width,
          1,
        );
      }
    }

    const ghostState = ghostStatesByKind.get(rocketKind) ?? null;
    if (ghostState === null) {
      hideSharedCombatRocketVisual(feedbackVisual.ghost);
      continue;
    }

    const ghostAgeSec = nowSec - ghostState.startedAtSec;
    if (ghostAgeSec < 0 || ghostAgeSec > ghostDurationSec) {
      hideSharedCombatRocketVisual(feedbackVisual.ghost);
      ghostStatesByKind.delete(rocketKind);
      continue;
    }

    const ghostPosition = add(
      ghostState.origin,
      scale(ghostState.velocity, ghostAgeSec),
    );
    if (
      shouldYieldGhost({
        ghostPosition,
        rocketKind,
      })
    ) {
      hideSharedCombatRocketVisual(feedbackVisual.ghost);
      ghostStatesByKind.delete(rocketKind);
      continue;
    }

    syncSharedCombatRocketVisualTransform({
      appearance: rocketAppearances[rocketKind],
      position: ghostPosition,
      velocity: ghostState.velocity,
      visual: feedbackVisual.ghost,
      z: 5.9,
    });
  }
};
