export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned bounding box. */
export interface Bounds {
  min: Vec2;
  max: Vec2;
}

export interface ResolvedLine {
  id: string;
  /** Id of the mirror that produced this copy; absent for ordinary entities. */
  derivedFrom?: string;
  kind: "line";
  p1: Vec2;
  p2: Vec2;
  length: number;
  angleDeg: number;
}

export interface ResolvedCircle {
  id: string;
  /** Id of the mirror that produced this copy; absent for ordinary entities. */
  derivedFrom?: string;
  kind: "circle";
  center: Vec2;
  radius: number;
}

export interface ResolvedArc {
  id: string;
  /** Id of the mirror that produced this copy; absent for ordinary entities. */
  derivedFrom?: string;
  kind: "arc";
  center: Vec2;
  radius: number;
  startAngleDeg: number;
  endAngleDeg: number;
  startPoint: Vec2;
  endPoint: Vec2;
}

export interface ResolvedPolyline {
  id: string;
  /** Id of the mirror that produced this copy; absent for ordinary entities. */
  derivedFrom?: string;
  kind: "polyline";
  points: Vec2[];
  closed: boolean;
}

export interface ResolvedRectangle {
  id: string;
  /** Id of the mirror that produced this copy; absent for ordinary entities. */
  derivedFrom?: string;
  kind: "rectangle";
  corners: [Vec2, Vec2, Vec2, Vec2];
  width: number;
  height: number;
  rotationDeg: number;
}

export type ResolvedEntity = ResolvedLine | ResolvedCircle | ResolvedArc | ResolvedPolyline | ResolvedRectangle;

export type ResolvedDimension =
  | {
      id: string;
      kind: "linear";
      value: number;
      p1: Vec2;
      p2: Vec2;
      dimLineP1: Vec2;
      dimLineP2: Vec2;
      textPos: Vec2;
      text: string;
    }
  | {
      id: string;
      kind: "radius" | "diameter";
      value: number;
      center: Vec2;
      onCircle: Vec2;
      leaderEnd: Vec2;
      textPos: Vec2;
      text: string;
    }
  | {
      id: string;
      kind: "angular";
      value: number;
      center: Vec2;
      radius: number;
      arcStart: Vec2;
      arcEnd: Vec2;
      startAngleDeg: number;
      endAngleDeg: number;
      textPos: Vec2;
      text: string;
    };

/** A mirror's axis, drawn as a construction line on screen but never exported or printed. */
export interface ResolvedAxis {
  id: string;
  p1: Vec2;
  p2: Vec2;
}

export interface ResolveIssue {
  entityId?: string;
  dimensionId?: string;
  message: string;
}

export interface ResolvedDrawing {
  entities: ResolvedEntity[];
  dimensions: ResolvedDimension[];
  axes: ResolvedAxis[];
  /** Named points per entity id, e.g. namedPoints["line1"]["p2"], for anchors and inspection. */
  namedPoints: Record<string, Record<string, Vec2>>;
  issues: ResolveIssue[];
  /** Bounding box of all geometry and dimension annotations, or null if there are none. */
  bounds: Bounds | null;
}
