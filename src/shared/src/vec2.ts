export interface Vec2 {
  x: number;
  y: number;
}

export const add = (a: Vec2, b: Vec2): Vec2 => ({
  x: a.x + b.x,
  y: a.y + b.y,
});

export const sub = (a: Vec2, b: Vec2): Vec2 => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

export const scale = (v: Vec2, scalar: number): Vec2 => ({
  x: v.x * scalar,
  y: v.y * scalar,
});

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const lenSq = (v: Vec2): number => dot(v, v);

export const len = (v: Vec2): number => Math.sqrt(lenSq(v));

export const normalize = (v: Vec2): Vec2 => {
  const magnitude = len(v);
  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }

  return scale(v, 1 / magnitude);
};

export const rot = (v: Vec2, angleRad: number): Vec2 => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
};

export const angleBetween = (a: Vec2, b: Vec2): number => {
  const aLen = len(a);
  const bLen = len(b);
  if (aLen === 0 || bLen === 0) {
    return 0;
  }

  const cosTheta = dot(a, b) / (aLen * bLen);
  return Math.acos(Math.max(-1, Math.min(1, cosTheta)));
};

export const fromAngle = (angleRad: number): Vec2 => ({
  x: Math.cos(angleRad),
  y: Math.sin(angleRad),
});

export const distSq = (a: Vec2, b: Vec2): number => lenSq(sub(a, b));

export const dist = (a: Vec2, b: Vec2): number => Math.sqrt(distSq(a, b));

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (start: number, end: number, alpha: number): number =>
  start + (end - start) * alpha;

export const lerpVec2 = (start: Vec2, end: Vec2, alpha: number): Vec2 => ({
  x: lerp(start.x, end.x, alpha),
  y: lerp(start.y, end.y, alpha),
});

export const clampLen = (v: Vec2, maxLength: number): Vec2 => {
  const magnitude = len(v);
  if (magnitude === 0 || magnitude <= maxLength) {
    return { x: v.x, y: v.y };
  }

  return scale(v, maxLength / magnitude);
};
