import { angleOf, distance, Entity, generateId, PointDef, PolySegment, roundTo, Vec2 } from "@wafflecad/core";

/** A point the user clicked: where it landed, and the existing point it snapped onto (if any). */
export interface ClickPoint {
  world: Vec2;
  snapRef: string | null;
}

function pointDef(cp: ClickPoint): PointDef {
  return cp.snapRef ? { kind: "anchor", ref: cp.snapRef } : { kind: "free", x: roundTo(cp.world.x), y: roundTo(cp.world.y) };
}

export function buildLine(p1: ClickPoint, p2: ClickPoint): Entity {
  return { id: generateId("line"), kind: "line", mode: "twoPoint", p1: pointDef(p1), p2: pointDef(p2) };
}

export function buildCircle(center: ClickPoint, radiusPoint: Vec2): Entity {
  return { id: generateId("circle"), kind: "circle", center: pointDef(center), radius: roundTo(distance(center.world, radiusPoint)) };
}

export function buildRectangle(c1: ClickPoint, c2: Vec2): Entity {
  const minX = Math.min(c1.world.x, c2.x);
  const minY = Math.min(c1.world.y, c2.y);
  // The rectangle is stored by its lower-left corner, so the first click can only be an anchor if it *is* that corner.
  const firstClickIsCorner = c1.world.x === minX && c1.world.y === minY;
  const corner: PointDef = firstClickIsCorner ? pointDef(c1) : { kind: "free", x: roundTo(minX), y: roundTo(minY) };
  return {
    id: generateId("rect"),
    kind: "rectangle",
    corner,
    width: roundTo(Math.abs(c2.x - c1.world.x)),
    height: roundTo(Math.abs(c2.y - c1.world.y)),
  };
}

/** An arc from the direction of `start` to the direction of `end` around `center`, counter-clockwise. */
export function buildArc(center: ClickPoint, start: Vec2, end: Vec2): Entity {
  const startAngle = angleOf(center.world, start);
  const endAngle = angleOf(center.world, end);
  return {
    id: generateId("arc"),
    kind: "arc",
    center: pointDef(center),
    radius: roundTo(distance(center.world, start)),
    startAngle: roundTo(startAngle),
    endAngle: roundTo(endAngle < startAngle ? endAngle + 360 : endAngle),
  };
}

export function buildPolyline(points: ClickPoint[], closed: boolean): Entity {
  const start = pointDef(points[0]);
  // Offsets are measured between the *rounded* vertices, so rounding error can't accumulate along the chain.
  const rounded = points.map((p) => ({ x: roundTo(p.world.x), y: roundTo(p.world.y) }));
  const segments: PolySegment[] = rounded.slice(1).map((cur, i) => ({
    kind: "relative",
    dx: roundTo(cur.x - rounded[i].x),
    dy: roundTo(cur.y - rounded[i].y),
  }));
  return { id: generateId("poly"), kind: "polyline", start, segments, closed };
}
