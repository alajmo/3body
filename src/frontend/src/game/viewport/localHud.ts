import {
  ARENA_RADIUS,
  FIXED_STEP_SEC,
  ROCKET_SPECS,
  getShieldLoadCapacity,
  type AbilitySpec,
  type BlackHoleSpec,
  type BoostSpec,
  type RocketKind,
} from "@3body/shared";
import type {
  CombatSandboxDebugSnapshot,
  CombatSandboxState,
} from "../combatSandbox";
import { getActiveCombatSuns } from "../combatSandbox";
import type {
  GameViewportDebugItem,
  GameViewportHudState,
  GameViewportKillFeedEntry,
  GameViewportPlanetBar,
  GameViewportShortcut,
  HudStatusMode,
} from "../viewportHud";
import { createHudMinimapState, getPlayerMotionHud } from "../viewportHud";
import { getForesightMeterProgress } from "./foresightMeter";
import type { ViewportPerformanceSnapshot } from "./performanceProfiler";
import type { ViewportEffectsQuality } from "./renderQuality";

interface LocalSandboxHudColors {
  boost: string;
  foresight: string;
  shield: string;
  weapon: Record<RocketKind, { accent: string }>;
  wildcard: string;
}

interface BuildLocalSandboxHudStateParams {
  blackHoleRemainingSec: number;
  blackHoleSettings: BlackHoleSpec;
  botsEnabled: boolean;
  boostMode: HudStatusMode;
  boostRecoveryDurationSec: number;
  boostRecoveryRemainingSec: number;
  boostSettings: BoostSpec;
  cacheBadgeScale: number;
  colors: LocalSandboxHudColors;
  controlsEnabled: boolean;
  currentEffectsQuality: ViewportEffectsQuality;
  currentMaxPixelRatio: number;
  currentPresetId: string;
  currentSsaaLevel: number;
  currentState: Pick<
    CombatSandboxState,
    | "blackHole"
    | "caches"
    | "debris"
    | "elapsedSec"
    | "impactBursts"
    | "planets"
    | "player"
    | "rockets"
    | "suns"
    | "tick"
  >;
  debug: CombatSandboxDebugSnapshot;
  foresightActiveRemainingSec: number;
  foresightCooldownRemainingSec: number;
  foresightMode: HudStatusMode;
  foresightSettings: AbilitySpec;
  fullViewEnabled: boolean;
  killFeed: GameViewportKillFeedEntry[];
  planetAuraGap: number;
  planetAuraScale: number;
  planetBars?: GameViewportPlanetBar[];
  planetBodyScale: number;
  playerDamageFlash: number;
  playerHudFlicker: number;
  playerHpPulse: number;
  playerLabel: string;
  profilingEnabled: boolean;
  profilerSnapshot: ViewportPerformanceSnapshot | null;
  runtimeStats: {
    fps: number;
    frameTimeMs: number;
  };
  sandboxPaused: boolean;
  selectedWeapon: RocketKind;
  shieldLoad: number;
  shieldMaxLoad: number;
  shieldMode: HudStatusMode;
  shieldSettings: AbilitySpec;
}

const getRemainingRatio = (remainingSec: number, totalSec: number): number => {
  if (!(totalSec > 0)) {
    return remainingSec > 0 ? 1 : 0;
  }

  return Math.min(Math.max(remainingSec / totalSec, 0), 1);
};

const formatSeconds = (valueSec: number): string =>
  valueSec >= 10 ? `${Math.round(valueSec)}s` : `${valueSec.toFixed(1)}s`;

const getShieldDisplayCapacity = ({
  currentState,
  shieldMaxLoad,
}: Pick<BuildLocalSandboxHudStateParams, "currentState" | "shieldMaxLoad">) => {
  const playerPlanet =
    currentState.planets.find(
      (planet) => planet.id === currentState.player.planetId,
    ) ?? null;
  if (playerPlanet === null) {
    return Math.max(shieldMaxLoad, 0);
  }

  const baseShieldCapacity = getShieldLoadCapacity(playerPlanet.archetype);
  const extendedShieldCapacity =
    shieldMaxLoad > baseShieldCapacity
      ? getShieldLoadCapacity(playerPlanet.archetype, true)
      : baseShieldCapacity;
  return Math.max(extendedShieldCapacity, shieldMaxLoad, 0);
};

const getShieldLoadRatio = ({
  currentState,
  shieldLoad,
  shieldMaxLoad,
}: Pick<
  BuildLocalSandboxHudStateParams,
  "currentState" | "shieldLoad" | "shieldMaxLoad"
>) => {
  const shieldDisplayCapacity = getShieldDisplayCapacity({
    currentState,
    shieldMaxLoad,
  });
  return shieldDisplayCapacity > 0
    ? Math.min(Math.max(shieldLoad / shieldDisplayCapacity, 0), 1)
    : 0;
};

const formatProfilerTiming = (
  latestMs: number,
  averageMs: number,
  maxMs: number,
): string =>
  `${latestMs.toFixed(2)} ms · avg ${averageMs.toFixed(2)} · max ${maxMs.toFixed(2)}`;

const formatProfilerScalar = (
  latest: number,
  average: number,
  max: number,
): string =>
  `${latest.toFixed(1)} · avg ${average.toFixed(1)} · max ${max.toFixed(1)}`;

const weaponLabel = (rocketKind: RocketKind): string => {
  switch (rocketKind) {
    case "light":
      return "Light";
    case "heavy":
      return "Heavy";
    case "seeker":
      return "Seeker";
  }
};

const buildProfilerDebugItems = ({
  currentEffectsQuality,
  currentMaxPixelRatio,
  currentSsaaLevel,
  currentState,
  debug,
  profilerSnapshot,
  profilingEnabled,
}: Pick<
  BuildLocalSandboxHudStateParams,
  | "currentEffectsQuality"
  | "currentMaxPixelRatio"
  | "currentSsaaLevel"
  | "currentState"
  | "debug"
  | "profilerSnapshot"
  | "profilingEnabled"
>): GameViewportDebugItem[] => {
  const profilerItems =
    !profilingEnabled ||
    profilerSnapshot === null ||
    profilerSnapshot.frames <= 0
      ? []
      : [
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
            label: "Sim CPU",
            value: formatProfilerTiming(
              profilerSnapshot.simulation.latestMs,
              profilerSnapshot.simulation.averageMs,
              profilerSnapshot.simulation.maxMs,
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
            label: "Steps / frame",
            value: formatProfilerScalar(
              profilerSnapshot.steps.latest,
              profilerSnapshot.steps.average,
              profilerSnapshot.steps.max,
            ),
          },
          {
            label: "Quality",
            value: `PR ${currentMaxPixelRatio.toFixed(1)} · SSAA ${currentSsaaLevel} · FX ${currentEffectsQuality}`,
          },
          {
            label: "Entities",
            value: `P ${currentState.planets.length} · R ${currentState.rockets.length} · C ${currentState.caches.length}`,
          },
          {
            label: "FX",
            value: `Debris ${currentState.debris.length} · Impacts ${currentState.impactBursts.length}`,
          },
        ];
  const focusedAiItems =
    debug.aiFocused === null
      ? []
      : [
          {
            label: "AI Intent",
            value: `${debug.aiFocused.intent} · ${debug.aiFocused.executionState}`,
          },
          {
            label: "AI Reason",
            value: debug.aiFocused.reason,
          },
          ...(debug.aiFocused.shotSummary === null
            ? []
            : [
                {
                  label: "AI Shot",
                  value: debug.aiFocused.shotSummary,
                },
              ]),
        ];
  const botSummaryItems = debug.aiFocused
    ? []
    : debug.aiSummaries.slice(0, 2).map((summary, index) => ({
        label: `AI ${index + 1}`,
        value: `${summary.label}: ${summary.intent} -> ${summary.targetLabel ?? "--"}`,
      }));

  return [...profilerItems, ...focusedAiItems, ...botSummaryItems];
};

const buildPrimaryShortcuts = (
  params: BuildLocalSandboxHudStateParams,
): GameViewportShortcut[] =>
  params.controlsEnabled
    ? [
        {
          active: params.selectedWeapon === "light",
          detail: `${params.currentState.player.ammo.light}/${ROCKET_SPECS.light.maxAmmo}`,
          id: "weapon-light",
          keyLabel: "1",
          label: "Light",
        },
        {
          active: params.selectedWeapon === "heavy",
          detail: `${params.currentState.player.ammo.heavy}`,
          id: "weapon-heavy",
          keyLabel: "2",
          label: "Heavy",
        },
        {
          active: params.selectedWeapon === "seeker",
          detail: `${params.currentState.player.ammo.seeker}`,
          id: "weapon-seeker",
          keyLabel: "3",
          label: "Seeker",
        },
        {
          active: params.foresightMode === "active",
          detail:
            params.foresightMode === "ready"
              ? "ready"
              : formatSeconds(
                  params.foresightMode === "active"
                    ? params.foresightActiveRemainingSec
                    : params.foresightCooldownRemainingSec,
                ),
          id: "foresight",
          keyLabel: "E",
          label: "Foresight",
        },
        {
          active: params.shieldMode === "active",
          detail: `${Math.round(getShieldLoadRatio(params) * 100)}%`,
          id: "shield",
          keyLabel: "Q",
          label: "Shield",
        },
        {
          active: params.boostMode === "cooldown",
          detail:
            params.boostMode === "ready"
              ? "ready"
              : formatSeconds(params.boostRecoveryRemainingSec),
          id: "boost",
          keyLabel: "W",
          label: "Boost",
        },
        ...(params.debug.gravityPulseHeld
          ? [
              {
                active: true,
                id: "gravity-pulse",
                keyLabel: "G",
                label: "Gravity Pulse",
              },
            ]
          : []),
        ...(params.debug.cloakHeld
          ? [
              {
                active: true,
                id: "cloak",
                keyLabel: "C",
                label: "Cloak",
              },
            ]
          : []),
      ]
    : [];

const buildContextualShortcuts = (
  _params: BuildLocalSandboxHudStateParams,
): GameViewportShortcut[] => [];

const buildAbilities = (
  params: BuildLocalSandboxHudStateParams,
): GameViewportHudState["abilities"] =>
  params.controlsEnabled
    ? [
        {
          accent: params.colors.foresight,
          id: "foresight",
          keyLabel: "E",
          label: "Foresight",
          mode: params.foresightMode,
          progress: getForesightMeterProgress({
            activeUntilTick:
              params.currentState.player.foresightActiveUntilTick,
            activeDurationTicks:
              params.currentState.player.foresightDurationTicks,
            cooldownUntilTick:
              params.currentState.player.foresightCooldownUntilTick,
            currentTick: params.currentState.tick,
            settings: params.foresightSettings,
          }),
          statusText:
            params.foresightMode === "active"
              ? `active ${formatSeconds(params.foresightActiveRemainingSec)}`
              : params.foresightMode === "cooldown"
                ? `${formatSeconds(params.foresightCooldownRemainingSec)} cd`
                : "ready",
        },
        {
          accent: params.colors.shield,
          id: "shield",
          keyLabel: "Q",
          label: "Shield",
          mode: params.shieldMode,
          progress: getShieldLoadRatio(params),
          statusText:
            params.shieldMode === "active"
              ? `online ${Math.round(getShieldLoadRatio(params) * 100)}%`
              : params.shieldMode === "cooldown"
                ? `charging ${Math.round(getShieldLoadRatio(params) * 100)}%`
                : "ready",
          valueText: `${Math.round(getShieldLoadRatio(params) * 100)}%`,
        },
        {
          accent: params.colors.boost,
          id: "boost",
          keyLabel: "W",
          label: "Boost",
          mode: params.boostMode,
          progress:
            params.boostMode === "cooldown"
              ? 1 -
                getRemainingRatio(
                  params.boostRecoveryRemainingSec,
                  params.boostRecoveryDurationSec,
                )
              : 1,
          statusText:
            params.boostMode === "cooldown"
              ? `lock ${formatSeconds(params.boostRecoveryRemainingSec)}`
              : "ready",
          valueText: "INF",
        },
        ...(params.debug.gravityPulseHeld
          ? [
              {
                accent: params.colors.wildcard,
                id: "gravityPulse" as const,
                keyLabel: "G",
                label: "Gravity Pulse",
                mode: "ready" as const,
                progress: 1,
                statusText: "Gravity Pulse",
                valueText: "armed",
              },
            ]
          : []),
        ...(params.debug.cloakHeld
          ? [
              {
                accent: params.colors.wildcard,
                id: "cloak" as const,
                keyLabel: "C",
                label: "Cloak",
                mode: "ready" as const,
                progress: 1,
                statusText: "Cloak",
                valueText: "armed",
              },
            ]
          : []),
      ]
    : [];

const buildWeapons = (
  params: BuildLocalSandboxHudStateParams,
): GameViewportHudState["weapons"] =>
  params.controlsEnabled
    ? [
        ...(
          ["light", "heavy", "seeker"] as const satisfies readonly RocketKind[]
        ).map((rocketKind) => ({
          accent: params.colors.weapon[rocketKind].accent,
          ammo: params.currentState.player.ammo[rocketKind],
          kind: rocketKind,
          label: weaponLabel(rocketKind),
          maxAmmo: ROCKET_SPECS[rocketKind].maxAmmo,
          reloadRemainingSec:
            Math.max(
              0,
              params.currentState.player.reloadUntilTick[rocketKind] -
                params.currentState.tick,
            ) * FIXED_STEP_SEC,
          selected: params.selectedWeapon === rocketKind,
        })),
      ]
    : [];

export const buildLocalSandboxHudState = (
  params: BuildLocalSandboxHudStateParams,
): GameViewportHudState => {
  const playerPlanet =
    params.currentState.planets.find(
      (planet) => planet.id === params.currentState.player.planetId,
    ) ?? null;
  const playerMotion = getPlayerMotionHud(playerPlanet?.vel);
  const highlightedMinimapEntity = playerPlanet?.alive
    ? {
        id: playerPlanet.id,
        kind: "planet" as const,
      }
    : null;

  return {
    abilities: buildAbilities(params),
    alivePlayerCount: params.debug.alivePlanets,
    blackHoleActive: params.debug.blackHoleActive,
    blackHoleRemainingSec: params.blackHoleRemainingSec,
    blackHoleSettings: { ...params.blackHoleSettings },
    blackHoleWarning:
      !params.debug.blackHoleActive && params.blackHoleRemainingSec <= 60,
    botsEnabled: params.botsEnabled,
    boostSettings: { ...params.boostSettings },
    cacheBadgeScale: params.cacheBadgeScale,
    connection: {
      extrapolating: false,
      fps: params.runtimeStats.fps,
      frameTimeMs: params.runtimeStats.frameTimeMs,
      label: params.controlsEnabled ? "Local" : "Periodic solution viewer",
      rttMs: 0,
      state: "local",
    },
    contextualShortcuts: buildContextualShortcuts(params),
    currentPresetId: params.currentPresetId,
    damageFlash: params.playerDamageFlash,
    debugItems: buildProfilerDebugItems(params),
    foresightSettings: { ...params.foresightSettings },
    hudFlicker: params.playerHudFlicker,
    hudOpacity: 1,
    killFeed: params.killFeed,
    minimap: createHudMinimapState({
      arenaRadius: ARENA_RADIUS,
      blackHole: params.currentState.blackHole,
      caches: params.currentState.caches,
      highlightedEntity: highlightedMinimapEntity,
      planets: params.currentState.planets.filter((planet) => planet.alive),
      suns: getActiveCombatSuns(params.currentState.suns),
    }),
    planetAuraGap: params.planetAuraGap,
    planetAuraScale: params.planetAuraScale,
    planetBars: params.planetBars ?? [],
    planetBodyScale: params.planetBodyScale,
    playerArchetype: params.debug.playerArchetypeName,
    playerHeadingDeg: playerMotion.playerHeadingDeg,
    playerHp: params.debug.playerHp,
    playerHpPulse: params.playerHpPulse,
    playerLabel: params.playerLabel,
    playerSpeed: playerMotion.playerSpeed,
    primaryShortcuts: buildPrimaryShortcuts(params),
    profilingEnabled: params.profilingEnabled,
    sandboxControlsEnabled: params.controlsEnabled,
    sandboxPaused: params.sandboxPaused,
    selectedWeapon: params.selectedWeapon,
    shieldSettings: { ...params.shieldSettings },
    timerElapsedSec: params.currentState.elapsedSec,
    totalPlayerCount: params.currentState.planets.length,
    weapons: buildWeapons(params),
  };
};
