import type { NeutronStar, Sun, Vec2 } from "@3body/shared";
import { dist } from "@3body/shared";

interface TrackedNeutronStarBody {
  mass: number;
  pos: Vec2;
  radius: number;
}

export const findAbsorbingNeutronStar = ({
  currentNeutronStars,
  previousNeutronStarsById,
  sun,
}: {
  currentNeutronStars: readonly NeutronStar[];
  previousNeutronStarsById: ReadonlyMap<number, TrackedNeutronStarBody>;
  sun: Pick<Sun, "pos" | "radius">;
}): NeutronStar | null => {
  let bestMatch: NeutronStar | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const neutronStar of currentNeutronStars) {
    const previousNeutronStar = previousNeutronStarsById.get(neutronStar.id);
    if (previousNeutronStar === undefined) {
      continue;
    }

    if (
      neutronStar.mass <= previousNeutronStar.mass &&
      neutronStar.radius <= previousNeutronStar.radius
    ) {
      continue;
    }

    const distance = Math.min(
      dist(sun.pos, neutronStar.pos),
      dist(sun.pos, previousNeutronStar.pos),
    );
    const reach = Math.max(
      neutronStar.radius + sun.radius * 1.35,
      previousNeutronStar.radius + sun.radius * 1.35,
    );
    if (distance > reach || distance >= closestDistance) {
      continue;
    }

    closestDistance = distance;
    bestMatch = neutronStar;
  }

  return bestMatch;
};

export const getNeutronStarAbsorptionExplosionRadius = ({
  neutronStarRadius,
  sunRadius,
}: {
  neutronStarRadius: number;
  sunRadius: number;
}): number => Math.max(sunRadius * 1.6, neutronStarRadius * 0.36);
