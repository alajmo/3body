import type { BlackHole, EntityBase } from "./entities";
import { dist } from "./vec2";

export const hasCrossedBlackHoleHorizon = (
  body: Pick<EntityBase, "pos">,
  blackHole: Pick<BlackHole, "killRadius" | "pos"> | null | undefined,
): boolean =>
  blackHole !== null &&
  blackHole !== undefined &&
  dist(body.pos, blackHole.pos) <= blackHole.killRadius;
