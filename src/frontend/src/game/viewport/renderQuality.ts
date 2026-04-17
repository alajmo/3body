export type ViewportEffectsQuality = "high" | "low" | "medium";

export interface ViewportRenderQualityProfile {
  boostBurstBudget: number;
  chromaticAberrationScale: number;
  debrisBudget: number;
  effectsQuality: ViewportEffectsQuality;
  impactBurstBudget: number;
  launchBurstBudget: number;
  maxPixelRatio: number;
  rocketTrailBudget: number;
  ssaaLevel: number;
}

export const DEFAULT_VIEWPORT_RENDER_QUALITY_PROFILE: ViewportRenderQualityProfile =
  {
    boostBurstBudget: 1,
    chromaticAberrationScale: 1,
    debrisBudget: 1,
    effectsQuality: "high",
    impactBurstBudget: 1,
    launchBurstBudget: 1,
    maxPixelRatio: 2.1,
    rocketTrailBudget: 1,
    ssaaLevel: 2,
  };
