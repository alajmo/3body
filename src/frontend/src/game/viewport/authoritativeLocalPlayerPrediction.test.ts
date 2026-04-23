import type { PlanetPublic, World } from "@3body/shared";
import {
  advanceWorldOrbitStarMotion,
  FIXED_STEP_SEC,
  getUmbraDragStepMultiplier,
  scale,
  SIM_HZ,
  stepBody,
  stepNeutronStars,
  stepSunsWithOrbitMotion,
} from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  createAuthoritativeLocalPlayerPredictionSmoothingState,
  predictAuthoritativeLocalPlayerPlanet,
  syncAuthoritativeLocalPlayerPrediction,
} from "./authoritativeLocalPlayerPrediction";

const buildPlanet = (overrides: Partial<PlanetPublic> = {}): PlanetPublic => ({
  archetype: "terra",
  debuffs: {},
  hp: 100,
  id: 1,
  kind: "planet",
  playerId: "player",
  pos: { x: 10, y: 20 },
  radius: 12,
  shieldActive: false,
  shieldAimDir: { x: 1, y: 0 },
  shieldLoad: 5,
  shieldMaxLoad: 10,
  vel: { x: 40, y: -20 },
  ...overrides,
});

const buildWorld = (overrides: Partial<World> = {}): World => ({
  arenaRadius: 2_000,
  caches: [],
  debris: [],
  neutronStars: [],
  planets: [buildPlanet()],
  rockets: [],
  suns: [],
  ...overrides,
});

const expectVec2CloseTo = (
  actual: { x: number; y: number } | undefined,
  expected: { x: number; y: number },
) => {
  expect(actual?.x).toBeCloseTo(expected.x, 6);
  expect(actual?.y).toBeCloseTo(expected.y, 6);
};

const predictWorldPlanetManually = ({
  player,
  predictionMs,
  snapshotTick,
  world,
}: {
  player: PlanetPublic;
  predictionMs: number;
  snapshotTick: number;
  world: World;
}): PlanetPublic => {
  const cappedPredictionSec = Math.min(0.05, Math.max(0, predictionMs * 0.001));
  const dragStepMultiplier = getUmbraDragStepMultiplier(SIM_HZ);
  let predictedPlanet: PlanetPublic = {
    ...player,
    debuffs: { ...player.debuffs },
    pos: { x: player.pos.x, y: player.pos.y },
    shieldAimDir: {
      x: player.shieldAimDir.x,
      y: player.shieldAimDir.y,
    },
    vel: { x: player.vel.x, y: player.vel.y },
  };
  let predictedSuns = world.suns;
  let predictedNeutronStars = world.neutronStars;
  let orbitStarMotion = world.orbitStarMotion;
  let simulatedTick = snapshotTick;
  let remainingPredictionSec = cappedPredictionSec;

  while (remainingPredictionSec > 1e-6) {
    const stepSec = Math.min(FIXED_STEP_SEC, remainingPredictionSec);
    simulatedTick += 1;
    const nextTick = simulatedTick;
    const nextSuns = stepSunsWithOrbitMotion(
      predictedSuns,
      stepSec,
      world.blackHole,
      orbitStarMotion,
    );
    const nextNeutronStars = stepNeutronStars(
      predictedNeutronStars,
      stepSec,
      world.blackHole,
    );
    const nextOrbitStarMotion = advanceWorldOrbitStarMotion(
      orbitStarMotion,
      stepSec,
      nextSuns,
    );
    const normalizedDebuffs =
      predictedPlanet.debuffs.dragUntilTick !== undefined &&
      predictedPlanet.debuffs.dragUntilTick <= nextTick
        ? {}
        : { ...predictedPlanet.debuffs };
    const steppedPlanet = stepBody(
      {
        ...predictedPlanet,
        debuffs: normalizedDebuffs,
      },
      nextSuns,
      stepSec,
      world.blackHole,
      nextNeutronStars,
    );
    const dragActive =
      predictedPlanet.debuffs.dragUntilTick !== undefined &&
      predictedPlanet.debuffs.dragUntilTick > nextTick;

    predictedPlanet = dragActive
      ? {
          ...steppedPlanet,
          vel: scale(
            steppedPlanet.vel,
            dragStepMultiplier ** (stepSec / FIXED_STEP_SEC),
          ),
        }
      : steppedPlanet;
    predictedSuns = nextSuns;
    predictedNeutronStars = nextNeutronStars;
    orbitStarMotion = nextOrbitStarMotion;
    remainingPredictionSec -= stepSec;
  }

  return predictedPlanet;
};

describe("authoritativeLocalPlayerPrediction", () => {
  it("predicts the local player forward from the latest snapshot velocity", () => {
    const predicted = predictAuthoritativeLocalPlayerPlanet({
      playerId: "player",
      predictionMs: 25,
      snapshotTick: 100,
      world: buildWorld(),
    });

    expectVec2CloseTo(predicted?.pos, { x: 11, y: 19.5 });
    expectVec2CloseTo(predicted?.vel, { x: 40, y: -20 });
  });

  it("caps local prediction so stale snapshots do not run too far ahead", () => {
    const predicted = predictAuthoritativeLocalPlayerPlanet({
      playerId: "player",
      predictionMs: 500,
      snapshotTick: 100,
      world: buildWorld(),
    });

    expectVec2CloseTo(predicted?.pos, { x: 12, y: 19 });
  });

  it("steps gravity sources with the shared sim instead of linear velocity only", () => {
    const world = buildWorld({
      suns: [
        {
          id: 9,
          kind: "sun",
          mass: 2.4e8,
          pos: { x: 0, y: 0 },
          radius: 32,
          vel: { x: 0, y: 0 },
        },
      ],
      planets: [
        buildPlanet({
          pos: { x: 180, y: 0 },
          vel: { x: 0, y: 120 },
        }),
      ],
    });
    const expected = predictWorldPlanetManually({
      player: world.planets[0]!,
      predictionMs: 25,
      snapshotTick: 240,
      world,
    });
    const predicted = predictAuthoritativeLocalPlayerPlanet({
      playerId: "player",
      predictionMs: 25,
      snapshotTick: 240,
      world,
    });

    expect(predicted?.pos.x).toBeCloseTo(expected.pos.x, 6);
    expect(predicted?.pos.y).toBeCloseTo(expected.pos.y, 6);
    expect(predicted?.vel.x).toBeCloseTo(expected.vel.x, 6);
    expect(predicted?.vel.y).toBeCloseTo(expected.vel.y, 6);
    expect(predicted?.pos.x).toBeLessThan(180);
  });

  it("applies shared drag damping while the debuff is still active", () => {
    const world = buildWorld({
      planets: [
        buildPlanet({
          debuffs: { dragUntilTick: 104 },
          vel: { x: 60, y: 0 },
        }),
      ],
    });
    const expected = predictWorldPlanetManually({
      player: world.planets[0]!,
      predictionMs: 25,
      snapshotTick: 100,
      world,
    });
    const predicted = predictAuthoritativeLocalPlayerPlanet({
      playerId: "player",
      predictionMs: 25,
      snapshotTick: 100,
      world,
    });

    expect(predicted?.pos.x).toBeCloseTo(expected.pos.x, 6);
    expect(predicted?.vel.x).toBeCloseTo(expected.vel.x, 6);
    expect(predicted?.vel.x ?? 0).toBeLessThan(world.planets[0]!.vel.x);
  });

  it("updates the render-world player planet in place", () => {
    const renderWorld = buildWorld({
      planets: [
        buildPlanet({
          pos: { x: 0, y: 0 },
          vel: { x: 0, y: 0 },
        }),
      ],
    });

    const synced = syncAuthoritativeLocalPlayerPrediction({
      playerId: "player",
      predictionMs: 25,
      renderWorld,
      snapshotTick: 100,
      snapshotWorld: buildWorld(),
    });

    expect(synced).toBe(renderWorld.planets[0]);
    expectVec2CloseTo(renderWorld.planets[0]!.pos, { x: 11, y: 19.5 });
    expectVec2CloseTo(renderWorld.planets[0]!.vel, { x: 40, y: -20 });
  });

  it("smooths local correction updates after initialization", () => {
    const smoothingState =
      createAuthoritativeLocalPlayerPredictionSmoothingState();
    const renderWorld = buildWorld({
      planets: [
        buildPlanet({
          pos: { x: 0, y: 0 },
          vel: { x: 0, y: 0 },
        }),
      ],
    });

    const first = syncAuthoritativeLocalPlayerPrediction({
      playerId: "player",
      predictionMs: 0,
      renderWorld,
      smoothing: {
        frameDeltaSec: 1 / 60,
        state: smoothingState,
      },
      snapshotTick: 100,
      snapshotWorld: buildWorld({
        planets: [
          buildPlanet({
            pos: { x: 10, y: 20 },
            vel: { x: 0, y: 0 },
          }),
        ],
      }),
    });

    const second = syncAuthoritativeLocalPlayerPrediction({
      playerId: "player",
      predictionMs: 0,
      renderWorld,
      smoothing: {
        frameDeltaSec: 1 / 60,
        state: smoothingState,
      },
      snapshotTick: 102,
      snapshotWorld: buildWorld({
        planets: [
          buildPlanet({
            pos: { x: 20, y: 20 },
            vel: { x: 0, y: 0 },
          }),
        ],
      }),
    });

    expect(first).toBe(renderWorld.planets[0]);
    expect(second).toBe(renderWorld.planets[0]);
    expect(renderWorld.planets[0]!.pos.x).toBeGreaterThan(10);
    expect(renderWorld.planets[0]!.pos.x).toBeLessThan(20);
    expect(renderWorld.planets[0]!.pos.y).toBeCloseTo(20, 6);
  });

  it("snaps local smoothing across large corrections", () => {
    const smoothingState =
      createAuthoritativeLocalPlayerPredictionSmoothingState();
    const renderWorld = buildWorld();

    syncAuthoritativeLocalPlayerPrediction({
      playerId: "player",
      predictionMs: 0,
      renderWorld,
      smoothing: {
        frameDeltaSec: 1 / 60,
        state: smoothingState,
      },
      snapshotTick: 100,
      snapshotWorld: buildWorld(),
    });
    syncAuthoritativeLocalPlayerPrediction({
      playerId: "player",
      predictionMs: 0,
      renderWorld,
      smoothing: {
        frameDeltaSec: 1 / 60,
        state: smoothingState,
      },
      snapshotTick: 102,
      snapshotWorld: buildWorld({
        planets: [
          buildPlanet({
            pos: { x: 1_000, y: -500 },
            vel: { x: 0, y: 0 },
          }),
        ],
      }),
    });

    expectVec2CloseTo(renderWorld.planets[0]!.pos, { x: 1_000, y: -500 });
  });
});
