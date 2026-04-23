import type { CombatSandboxState } from "../combatSandbox";
import type { BlackHoleSwallowState } from "./blackHoleVisuals";
import {
  createLocalViewportBlackHoleSwallowTracker,
  type LocalViewportBlackHoleSwallowTracker,
} from "./localViewportScene";
import {
  clearSharedCombatPlanetExplosions,
  queueSharedCombatPlanetExplosion,
  type SharedCombatPlanetExplosionSource,
  type SharedCombatPlanetExplosionState,
  type SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";

export interface LocalViewportTransientEvents {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  blackHoleSwallowTracker: LocalViewportBlackHoleSwallowTracker;
}

export const createLocalViewportTransientEvents = (
  initialState: CombatSandboxState,
): LocalViewportTransientEvents => ({
  activeBlackHoleSwallowEffects: [],
  activePlanetExplosions: [],
  blackHoleSwallowTracker:
    createLocalViewportBlackHoleSwallowTracker(initialState),
});

export const clearLocalViewportPlanetExplosionEvents = ({
  events,
  inactivePlanetExplosionVisuals,
}: {
  events: LocalViewportTransientEvents;
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
}) => {
  clearSharedCombatPlanetExplosions({
    activePlanetExplosions: events.activePlanetExplosions,
    inactivePlanetExplosionVisuals,
  });
};

export const queueLocalViewportPlanetExplosionEvent = ({
  events,
  inactivePlanetExplosionVisuals,
  planet,
  startedAtSec,
}: {
  events: LocalViewportTransientEvents;
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
  planet: SharedCombatPlanetExplosionSource;
  startedAtSec: number;
}) => {
  queueSharedCombatPlanetExplosion({
    activePlanetExplosions: events.activePlanetExplosions,
    inactivePlanetExplosionVisuals,
    planet,
    startedAtSec,
  });
};
