import { Formula } from "../expr/index.js";

/**
 * A point that is either given directly (free, draggable in a GUI) or anchored
 * to a named point produced by another entity, so shapes stay connected as
 * parameters change (e.g. a circle centered on the endpoint of a line).
 */
export type PointDef = { kind: "free"; x: Formula; y: Formula } | { kind: "anchor"; ref: PointRef };

/** Reference to a named point on an entity, e.g. "line1.p2", "circle3.center". */
export type PointRef = string;

export function makeRef(entityId: string, pointName: string): PointRef {
  return `${entityId}.${pointName}`;
}

export interface ParseRefResult {
  entityId: string;
  pointName: string;
}

export function parseRef(ref: PointRef): ParseRefResult {
  const idx = ref.lastIndexOf(".");
  if (idx === -1) throw new Error(`Invalid point reference '${ref}'`);
  return { entityId: ref.slice(0, idx), pointName: ref.slice(idx + 1) };
}

export interface LineEntity {
  id: string;
  kind: "line";
  p1: PointDef;
  /** Either give p2 directly, or define it polar-relative to p1 via length/angle (degrees, CCW from +X). */
  mode: "twoPoint" | "polar";
  p2?: PointDef;
  length?: Formula;
  angle?: Formula;
}

export interface CircleEntity {
  id: string;
  kind: "circle";
  center: PointDef;
  radius: Formula;
}

export interface ArcEntity {
  id: string;
  kind: "arc";
  center: PointDef;
  radius: Formula;
  /** Degrees, CCW from +X axis. */
  startAngle: Formula;
  endAngle: Formula;
}

export type PolySegment = { kind: "polar"; length: Formula; angle: Formula } | { kind: "relative"; dx: Formula; dy: Formula };

export interface PolylineEntity {
  id: string;
  kind: "polyline";
  start: PointDef;
  segments: PolySegment[];
  closed: boolean;
}

export interface RectangleEntity {
  id: string;
  kind: "rectangle";
  corner: PointDef;
  width: Formula;
  height: Formula;
  /** Degrees, CCW from +X axis. */
  rotation?: Formula;
}

/**
 * Draws a mirrored copy of other entities across an axis (the line through two
 * points). The copies are computed, not stored, so they follow the originals and
 * the axis position as parameters change. Sources may also name another mirror,
 * meaning "all of its copies" (e.g. mirror across two axes for quadrant symmetry).
 * The copies get the ids "<mirrorId>.<sourceId>", so they can be anchored to and
 * dimensioned like any entity; their named points correspond to the source's.
 */
export interface MirrorEntity {
  id: string;
  kind: "mirror";
  axis: { p1: PointDef; p2: PointDef };
  /** Ids of the entities (or mirrors) to reflect. */
  sources: string[];
}

export type Entity = LineEntity | CircleEntity | ArcEntity | PolylineEntity | RectangleEntity | MirrorEntity;

export type DimensionTarget =
  | { kind: "lineLength"; entityId: string }
  | { kind: "circleRadius"; entityId: string }
  | { kind: "circleDiameter"; entityId: string }
  | { kind: "arcRadius"; entityId: string }
  | { kind: "arcAngle"; entityId: string }
  | { kind: "pointDistance"; from: PointRef; to: PointRef };

export interface Dimension {
  id: string;
  target: DimensionTarget;
  /** Perpendicular distance from the measured geometry to the dimension line, in drawing units. */
  displayOffset: number;
  precision?: number;
  label?: string;
}

export interface Layer {
  id: string;
  name: string;
  color?: string;
  visible?: boolean;
}

export const DOCUMENT_FORMAT_VERSION = 1;

export interface DrawingDocument {
  formatVersion: number;
  title?: string;
  units: "mm" | "cm" | "in";
  /** Relative path to the companion params text file, for desktop file linking. */
  paramsFile?: string;
  layers: Layer[];
  entities: Entity[];
  dimensions: Dimension[];
}

export function createEmptyDocument(): DrawingDocument {
  return {
    formatVersion: DOCUMENT_FORMAT_VERSION,
    units: "mm",
    layers: [{ id: "layer0", name: "Default", visible: true }],
    entities: [],
    dimensions: [],
  };
}
