import type { NeutronStarSpec } from "./constants";
import type { EntityBase, NeutronStar, Sun } from "./entities";
import { nextFloat, type Rng } from "./rng";
import { clamp, dist } from "./vec2";
import type { Vec2 } from "./vec2";

const NEUTRON_STAR_BOUNDARY_MARGIN = 120;
const NEUTRON_STAR_SPAWN_ATTEMPTS = 64;

interface CreateNeutronStarsOptions {
  arenaRadius: number;
  blockedBodies?: readonly Pick<EntityBase, "pos" | "radius">[];
  createId: () => number;
  rng: Rng;
  spec: NeutronStarSpec;
}

const getMassBounds = (
  spec: Pick<NeutronStarSpec, "minMassKg" | "maxMassKg">,
): { min: number; max: number } => ({
  min: Math.min(spec.minMassKg, spec.maxMassKg),
  max: Math.max(spec.minMassKg, spec.maxMassKg),
});

const getSizeBounds = (
  spec: Pick<NeutronStarSpec, "minSize" | "maxSize">,
): { min: number; max: number } => ({
  min: Math.min(spec.minSize, spec.maxSize),
  max: Math.max(spec.minSize, spec.maxSize),
});

export const getNeutronStarMassAlpha = (
  mass: number,
  spec: Pick<NeutronStarSpec, "minMassKg" | "maxMassKg">,
): number => {
  const bounds = getMassBounds(spec);
  if (bounds.max <= bounds.min) {
    return 0.5;
  }

  return clamp((mass - bounds.min) / (bounds.max - bounds.min), 0, 1);
};

export const getNeutronStarRadiusForMass = (
  mass: number,
  spec: Pick<
    NeutronStarSpec,
    "minMassKg" | "maxMassKg" | "minSize" | "maxSize"
  >,
): number => {
  const sizeBounds = getSizeBounds(spec);
  return (
    sizeBounds.min +
    (sizeBounds.max - sizeBounds.min) * getNeutronStarMassAlpha(mass, spec)
  );
};

const getNeutronStarRadiusAfterAbsorbingSun = (
  neutronStar: Pick<NeutronStar, "mass" | "radius">,
  sun: Pick<Sun, "mass" | "radius">,
): number => {
  const nextMass = neutronStar.mass + Math.max(0, sun.mass);
  if (neutronStar.mass <= Number.EPSILON) {
    return neutronStar.radius;
  }

  return neutronStar.radius * Math.sqrt(nextMass / neutronStar.mass);
};

export const absorbSunsIntoNeutronStars = <
  TSun extends Pick<Sun, "id" | "kind" | "mass" | "pos" | "radius" | "vel">,
>(
  suns: readonly TSun[],
  neutronStars: readonly NeutronStar[],
): {
  neutronStars: NeutronStar[];
  suns: TSun[];
} => {
  if (suns.length === 0 || neutronStars.length === 0) {
    return {
      neutronStars: neutronStars.slice(),
      suns: suns.slice(),
    };
  }

  const nextNeutronStars = neutronStars.slice();
  const survivingSuns: TSun[] = [];

  for (const sun of suns) {
    let absorbingIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < nextNeutronStars.length; index += 1) {
      const neutronStar = nextNeutronStars[index]!;
      const centerDistance = dist(sun.pos, neutronStar.pos);
      if (centerDistance > sun.radius + neutronStar.radius) {
        continue;
      }

      if (centerDistance < closestDistance) {
        closestDistance = centerDistance;
        absorbingIndex = index;
      }
    }

    if (absorbingIndex < 0) {
      survivingSuns.push(sun);
      continue;
    }

    const neutronStar = nextNeutronStars[absorbingIndex]!;
    const absorbedMass = Math.max(0, sun.mass);
    const nextMass = neutronStar.mass + absorbedMass;
    const massWeight = Math.max(nextMass, Number.EPSILON);
    nextNeutronStars[absorbingIndex] = {
      ...neutronStar,
      mass: nextMass,
      pos: {
        x:
          (neutronStar.pos.x * neutronStar.mass + sun.pos.x * absorbedMass) /
          massWeight,
        y:
          (neutronStar.pos.y * neutronStar.mass + sun.pos.y * absorbedMass) /
          massWeight,
      },
      radius: getNeutronStarRadiusAfterAbsorbingSun(neutronStar, sun),
      vel: {
        x:
          (neutronStar.vel.x * neutronStar.mass + sun.vel.x * absorbedMass) /
          massWeight,
        y:
          (neutronStar.vel.y * neutronStar.mass + sun.vel.y * absorbedMass) /
          massWeight,
      },
    };
  }

  return {
    neutronStars: nextNeutronStars,
    suns: survivingSuns,
  };
};

const getPlacementGap = (
  candidate: Vec2,
  radius: number,
  body: Pick<EntityBase, "pos" | "radius">,
): number => dist(candidate, body.pos) - radius - body.radius;

const samplePositionInsideCircle = (rng: Rng, maxRadius: number): Vec2 => {
  const angle = nextFloat(rng, 0, Math.PI * 2);
  const radius = Math.sqrt(rng()) * maxRadius;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
};

const createRingFallbackPosition = (
  index: number,
  count: number,
  maxRadius: number,
  phase: number,
): Vec2 => {
  const safeCount = Math.max(1, count);
  const angle = (index / safeCount) * Math.PI * 2 + phase;
  const radius = Math.max(0, Math.min(maxRadius, maxRadius * 0.72));

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
};

export const createNeutronStars = ({
  arenaRadius,
  blockedBodies = [],
  createId,
  rng,
  spec,
}: CreateNeutronStarsOptions): NeutronStar[] => {
  if (spec.count <= 0) {
    return [];
  }

  const massBounds = getMassBounds(spec);
  const phase = nextFloat(rng, 0, Math.PI * 2);
  const placedBodies: Array<Pick<EntityBase, "pos" | "radius">> = [
    ...blockedBodies,
  ];
  const stars: NeutronStar[] = [];

  for (let index = 0; index < spec.count; index += 1) {
    const mass = nextFloat(rng, massBounds.min, massBounds.max);
    const radius = getNeutronStarRadiusForMass(mass, spec);
    const maxPlacementRadius = Math.max(
      0,
      arenaRadius - radius - NEUTRON_STAR_BOUNDARY_MARGIN,
    );
    let bestCandidate = createRingFallbackPosition(
      index,
      spec.count,
      maxPlacementRadius,
      phase,
    );
    let bestGap = Number.NEGATIVE_INFINITY;
    const desiredGap = Math.max(120, radius * 1.5);

    if (spec.randomizePositionInsidePlayableCircle) {
      for (
        let attempt = 0;
        attempt < NEUTRON_STAR_SPAWN_ATTEMPTS;
        attempt += 1
      ) {
        const candidate = samplePositionInsideCircle(rng, maxPlacementRadius);
        let minGap = Number.POSITIVE_INFINITY;

        for (const body of placedBodies) {
          minGap = Math.min(
            minGap,
            getPlacementGap(candidate, radius, body) - desiredGap,
          );
        }

        if (placedBodies.length === 0) {
          minGap = Number.POSITIVE_INFINITY;
        }

        if (minGap > bestGap) {
          bestGap = minGap;
          bestCandidate = candidate;
        }

        if (minGap >= 0) {
          bestCandidate = candidate;
          break;
        }
      }
    }

    const star: NeutronStar = {
      id: createId(),
      kind: "neutronStar",
      mass,
      radius,
      pos: bestCandidate,
      vel: { x: 0, y: 0 },
    };
    stars.push(star);
    placedBodies.push(star);
  }

  return stars;
};
