import { clamp, FIXED_STEP_SEC, type AbilitySpec } from "@3body/shared";

interface GetForesightMeterProgressParams {
  activeUntilTick: number;
  activeDurationTicks: number;
  cooldownUntilTick: number;
  currentTick: number;
  settings: AbilitySpec;
}

const getAbilityTicks = (durationSec: number): number =>
  Math.max(1, Math.round(durationSec / FIXED_STEP_SEC));

export const getForesightMeterProgress = ({
  activeUntilTick,
  activeDurationTicks,
  cooldownUntilTick,
  currentTick,
  settings,
}: GetForesightMeterProgressParams): number => {
  const durationTicks =
    typeof activeDurationTicks === "number" &&
    Number.isFinite(activeDurationTicks)
      ? Math.max(1, activeDurationTicks)
      : getAbilityTicks(settings.durationSec);

  if (currentTick < activeUntilTick) {
    return clamp((activeUntilTick - currentTick) / durationTicks, 0, 1);
  }

  if (currentTick < cooldownUntilTick) {
    const rechargeDurationTicks = Math.max(
      0,
      getAbilityTicks(settings.cooldownSec) - durationTicks,
    );
    if (rechargeDurationTicks <= 0) {
      return 1;
    }

    return (
      1 - clamp((cooldownUntilTick - currentTick) / rechargeDurationTicks, 0, 1)
    );
  }

  return 1;
};
