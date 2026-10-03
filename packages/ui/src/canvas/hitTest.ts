import { angleInSweep, angleOf, distance, polar, ResolvedAxis, ResolvedDimension, ResolvedDrawing, ResolvedEntity, Vec2 } from "@pcad/core";

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function distToPolyline(p: Vec2, points: Vec2[], closed: boolean): number {
  let best = points.length === 1 ? distance(p, points[0]) : Infinity;
  for (let i = 0; i < points.length - 1; i++) best = Math.min(best, distToSegment(p, points[i], points[i + 1]));
  if (closed && points.length > 2) best = Math.min(best, distToSegment(p, points[points.length - 1], points[0]));
  return best;
}

function distToArc(p: Vec2, center: Vec2, radius: number, startDeg: number, endDeg: number): number {
  if (angleInSweep(angleOf(center, p), startDeg, endDeg)) return Math.abs(distance(p, center) - radius);
  return Math.min(distance(p, polar(center, radius, startDeg)), distance(p, polar(center, radius, endDeg)));
}

/** Distance from `p` to the drawn outline of `e`, in drawing units. */
export function distanceToEntity(e: ResolvedEntity, p: Vec2): number {
  switch (e.kind) {
    case "line":
      return distToSegment(p, e.p1, e.p2);
    case "circle":
      return Math.abs(distance(p, e.center) - e.radius);
    case "arc":
      return distToArc(p, e.center, e.radius, e.startAngleDeg, e.endAngleDeg);
    case "polyline":
      return distToPolyline(p, e.points, e.closed);
    case "rectangle":
      return distToPolyline(p, e.corners, true);
  }
}

export function distanceToDimension(d: ResolvedDimension, p: Vec2): number {
  switch (d.kind) {
    case "linear":
      return distToSegment(p, d.dimLineP1, d.dimLineP2);
    case "radius":
    case "diameter":
      return distToSegment(p, d.onCircle, d.leaderEnd);
    case "angular":
      return distToArc(p, d.center, d.radius, d.startAngleDeg, d.endAngleDeg);
  }
}

/** The item closest to `p` within `threshold`, or null. Later items win ties (they're drawn on top). */
function nearest<T>(items: T[], threshold: number, distanceOf: (item: T) => number): T | null {
  let best: T | null = null;
  let bestDist = threshold;
  for (const item of items) {
    const d = distanceOf(item);
    if (d <= bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

export function hitTestEntities(drawing: ResolvedDrawing, p: Vec2, threshold: number): ResolvedEntity | null {
  return nearest(drawing.entities, threshold, (e) => distanceToEntity(e, p));
}

export function hitTestDimensions(drawing: ResolvedDrawing, p: Vec2, threshold: number): ResolvedDimension | null {
  return nearest(drawing.dimensions, threshold, (d) => distanceToDimension(d, p));
}

/** Distance to a mirror axis, which extends infinitely in both directions. */
function distanceToAxis(axis: ResolvedAxis, p: Vec2): number {
  const dx = axis.p2.x - axis.p1.x;
  const dy = axis.p2.y - axis.p1.y;
  return Math.abs((p.x - axis.p1.x) * dy - (p.y - axis.p1.y) * dx) / Math.hypot(dx, dy);
}

export function hitTestAxes(drawing: ResolvedDrawing, p: Vec2, threshold: number): ResolvedAxis | null {
  return nearest(drawing.axes, threshold, (a) => distanceToAxis(a, p));
}
