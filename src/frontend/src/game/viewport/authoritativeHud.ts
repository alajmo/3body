import {
  ARCHETYPES,
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  FIXED_STEP_SEC,
  getShieldLoadCapacity,
  type PlanetPrivateState,
  type PlanetPublic,
  ROCKET_SPECS,
  type RocketKind,
  SHIELD_SPEC,
  type SnapshotEvent,
  type World,
} from "@3body/shared";
import type { AuthoritativeEventRecord } from "../authoritativeMatchRuntime";
import { getPlanetArchetypeVisuals } from "../planetVisualTuning";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import {
  createHudMinimapState,
  createInitialHudState,
  type GameViewportConnectionState,
  type GameViewportHudAbility,
  type GameViewportHudState,
  type GameViewportShortcut,
  getPlayerMotionHud,
} from "../viewportHud";
import type {
  AuthoritativeNetworkDiagnosticsSnapshot,
  AuthoritativeNetworkTypeRate,
  AuthoritativeRenderDiagnostics,
} from "./authoritativeDiagnostics";
import type { ViewportPerformanceSnapshot } from "./performanceProfiler";
import type { ViewportEffectsQuality } from "./renderQuality";

const KILL_FEED_WINDOW_SEC = 4;
const WEAPON_LABELS: Record<RocketKind, string> = {
  heavy: "Heavy",
  light: "Light",
  seeker: "Seeker",
};

const getShieldDisplayCapacity = (planet: PlanetPublic): number => {
  const baseShieldCapacity = getShieldLoadCapacity(planet.archetype);
  const extendedShieldCapacity =
    planet.shieldMaxLoad > baseShieldCapacity
      ? getShieldLoadCapacity(planet.archetype, true)
      : baseShieldCapacity;
  return Math.max(extendedShieldCapacity, planet.shieldMaxLoad, 0);
};

interface BuildAuthoritativeHudStateParams {
  connection: GameViewportConnectionState;
  controlsEnabled: boolean;
  currentEffectsQuality: ViewportEffectsQuality;
  currentTick: number;
  damageFlash: number;
  eventLog: readonly AuthoritativeEventRecord[];
  extrapolating: boolean;
  hudFlicker: number;
  currentMaxPixelRatio: number;
  currentRenderModeLabel?: string;
  playerId: string | null;
  playerPlanet: PlanetPublic | null;
  networkDiagnostics?: AuthoritativeNetworkDiagnosticsSnapshot | null;
  profilerSnapshot: ViewportPerformanceSnapshot | null;
  profilingEnabled: boolean;
  recentEventsNowMs: number;
  renderDiagnostics?: AuthoritativeRenderDiagnostics | null;
  rosterNameByPlayerId: ReadonlyMap<string, string>;
  runtimeStats: {
    fps: number;
    frameTimeMs: number;
  };
  selectedWeapon: RocketKind;
  self: PlanetPrivateState | null;
  world: World | null;
}

const formatProfilerTiming = (
  latestMs: number,
  averageMs: number,
  maxMs: number,
): string =>
  `${latestMs.toFixed(2)} ms · avg ${averageMs.toFixed(2)} · max ${maxMs.toFixed(2)}`;

const formatBytesPerSec = (bytesPerSec: number): string =>
  bytesPerSec >= 1024
    ? `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    : `${Math.round(bytesPerSec)} B/s`;

const formatMessagesPerSec = (messagesPerSec: number): string =>
  `${messagesPerSec >= 10 ? messagesPerSec.toFixed(0) : messagesPerSec.toFixed(1)} msg/s`;

const formatSnapshotRate = (snapshotsPerSec: number): string =>
  `${snapshotsPerSec >= 10 ? snapshotsPerSec.toFixed(0) : snapshotsPerSec.toFixed(1)}/s`;

const formatDiagnosticMs = (valueMs: number | null): string =>
  valueMs === null ? "--" : `${valueMs.toFixed(1)} ms`;

const formatDiagnosticTick = (tick: number | null): string =>
  tick === null ? "--" : tick.toFixed(1);

const formatSpikeAge = (lastAgeSec: number | null): string =>
  lastAgeSec === null ? "--" : `${lastAgeSec.toFixed(1)}s ago`;

const formatTypeRates = (
  rates: readonly AuthoritativeNetworkTypeRate[],
): string =>
  rates
    .map((rate) => `${rate.type} ${formatBytesPerSec(rate.bytesPerSec)}`)
    .join(" · ");

const buildProfilerDebugItems = ({
  connection,
  currentEffectsQuality,
  currentMaxPixelRatio,
  currentRenderModeLabel,
  extrapolating,
  networkDiagnostics = null,
  profilerSnapshot,
  profilingEnabled,
  renderDiagnostics = null,
  world,
}: Pick<
  BuildAuthoritativeHudStateParams,
  | "connection"
  | "currentEffectsQuality"
  | "currentMaxPixelRatio"
  | "currentRenderModeLabel"
  | "extrapolating"
  | "networkDiagnostics"
  | "profilerSnapshot"
  | "profilingEnabled"
  | "renderDiagnostics"
  | "world"
>): GameViewportHudState["debugItems"] => {
  if (!profilingEnabled) {
    return [];
  }

  const debugItems: GameViewportHudState["debugItems"] = [];

  if (profilerSnapshot !== null && profilerSnapshot.frames > 0) {
    debugItems.push(
      {
        label: "Sample",
        value: `${profilerSnapshot.frames}f · ${profilerSnapshot.sampledDurationSec.toFixed(1)}s`,
      },
      {
        label: "Frame CPU",
        value: formatProfilerTiming(
          profilerSnapshot.frameCpu.latestMs,
          profilerSnapshot.frameCpu.averageMs,
          profilerSnapshot.frameCpu.maxMs,
        ),
      },
      {
        label: "Frame Gap",
        value: formatProfilerTiming(
          profilerSnapshot.frameGap.latestMs,
          profilerSnapshot.frameGap.averageMs,
          profilerSnapshot.frameGap.maxMs,
        ),
      },
      {
        label: "Lerp CPU",
        value: formatProfilerTiming(
          profilerSnapshot.interpolation.latestMs,
          profilerSnapshot.interpolation.averageMs,
          profilerSnapshot.interpolation.maxMs,
        ),
      },
      {
        label: "Scene CPU",
        value: formatProfilerTiming(
          profilerSnapshot.renderCpu.latestMs,
          profilerSnapshot.renderCpu.averageMs,
          profilerSnapshot.renderCpu.maxMs,
        ),
      },
      {
        label: "Submit CPU",
        value: formatProfilerTiming(
          profilerSnapshot.submit.latestMs,
          profilerSnapshot.submit.averageMs,
          profilerSnapshot.submit.maxMs,
        ),
      },
      {
        label: "Spikes",
        value: `gap>${profilerSnapshot.frameGapSpikes.thresholdMs.toFixed(
          0,
        )} ${profilerSnapshot.frameGapSpikes.count} · last ${formatSpikeAge(
          profilerSnapshot.frameGapSpikes.lastAgeSec,
        )} · submit>${profilerSnapshot.submitSpikes.thresholdMs.toFixed(
          0,
        )} ${profilerSnapshot.submitSpikes.count} · last ${formatSpikeAge(
          profilerSnapshot.submitSpikes.lastAgeSec,
        )}`,
      },
    );
  }

  debugItems.push(
    {
      label: "Quality",
      value: `PR ${currentMaxPixelRatio.toFixed(1)} · FX ${currentEffectsQuality}${
        currentRenderModeLabel === undefined
          ? ""
          : ` · ${currentRenderModeLabel}`
      }`,
    },
    {
      label: "Entities",
      value: `P ${world?.planets.length ?? 0} · R ${world?.rockets.length ?? 0} · C ${world?.caches.length ?? 0}`,
    },
    {
      label: "Net State",
      value: `${connection.state}${extrapolating ? " · extrapolating" : ""}`,
    },
  );

  if (networkDiagnostics !== null) {
    debugItems.push(
      {
        label: "Net RX",
        value: `${formatBytesPerSec(
          networkDiagnostics.inboundBytesPerSec,
        )} · ${formatMessagesPerSec(networkDiagnostics.inboundMessagesPerSec)}`,
      },
      {
        label: "Net TX",
        value: `${formatBytesPerSec(
          networkDiagnostics.outboundBytesPerSec,
        )} · ${formatMessagesPerSec(
          networkDiagnostics.outboundMessagesPerSec,
        )}`,
      },
      {
        label: "Snapshots",
        value: `${formatSnapshotRate(
          networkDiagnostics.snapshotMessagesPerSec,
        )} · gap ${networkDiagnostics.snapshotGapAverageMs.toFixed(
          1,
        )}/${networkDiagnostics.snapshotGapP90Ms.toFixed(
          1,
        )}/${networkDiagnostics.snapshotGapMaxMs.toFixed(
          1,
        )} ms · late ${networkDiagnostics.snapshotLateCount}`,
      },
      {
        label: "Net Jitter",
        value: `gap>50 ${networkDiagnostics.snapshotGapOver50Count} · last ${formatSpikeAge(
          networkDiagnostics.snapshotLastGapOver50AgeMs === null
            ? null
            : networkDiagnostics.snapshotLastGapOver50AgeMs / 1000,
        )} · gap>100 ${networkDiagnostics.snapshotGapOver100Count} · last ${formatSpikeAge(
          networkDiagnostics.snapshotLastGapOver100AgeMs === null
            ? null
            : networkDiagnostics.snapshotLastGapOver100AgeMs / 1000,
        )}`,
      },
      {
        label: "Server Snap",
        value: `gap ${networkDiagnostics.serverSnapshotGapAverageMs.toFixed(
          1,
        )}/${networkDiagnostics.serverSnapshotGapP90Ms.toFixed(
          1,
        )}/${networkDiagnostics.serverSnapshotGapMaxMs.toFixed(
          1,
        )} ms · late ${networkDiagnostics.serverSnapshotLateCount}`,
      },
    );

    if (networkDiagnostics.inboundByType.length > 0) {
      debugItems.push({
        label: "RX Types",
        value: formatTypeRates(networkDiagnostics.inboundByType),
      });
    }
    if (networkDiagnostics.outboundByType.length > 0) {
      debugItems.push({
        label: "TX Types",
        value: formatTypeRates(networkDiagnostics.outboundByType),
      });
    }
  }

  if (renderDiagnostics !== null) {
    debugItems.push(
      {
        label: "Interp",
        value: `alpha ${renderDiagnostics.interpolationAlpha.toFixed(
          2,
        )} · depth ${renderDiagnostics.bufferDepth} · behind ${
          renderDiagnostics.tickBehindLatest === null
            ? "--"
            : renderDiagnostics.tickBehindLatest.toFixed(1)
        }t${renderDiagnostics.visuallyExtrapolating ? " · extrapolating" : ""}`,
      },
      {
        label: "Snap Age",
        value: `${formatDiagnosticMs(
          renderDiagnostics.latestSnapshotAgeMs,
        )} · desired ${formatDiagnosticTick(
          renderDiagnostics.desiredRenderTick,
        )} · render ${formatDiagnosticTick(renderDiagnostics.renderTick)}`,
      },
    );
  }

  return debugItems;
};

const describeEvent = (
  event: SnapshotEvent,
  rosterNameByPlayerId: ReadonlyMap<string, string>,
): string | null => {
  switch (event.kind) {
    case "kill": {
      const victim =
        rosterNameByPlayerId.get(event.victimPlayerId) ?? "Unknown";
      const killer = event.killerPlayerId
        ? (rosterNameByPlayerId.get(event.killerPlayerId) ?? "Unknown")
        : null;

      if (killer !== null) {
        return `${killer} eliminated ${victim}`;
      }

      switch (event.cause) {
        case "blackHole":
          return `${victim} fell into the Black Hole`;
        case "boundaryAsteroid":
          return `${victim} was shattered by boundary debris`;
        case "boundary":
          return `${victim} breached the arena`;
        case "neutronStar":
          return `${victim} was crushed by a neutron star`;
        case "planetCollision":
          return `${victim} collided`;
        case "sun":
          return `${victim} hit a sun`;
        case "rocket":
          return `${victim} was destroyed`;
      }

      return null;
    }
    default:
      return null;
  }
};

const buildAbility = (
  input: Omit<GameViewportHudAbility, "progress"> & {
    durationSec?: number;
    fill?: number;
    remainingSec?: number;
  },
): GameViewportHudAbility => {
  const totalDurationSec = Math.max(input.durationSec ?? 0, FIXED_STEP_SEC);
  const remainingSec = Math.max(0, input.remainingSec ?? 0);

  return {
    ...input,
    progress:
      input.fill ??
      (input.mode === "active"
        ? Math.min(1, remainingSec / totalDurationSec)
        : input.mode === "cooldown"
          ? 1 - Math.min(1, remainingSec / totalDurationSec)
          : 1),
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
          id: "shield",
          keyLabel: "Q",
          label: "Shield",
        },
        {
          id: "boost",
          keyLabel: "W",
          label: "Boost",
        },
        {
          id: "gravityPulse",
          keyLabel: "G",
          label: "Gravity Pulse",
        },
      ]
    : [];

export const buildAuthoritativeHudState = ({
  connection,
  controlsEnabled,
  currentEffectsQuality,
  currentTick,
  currentMaxPixelRatio,
  currentRenderModeLabel,
  damageFlash,
  eventLog,
  extrapolating,
  hudFlicker,
  networkDiagnostics,
  playerId,
  playerPlanet,
  profilerSnapshot,
  profilingEnabled,
  recentEventsNowMs,
  renderDiagnostics,
  rosterNameByPlayerId,
  runtimeStats,
  selectedWeapon,
  self,
  world,
}: BuildAuthoritativeHudStateParams): GameViewportHudState => {
  const tuning = getRuntimeTuningDocument();
  const initialHudState = createInitialHudState();
  const playerPlanetVisuals =
    playerPlanet === null
      ? null
      : getPlanetArchetypeVisuals(playerPlanet.archetype);
  const playerMotion = getPlayerMotionHud(playerPlanet?.vel);
  const blackHoleSettings = tuning.gameplay.blackHole ?? BLACK_HOLE_SPEC;
  const boostSettings = tuning.gameplay.abilities.boost ?? BOOST_SPEC;
  const shieldSettings = {
    cooldownSec:
      tuning.gameplay.abilities.shield?.cooldownSec ?? SHIELD_SPEC.cooldownSec,
    durationSec:
      tuning.gameplay.abilities.shield?.durationSec ?? SHIELD_SPEC.durationSec,
  };
  const alivePlayerCount = world?.planets.length ?? 0;
  const totalPlayerCount = Math.max(
    alivePlayerCount,
    rosterNameByPlayerId.size,
  );
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
    const shieldLoadRatio =
      playerPlanet !== null && playerPlanet.shieldMaxLoad > 0
        ? Math.min(
            1,
            Math.max(
              0,
              playerPlanet.shieldLoad / getShieldDisplayCapacity(playerPlanet),
            ),
          )
        : 0;
    const shieldMode =
      playerPlanet?.shieldActive === true
        ? "active"
        : playerPlanet !== null &&
            playerPlanet.shieldLoad < playerPlanet.shieldMaxLoad
          ? "cooldown"
          : "ready";
    abilities.push(
      buildAbility({
        accent: tuning.visuals.abilities.shieldColor,
        id: "shield",
        keyLabel: "Q",
        label: "Shield",
        mode: shieldMode,
        fill: shieldLoadRatio,
        statusText:
          shieldMode === "active"
            ? `Active ${Math.round(shieldLoadRatio * 100)}%`
            : shieldMode === "cooldown"
              ? `Charging ${Math.round(shieldLoadRatio * 100)}%`
              : "Ready",
        valueText: `${Math.round(shieldLoadRatio * 100)}%`,
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
        keyLabel: "W",
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

    if (self.gravityPulseHeld) {
      abilities.push(
        buildAbility({
          accent: tuning.visuals.abilities.wildcardColor,
          id: "gravityPulse",
          keyLabel: "G",
          label: "Gravity Pulse",
          mode: "ready",
          statusText: "Gravity Pulse",
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
      : [
          ...(["light", "heavy", "seeker"] as const).map((kind) => ({
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
          })),
        ];
  const highlightedMinimapEntity =
    playerPlanet !== null
      ? {
          id: playerPlanet.id,
          kind: "planet" as const,
        }
      : null;

  return {
    ...initialHudState,
    abilities,
    alivePlayerCount,
    blackHoleActive: world?.blackHole !== undefined,
    blackHoleRemainingSec,
    blackHoleSettings: { ...blackHoleSettings },
    blackHoleWarning:
      world?.blackHole === undefined &&
      blackHoleRemainingSec > 0 &&
      blackHoleRemainingSec <= 60,
    boostSettings: { ...boostSettings },
    cacheBadgeScale: tuning.visuals.caches.badgeScale,
    connection: connectionState,
    contextualShortcuts: buildContextualShortcuts(controlsEnabled),
    currentPresetId: "authoritative-match",
    debugItems: buildProfilerDebugItems({
      connection,
      currentEffectsQuality,
      currentMaxPixelRatio,
      currentRenderModeLabel,
      extrapolating,
      networkDiagnostics,
      profilerSnapshot,
      profilingEnabled,
      renderDiagnostics,
      world,
    }),
    damageFlash,
    hudFlicker,
    hudOpacity: 1,
    killFeed,
    minimap:
      world === null
        ? initialHudState.minimap
        : createHudMinimapState({
            arenaRadius: world.arenaRadius,
            blackHole: world.blackHole,
            caches: world.caches,
            highlightedEntity: highlightedMinimapEntity,
            planets: world.planets,
            suns: world.suns,
          }),
    planetAuraGap:
      playerPlanetVisuals?.auraGap ?? initialHudState.planetAuraGap,
    planetAuraScale:
      playerPlanetVisuals?.auraScale ?? initialHudState.planetAuraScale,
    planetBodyScale:
      playerPlanetVisuals?.bodyScale ?? initialHudState.planetBodyScale,
    profilingEnabled,
    playerArchetype:
      playerPlanet === null ? "--" : ARCHETYPES[playerPlanet.archetype].name,
    playerHeadingDeg: playerMotion.playerHeadingDeg,
    playerHp: playerPlanet?.hp ?? 0,
    playerLabel:
      playerPlanet === null
        ? playerId === null
          ? "Awaiting match"
          : (rosterNameByPlayerId.get(playerId) ?? "Pilot")
        : (rosterNameByPlayerId.get(playerPlanet.playerId) ?? "Pilot"),
    playerSpeed: playerMotion.playerSpeed,
    primaryShortcuts: buildShortcuts(controlsEnabled),
    sandboxControlsEnabled: controlsEnabled,
    selectedWeapon,
    shieldSettings,
    timerElapsedSec,
    totalPlayerCount,
    weapons,
  };
};
