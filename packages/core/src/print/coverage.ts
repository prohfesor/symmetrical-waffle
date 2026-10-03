import { dimensionPaths, entityPaths, Path } from "../geom/flatten.js";
import { ResolvedDrawing, Vec2 } from "../geom/resolved-types.js";
import { Tile } from "./tiling.js";

interface Rect {
  min: Vec2;
  max: Vec2;
}

/** Does the segment a-b touch the rectangle? (Liang-Barsky clipping.) */
function segmentTouchesRect(a: Vec2, b: Vec2, rect: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clips: [number, number][] = [
    [-dx, a.x - rect.min.x],
    [dx, rect.max.x - a.x],
    [-dy, a.y - rect.min.y],
    [dy, rect.max.y - a.y],
  ];
  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return false; // parallel to this edge and outside it
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function pathTouchesRect(path: Path, rect: Rect): boolean {
  const { points, closed } = path;
  if (points.length === 1) return segmentTouchesRect(points[0], points[0], rect);
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    if (segmentTouchesRect(points[i], points[(i + 1) % points.length], rect)) return true;
  }
  return false;
}

/**
 * The labels of the tiles that have something to print: any drawn line, curve or
 * dimension annotation that passes through the tile's region (overlap included,
 * since that part is printed on the sheet too). Sheets over empty corners of an
 * L-shaped drawing, say, are the ones that can be skipped.
 *
 * @param tolerance how far (in drawing units) curves may be flattened off true
 */
export function tilesWithGeometry(drawing: ResolvedDrawing, tiles: readonly Tile[], tolerance: number): Set<string> {
  const paths: Path[] = drawing.entities.flatMap((e) => entityPaths(e, tolerance));
  const labelPoints: Vec2[] = [];
  for (const d of drawing.dimensions) {
    const { paths: dimPaths, label } = dimensionPaths(d, tolerance);
    paths.push(...dimPaths);
    labelPoints.push(label.position);
  }

  const used = new Set<string>();
  for (const tile of tiles) {
    const rect = { min: tile.realMin, max: tile.realMax };
    const holdsLabel = labelPoints.some((p) => p.x >= rect.min.x && p.x <= rect.max.x && p.y >= rect.min.y && p.y <= rect.max.y);
    if (holdsLabel || paths.some((path) => pathTouchesRect(path, rect))) used.add(tile.label);
  }
  return used;
}
