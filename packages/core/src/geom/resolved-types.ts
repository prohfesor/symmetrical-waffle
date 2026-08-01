export interface Vec2 {
  x: number;
  y: number;
}

export interface ResolvedLine {
  id: string;
  kind: "line";
  layerId?: string;
  p1: Vec2;
  p2: Vec2;
  length: number;
  angleDeg: number;
}

export interface ResolvedCircle {
  id: string;
  kind: "circle";
  layerId?: string;
  center: Vec2;
  radius: number;
}

export interface ResolvedArc {
  id: string;
  kind: "arc";
  layerId?: string;
  center: Vec2;
  radius: number;
  startAngleDeg: number;
  endAngleDeg: number;
  startPoint: Vec2;
  endPoint: Vec2;
}

export interface ResolvedPolyline {
  id: string;
  kind: "polyline";
  layerId?: string;
  points: Vec2[];
  closed: boolean;
}

export interface ResolvedRectangle {
  id: string;
  kind: "rectangle";
  layerId?: string;
  corners: [Vec2, Vec2, Vec2, Vec2];
  width: number;
  height: number;
  rotationDeg: number;
}

export type ResolvedEntity =
  | ResolvedLine
  | ResolvedCircle
  | ResolvedArc
  | ResolvedPolyline
  | ResolvedRectangle;

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

export interface ResolveIssue {
  entityId?: string;
  dimensionId?: string;
  message: string;
}

export interface ResolvedDrawing {
  entities: ResolvedEntity[];
  dimensions: ResolvedDimension[];
  /** Named points per entity id, e.g. namedPoints["line1"]["p2"], for anchors and inspection. */
  namedPoints: Record<string, Record<string, Vec2>>;
  issues: ResolveIssue[];
  /** Axis-aligned bounding box of all entities, or null if there are none. */
  bounds: { min: Vec2; max: Vec2 } | null;
}
