import { EPS2, G, ROCKET_SPECS } from "./constants";
import type {
  BlackHole,
  EntityBase,
  NeutronStar,
  Rocket,
  Sun,
} from "./entities";
import { add, fromAngle, len, lenSq, normalize, scale, sub } from "./vec2";
import type { Vec2 } from "./vec2";

type GravitySource =
  | Pick<Sun, "mass" | "pos">
  | Pick<BlackHole, "mass" | "pos">
  | Pick<NeutronStar, "mass" | "pos">;

const zeroVec2 = (): Vec2 => ({ x: 0, y: 0 });

const gravityFromSource = (pos: Vec2, source: GravitySource): Vec2 => {
  const delta = sub(source.pos, pos);
  if (lenSq(delta) === 0) {
    return zeroVec2();
  }

  const direction = normalize(delta);
  const strength = (G * source.mass) / (lenSq(delta) + EPS2);
  return scale(direction, strength);
};

const integrateVelocityVerlet = <T extends EntityBase>(
  body: T,
  dt: number,
  accelAt: (pos: Vec2) => Vec2,
): T => {
  const accel0 = accelAt(body.pos);
  const nextPos = add(
    add(body.pos, scale(body.vel, dt)),
    scale(accel0, 0.5 * dt * dt),
  );
  const accel1 = accelAt(nextPos);
  const nextVel = add(body.vel, scale(add(accel0, accel1), 0.5 * dt));

  return {
    ...body,
    pos: nextPos,
    vel: nextVel,
  };
};

const sunAccelerationAt = (
  suns: readonly Sun[],
  sunIndex: number,
  blackHole?: BlackHole,
): Vec2 => {
  let accel = zeroVec2();
  const sun = suns[sunIndex]!;

  for (let index = 0; index < suns.length; index += 1) {
    if (index === sunIndex) {
      continue;
    }

    accel = add(accel, gravityFromSource(sun.pos, suns[index]!));
  }

  if (blackHole) {
    accel = add(accel, gravityFromSource(sun.pos, blackHole));
  }

  return accel;
};

const wrapGravitySources = (
  suns: readonly Sun[],
  blackHole?: BlackHole,
  extraSources: readonly GravitySource[] = [],
): GravitySource[] =>
  blackHole ? [...suns, blackHole, ...extraSources] : [...suns, ...extraSources];

export const normalizeAngleDelta = (angleRad: number): number => {
  let normalized = angleRad;

  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }

  while (normalized < -Math.PI) {
    normalized += Math.PI * 2;
  }

  return normalized;
};

export const gravityAccel = (
  pos: Vec2,
  suns: readonly Sun[],
  blackHole?: BlackHole,
  extraSources: readonly GravitySource[] = [],
): Vec2 => {
  let accel = zeroVec2();

  for (const source of wrapGravitySources(suns, blackHole, extraSources)) {
    accel = add(accel, gravityFromSource(pos, source));
  }

  return accel;
};

export const stepSuns = (
  suns: readonly Sun[],
  dt: number,
  blackHole?: BlackHole,
): Sun[] => {
  const accel0 = suns.map((_, index) =>
    sunAccelerationAt(suns, index, blackHole),
  );
  const nextSuns = suns.map((sun, index) => ({
    ...sun,
    pos: add(
      add(sun.pos, scale(sun.vel, dt)),
      scale(accel0[index]!, 0.5 * dt * dt),
    ),
  }));
  const accel1 = nextSuns.map((_, index) =>
    sunAccelerationAt(nextSuns, index, blackHole),
  );

  return suns.map((sun, index) => ({
    ...sun,
    pos: nextSuns[index]!.pos,
    vel: add(sun.vel, scale(add(accel0[index]!, accel1[index]!), 0.5 * dt)),
  }));
};

export const stepBody = <T extends EntityBase>(
  body: T,
  suns: readonly Sun[],
  dt: number,
  blackHole?: BlackHole,
  extraSources: readonly GravitySource[] = [],
): T =>
  integrateVelocityVerlet(body, dt, (pos) =>
    gravityAccel(pos, suns, blackHole, extraSources),
  );

export const stepBodyWithGravityScale = <T extends EntityBase>(
  body: T,
  suns: readonly Sun[],
  dt: number,
  gravityScale: number,
  blackHole?: BlackHole,
  extraSources: readonly GravitySource[] = [],
): T =>
  integrateVelocityVerlet(body, dt, (pos) =>
    scale(gravityAccel(pos, suns, blackHole, extraSources), gravityScale),
  );

export const stepSeeker = <T extends Rocket>(
  rocket: T,
  target: Pick<EntityBase, "pos"> | null | undefined,
  suns: readonly Sun[],
  dt: number,
  blackHole?: BlackHole,
  turnRateOverride?: number,
  extraSources: readonly GravitySource[] = [],
): T => {
  const spec = ROCKET_SPECS[rocket.rocketKind];
  const turnRate = turnRateOverride ?? spec.turnRate;
  if (!target || turnRate <= 0) {
    return stepBody(rocket, suns, dt, blackHole, extraSources);
  }

  const toTarget = sub(target.pos, rocket.pos);
  if (lenSq(toTarget) === 0) {
    return stepBody(rocket, suns, dt, blackHole, extraSources);
  }

  const currentSpeed = len(rocket.vel);
  const currentAngle =
    currentSpeed > 0 ? Math.atan2(rocket.vel.y, rocket.vel.x) : 0;
  const desiredAngle = Math.atan2(toTarget.y, toTarget.x);
  const maxTurn = turnRate * dt;
  const turn = Math.max(
    -maxTurn,
    Math.min(maxTurn, normalizeAngleDelta(desiredAngle - currentAngle)),
  );
  const steerAngle = currentAngle + turn;
  const steerSpeed = Math.max(currentSpeed, spec.speed);
  const steeredRocket: T = {
    ...rocket,
    vel: scale(fromAngle(steerAngle), steerSpeed),
  };

  return stepBody(steeredRocket, suns, dt, blackHole, extraSources);
};

export const predictPath = (
  pos: Vec2,
  vel: Vec2,
  suns: readonly Sun[],
  steps: number,
  dt: number,
  blackHole?: BlackHole,
  extraSources: readonly GravitySource[] = [],
): Vec2[] => {
  const points: Vec2[] = [{ x: pos.x, y: pos.y }];
  let predictedSuns = suns.map((sun) => ({
    ...sun,
    pos: { x: sun.pos.x, y: sun.pos.y },
    vel: { x: sun.vel.x, y: sun.vel.y },
  }));
  let state: EntityBase = {
    id: -1,
    pos: { x: pos.x, y: pos.y },
    vel: { x: vel.x, y: vel.y },
    radius: 0,
  };

  for (let index = 0; index < steps; index += 1) {
    predictedSuns = stepSuns(predictedSuns, dt, blackHole);
    state = stepBody(state, predictedSuns, dt, blackHole, extraSources);
    points.push({ x: state.pos.x, y: state.pos.y });
  }

  return points;
};
