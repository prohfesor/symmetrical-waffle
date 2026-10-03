import { Dimension, Entity, generateId, ResolvedDrawing, roundTo, Vec2, distance } from "@pcad/core";
import { buildArc, buildCircle, buildLine, buildPolyline, buildRectangle, ClickPoint } from "../tools/build.js";
import type { ToolId } from "../tools/types.js";
import { hitTestEntities } from "./hitTest.js";

/**
 * The in-progress state of the active drawing tool: the points clicked so far,
 * and (for the dimension tools) the entity chosen to dimension. Kept free of
 * React and the DOM so the click-by-click behaviour of every tool is testable.
 */
export interface ToolSession {
  clicks: ClickPoint[];
  dimTarget: string | null;
}

export const EMPTY_SESSION: ToolSession = { clicks: [], dimTarget: null };

export type Commit = { kind: "entity"; entity: Entity } | { kind: "dimension"; dimension: Dimension };

export interface Step {
  session: ToolSession;
  /** Set when this click completed a shape or dimension. */
  commit?: Commit;
}

const keep = (session: ToolSession): Step => ({ session });
const pending = (clicks: ClickPoint[]): Step => ({ session: { clicks, dimTarget: null } });
const done = (commit: Commit): Step => ({ session: EMPTY_SESSION, commit });
const doneEntity = (entity: Entity): Step => done({ kind: "entity", entity });

function sameSpot(a: Vec2, b: Vec2): boolean {
  return distance(a, b) < 1e-9;
}

/**
 * The point the *next* click's direction is measured from, for Shift angle
 * snap: a line's first point, an arc's center (for both its start and end
 * angle clicks), or a polyline's most recent vertex. Null when the next click
 * has no direction to constrain (the first click of any shape).
 */
export function angleSnapReference(tool: ToolId, session: ToolSession): Vec2 | null {
  const { clicks } = session;
  if (clicks.length === 0) return null;
  if (tool === "line" || tool === "arc") return clicks[0].world;
  if (tool === "polyline") return clicks[clicks.length - 1].world;
  return null;
}

/**
 * Feeds one click into the active tool.
 *
 * @param click where the click landed after snapping
 * @param raw   the unsnapped cursor position -- used to pick entities to dimension and to place dimension lines, where a grid snap would only get in the way
 * @param hitRadius pick tolerance in drawing units
 */
export function advanceTool(tool: ToolId, session: ToolSession, click: ClickPoint, raw: Vec2, drawing: ResolvedDrawing, hitRadius: number): Step {
  const { clicks } = session;
  switch (tool) {
    case "line":
      return clicks.length === 0 ? pending([click]) : doneEntity(buildLine(clicks[0], click));
    case "circle":
      return clicks.length === 0 ? pending([click]) : doneEntity(buildCircle(clicks[0], click.world));
    case "rectangle":
      return clicks.length === 0 ? pending([click]) : doneEntity(buildRectangle(clicks[0], click.world));
    case "arc":
      if (clicks.length === 0) return pending([click]);
      // Only the center can anchor to existing geometry; the start/end clicks just set directions.
      if (clicks.length === 1) return pending([...clicks, { world: click.world, snapRef: null }]);
      return doneEntity(buildArc(clicks[0], clicks[1].world, click.world));
    case "polyline":
      // A double-click delivers two pointer-downs at one spot; don't create a zero-length segment out of it.
      if (clicks.length > 0 && sameSpot(clicks[clicks.length - 1].world, click.world)) return keep(session);
      return pending([...clicks, click]);
    case "dim-linear":
      return advanceDimension(session, raw, drawing, hitRadius, (hit) => hit.kind === "line", (line, at) => {
        if (line.kind !== "line") return null;
        return { id: generateId("dim"), target: { kind: "lineLength", entityId: line.id }, displayOffset: roundTo(signedOffset(line.p1, line.p2, at)) };
      });
    case "dim-radius":
      return advanceDimension(session, raw, drawing, hitRadius, (hit) => hit.kind === "circle" || hit.kind === "arc", (shape, at) => {
        if (shape.kind !== "circle" && shape.kind !== "arc") return null;
        return {
          id: generateId("dim"),
          target: { kind: shape.kind === "circle" ? "circleRadius" : "arcRadius", entityId: shape.id },
          displayOffset: roundTo(distance(shape.center, at) - shape.radius),
        };
      });
    case "select":
      return keep(session);
  }
}

/** Two-click dimension flow: first click picks the entity, second places the dimension. */
function advanceDimension(
  session: ToolSession,
  raw: Vec2,
  drawing: ResolvedDrawing,
  hitRadius: number,
  accepts: (hit: ResolvedDrawing["entities"][number]) => boolean,
  build: (target: ResolvedDrawing["entities"][number], at: Vec2) => Dimension | null,
): Step {
  if (session.dimTarget === null) {
    const hit = hitTestEntities(drawing, raw, hitRadius);
    return hit && accepts(hit) ? { session: { clicks: [], dimTarget: hit.id } } : keep(session);
  }
  const target = drawing.entities.find((e) => e.id === session.dimTarget);
  const dimension = target ? build(target, raw) : null;
  return dimension ? done({ kind: "dimension", dimension }) : { session: EMPTY_SESSION };
}

/** Signed perpendicular distance from the line a->b to p (positive on the left of a->b). */
function signedOffset(a: Vec2, b: Vec2, p: Vec2): number {
  const len = distance(a, b) || 1;
  return ((p.x - a.x) * -(b.y - a.y) + (p.y - a.y) * (b.x - a.x)) / len;
}

/** Completes the polyline in progress (Enter / double-click). Needs at least two distinct points. */
export function finishPolyline(session: ToolSession, closed = false): Step {
  const clicks = session.clicks.filter((c, i) => i === 0 || !sameSpot(session.clicks[i - 1].world, c.world));
  return clicks.length >= 2 ? doneEntity(buildPolyline(clicks, closed)) : keep(session);
}
