import { Entity, generateId, PointDef, Vec2 } from "@pcad/core";

export interface ClickPoint {
  world: Vec2;
  snapRef: string | null;
}

function pointDef(cp: ClickPoint): PointDef {
  return cp.snapRef ? { kind: "anchor", ref: cp.snapRef } : { kind: "free", x: round(cp.world.x), y: round(cp.world.y) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function angleDeg(a: Vec2, b: Vec2): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function buildLine(p1: ClickPoint, p2: ClickPoint): Entity {
  return { id: generateId("line"), kind: "line", mode: "twoPoint", p1: pointDef(p1), p2: pointDef(p2) };
}

export function buildCircle(center: ClickPoint, radiusPoint: Vec2): Entity {
  return { id: generateId("circle"), kind: "circle", center: pointDef(center), radius: round(dist(center.world, radiusPoint)) };
}

export function buildRectangle(c1: ClickPoint, c2World: Vec2): Entity {
  const minX = Math.min(c1.world.x, c2World.x);
  const minY = Math.min(c1.world.y, c2World.y);
  const width = Math.abs(c2World.x - c1.world.x);
  const height = Math.abs(c2World.y - c1.world.y);
  const cornerIsClick1 = c1.world.x === minX && c1.world.y === minY;
  const corner: PointDef = cornerIsClick1 && c1.snapRef ? { kind: "anchor", ref: c1.snapRef } : { kind: "free", x: round(minX), y: round(minY) };
  return { id: generateId("rect"), kind: "rectangle", corner, width: round(width), height: round(height) };
}

export function buildArc(center: ClickPoint, startWorld: Vec2, endWorld: Vec2): Entity {
  const radius = dist(center.world, startWorld);
  const startAngle = angleDeg(center.world, startWorld);
  const endAngle = angleDeg(center.world, endWorld);
  return {
    id: generateId("arc"),
    kind: "arc",
    center: pointDef(center),
    radius: round(radius),
    startAngle: round(startAngle),
    endAngle: round(endAngle < startAngle ? endAngle + 360 : endAngle),
  };
}

export function buildPolyline(points: ClickPoint[], closed: boolean): Entity {
  const start = pointDef(points[0]);
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].world;
    const cur = points[i].world;
    segments.push({ kind: "relative" as const, dx: round(cur.x - prev.x), dy: round(cur.y - prev.y) });
  }
  return { id: generateId("poly"), kind: "polyline", start, segments, closed };
}
