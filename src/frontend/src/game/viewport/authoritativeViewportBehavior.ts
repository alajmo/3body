import type { AbilitySlot } from "@3body/shared";
import { lerp } from "@3body/shared";

interface AuthoritativePendingAbilityRequests {
  boost: boolean;
  gravityPulse: boolean;
  shield: boolean;
}

const AUTHORITATIVE_ABILITY_SLOTS_BY_MASK = [
  [] as const,
  ["q"] as const,
  ["w"] as const,
  ["q", "w"] as const,
  ["g"] as const,
  ["q", "g"] as const,
  ["w", "g"] as const,
  ["q", "w", "g"] as const,
] satisfies readonly (readonly AbilitySlot[])[];

export const getAuthoritativeAbilitySlots = (
  pendingAbilityRequests: AuthoritativePendingAbilityRequests,
): readonly AbilitySlot[] => {
  let mask = 0;
  if (pendingAbilityRequests.shield) {
    mask |= 0b001;
  }
  if (pendingAbilityRequests.boost) {
    mask |= 0b010;
  }
  if (pendingAbilityRequests.gravityPulse) {
    mask |= 0b100;
  }

  return AUTHORITATIVE_ABILITY_SLOTS_BY_MASK[mask]!;
};

export const smoothAuthoritativeCameraAxis = ({
  currentValue,
  followLerp,
  frameDeltaSec,
  targetValue,
}: {
  currentValue: number;
  followLerp: number;
  frameDeltaSec: number;
  targetValue: number;
}): number =>
  lerp(
    currentValue,
    targetValue,
    1 - Math.exp(-followLerp * frameDeltaSec),
  );
