import { evaluateFormula, Formula } from "../../expr/index.js";
import { angleOf, DEG2RAD, distance, polar } from "../../math.js";
import { ResolvedEntity, ResolveIssue, Vec2 } from "../resolved-types.js";
import {
  ArcEntity,
  CircleEntity,
  Entity,
  LineEntity,
  parseRef,
  PointDef,
  PointRef,
  PolylineEntity,
  RectangleEntity,
} from "../types.js";

/** Looks up a parameter's value by name; undefined if it isn't defined/resolved. */
export type ParamScope = (name: string) => number | undefined;

/** What dimension resolution needs from entity resolution. */
export interface ResolveContext {
  entities: ReadonlyMap<string, ResolvedEntity>;
  point(ref: PointRef): Vec2 | undefined;
  report(issue: ResolveIssue): void;
}

type NamedPoints = Record<string, Vec2>;

/**
 * Resolves entities one at a time, in dependency order, into absolute
 * coordinates. Anything that fails (bad formula, dangling anchor) is recorded
 * as an issue against that entity and the rest still resolve.
 */
export class EntityResolver implements ResolveContext {
  readonly entities = new Map<string, ResolvedEntity>();
  readonly namedPoints: Record<string, NamedPoints> = {};
  readonly issues: ResolveIssue[] = [];

  constructor(private readonly scope: ParamScope) {}

  report(issue: ResolveIssue): void {
    this.issues.push(issue);
  }

  point(ref: PointRef): Vec2 | undefined {
    const { entityId, pointName } = parseRef(ref);
    return this.namedPoints[entityId]?.[pointName];
  }

  resolve(entity: Entity): void {
    try {
      switch (entity.kind) {
        case "line":
          return this.line(entity);
        case "circle":
          return this.circle(entity);
        case "arc":
          return this.arc(entity);
        case "polyline":
          return this.polyline(entity);
        case "rectangle":
          return this.rectangle(entity);
      }
    } catch (err) {
      this.report({ entityId: entity.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  private evalF(f: Formula): number {
    return evaluateFormula(f, this.scope);
  }

  private resolvePoint(pd: PointDef, entityId: string): Vec2 {
    if (pd.kind === "free") return { x: this.evalF(pd.x), y: this.evalF(pd.y) };
    const found = this.point(pd.ref);
    if (!found) throw new Error(`Anchor reference '${pd.ref}' could not be resolved`);
    return found;
  }

  private store(entity: ResolvedEntity, points: NamedPoints): void {
    this.entities.set(entity.id, entity);
    this.namedPoints[entity.id] = points;
  }

  private line(e: LineEntity): void {
    const p1 = this.resolvePoint(e.p1, e.id);
    let p2: Vec2;
    if (e.mode === "twoPoint") {
      if (!e.p2) throw new Error(`Line '${e.id}' is in twoPoint mode but has no p2`);
      p2 = this.resolvePoint(e.p2, e.id);
    } else {
      p2 = polar(p1, this.evalF(e.length ?? 0), this.evalF(e.angle ?? 0));
    }
    this.store({ id: e.id, kind: "line", p1, p2, length: distance(p1, p2), angleDeg: angleOf(p1, p2) }, { p1, p2 });
  }

  private circle(e: CircleEntity): void {
    const center = this.resolvePoint(e.center, e.id);
    this.store({ id: e.id, kind: "circle", center, radius: this.evalF(e.radius) }, { center });
  }

  private arc(e: ArcEntity): void {
    const center = this.resolvePoint(e.center, e.id);
    const radius = this.evalF(e.radius);
    const startAngleDeg = this.evalF(e.startAngle);
    const endAngleDeg = this.evalF(e.endAngle);
    const startPoint = polar(center, radius, startAngleDeg);
    const endPoint = polar(center, radius, endAngleDeg);
    this.store(
      { id: e.id, kind: "arc", center, radius, startAngleDeg, endAngleDeg, startPoint, endPoint },
      { center, start: startPoint, end: endPoint },
    );
  }

  private polyline(e: PolylineEntity): void {
    const start = this.resolvePoint(e.start, e.id);
    const points: Vec2[] = [start];
    const named: NamedPoints = { v0: start, start };
    e.segments.forEach((seg, i) => {
      const prev = points[points.length - 1];
      const next =
        seg.kind === "polar"
          ? polar(prev, this.evalF(seg.length), this.evalF(seg.angle))
          : { x: prev.x + this.evalF(seg.dx), y: prev.y + this.evalF(seg.dy) };
      points.push(next);
      named[`v${i + 1}`] = next;
    });
    named.end = points[points.length - 1];
    this.store({ id: e.id, kind: "polyline", points, closed: e.closed }, named);
  }

  private rectangle(e: RectangleEntity): void {
    const corner = this.resolvePoint(e.corner, e.id);
    const width = this.evalF(e.width);
    const height = this.evalF(e.height);
    const rotationDeg = e.rotation !== undefined ? this.evalF(e.rotation) : 0;
    const cos = Math.cos(rotationDeg * DEG2RAD);
    const sin = Math.sin(rotationDeg * DEG2RAD);
    const along = (dx: number, dy: number): Vec2 => ({ x: corner.x + dx * cos - dy * sin, y: corner.y + dx * sin + dy * cos });
    const corners: [Vec2, Vec2, Vec2, Vec2] = [corner, along(width, 0), along(width, height), along(0, height)];
    this.store(
      { id: e.id, kind: "rectangle", corners, width, height, rotationDeg },
      {
        corner0: corners[0],
        corner1: corners[1],
        corner2: corners[2],
        corner3: corners[3],
        center: along(width / 2, height / 2),
      },
    );
  }
}
