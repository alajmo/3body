import {
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  CURRENT_GAME_TUNING,
  FORESIGHT_SPEC,
  len,
  type AbilitySpec,
  type BlackHole,
  type BlackHoleSpec,
  type BoostSpec,
  type Cache,
  type Drone,
  type PlanetPublic,
  type RocketKind,
  type Sun,
  SHIELD_SPEC,
  type Vec2,
} from "@3body/shared";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import { getRuntimeTuningDocument } from "./runtimeTuning";
const DEFAULT_PLANET_VISUALS =
  CURRENT_GAME_TUNING.visuals.planets.archetypes.terra;
export const DEFAULT_PLANET_BODY_SCALE = DEFAULT_PLANET_VISUALS.bodyScale;
export const DEFAULT_PLANET_AURA_SCALE = DEFAULT_PLANET_VISUALS.auraScale;
export const DEFAULT_PLANET_AURA_GAP = DEFAULT_PLANET_VISUALS.auraGap;
export const DEFAULT_CACHE_BADGE_SCALE =
  CURRENT_GAME_TUNING.visuals.caches.badgeScale;
export const DEFAULT_FORESIGHT_SETTINGS: AbilitySpec = { ...FORESIGHT_SPEC };
export const DEFAULT_SHIELD_SETTINGS: AbilitySpec = {
  cooldownSec: SHIELD_SPEC.cooldownSec,
  durationSec: SHIELD_SPEC.durationSec,
};
export const DEFAULT_BOOST_SETTINGS: BoostSpec = { ...BOOST_SPEC };

export type HudStatusMode = "ready" | "active" | "cooldown";

export interface GameViewportHudAbility {
  accent: string;
  id: "foresight" | "shield" | "boost" | "gravityPulse" | "cloak";
  keyLabel: string;
  label: string;
  mode: HudStatusMode;
  progress: number;
  statusText: string;
  valueText?: string;
}

export interface GameViewportWeaponStatus {
  accent: string;
  ammo: number;
  kind: RocketKind;
  label: string;
  maxAmmo: number;
  reloadRemainingSec: number;
  selected: boolean;
}

export interface GameViewportPlanetBar {
  color: string;
  hp: number;
  id: number;
  label: string;
  maxHp: number;
  pulse: number;
  screenX: number;
  screenY: number;
}

export interface GameViewportKillFeedEntry {
  accent: string;
  ageSec: number;
  id: number;
  text: string;
}

export interface GameViewportDebugItem {
  label: string;
  value: string;
}

export interface GameViewportShortcut {
  active?: boolean;
  detail?: string;
  id: string;
  keyLabel: string;
  label: string;
}

export interface GameViewportConnectionState {
  extrapolating: boolean;
  fps: number;
  frameTimeMs: number;
  label: string;
  rttMs: number | null;
  state: "connected" | "local" | "reconnecting";
}

export type GameViewportMinimapEntityKind =
  | "blackHole"
  | "cache"
  | "drone"
  | "planet"
  | "sun";

export interface GameViewportMinimapEntity {
  highlighted: boolean;
  id: number;
  kind: GameViewportMinimapEntityKind;
  pos: Vec2;
  radius: number;
}

export interface GameViewportMinimapState {
  arenaRadius: number;
  entities: GameViewportMinimapEntity[];
  extentRadius: number;
}

export interface GameViewportHudState {
  alivePlayerCount: number;
  abilities: GameViewportHudAbility[];
  blackHoleActive: boolean;
  blackHoleRemainingSec: number;
  blackHoleSettings: BlackHoleSpec;
  blackHoleWarning: boolean;
  botsEnabled: boolean;
  boostSettings: BoostSpec;
  cacheBadgeScale: number;
  connection: GameViewportConnectionState;
  contextualShortcuts: GameViewportShortcut[];
  controlMode: "drone" | "planet";
  currentPresetId: string;
  damageFlash: number;
  debugItems: GameViewportDebugItem[];
  foresightSettings: AbilitySpec;
  hudOpacity: number;
  killFeed: GameViewportKillFeedEntry[];
  minimap: GameViewportMinimapState;
  planetBars: GameViewportPlanetBar[];
  planetBodyScale: number;
  planetAuraGap: number;
  planetAuraScale: number;
  profilingEnabled: boolean;
  playerArchetype: string;
  playerHeadingDeg: number | null;
  playerHp: number;
  playerHpPulse: number;
  playerLabel: string;
  playerSpeed: number;
  primaryShortcuts: GameViewportShortcut[];
  sandboxPaused: boolean;
  sandboxControlsEnabled: boolean;
  selectedWeapon: RocketKind;
  shieldSettings: AbilitySpec;
  timerElapsedSec: number;
  totalPlayerCount: number;
  weapons: GameViewportWeaponStatus[];
}

export interface GameViewportController {
  resetProfiling: () => void;
  resetAbilitySettings: () => void;
  resetBlackHoleSettings: () => void;
  resetPlanetVisualSettings: () => void;
  setBotsEnabled: (value: boolean) => void;
  setBoostSetting: <K extends keyof BoostSpec>(
    key: K,
    value: BoostSpec[K],
  ) => void;
  setBlackHoleSetting: <K extends keyof BlackHoleSpec>(
    key: K,
    value: BlackHoleSpec[K],
  ) => void;
  setCacheBadgeScale: (value: number) => void;
  setForesightSetting: <K extends keyof AbilitySpec>(
    key: K,
    value: AbilitySpec[K],
  ) => void;
  setPlanetBodyScale: (value: number) => void;
  setPlanetAuraGap: (value: number) => void;
  setPlanetAuraScale: (value: number) => void;
  setProfilingEnabled: (value: boolean) => void;
  pauseSandbox: () => void;
  playSandbox: () => void;
  resetSandbox: () => void;
  setShieldSetting: <K extends keyof AbilitySpec>(
    key: K,
    value: AbilitySpec[K],
  ) => void;
  setOrbitPreset: (presetId: string) => void;
}

export interface CreateGameViewportOptions {
  defaultBotsEnabled?: boolean;
  enableSandboxStorage?: boolean;
  onControllerReady?: (controller: GameViewportController | null) => void;
  onHudStateChange?: (state: GameViewportHudState) => void;
}

const PLAYER_HEADING_SPEED_EPSILON = 1;

export const getPlayerMotionHud = (
  velocity: Vec2 | null | undefined,
): Pick<GameViewportHudState, "playerHeadingDeg" | "playerSpeed"> => {
  if (velocity === null || velocity === undefined) {
    return {
      playerHeadingDeg: null,
      playerSpeed: 0,
    };
  }

  const playerSpeed = len(velocity);
  if (playerSpeed < PLAYER_HEADING_SPEED_EPSILON) {
    return {
      playerHeadingDeg: null,
      playerSpeed,
    };
  }

  return {
    playerHeadingDeg:
      (90 - (Math.atan2(velocity.y, velocity.x) * 180) / Math.PI + 360) % 360,
    playerSpeed,
  };
};

const createMinimapEntity = (
  entity:
    | Pick<BlackHole, "id" | "pos">
    | Pick<Cache, "id" | "pos" | "radius">
    | Pick<Drone, "id" | "pos" | "radius">
    | Pick<PlanetPublic, "id" | "pos" | "radius">
    | Pick<Sun, "id" | "pos" | "radius">,
  kind: GameViewportMinimapEntityKind,
  highlighted = false,
  radius = "radius" in entity ? entity.radius : 0,
): GameViewportMinimapEntity => ({
  highlighted,
  id: entity.id,
  kind,
  pos: {
    x: entity.pos.x,
    y: entity.pos.y,
  },
  radius,
});

export const createHudMinimapState = ({
  arenaRadius,
  blackHole,
  caches,
  drones,
  highlightedEntity,
  planets,
  suns,
}: {
  arenaRadius: number;
  blackHole?: BlackHole | null;
  caches: readonly Cache[];
  drones: readonly Drone[];
  highlightedEntity?: {
    id: number;
    kind: GameViewportMinimapEntityKind;
  } | null;
  planets: readonly PlanetPublic[];
  suns: readonly Sun[];
}): GameViewportMinimapState => {
  const entities: GameViewportMinimapEntity[] = [];
  const isHighlighted = (id: number, kind: GameViewportMinimapEntityKind) =>
    highlightedEntity?.id === id && highlightedEntity.kind === kind;

  if (blackHole !== null && blackHole !== undefined) {
    entities.push(
      createMinimapEntity(
        blackHole,
        "blackHole",
        isHighlighted(blackHole.id, "blackHole"),
        Math.max(blackHole.killRadius, blackHole.radius),
      ),
    );
  }

  for (const sun of suns) {
    entities.push(
      createMinimapEntity(sun, "sun", isHighlighted(sun.id, "sun")),
    );
  }

  for (const planet of planets) {
    entities.push(
      createMinimapEntity(planet, "planet", isHighlighted(planet.id, "planet")),
    );
  }

  for (const cache of caches) {
    entities.push(
      createMinimapEntity(cache, "cache", isHighlighted(cache.id, "cache")),
    );
  }

  for (const drone of drones) {
    entities.push(
      createMinimapEntity(drone, "drone", isHighlighted(drone.id, "drone")),
    );
  }

  const extentRadius = entities.reduce(
    (maxRadius, entity) => {
      const radialDistance =
        Math.hypot(entity.pos.x, entity.pos.y) + entity.radius;
      return Math.max(maxRadius, radialDistance);
    },
    Math.max(arenaRadius, 0),
  );

  return {
    arenaRadius: Math.max(arenaRadius, 0),
    entities,
    extentRadius,
  };
};

export const createInitialHudState = (): GameViewportHudState => {
  const tuning = getRuntimeTuningDocument();
  const visualTuning = tuning.visuals;

  return {
    alivePlayerCount: 0,
    abilities: [],
    blackHoleActive: false,
    blackHoleRemainingSec: 0,
    blackHoleSettings: { ...BLACK_HOLE_SPEC },
    blackHoleWarning: false,
    botsEnabled: true,
    boostSettings: { ...DEFAULT_BOOST_SETTINGS },
    cacheBadgeScale:
      visualTuning?.caches?.badgeScale ?? DEFAULT_CACHE_BADGE_SCALE,
    connection: {
      extrapolating: false,
      fps: 0,
      frameTimeMs: 0,
      label: "Local",
      rttMs: 0,
      state: "local",
    },
    contextualShortcuts: [],
    controlMode: "planet",
    currentPresetId: DEFAULT_ORBIT_PRESET.id,
    damageFlash: 0,
    debugItems: [],
    foresightSettings: { ...DEFAULT_FORESIGHT_SETTINGS },
    hudOpacity: 1,
    killFeed: [],
    minimap: {
      arenaRadius: 0,
      entities: [],
      extentRadius: 0,
    },
    planetBars: [],
    planetBodyScale: DEFAULT_PLANET_BODY_SCALE,
    planetAuraGap: DEFAULT_PLANET_AURA_GAP,
    planetAuraScale: DEFAULT_PLANET_AURA_SCALE,
    profilingEnabled: false,
    playerArchetype: "--",
    playerHeadingDeg: null,
    playerHp: 0,
    playerHpPulse: 0,
    playerLabel: "Player",
    playerSpeed: 0,
    primaryShortcuts: [],
    sandboxPaused: false,
    sandboxControlsEnabled: true,
    selectedWeapon: "light",
    shieldSettings: { ...DEFAULT_SHIELD_SETTINGS },
    timerElapsedSec: 0,
    totalPlayerCount: 0,
    weapons: [],
  };
};

const areObjectsEqual = <T>(
  current: readonly T[],
  next: readonly T[],
  isEqual: (left: T, right: T) => boolean,
): boolean =>
  current.length === next.length &&
  current.every((item, index) => isEqual(item, next[index]!));

const areConnectionStatesEqual = (
  current: GameViewportConnectionState,
  next: GameViewportConnectionState,
) =>
  current.extrapolating === next.extrapolating &&
  current.fps === next.fps &&
  current.frameTimeMs === next.frameTimeMs &&
  current.label === next.label &&
  current.rttMs === next.rttMs &&
  current.state === next.state;

const areSettingsEqual = (
  current: AbilitySpec | BlackHoleSpec | BoostSpec,
  next: AbilitySpec | BlackHoleSpec | BoostSpec,
) =>
  Object.keys(current).every(
    (key) =>
      current[key as keyof typeof current] === next[key as keyof typeof next],
  );

const areMinimapStatesEqual = (
  current: GameViewportMinimapState,
  next: GameViewportMinimapState,
) =>
  current.arenaRadius === next.arenaRadius &&
  current.extentRadius === next.extentRadius &&
  areObjectsEqual(
    current.entities,
    next.entities,
    (left, right) =>
      left.highlighted === right.highlighted &&
      left.id === right.id &&
      left.kind === right.kind &&
      left.pos.x === right.pos.x &&
      left.pos.y === right.pos.y &&
      left.radius === right.radius,
  );

export const areHudStatesEqual = (
  current: GameViewportHudState,
  next: GameViewportHudState,
): boolean =>
  current.alivePlayerCount === next.alivePlayerCount &&
  current.blackHoleActive === next.blackHoleActive &&
  current.blackHoleRemainingSec === next.blackHoleRemainingSec &&
  current.blackHoleWarning === next.blackHoleWarning &&
  current.botsEnabled === next.botsEnabled &&
  current.cacheBadgeScale === next.cacheBadgeScale &&
  areConnectionStatesEqual(current.connection, next.connection) &&
  current.controlMode === next.controlMode &&
  current.currentPresetId === next.currentPresetId &&
  current.damageFlash === next.damageFlash &&
  current.hudOpacity === next.hudOpacity &&
  areMinimapStatesEqual(current.minimap, next.minimap) &&
  current.planetBodyScale === next.planetBodyScale &&
  current.planetAuraGap === next.planetAuraGap &&
  current.planetAuraScale === next.planetAuraScale &&
  current.profilingEnabled === next.profilingEnabled &&
  current.playerArchetype === next.playerArchetype &&
  current.playerHeadingDeg === next.playerHeadingDeg &&
  current.playerHp === next.playerHp &&
  current.playerHpPulse === next.playerHpPulse &&
  current.playerLabel === next.playerLabel &&
  current.playerSpeed === next.playerSpeed &&
  current.sandboxPaused === next.sandboxPaused &&
  current.sandboxControlsEnabled === next.sandboxControlsEnabled &&
  current.selectedWeapon === next.selectedWeapon &&
  current.timerElapsedSec === next.timerElapsedSec &&
  current.totalPlayerCount === next.totalPlayerCount &&
  areSettingsEqual(current.blackHoleSettings, next.blackHoleSettings) &&
  areSettingsEqual(current.boostSettings, next.boostSettings) &&
  areSettingsEqual(current.foresightSettings, next.foresightSettings) &&
  areSettingsEqual(current.shieldSettings, next.shieldSettings) &&
  areObjectsEqual(
    current.abilities,
    next.abilities,
    (left, right) =>
      left.accent === right.accent &&
      left.id === right.id &&
      left.keyLabel === right.keyLabel &&
      left.label === right.label &&
      left.mode === right.mode &&
      left.progress === right.progress &&
      left.statusText === right.statusText &&
      left.valueText === right.valueText,
  ) &&
  areObjectsEqual(
    current.contextualShortcuts,
    next.contextualShortcuts,
    (left, right) =>
      left.active === right.active &&
      left.detail === right.detail &&
      left.id === right.id &&
      left.keyLabel === right.keyLabel &&
      left.label === right.label,
  ) &&
  areObjectsEqual(
    current.debugItems,
    next.debugItems,
    (left, right) => left.label === right.label && left.value === right.value,
  ) &&
  areObjectsEqual(
    current.killFeed,
    next.killFeed,
    (left, right) =>
      left.accent === right.accent &&
      left.ageSec === right.ageSec &&
      left.id === right.id &&
      left.text === right.text,
  ) &&
  areObjectsEqual(
    current.planetBars,
    next.planetBars,
    (left, right) =>
      left.color === right.color &&
      left.hp === right.hp &&
      left.id === right.id &&
      left.label === right.label &&
      left.maxHp === right.maxHp &&
      left.pulse === right.pulse &&
      left.screenX === right.screenX &&
      left.screenY === right.screenY,
  ) &&
  areObjectsEqual(
    current.primaryShortcuts,
    next.primaryShortcuts,
    (left, right) =>
      left.active === right.active &&
      left.detail === right.detail &&
      left.id === right.id &&
      left.keyLabel === right.keyLabel &&
      left.label === right.label,
  ) &&
  areObjectsEqual(
    current.weapons,
    next.weapons,
    (left, right) =>
      left.accent === right.accent &&
      left.ammo === right.ammo &&
      left.kind === right.kind &&
      left.label === right.label &&
      left.maxAmmo === right.maxAmmo &&
      left.reloadRemainingSec === right.reloadRemainingSec &&
      left.selected === right.selected,
  );
