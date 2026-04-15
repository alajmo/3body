import {
  ARCHETYPES,
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  DRONE_SPEC,
  FIXED_STEP_SEC,
  FORESIGHT_SPEC,
  ROCKET_SPECS,
  SHIELD_SPEC,
  type CacheContents,
  type Drone,
  type PlanetPrivateState,
  type PlanetPublic,
  type RocketKind,
  type SnapshotEvent,
  type World,
} from "@3body/shared";
import type { AuthoritativeEventRecord } from "../authoritativeMatchRuntime";
import {
  createInitialHudState,
  type GameViewportConnectionState,
  type GameViewportHudAbility,
  type GameViewportHudState,
  type GameViewportShortcut,
} from "../viewportHud";
import { getRuntimeTuningDocument } from "../runtimeTuning";

const KILL_FEED_WINDOW_SEC = 4;
const WEAPON_LABELS: Record<RocketKind, string> = {
  heavy: "Heavy",
  light: "Light",
  seeker: "Seeker",
};

interface BuildAuthoritativeHudStateParams {
  activeDrone: Drone | null;
  connection: GameViewportConnectionState;
  controlsEnabled: boolean;
  currentTick: number;
  eventLog: readonly AuthoritativeEventRecord[];
  extrapolating: boolean;
  playerId: string | null;
  playerPlanet: PlanetPublic | null;
  recentEventsNowMs: number;
  rosterNameByPlayerId: ReadonlyMap<string, string>;
  runtimeStats: {
    fps: number;
    frameTimeMs: number;
  };
  selectedWeapon: RocketKind;
  self: PlanetPrivateState | null;
  world: World | null;
}

const describeCacheContents = (contents: CacheContents | undefined): string | null => {
  if (contents === undefined) {
    return null;
  }

  switch (contents.kind) {
    case "boostCharge":
      return "Boost Charge";
    case "foresightExt":
      return "Foresight Ext";
    case "heavyAmmo":
      return "Heavy Ammo";
    case "repair":
      return "Repair";
    case "seekerPack":
      return "Seeker Pack";
    case "shieldExt":
      return "Shield Ext";
    case "wildcard":
      return `Wildcard: ${contents.wildcard.kind}`;
  }
};

const describeEvent = (
  event: SnapshotEvent,
  rosterNameByPlayerId: ReadonlyMap<string, string>,
): string | null => {
  switch (event.kind) {
    case "kill": {
      const victim = rosterNameByPlayerId.get(event.victimPlayerId) ?? "Unknown";
      const killer = event.killerPlayerId
        ? (rosterNameByPlayerId.get(event.killerPlayerId) ?? "Unknown")
        : null;

      if (killer !== null) {
        return `${killer} eliminated ${victim}`;
      }

      switch (event.cause) {
        case "blackHole":
          return `${victim} fell into the Black Hole`;
        case "boundary":
          return `${victim} breached the arena`;
        case "planetCollision":
          return `${victim} collided`;
        case "sun":
          return `${victim} hit a sun`;
        case "rocket":
          return `${victim} was destroyed`;
      }
    }
    case "cachePickup": {
      const player = rosterNameByPlayerId.get(event.playerId) ?? "Unknown";
      return `${player} collected ${describeCacheContents(event.contents) ?? "cache"}`;
    }
    case "boost": {
      const player = rosterNameByPlayerId.get(event.playerId) ?? "Unknown";
      return `${player} boosted`;
    }
    case "wildcardUse": {
      const player = rosterNameByPlayerId.get(event.playerId) ?? "Unknown";
      return `${player} used ${event.wildcard}`;
    }
    default:
      return null;
  }
};

const buildAbility = (
  input: Omit<GameViewportHudAbility, "progress"> & {
    durationSec?: number;
    remainingSec?: number;
  },
): GameViewportHudAbility => {
  const totalDurationSec = Math.max(input.durationSec ?? 0, FIXED_STEP_SEC);
  const remainingSec = Math.max(0, input.remainingSec ?? 0);

  return {
    ...input,
    progress:
      input.mode === "active"
        ? Math.min(1, remainingSec / totalDurationSec)
        : input.mode === "cooldown"
          ? Math.min(1, remainingSec / totalDurationSec)
          : 1,
  };
};

const buildShortcuts = (controlsEnabled: boolean): GameViewportShortcut[] =>
  controlsEnabled
    ? [
        {
          id: "fire",
          keyLabel: "LMB",
          label: "Fire",
        },
        {
          id: "read",
          keyLabel: "Shift",
          label: "Read Mode",
        },
        {
          id: "zoom",
          keyLabel: "F",
          label: "Full View",
        },
      ]
    : [];

const buildContextualShortcuts = (
  controlsEnabled: boolean,
): GameViewportShortcut[] =>
  controlsEnabled
    ? [
        {
          id: "light",
          keyLabel: "1",
          label: "Light",
        },
        {
          id: "heavy",
          keyLabel: "2",
          label: "Heavy",
        },
        {
          id: "seeker",
          keyLabel: "3",
          label: "Seeker",
        },
        {
          id: "drone",
          keyLabel: "4",
          label: "Drone",
        },
        {
          id: "foresight",
          keyLabel: "Q",
          label: "Foresight",
        },
        {
          id: "shield",
          keyLabel: "W",
          label: "Shield",
        },
        {
          id: "boost",
          keyLabel: "E",
          label: "Boost",
        },
        {
          id: "wildcard",
          keyLabel: "R",
          label: "Wildcard",
        },
      ]
    : [];

export const buildAuthoritativeHudState = ({
  activeDrone,
  connection,
  controlsEnabled,
  currentTick,
  eventLog,
  extrapolating,
  playerId,
  playerPlanet,
  recentEventsNowMs,
  rosterNameByPlayerId,
  runtimeStats,
  selectedWeapon,
  self,
  world,
}: BuildAuthoritativeHudStateParams): GameViewportHudState => {
  const tuning = getRuntimeTuningDocument();
  const blackHoleSettings = tuning.gameplay.blackHole ?? BLACK_HOLE_SPEC;
  const boostSettings = tuning.gameplay.abilities.boost ?? BOOST_SPEC;
  const foresightSettings = tuning.gameplay.abilities.foresight ?? FORESIGHT_SPEC;
  const shieldSettings = {
    cooldownSec:
      tuning.gameplay.abilities.shield?.cooldownSec ?? SHIELD_SPEC.cooldownSec,
    durationSec:
      tuning.gameplay.abilities.shield?.durationSec ?? SHIELD_SPEC.durationSec,
  };
  const alivePlayerCount = world?.planets.length ?? 0;
  const totalPlayerCount = Math.max(alivePlayerCount, rosterNameByPlayerId.size);
  const timerElapsedSec = currentTick * FIXED_STEP_SEC;
  const blackHoleRemainingSec =
    world?.blackHole !== undefined
      ? 0
      : Math.max(0, blackHoleSettings.spawnSec - timerElapsedSec);
  const connectionState: GameViewportConnectionState = {
    ...connection,
    extrapolating,
    fps: runtimeStats.fps,
    frameTimeMs: runtimeStats.frameTimeMs,
  };
  const abilities: GameViewportHudAbility[] = [];

  if (self !== null) {
    const foresightActiveRemainingSec = Math.max(
      0,
      self.cooldowns.foresightActiveUntilTick - currentTick,
    ) * FIXED_STEP_SEC;
    const foresightCooldownRemainingSec = Math.max(
      0,
      self.cooldowns.foresightCooldownUntilTick - currentTick,
    ) * FIXED_STEP_SEC;
    abilities.push(
      buildAbility({
        accent: tuning.visuals.abilities.foresightColor,
        id: "foresight",
        keyLabel: "Q",
        label: "Foresight",
        mode:
          foresightActiveRemainingSec > 0
            ? "active"
            : foresightCooldownRemainingSec > 0
              ? "cooldown"
              : "ready",
        remainingSec:
          foresightActiveRemainingSec > 0
            ? foresightActiveRemainingSec
            : foresightCooldownRemainingSec,
        statusText:
          foresightActiveRemainingSec > 0
            ? "Active"
            : foresightCooldownRemainingSec > 0
              ? "Cooldown"
              : "Ready",
        durationSec:
          foresightActiveRemainingSec > 0
            ? foresightSettings.durationSec
            : foresightSettings.cooldownSec,
      }),
    );

    const shieldActiveRemainingSec = Math.max(
      0,
      (playerPlanet?.shieldActiveUntilTick ?? 0) - currentTick,
    ) * FIXED_STEP_SEC;
    const shieldCooldownRemainingSec = Math.max(
      0,
      self.cooldowns.shieldCooldownUntilTick - currentTick,
    ) * FIXED_STEP_SEC;
    abilities.push(
      buildAbility({
        accent: tuning.visuals.abilities.shieldColor,
        id: "shield",
        keyLabel: "W",
        label: "Shield",
        mode:
          shieldActiveRemainingSec > 0
            ? "active"
            : shieldCooldownRemainingSec > 0
              ? "cooldown"
              : "ready",
        remainingSec:
          shieldActiveRemainingSec > 0
            ? shieldActiveRemainingSec
            : shieldCooldownRemainingSec,
        statusText:
          shieldActiveRemainingSec > 0
            ? "Active"
            : shieldCooldownRemainingSec > 0
              ? "Cooldown"
              : "Ready",
        durationSec:
          shieldActiveRemainingSec > 0
            ? shieldSettings.durationSec
            : shieldSettings.cooldownSec,
      }),
    );

    const boostRecoveryRemainingSec =
      self.cooldowns.nextBoostChargeAtTick === undefined
        ? 0
        : Math.max(0, self.cooldowns.nextBoostChargeAtTick - currentTick) *
          FIXED_STEP_SEC;
    abilities.push(
      buildAbility({
        accent: tuning.visuals.abilities.boostColor,
        id: "boost",
        keyLabel: "E",
        label: "Boost",
        mode:
          self.boostCharges > 0
            ? "ready"
            : boostRecoveryRemainingSec > 0
              ? "cooldown"
              : "ready",
        remainingSec: boostRecoveryRemainingSec,
        statusText:
          self.boostCharges > 0
            ? `${self.boostCharges} charge${self.boostCharges === 1 ? "" : "s"}`
            : boostRecoveryRemainingSec > 0
              ? "Charging"
              : "Ready",
        durationSec: boostSettings.cooldownSec,
      }),
    );

    const droneRemainingSec =
      activeDrone === null
        ? Math.max(0, self.cooldowns.droneCooldownUntilTick - currentTick) *
          FIXED_STEP_SEC
        : Math.max(0, activeDrone.ttlUntilTick - currentTick) * FIXED_STEP_SEC;
    abilities.push(
      buildAbility({
        accent:
          activeDrone?.mode === "return"
            ? tuning.visuals.drone.returnColor
            : tuning.visuals.drone.activeColor,
        id: "drone",
        keyLabel: "4",
        label: "Drone",
        mode:
          activeDrone !== null
            ? "active"
            : droneRemainingSec > 0
              ? "cooldown"
              : "ready",
        remainingSec: droneRemainingSec,
        statusText:
          activeDrone !== null
            ? activeDrone.mode === "return"
              ? "Returning"
              : "Active"
            : droneRemainingSec > 0
              ? "Cooldown"
              : "Ready",
        durationSec: activeDrone !== null ? DRONE_SPEC.ttlSec : DRONE_SPEC.cooldownSec,
      }),
    );

    if (self.wildcardSlot !== undefined) {
      abilities.push(
        buildAbility({
          accent: tuning.visuals.abilities.wildcardColor,
          id: "wildcard",
          keyLabel: "R",
          label: "Wildcard",
          mode: "ready",
          statusText: self.wildcardSlot,
        }),
      );
    }
  }

  const killFeed = eventLog
    .map((entry) => {
      const text = describeEvent(entry.event, rosterNameByPlayerId);
      if (text === null) {
        return null;
      }

      return {
        accent:
          entry.event.kind === "kill"
            ? tuning.visuals.abilities.wildcardColor
            : tuning.visuals.abilities.boostColor,
        ageSec: Math.max(0, (recentEventsNowMs - entry.receivedAtMs) / 1000),
        id: entry.id,
        text,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => entry.ageSec <= KILL_FEED_WINDOW_SEC);

  const weapons =
    self === null
      ? []
      : (["light", "heavy", "seeker"] as const).map((kind) => ({
          accent: tuning.visuals.rockets[kind].hudAccent,
          ammo: self.ammo[kind],
          kind,
          label: WEAPON_LABELS[kind],
          maxAmmo: ROCKET_SPECS[kind].maxAmmo,
          reloadRemainingSec:
            Math.max(
              0,
              self.cooldowns[
                kind === "light"
                  ? "lightReloadUntilTick"
                  : kind === "heavy"
                    ? "heavyReloadUntilTick"
                    : "seekerReloadUntilTick"
              ] - currentTick,
            ) * FIXED_STEP_SEC,
          selected: kind === selectedWeapon,
        }));

  return {
    ...createInitialHudState(),
    abilities,
    alivePlayerCount,
    blackHoleActive: world?.blackHole !== undefined,
    blackHoleRemainingSec,
    blackHoleSettings: { ...blackHoleSettings },
    blackHoleWarning:
      world?.blackHole === undefined && blackHoleRemainingSec > 0 && blackHoleRemainingSec <= 60,
    boostSettings: { ...boostSettings },
    cacheBadgeScale: tuning.visuals.caches.badgeScale,
    connection: connectionState,
    contextualShortcuts: buildContextualShortcuts(controlsEnabled),
    controlMode: activeDrone !== null ? "drone" : "planet",
    currentPresetId: "authoritative-match",
    droneCargoLabel: describeCacheContents(activeDrone?.cargo),
    foresightSettings: { ...foresightSettings },
    hudOpacity: 1,
    killFeed,
    planetAuraGap: tuning.visuals.planets.auraGap,
    planetAuraScale: tuning.visuals.planets.auraScale,
    planetBodyScale: tuning.visuals.planets.bodyScale,
    playerArchetype:
      playerPlanet === null ? "--" : ARCHETYPES[playerPlanet.archetype].name,
    playerHp: playerPlanet?.hp ?? 0,
    playerLabel:
      playerPlanet === null
        ? playerId === null
          ? "Awaiting match"
          : (rosterNameByPlayerId.get(playerId) ?? "Pilot")
        : (rosterNameByPlayerId.get(playerPlanet.playerId) ?? "Pilot"),
    primaryShortcuts: buildShortcuts(controlsEnabled),
    sandboxControlsEnabled: controlsEnabled,
    selectedWeapon,
    shieldSettings,
    timerElapsedSec,
    totalPlayerCount,
    weapons,
  };
};
