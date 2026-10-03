import { Formula, MirrorEntity, PointDef, Vec2 } from "@wafflecad/core";

export type AxisDirection = "vertical" | "horizontal";

/** `formula + delta`, staying a plain number when it was one. */
function offset(f: Formula, delta: number): Formula {
  return typeof f === "number" ? f + delta : `=(${f.replace(/^=/, "")})${delta < 0 ? "-" : "+"}${Math.abs(delta)}`;
}

/**
 * Re-aims a mirror's axis to run straight up/down or left/right through its first point,
 * keeping that point (and any formulas in it) where it is.
 */
export function withAxisDirection(mirror: MirrorEntity, direction: AxisDirection, resolvedP1: Vec2): MirrorEntity {
  const p1 = mirror.axis.p1;
  const [x, y]: [Formula, Formula] = p1.kind === "free" ? [p1.x, p1.y] : [resolvedP1.x, resolvedP1.y];
  const p2: PointDef = direction === "vertical" ? { kind: "free", x, y: offset(y, 1) } : { kind: "free", x: offset(x, 1), y };
  return { ...mirror, axis: { ...mirror.axis, p2 } };
}
