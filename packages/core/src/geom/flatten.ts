import { ccwSpanDeg, DEG2RAD, polar } from "../math.js";
import { ResolvedDimension, ResolvedEntity, Vec2 } from "./resolved-types.js";

/**
 * Backend-independent drawing primitives. The canvas renderer, the PDF
 * exporter and the DXF writer all draw the same entities and dimensions; this
 * module is the single place that decides *what* gets drawn (which lines, which
 * arcs, where the label goes) so the three can't drift apart.
 */

/** A connected run of straight segments. */
export interface Path {
  points: Vec2[];
  closed: boolean;
}

export interface ArcSpec {
  center: Vec2;
  radius: number;
  /** Counter-clockwise from startDeg to endDeg. */
  startDeg: number;
  endDeg: number;
}

export interface Label {
  position: Vec2;
  text: string;
}

const MIN_SEGMENTS = 4;
const MAX_SEGMENTS = 4096;

/**
 * Number of chords needed so a polygon approximating an arc never strays more
 * than `tolerance` (in drawing units) from the true curve.
 */
export function arcSegmentCount(radius: number, sweepDeg: number, tolerance: number): number {
  if (!(radius > 0) || !(tolerance > 0)) return MIN_SEGMENTS;
  const maxChordAngle = 2 * Math.acos(1 - Math.min(1, tolerance / radius));
  const count = Math.ceil((sweepDeg * DEG2RAD) / maxChordAngle);
  return Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, Number.isFinite(count) ? count : MIN_SEGMENTS));
}

/** Points along a CCW arc, both end points included. */
export function arcPoints(center: Vec2, radius: number, startDeg: number, endDeg: number, tolerance: number): Vec2[] {
  const span = ccwSpanDeg(startDeg, endDeg);
  const segments = arcSegmentCount(radius, span, tolerance);
  return Array.from({ length: segments + 1 }, (_, i) => polar(center, radius, startDeg + (span * i) / segments));
}

/** Points around a full circle (no repeated end point; treat as closed). */
export function circlePoints(center: Vec2, radius: number, tolerance: number): Vec2[] {
  const segments = Math.max(16, arcSegmentCount(radius, 360, tolerance));
  return Array.from({ length: segments }, (_, i) => polar(center, radius, (360 * i) / segments));
}

export function entityPaths(e: ResolvedEntity, tolerance: number): Path[] {
  switch (e.kind) {
    case "line":
      return [{ points: [e.p1, e.p2], closed: false }];
    case "circle":
      return [{ points: circlePoints(e.center, e.radius, tolerance), closed: true }];
    case "arc":
      return [{ points: arcPoints(e.center, e.radius, e.startAngleDeg, e.endAngleDeg, tolerance), closed: false }];
    case "polyline":
      return [{ points: e.points, closed: e.closed }];
    case "rectangle":
      return [{ points: e.corners, closed: true }];
  }
}

export interface DimensionGraphics {
  lines: [Vec2, Vec2][];
  arcs: ArcSpec[];
  label: Label;
}

export function dimensionGraphics(d: ResolvedDimension): DimensionGraphics {
  const label: Label = { position: d.textPos, text: d.text };
  switch (d.kind) {
    case "linear":
      return {
        lines: [
          [d.p1, d.dimLineP1],
          [d.p2, d.dimLineP2],
          [d.dimLineP1, d.dimLineP2],
        ],
        arcs: [],
        label,
      };
    case "radius":
    case "diameter":
      return { lines: [[d.onCircle, d.leaderEnd]], arcs: [], label };
    case "angular":
      return { lines: [], arcs: [{ center: d.center, radius: d.radius, startDeg: d.startAngleDeg, endDeg: d.endAngleDeg }], label };
  }
}

/** A dimension's strokes as polylines (arcs flattened), plus its label. */
export function dimensionPaths(d: ResolvedDimension, tolerance: number): { paths: Path[]; label: Label } {
  const { lines, arcs, label } = dimensionGraphics(d);
  const paths: Path[] = [
    ...lines.map((points): Path => ({ points, closed: false })),
    ...arcs.map((a): Path => ({ points: arcPoints(a.center, a.radius, a.startDeg, a.endDeg, tolerance), closed: false })),
  ];
  return { paths, label };
}
