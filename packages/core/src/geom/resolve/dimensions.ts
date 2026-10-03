import { ccwSpanDeg, distance, polar } from "../../math.js";
import { formatNumber } from "../format.js";
import { ResolvedDimension, ResolvedEntity, Vec2 } from "../resolved-types.js";
import { Dimension } from "../types.js";
import { ResolveContext } from "./entities.js";

const DEFAULT_PRECISION = 2;
/** Where on a circle a radius/diameter leader is drawn. */
const CIRCLE_LEADER_ANGLE_DEG = 45;

function findEntity<K extends ResolvedEntity["kind"]>(
  ctx: ResolveContext,
  dim: Dimension,
  entityId: string,
  kind: K,
): Extract<ResolvedEntity, { kind: K }> | null {
  const entity = ctx.entities.get(entityId);
  if (entity?.kind === kind) return entity as Extract<ResolvedEntity, { kind: K }>;
  ctx.report({ dimensionId: dim.id, message: `Dimension '${dim.id}' targets missing/invalid ${kind} '${entityId}'` });
  return null;
}

function linearDimension(id: string, p1: Vec2, p2: Vec2, offset: number, text: string, value: number): ResolvedDimension {
  const length = distance(p1, p2) || 1;
  // Unit normal, rotated 90 deg CCW from the p1->p2 direction.
  const nx = -(p2.y - p1.y) / length;
  const ny = (p2.x - p1.x) / length;
  const dimLineP1: Vec2 = { x: p1.x + nx * offset, y: p1.y + ny * offset };
  const dimLineP2: Vec2 = { x: p2.x + nx * offset, y: p2.y + ny * offset };
  const textPos: Vec2 = { x: (dimLineP1.x + dimLineP2.x) / 2, y: (dimLineP1.y + dimLineP2.y) / 2 };
  return { id, kind: "linear", value, p1, p2, dimLineP1, dimLineP2, textPos, text };
}

function leaderDimension(
  id: string,
  kind: "radius" | "diameter",
  center: Vec2,
  radius: number,
  angleDeg: number,
  offset: number,
  value: number,
  text: string,
): ResolvedDimension {
  const leaderEnd = polar(center, radius + offset, angleDeg);
  return { id, kind, value, center, onCircle: polar(center, radius, angleDeg), leaderEnd, textPos: leaderEnd, text };
}

/** Computes a dimension's display geometry from already-resolved entities; null (plus an issue) if its target is missing. */
export function resolveDimension(dim: Dimension, ctx: ResolveContext): ResolvedDimension | null {
  const precision = dim.precision ?? DEFAULT_PRECISION;
  const offset = dim.displayOffset;
  const fmt = (v: number) => formatNumber(v, precision);
  const target = dim.target;

  switch (target.kind) {
    case "lineLength": {
      const line = findEntity(ctx, dim, target.entityId, "line");
      return line && linearDimension(dim.id, line.p1, line.p2, offset, fmt(line.length), line.length);
    }
    case "pointDistance": {
      const p1 = ctx.point(target.from);
      const p2 = ctx.point(target.to);
      if (!p1 || !p2) {
        ctx.report({ dimensionId: dim.id, message: `Dimension '${dim.id}' references an unresolved point` });
        return null;
      }
      const value = distance(p1, p2);
      return linearDimension(dim.id, p1, p2, offset, fmt(value), value);
    }
    case "circleRadius":
    case "circleDiameter": {
      const circle = findEntity(ctx, dim, target.entityId, "circle");
      if (!circle) return null;
      const isDiameter = target.kind === "circleDiameter";
      const value = isDiameter ? circle.radius * 2 : circle.radius;
      const text = `${isDiameter ? "⌀" : "R"}${fmt(value)}`;
      return leaderDimension(dim.id, isDiameter ? "diameter" : "radius", circle.center, circle.radius, CIRCLE_LEADER_ANGLE_DEG, offset, value, text);
    }
    case "arcRadius": {
      const arc = findEntity(ctx, dim, target.entityId, "arc");
      if (!arc) return null;
      const midAngle = arc.startAngleDeg + ccwSpanDeg(arc.startAngleDeg, arc.endAngleDeg) / 2;
      return leaderDimension(dim.id, "radius", arc.center, arc.radius, midAngle, offset, arc.radius, `R${fmt(arc.radius)}`);
    }
    case "arcAngle": {
      const arc = findEntity(ctx, dim, target.entityId, "arc");
      if (!arc) return null;
      const span = ccwSpanDeg(arc.startAngleDeg, arc.endAngleDeg);
      const radius = arc.radius + offset;
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
        textPos: polar(arc.center, radius, arc.startAngleDeg + span / 2),
        text: `${fmt(span)}°`,
      };
    }
  }
}
