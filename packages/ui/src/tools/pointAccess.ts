import { Entity, PointDef, roundTo } from "@wafflecad/core";

/** Returns the entity's own draggable PointDef field for a named point, or null if that point is derived (not directly editable by dragging). */
export function getRootPointDef(entity: Entity, pointName: string): PointDef | null {
  switch (entity.kind) {
    case "line":
      if (pointName === "p1") return entity.p1;
      if (pointName === "p2" && entity.mode === "twoPoint") return entity.p2 ?? null;
      return null;
    case "circle":
      return pointName === "center" ? entity.center : null;
    case "arc":
      return pointName === "center" ? entity.center : null;
    case "polyline":
      return pointName === "start" || pointName === "v0" ? entity.start : null;
    case "rectangle":
      return pointName === "corner0" ? entity.corner : null;
    case "mirror":
      return pointName === "a1" ? entity.axis.p1 : pointName === "a2" ? entity.axis.p2 : null;
  }
}

export function isDraggableFreePoint(entity: Entity, pointName: string): boolean {
  const pd = getRootPointDef(entity, pointName);
  return !!pd && pd.kind === "free" && typeof pd.x === "number" && typeof pd.y === "number";
}

export function withMovedPoint(entity: Entity, pointName: string, x: number, y: number): Entity {
  const point: PointDef = { kind: "free", x: roundTo(x), y: roundTo(y) };
  switch (entity.kind) {
    case "line":
      if (pointName === "p1") return { ...entity, p1: point };
      if (pointName === "p2" && entity.mode === "twoPoint") return { ...entity, p2: point };
      return entity;
    case "circle":
      return pointName === "center" ? { ...entity, center: point } : entity;
    case "arc":
      return pointName === "center" ? { ...entity, center: point } : entity;
    case "polyline":
      return pointName === "start" || pointName === "v0" ? { ...entity, start: point } : entity;
    case "rectangle":
      return pointName === "corner0" ? { ...entity, corner: point } : entity;
    case "mirror":
      if (pointName === "a1") return { ...entity, axis: { ...entity.axis, p1: point } };
      if (pointName === "a2") return { ...entity, axis: { ...entity.axis, p2: point } };
      return entity;
  }
}
