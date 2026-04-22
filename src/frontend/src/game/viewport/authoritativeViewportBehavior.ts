import type { AbilitySlot, PlanetPublic, RocketKind, Vec2 } from "@3body/shared";
import {
  BOOST_SPEC,
  clamp,
  len,
  lerp,
  normalize as normalizeVec2,
  ROCKET_SPECS,
  SNAPSHOT_HZ,
  sub,
} from "@3body/shared";

const AUTHORITATIVE_SEEKER_LOCK_SELECTION_DISTANCE = 96;
const DEFAULT_AUTHORITATIVE_AIM_DIR = { x: 1, y: 0 } satisfies Vec2;

export interface AuthoritativePendingAbilityRequests {
  boost: boolean;
  gravityPulse: boolean;
  shield: boolean;
}

export interface AuthoritativeSeekerLockResolution {
  progress: number;
  seekerLockStartedAtSec: number | null;
  seekerLockTarget: PlanetPublic | null;
  seekerLockTargetId: number | null;
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

export const getAuthoritativeAimDirection = ({
  aimWorld,
  playerPos,
}: {
  aimWorld: Vec2;
  playerPos: Vec2;
}): Vec2 => {
  const aimDelta = sub(aimWorld, playerPos);

  return len(aimDelta) > 0 ? normalizeVec2(aimDelta) : DEFAULT_AUTHORITATIVE_AIM_DIR;
};

export const getAuthoritativeBoostRepeatIntervalSec = (): number =>
  Math.max(1 / SNAPSHOT_HZ, BOOST_SPEC.cooldownSec * 0.9);

const findAimLockTargetPlanet = ({
  aimWorld,
  planets,
  playerPlanetId,
}: {
  aimWorld: Vec2;
  planets: readonly PlanetPublic[];
  playerPlanetId: number;
}): PlanetPublic | null => {
  let bestTarget: PlanetPublic | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const planet of planets) {
    if (planet.id === playerPlanetId) {
      continue;
    }

    const distance = len(sub(planet.pos, aimWorld)) - planet.radius;
    if (
      distance <= AUTHORITATIVE_SEEKER_LOCK_SELECTION_DISTANCE &&
      distance < bestDistance
    ) {
      bestDistance = distance;
      bestTarget = planet;
    }
  }

  return bestTarget;
};

const getAuthoritativeSeekerLockProgress = (
  nowSec: number,
  lockStartedAtSec: number | null,
): number => {
  if (lockStartedAtSec === null) {
    return 0;
  }

  if (ROCKET_SPECS.seeker.lockSec <= 0) {
    return 1;
  }

  return clamp((nowSec - lockStartedAtSec) / ROCKET_SPECS.seeker.lockSec, 0, 1);
};

export const resolveAuthoritativeSeekerLock = ({
  aimWorld,
  nowSec,
  planets,
  playerPlanet,
  previousSeekerLockStartedAtSec,
  previousSeekerLockTargetId,
  selectedRocketKind,
}: {
  aimWorld: Vec2;
  nowSec: number;
  planets: readonly PlanetPublic[] | null;
  playerPlanet: PlanetPublic | null;
  previousSeekerLockStartedAtSec: number | null;
  previousSeekerLockTargetId: number | null;
  selectedRocketKind: RocketKind;
}): AuthoritativeSeekerLockResolution => {
  if (
    selectedRocketKind !== "seeker" ||
    playerPlanet === null ||
    planets === null
  ) {
    return {
      progress: 0,
      seekerLockStartedAtSec: null,
      seekerLockTarget: null,
      seekerLockTargetId: null,
    };
  }

  const seekerLockTarget = findAimLockTargetPlanet({
    aimWorld,
    planets,
    playerPlanetId: playerPlanet.id,
  });

  if (seekerLockTarget === null) {
    return {
      progress: 0,
      seekerLockStartedAtSec: null,
      seekerLockTarget: null,
      seekerLockTargetId: null,
    };
  }

  const seekerLockStartedAtSec =
    previousSeekerLockTargetId !== seekerLockTarget.id
      ? nowSec
      : previousSeekerLockStartedAtSec;

  return {
    progress: getAuthoritativeSeekerLockProgress(
      nowSec,
      seekerLockStartedAtSec,
    ),
    seekerLockStartedAtSec,
    seekerLockTarget,
    seekerLockTargetId: seekerLockTarget.id,
  };
};

export const shouldDispatchAuthoritativeInput = ({
  inputSendIntervalMs,
  lastInputSentAtMs,
  shieldActive,
  timeMs,
}: {
  inputSendIntervalMs: number;
  lastInputSentAtMs: number;
  shieldActive: boolean;
  timeMs: number;
}): boolean =>
  !shieldActive && timeMs - lastInputSentAtMs >= inputSendIntervalMs;

export const shouldDispatchAuthoritativeShieldAim = ({
  lastShieldAimSentAtMs,
  shieldActive,
  shieldAimSendIntervalMs,
  timeMs,
}: {
  lastShieldAimSentAtMs: number;
  shieldActive: boolean;
  shieldAimSendIntervalMs: number;
  timeMs: number;
}): boolean =>
  shieldActive &&
  timeMs - lastShieldAimSentAtMs >= shieldAimSendIntervalMs;

export const getAuthoritativeQueuedAbilitySlots = ({
  boostAvailable,
  lastBoostAbilitySentAtSec,
  nowSec,
  pendingAbilityRequests,
}: {
  boostAvailable: boolean;
  lastBoostAbilitySentAtSec: number;
  nowSec: number;
  pendingAbilityRequests: AuthoritativePendingAbilityRequests;
}): readonly AbilitySlot[] =>
  getAuthoritativeAbilitySlots({
    ...pendingAbilityRequests,
    boost:
      pendingAbilityRequests.boost &&
      boostAvailable &&
      nowSec - lastBoostAbilitySentAtSec >=
        getAuthoritativeBoostRepeatIntervalSec(),
  });

export const resolveAuthoritativeFireTargetId = ({
  seekerLockProgress,
  seekerLockTarget,
  selectedRocketKind,
}: {
  seekerLockProgress: number;
  seekerLockTarget: PlanetPublic | null;
  selectedRocketKind: RocketKind;
}): number | undefined =>
  selectedRocketKind === "seeker" && seekerLockProgress >= 1
    ? seekerLockTarget?.id
    : undefined;

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
