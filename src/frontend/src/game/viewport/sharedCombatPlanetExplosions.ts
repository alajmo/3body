import { clamp, mulberry32, type Vec2 } from "@3body/shared";
import {
  Color,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Vector3,
} from "three/webgpu";

const PLANET_EXPLOSION_DURATION_SEC = 1.55;
const PLANET_EXPLOSION_FLASH_DURATION_SEC = 0.34;
const PLANET_EXPLOSION_RING_DURATION_SEC = 0.78;

const TINTED_COLORS = new Map<string, Color>();
const PLANET_EXPLOSION_CORE_BASE = new Color("#fff7de");

export type SharedCombatPlanetExplosionDeathReason =
  | "rocket"
  | "sunCollision"
  | "neutronStar"
  | "planetCollision"
  | "boundaryAsteroid"
  | "boundary"
  | "blackHole";

export interface SharedCombatPlanetExplosionChunkVisual {
  baseScale: Vector3;
  direction: Vec2;
  driftDistance: number;
  lateralAmplitude: number;
  lift: number;
  mesh: Mesh;
  radialOffset: number;
  rotationPhase: Vector3;
  rotationSpeed: Vector3;
  tangent: Vec2;
}

export interface SharedCombatPlanetExplosionVisual {
  chunkMaterials: readonly MeshBasicMaterial[];
  chunks: readonly SharedCombatPlanetExplosionChunkVisual[];
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  glowMaterial: MeshBasicMaterial;
  glowMesh: Mesh;
  group: Group;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
  shockwaveMaterial: MeshBasicMaterial;
  shockwaveMesh: Mesh;
}

export interface SharedCombatPlanetExplosionSource {
  color: string;
  deathReason?: SharedCombatPlanetExplosionDeathReason;
  id: number;
  pos: Vec2;
  radius: number;
  vel: Vec2;
}

export interface SharedCombatPlanetExplosionState {
  durationSec: number;
  origin: Vec2;
  radius: number;
  scatterScale: number;
  shockwaveScale: number;
  startedAtSec: number;
  velocity: Vec2;
  visual: SharedCombatPlanetExplosionVisual;
}

const getTintedColor = (
  value: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): Color => {
  const cacheKey = `${value}|${hueOffset}|${saturationOffset}|${lightnessOffset}`;
  let cached = TINTED_COLORS.get(cacheKey);
  if (cached === undefined) {
    cached = new Color(value);
    cached.offsetHSL(hueOffset, saturationOffset, lightnessOffset);
    TINTED_COLORS.set(cacheKey, cached);
  }

  return cached;
};

const hideSharedCombatPlanetExplosionVisual = (
  visual: SharedCombatPlanetExplosionVisual,
) => {
  visual.group.visible = false;
  visual.glowMesh.visible = false;
  visual.coreMesh.visible = false;
  visual.ringMesh.visible = false;
  visual.shockwaveMesh.visible = false;
  visual.glowMaterial.opacity = 0;
  visual.coreMaterial.opacity = 0;
  visual.ringMaterial.opacity = 0;
  visual.shockwaveMaterial.opacity = 0;
  for (const material of visual.chunkMaterials) {
    material.opacity = 0;
  }
  for (const chunk of visual.chunks) {
    chunk.mesh.visible = false;
  }
};

const armSharedCombatPlanetExplosion = ({
  source,
  startedAtSec,
  visual,
}: {
  source: SharedCombatPlanetExplosionSource;
  startedAtSec: number;
  visual: SharedCombatPlanetExplosionVisual;
}): SharedCombatPlanetExplosionState => {
  const rng = mulberry32(
    (Math.imul(source.id + 1, 0x9e3779b1) ^ Math.round(startedAtSec * 1000)) >>>
      0,
  );
  const renderRadius = source.radius;
  const durationSec =
    source.deathReason === "planetCollision"
      ? PLANET_EXPLOSION_DURATION_SEC + 0.22
      : source.deathReason === "sunCollision" ||
          source.deathReason === "neutronStar"
        ? PLANET_EXPLOSION_DURATION_SEC + 0.12
        : PLANET_EXPLOSION_DURATION_SEC;
  const scatterScale =
    source.deathReason === "planetCollision"
      ? 1.62
      : source.deathReason === "sunCollision" ||
          source.deathReason === "neutronStar"
        ? 1.48
        : 1.34;
  const shockwaveScale =
    source.deathReason === "planetCollision"
      ? 6.8
      : source.deathReason === "sunCollision" ||
          source.deathReason === "neutronStar"
        ? 6.2
        : 5.6;

  visual.glowMaterial.color.copy(
    getTintedColor(source.color, -0.04, 0.12, 0.22),
  );
  visual.ringMaterial.color.copy(
    getTintedColor(source.color, 0.02, 0.16, 0.28),
  );
  visual.shockwaveMaterial.color.copy(
    getTintedColor(source.color, -0.08, 0.06, 0.38),
  );
  visual.coreMaterial.color
    .copy(PLANET_EXPLOSION_CORE_BASE)
    .lerp(new Color(source.color), 0.24);
  visual.chunkMaterials[0]?.color.copy(
    getTintedColor(source.color, -0.02, -0.26, -0.14),
  );
  visual.chunkMaterials[1]?.color.copy(
    getTintedColor(source.color, 0.01, -0.08, 0.02),
  );
  visual.group.position.set(source.pos.x, source.pos.y, 0);
  visual.group.visible = true;
  for (const material of visual.chunkMaterials) {
    material.opacity = 0;
  }
  for (const chunk of visual.chunks) {
    const angle = rng() * Math.PI * 2;
    chunk.direction.x = Math.cos(angle);
    chunk.direction.y = Math.sin(angle);
    chunk.tangent.x = -chunk.direction.y;
    chunk.tangent.y = chunk.direction.x;
    chunk.driftDistance = 0.78 + rng() * 1.18;
    chunk.lateralAmplitude = 0.08 + rng() * 0.22;
    chunk.lift = 0.18 + rng() * 0.82;
    chunk.radialOffset = 0.18 + rng() * 0.24;
    chunk.baseScale.set(
      renderRadius * (0.13 + rng() * 0.12),
      renderRadius * (0.11 + rng() * 0.16),
      renderRadius * (0.1 + rng() * 0.18),
    );
    chunk.rotationPhase.set(
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
    );
    chunk.rotationSpeed.set(
      (rng() - 0.5) * 9,
      (rng() - 0.5) * 9,
      (rng() - 0.5) * 9,
    );
    chunk.mesh.position.set(
      chunk.direction.x * renderRadius * 0.28,
      chunk.direction.y * renderRadius * 0.28,
      0.14,
    );
    chunk.mesh.visible = false;
    chunk.mesh.scale.copy(chunk.baseScale);
    chunk.mesh.rotation.set(
      chunk.rotationPhase.x,
      chunk.rotationPhase.y,
      chunk.rotationPhase.z,
    );
  }

  return {
    durationSec,
    origin: { x: source.pos.x, y: source.pos.y },
    radius: renderRadius,
    scatterScale,
    shockwaveScale,
    startedAtSec,
    velocity: { x: source.vel.x, y: source.vel.y },
    visual,
  };
};

const updateSharedCombatPlanetExplosion = (
  explosion: SharedCombatPlanetExplosionState,
  elapsedSec: number,
): boolean => {
  const ageSec = elapsedSec - explosion.startedAtSec;
  if (ageSec < 0) {
    explosion.visual.group.visible = false;
    return true;
  }

  if (ageSec > explosion.durationSec) {
    return false;
  }

  const progress = clamp(ageSec / explosion.durationSec, 0, 1);
  const flashProgress = clamp(
    ageSec / PLANET_EXPLOSION_FLASH_DURATION_SEC,
    0,
    1,
  );
  const ringProgress = clamp(ageSec / PLANET_EXPLOSION_RING_DURATION_SEC, 0, 1);
  const fade = (1 - progress) ** 1.28;
  const burst = progress ** 0.74;
  const driftX = explosion.velocity.x * ageSec * 0.42;
  const driftY = explosion.velocity.y * ageSec * 0.42;
  const radius = explosion.radius;
  const glowAlpha = fade * (0.34 + (1 - progress) * 0.42);
  const coreAlpha = (1 - flashProgress) ** 2.45 * 0.98;
  const ringAlpha = (1 - ringProgress) ** 1.72 * 0.44;
  const shockwaveAlpha = (1 - ringProgress) ** 2.1 * 0.3;

  explosion.visual.group.visible = true;
  explosion.visual.group.position.set(
    explosion.origin.x + driftX,
    explosion.origin.y + driftY,
    0,
  );

  explosion.visual.glowMesh.visible = glowAlpha > 0.01;
  explosion.visual.coreMesh.visible = coreAlpha > 0.01;
  explosion.visual.ringMesh.visible = ringAlpha > 0.01;
  explosion.visual.shockwaveMesh.visible = shockwaveAlpha > 0.01;

  explosion.visual.glowMesh.scale.set(
    radius * (1.08 + progress * 3.2),
    radius * (1.08 + progress * 3.2),
    1,
  );
  explosion.visual.coreMesh.scale.set(
    radius * (0.74 + flashProgress * 2.15),
    radius * (0.74 + flashProgress * 2.15),
    1,
  );
  explosion.visual.ringMesh.scale.set(
    radius * (0.92 + ringProgress * 4.3),
    radius * (0.92 + ringProgress * 4.3),
    1,
  );
  explosion.visual.shockwaveMesh.scale.set(
    radius * (1.14 + ringProgress * explosion.shockwaveScale),
    radius * (1.14 + ringProgress * explosion.shockwaveScale),
    1,
  );

  explosion.visual.glowMaterial.opacity = glowAlpha;
  explosion.visual.coreMaterial.opacity = coreAlpha;
  explosion.visual.ringMaterial.opacity = ringAlpha;
  explosion.visual.shockwaveMaterial.opacity = shockwaveAlpha;

  const chunkOpacity = clamp(fade * 1.18, 0, 1);
  for (const material of explosion.visual.chunkMaterials) {
    material.opacity = chunkOpacity;
  }
  for (const chunk of explosion.visual.chunks) {
    const radialDistance =
      radius *
      (chunk.radialOffset +
        chunk.driftDistance * explosion.scatterScale * burst);
    const lateralDistance =
      radius *
      chunk.lateralAmplitude *
      Math.sin(
        progress * Math.PI * (1.1 + chunk.lift * 0.24) + chunk.rotationPhase.z,
      ) *
      (0.22 + fade * 0.78);

    chunk.mesh.visible = chunkOpacity > 0.02;
    chunk.mesh.position.set(
      chunk.direction.x * radialDistance + chunk.tangent.x * lateralDistance,
      chunk.direction.y * radialDistance + chunk.tangent.y * lateralDistance,
      0.16 + chunk.lift * radius * burst * 0.045,
    );
    chunk.mesh.rotation.set(
      chunk.rotationPhase.x + progress * chunk.rotationSpeed.x,
      chunk.rotationPhase.y + progress * chunk.rotationSpeed.y,
      chunk.rotationPhase.z + progress * chunk.rotationSpeed.z,
    );
    chunk.mesh.scale.set(
      chunk.baseScale.x * (0.92 + fade * 0.12),
      chunk.baseScale.y * (0.92 + fade * 0.12),
      chunk.baseScale.z * (0.92 + fade * 0.12),
    );
  }

  return true;
};

const releaseSharedCombatPlanetExplosion = (
  availableVisuals: SharedCombatPlanetExplosionVisual[],
  explosion: SharedCombatPlanetExplosionState,
) => {
  hideSharedCombatPlanetExplosionVisual(explosion.visual);
  availableVisuals.push(explosion.visual);
};

export const clearSharedCombatPlanetExplosions = ({
  activePlanetExplosions,
  inactivePlanetExplosionVisuals,
}: {
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
}) => {
  while (activePlanetExplosions.length > 0) {
    releaseSharedCombatPlanetExplosion(
      inactivePlanetExplosionVisuals,
      activePlanetExplosions.pop()!,
    );
  }
};

export const queueSharedCombatPlanetExplosion = ({
  activePlanetExplosions,
  inactivePlanetExplosionVisuals,
  planet,
  startedAtSec,
}: {
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
  planet: SharedCombatPlanetExplosionSource;
  startedAtSec: number;
}) => {
  if (
    inactivePlanetExplosionVisuals.length === 0 &&
    activePlanetExplosions.length > 0
  ) {
    releaseSharedCombatPlanetExplosion(
      inactivePlanetExplosionVisuals,
      activePlanetExplosions.shift()!,
    );
  }

  const explosionVisual = inactivePlanetExplosionVisuals.pop() ?? null;
  if (explosionVisual === null) {
    return;
  }

  activePlanetExplosions.push(
    armSharedCombatPlanetExplosion({
      source: planet,
      startedAtSec,
      visual: explosionVisual,
    }),
  );
};

export const updateSharedCombatPlanetExplosions = ({
  activePlanetExplosions,
  elapsedSec,
  inactivePlanetExplosionVisuals,
}: {
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  elapsedSec: number;
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
}) => {
  for (let index = activePlanetExplosions.length - 1; index >= 0; index -= 1) {
    const explosion = activePlanetExplosions[index]!;
    if (!updateSharedCombatPlanetExplosion(explosion, elapsedSec)) {
      releaseSharedCombatPlanetExplosion(
        inactivePlanetExplosionVisuals,
        explosion,
      );
      activePlanetExplosions.splice(index, 1);
    }
  }
};
