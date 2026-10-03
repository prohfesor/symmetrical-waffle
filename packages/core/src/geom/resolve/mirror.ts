import { ccwSpanDeg, polar, reflectPoint } from "../../math.js";
import { ResolvedEntity, Vec2 } from "../resolved-types.js";

type Named = Record<string, Vec2>;

/** The mirror image of a resolved entity across the line a-b (same id; the caller renames it). */
export function reflectEntity(e: ResolvedEntity, a: Vec2, b: Vec2, axisAngleDeg: number): ResolvedEntity {
  const r = (p: Vec2) => reflectPoint(p, a, b);
  switch (e.kind) {
    case "line":
      return { ...e, p1: r(e.p1), p2: r(e.p2), angleDeg: reflectAngle(e.angleDeg, axisAngleDeg) };
    case "circle":
      return { ...e, center: r(e.center) };
    case "arc": {
      // Reflection reverses orientation, so the arc's old end becomes its new start.
      const startAngleDeg = 2 * axisAngleDeg - e.endAngleDeg;
      const endAngleDeg = startAngleDeg + ccwSpanDeg(e.startAngleDeg, e.endAngleDeg);
      const center = r(e.center);
      return { ...e, center, startAngleDeg, endAngleDeg, startPoint: polar(center, e.radius, startAngleDeg), endPoint: polar(center, e.radius, endAngleDeg) };
    }
    case "polyline":
      return { ...e, points: e.points.map(r) };
    case "rectangle": {
      const corners = e.corners.map(r) as typeof e.corners;
      const rotationDeg = Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x) * (180 / Math.PI);
      return { ...e, corners, rotationDeg };
    }
  }
}

/** A named point of the mirrored entity is the reflection of the same-named point of the source. */
export function reflectNamedPoints(points: Named, a: Vec2, b: Vec2): Named {
  return Object.fromEntries(Object.entries(points).map(([name, p]) => [name, reflectPoint(p, a, b)]));
}

/** Direction of a vector at `angleDeg` after reflection across an axis at `axisAngleDeg`. */
export function reflectAngle(angleDeg: number, axisAngleDeg: number): number {
  return 2 * axisAngleDeg - angleDeg;
}
