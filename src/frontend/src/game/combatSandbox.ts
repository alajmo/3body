import type {
  ArchetypeId,
  BlackHole,
  BlackHoleSpec,
  BotDifficulty,
  Cache,
  CacheContents,
  CombatBotCommand,
  CombatBotMemory,
  CombatBotRuntime,
  Debris,
  EntityBase,
  NeutronStar,
  PlanetDebuffs,
  PlanetPrivateAmmo,
  PlanetPrivateState,
  PlanetPublic,
  Rocket,
  RocketKind,
  Sun,
  Vec2,
  WildcardKind,
} from "@3body/shared";
import {
  ARCHETYPE_IDS,
  ARCHETYPES,
  ARENA_BOUNDARY_SPEC,
  ARENA_RADIUS,
  add,
  BOOST_SPEC,
  CACHE_DROP_SPEED_SCALE,
  CACHE_GRAVITY_SCALE,
  CACHE_RADIUS,
  CACHE_SPEC,
  CACHE_TANGENTIAL_SPEED_MAX,
  CACHE_TANGENTIAL_SPEED_MIN,
  clamp,
  clampLen,
  cloneCacheContents,
  cloneCombatBotMemory,
  consumeBlackHoleBodies,
  createCombatBotMemory,
  createNeutronStars,
  createInitialAmmo,
  DEBRIS_TTL_SEC,
  decideCombatBot,
  dist,
  dot,
  FIXED_STEP_SEC,
  FORESIGHT_EXT_MULTIPLIER,
  FORESIGHT_SPEC,
  fromAngle,
  getOuterRingMax,
  getOuterRingMin,
  getBaseShieldLoad,
  getBlackHoleMassAtElapsedSec,
  getSeekerLockTicks,
  getShieldLoadCapacity,
  GRAVITY_PULSE_IMPULSE,
  GRAVITY_PULSE_RADIUS,
  len,
  lerp,
  lerpVec2,
  mulberry32,
  NEUTRON_STAR_SPEC,
  normalize,
  PLANET_HP,
  REPAIR_AMOUNT,
  ROCKET_SPECS,
  rollCacheContents,
  SHIELD_EXT_MULTIPLIER,
  SHIELD_SPEC,
  SIM_HZ,
  scale,
  stepBody,
  stepBodyWithGravityScale,
  stepSeeker,
  stepSuns,
  sub,
} from "@3body/shared";
import {
  DEFAULT_ORBIT_PRESET,
  type OrbitPlanetSeed,
  type OrbitPreset,
  type OrbitRiskProfile,
} from "./orbitPresets";
import { findMinPlanetSunGap, findMinSunSunGap } from "./orbitSandbox";
import { getPlanetBodyScaleForArchetype } from "./planetVisualTuning";
import { resolveRuntimeOrbitPreset } from "./runtimeOrbitPreset";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import { SHIELD_OUTER_SCALE } from "./shieldPresentation";

export const SUN_SWALLOW_FADE_SEC = 2.4;
const LIGHT_RELOCK_DISTANCE = 96;

// Use a calmer outer-orbit body for the local player so combat starts are playable.
const PLAYER_PLANET_INDEX = 4;
const DEFAULT_ROCKET_PLANET_IMPACT_RADIUS_MULTIPLIER = 1;
const PLANET_IMPACT_TTL_SEC = 0.32;
const ROCKET_LAUNCH_BURST_TTL_SEC = 0.2;
const DEBRIS_PIECES = 20;
const DEBRIS_BURST_SPEED = 220;
const DEBRIS_BURST_SPEED_VARIANCE = 170;
const ROCKET_DEBRIS_PIECES_LIGHT = 6;
const ROCKET_DEBRIS_PIECES_HEAVY = 10;
const ROCKET_DEBRIS_PIECES_SEEKER = 8;
const ROCKET_DEBRIS_BURST_SPEED = 168;
const ROCKET_DEBRIS_BURST_SPEED_VARIANCE = 104;
const CACHE_DEBRIS_PIECES = 10;
const CACHE_DEBRIS_BURST_SPEED = 140;
const CACHE_DEBRIS_BURST_SPEED_VARIANCE = 92;
const PLAYER_LOST_RESET_DELAY_SEC = 6;
const DEFAULT_AIM_DIR = { x: 1, y: 0 } satisfies Vec2;
const LOCAL_BOT_DIFFICULTY: BotDifficulty = "normal";
const DEFAULT_LOCAL_PLAYER_DISPLAY_NAME = "Pilot";
const LOCAL_BOT_DISPLAY_NAMES = [
  "Atlas",
  "Nadir",
  "Helios",
  "Orbit",
  "Lyra",
  "Vega",
  "Rook",
] as const;
const SWALLOWED_SUN_DRIFT_ALPHA = 0.035;
const SWALLOWED_SUN_VELOCITY_DAMPING = 0.08;
const CLOAK_DURATION_TICKS = Math.max(1, Math.round(5 * SIM_HZ));
const UMBRA_DRAG_DURATION_TICKS = Math.max(1, Math.round(2 * SIM_HZ));
// Interpret the spec's "30% velocity multiplier" as cumulative damping over the drag window.
const UMBRA_DRAG_STEP_MULTIPLIER = 0.3 ** (1 / UMBRA_DRAG_DURATION_TICKS);
const CACHE_RESPAWN_TICKS = Math.max(
  1,
  Math.round(CACHE_SPEC.respawnSec * SIM_HZ),
);
const getAbilityTicks = (durationSec: number): number =>
  Math.max(1, Math.round(durationSec * SIM_HZ));

const getForesightDurationTicks = (
  archetypeId: ArchetypeId,
  extended = false,
): number =>
  Math.max(
    1,
    Math.round(
      FORESIGHT_SPEC.durationSec *
        SIM_HZ *
        ARCHETYPES[archetypeId].foresightDurationMultiplier *
        (extended ? FORESIGHT_EXT_MULTIPLIER : 1),
    ),
  );

const getForesightCooldownTicks = (): number =>
  getAbilityTicks(FORESIGHT_SPEC.cooldownSec);

const getForesightRechargeTicks = (durationTicks: number): number =>
  Math.max(0, getForesightCooldownTicks() - durationTicks);

const getForesightChargeTicks = ({
  currentTick,
  cooldownUntilTick,
  durationTicks,
}: {
  currentTick: number;
  cooldownUntilTick: number;
  durationTicks: number;
}): number => {
  const rechargeTicks = getForesightRechargeTicks(durationTicks);
  if (currentTick >= cooldownUntilTick || rechargeTicks <= 0) {
    return durationTicks;
  }

  return clamp(
    durationTicks * (1 - (cooldownUntilTick - currentTick) / rechargeTicks),
    0,
    durationTicks,
  );
};

const getBoostRechargeTicks = (): number =>
  getAbilityTicks(BOOST_SPEC.cooldownSec);

const getShieldArcDotThreshold = (): number =>
  Math.cos((SHIELD_SPEC.arcDeg * Math.PI) / 360);
export type CombatPlanetDeathReason =
  | "rocket"
  | "sunCollision"
  | "neutronStar"
  | "planetCollision"
  | "boundary"
  | "blackHole";

export type CombatResetReason = "allPlanetsLost" | "playerLost";

export interface CombatSandboxSun extends Sun {
  swallowedAtSec: number | null;
}

export interface CombatSandboxPlanet extends PlanetPublic {
  displayName: string;
  label: string;
  color: string;
  trailColor: string;
  risk: OrbitRiskProfile;
  alive: boolean;
  deathReason?: CombatPlanetDeathReason;
}

export interface CombatSandboxRocket extends Rocket {
  damage: number;
  trailColor: string;
  color: string;
  dragOnHit: boolean;
  launchPlanetArchetype: ArchetypeId;
  turnRateMultiplier: number;
  launchPlanetPos: Vec2;
  launchPlanetRadius: number;
}

export type CombatSandboxCache = Cache;

export interface CombatSandboxDebris extends Debris {
  color: string;
}

export interface CombatSandboxImpactBurst {
  id: number;
  planetId: number;
  absorbedByShield: boolean;
  color: string;
  normal: Vec2;
  startedAtSec: number;
  startedAtTick: number;
  ttlUntilTick: number;
}

export interface CombatSandboxRocketLaunchBurst {
  id: number;
  ownerId: string;
  rocketKind: RocketKind;
  color: string;
  trailColor: string;
  origin: Vec2;
  launchPlanetArchetype: ArchetypeId;
  launchPlanetPos: Vec2;
  launchPlanetRadius: number;
  dir: Vec2;
  speed: number;
  startedAtSec: number;
  startedAtTick: number;
  ttlUntilTick: number;
}

export interface CombatSandboxControllerState {
  playerId: string;
  planetId: number;
  boundaryEnteredTick: number | null;
  selectedRocketKind: RocketKind;
  ammo: PlanetPrivateAmmo;
  reloadUntilTick: Record<RocketKind, number>;
  aimWorld: Vec2;
  lockTargetId: number | null;
  seekerLockAcquiredAtTick: number | null;
  foresightActiveUntilTick: number;
  foresightCooldownUntilTick: number;
  foresightDurationTicks: number;
  shieldAimDir: Vec2;
  shieldActive: boolean;
  shieldLoad: number;
  shieldMaxLoad: number;
  boostCharges: number;
  nextBoostChargeAtTick: number | null;
  lastBoostTick: number | null;
  lastBoostAimDir: Vec2;
  gravityPulseHeld: boolean;
  cloakHeld: boolean;
  nextShieldExt: boolean;
  nextForesightExt: boolean;
}

export interface CombatSandboxPlayerState
  extends CombatSandboxControllerState {}

export interface CombatSandboxBotState extends CombatSandboxControllerState {
  difficulty: BotDifficulty;
  memory: CombatBotMemory;
}

export interface CombatSandboxPlayerBotState {
  difficulty: BotDifficulty;
  memory: CombatBotMemory;
}

export interface CombatSandboxState {
  tick: number;
  elapsedSec: number;
  preset: OrbitPreset;
  suns: CombatSandboxSun[];
  neutronStars: NeutronStar[];
  planets: CombatSandboxPlanet[];
  rockets: CombatSandboxRocket[];
  caches: CombatSandboxCache[];
  cacheRespawnAtTicks: number[];
  debris: CombatSandboxDebris[];
  impactBursts: CombatSandboxImpactBurst[];
  launchBursts: CombatSandboxRocketLaunchBurst[];
  blackHole: BlackHole | null;
  player: CombatSandboxPlayerState;
  playerBot: CombatSandboxPlayerBotState | null;
  playerLossResetsEnabled: boolean;
  bots: CombatSandboxBotState[];
  nextEntityId: number;
  playerLostAtSec: number | null;
  rng: () => number;
}

export interface CreateSandboxStateOptions {
  botsEnabled?: boolean;
  botDifficulty?: BotDifficulty;
  participantCount?: number;
  playerBehavior?: "bot" | "human";
  playerName?: string;
}

export interface CombatSandboxStepInput {
  aimWorld: Vec2;
  selectedRocketKind: RocketKind;
  fireRequested: boolean;
  foresightRequested: boolean;
  shieldRequested: boolean;
  boostRequested: boolean;
  gravityPulseRequested: boolean;
  cloakRequested: boolean;
}

export interface CombatSandboxSimulationOptions {
  planetImpactRadiusMultiplier?: number;
}

export interface CombatSandboxInterpolationCache {
  previousRocketMap: Map<number, CombatSandboxRocket>;
  previousCacheMap: Map<number, CombatSandboxCache>;
  previousDebrisMap: Map<number, CombatSandboxDebris>;
}

interface CombatSandboxControllerFrame {
  fireRequested: boolean;
  foresightRequested: boolean;
  shieldRequested: boolean;
  boostRequested: boolean;
  gravityPulseRequested: boolean;
  cloakRequested: boolean;
}

export interface CombatSandboxDebugSnapshot {
  elapsedSec: number;
  alivePlanets: number;
  minCurrentPlanetSunGap: number;
  minCurrentSunSunGap: number;
  presetLabel: string;
  playerArchetypeName: string;
  selectedRocketKind: RocketKind;
  lockTargetLabel: string | null;
  playerHp: number;
  lightAmmo: number;
  heavyAmmo: number;
  seekerAmmo: number;
  blackHoleActive: boolean;
  cacheCount: number;
  gravityPulseHeld: boolean;
  cloakHeld: boolean;
  aiFocused: CombatSandboxAiDebugSummary | null;
  aiSummaries: CombatSandboxAiDebugSummary[];
}

export interface CombatSandboxAiDebugSummary {
  playerId: string;
  label: string;
  intent: string;
  executionState: string;
  reason: string;
  targetLabel: string | null;
  shotSummary: string | null;
  planExpiryTick: number | null;
}

const getArchetypeVisuals = (archetype: ArchetypeId) =>
  getRuntimeTuningDocument().visuals.planets.archetypes[archetype];

const getArchetypeStats = (archetype: ArchetypeId) => ARCHETYPES[archetype];

const getBoostChargeCapacity = (_archetype: ArchetypeId): number =>
  BOOST_SPEC.charges;

const clonePlanetSeed = (
  planetSeed: OrbitPlanetSeed,
  index: number,
  playerPlanetId: number,
  displayName: string,
): CombatSandboxPlanet => {
  const archetype = ARCHETYPE_IDS[index % ARCHETYPE_IDS.length]!;
  const visuals = getArchetypeVisuals(archetype);
  const scaledRadius =
    planetSeed.radius * getPlanetBodyScaleForArchetype(archetype);

  return {
    ...planetSeed,
    kind: "planet",
    pos: { x: planetSeed.pos.x, y: planetSeed.pos.y },
    vel: { x: planetSeed.vel.x, y: planetSeed.vel.y },
    radius: scaledRadius,
    displayName,
    label: planetSeed.label,
    color: visuals.color,
    trailColor: visuals.trailColor,
    archetype,
    playerId:
      planetSeed.id === playerPlanetId ? "player" : `bot-${planetSeed.id}`,
    alive: true,
    hp: PLANET_HP,
    shieldAimDir: { ...DEFAULT_AIM_DIR },
    shieldActive: false,
    shieldLoad: getShieldLoadCapacity(archetype),
    shieldMaxLoad: getShieldLoadCapacity(archetype),
    hideTrailUntilTick: 0,
    debuffs: {},
  };
};

const lightRocketTint = {
  core: "#f4f9ff",
  trail: "#b7e6ff",
};

const heavyRocketTint = {
  core: "#ff8d4a",
  trail: "#ff6130",
};

const seekerRocketTint = {
  core: "#f564ff",
  trail: "#ff4dd4",
};

const ROCKET_VISUALS: Record<RocketKind, { core: string; trail: string }> = {
  heavy: heavyRocketTint,
  light: lightRocketTint,
  seeker: seekerRocketTint,
};

const weaponReloadTicks = (
  rocketKind: RocketKind,
  archetype: ArchetypeId,
): number =>
  Math.max(
    1,
    Math.round(
      ROCKET_SPECS[rocketKind].reloadSec *
        getArchetypeStats(archetype).rocketReloadMultiplier *
        SIM_HZ,
    ),
  );

const rocketTtlTicks = (rocketKind: RocketKind): number =>
  Math.max(1, Math.round(ROCKET_SPECS[rocketKind].ttlSec * SIM_HZ));

const rocketLaunchBurstTicks = (): number =>
  Math.max(1, Math.round(ROCKET_LAUNCH_BURST_TTL_SEC * SIM_HZ));

const debrisTtlTicks = Math.max(1, Math.round(DEBRIS_TTL_SEC * SIM_HZ));
const planetImpactTtlTicks = Math.max(
  1,
  Math.round(PLANET_IMPACT_TTL_SEC * SIM_HZ),
);

const nextRocketIdBase = 10_000;

const hashString = (value: string): number => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
};

const clonePlanet = (planet: CombatSandboxPlanet): CombatSandboxPlanet => ({
  ...planet,
  pos: { x: planet.pos.x, y: planet.pos.y },
  vel: { x: planet.vel.x, y: planet.vel.y },
  shieldAimDir: { x: planet.shieldAimDir.x, y: planet.shieldAimDir.y },
  debuffs: { ...planet.debuffs },
});

const cloneSun = (sun: CombatSandboxSun): CombatSandboxSun => ({
  ...sun,
  pos: { x: sun.pos.x, y: sun.pos.y },
  vel: { x: sun.vel.x, y: sun.vel.y },
});

const cloneRocket = (rocket: CombatSandboxRocket): CombatSandboxRocket => ({
  ...rocket,
  launchPlanetPos: {
    x: rocket.launchPlanetPos.x,
    y: rocket.launchPlanetPos.y,
  },
  pos: { x: rocket.pos.x, y: rocket.pos.y },
  vel: { x: rocket.vel.x, y: rocket.vel.y },
});

const cloneCache = (cache: CombatSandboxCache): CombatSandboxCache => ({
  ...cache,
  pos: { x: cache.pos.x, y: cache.pos.y },
  vel: { x: cache.vel.x, y: cache.vel.y },
  contents: cloneCacheContents(cache.contents),
});

const cloneDebris = (piece: CombatSandboxDebris): CombatSandboxDebris => ({
  ...piece,
  pos: { x: piece.pos.x, y: piece.pos.y },
  vel: { x: piece.vel.x, y: piece.vel.y },
});

const createControllerState = (
  planet: CombatSandboxPlanet,
): CombatSandboxControllerState => ({
  playerId: planet.playerId,
  planetId: planet.id,
  selectedRocketKind: "light",
  ammo: createInitialAmmo(),
  reloadUntilTick: {
    heavy: 0,
    light: 0,
    seeker: 0,
  },
  aimWorld: {
    x: planet.pos.x + 180,
    y: planet.pos.y,
  },
  boundaryEnteredTick: null,
  lockTargetId: null,
  seekerLockAcquiredAtTick: null,
  foresightActiveUntilTick: 0,
  foresightCooldownUntilTick: 0,
  foresightDurationTicks: getForesightDurationTicks(planet.archetype),
  shieldAimDir: { x: DEFAULT_AIM_DIR.x, y: DEFAULT_AIM_DIR.y },
  shieldActive: false,
  shieldLoad: getShieldLoadCapacity(planet.archetype),
  shieldMaxLoad: getShieldLoadCapacity(planet.archetype),
  boostCharges: getBoostChargeCapacity(planet.archetype),
  nextBoostChargeAtTick: null,
  lastBoostTick: null,
  lastBoostAimDir: { x: DEFAULT_AIM_DIR.x, y: DEFAULT_AIM_DIR.y },
  gravityPulseHeld: false,
  cloakHeld: false,
  nextShieldExt: false,
  nextForesightExt: false,
});

const cloneControllerState = <T extends CombatSandboxControllerState>(
  controller: T,
): T => ({
  ...controller,
  ammo: { ...controller.ammo },
  reloadUntilTick: { ...controller.reloadUntilTick },
  aimWorld: { x: controller.aimWorld.x, y: controller.aimWorld.y },
  shieldAimDir: {
    x: controller.shieldAimDir.x,
    y: controller.shieldAimDir.y,
  },
  lastBoostAimDir: {
    x: controller.lastBoostAimDir.x,
    y: controller.lastBoostAimDir.y,
  },
});

const cloneBotState = (bot: CombatSandboxBotState): CombatSandboxBotState => ({
  ...cloneControllerState(bot),
  memory: cloneCombatBotMemory(bot.memory),
});

const clonePlayerBotState = (
  playerBot: CombatSandboxPlayerBotState,
): CombatSandboxPlayerBotState => ({
  ...playerBot,
  memory: cloneCombatBotMemory(playerBot.memory),
});

const createControllerFrame = (): CombatSandboxControllerFrame => ({
  fireRequested: false,
  foresightRequested: false,
  shieldRequested: false,
  boostRequested: false,
  gravityPulseRequested: false,
  cloakRequested: false,
});

const toBotPrivateState = (
  controller: CombatSandboxControllerState,
): PlanetPrivateState => ({
  planetId: controller.planetId,
  ammo: { ...controller.ammo },
  cooldowns: {
    lightReloadUntilTick: controller.reloadUntilTick.light,
    heavyReloadUntilTick: controller.reloadUntilTick.heavy,
    seekerReloadUntilTick: controller.reloadUntilTick.seeker,
    foresightActiveUntilTick: controller.foresightActiveUntilTick,
    foresightCooldownUntilTick: controller.foresightCooldownUntilTick,
    foresightDurationTicks: controller.foresightDurationTicks,
    nextBoostChargeAtTick: controller.nextBoostChargeAtTick ?? undefined,
  },
  boostCharges: controller.boostCharges,
  gravityPulseHeld: controller.gravityPulseHeld,
  cloakHeld: controller.cloakHeld,
  nextShieldExt: controller.nextShieldExt,
  nextForesightExt: controller.nextForesightExt,
});

const createBotWorld = (
  state: Pick<
    CombatSandboxState,
    | "blackHole"
    | "caches"
    | "debris"
    | "planets"
    | "rockets"
    | "suns"
  >,
): PlanetPublic[] => state.planets.filter((planet) => planet.alive);

const createCombatBotWorld = (
  state: Pick<
    CombatSandboxState,
    | "blackHole"
    | "caches"
    | "debris"
    | "neutronStars"
    | "planets"
    | "rockets"
    | "suns"
  >,
): {
  suns: CombatSandboxSun[];
  neutronStars: NeutronStar[];
  planets: PlanetPublic[];
  rockets: CombatSandboxRocket[];
  caches: CombatSandboxCache[];
  blackHole?: BlackHole;
  debris: CombatSandboxDebris[];
  arenaRadius: number;
} => ({
  suns: getActiveCombatSuns(state.suns),
  neutronStars: state.neutronStars,
  planets: createBotWorld(state),
  rockets: state.rockets,
  caches: state.caches,
  blackHole: state.blackHole ?? undefined,
  debris: state.debris,
  arenaRadius: ARENA_RADIUS,
});

const getBotAimWorldDistance = (): number => ARENA_RADIUS * 2.4;

const getSandboxParticipantCount = (
  requestedCount: number | undefined,
  maxCount: number,
): number => {
  if (!(maxCount > 0)) {
    return 0;
  }

  if (requestedCount === undefined) {
    return maxCount;
  }

  return clamp(Math.round(requestedCount), 1, maxCount);
};

const getControlledBody = (
  planets: readonly CombatSandboxPlanet[],
  controller: CombatSandboxControllerState,
): Pick<EntityBase, "pos"> | null => {
  return findPlayerPlanet(planets, controller.planetId);
};

const setAimWorldFromDirection = (
  controller: CombatSandboxControllerState,
  origin: Pick<EntityBase, "pos"> | null,
  dir: Vec2,
) => {
  const normalizedDir = normalize(dir);
  if (origin === null || len(normalizedDir) === 0) {
    return;
  }

  controller.aimWorld = add(
    origin.pos,
    scale(normalizedDir, getBotAimWorldDistance()),
  );
};

const rotateVec2 = (dir: Vec2, angleRad: number): Vec2 => {
  const cosAngle = Math.cos(angleRad);
  const sinAngle = Math.sin(angleRad);
  return {
    x: dir.x * cosAngle - dir.y * sinAngle,
    y: dir.x * sinAngle + dir.y * cosAngle,
  };
};

export const describeWildcard = (wildcard: WildcardKind): string => {
  switch (wildcard) {
    case "gravityPulse":
      return "Gravity Pulse";
    case "cloak":
      return "Cloak";
  }
};

const getCacheContentsColor = (contents: CacheContents): string => {
  switch (contents.kind) {
    case "heavyAmmo":
      return "#ff8b49";
    case "seekerPack":
      return "#ff5fe8";
    case "repair":
      return "#84f4b0";
    case "shieldExt":
      return "#86ecff";
    case "foresightExt":
      return "#ffe285";
    case "wildcard":
      return "#ffd679";
  }
};

export const describeCacheContents = (contents: CacheContents): string => {
  switch (contents.kind) {
    case "heavyAmmo":
      return "Heavy +1";
    case "seekerPack":
      return "Seeker +2";
    case "repair":
      return "Repair";
    case "shieldExt":
      return "Shield Ext";
    case "foresightExt":
      return "Foresight Max";
    case "wildcard":
      return `Wildcard: ${describeWildcard(contents.wildcard.kind)}`;
  }
};

const createSandboxRng = (preset: OrbitPreset): (() => number) =>
  mulberry32(hashString(`phase5:${preset.id}`));

const isSunSwallowed = (
  sun: Pick<CombatSandboxSun, "swallowedAtSec">,
): boolean => sun.swallowedAtSec !== null;

export const getActiveCombatSuns = (
  suns: readonly CombatSandboxSun[],
): CombatSandboxSun[] => suns.filter((sun) => !isSunSwallowed(sun));

const createOuterRingCache = (
  rng: () => number,
  id: number,
  preferredAngleRad?: number,
  contents?: CacheContents,
): CombatSandboxCache => {
  const angle = preferredAngleRad ?? rng() * Math.PI * 2 + (rng() - 0.5) * 0.24;
  const radius = lerp(getOuterRingMin(), getOuterRingMax(), rng());
  const tangentialDir = fromAngle(
    angle + (Math.PI / 2) * (rng() < 0.5 ? -1 : 1),
  );
  const driftSpeed = lerp(
    CACHE_TANGENTIAL_SPEED_MIN,
    CACHE_TANGENTIAL_SPEED_MAX,
    rng(),
  );

  return {
    id,
    kind: "cache",
    contents: contents === undefined ? rollCacheContents(rng) : contents,
    pos: {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    },
    vel: scale(tangentialDir, driftSpeed),
    radius: CACHE_RADIUS,
  };
};

const createInitialCaches = (
  rng: () => number,
  nextEntityId: number,
): { caches: CombatSandboxCache[]; nextEntityId: number } => {
  const caches: CombatSandboxCache[] = [];
  let nextId = nextEntityId;

  for (let index = 0; index < CACHE_SPEC.count; index += 1) {
    const angle =
      (index / CACHE_SPEC.count) * Math.PI * 2 + (rng() - 0.5) * 0.42;
    caches.push(createOuterRingCache(rng, nextId, angle));
    nextId += 1;
  }

  return {
    caches,
    nextEntityId: nextId,
  };
};

const isPlanetInsideBlackHole = (
  planet: Pick<CombatSandboxPlanet, "pos" | "radius">,
  blackHole: BlackHole | null,
): boolean =>
  blackHole !== null &&
  dist(planet.pos, blackHole.pos) <= blackHole.killRadius + planet.radius;

const isEntityInsideBlackHole = (
  entity: Pick<EntityBase, "pos" | "radius">,
  blackHole: BlackHole | null,
): boolean =>
  blackHole !== null &&
  dist(entity.pos, blackHole.pos) <= blackHole.killRadius + entity.radius;

const isEntityTouchingArenaBoundary = (
  entity: Pick<EntityBase, "pos" | "radius">,
  arenaRadius: number,
): boolean => len(entity.pos) + entity.radius >= arenaRadius;

const getBlackHoleBonusMass = (
  blackHole: BlackHole,
  blackHoleSpec: BlackHoleSpec,
  previousElapsedSec: number,
): number =>
  Math.max(
    0,
    blackHole.mass -
      getBlackHoleMassAtElapsedSec(previousElapsedSec, blackHoleSpec),
  );

const stepCombatSuns = (
  suns: readonly CombatSandboxSun[],
  blackHole: BlackHole | null,
  swallowedAtSec: number,
): CombatSandboxSun[] => {
  const steppedActiveById = new Map(
    stepSuns(
      getActiveCombatSuns(suns),
      FIXED_STEP_SEC,
      blackHole ?? undefined,
    ).map((sun) => [sun.id, sun] as const),
  );

  return suns.map((sun) => {
    if (isSunSwallowed(sun)) {
      if (blackHole === null) {
        return sun;
      }

      return {
        ...sun,
        mass: 0,
        pos: lerpVec2(sun.pos, blackHole.pos, SWALLOWED_SUN_DRIFT_ALPHA),
        vel: lerpVec2(sun.vel, { x: 0, y: 0 }, SWALLOWED_SUN_VELOCITY_DAMPING),
      };
    }

    const steppedSun = steppedActiveById.get(sun.id)!;
    return isEntityInsideBlackHole(steppedSun, blackHole)
      ? {
          ...steppedSun,
          mass: 0,
          swallowedAtSec,
        }
      : {
          ...steppedSun,
          swallowedAtSec: null,
        };
  });
};

const syncBlackHole = (
  currentBlackHole: BlackHole | null,
  elapsedSec: number,
  blackHoleSpec: BlackHoleSpec,
): BlackHole | null => {
  if (elapsedSec < blackHoleSpec.spawnSec) {
    return null;
  }

  const mass = getBlackHoleMassAtElapsedSec(elapsedSec, blackHoleSpec);
  if (currentBlackHole === null) {
    return {
      id: 9_001,
      kind: "blackHole",
      killRadius: blackHoleSpec.killRadius,
      mass,
      pos: { x: 0, y: 0 },
      radius: blackHoleSpec.killRadius,
      vel: { x: 0, y: 0 },
    };
  }

  const bonusMass = getBlackHoleBonusMass(
    currentBlackHole,
    blackHoleSpec,
    Math.max(0, elapsedSec - FIXED_STEP_SEC),
  );
  const bonusKillRadius = Math.max(
    0,
    currentBlackHole.killRadius - blackHoleSpec.killRadius,
  );

  return {
    ...currentBlackHole,
    killRadius: blackHoleSpec.killRadius + bonusKillRadius,
    mass: mass + bonusMass,
    radius: blackHoleSpec.killRadius + bonusKillRadius,
  };
};

const findPlayerPlanet = (
  planets: readonly CombatSandboxPlanet[],
  playerPlanetId: number,
): CombatSandboxPlanet | null => {
  for (const planet of planets) {
    if (planet.id === playerPlanetId) {
      return planet;
    }
  }

  return null;
};

const getPlayerArchetypeId = (
  planets: readonly CombatSandboxPlanet[],
  playerPlanetId: number,
): ArchetypeId =>
  findPlayerPlanet(planets, playerPlanetId)?.archetype ?? "terra";

const findAliveTargetPlanet = (
  planets: readonly CombatSandboxPlanet[],
  playerPlanetId: number,
  aimWorld: Vec2,
): CombatSandboxPlanet | null => {
  let bestTarget: CombatSandboxPlanet | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const planet of planets) {
    if (!planet.alive || planet.id === playerPlanetId) {
      continue;
    }

    const distance = dist(planet.pos, aimWorld) - planet.radius;
    if (distance <= LIGHT_RELOCK_DISTANCE && distance < bestDistance) {
      bestDistance = distance;
      bestTarget = planet;
    }
  }

  return bestTarget;
};

const addLightAmmoCharge = (
  ammo: PlanetPrivateAmmo,
  reloadUntilTick: Record<RocketKind, number>,
  nextTick: number,
  archetype: ArchetypeId,
) => {
  if (
    ammo.light >= ROCKET_SPECS.light.maxAmmo ||
    reloadUntilTick.light === 0 ||
    nextTick < reloadUntilTick.light
  ) {
    return;
  }

  ammo.light += 1;
  reloadUntilTick.light =
    ammo.light >= ROCKET_SPECS.light.maxAmmo
      ? 0
      : nextTick + weaponReloadTicks("light", archetype);
};

const aimDirFromWorldTarget = (
  body: Pick<EntityBase, "pos"> | null,
  aimWorld: Vec2,
  fallback: Vec2 = DEFAULT_AIM_DIR,
): Vec2 => {
  if (body === null) {
    return fallback;
  }

  const aimDir = normalize(sub(aimWorld, body.pos));
  return len(aimDir) === 0 ? fallback : aimDir;
};

const refreshBoostCharges = (
  controller: CombatSandboxControllerState,
  tick: number,
  maxBoostCharges: number,
) => {
  if (controller.boostCharges >= maxBoostCharges) {
    controller.nextBoostChargeAtTick = null;
    return;
  }

  while (
    controller.nextBoostChargeAtTick !== null &&
    controller.nextBoostChargeAtTick <= tick
  ) {
    controller.boostCharges = Math.min(
      maxBoostCharges,
      controller.boostCharges + 1,
    );
    controller.nextBoostChargeAtTick =
      controller.boostCharges >= maxBoostCharges
        ? null
        : controller.nextBoostChargeAtTick + getBoostRechargeTicks();
  }
};

const refreshShieldLoad = (controller: CombatSandboxControllerState) => {
  if (controller.shieldActive) {
    controller.shieldLoad = Math.max(
      0,
      Math.min(
        controller.shieldMaxLoad,
        controller.shieldLoad - getShieldDrainAmount(),
      ),
    );
    controller.shieldActive =
      controller.shieldLoad > 0 && controller.shieldMaxLoad > 0;
    return;
  }

  if (controller.shieldMaxLoad <= 0) {
    controller.shieldLoad = 0;
    return;
  }

  controller.shieldLoad = Math.min(
    controller.shieldMaxLoad,
    controller.shieldLoad + getShieldRechargeAmount(controller.shieldMaxLoad),
  );
};

const refreshForesightState = (
  controller: CombatSandboxControllerState,
  archetypeId: ArchetypeId,
  tick: number,
) => {
  if (
    controller.foresightActiveUntilTick > tick ||
    controller.foresightCooldownUntilTick > tick
  ) {
    return;
  }

  controller.foresightActiveUntilTick = 0;
  controller.foresightCooldownUntilTick = 0;
  controller.foresightDurationTicks = getForesightDurationTicks(archetypeId);
};

const hasActiveShield = (
  controller: CombatSandboxControllerState,
  tick: number,
): boolean => controller.shieldActive && controller.shieldLoad > 0;

const getShieldDrainAmount = (): number =>
  SHIELD_SPEC.durationSec <= 0
    ? getBaseShieldLoad()
    : getBaseShieldLoad() / (SHIELD_SPEC.durationSec / FIXED_STEP_SEC);

const getShieldRechargeAmount = (shieldMaxLoad: number): number => {
  return SHIELD_SPEC.cooldownSec <= 0
    ? shieldMaxLoad
    : (shieldMaxLoad * FIXED_STEP_SEC) / SHIELD_SPEC.cooldownSec;
};

const applyShieldDamageToPlanet = (
  planet: CombatSandboxPlanet,
  controller: CombatSandboxControllerState,
  damage: number,
): CombatSandboxPlanet => {
  const nextShieldMaxLoad = Math.max(0, controller.shieldMaxLoad - damage);
  const nextShieldLoad = Math.min(
    nextShieldMaxLoad,
    Math.max(0, controller.shieldLoad - damage),
  );
  controller.shieldLoad = nextShieldLoad;
  controller.shieldActive =
    nextShieldLoad > 0 && nextShieldMaxLoad > 0 && controller.shieldActive;
  controller.shieldMaxLoad = nextShieldMaxLoad;

  return {
    ...planet,
    shieldActive: controller.shieldActive,
    shieldLoad: controller.shieldLoad,
    shieldMaxLoad: controller.shieldMaxLoad,
  };
};

const shieldProtectsImpact = (
  planet: CombatSandboxPlanet,
  controllers: ReadonlyMap<string, CombatSandboxControllerState>,
  sourcePos: Vec2,
  tick: number,
): boolean => {
  const controller = controllers.get(planet.playerId);
  if (
    controller === undefined ||
    planet.id !== controller.planetId ||
    !planet.alive ||
    !hasActiveShield(controller, tick)
  ) {
    return false;
  }

  const shieldAimDir = normalize(controller.shieldAimDir);
  const hitDir = normalize(sub(sourcePos, planet.pos));
  if (len(shieldAimDir) === 0 || len(hitDir) === 0) {
    return false;
  }

  return dot(shieldAimDir, hitDir) >= getShieldArcDotThreshold();
};

interface DebrisBurstOptions {
  pieces: number;
  baseSpeed: number;
  speedVariance: number;
  color: string;
}

const createDebrisBurst = (
  tick: number,
  nextEntityId: number,
  source: Pick<EntityBase, "pos" | "vel">,
  options: DebrisBurstOptions,
): CombatSandboxDebris[] => {
  const pieces: CombatSandboxDebris[] = [];

  for (let index = 0; index < options.pieces; index += 1) {
    const angle = (index / options.pieces) * Math.PI * 2 + tick * 0.137;
    const speed =
      options.baseSpeed +
      options.speedVariance * Math.sin(tick * 0.23 + index * 1.91);
    pieces.push({
      id: nextEntityId + pieces.length,
      kind: "debris",
      ownerPlayerId: undefined,
      pos: { x: source.pos.x, y: source.pos.y },
      radius: 5 + ((index % 3) + 1) * 1.2,
      ttlUntilTick: tick + debrisTtlTicks,
      vel: add(source.vel, scale(fromAngle(angle), speed)),
      color: options.color,
    });
  }

  return pieces;
};

const getPlanetImpactNormal = (
  planet: Pick<EntityBase, "pos">,
  source: Pick<EntityBase, "pos" | "vel">,
): Vec2 => {
  const radial = normalize(sub(source.pos, planet.pos));
  if (len(radial) > 0) {
    return radial;
  }

  return normalize(scale(source.vel, -1));
};

const createPlanetImpactBurst = (
  tick: number,
  nextEntityId: number,
  elapsedSec: number,
  planet: Pick<EntityBase, "id" | "pos">,
  source: Pick<EntityBase, "pos" | "vel">,
  color: string,
  absorbedByShield: boolean,
): CombatSandboxImpactBurst => ({
  id: nextEntityId,
  planetId: planet.id,
  absorbedByShield,
  color,
  normal: getPlanetImpactNormal(planet, source),
  startedAtSec: elapsedSec,
  startedAtTick: tick,
  ttlUntilTick: tick + planetImpactTtlTicks,
});

const createRocketLaunchBurst = (
  tick: number,
  elapsedSec: number,
  rocket: CombatSandboxRocket,
): CombatSandboxRocketLaunchBurst => {
  const dir = len(rocket.vel) > 0 ? normalize(rocket.vel) : DEFAULT_AIM_DIR;

  return {
    id: rocket.id,
    ownerId: rocket.ownerId,
    rocketKind: rocket.rocketKind,
    color: rocket.color,
    trailColor: rocket.trailColor,
    origin: { x: rocket.pos.x, y: rocket.pos.y },
    launchPlanetArchetype: rocket.launchPlanetArchetype,
    launchPlanetPos: {
      x: rocket.launchPlanetPos.x,
      y: rocket.launchPlanetPos.y,
    },
    launchPlanetRadius: rocket.launchPlanetRadius,
    dir,
    speed: len(rocket.vel),
    startedAtSec: elapsedSec,
    startedAtTick: tick,
    ttlUntilTick: tick + rocketLaunchBurstTicks(),
  };
};

const normalizePlanetDebuffs = (
  debuffs: PlanetDebuffs,
  tick: number,
): PlanetDebuffs =>
  debuffs.dragUntilTick !== undefined && tick < debuffs.dragUntilTick
    ? {
        dragUntilTick: debuffs.dragUntilTick,
      }
    : EMPTY_PLANET_DEBUFFS;

const EMPTY_PLANET_DEBUFFS: PlanetDebuffs = {};

const killPlanet = (
  planet: CombatSandboxPlanet,
  reason: CombatPlanetDeathReason,
): CombatSandboxPlanet => ({
  ...planet,
  alive: false,
  hp: 0,
  deathReason: reason,
});

const maybeFireRocket = (
  controller: CombatSandboxControllerState,
  planets: readonly CombatSandboxPlanet[],
  tick: number,
  elapsedSec: number,
  nextEntityId: number,
): {
  launchBursts: CombatSandboxRocketLaunchBurst[];
  rockets: CombatSandboxRocket[];
} => {
  const playerPlanet = findPlayerPlanet(planets, controller.planetId);
  if (playerPlanet === null || !playerPlanet.alive) {
    return { launchBursts: [], rockets: [] };
  }

  if (hasActiveShield(controller, tick)) {
    return { launchBursts: [], rockets: [] };
  }

  const rocketKind = controller.selectedRocketKind;
  if (
    controller.ammo[rocketKind] <= 0 ||
    tick < controller.reloadUntilTick[rocketKind]
  ) {
    return { launchBursts: [], rockets: [] };
  }

  if (rocketKind === "seeker") {
    const seekerLockTicks = getSeekerLockTicks();
    const lockStart = controller.seekerLockAcquiredAtTick;
    if (
      seekerLockTicks > 0 &&
      (lockStart === null || tick - lockStart < seekerLockTicks)
    ) {
      return { launchBursts: [], rockets: [] };
    }
    controller.seekerLockAcquiredAtTick = tick;
  }

  const aimDir = normalize(sub(controller.aimWorld, playerPlanet.pos));
  if (len(aimDir) === 0) {
    return { launchBursts: [], rockets: [] };
  }

  const spec = ROCKET_SPECS[rocketKind];
  const visuals = ROCKET_VISUALS[rocketKind];
  const archetypeStats = getArchetypeStats(playerPlanet.archetype);
  const lockTarget =
    rocketKind === "seeker"
      ? findAliveTargetPlanet(planets, controller.planetId, controller.aimWorld)
      : null;

  controller.ammo[rocketKind] -= 1;
  controller.reloadUntilTick[rocketKind] =
    tick + weaponReloadTicks(rocketKind, playerPlanet.archetype);
  if (
    rocketKind === "light" &&
    controller.ammo.light < ROCKET_SPECS.light.maxAmmo &&
    controller.reloadUntilTick.light === 0
  ) {
    controller.reloadUntilTick.light =
      tick + weaponReloadTicks("light", playerPlanet.archetype);
  }
  controller.lockTargetId = lockTarget?.id ?? null;

  const rocket: CombatSandboxRocket = {
    id: nextEntityId,
    kind: "rocket",
    ownerId: playerPlanet.playerId,
    rocketKind,
    targetId: lockTarget?.id,
    ttlUntilTick: tick + rocketTtlTicks(rocketKind),
    pos: add(
      playerPlanet.pos,
      scale(aimDir, playerPlanet.radius + spec.radius + 10),
    ),
    vel: add(playerPlanet.vel, scale(aimDir, spec.speed)),
    radius: spec.radius,
    damage: spec.damage * archetypeStats.rocketDamageMultiplier,
    color: visuals.core,
    trailColor: visuals.trail,
    dragOnHit: archetypeStats.umbraDrag,
    launchPlanetArchetype: playerPlanet.archetype,
    turnRateMultiplier:
      rocketKind === "seeker" ? archetypeStats.seekerTurnRateMultiplier : 1,
    launchPlanetPos: { x: playerPlanet.pos.x, y: playerPlanet.pos.y },
    launchPlanetRadius: playerPlanet.radius,
  };

  return {
    launchBursts: [createRocketLaunchBurst(tick, elapsedSec, rocket)],
    rockets: [rocket],
  };
};

const stepCombatRocket = (
  rocket: CombatSandboxRocket,
  target: Pick<EntityBase, "pos"> | null,
  suns: readonly Sun[],
  blackHole: BlackHole | null,
): CombatSandboxRocket => {
  const turnRateOverride =
    rocket.rocketKind === "seeker"
      ? ROCKET_SPECS.seeker.turnRate * (rocket.turnRateMultiplier ?? 1)
      : 0;
  return stepSeeker(
    rocket,
    target,
    suns,
    FIXED_STEP_SEC,
    blackHole ?? undefined,
    turnRateOverride,
  );
};

const applyPlanetPairCollisions = (
  planets: CombatSandboxPlanet[],
  deathPlanetIds: Set<number>,
) => {
  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;
    if (!planet.alive) {
      continue;
    }

    for (
      let otherIndex = index + 1;
      otherIndex < planets.length;
      otherIndex += 1
    ) {
      const other = planets[otherIndex]!;
      if (!other.alive) {
        continue;
      }

      if (dist(planet.pos, other.pos) <= planet.radius + other.radius) {
        planets[index] = killPlanet(planet, "planetCollision");
        planets[otherIndex] = killPlanet(other, "planetCollision");
        deathPlanetIds.add(planet.id);
        deathPlanetIds.add(other.id);
      }
    }
  }
};

const markEnvironmentalPlanetDeaths = (
  planets: CombatSandboxPlanet[],
  suns: readonly Sun[],
  neutronStars: readonly NeutronStar[],
  blackHole: BlackHole | null,
  deathPlanetIds: Set<number>,
  swallowedPlanets: CombatSandboxPlanet[],
  controllers: ReadonlyMap<string, CombatSandboxControllerState>,
  tick: number,
) => {
  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;
    if (!planet.alive) {
      continue;
    }

    if (isPlanetInsideBlackHole(planet, blackHole)) {
      planets[index] = killPlanet(planet, "blackHole");
      deathPlanetIds.add(planet.id);
      swallowedPlanets.push(planet);
      continue;
    }

    for (const neutronStar of neutronStars) {
      if (dist(planet.pos, neutronStar.pos) <= planet.radius + neutronStar.radius) {
        planets[index] = killPlanet(planet, "neutronStar");
        deathPlanetIds.add(planet.id);
        break;
      }
    }
    if (deathPlanetIds.has(planet.id)) {
      continue;
    }

    const controller = controllers.get(planet.playerId);
    if (len(planet.pos) > ARENA_RADIUS) {
      if (ARENA_BOUNDARY_SPEC.instantDeath) {
        planets[index] = killPlanet(planet, "boundary");
        deathPlanetIds.add(planet.id);
        continue;
      }

      if (controller !== undefined) {
        controller.boundaryEnteredTick ??= tick;
        const outsideSec = (tick - controller.boundaryEnteredTick) / SIM_HZ;
        const dps =
          outsideSec >= ARENA_BOUNDARY_SPEC.rampAfterSec
            ? ARENA_BOUNDARY_SPEC.maxDps
            : ARENA_BOUNDARY_SPEC.baseDps;
        const hpAfter = Math.max(0, planet.hp - dps * FIXED_STEP_SEC);
        if (hpAfter <= 0) {
          planets[index] = killPlanet(planet, "boundary");
          deathPlanetIds.add(planet.id);
          continue;
        }

        planets[index] = {
          ...planet,
          hp: hpAfter,
        };
      }
    } else if (controller !== undefined) {
      controller.boundaryEnteredTick = null;
    }

    for (const sun of suns) {
      if (
        dist(planet.pos, sun.pos) <= planet.radius + sun.radius &&
        !shieldProtectsImpact(planet, controllers, sun.pos, tick)
      ) {
        planets[index] = killPlanet(planet, "sunCollision");
        deathPlanetIds.add(planet.id);
        break;
      }
    }
  }
};

const stepDebris = (
  debris: readonly CombatSandboxDebris[],
  suns: readonly Sun[],
  blackHole: BlackHole | null,
  tick: number,
): CombatSandboxDebris[] => {
  const nextDebris: CombatSandboxDebris[] = [];

  for (const piece of debris) {
    if (piece.ttlUntilTick <= tick) {
      continue;
    }

    nextDebris.push(
      stepBody(piece, suns, FIXED_STEP_SEC, blackHole ?? undefined),
    );
  }

  return nextDebris;
};

const stepImpactBursts = (
  impactBursts: readonly CombatSandboxImpactBurst[],
  tick: number,
): CombatSandboxImpactBurst[] => {
  const nextBursts: CombatSandboxImpactBurst[] = [];

  for (const burst of impactBursts) {
    if (burst.ttlUntilTick > tick) {
      nextBursts.push(burst);
    }
  }

  return nextBursts;
};

const stepLaunchBursts = (
  launchBursts: readonly CombatSandboxRocketLaunchBurst[],
  tick: number,
): CombatSandboxRocketLaunchBurst[] => {
  const nextBursts: CombatSandboxRocketLaunchBurst[] = [];

  for (const burst of launchBursts) {
    if (burst.ttlUntilTick > tick) {
      nextBursts.push(burst);
    }
  }

  return nextBursts;
};

const queueCacheRespawn = (
  cacheRespawnAtTicks: number[],
  readyAtTick: number,
) => {
  cacheRespawnAtTicks.push(readyAtTick);
  cacheRespawnAtTicks.sort((left, right) => left - right);
};

const applyCacheDelivery = (
  controller: CombatSandboxControllerState,
  planets: CombatSandboxPlanet[],
  contents: CacheContents,
) => {
  const playerPlanet = findPlayerPlanet(planets, controller.planetId);
  if (playerPlanet === null) {
    return;
  }

  switch (contents.kind) {
    case "heavyAmmo":
      controller.ammo.heavy += 1;
      break;
    case "seekerPack":
      controller.ammo.seeker += 2;
      break;
    case "repair":
      playerPlanet.hp = Math.min(PLANET_HP, playerPlanet.hp + REPAIR_AMOUNT);
      break;
    case "shieldExt":
      controller.nextShieldExt = true;
      break;
    case "foresightExt":
      controller.nextForesightExt = true;
      controller.foresightActiveUntilTick = 0;
      controller.foresightCooldownUntilTick = 0;
      controller.foresightDurationTicks = getForesightDurationTicks(
        playerPlanet.archetype,
      );
      break;
    case "wildcard":
      if (contents.wildcard.kind === "gravityPulse") {
        controller.gravityPulseHeld = true;
      } else {
        controller.cloakHeld = true;
      }
      break;
  }
};

const applyImpulseAwayFromPoint = <T extends EntityBase>(
  bodies: T[],
  center: Vec2,
  radius: number,
  impulse: number,
  shouldApply: (body: T) => boolean = () => true,
) => {
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index]!;
    if (!shouldApply(body)) {
      continue;
    }

    const delta = sub(body.pos, center);
    const distance = len(delta);
    if (distance === 0 || distance > radius) {
      continue;
    }

    const falloff = 1 - distance / radius;
    bodies[index] = {
      ...body,
      vel: add(body.vel, scale(normalize(delta), impulse * falloff)),
    };
  }
};

const activateWildcard = (
  wildcard: WildcardKind,
  planets: CombatSandboxPlanet[],
  rockets: CombatSandboxRocket[],
  caches: CombatSandboxCache[],
  player: CombatSandboxPlayerState,
  currentTick: number,
): boolean => {
  const playerPlanet = findPlayerPlanet(planets, player.planetId);
  if (playerPlanet === null || !playerPlanet.alive) {
    return false;
  }

  switch (wildcard) {
    case "gravityPulse":
      applyImpulseAwayFromPoint(
        planets,
        playerPlanet.pos,
        GRAVITY_PULSE_RADIUS,
        GRAVITY_PULSE_IMPULSE,
        (planet) => planet.alive,
      );
      applyImpulseAwayFromPoint(
        rockets,
        playerPlanet.pos,
        GRAVITY_PULSE_RADIUS,
        GRAVITY_PULSE_IMPULSE * 1.15,
      );
      applyImpulseAwayFromPoint(
        caches,
        playerPlanet.pos,
        GRAVITY_PULSE_RADIUS,
        GRAVITY_PULSE_IMPULSE * 0.72,
      );
      return true;

    case "cloak":
      playerPlanet.hideTrailUntilTick = currentTick + CLOAK_DURATION_TICKS;
      return true;
  }
};

const createRocketDebris = (
  tick: number,
  nextEntityId: number,
  rocket: CombatSandboxRocket,
): CombatSandboxDebris[] =>
  createDebrisBurst(tick, nextEntityId, rocket, {
    color: rocket.color,
    pieces:
      rocket.rocketKind === "heavy"
        ? ROCKET_DEBRIS_PIECES_HEAVY
        : rocket.rocketKind === "light"
          ? ROCKET_DEBRIS_PIECES_LIGHT
          : ROCKET_DEBRIS_PIECES_SEEKER,
    baseSpeed: ROCKET_DEBRIS_BURST_SPEED,
    speedVariance: ROCKET_DEBRIS_BURST_SPEED_VARIANCE,
  });

const createCacheDebris = (
  tick: number,
  nextEntityId: number,
  cache: CombatSandboxCache,
): CombatSandboxDebris[] =>
  createDebrisBurst(tick, nextEntityId, cache, {
    color: getCacheContentsColor(cache.contents),
    pieces: CACHE_DEBRIS_PIECES,
    baseSpeed: CACHE_DEBRIS_BURST_SPEED,
    speedVariance: CACHE_DEBRIS_BURST_SPEED_VARIANCE,
  });

const applyBotCommand = (
  controller: CombatSandboxControllerState,
  frame: CombatSandboxControllerFrame,
  planets: readonly CombatSandboxPlanet[],
  command: CombatBotCommand,
) => {
  const controlledBody = getControlledBody(planets, controller);

  switch (command.type) {
    case "input":
      setAimWorldFromDirection(controller, controlledBody, command.mouseDir);
      break;

    case "shieldAim": {
      const shieldAimDir = normalize(command.dir);
      if (len(shieldAimDir) > 0) {
        controller.shieldAimDir = shieldAimDir;
      }
      break;
    }

    case "fireRocket": {
      controller.selectedRocketKind = command.kind;
      const targetPlanet =
        command.targetId === undefined
          ? null
          : (findPlayerPlanet(planets, command.targetId) ?? null);
      if (targetPlanet?.alive) {
        controller.aimWorld = {
          x: targetPlanet.pos.x,
          y: targetPlanet.pos.y,
        };
      } else {
        setAimWorldFromDirection(controller, controlledBody, command.aimDir);
      }
      frame.fireRequested = true;
      break;
    }

    case "ability":
      if (command.aimDir !== undefined) {
        setAimWorldFromDirection(controller, controlledBody, command.aimDir);
      }
      if (command.slot === "w" && command.aimDir !== undefined) {
        const shieldAimDir = normalize(command.aimDir);
        if (len(shieldAimDir) > 0) {
          controller.shieldAimDir = shieldAimDir;
        }
      }
      if (command.slot === "q") {
        frame.foresightRequested = true;
      } else if (command.slot === "w") {
        frame.shieldRequested = true;
      } else if (command.slot === "e") {
        frame.boostRequested = true;
      } else if (command.slot === "g") {
        frame.gravityPulseRequested = true;
      } else if (command.slot === "c") {
        frame.cloakRequested = true;
      }
      break;
  }
};

const syncControllersToPlanets = (
  planets: CombatSandboxPlanet[],
  controllers: ReadonlyMap<string, CombatSandboxControllerState>,
) => {
  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;
    const controller = controllers.get(planet.playerId);
    if (controller === undefined) {
      continue;
    }

    planets[index] = {
      ...planet,
      shieldAimDir: {
        x: controller.shieldAimDir.x,
        y: controller.shieldAimDir.y,
      },
      shieldActive: controller.shieldActive,
      shieldLoad: controller.shieldLoad,
      shieldMaxLoad: controller.shieldMaxLoad,
    };
  }
};

export const createSandboxState = (
  preset: OrbitPreset = DEFAULT_ORBIT_PRESET,
  options: CreateSandboxStateOptions = {},
): CombatSandboxState => {
  const resolvedPreset = resolveRuntimeOrbitPreset(preset);
  const playerBehavior = options.playerBehavior === "bot" ? "bot" : "human";
  const participantCount = getSandboxParticipantCount(
    options.participantCount,
    resolvedPreset.planets.length,
  );
  const planetSeeds = resolvedPreset.planets.slice(0, participantCount);
  const playerPlanetIndex = Math.min(
    PLAYER_PLANET_INDEX,
    Math.max(planetSeeds.length - 1, 0),
  );
  const playerPlanetId = planetSeeds[playerPlanetIndex]!.id;
  const botDifficulty = options.botDifficulty ?? LOCAL_BOT_DIFFICULTY;
  const normalizedPlayerName = options.playerName?.trim();
  let nextBotDisplayNameIndex = 0;
  const nextBotDisplayName = () =>
    LOCAL_BOT_DISPLAY_NAMES[
      nextBotDisplayNameIndex++ % LOCAL_BOT_DISPLAY_NAMES.length
    ]!;
  const playerDisplayName =
    playerBehavior === "bot"
      ? nextBotDisplayName()
      : normalizedPlayerName && normalizedPlayerName.length > 0
        ? normalizedPlayerName
        : DEFAULT_LOCAL_PLAYER_DISPLAY_NAME;
  const planets = planetSeeds.map((planetSeed, index) => {
    const displayName =
      planetSeed.id === playerPlanetId ? playerDisplayName : nextBotDisplayName();

    return clonePlanetSeed(planetSeed, index, playerPlanetId, displayName);
  });
  const player = createControllerState(planets[playerPlanetIndex]!);
  const playerBot =
    playerBehavior === "bot"
      ? {
          difficulty: botDifficulty,
          memory: createCombatBotMemory(),
        }
      : null;
  const bots =
    options.botsEnabled === false
      ? []
      : planets
          .filter((planet) => planet.id !== playerPlanetId)
          .map(
            (planet): CombatSandboxBotState => ({
              ...createControllerState(planet),
              difficulty: botDifficulty,
              memory: createCombatBotMemory(),
            }),
          );
  const rng = createSandboxRng(resolvedPreset);
  let nextEntityId = nextRocketIdBase;
  const neutronStars = createNeutronStars({
    arenaRadius: ARENA_RADIUS,
    blockedBodies: [
      ...resolvedPreset.suns.map((sun) => ({
        pos: sun.pos,
        radius: sun.radius,
      })),
      ...planets.map((planet) => ({
        pos: planet.pos,
        radius: planet.radius,
      })),
    ],
    createId: () => nextEntityId++,
    rng,
    spec: NEUTRON_STAR_SPEC,
  });
  const initialCaches = createInitialCaches(rng, nextEntityId);
  const controllerByPlayerId = new Map<string, CombatSandboxControllerState>([
    [player.playerId, player],
    ...bots.map((bot) => [bot.playerId, bot] as const),
  ]);
  syncControllersToPlanets(planets, controllerByPlayerId);

  return {
    tick: 0,
    elapsedSec: 0,
    preset: resolvedPreset,
    suns: resolvedPreset.suns.map((sunSeed) => ({
      id: sunSeed.id,
      kind: "sun",
      mass: sunSeed.mass,
      radius: sunSeed.radius,
      pos: { x: sunSeed.pos.x, y: sunSeed.pos.y },
      vel: { x: sunSeed.vel.x, y: sunSeed.vel.y },
      swallowedAtSec: null,
    })),
    neutronStars,
    planets,
    rockets: [],
    caches: initialCaches.caches,
    cacheRespawnAtTicks: [],
    debris: [],
    impactBursts: [],
    launchBursts: [],
    blackHole: null,
    player,
    playerBot,
    playerLossResetsEnabled: playerBot === null,
    bots,
    nextEntityId: initialCaches.nextEntityId,
    playerLostAtSec: null,
    rng,
  };
};

export const stepSandbox = (
  state: CombatSandboxState,
  input: CombatSandboxStepInput,
  blackHoleSpec: BlackHoleSpec,
  options: CombatSandboxSimulationOptions = {},
): CombatSandboxState => {
  let blackHole = syncBlackHole(
    state.blackHole,
    state.elapsedSec,
    blackHoleSpec,
  );
  const nextTick = state.tick + 1;
  const nextElapsedSec = state.elapsedSec + FIXED_STEP_SEC;
  const getPlanetImpactRadiusMultiplier = (
    _planet: Pick<CombatSandboxPlanet, "archetype">,
  ): number =>
    options.planetImpactRadiusMultiplier ??
    DEFAULT_ROCKET_PLANET_IMPACT_RADIUS_MULTIPLIER;
  const player =
    state.playerBot === null
      ? cloneControllerState({
          ...state.player,
          aimWorld: { x: input.aimWorld.x, y: input.aimWorld.y },
          selectedRocketKind: input.selectedRocketKind,
        })
      : cloneControllerState(state.player);
  const playerBot =
    state.playerBot === null ? null : clonePlayerBotState(state.playerBot);
  const bots = state.bots.map(cloneBotState);
  const controllers: CombatSandboxControllerState[] = [player, ...bots];
  const controllerByPlayerId = new Map<string, CombatSandboxControllerState>(
    controllers.map((controller) => [controller.playerId, controller]),
  );
  const frameByPlayerId = new Map<string, CombatSandboxControllerFrame>([
    [
      player.playerId,
      playerBot === null
        ? {
            ...createControllerFrame(),
            fireRequested: input.fireRequested,
            foresightRequested: input.foresightRequested,
            shieldRequested: input.shieldRequested,
            boostRequested: input.boostRequested,
            gravityPulseRequested: input.gravityPulseRequested,
            cloakRequested: input.cloakRequested,
          }
        : createControllerFrame(),
    ],
    ...bots.map((bot) => [bot.playerId, createControllerFrame()] as const),
  ]);

  let planets = state.planets.map(clonePlanet);
  let rockets = state.rockets.map(cloneRocket);
  let caches = state.caches.map(cloneCache);
  const cacheRespawnAtTicks = [...state.cacheRespawnAtTicks];
  let nextEntityId = state.nextEntityId;

  for (const controller of controllers) {
    const archetypeId = getPlayerArchetypeId(planets, controller.planetId);
    refreshBoostCharges(
      controller,
      state.tick,
      getBoostChargeCapacity(archetypeId),
    );
    refreshForesightState(controller, archetypeId, state.tick);
    refreshShieldLoad(controller);
  }

  const botWorld = createCombatBotWorld({
    blackHole,
    caches,
    debris: state.debris,
    neutronStars: state.neutronStars,
    planets,
    rockets,
    suns: state.suns,
  });
  const runBotControllerStep = ({
    controller,
    difficulty,
    frame,
    memory,
  }: {
    controller: CombatSandboxControllerState;
    difficulty: BotDifficulty;
    frame: CombatSandboxControllerFrame;
    memory: CombatBotMemory;
  }) => {
    const self = findPlayerPlanet(planets, controller.planetId);
    if (self === null || !self.alive) {
      return;
    }

    const runtime: CombatBotRuntime = {};
    const commands = decideCombatBot(
      {
        difficulty,
        tick: state.tick,
        tickHz: SIM_HZ,
        world: botWorld,
        self,
        privateState: toBotPrivateState(controller),
        runtime,
      },
      memory,
    );
    for (const command of commands) {
      applyBotCommand(controller, frame, planets, command);
    }
  };
  if (playerBot !== null) {
    runBotControllerStep({
      controller: player,
      difficulty: playerBot.difficulty,
      frame: frameByPlayerId.get(player.playerId)!,
      memory: playerBot.memory,
    });
  }
  for (const bot of bots) {
    runBotControllerStep({
      controller: bot,
      difficulty: bot.difficulty,
      frame: frameByPlayerId.get(bot.playerId)!,
      memory: bot.memory,
    });
  }

  syncControllersToPlanets(planets, controllerByPlayerId);
  const debrisBursts: CombatSandboxDebris[] = [];
  const impactBursts = stepImpactBursts(state.impactBursts, nextTick);
  const launchBursts = stepLaunchBursts(state.launchBursts, nextTick);

  const boostAimByPlayerId = new Map<string, Vec2>();
  for (const controller of controllers) {
    const frame = frameByPlayerId.get(controller.playerId)!;
    const planetBeforeStep = findPlayerPlanet(planets, controller.planetId);
    const archetypeId =
      planetBeforeStep?.archetype ??
      getPlayerArchetypeId(planets, controller.planetId);
    const archetype = getArchetypeStats(archetypeId);
    const maxBoostCharges = getBoostChargeCapacity(archetypeId);
    const currentAimDir = aimDirFromWorldTarget(
      planetBeforeStep,
      controller.aimWorld,
      controller.shieldAimDir,
    );

    if (
      frame.foresightRequested &&
      planetBeforeStep?.alive
    ) {
      const storedDurationTicks =
        state.tick >= controller.foresightActiveUntilTick &&
        state.tick >= controller.foresightCooldownUntilTick
          ? getForesightDurationTicks(archetypeId)
          : Math.max(1, controller.foresightDurationTicks);
      if (state.tick < controller.foresightActiveUntilTick) {
        const remainingTicks = Math.max(
          0,
          controller.foresightActiveUntilTick - state.tick,
        );
        const rechargeTicks = getForesightRechargeTicks(storedDurationTicks);
        const missingFraction =
          storedDurationTicks > 0
            ? Math.max(0, 1 - remainingTicks / storedDurationTicks)
            : 1;
        controller.foresightActiveUntilTick = state.tick;
        controller.foresightCooldownUntilTick =
          state.tick + Math.round(missingFraction * rechargeTicks);
      } else {
        const activationDurationTicks = Math.max(
          storedDurationTicks,
          getForesightDurationTicks(archetypeId, controller.nextForesightExt),
        );
        let availableTicks =
          state.tick < controller.foresightCooldownUntilTick
            ? getForesightChargeTicks({
                currentTick: state.tick,
                cooldownUntilTick: controller.foresightCooldownUntilTick,
                durationTicks: storedDurationTicks,
              })
            : storedDurationTicks;
        if (activationDurationTicks > storedDurationTicks) {
          availableTicks = Math.min(
            activationDurationTicks,
            availableTicks + (activationDurationTicks - storedDurationTicks),
          );
        }
        if (availableTicks <= 0) {
          continue;
        }

        const activeTicks = Math.max(1, Math.round(availableTicks));
        controller.foresightDurationTicks = activationDurationTicks;
        controller.foresightActiveUntilTick = state.tick + activeTicks;
        controller.foresightCooldownUntilTick =
          controller.foresightActiveUntilTick +
          getForesightRechargeTicks(activationDurationTicks);
        controller.nextForesightExt = false;
      }
    }

    if (
      frame.shieldRequested &&
      planetBeforeStep?.alive
    ) {
      if (hasActiveShield(controller, state.tick)) {
        controller.shieldActive = false;
      } else if (controller.shieldLoad > 0) {
        const activatedMaxLoad = controller.nextShieldExt
          ? controller.shieldMaxLoad * SHIELD_EXT_MULTIPLIER
          : controller.shieldMaxLoad;
        controller.shieldLoad = controller.nextShieldExt
          ? Math.min(
              activatedMaxLoad,
              controller.shieldLoad +
                (activatedMaxLoad - controller.shieldMaxLoad),
            )
          : Math.min(controller.shieldLoad, activatedMaxLoad);
        controller.shieldMaxLoad = activatedMaxLoad;
        controller.shieldActive = controller.shieldLoad > 0;
        controller.shieldAimDir = currentAimDir;
        controller.nextShieldExt = false;
      }
    }

    if (
      frame.gravityPulseRequested &&
      planetBeforeStep?.alive &&
      controller.gravityPulseHeld
    ) {
      const consumed = activateWildcard(
        "gravityPulse",
        planets,
        rockets,
        caches,
        controller,
        state.tick,
      );
      if (consumed) {
        controller.gravityPulseHeld = false;
      }
    }

    if (
      frame.cloakRequested &&
      planetBeforeStep?.alive &&
      controller.cloakHeld
    ) {
      const consumed = activateWildcard(
        "cloak",
        planets,
        rockets,
        caches,
        controller,
        state.tick,
      );
      if (consumed) {
        controller.cloakHeld = false;
      }
    }

    const boostRequested =
      frame.boostRequested &&
      planetBeforeStep?.alive &&
      controller.boostCharges > 0 &&
      len(currentAimDir) > 0;
    if (boostRequested) {
      controller.boostCharges -= 1;
      controller.lastBoostTick = nextTick;
      controller.lastBoostAimDir = currentAimDir;
      boostAimByPlayerId.set(controller.playerId, currentAimDir);
      if (
        controller.boostCharges < maxBoostCharges &&
        controller.nextBoostChargeAtTick === null
      ) {
        controller.nextBoostChargeAtTick = state.tick + getBoostRechargeTicks();
      }
    }
  }

  syncControllersToPlanets(planets, controllerByPlayerId);
  const spawnedLaunchBursts: CombatSandboxRocketLaunchBurst[] = [];
  const spawnedRockets: CombatSandboxRocket[] = [];
  for (const controller of controllers) {
    const frame = frameByPlayerId.get(controller.playerId)!;
    if (!frame.fireRequested) {
      continue;
    }

    const fired = maybeFireRocket(
      controller,
      planets,
      nextTick,
      state.elapsedSec,
      nextEntityId,
    );
    nextEntityId += fired.rockets.length;
    spawnedLaunchBursts.push(...fired.launchBursts);
    spawnedRockets.push(...fired.rockets);
  }
  if (spawnedRockets.length > 0) {
    rockets.push(...spawnedRockets);
  }
  if (spawnedLaunchBursts.length > 0) {
    launchBursts.push(...spawnedLaunchBursts);
  }

  const suns = stepCombatSuns(state.suns, blackHole, nextElapsedSec);
  const swallowedSuns =
    blackHole === null
      ? []
      : state.suns.filter(
          (sun, index) => !isSunSwallowed(sun) && isSunSwallowed(suns[index]!),
        );
  if (blackHole !== null && swallowedSuns.length > 0) {
    blackHole = consumeBlackHoleBodies(blackHole, swallowedSuns);
  }
  const activeSuns = getActiveCombatSuns(suns);
  const steppedPlanets: CombatSandboxPlanet[] = new Array(planets.length);
  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;
    if (!planet.alive) {
      steppedPlanets[index] = planet;
      continue;
    }

    const controller = controllerByPlayerId.get(planet.playerId);
    const debuffs = normalizePlanetDebuffs(planet.debuffs, state.tick);
    const boostAimDir = boostAimByPlayerId.get(planet.playerId) ?? null;
    const boostedPlanet =
      boostAimDir !== null && controller !== undefined
        ? {
            ...planet,
            debuffs,
            shieldAimDir: {
              x: controller.shieldAimDir.x,
              y: controller.shieldAimDir.y,
            },
            shieldActive: controller.shieldActive,
            shieldLoad: controller.shieldLoad,
            shieldMaxLoad: controller.shieldMaxLoad,
            vel: add(
              planet.vel,
              scale(
                boostAimDir,
                BOOST_SPEC.magnitude *
                  getArchetypeStats(planet.archetype).boostMagnitudeMultiplier,
              ),
            ),
          }
        : {
            ...planet,
            debuffs,
            shieldAimDir:
              controller === undefined
                ? planet.shieldAimDir
                : {
                    x: controller.shieldAimDir.x,
                    y: controller.shieldAimDir.y,
                  },
            shieldActive: controller?.shieldActive ?? planet.shieldActive,
            shieldLoad: controller?.shieldLoad ?? planet.shieldLoad,
            shieldMaxLoad: controller?.shieldMaxLoad ?? planet.shieldMaxLoad,
          };
    const dragActive = debuffs.dragUntilTick !== undefined;
    const steppedPlanet = stepBody(
      boostedPlanet,
      activeSuns,
      FIXED_STEP_SEC,
      blackHole ?? undefined,
      state.neutronStars,
    );

    const nextPlanet = dragActive
      ? {
          ...steppedPlanet,
          vel: scale(steppedPlanet.vel, UMBRA_DRAG_STEP_MULTIPLIER),
        }
      : steppedPlanet;
    if (controller !== undefined) {
      controller.shieldAimDir = aimDirFromWorldTarget(
        nextPlanet,
        controller.aimWorld,
        controller.shieldAimDir,
      );
      nextPlanet.shieldAimDir = {
        x: controller.shieldAimDir.x,
        y: controller.shieldAimDir.y,
      };
      nextPlanet.shieldActive = controller.shieldActive;
      nextPlanet.shieldLoad = controller.shieldLoad;
      nextPlanet.shieldMaxLoad = controller.shieldMaxLoad;
    }

    steppedPlanets[index] = nextPlanet;
  }
  planets = steppedPlanets;
  const deathPlanetIds = new Set<number>();
  const swallowedPlanets: CombatSandboxPlanet[] = [];
  markEnvironmentalPlanetDeaths(
    planets,
    activeSuns,
    state.neutronStars,
    blackHole,
    deathPlanetIds,
    swallowedPlanets,
    controllerByPlayerId,
    nextTick,
  );
  applyPlanetPairCollisions(planets, deathPlanetIds);
  if (blackHole !== null && swallowedPlanets.length > 0) {
    blackHole = consumeBlackHoleBodies(blackHole, swallowedPlanets);
  }

  for (const controller of controllers) {
    const nextLockTargetId =
      findAliveTargetPlanet(
        planets,
        controller.planetId,
        controller.aimWorld,
      )?.id ?? null;
    if (nextLockTargetId === null) {
      controller.seekerLockAcquiredAtTick = null;
    } else if (controller.lockTargetId !== nextLockTargetId) {
      controller.seekerLockAcquiredAtTick = nextTick;
    }
    controller.lockTargetId = nextLockTargetId;

    const archetypeId = getPlayerArchetypeId(planets, controller.planetId);
    addLightAmmoCharge(
      controller.ammo,
      controller.reloadUntilTick,
      nextTick,
      archetypeId,
    );
    if (controller.reloadUntilTick.heavy <= nextTick) {
      controller.reloadUntilTick.heavy = 0;
    }
    if (controller.reloadUntilTick.seeker <= nextTick) {
      controller.reloadUntilTick.seeker = 0;
    }
    if (
      controller.ammo.light >= ROCKET_SPECS.light.maxAmmo &&
      controller.reloadUntilTick.light <= nextTick
    ) {
      controller.reloadUntilTick.light = 0;
    }
  }

  const alivePlanetsById = new Map<number, CombatSandboxPlanet>();
  for (const planet of planets) {
    if (!planet.alive) {
      continue;
    }

    alivePlanetsById.set(planet.id, planet);
  }

  const steppedRockets: CombatSandboxRocket[] = [];
  const expiredRockets: CombatSandboxRocket[] = [];
  for (const rocket of rockets) {
    if (rocket.ttlUntilTick <= nextTick) {
      expiredRockets.push(rocket);
      continue;
    }

    const target =
      rocket.targetId === undefined
        ? null
        : (alivePlanetsById.get(rocket.targetId) ?? null);
    steppedRockets.push(
      stepCombatRocket(rocket, target, activeSuns, blackHole),
    );
  }
  rockets = steppedRockets;

  const steppedCaches: CombatSandboxCache[] = new Array(caches.length);
  for (let index = 0; index < caches.length; index += 1) {
    steppedCaches[index] = stepBodyWithGravityScale(
      caches[index]!,
      activeSuns,
      FIXED_STEP_SEC,
      CACHE_GRAVITY_SCALE,
      blackHole ?? undefined,
    );
  }
  caches = steppedCaches;

  const survivingRockets: CombatSandboxRocket[] = [];
  const destroyedRocketIds = new Set<number>();
  const destroyedCacheIds = new Set<number>();
  const emitRocketImpact = (rocket: CombatSandboxRocket) => {
    const burst = createRocketDebris(nextTick, nextEntityId, rocket);
    debrisBursts.push(...burst);
    nextEntityId += burst.length;
  };
  const emitPlanetImpact = (
    planet: CombatSandboxPlanet,
    rocket: CombatSandboxRocket,
    absorbedByShield: boolean,
  ) => {
    impactBursts.push(
      createPlanetImpactBurst(
        nextTick,
        nextEntityId,
        nextElapsedSec,
        planet,
        rocket,
        rocket.color,
        absorbedByShield,
      ),
    );
    nextEntityId += 1;
  };

  for (const rocket of expiredRockets) {
    emitRocketImpact(rocket);
  }

  for (let index = 0; index < rockets.length; index += 1) {
    const rocket = rockets[index]!;
    if (destroyedRocketIds.has(rocket.id)) {
      continue;
    }

    for (
      let otherIndex = index + 1;
      otherIndex < rockets.length;
      otherIndex += 1
    ) {
      const other = rockets[otherIndex]!;
      if (destroyedRocketIds.has(other.id)) {
        continue;
      }

      if (dist(rocket.pos, other.pos) <= rocket.radius + other.radius) {
        destroyedRocketIds.add(rocket.id);
        destroyedRocketIds.add(other.id);
      }
    }
  }

  for (const rocket of rockets) {
    if (destroyedRocketIds.has(rocket.id)) {
      emitRocketImpact(rocket);
      continue;
    }

    if (rocket.ttlUntilTick <= 0) {
      continue;
    }

    if (isEntityInsideBlackHole(rocket, blackHole)) {
      emitRocketImpact(rocket);
      continue;
    }

    let consumed = false;

    for (const neutronStar of state.neutronStars) {
      if (dist(rocket.pos, neutronStar.pos) <= rocket.radius + neutronStar.radius) {
        emitRocketImpact(rocket);
        consumed = true;
        break;
      }
    }
    if (consumed) {
      continue;
    }

    if (isEntityTouchingArenaBoundary(rocket, ARENA_RADIUS)) {
      emitRocketImpact(rocket);
      continue;
    }

    for (const sun of activeSuns) {
      if (dist(rocket.pos, sun.pos) <= rocket.radius + sun.radius) {
        emitRocketImpact(rocket);
        consumed = true;
        break;
      }
    }
    if (consumed) {
      continue;
    }

    for (const cache of caches) {
      if (destroyedCacheIds.has(cache.id)) {
        continue;
      }

      if (dist(rocket.pos, cache.pos) <= rocket.radius + cache.radius) {
        emitRocketImpact(rocket);
        destroyedCacheIds.add(cache.id);
        consumed = true;
        break;
      }
    }
    if (consumed) {
      continue;
    }

    for (let index = 0; index < planets.length; index += 1) {
      const planet = planets[index]!;
      if (!planet.alive) {
        continue;
      }

      const absorbedByShield = shieldProtectsImpact(
        planet,
        controllerByPlayerId,
        rocket.pos,
        nextTick,
      );
      const planetImpactRadiusMultiplier =
        getPlanetImpactRadiusMultiplier(planet);
      const impactRadius =
        planet.radius *
        planetImpactRadiusMultiplier *
        (absorbedByShield ? SHIELD_OUTER_SCALE : 1);
      if (dist(rocket.pos, planet.pos) <= rocket.radius + impactRadius) {
        emitPlanetImpact(planet, rocket, absorbedByShield);
        if (absorbedByShield) {
          const controller = controllerByPlayerId.get(planet.playerId);
          if (controller !== undefined) {
            planets[index] = applyShieldDamageToPlanet(
              planet,
              controller,
              rocket.damage,
            );
          }
          emitRocketImpact(rocket);
          consumed = true;
          break;
        }

        emitRocketImpact(rocket);
        const hp = planet.hp - rocket.damage;
        const dragUntilTick = rocket.dragOnHit
          ? Math.max(
              planet.debuffs.dragUntilTick ?? 0,
              nextTick + UMBRA_DRAG_DURATION_TICKS,
            )
          : planet.debuffs.dragUntilTick;
        planets[index] =
          hp <= 0
            ? killPlanet(
                {
                  ...planet,
                  hp,
                },
                "rocket",
              )
            : {
                ...planet,
                debuffs:
                  dragUntilTick === undefined
                    ? planet.debuffs
                    : {
                        ...planet.debuffs,
                        dragUntilTick,
                      },
                hp,
              };

        if (hp <= 0) {
          deathPlanetIds.add(planet.id);
        }

        consumed = true;
        break;
      }
    }

    if (!consumed) {
      survivingRockets.push(rocket);
    }
  }
  rockets = survivingRockets;

  if (destroyedCacheIds.size > 0) {
    const survivingCaches: CombatSandboxCache[] = [];

    for (const cache of caches) {
      if (!destroyedCacheIds.has(cache.id)) {
        survivingCaches.push(cache);
        continue;
      }

      debrisBursts.push(...createCacheDebris(nextTick, nextEntityId, cache));
      nextEntityId += CACHE_DEBRIS_PIECES;
      queueCacheRespawn(cacheRespawnAtTicks, nextTick + CACHE_RESPAWN_TICKS);
    }

    caches = survivingCaches;
  }

  const remainingCaches: CombatSandboxCache[] = [];

  for (const cache of caches) {
    if (isEntityInsideBlackHole(cache, blackHole)) {
      debrisBursts.push(...createCacheDebris(nextTick, nextEntityId, cache));
      nextEntityId += CACHE_DEBRIS_PIECES;
      queueCacheRespawn(cacheRespawnAtTicks, nextTick + CACHE_RESPAWN_TICKS);
      continue;
    }

    let destroyed = false;
    let pickedUpByPlanet = false;

    for (const sun of activeSuns) {
      if (dist(cache.pos, sun.pos) <= cache.radius + sun.radius) {
        destroyed = true;
        break;
      }
    }
    if (!destroyed) {
      for (const planet of planets) {
        if (
          planet.alive &&
          dist(cache.pos, planet.pos) <= cache.radius + planet.radius
        ) {
          pickedUpByPlanet = true;
          const controller = controllerByPlayerId.get(planet.playerId);
          if (controller !== undefined) {
            applyCacheDelivery(controller, planets, cache.contents);
          }
          queueCacheRespawn(
            cacheRespawnAtTicks,
            nextTick + CACHE_RESPAWN_TICKS,
          );
          break;
        }
      }
    }

    if (pickedUpByPlanet) {
      continue;
    }

    if (destroyed) {
      debrisBursts.push(...createCacheDebris(nextTick, nextEntityId, cache));
      nextEntityId += CACHE_DEBRIS_PIECES;
      queueCacheRespawn(cacheRespawnAtTicks, nextTick + CACHE_RESPAWN_TICKS);
      continue;
    }

    remainingCaches.push(cache);
  }
  caches = remainingCaches;

  while (
    cacheRespawnAtTicks.length > 0 &&
    cacheRespawnAtTicks[0]! <= nextTick &&
    caches.length < CACHE_SPEC.count
  ) {
    cacheRespawnAtTicks.shift();
    caches.push(createOuterRingCache(state.rng, nextEntityId));
    nextEntityId += 1;
  }

  for (const planet of planets) {
    if (!deathPlanetIds.has(planet.id)) {
      continue;
    }

    const burst = createDebrisBurst(nextTick, nextEntityId, planet, {
      color: planet.color,
      pieces: DEBRIS_PIECES,
      baseSpeed: DEBRIS_BURST_SPEED,
      speedVariance: DEBRIS_BURST_SPEED_VARIANCE,
    });
    debrisBursts.push(...burst);
    nextEntityId += burst.length;
  }

  const debris = [
    ...stepDebris(state.debris, activeSuns, blackHole, nextTick),
    ...debrisBursts,
  ];
  syncControllersToPlanets(planets, controllerByPlayerId);
  const nextPlayerPlanet = findPlayerPlanet(planets, player.planetId);

  const playerLostAtSec =
    state.playerLossResetsEnabled &&
    (nextPlayerPlanet === null || !nextPlayerPlanet.alive)
      ? (state.playerLostAtSec ?? nextElapsedSec)
      : null;

  return {
    tick: nextTick,
    elapsedSec: nextElapsedSec,
    preset: state.preset,
    suns,
    neutronStars: state.neutronStars,
    planets,
    rockets,
    caches,
    cacheRespawnAtTicks,
    debris,
    impactBursts,
    launchBursts,
    blackHole,
    player,
    playerBot,
    playerLossResetsEnabled: state.playerLossResetsEnabled,
    bots,
    nextEntityId,
    playerLostAtSec,
    rng: state.rng,
  };
};

export const getSandboxResetReason = (
  state: CombatSandboxState,
): CombatResetReason | null => {
  const alivePlanets = state.planets.filter((planet) => planet.alive).length;
  if (alivePlanets === 0) {
    return "allPlanetsLost";
  }

  if (
    state.playerLossResetsEnabled &&
    state.playerLostAtSec !== null &&
    state.elapsedSec - state.playerLostAtSec >= PLAYER_LOST_RESET_DELAY_SEC
  ) {
    return "playerLost";
  }

  return null;
};

export const createSandboxInterpolationCache =
  (): CombatSandboxInterpolationCache => ({
    previousRocketMap: new Map<number, CombatSandboxRocket>(),
    previousCacheMap: new Map<number, CombatSandboxCache>(),
    previousDebrisMap: new Map<number, CombatSandboxDebris>(),
  });

export const createInterpolatedSandboxState = (
  state: CombatSandboxState,
): CombatSandboxState => ({
  ...state,
  player: cloneControllerState(state.player),
  playerBot: state.playerBot === null ? null : clonePlayerBotState(state.playerBot),
  bots: state.bots.map(cloneBotState),
  suns: state.suns.map(cloneSun),
  neutronStars: state.neutronStars.map((star) => ({
    ...star,
    pos: { ...star.pos },
    vel: { ...star.vel },
  })),
  planets: state.planets.map(clonePlanet),
  rockets: state.rockets.map(cloneRocket),
  caches: state.caches.map(cloneCache),
  debris: state.debris.map(cloneDebris),
});

const fillEntityMap = <T extends { id: number }>(
  targetMap: Map<number, T>,
  entities: readonly T[],
) => {
  targetMap.clear();

  for (const entity of entities) {
    targetMap.set(entity.id, entity);
  }
};

const syncLerpedVec2 = (
  target: Vec2,
  previous: Vec2 | undefined,
  current: Vec2,
  alpha: number,
) => {
  if (previous === undefined) {
    target.x = current.x;
    target.y = current.y;
    return;
  }

  target.x = lerp(previous.x, current.x, alpha);
  target.y = lerp(previous.y, current.y, alpha);
};

const syncSunInto = (
  target: CombatSandboxSun,
  previous: CombatSandboxSun,
  current: CombatSandboxSun,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.mass = current.mass;
  target.radius = current.radius;
  target.swallowedAtSec = current.swallowedAtSec;
  syncLerpedVec2(target.pos, previous.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous.vel, current.vel, alpha);
};

const syncPlanetInto = (
  target: CombatSandboxPlanet,
  previous: CombatSandboxPlanet,
  current: CombatSandboxPlanet,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.displayName = current.displayName;
  target.label = current.label;
  target.color = current.color;
  target.trailColor = current.trailColor;
  target.risk = current.risk;
  target.archetype = current.archetype;
  target.playerId = current.playerId;
  target.alive = current.alive;
  target.hp = current.hp;
  target.radius = current.radius;
  target.deathReason = current.deathReason;
  target.shieldAimDir = {
    x: current.shieldAimDir.x,
    y: current.shieldAimDir.y,
  };
  target.shieldActive = current.shieldActive;
  target.shieldLoad = current.shieldLoad;
  target.shieldMaxLoad = current.shieldMaxLoad;
  target.hideTrailUntilTick = current.hideTrailUntilTick;
  target.debuffs = current.debuffs;
  syncLerpedVec2(
    target.pos,
    previous.alive && current.alive ? previous.pos : undefined,
    current.pos,
    alpha,
  );
  syncLerpedVec2(
    target.vel,
    previous.alive && current.alive ? previous.vel : undefined,
    current.vel,
    alpha,
  );
};

const syncRocketInto = (
  target: CombatSandboxRocket,
  previous: CombatSandboxRocket | undefined,
  current: CombatSandboxRocket,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.ownerId = current.ownerId;
  target.rocketKind = current.rocketKind;
  target.targetId = current.targetId;
  target.ttlUntilTick = current.ttlUntilTick;
  target.radius = current.radius;
  target.damage = current.damage;
  target.color = current.color;
  target.trailColor = current.trailColor;
  target.dragOnHit = current.dragOnHit;
  target.launchPlanetArchetype = current.launchPlanetArchetype;
  target.turnRateMultiplier = current.turnRateMultiplier;
  target.launchPlanetPos.x = current.launchPlanetPos.x;
  target.launchPlanetPos.y = current.launchPlanetPos.y;
  target.launchPlanetRadius = current.launchPlanetRadius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncCacheInto = (
  target: CombatSandboxCache,
  previous: CombatSandboxCache | undefined,
  current: CombatSandboxCache,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.contents = current.contents;
  target.radius = current.radius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncDebrisInto = (
  target: CombatSandboxDebris,
  previous: CombatSandboxDebris | undefined,
  current: CombatSandboxDebris,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.ownerPlayerId = current.ownerPlayerId;
  target.radius = current.radius;
  target.ttlUntilTick = current.ttlUntilTick;
  target.color = current.color;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncInterpolatedEntityArray = <T extends { id: number }>(
  targetEntities: T[],
  currentEntities: readonly T[],
  getPrevious: (id: number) => T | undefined,
  cloneEntity: (entity: T) => T,
  syncEntity: (
    target: T,
    previous: T | undefined,
    current: T,
    alpha: number,
  ) => void,
  alpha: number,
) => {
  for (let index = 0; index < currentEntities.length; index += 1) {
    const currentEntity = currentEntities[index]!;
    let targetEntity = targetEntities[index];

    if (targetEntity === undefined || targetEntity.id !== currentEntity.id) {
      targetEntity = cloneEntity(currentEntity);
      targetEntities[index] = targetEntity;
    }

    syncEntity(
      targetEntity,
      getPrevious(currentEntity.id),
      currentEntity,
      alpha,
    );
  }

  targetEntities.length = currentEntities.length;
};

export const syncInterpolatedSandboxState = (
  targetState: CombatSandboxState,
  cache: CombatSandboxInterpolationCache,
  previousState: CombatSandboxState,
  currentState: CombatSandboxState,
  alpha: number,
): CombatSandboxState => {
  fillEntityMap(cache.previousRocketMap, previousState.rockets);
  fillEntityMap(cache.previousCacheMap, previousState.caches);
  fillEntityMap(cache.previousDebrisMap, previousState.debris);

  targetState.tick = currentState.tick;
  targetState.elapsedSec = lerp(
    previousState.elapsedSec,
    currentState.elapsedSec,
    alpha,
  );
  targetState.preset = currentState.preset;
  targetState.neutronStars = currentState.neutronStars.map((star) => ({
    ...star,
    pos: { ...star.pos },
    vel: { ...star.vel },
  }));
  targetState.cacheRespawnAtTicks = currentState.cacheRespawnAtTicks;
  targetState.impactBursts = currentState.impactBursts;
  targetState.launchBursts = currentState.launchBursts;
  targetState.blackHole = currentState.blackHole;
  targetState.player = currentState.player;
  targetState.playerBot = currentState.playerBot;
  targetState.playerLossResetsEnabled = currentState.playerLossResetsEnabled;
  targetState.bots = currentState.bots;
  targetState.nextEntityId = currentState.nextEntityId;
  targetState.playerLostAtSec = currentState.playerLostAtSec;
  targetState.rng = currentState.rng;

  for (let index = 0; index < currentState.suns.length; index += 1) {
    const currentSun = currentState.suns[index]!;
    let targetSun = targetState.suns[index];

    if (targetSun === undefined || targetSun.id !== currentSun.id) {
      targetSun = cloneSun(currentSun);
      targetState.suns[index] = targetSun;
    }

    syncSunInto(targetSun, previousState.suns[index]!, currentSun, alpha);
  }
  targetState.suns.length = currentState.suns.length;

  for (let index = 0; index < currentState.planets.length; index += 1) {
    const currentPlanet = currentState.planets[index]!;
    let targetPlanet = targetState.planets[index];

    if (targetPlanet === undefined || targetPlanet.id !== currentPlanet.id) {
      targetPlanet = clonePlanet(currentPlanet);
      targetState.planets[index] = targetPlanet;
    }

    syncPlanetInto(
      targetPlanet,
      previousState.planets[index]!,
      currentPlanet,
      alpha,
    );
  }
  targetState.planets.length = currentState.planets.length;

  syncInterpolatedEntityArray(
    targetState.rockets,
    currentState.rockets,
    (id) => cache.previousRocketMap.get(id),
    cloneRocket,
    syncRocketInto,
    alpha,
  );
  syncInterpolatedEntityArray(
    targetState.caches,
    currentState.caches,
    (id) => cache.previousCacheMap.get(id),
    cloneCache,
    syncCacheInto,
    alpha,
  );
  syncInterpolatedEntityArray(
    targetState.debris,
    currentState.debris,
    (id) => cache.previousDebrisMap.get(id),
    cloneDebris,
    syncDebrisInto,
    alpha,
  );

  return targetState;
};

export const interpolateSandboxState = (
  previousState: CombatSandboxState,
  currentState: CombatSandboxState,
  alpha: number,
): CombatSandboxState =>
  syncInterpolatedSandboxState(
    createInterpolatedSandboxState(currentState),
    createSandboxInterpolationCache(),
    previousState,
    currentState,
    alpha,
  );

export const getSandboxDebugSnapshot = (
  state: CombatSandboxState,
): CombatSandboxDebugSnapshot => {
  const activeSuns = getActiveCombatSuns(state.suns);
  const playerPlanet = findPlayerPlanet(state.planets, state.player.planetId);
  const lockTarget =
    state.player.lockTargetId === null
      ? null
      : (findPlayerPlanet(state.planets, state.player.lockTargetId) ?? null);
  let alivePlanets = 0;
  for (const planet of state.planets) {
    if (planet.alive) {
      alivePlanets += 1;
    }
  }
  const summarizeAiDebug = (
    playerId: string,
    label: string,
    memory: CombatBotMemory,
  ): CombatSandboxAiDebugSummary | null => {
    const debug = memory.blackboard.debug;
    if (debug.activeIntent === null) {
      return null;
    }

    const targetLabel =
      debug.currentTargetId === null
        ? null
        : (findPlayerPlanet(state.planets, debug.currentTargetId)?.label ??
            state.planets.find(
              (planet) => planet.playerId === debug.currentTargetPlayerId,
            )?.label ??
            null);

    return {
      playerId,
      label,
      intent: debug.activeIntent,
      executionState: debug.executionState,
      reason: debug.activeIntentReason ?? debug.planReason ?? "no reason",
      targetLabel,
      shotSummary: debug.shotScoreBreakdown[0] ?? null,
      planExpiryTick: debug.planExpiryTick,
    };
  };
  const aiFocused =
    state.playerBot === null
      ? null
      : summarizeAiDebug(
          state.player.playerId,
          playerPlanet?.displayName ?? "Player",
          state.playerBot.memory,
        );
  const aiSummaries = [
    ...(aiFocused === null ? [] : [aiFocused]),
    ...state.bots
      .map((bot) => {
        const planet = findPlayerPlanet(state.planets, bot.planetId);
        return summarizeAiDebug(
          bot.playerId,
          planet?.displayName ?? planet?.label ?? bot.playerId,
          bot.memory,
        );
      })
      .filter((item): item is CombatSandboxAiDebugSummary => item !== null),
  ];

  return {
    elapsedSec: state.elapsedSec,
    alivePlanets,
    minCurrentPlanetSunGap: findMinPlanetSunGap(state.planets, activeSuns),
    minCurrentSunSunGap: findMinSunSunGap(activeSuns),
    presetLabel: state.preset.label,
    playerArchetypeName:
      playerPlanet === null
        ? "--"
        : getArchetypeStats(playerPlanet.archetype).name,
    selectedRocketKind: state.player.selectedRocketKind,
    lockTargetLabel: lockTarget?.label ?? null,
    playerHp: Math.max(0, Math.round(playerPlanet?.hp ?? 0)),
    lightAmmo: state.player.ammo.light,
    heavyAmmo: state.player.ammo.heavy,
    seekerAmmo: state.player.ammo.seeker,
    blackHoleActive: state.blackHole !== null,
    cacheCount: state.caches.length,
    gravityPulseHeld: state.player.gravityPulseHeld,
    cloakHeld: state.player.cloakHeld,
    aiFocused,
    aiSummaries,
  };
};
