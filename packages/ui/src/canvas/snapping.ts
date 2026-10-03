import { angleOf, distance, makeRef, polar, ResolvedDrawing, Vec2 } from "@pcad/core";

export interface SnapResult {
  point: Vec2;
  ref: string;
  entityId: string;
  pointName: string;
}

/** Finds the nearest named point (line endpoint, circle center, etc.) within `radius` world units. */
export function findSnapPoint(drawing: ResolvedDrawing, world: Vec2, radius: number): SnapResult | null {
  let best: SnapResult | null = null;
  let bestDist = radius;
  for (const [entityId, points] of Object.entries(drawing.namedPoints)) {
    for (const [pointName, pt] of Object.entries(points)) {
      const d = distance(pt, world);
      if (d < bestDist) {
        bestDist = d;
        best = { point: pt, ref: makeRef(entityId, pointName), entityId, pointName };
      }
    }
  }
  return best;
}

export const GRID_SNAP_STEP_MM = 1;

export function snapToGrid(world: Vec2, step: number = GRID_SNAP_STEP_MM): Vec2 {
  return { x: Math.round(world.x / step) * step, y: Math.round(world.y / step) * step };
}

export interface ResolvedClickPoint {
  point: Vec2;
  /** Set only when this came from an object snap (existing geometry point) -- grid/raw points have nothing to anchor to. */
  ref: string | null;
}

export interface SnapOptions {
  objectSnap: boolean;
  gridSnap: boolean;
  objectSnapRadius: number;
}

/**
 * Resolves where a click actually lands: prefer snapping onto existing
 * geometry (so shapes can anchor to each other) over grid snapping, and fall
 * back to the raw cursor position if both are disabled.
 */
export function resolveClickPoint(world: Vec2, drawing: ResolvedDrawing, opts: SnapOptions): ResolvedClickPoint {
  if (opts.objectSnap) {
    const hit = findSnapPoint(drawing, world, opts.objectSnapRadius);
    if (hit) return { point: hit.point, ref: hit.ref };
  }
  if (opts.gridSnap) {
    return { point: snapToGrid(world), ref: null };
  }
  return { point: world, ref: null };
}

export const ANGLE_SNAP_STEP_DEG = 15;

/**
 * Constrains `point` to lie on a ray from `reference` at the nearest multiple
 * of `stepDeg` degrees, preserving the actual reference-to-point distance
 * (only the direction snaps, e.g. holding Shift while drawing a line).
 */
export function snapAngleAround(reference: Vec2, point: Vec2, stepDeg: number = ANGLE_SNAP_STEP_DEG): Vec2 {
  const length = distance(reference, point);
  if (length < 1e-9) return point;
  return polar(reference, length, Math.round(angleOf(reference, point) / stepDeg) * stepDeg);
}
