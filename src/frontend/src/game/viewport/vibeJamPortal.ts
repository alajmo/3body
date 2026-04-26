import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  RingGeometry,
  type Scene,
  Sprite,
  SpriteNodeMaterial,
  TorusGeometry,
} from "three/webgpu";

const PORTAL_DEFAULT_URL = "https://vibejam.cc/portal/2026";
const PORTAL_DEFAULT_RADIUS = 180;
const PORTAL_DEFAULT_TUBE = 28;
const PORTAL_DEFAULT_TRIGGER_RADIUS = 140;
const PORTAL_RING_COLOR = 0x9b5cff;
const PORTAL_GLOW_COLOR = 0xc8a8ff;
const PORTAL_LABEL_TEXT = "VIBE JAM 2026";
const PORTAL_NAME_STORAGE_KEY = "3body.playerName";
const PORTAL_RING_SEGMENTS = 96;
const PORTAL_TUBE_SEGMENTS = 16;
const PORTAL_INNER_RING_SEGMENTS = 64;

export interface VibeJamPortalOptions {
  scene: Scene;
  position: { x: number; y: number };
  radius?: number;
  tubeRadius?: number;
  triggerRadius?: number;
  destinationUrl?: string;
}

export interface VibeJamPortal {
  update(playerPos: { x: number; y: number } | null, nowSec: number): void;
  dispose(): void;
}

const buildLabelTexture = (text: string): CanvasTexture | null => {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return null;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 56px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#1a0530";
  ctx.fillStyle = "#ddd0a0";
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

const readStoredUsername = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(PORTAL_NAME_STORAGE_KEY);
    if (stored === null) {
      return null;
    }
    const trimmed = stored.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
};

const buildPortalRedirectUrl = (
  destinationUrl: string,
  playerSpeedMps: number | null,
): string => {
  if (typeof window === "undefined") {
    return destinationUrl;
  }
  const params = new URLSearchParams();
  params.set("ref", window.location.host);
  const username = readStoredUsername();
  if (username !== null) {
    params.set("username", username);
  }
  params.set("color", "purple");
  if (playerSpeedMps !== null && Number.isFinite(playerSpeedMps)) {
    params.set("speed", playerSpeedMps.toFixed(2));
  }
  return `${destinationUrl}?${params.toString()}`;
};

export const createVibeJamPortal = (
  options: VibeJamPortalOptions,
): VibeJamPortal => {
  const {
    scene,
    position,
    radius = PORTAL_DEFAULT_RADIUS,
    tubeRadius = PORTAL_DEFAULT_TUBE,
    triggerRadius = PORTAL_DEFAULT_TRIGGER_RADIUS,
    destinationUrl = PORTAL_DEFAULT_URL,
  } = options;

  const group = new Group();
  group.position.set(position.x, position.y, 0);
  group.renderOrder = 5;

  const ringGeometry = new TorusGeometry(
    radius,
    tubeRadius,
    PORTAL_TUBE_SEGMENTS,
    PORTAL_RING_SEGMENTS,
  );
  const ringMaterial = new MeshBasicNodeMaterial({
    color: new Color(PORTAL_RING_COLOR),
    transparent: true,
    opacity: 0.95,
    side: DoubleSide,
  });
  const ringMesh = new Mesh(ringGeometry, ringMaterial);
  ringMesh.renderOrder = 5;
  group.add(ringMesh);

  const innerGlowGeometry = new RingGeometry(
    radius * 0.05,
    radius * 0.95,
    PORTAL_INNER_RING_SEGMENTS,
  );
  const innerGlowMaterial = new MeshBasicNodeMaterial({
    color: new Color(PORTAL_GLOW_COLOR),
    transparent: true,
    opacity: 0.35,
    side: DoubleSide,
    depthWrite: false,
  });
  const innerGlowMesh = new Mesh(innerGlowGeometry, innerGlowMaterial);
  innerGlowMesh.renderOrder = 4;
  group.add(innerGlowMesh);

  const labelTexture = buildLabelTexture(PORTAL_LABEL_TEXT);
  let labelSprite: Sprite | null = null;
  let labelMaterial: SpriteNodeMaterial | null = null;
  if (labelTexture !== null) {
    labelMaterial = new SpriteNodeMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
    });
    labelSprite = new Sprite(labelMaterial);
    labelSprite.scale.set(radius * 2.4, radius * 0.6, 1);
    labelSprite.position.set(0, radius + tubeRadius + radius * 0.5, 0);
    labelSprite.renderOrder = 6;
    group.add(labelSprite);
  }

  scene.add(group);

  let triggered = false;
  let elapsedSec = 0;
  let lastNowSec: number | null = null;
  let previousPlayerX: number | null = null;
  let previousPlayerY: number | null = null;
  let lastPlayerSpeedMps: number | null = null;
  const triggerRadiusSquared = triggerRadius * triggerRadius;

  const update: VibeJamPortal["update"] = (playerPos, nowSec) => {
    const deltaSec = lastNowSec === null ? 0 : Math.max(0, nowSec - lastNowSec);
    lastNowSec = nowSec;
    elapsedSec += deltaSec;

    const pulse = 0.92 + 0.08 * Math.sin(elapsedSec * 2.4);
    ringMesh.scale.setScalar(pulse);
    ringMesh.rotation.z = elapsedSec * 0.4;
    innerGlowMaterial.opacity = 0.28 + 0.18 * Math.sin(elapsedSec * 1.7);

    if (playerPos === null) {
      previousPlayerX = null;
      previousPlayerY = null;
      return;
    }

    if (previousPlayerX !== null && previousPlayerY !== null && deltaSec > 0) {
      const vx = (playerPos.x - previousPlayerX) / deltaSec;
      const vy = (playerPos.y - previousPlayerY) / deltaSec;
      lastPlayerSpeedMps = Math.hypot(vx, vy);
    }
    previousPlayerX = playerPos.x;
    previousPlayerY = playerPos.y;

    if (triggered) {
      return;
    }
    const dx = playerPos.x - position.x;
    const dy = playerPos.y - position.y;
    if (dx * dx + dy * dy <= triggerRadiusSquared) {
      triggered = true;
      if (typeof window !== "undefined") {
        window.location.href = buildPortalRedirectUrl(
          destinationUrl,
          lastPlayerSpeedMps,
        );
      }
    }
  };

  const dispose = () => {
    scene.remove(group);
    ringGeometry.dispose();
    ringMaterial.dispose();
    innerGlowGeometry.dispose();
    innerGlowMaterial.dispose();
    if (labelTexture !== null) {
      labelTexture.dispose();
    }
    if (labelMaterial !== null) {
      labelMaterial.dispose();
    }
  };

  return { update, dispose };
};
