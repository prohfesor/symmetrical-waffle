import { angleInSweep, polar } from "../math.js";
import { Bounds, ResolvedDimension, ResolvedEntity, Vec2 } from "./resolved-types.js";

/** Accumulates an axis-aligned bounding box point by point. */
export class BoundsBuilder {
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  add(p: Vec2): this {
    this.minX = Math.min(this.minX, p.x);
    this.minY = Math.min(this.minY, p.y);
    this.maxX = Math.max(this.maxX, p.x);
    this.maxY = Math.max(this.maxY, p.y);
    return this;
  }

  /** Adds the exact extent of a CCW arc: its end points plus any of 0/90/180/270 deg the sweep passes through. */
  addArc(center: Vec2, radius: number, startDeg: number, endDeg: number): this {
    this.add(polar(center, radius, startDeg)).add(polar(center, radius, endDeg));
    for (const axisDeg of [0, 90, 180, 270]) {
      if (angleInSweep(axisDeg, startDeg, endDeg)) this.add(polar(center, radius, axisDeg));
    }
    return this;
  }

  addCircle(center: Vec2, radius: number): this {
    return this.add({ x: center.x - radius, y: center.y - radius }).add({ x: center.x + radius, y: center.y + radius });
  }

  build(): Bounds | null {
    if (!Number.isFinite(this.minX)) return null;
    return { min: { x: this.minX, y: this.minY }, max: { x: this.maxX, y: this.maxY } };
  }
}

function addEntity(b: BoundsBuilder, e: ResolvedEntity): void {
  switch (e.kind) {
    case "line":
      b.add(e.p1).add(e.p2);
      break;
    case "circle":
      b.addCircle(e.center, e.radius);
      break;
    case "arc":
      b.addArc(e.center, e.radius, e.startAngleDeg, e.endAngleDeg);
      break;
    case "polyline":
      e.points.forEach((p) => b.add(p));
      break;
    case "rectangle":
      e.corners.forEach((p) => b.add(p));
      break;
  }
}

function addDimension(b: BoundsBuilder, d: ResolvedDimension): void {
  switch (d.kind) {
    case "linear":
      b.add(d.p1).add(d.p2).add(d.dimLineP1).add(d.dimLineP2);
      break;
    case "radius":
    case "diameter":
      b.add(d.onCircle).add(d.leaderEnd);
      break;
    case "angular":
      b.addArc(d.center, d.radius, d.startAngleDeg, d.endAngleDeg);
      break;
  }
  b.add(d.textPos);
}

/**
 * Bounding box of everything that gets drawn: geometry *and* dimension
 * annotations (which usually sit outside the part and would otherwise be cut
 * off when printing or fitting the view).
 */
export function computeBounds(entities: readonly ResolvedEntity[], dimensions: readonly ResolvedDimension[]): Bounds | null {
  const builder = new BoundsBuilder();
  entities.forEach((e) => addEntity(builder, e));
  dimensions.forEach((d) => addDimension(builder, d));
  return builder.build();
}
