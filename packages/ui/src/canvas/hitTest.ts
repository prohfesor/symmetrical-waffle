import { ResolvedDimension, ResolvedDrawing, ResolvedEntity, Vec2 } from "@pcad/core";

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

function distToPolyline(p: Vec2, points: Vec2[], closed: boolean): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) best = Math.min(best, distToSegment(p, points[i], points[i + 1]));
  if (closed && points.length > 2) best = Math.min(best, distToSegment(p, points[points.length - 1], points[0]));
  return best;
}

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

function distToArc(p: Vec2, center: Vec2, radius: number, startDeg: number, endDeg: number): number {
  const angle = normalizeAngle((Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI);
  const s = normalizeAngle(startDeg);
  const span = normalizeAngle(endDeg - startDeg);
  const rel = normalizeAngle(angle - s);
  const onArc = rel <= span;
  const radialDist = Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius);
  if (onArc) return radialDist;
  const startPt = { x: center.x + radius * Math.cos((startDeg * Math.PI) / 180), y: center.y + radius * Math.sin((startDeg * Math.PI) / 180) };
  const endPt = { x: center.x + radius * Math.cos((endDeg * Math.PI) / 180), y: center.y + radius * Math.sin((endDeg * Math.PI) / 180) };
  return Math.min(Math.hypot(p.x - startPt.x, p.y - startPt.y), Math.hypot(p.x - endPt.x, p.y - endPt.y));
}

export function distanceToEntity(e: ResolvedEntity, p: Vec2): number {
  switch (e.kind) {
    case "line":
      return distToSegment(p, e.p1, e.p2);
    case "circle":
      return Math.abs(Math.hypot(p.x - e.center.x, p.y - e.center.y) - e.radius);
    case "arc":
      return distToArc(p, e.center, e.radius, e.startAngleDeg, e.endAngleDeg);
    case "polyline":
      return distToPolyline(p, e.points, e.closed);
    case "rectangle":
      return distToPolyline(p, e.corners, true);
  }
}

export function hitTestEntities(drawing: ResolvedDrawing, p: Vec2, threshold: number): ResolvedEntity | null {
  let best: ResolvedEntity | null = null;
  let bestDist = threshold;
  for (const e of drawing.entities) {
    const d = distanceToEntity(e, p);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

function distanceToDimension(d: ResolvedDimension, p: Vec2): number {
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

export function hitTestDimensions(drawing: ResolvedDrawing, p: Vec2, threshold: number): ResolvedDimension | null {
  let best: ResolvedDimension | null = null;
  let bestDist = threshold;
  for (const d of drawing.dimensions) {
    const dist = distanceToDimension(d, p);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}
