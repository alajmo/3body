import { clamp, lerp, sub, type Vec2 } from "@3body/shared";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Scene,
} from "three/webgpu";
import { getRuntimeTuningDocument } from "../runtimeTuning";

const BLACK_HOLE_SWALLOW_DURATION_SEC = 0.72;
const BLACK_HOLE_SWALLOW_Z = 6.4;

export interface BlackHoleSwallowVisual {
  material: SpriteMaterial;
  sprite: Sprite;
}

export interface BlackHoleSwallowState {
  color: string;
  radius: number;
  startedAtSec: number;
  startPos: Vec2;
  targetPos: Vec2;
  visual: BlackHoleSwallowVisual;
  z: number;
}

const getBlackHoleVisualTuning = () =>
  getRuntimeTuningDocument().visuals.blackHole;

const createBlackHoleSwallowTexture = (document: Document): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Failed to create black-hole swallow texture context");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  const tailGradient = context.createRadialGradient(128, 128, 12, 128, 128, 96);
  tailGradient.addColorStop(0, "rgba(255,255,255,1)");
  tailGradient.addColorStop(0.22, "rgba(255,245,224,0.96)");
  tailGradient.addColorStop(0.58, "rgba(255,214,152,0.44)");
  tailGradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = tailGradient;
  context.beginPath();
  context.arc(128, 128, 96, 0, Math.PI * 2);
  context.fill();

  const coreGradient = context.createRadialGradient(148, 128, 4, 148, 128, 42);
  coreGradient.addColorStop(0, "rgba(255,255,255,1)");
  coreGradient.addColorStop(0.34, "rgba(255,245,230,0.92)");
  coreGradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = coreGradient;
  context.beginPath();
  context.arc(148, 128, 42, 0, Math.PI * 2);
  context.fill();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

const createBlackHoleSwallowVisual = (
  texture: CanvasTexture,
): BlackHoleSwallowVisual => {
  const material = new SpriteMaterial({
    blending: AdditiveBlending,
    color: new Color("#ffffff"),
    depthWrite: false,
    map: texture,
    opacity: 0,
    transparent: true,
  });
  const sprite = new Sprite(material);
  sprite.visible = false;
  sprite.renderOrder = 7;
  sprite.center.set(0.36, 0.5);

  return {
    material,
    sprite,
  };
};

export const createBlackHoleSwallowVisualPool = ({
  capacity,
  disposables,
  document,
  scene,
}: {
  capacity: number;
  disposables: Array<{ dispose: () => void }>;
  document: Document;
  scene: Scene;
}): BlackHoleSwallowVisual[] => {
  const texture = createBlackHoleSwallowTexture(document);
  disposables.push(texture);

  return Array.from({ length: capacity }, () => {
    const visual = createBlackHoleSwallowVisual(texture);
    scene.add(visual.sprite);
    disposables.push(visual.material);
    return visual;
  });
};

export const getBlackHoleVisualScale = (killRadius: number): number =>
  killRadius / Math.max(1, getBlackHoleVisualTuning().coreRadius);

export const getBlackHoleVisualRadius = (killRadius: number): number => {
  const tuning = getBlackHoleVisualTuning();

  return (
    Math.max(tuning.coreRadius, tuning.lensRadius, tuning.ringRadius) *
    getBlackHoleVisualScale(killRadius)
  );
};

export const hideBlackHoleSwallowVisual = (visual: BlackHoleSwallowVisual) => {
  visual.sprite.visible = false;
  visual.material.opacity = 0;
  visual.material.rotation = 0;
  visual.sprite.scale.set(1, 1, 1);
};

export const clearBlackHoleSwallowEffects = ({
  activeEffects,
  inactiveVisuals,
}: {
  activeEffects: BlackHoleSwallowState[];
  inactiveVisuals: BlackHoleSwallowVisual[];
}) => {
  while (activeEffects.length > 0) {
    const effect = activeEffects.pop()!;
    hideBlackHoleSwallowVisual(effect.visual);
    inactiveVisuals.push(effect.visual);
  }
};

export const queueBlackHoleSwallowEffect = ({
  activeEffects,
  color,
  inactiveVisuals,
  radius,
  startedAtSec,
  startPos,
  targetPos,
  z = BLACK_HOLE_SWALLOW_Z,
}: {
  activeEffects: BlackHoleSwallowState[];
  color: string;
  inactiveVisuals: BlackHoleSwallowVisual[];
  radius: number;
  startedAtSec: number;
  startPos: Vec2;
  targetPos: Vec2;
  z?: number;
}) => {
  if (inactiveVisuals.length === 0 && activeEffects.length > 0) {
    const recycledEffect = activeEffects.shift()!;
    hideBlackHoleSwallowVisual(recycledEffect.visual);
    inactiveVisuals.push(recycledEffect.visual);
  }

  const visual = inactiveVisuals.pop() ?? null;
  if (visual === null) {
    return;
  }

  visual.material.color.set(color);
  visual.material.opacity = 0;
  visual.material.rotation = 0;
  visual.sprite.visible = true;

  activeEffects.push({
    color,
    radius,
    startedAtSec,
    startPos: { ...startPos },
    targetPos: { ...targetPos },
    visual,
    z,
  });
};

export const updateBlackHoleSwallowEffects = ({
  activeEffects,
  inactiveVisuals,
  nowSec,
}: {
  activeEffects: BlackHoleSwallowState[];
  inactiveVisuals: BlackHoleSwallowVisual[];
  nowSec: number;
}) => {
  for (let index = activeEffects.length - 1; index >= 0; index -= 1) {
    const effect = activeEffects[index]!;
    const progress = clamp(
      (nowSec - effect.startedAtSec) / BLACK_HOLE_SWALLOW_DURATION_SEC,
      0,
      1,
    );

    if (progress >= 1) {
      hideBlackHoleSwallowVisual(effect.visual);
      inactiveVisuals.push(effect.visual);
      activeEffects.splice(index, 1);
      continue;
    }

    const travel = 1 - (1 - progress) ** 2.35;
    const currentPos = {
      x: lerp(effect.startPos.x, effect.targetPos.x, travel * 0.92),
      y: lerp(effect.startPos.y, effect.targetPos.y, travel * 0.92),
    } satisfies Vec2;
    const dir = sub(effect.targetPos, currentPos);
    const angle =
      Math.abs(dir.x) <= 0.0001 && Math.abs(dir.y) <= 0.0001
        ? 0
        : Math.atan2(dir.y, dir.x);
    const longRadius = effect.radius * lerp(1.15, 4.9, progress);
    const shortRadius = effect.radius * lerp(0.98, 0.14, progress);
    const opacity = (1 - progress) ** 1.55 * 0.92;

    effect.visual.sprite.visible = opacity > 0.01;
    effect.visual.sprite.position.set(currentPos.x, currentPos.y, effect.z);
    effect.visual.sprite.scale.set(longRadius * 2, shortRadius * 2, 1);
    effect.visual.material.rotation = angle;
    effect.visual.material.opacity = opacity;
  }
};
