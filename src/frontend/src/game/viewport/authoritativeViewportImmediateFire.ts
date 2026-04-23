import {
  ROCKET_SPECS,
  type PlanetPublic,
  type RocketKind,
  type Vec2,
  type World,
} from "@3body/shared";
import { Group, Mesh, type Object3D, type Scene } from "three/webgpu";
import type { getScaledRocketVisuals } from "../rocketVisualTuning";
import {
  queueAuthoritativeImmediateFireFeedback,
  type AuthoritativeFeedbackLevels,
  type ImmediateCannonFlashState,
} from "./authoritativeCosmeticFeedback";
import {
  hideSharedCombatImmediateFireFeedbackVisual,
  syncSharedCombatImmediateFireFeedback,
  type SharedCombatImmediateFireBurstState,
  type SharedCombatImmediateFireFeedbackVisual,
  type SharedCombatImmediateGhostRocketState,
} from "./sharedCombatImmediateFireVisuals";

const IMMEDIATE_FIRE_BURST_DURATION_SEC = 0.12;
const IMMEDIATE_GHOST_ROCKET_DURATION_SEC = 0.18;

type RocketFeedbackMaterialFactory = (
  coreColor: string,
  trailColor: string,
) => Mesh["material"];

export interface AuthoritativeViewportImmediateFireFeedbackState {
  burstStatesByKind: Map<RocketKind, SharedCombatImmediateFireBurstState>;
  feedbackByKind: Map<RocketKind, SharedCombatImmediateFireFeedbackVisual>;
  ghostStatesByKind: Map<RocketKind, SharedCombatImmediateGhostRocketState>;
}

export const createAuthoritativeViewportImmediateFireFeedbackState =
  (): AuthoritativeViewportImmediateFireFeedbackState => ({
    burstStatesByKind: new Map(),
    feedbackByKind: new Map(),
    ghostStatesByKind: new Map(),
  });

export const createAuthoritativeViewportImmediateFireFeedbackVisuals = ({
  createRocketFlameMaterial,
  createRocketLaunchBurstMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
  disposables,
  feedback,
  ribbonGeometry,
  rocketAppearances,
  rocketGeometry,
  rocketKinds,
  scene,
}: {
  createRocketFlameMaterial: RocketFeedbackMaterialFactory;
  createRocketLaunchBurstMaterial: RocketFeedbackMaterialFactory;
  createRocketMaterial: RocketFeedbackMaterialFactory;
  createRocketTrailMaterial: RocketFeedbackMaterialFactory;
  disposables: Array<{ dispose: () => void }>;
  feedback: AuthoritativeViewportImmediateFireFeedbackState;
  ribbonGeometry: Mesh["geometry"];
  rocketAppearances: ReturnType<typeof getScaledRocketVisuals>;
  rocketGeometry: Mesh["geometry"];
  rocketKinds: readonly RocketKind[];
  scene: Scene;
}) => {
  for (const rocketKind of rocketKinds) {
    const rocketAppearance = rocketAppearances[rocketKind];
    const body = new Mesh(
      rocketGeometry,
      createRocketMaterial(rocketAppearance.core, rocketAppearance.trail),
    );
    const trail = new Mesh(
      ribbonGeometry,
      createRocketTrailMaterial(rocketAppearance.core, rocketAppearance.trail),
    );
    const flame = new Mesh(
      ribbonGeometry,
      createRocketFlameMaterial(rocketAppearance.core, rocketAppearance.trail),
    );
    const ghostGroup = new Group();
    ghostGroup.visible = false;
    body.renderOrder = 3;
    trail.renderOrder = 2;
    flame.renderOrder = 4;
    ghostGroup.add(trail, flame, body);
    const burstMesh = new Mesh(
      ribbonGeometry,
      createRocketLaunchBurstMaterial(
        rocketAppearance.core,
        rocketAppearance.trail,
      ),
    );
    burstMesh.renderOrder = 5;
    burstMesh.visible = false;
    const feedbackVisual = {
      burstMesh,
      ghost: {
        body,
        flame,
        group: ghostGroup,
        trail,
      },
    } satisfies SharedCombatImmediateFireFeedbackVisual;
    hideSharedCombatImmediateFireFeedbackVisual(feedbackVisual);
    scene.add(burstMesh, ghostGroup);
    feedback.feedbackByKind.set(rocketKind, feedbackVisual);
    disposables.push(
      burstMesh.material as { dispose: () => void },
      body.material as { dispose: () => void },
      trail.material as { dispose: () => void },
      flame.material as { dispose: () => void },
    );
  }
};

export const resetAuthoritativeViewportImmediateFireFeedback = ({
  feedback,
  sceneRemoveSafe,
}: {
  feedback: AuthoritativeViewportImmediateFireFeedbackState;
  sceneRemoveSafe: (...objects: Object3D[]) => void;
}) => {
  for (const feedbackVisual of feedback.feedbackByKind.values()) {
    sceneRemoveSafe(feedbackVisual.burstMesh, feedbackVisual.ghost.group);
  }
  feedback.feedbackByKind.clear();
  feedback.burstStatesByKind.clear();
  feedback.ghostStatesByKind.clear();
};

export const queueAuthoritativeViewportImmediateFireFeedback = ({
  aimDir,
  feedback,
  nowSec,
  playerPlanet,
  rocketKind,
  screenEffects,
}: {
  aimDir: Vec2;
  feedback: AuthoritativeViewportImmediateFireFeedbackState;
  nowSec: number;
  playerPlanet: Pick<PlanetPublic, "pos" | "radius">;
  rocketKind: RocketKind;
  screenEffects: AuthoritativeFeedbackLevels;
}): {
  immediateCannonFlashState: ImmediateCannonFlashState;
  screenEffects: AuthoritativeFeedbackLevels;
} =>
  queueAuthoritativeImmediateFireFeedback({
    aimDir,
    immediateFireBurstState: feedback.burstStatesByKind,
    immediateGhostRocketState: feedback.ghostStatesByKind,
    nowSec,
    playerPlanet,
    rocketKind,
    screenEffects,
  });

export const syncAuthoritativeViewportImmediateFireFeedback = ({
  feedback,
  nowSec,
  playerId,
  rocketAppearances,
  world,
}: {
  feedback: AuthoritativeViewportImmediateFireFeedbackState;
  nowSec: number;
  playerId: string | null;
  rocketAppearances: ReturnType<typeof getScaledRocketVisuals>;
  world: World | null;
}) => {
  syncSharedCombatImmediateFireFeedback({
    burstDurationSec: IMMEDIATE_FIRE_BURST_DURATION_SEC,
    burstStatesByKind: feedback.burstStatesByKind,
    feedbackByKind: feedback.feedbackByKind,
    ghostDurationSec: IMMEDIATE_GHOST_ROCKET_DURATION_SEC,
    ghostStatesByKind: feedback.ghostStatesByKind,
    nowSec,
    rocketAppearances,
    rocketSpeeds: {
      heavy: ROCKET_SPECS.heavy.speed,
      light: ROCKET_SPECS.light.speed,
      seeker: ROCKET_SPECS.seeker.speed,
    },
    shouldYieldGhost: ({ ghostPosition, rocketKind }) =>
      playerId !== null &&
      (world?.rockets.some((rocket) => {
        if (rocket.ownerId !== playerId || rocket.rocketKind !== rocketKind) {
          return false;
        }

        return (
          Math.hypot(
            rocket.pos.x - ghostPosition.x,
            rocket.pos.y - ghostPosition.y,
          ) <=
          Math.max(42, ROCKET_SPECS[rocketKind].speed * 0.04, rocket.radius * 6)
        );
      }) ??
        false),
  });
};
