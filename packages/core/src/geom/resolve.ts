import { evaluateFormula, Formula } from "../expr/index.js";
import {
  ArcEntity,
  CircleEntity,
  Dimension,
  DrawingDocument,
  Entity,
  LineEntity,
  ParseRefResult,
  parseRef,
  PointDef,
  PointRef,
  PolylineEntity,
  RectangleEntity,
} from "./types.js";
import {
  ResolvedArc,
  ResolvedCircle,
  ResolvedDimension,
  ResolvedDrawing,
  ResolvedEntity,
  ResolvedLine,
  ResolvedPolyline,
  ResolvedRectangle,
  ResolveIssue,
  Vec2,
} from "./resolved-types.js";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function polar(origin: Vec2, length: number, angleDeg: number): Vec2 {
  return { x: origin.x + length * Math.cos(angleDeg * D2R), y: origin.y + length * Math.sin(angleDeg * D2R) };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleOf(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * R2D;
}

function normalizeAngleSpan(startDeg: number, endDeg: number): number {
  let span = endDeg - startDeg;
  while (span < 0) span += 360;
  while (span > 360) span -= 360;
  return span;
}

/** Finds every entity id an entity's PointDefs anchor onto, for dependency ordering. */
function entityDependencies(entity: Entity): Set<string> {
  const deps = new Set<string>();
  const visit = (pd: PointDef | undefined) => {
    if (pd && pd.kind === "anchor") {
      const { entityId } = parseRef(pd.ref);
      deps.add(entityId);
    }
  };
  switch (entity.kind) {
    case "line":
      visit(entity.p1);
      if (entity.mode === "twoPoint") visit(entity.p2);
      break;
    case "circle":
      visit(entity.center);
      break;
    case "arc":
      visit(entity.center);
      break;
    case "polyline":
      visit(entity.start);
      break;
    case "rectangle":
      visit(entity.corner);
      break;
  }
  return deps;
}

function topoSortEntities(entities: Entity[]): { order: Entity[]; cycleIds: Set<string> } {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const deps = new Map<string, Set<string>>();
  for (const e of entities) deps.set(e.id, entityDependencies(e));

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const e of entities) {
    inDegree.set(e.id, 0);
    dependents.set(e.id, []);
  }
  for (const [id, depSet] of deps) {
    for (const d of depSet) {
      if (!byId.has(d)) continue;
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      dependents.get(d)!.push(id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
  queue.sort();

  const order: Entity[] = [];
  const resolvedIds = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    resolvedIds.add(id);
    order.push(byId.get(id)!);
    for (const dep of dependents.get(id) ?? []) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1);
      if (inDegree.get(dep) === 0) queue.push(dep);
    }
    queue.sort();
  }

  const cycleIds = new Set<string>();
  for (const e of entities) if (!resolvedIds.has(e.id)) cycleIds.add(e.id);
  return { order, cycleIds };
}

export interface ParamScope {
  (name: string): number | undefined;
}

class Resolver {
  namedPoints: Record<string, Record<string, Vec2>> = {};
  resolvedEntities = new Map<string, ResolvedEntity>();
  issues: ResolveIssue[] = [];

  constructor(private scope: ParamScope) {}

  private evalF(f: Formula): number {
    return evaluateFormula(f, this.scope);
  }

  private resolvePoint(pd: PointDef, entityId: string): Vec2 {
    if (pd.kind === "free") {
      return { x: this.evalF(pd.x), y: this.evalF(pd.y) };
    }
    const { entityId: refEntity, pointName } = parseRef(pd.ref);
    const pt = this.namedPoints[refEntity]?.[pointName];
    if (!pt) {
      this.issues.push({ entityId, message: `Anchor reference '${pd.ref}' could not be resolved` });
      return { x: 0, y: 0 };
    }
    return pt;
  }

  resolveEntity(entity: Entity): void {
    try {
      switch (entity.kind) {
        case "line":
          this.resolveLine(entity);
          break;
        case "circle":
          this.resolveCircle(entity);
          break;
        case "arc":
          this.resolveArc(entity);
          break;
        case "polyline":
          this.resolvePolyline(entity);
          break;
        case "rectangle":
          this.resolveRectangle(entity);
          break;
      }
    } catch (err) {
      this.issues.push({ entityId: entity.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  private resolveLine(e: LineEntity): void {
    const p1 = this.resolvePoint(e.p1, e.id);
    let p2: Vec2;
    if (e.mode === "twoPoint") {
      if (!e.p2) throw new Error(`Line '${e.id}' is in twoPoint mode but has no p2`);
      p2 = this.resolvePoint(e.p2, e.id);
    } else {
      const length = this.evalF(e.length ?? 0);
      const angle = this.evalF(e.angle ?? 0);
      p2 = polar(p1, length, angle);
    }
    const resolved: ResolvedLine = { id: e.id, kind: "line", p1, p2, length: dist(p1, p2), angleDeg: angleOf(p1, p2) };
    this.resolvedEntities.set(e.id, resolved);
    this.namedPoints[e.id] = { p1, p2 };
  }

  private resolveCircle(e: CircleEntity): void {
    const center = this.resolvePoint(e.center, e.id);
    const radius = this.evalF(e.radius);
    const resolved: ResolvedCircle = { id: e.id, kind: "circle", center, radius };
    this.resolvedEntities.set(e.id, resolved);
    this.namedPoints[e.id] = { center };
  }

  private resolveArc(e: ArcEntity): void {
    const center = this.resolvePoint(e.center, e.id);
    const radius = this.evalF(e.radius);
    const startAngleDeg = this.evalF(e.startAngle);
    const endAngleDeg = this.evalF(e.endAngle);
    const startPoint = polar(center, radius, startAngleDeg);
    const endPoint = polar(center, radius, endAngleDeg);
    const resolved: ResolvedArc = { id: e.id, kind: "arc", center, radius, startAngleDeg, endAngleDeg, startPoint, endPoint };
    this.resolvedEntities.set(e.id, resolved);
    this.namedPoints[e.id] = { center, start: startPoint, end: endPoint };
  }

  private resolvePolyline(e: PolylineEntity): void {
    const start = this.resolvePoint(e.start, e.id);
    const points: Vec2[] = [start];
    const named: Record<string, Vec2> = { v0: start, start };
    for (let i = 0; i < e.segments.length; i++) {
      const seg = e.segments[i];
      const prev = points[points.length - 1];
      let next: Vec2;
      if (seg.kind === "polar") {
        next = polar(prev, this.evalF(seg.length), this.evalF(seg.angle));
      } else {
        next = { x: prev.x + this.evalF(seg.dx), y: prev.y + this.evalF(seg.dy) };
      }
      points.push(next);
      named[`v${i + 1}`] = next;
    }
    named.end = points[points.length - 1];
    const resolved: ResolvedPolyline = { id: e.id, kind: "polyline", points, closed: e.closed };
    this.resolvedEntities.set(e.id, resolved);
    this.namedPoints[e.id] = named;
  }

  private resolveRectangle(e: RectangleEntity): void {
    const corner = this.resolvePoint(e.corner, e.id);
    const width = this.evalF(e.width);
    const height = this.evalF(e.height);
    const rotationDeg = e.rotation !== undefined ? this.evalF(e.rotation) : 0;
    const ux = { x: Math.cos(rotationDeg * D2R), y: Math.sin(rotationDeg * D2R) };
    const uy = { x: -Math.sin(rotationDeg * D2R), y: Math.cos(rotationDeg * D2R) };
    const c0 = corner;
    const c1 = { x: c0.x + width * ux.x, y: c0.y + width * ux.y };
    const c2 = { x: c1.x + height * uy.x, y: c1.y + height * uy.y };
    const c3 = { x: c0.x + height * uy.x, y: c0.y + height * uy.y };
    const center = { x: c0.x + (width * ux.x + height * uy.x) / 2, y: c0.y + (width * ux.y + height * uy.y) / 2 };
    const resolved: ResolvedRectangle = {
      id: e.id,
      kind: "rectangle",
      corners: [c0, c1, c2, c3],
      width,
      height,
      rotationDeg,
    };
    this.resolvedEntities.set(e.id, resolved);
    this.namedPoints[e.id] = { corner0: c0, corner1: c1, corner2: c2, corner3: c3, center };
  }

  resolvePointRef(ref: PointRef): Vec2 | undefined {
    const { entityId, pointName }: ParseRefResult = parseRef(ref);
    return this.namedPoints[entityId]?.[pointName];
  }
}

function formatValue(v: number, precision: number): string {
  return v.toFixed(precision).replace(/\.?0+$/, (m) => (m === "." ? "" : m.replace(/0+$/, "")));
}

function resolveDimension(dim: Dimension, r: Resolver): ResolvedDimension | null {
  const precision = dim.precision ?? 2;
  const off = dim.displayOffset;

  const pushIssue = (msg: string) => r.issues.push({ dimensionId: dim.id, message: msg });

  switch (dim.target.kind) {
    case "lineLength": {
      const line = r.resolvedEntities.get(dim.target.entityId);
      if (!line || line.kind !== "line") {
        pushIssue(`Dimension '${dim.id}' targets missing/invalid line '${dim.target.entityId}'`);
        return null;
      }
      return buildLinearDimension(dim.id, line.p1, line.p2, off, line.length, precision);
    }
    case "pointDistance": {
      const p1 = r.resolvePointRef(dim.target.from);
      const p2 = r.resolvePointRef(dim.target.to);
      if (!p1 || !p2) {
        pushIssue(`Dimension '${dim.id}' references an unresolved point`);
        return null;
      }
      return buildLinearDimension(dim.id, p1, p2, off, dist(p1, p2), precision);
    }
    case "circleRadius":
    case "circleDiameter": {
      const circle = r.resolvedEntities.get(dim.target.entityId);
      if (!circle || circle.kind !== "circle") {
        pushIssue(`Dimension '${dim.id}' targets missing/invalid circle '${dim.target.entityId}'`);
        return null;
      }
      const isDia = dim.target.kind === "circleDiameter";
      const value = isDia ? circle.radius * 2 : circle.radius;
      const onCircle = polar(circle.center, circle.radius, 45);
      const leaderEnd = polar(circle.center, circle.radius + off, 45);
      return {
        id: dim.id,
        kind: isDia ? "diameter" : "radius",
        value,
        center: circle.center,
        onCircle,
        leaderEnd,
        textPos: leaderEnd,
        text: `${isDia ? "⌀" : "R"}${formatValue(value, precision)}`,
      };
    }
    case "arcRadius": {
      const arc = r.resolvedEntities.get(dim.target.entityId);
      if (!arc || arc.kind !== "arc") {
        pushIssue(`Dimension '${dim.id}' targets missing/invalid arc '${dim.target.entityId}'`);
        return null;
      }
      const mid = (arc.startAngleDeg + arc.endAngleDeg) / 2;
      const onCircle = polar(arc.center, arc.radius, mid);
      const leaderEnd = polar(arc.center, arc.radius + off, mid);
      return {
        id: dim.id,
        kind: "radius",
        value: arc.radius,
        center: arc.center,
        onCircle,
        leaderEnd,
        textPos: leaderEnd,
        text: `R${formatValue(arc.radius, precision)}`,
      };
    }
    case "arcAngle": {
      const arc = r.resolvedEntities.get(dim.target.entityId);
      if (!arc || arc.kind !== "arc") {
        pushIssue(`Dimension '${dim.id}' targets missing/invalid arc '${dim.target.entityId}'`);
        return null;
      }
      const span = normalizeAngleSpan(arc.startAngleDeg, arc.endAngleDeg);
      const mid = arc.startAngleDeg + span / 2;
      const radius = arc.radius + off;
      return {
        id: dim.id,
        kind: "angular",
        value: span,
        center: arc.center,
        radius,
        arcStart: polar(arc.center, radius, arc.startAngleDeg),
        arcEnd: polar(arc.center, radius, arc.endAngleDeg),
        startAngleDeg: arc.startAngleDeg,
        endAngleDeg: arc.endAngleDeg,
        textPos: polar(arc.center, radius, mid),
        text: `${formatValue(span, precision)}°`,
      };
    }
  }
}

function buildLinearDimension(
  id: string,
  p1: Vec2,
  p2: Vec2,
  offset: number,
  value: number,
  precision: number,
): ResolvedDimension {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal, rotated 90 deg CCW from the p1->p2 direction.
  const nx = -dy / len;
  const ny = dx / len;
  const dimLineP1: Vec2 = { x: p1.x + nx * offset, y: p1.y + ny * offset };
  const dimLineP2: Vec2 = { x: p2.x + nx * offset, y: p2.y + ny * offset };
  const textPos: Vec2 = { x: (dimLineP1.x + dimLineP2.x) / 2, y: (dimLineP1.y + dimLineP2.y) / 2 };
  return { id, kind: "linear", value, p1, p2, dimLineP1, dimLineP2, textPos, text: formatValue(value, precision) };
}

function computeBounds(entities: ResolvedEntity[]): { min: Vec2; max: Vec2 } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (p: Vec2) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const e of entities) {
    switch (e.kind) {
      case "line":
        consider(e.p1);
        consider(e.p2);
        break;
      case "circle":
        consider({ x: e.center.x - e.radius, y: e.center.y - e.radius });
        consider({ x: e.center.x + e.radius, y: e.center.y + e.radius });
        break;
      case "arc": {
        // Conservative bound: full circle extent (simple and always correct, if not tightest).
        consider({ x: e.center.x - e.radius, y: e.center.y - e.radius });
        consider({ x: e.center.x + e.radius, y: e.center.y + e.radius });
        break;
      }
      case "polyline":
        for (const p of e.points) consider(p);
        break;
      case "rectangle":
        for (const p of e.corners) consider(p);
        break;
    }
  }
  if (!isFinite(minX)) return null;
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

export function resolveDocument(doc: DrawingDocument, params: ParamScope): ResolvedDrawing {
  const { order, cycleIds } = topoSortEntities(doc.entities);
  const resolver = new Resolver(params);

  for (const id of cycleIds) {
    resolver.issues.push({ entityId: id, message: `Entity '${id}' is part of a circular anchor reference` });
  }
  for (const entity of order) {
    resolver.resolveEntity(entity);
  }

  const dimensions: ResolvedDimension[] = [];
  for (const dim of doc.dimensions) {
    const resolved = resolveDimension(dim, resolver);
    if (resolved) dimensions.push(resolved);
  }

  const entities = order.filter((e) => resolver.resolvedEntities.has(e.id)).map((e) => resolver.resolvedEntities.get(e.id)!);

  return {
    entities,
    dimensions,
    namedPoints: resolver.namedPoints,
    issues: resolver.issues,
    bounds: computeBounds(entities),
  };
}
