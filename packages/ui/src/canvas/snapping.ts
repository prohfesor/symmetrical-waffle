import { makeRef, ResolvedDrawing, Vec2 } from "@pcad/core";

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
      const d = Math.hypot(pt.x - world.x, pt.y - world.y);
      if (d < bestDist) {
        bestDist = d;
        best = { point: pt, ref: makeRef(entityId, pointName), entityId, pointName };
      }
    }
  }
  return best;
}
