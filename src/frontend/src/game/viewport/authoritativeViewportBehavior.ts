import type {
  AbilitySlot,
  PlanetPrivateState,
  PlanetPublic,
  PlayerId,
  RocketKind,
  Vec2,
} from "@3body/shared";
import {
  ARCHETYPES,
  BOOST_SPEC,
  clamp,
  len,
  lerp,
  normalize as normalizeVec2,
  ROCKET_SPECS,
  SIM_HZ,
  SNAPSHOT_HZ,
  sub,
} from "@3body/shared";
import type {
  AuthoritativeConnectionState,
  AuthoritativeMatchPhase,
} from "../authoritativeMatchRuntime";

const AUTHORITATIVE_SEEKER_LOCK_SELECTION_DISTANCE = 96;
const DEFAULT_AUTHORITATIVE_AIM_DIR = { x: 1, y: 0 } satisfies Vec2;

interface AuthoritativePendingAbilityRequests {
  boost: boolean;
  gravityPulse: boolean;
  shield: boolean;
}

interface AuthoritativeSeekerLockResolution {
  progress: number;
  seekerLockStartedAtSec: number | null;
  seekerLockTarget: PlanetPublic | null;
  seekerLockTargetId: number | null;
}

interface AuthoritativeCombatControlStepResolution {
  aimDir: Vec2 | null;
  boostAvailable: boolean;
  dispatchEnabled: boolean;
  fireTargetId: number | undefined;
  queuedAbilitySlots: readonly AbilitySlot[];
  seekerLock: AuthoritativeSeekerLockResolution;
  sendInput: boolean;
  sendShieldAim: boolean;
  shieldActive: boolean;
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

const cooldownKeyByRocketKind = {
  heavy: "heavyReloadUntilTick",
  light: "lightReloadUntilTick",
  seeker: "seekerReloadUntilTick",
} as const satisfies Record<
  RocketKind,
  "heavyReloadUntilTick" | "lightReloadUntilTick" | "seekerReloadUntilTick"
>;

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

const getAuthoritativeAimDirection = ({
  aimWorld,
  playerPos,
}: {
  aimWorld: Vec2;
  playerPos: Vec2;
}): Vec2 => {
  const aimDelta = sub(aimWorld, playerPos);

  return len(aimDelta) > 0
    ? normalizeVec2(aimDelta)
    : DEFAULT_AUTHORITATIVE_AIM_DIR;
};

const getAuthoritativeBoostRepeatIntervalSec = (): number =>
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

const resolveAuthoritativeSeekerLock = ({
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

const shouldDispatchAuthoritativeInput = ({
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

const shouldDispatchAuthoritativeShieldAim = ({
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
  shieldActive && timeMs - lastShieldAimSentAtMs >= shieldAimSendIntervalMs;

const getAuthoritativeQueuedAbilitySlots = ({
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

const resolveAuthoritativeFireTargetId = ({
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

export const getAuthoritativeRocketReloadTicks = (
  rocketKind: RocketKind,
  archetype: PlanetPublic["archetype"],
): number =>
  Math.max(
    1,
    Math.round(
      ROCKET_SPECS[rocketKind].reloadSec *
        ARCHETYPES[archetype].rocketReloadMultiplier *
        SIM_HZ,
    ),
  );

export const canDispatchAuthoritativeRocketFire = ({
  actionTick,
  lastFireSentAtTick,
  playerPlanet,
  rocketKind,
  self,
}: {
  actionTick: number;
  lastFireSentAtTick: number;
  playerPlanet: PlanetPublic | null;
  rocketKind: RocketKind;
  self: PlanetPrivateState | null;
}): boolean => {
  if (self === null || playerPlanet === null) {
    return false;
  }

  if (playerPlanet.shieldActive && playerPlanet.shieldLoad > 0) {
    return false;
  }

  const safeActionTick = Number.isFinite(actionTick)
    ? Math.max(0, Math.trunc(actionTick))
    : 0;
  if (self.ammo[rocketKind] <= 0) {
    return false;
  }

  if (safeActionTick < self.cooldowns[cooldownKeyByRocketKind[rocketKind]]) {
    return false;
  }

  const reloadTicks = getAuthoritativeRocketReloadTicks(
    rocketKind,
    playerPlanet.archetype,
  );
  const safeLastFireSentAtTick = Number.isFinite(lastFireSentAtTick)
    ? Math.trunc(lastFireSentAtTick)
    : Number.NEGATIVE_INFINITY;

  return safeActionTick - safeLastFireSentAtTick >= reloadTicks;
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
  lerp(currentValue, targetValue, 1 - Math.exp(-followLerp * frameDeltaSec));

export const resolveAuthoritativeCombatControlStep = ({
  connectionState,
  inputSendIntervalMs,
  inputState,
  lastBoostAbilitySentAtSec,
  lastInputSentAtMs,
  lastShieldAimSentAtMs,
  nowSec,
  pendingAbilityRequests,
  phase,
  planets,
  playerId,
  playerPlanet,
  previousSeekerLockStartedAtSec,
  previousSeekerLockTargetId,
  self,
  shieldAimSendIntervalMs,
  timeMs,
}: {
  connectionState: AuthoritativeConnectionState;
  inputSendIntervalMs: number;
  inputState: {
    aimWorld: Vec2;
    selectedRocketKind: RocketKind;
  };
  lastBoostAbilitySentAtSec: number;
  lastInputSentAtMs: number;
  lastShieldAimSentAtMs: number;
  nowSec: number;
  pendingAbilityRequests: AuthoritativePendingAbilityRequests;
  phase: AuthoritativeMatchPhase;
  planets: readonly PlanetPublic[] | null;
  playerId: PlayerId | null;
  playerPlanet: PlanetPublic | null;
  previousSeekerLockStartedAtSec: number | null;
  previousSeekerLockTargetId: number | null;
  self: PlanetPrivateState | null;
  shieldAimSendIntervalMs: number;
  timeMs: number;
}): AuthoritativeCombatControlStepResolution => {
  const seekerLock = resolveAuthoritativeSeekerLock({
    aimWorld: inputState.aimWorld,
    nowSec,
    planets,
    playerPlanet,
    previousSeekerLockStartedAtSec,
    previousSeekerLockTargetId,
    selectedRocketKind: inputState.selectedRocketKind,
  });
  const dispatchEnabled =
    phase === "combat" &&
    connectionState === "connected" &&
    planets !== null &&
    playerId !== null &&
    self !== null;
  const boostAvailable = (self?.boostCharges ?? 0) > 0;

  if (!dispatchEnabled || playerPlanet === null) {
    return {
      aimDir: null,
      boostAvailable,
      dispatchEnabled,
      fireTargetId: undefined,
      queuedAbilitySlots: [],
      seekerLock,
      sendInput: false,
      sendShieldAim: false,
      shieldActive: false,
    };
  }

  const aimDir = getAuthoritativeAimDirection({
    aimWorld: inputState.aimWorld,
    playerPos: playerPlanet.pos,
  });
  const shieldActive = playerPlanet.shieldActive && playerPlanet.shieldLoad > 0;

  return {
    aimDir,
    boostAvailable,
    dispatchEnabled,
    fireTargetId: resolveAuthoritativeFireTargetId({
      seekerLockProgress: seekerLock.progress,
      seekerLockTarget: seekerLock.seekerLockTarget,
      selectedRocketKind: inputState.selectedRocketKind,
    }),
    queuedAbilitySlots: getAuthoritativeQueuedAbilitySlots({
      boostAvailable,
      lastBoostAbilitySentAtSec,
      nowSec,
      pendingAbilityRequests,
    }),
    seekerLock,
    sendInput: shouldDispatchAuthoritativeInput({
      inputSendIntervalMs,
      lastInputSentAtMs,
      shieldActive,
      timeMs,
    }),
    sendShieldAim: shouldDispatchAuthoritativeShieldAim({
      lastShieldAimSentAtMs,
      shieldActive,
      shieldAimSendIntervalMs,
      timeMs,
    }),
    shieldActive,
  };
};
