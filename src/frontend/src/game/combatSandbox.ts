import type {
  ArchetypeId,
  AsteroidTier,
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
  absorbSunsIntoNeutronStars,
  add,
  BOOST_SPEC,
  CACHE_GRAVITY_SCALE,
  CACHE_RADIUS,
  CACHE_SPEC,
  CACHE_TANGENTIAL_SPEED_MAX,
  CACHE_TANGENTIAL_SPEED_MIN,
  clamp,
  cloneCombatBotMemory,
  consumeBlackHoleBodies,
  createBoundaryAsteroidSpawn,
  createCombatBotMemory,
  createInitialAmmo,
  createNeutronStars,
  DEBRIS_TTL_SEC,
  decideCombatBot,
  dist,
  dot,
  FIXED_STEP_SEC,
  fromAngle,
  GRAVITY_PULSE_IMPULSE,
  GRAVITY_PULSE_RADIUS,
  getBaseShieldLoad,
  getBlackHoleKillRadiusAtElapsedSec,
  getBlackHoleMassAtElapsedSec,
  getBoundaryAsteroidDamage,
  getBoundaryAsteroidExplosionBaseSpeed,
  getBoundaryAsteroidExplosionPieces,
  getBoundaryAsteroidExplosionSpeedVariance,
  getBoundaryAsteroidImpactRadius,
  getOrbitPatternDistanceScaleAtElapsedSec,
  getOuterRingMax,
  getOuterRingMin,
  getPreferredLocalPlayerOrbitIndex,
  getSeekerLockTicks,
  getShieldLoadCapacity,
  getUmbraDragDurationTicks,
  getUmbraDragStepMultiplier,
  hasCrossedBlackHoleHorizon,
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
  sampleBoundaryAsteroidSpawnCount,
  scale,
  shouldDespawnBoundaryAsteroid,
  stepBody,
  stepBodyWithGravityScale,
  stepNeutronStars,
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
import {
  type RuntimeOrbitStarMotion,
  resolveRuntimeOrbitPreset,
  sampleRuntimeFixedPatternSunSeeds,
} from "./runtimeOrbitPreset";
import { getRuntimeTuningDocument } from "./runtimeTuning";
import { SHIELD_OUTER_SCALE } from "./shieldPresentation";

export {
  createInterpolatedSandboxState,
  createSandboxInterpolationCache,
  interpolateSandboxState,
  syncInterpolatedSandboxState,
} from "./combatSandboxInterpolation";

const LIGHT_RELOCK_DISTANCE = 96;
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
const BOUNDARY_ASTEROID_COLOR_BY_TIER = {
  large: "#ffb87a",
  micro: "#d7f1ff",
  small: "#ffd98f",
} as const satisfies Record<AsteroidTier, string>;
const BOUNDARY_ASTEROID_TIERS = [
  "micro",
  "small",
  "large",
] as const satisfies readonly AsteroidTier[];
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
const UMBRA_DRAG_DURATION_TICKS = getUmbraDragDurationTicks(SIM_HZ);
const UMBRA_DRAG_STEP_MULTIPLIER = getUmbraDragStepMultiplier(SIM_HZ);
const CACHE_RESPAWN_TICKS = Math.max(
  1,
  Math.round(CACHE_SPEC.respawnSec * SIM_HZ),
);
const getAbilityTicks = (durationSec: number): number =>
  Math.max(1, Math.round(durationSec * SIM_HZ));

const getBoostRechargeTicks = (): number =>
  getAbilityTicks(BOOST_SPEC.cooldownSec);

const getShieldArcDotThreshold = (): number =>
  Math.cos((SHIELD_SPEC.arcDeg * Math.PI) / 360);
export type CombatPlanetDeathReason =
  | "rocket"
  | "sunCollision"
  | "neutronStar"
  | "planetCollision"
  | "boundaryAsteroid"
  | "boundary"
  | "blackHole";

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

interface CombatSandboxImpactBurstBase {
  id: number;
  planetId: number;
  absorbedByShield: boolean;
  color: string;
  normal: Vec2;
  startedAtSec: number;
  startedAtTick: number;
  ttlUntilTick: number;
}

export type CombatSandboxImpactBurst =
  | (CombatSandboxImpactBurstBase & {
      sourceKind: "boundaryAsteroid";
    })
  | (CombatSandboxImpactBurstBase & {
      sourceKind: "rocket";
      rocketKind: RocketKind;
    });

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
  shieldAimDir: Vec2;
  shieldActive: boolean;
  shieldLoad: number;
  shieldMaxLoad: number;
  boostCharges: number;
  nextBoostChargeAtTick: number | null;
  lastBoostTick: number | null;
  lastBoostAimDir: Vec2;
  gravityPulseHeld: boolean;
  nextShieldExt: boolean;
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
  starMotion: RuntimeOrbitStarMotion;
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
  bots: CombatSandboxBotState[];
  nextEntityId: number;
  rng: () => number;
}

interface CreateSandboxStateOptions {
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
  shieldRequested: boolean;
  boostRequested: boolean;
  gravityPulseRequested: boolean;
}

interface CombatSandboxSimulationOptions {
  planetImpactRadiusMultiplier?: number;
}

interface CombatSandboxControllerFrame {
  fireRequested: boolean;
  shieldRequested: boolean;
  boostRequested: boolean;
  gravityPulseRequested: boolean;
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
  shieldAimDir: { x: DEFAULT_AIM_DIR.x, y: DEFAULT_AIM_DIR.y },
  shieldActive: false,
  shieldLoad: getShieldLoadCapacity(planet.archetype),
  shieldMaxLoad: getShieldLoadCapacity(planet.archetype),
  boostCharges: getBoostChargeCapacity(planet.archetype),
  nextBoostChargeAtTick: null,
  lastBoostTick: null,
  lastBoostAimDir: { x: DEFAULT_AIM_DIR.x, y: DEFAULT_AIM_DIR.y },
  gravityPulseHeld: false,
  nextShieldExt: false,
});

interface CloneControllerStateOptions {
  aimWorld?: Vec2;
  selectedRocketKind?: RocketKind;
}

const cloneControllerState = <T extends CombatSandboxControllerState>(
  controller: T,
  options: CloneControllerStateOptions = {},
): T => ({
  ...controller,
  selectedRocketKind:
    options.selectedRocketKind ?? controller.selectedRocketKind,
  ammo: { ...controller.ammo },
  reloadUntilTick: { ...controller.reloadUntilTick },
  aimWorld:
    options.aimWorld === undefined
      ? { x: controller.aimWorld.x, y: controller.aimWorld.y }
      : { x: options.aimWorld.x, y: options.aimWorld.y },
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
  shieldRequested: false,
  boostRequested: false,
  gravityPulseRequested: false,
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
    nextBoostChargeAtTick: controller.nextBoostChargeAtTick ?? undefined,
  },
  boostCharges: controller.boostCharges,
  gravityPulseHeld: controller.gravityPulseHeld,
  nextShieldExt: controller.nextShieldExt,
});

const createBotWorld = (
  state: Pick<
    CombatSandboxState,
    "blackHole" | "caches" | "debris" | "planets" | "rockets" | "suns"
  >,
): PlanetPublic[] => state.planets.filter((planet) => planet.alive);

const createCombatBotWorld = (
  state: Pick<
    CombatSandboxState,
    | "blackHole"
    | "caches"
    | "debris"
    | "elapsedSec"
    | "neutronStars"
    | "planets"
    | "rockets"
    | "starMotion"
    | "suns"
  >,
): {
  orbitStarMotion?: import("@3body/shared").World["orbitStarMotion"];
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
  orbitStarMotion:
    state.starMotion.mode === "fixedPattern"
      ? {
          mode: "fixedPattern",
          elapsedSec: state.elapsedSec,
          patternId: state.starMotion.patternId,
          speed: state.starMotion.speed,
          baseDistanceScale: state.starMotion.baseDistanceScale,
          distanceScale: state.starMotion.distanceScale,
          sunIds: [
            state.starMotion.suns[0]!.id,
            state.starMotion.suns[1]!.id,
            state.starMotion.suns[2]!.id,
          ],
        }
      : undefined,
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

const _rotateVec2 = (dir: Vec2, angleRad: number): Vec2 => {
  const cosAngle = Math.cos(angleRad);
  const sinAngle = Math.sin(angleRad);
  return {
    x: dir.x * cosAngle - dir.y * sinAngle,
    y: dir.x * sinAngle + dir.y * cosAngle,
  };
};

export const describeWildcard = (wildcard: WildcardKind): string => {
  return wildcard === "gravityPulse" ? "Gravity Pulse" : wildcard;
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
    case "wildcard":
      return `Wildcard: ${describeWildcard(contents.wildcard.kind)}`;
  }
};

const createSandboxRng = (preset: OrbitPreset): (() => number) =>
  mulberry32(hashString(`phase5:${preset.id}`));

const isSunSwallowed = (
  sun: Pick<CombatSandboxSun, "swallowedAtSec">,
): boolean => sun.swallowedAtSec !== null;

const createCombatSunFromSeed = (
  sunSeed: OrbitPreset["suns"][number],
): CombatSandboxSun => ({
  id: sunSeed.id,
  kind: "sun",
  mass: sunSeed.mass,
  radius: sunSeed.radius,
  pos: { x: sunSeed.pos.x, y: sunSeed.pos.y },
  vel: { x: sunSeed.vel.x, y: sunSeed.vel.y },
  swallowedAtSec: null,
});

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
): boolean => hasCrossedBlackHoleHorizon(planet, blackHole);

const isEntityInsideBlackHole = (
  entity: Pick<EntityBase, "pos" | "radius">,
  blackHole: BlackHole | null,
): boolean => hasCrossedBlackHoleHorizon(entity, blackHole);

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

const getBlackHoleBonusKillRadius = (
  blackHole: BlackHole,
  blackHoleSpec: BlackHoleSpec,
  previousElapsedSec: number,
): number =>
  Math.max(
    0,
    blackHole.killRadius -
      getBlackHoleKillRadiusAtElapsedSec(previousElapsedSec, blackHoleSpec),
  );

const stepCombatSuns = (
  suns: readonly CombatSandboxSun[],
  starMotion: RuntimeOrbitStarMotion,
  blackHole: BlackHole | null,
  blackHoleSpec: BlackHoleSpec,
  swallowedAtSec: number,
): CombatSandboxSun[] => {
  const steppedActiveById =
    starMotion.mode === "fixedPattern"
      ? new Map(
          sampleRuntimeFixedPatternSunSeeds(
            starMotion,
            swallowedAtSec,
            blackHoleSpec,
          ).map(
            (sunSeed) =>
              [sunSeed.id, createCombatSunFromSeed(sunSeed)] as const,
          ),
        )
      : new Map(
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
  const killRadius = getBlackHoleKillRadiusAtElapsedSec(
    elapsedSec,
    blackHoleSpec,
  );
  if (currentBlackHole === null) {
    return {
      id: 9_001,
      kind: "blackHole",
      killRadius,
      mass,
      pos: { x: 0, y: 0 },
      radius: killRadius,
      vel: { x: 0, y: 0 },
    };
  }

  const bonusMass = getBlackHoleBonusMass(
    currentBlackHole,
    blackHoleSpec,
    Math.max(0, elapsedSec - FIXED_STEP_SEC),
  );
  const bonusKillRadius = getBlackHoleBonusKillRadius(
    currentBlackHole,
    blackHoleSpec,
    Math.max(0, elapsedSec - FIXED_STEP_SEC),
  );

  return {
    ...currentBlackHole,
    killRadius: killRadius + bonusKillRadius,
    mass: mass + bonusMass,
    radius: killRadius + bonusKillRadius,
  };
};

const findPlayerPlanetIndex = (
  planets: readonly CombatSandboxPlanet[],
  playerPlanetId: number,
): number => {
  for (let index = 0; index < planets.length; index += 1) {
    if (planets[index]!.id === playerPlanetId) {
      return index;
    }
  }

  return -1;
};

const findPlayerPlanet = (
  planets: readonly CombatSandboxPlanet[],
  playerPlanetId: number,
): CombatSandboxPlanet | null => {
  const index = findPlayerPlanetIndex(planets, playerPlanetId);
  return index < 0 ? null : planets[index]!;
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

const hasActiveShield = (
  controller: CombatSandboxControllerState,
  _tick: number,
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

const isBoundaryAsteroidDebris = (
  piece: CombatSandboxDebris,
): piece is CombatSandboxDebris & { asteroidTier: AsteroidTier } =>
  piece.asteroidTier !== undefined;

const createBoundaryAsteroidDebris = (
  tick: number,
  nextEntityId: number,
  arenaRadius: number,
  rng: () => number,
  tier: AsteroidTier,
): CombatSandboxDebris => {
  const spawn = createBoundaryAsteroidSpawn({
    arenaRadius,
    rng,
    tier,
  });

  return {
    asteroidTier: spawn.asteroidTier,
    color: BOUNDARY_ASTEROID_COLOR_BY_TIER[tier],
    id: nextEntityId,
    kind: "debris",
    ownerPlayerId: undefined,
    pos: spawn.pos,
    radius: spawn.radius,
    ttlUntilTick: tick + getAbilityTicks(spawn.ttlSec),
    vel: spawn.vel,
  };
};

const spawnBoundaryAsteroidDebris = (
  tick: number,
  nextEntityId: number,
  arenaRadius: number,
  rng: () => number,
): { debris: CombatSandboxDebris[]; nextEntityId: number } => {
  const debris: CombatSandboxDebris[] = [];
  let nextId = nextEntityId;

  for (const tier of BOUNDARY_ASTEROID_TIERS) {
    const spawnCount = sampleBoundaryAsteroidSpawnCount({
      dtSec: FIXED_STEP_SEC,
      rng,
      tier,
    });
    for (let index = 0; index < spawnCount; index += 1) {
      debris.push(
        createBoundaryAsteroidDebris(tick, nextId, arenaRadius, rng, tier),
      );
      nextId += 1;
    }
  }

  return {
    debris,
    nextEntityId: nextId,
  };
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
  impact: Pick<CombatSandboxImpactBurstBase, "absorbedByShield" | "color"> &
    Pick<CombatSandboxImpactBurst, "sourceKind"> & {
      rocketKind?: RocketKind;
    },
): CombatSandboxImpactBurst => ({
  id: nextEntityId,
  planetId: planet.id,
  absorbedByShield: impact.absorbedByShield,
  color: impact.color,
  normal: getPlanetImpactNormal(planet, source),
  ...(impact.sourceKind === "rocket"
    ? {
        rocketKind: impact.rocketKind ?? "light",
        sourceKind: "rocket" as const,
      }
    : {
        sourceKind: "boundaryAsteroid" as const,
      }),
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
      if (
        dist(planet.pos, neutronStar.pos) <=
        planet.radius + neutronStar.radius
      ) {
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
  arenaRadius: number,
): CombatSandboxDebris[] => {
  const nextDebris: CombatSandboxDebris[] = [];

  for (const piece of debris) {
    if (piece.ttlUntilTick <= tick) {
      continue;
    }

    const steppedPiece = stepBody(
      piece,
      suns,
      FIXED_STEP_SEC,
      blackHole ?? undefined,
    );
    if (shouldDespawnBoundaryAsteroid(steppedPiece, arenaRadius)) {
      continue;
    }

    nextDebris.push(steppedPiece);
  }

  return nextDebris;
};

const applyBoundaryAsteroidImpacts = ({
  debris,
  debrisBursts,
  deathPlanetIds,
  impactBursts,
  nextEntityId,
  planets,
  tick,
  elapsedSec,
  controllers,
}: {
  debris: readonly CombatSandboxDebris[];
  debrisBursts: CombatSandboxDebris[];
  deathPlanetIds: Set<number>;
  impactBursts: CombatSandboxImpactBurst[];
  nextEntityId: number;
  planets: CombatSandboxPlanet[];
  tick: number;
  elapsedSec: number;
  controllers: ReadonlyMap<string, CombatSandboxControllerState>;
}): { debris: CombatSandboxDebris[]; nextEntityId: number } => {
  const survivingDebris: CombatSandboxDebris[] = [];
  let nextId = nextEntityId;

  for (const piece of debris) {
    if (!isBoundaryAsteroidDebris(piece)) {
      survivingDebris.push(piece);
      continue;
    }

    let impactedPlanet = false;

    for (let index = 0; index < planets.length; index += 1) {
      const planet = planets[index]!;
      if (!planet.alive || deathPlanetIds.has(planet.id)) {
        continue;
      }

      if (
        dist(piece.pos, planet.pos) >
        getBoundaryAsteroidImpactRadius(piece.asteroidTier, piece.radius) +
          planet.radius
      ) {
        continue;
      }

      const damage = getBoundaryAsteroidDamage(piece.asteroidTier);
      const absorbedByShield = shieldProtectsImpact(
        planet,
        controllers,
        piece.pos,
        tick,
      );
      impactBursts.push(
        createPlanetImpactBurst(tick, nextId, elapsedSec, planet, piece, {
          absorbedByShield,
          color: piece.color,
          sourceKind: "boundaryAsteroid",
        }),
      );
      nextId += 1;

      const burst = createDebrisBurst(tick, nextId, piece, {
        color: piece.color,
        pieces: getBoundaryAsteroidExplosionPieces(piece.asteroidTier),
        baseSpeed: getBoundaryAsteroidExplosionBaseSpeed(piece.asteroidTier),
        speedVariance: getBoundaryAsteroidExplosionSpeedVariance(
          piece.asteroidTier,
        ),
      });
      debrisBursts.push(...burst);
      nextId += burst.length;

      if (absorbedByShield) {
        const controller = controllers.get(planet.playerId);
        if (controller !== undefined) {
          planets[index] = applyShieldDamageToPlanet(
            planet,
            controller,
            damage,
          );
        }
      } else {
        const hpAfter = planet.hp - damage;
        planets[index] =
          hpAfter <= 0
            ? killPlanet(
                {
                  ...planet,
                  hp: hpAfter,
                },
                "boundaryAsteroid",
              )
            : {
                ...planet,
                hp: hpAfter,
              };
        if (hpAfter <= 0) {
          deathPlanetIds.add(planet.id);
        }
      }

      impactedPlanet = true;
      break;
    }

    if (!impactedPlanet) {
      survivingDebris.push(piece);
    }
  }

  return {
    debris: survivingDebris,
    nextEntityId: nextId,
  };
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
  const playerPlanetIndex = findPlayerPlanetIndex(planets, controller.planetId);
  if (playerPlanetIndex < 0) {
    return;
  }
  const playerPlanet = planets[playerPlanetIndex]!;

  switch (contents.kind) {
    case "heavyAmmo":
      controller.ammo.heavy += 1;
      break;
    case "seekerPack":
      controller.ammo.seeker += 2;
      break;
    case "repair":
      planets[playerPlanetIndex] = {
        ...playerPlanet,
        hp: Math.min(PLANET_HP, playerPlanet.hp + REPAIR_AMOUNT),
      };
      break;
    case "shieldExt":
      controller.nextShieldExt = true;
      break;
    case "wildcard":
      controller.gravityPulseHeld = true;
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
  _wildcard: WildcardKind,
  planets: CombatSandboxPlanet[],
  rockets: CombatSandboxRocket[],
  caches: CombatSandboxCache[],
  debris: CombatSandboxDebris[],
  player: CombatSandboxPlayerState,
): boolean => {
  const playerPlanetIndex = findPlayerPlanetIndex(planets, player.planetId);
  if (playerPlanetIndex < 0) {
    return false;
  }
  const playerPlanet = planets[playerPlanetIndex]!;
  if (!playerPlanet.alive) {
    return false;
  }

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
    debris,
    playerPlanet.pos,
    GRAVITY_PULSE_RADIUS,
    GRAVITY_PULSE_IMPULSE,
    isBoundaryAsteroidDebris,
  );
  applyImpulseAwayFromPoint(
    caches,
    playerPlanet.pos,
    GRAVITY_PULSE_RADIUS,
    GRAVITY_PULSE_IMPULSE * 0.72,
  );
  return true;
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
      if (command.slot === "q" && command.aimDir !== undefined) {
        const shieldAimDir = normalize(command.aimDir);
        if (len(shieldAimDir) > 0) {
          controller.shieldAimDir = shieldAimDir;
        }
      }
      if (command.slot === "q") {
        frame.shieldRequested = true;
      } else if (command.slot === "w") {
        frame.boostRequested = true;
      } else if (command.slot === "g") {
        frame.gravityPulseRequested = true;
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
  const runtimePreset = resolvedPreset.preset;
  const playerBehavior = options.playerBehavior === "bot" ? "bot" : "human";
  const participantCount = getSandboxParticipantCount(
    options.participantCount,
    runtimePreset.planets.length,
  );
  const planetSeeds = runtimePreset.planets.slice(0, participantCount);
  const playerPlanetIndex = getPreferredLocalPlayerOrbitIndex(
    planetSeeds.length,
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
      planetSeed.id === playerPlanetId
        ? playerDisplayName
        : nextBotDisplayName();

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
  const rng = createSandboxRng(runtimePreset);
  let nextEntityId = nextRocketIdBase;
  const neutronStars = createNeutronStars({
    arenaRadius: ARENA_RADIUS,
    blockedBodies: [
      ...runtimePreset.suns.map((sun) => ({
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
    preset: runtimePreset,
    starMotion: resolvedPreset.starMotion,
    suns: runtimePreset.suns.map(createCombatSunFromSeed),
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
    bots,
    nextEntityId: initialCaches.nextEntityId,
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
      ? cloneControllerState(state.player, {
          aimWorld: input.aimWorld,
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
            shieldRequested: input.shieldRequested,
            boostRequested: input.boostRequested,
            gravityPulseRequested: input.gravityPulseRequested,
          }
        : createControllerFrame(),
    ],
    ...bots.map((bot) => [bot.playerId, createControllerFrame()] as const),
  ]);

  let planets = state.planets.slice();
  let rockets = state.rockets.slice();
  let caches = state.caches.slice();
  let debris = state.debris.slice();
  const cacheRespawnAtTicks = [...state.cacheRespawnAtTicks];
  let nextEntityId = state.nextEntityId;

  for (const controller of controllers) {
    const archetypeId = getPlayerArchetypeId(planets, controller.planetId);
    refreshBoostCharges(
      controller,
      state.tick,
      getBoostChargeCapacity(archetypeId),
    );
    refreshShieldLoad(controller);
  }

  const botWorld = createCombatBotWorld({
    blackHole,
    caches,
    debris,
    elapsedSec: state.elapsedSec,
    neutronStars: state.neutronStars,
    planets,
    rockets,
    starMotion: state.starMotion,
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
    const _archetype = getArchetypeStats(archetypeId);
    const maxBoostCharges = getBoostChargeCapacity(archetypeId);
    const currentAimDir = aimDirFromWorldTarget(
      planetBeforeStep,
      controller.aimWorld,
      controller.shieldAimDir,
    );

    if (frame.shieldRequested && planetBeforeStep?.alive) {
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
        debris,
        controller,
      );
      if (consumed) {
        controller.gravityPulseHeld = false;
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

  const suns = stepCombatSuns(
    state.suns,
    state.starMotion,
    blackHole,
    blackHoleSpec,
    nextElapsedSec,
  );
  const swallowedSuns =
    blackHole === null
      ? []
      : state.suns.filter(
          (sun, index) => !isSunSwallowed(sun) && isSunSwallowed(suns[index]!),
        );
  if (blackHole !== null && swallowedSuns.length > 0) {
    blackHole = consumeBlackHoleBodies(blackHole, swallowedSuns);
  }
  let neutronStars = stepNeutronStars(
    state.neutronStars,
    FIXED_STEP_SEC,
    blackHole ?? undefined,
  );
  const swallowedNeutronStars =
    blackHole === null
      ? []
      : neutronStars.filter((neutronStar) =>
          isEntityInsideBlackHole(neutronStar, blackHole),
        );
  if (blackHole !== null && swallowedNeutronStars.length > 0) {
    const swallowedNeutronStarIds = new Set(
      swallowedNeutronStars.map((neutronStar) => neutronStar.id),
    );
    blackHole = consumeBlackHoleBodies(blackHole, swallowedNeutronStars);
    neutronStars = neutronStars.filter(
      (neutronStar) => !swallowedNeutronStarIds.has(neutronStar.id),
    );
  }
  const sunAbsorptionState = absorbSunsIntoNeutronStars(
    getActiveCombatSuns(suns),
    neutronStars,
  );
  neutronStars = sunAbsorptionState.neutronStars;
  const survivingSunIds = new Set(sunAbsorptionState.suns.map((sun) => sun.id));
  const nextSuns = suns.filter(
    (sun) => isSunSwallowed(sun) || survivingSunIds.has(sun.id),
  );
  const activeSuns = getActiveCombatSuns(nextSuns);
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
      neutronStars,
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
    neutronStars,
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
      findAliveTargetPlanet(planets, controller.planetId, controller.aimWorld)
        ?.id ?? null;
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
        {
          absorbedByShield,
          color: rocket.color,
          rocketKind: rocket.rocketKind,
          sourceKind: "rocket",
        },
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

    for (const neutronStar of neutronStars) {
      if (
        dist(rocket.pos, neutronStar.pos) <=
        rocket.radius + neutronStar.radius
      ) {
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

  const steppedDebris = stepDebris(
    debris,
    activeSuns,
    blackHole,
    nextTick,
    ARENA_RADIUS,
  );
  const spawnedBoundaryAsteroids = spawnBoundaryAsteroidDebris(
    nextTick,
    nextEntityId,
    ARENA_RADIUS,
    state.rng,
  );
  nextEntityId = spawnedBoundaryAsteroids.nextEntityId;
  const boundaryAsteroidImpactState = applyBoundaryAsteroidImpacts({
    controllers: controllerByPlayerId,
    debris: [...steppedDebris, ...spawnedBoundaryAsteroids.debris],
    debrisBursts,
    deathPlanetIds,
    elapsedSec: nextElapsedSec,
    impactBursts,
    nextEntityId,
    planets,
    tick: nextTick,
  });
  nextEntityId = boundaryAsteroidImpactState.nextEntityId;

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

  debris = [...boundaryAsteroidImpactState.debris, ...debrisBursts];
  syncControllersToPlanets(planets, controllerByPlayerId);
  const nextStarMotion =
    state.starMotion.mode === "fixedPattern"
      ? {
          ...state.starMotion,
          distanceScale: getOrbitPatternDistanceScaleAtElapsedSec(
            state.starMotion.patternId,
            state.starMotion.baseDistanceScale,
            state.starMotion.suns,
            nextElapsedSec,
            blackHoleSpec,
          ),
        }
      : state.starMotion;

  return {
    tick: nextTick,
    elapsedSec: nextElapsedSec,
    preset: state.preset,
    starMotion: nextStarMotion,
    suns: nextSuns,
    neutronStars,
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
    bots,
    nextEntityId,
    rng: state.rng,
  };
};

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
    aiFocused,
    aiSummaries,
  };
};
