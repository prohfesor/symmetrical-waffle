import type { Vec2 } from "./geom/resolved-types.js";

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** The point `length` away from `origin` in direction `angleDeg` (CCW from +X). */
export function polar(origin: Vec2, length: number, angleDeg: number): Vec2 {
  return { x: origin.x + length * Math.cos(angleDeg * DEG2RAD), y: origin.y + length * Math.sin(angleDeg * DEG2RAD) };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Direction from `a` to `b` in degrees, in (-180, 180]. */
export function angleOf(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * RAD2DEG;
}

/** Wraps an angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Counter-clockwise sweep from `startDeg` to `endDeg`, in [0, 360].
 * Equal angles give 0 (a degenerate arc); angles that differ by a non-zero
 * multiple of 360 give a full 360 sweep.
 */
export function ccwSpanDeg(startDeg: number, endDeg: number): number {
  if (startDeg === endDeg) return 0;
  const span = normalizeDeg(endDeg - startDeg);
  return span === 0 ? 360 : span;
}

/** True if direction `angleDeg` lies within the CCW sweep from `startDeg` to `endDeg` (inclusive). */
export function angleInSweep(angleDeg: number, startDeg: number, endDeg: number): boolean {
  return normalizeDeg(angleDeg - startDeg) <= ccwSpanDeg(startDeg, endDeg);
}

/** Rounds to `decimals` places (default 3, i.e. micron precision for millimeter drawings). */
export function roundTo(value: number, decimals = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
