export const SHIELD_INNER_SCALE = 1.22;
export const SHIELD_OUTER_SCALE = 1.7;
export const SHIELD_GLOW_OUTER_SCALE = 2.06;

export const getRenderedShieldOuterRadius = (
  planetRadius: number,
  planetBodyScale: number,
): number => planetRadius * planetBodyScale * SHIELD_OUTER_SCALE;
