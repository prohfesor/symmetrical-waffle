import { ResolvedDimension, ResolvedDrawing, ResolvedEntity, Vec2 } from "../geom/resolved-types.js";
import { Layer } from "../geom/types.js";

/**
 * Minimal hand-rolled DXF R12 (AC1009) ASCII writer.
 *
 * R12 is deliberately targeted instead of a newer version: it has no
 * handle/owner cross-reference graph, no CLASSES/OBJECTS/BLOCK_RECORD
 * machinery, and is the de-facto lowest-common-denominator DXF flavor that
 * every CAD package (KOMPAS, AutoCAD, LibreCAD, QCAD, Fusion 360, Inkscape,
 * FreeCAD...) can read reliably. Geometry entities used: LINE, CIRCLE, ARC,
 * POLYLINE/VERTEX/SEQEND, and TEXT (for dimension annotations).
 */

const GEOMETRY_LAYER = "GEOMETRY";
const DIMENSIONS_LAYER = "DIMENSIONS";

class DxfWriter {
  private lines: string[] = [];

  code(code: number, value: string | number): void {
    this.lines.push(String(code));
    if (typeof value === "number") {
      this.lines.push(formatNumber(value));
    } else {
      this.lines.push(value);
    }
  }

  toString(): string {
    return this.lines.join("\r\n") + "\r\n";
  }
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toFixed(1);
  return String(Math.round(n * 1e6) / 1e6);
}

function section(w: DxfWriter, name: string, body: () => void): void {
  w.code(0, "SECTION");
  w.code(2, name);
  body();
  w.code(0, "ENDSEC");
}

function writeHeader(w: DxfWriter, bounds: { min: Vec2; max: Vec2 } | null): void {
  section(w, "HEADER", () => {
    w.code(9, "$ACADVER");
    w.code(1, "AC1009");
    if (bounds) {
      w.code(9, "$EXTMIN");
      w.code(10, bounds.min.x);
      w.code(20, bounds.min.y);
      w.code(30, 0);
      w.code(9, "$EXTMAX");
      w.code(10, bounds.max.x);
      w.code(20, bounds.max.y);
      w.code(30, 0);
    }
  });
}

function writeTables(w: DxfWriter, layers: string[]): void {
  section(w, "TABLES", () => {
    w.code(0, "TABLE");
    w.code(2, "LAYER");
    w.code(70, layers.length);
    for (const name of layers) {
      w.code(0, "LAYER");
      w.code(2, name);
      w.code(70, 0);
      w.code(62, 7);
      w.code(6, "CONTINUOUS");
    }
    w.code(0, "ENDTAB");
  });
}

function writeLine(w: DxfWriter, layer: string, p1: Vec2, p2: Vec2): void {
  w.code(0, "LINE");
  w.code(8, layer);
  w.code(10, p1.x);
  w.code(20, p1.y);
  w.code(30, 0);
  w.code(11, p2.x);
  w.code(21, p2.y);
  w.code(31, 0);
}

function writeCircle(w: DxfWriter, layer: string, center: Vec2, radius: number): void {
  w.code(0, "CIRCLE");
  w.code(8, layer);
  w.code(10, center.x);
  w.code(20, center.y);
  w.code(30, 0);
  w.code(40, radius);
}

function writeArc(w: DxfWriter, layer: string, center: Vec2, radius: number, startDeg: number, endDeg: number): void {
  w.code(0, "ARC");
  w.code(8, layer);
  w.code(10, center.x);
  w.code(20, center.y);
  w.code(30, 0);
  w.code(40, radius);
  w.code(50, startDeg);
  w.code(51, endDeg);
}

function writePolyline(w: DxfWriter, layer: string, points: Vec2[], closed: boolean): void {
  w.code(0, "POLYLINE");
  w.code(8, layer);
  w.code(66, 1);
  w.code(70, closed ? 1 : 0);
  for (const p of points) {
    w.code(0, "VERTEX");
    w.code(8, layer);
    w.code(10, p.x);
    w.code(20, p.y);
    w.code(30, 0);
  }
  w.code(0, "SEQEND");
}

function writeText(w: DxfWriter, layer: string, pos: Vec2, height: number, value: string): void {
  w.code(0, "TEXT");
  w.code(8, layer);
  w.code(10, pos.x);
  w.code(20, pos.y);
  w.code(30, 0);
  w.code(40, height);
  w.code(1, value);
}

function writeGeometryEntity(w: DxfWriter, e: ResolvedEntity): void {
  switch (e.kind) {
    case "line":
      writeLine(w, GEOMETRY_LAYER, e.p1, e.p2);
      break;
    case "circle":
      writeCircle(w, GEOMETRY_LAYER, e.center, e.radius);
      break;
    case "arc":
      writeArc(w, GEOMETRY_LAYER, e.center, e.radius, e.startAngleDeg, e.endAngleDeg);
      break;
    case "polyline":
      writePolyline(w, GEOMETRY_LAYER, e.points, e.closed);
      break;
    case "rectangle":
      writePolyline(w, GEOMETRY_LAYER, e.corners, true);
      break;
  }
}

/**
 * Dimensions are exported as plain "dumb" geometry (extension lines, dimension
 * line, arrowhead-free ticks, and text) rather than native DXF DIMENSION
 * entities. Native DIMENSION entities require an associated dimension-style
 * block/anonymous block definition to render correctly in every reader; this
 * exploded form is guaranteed to display identically everywhere DXF is opened.
 */
function writeDimensionEntity(w: DxfWriter, d: ResolvedDimension, textHeight: number): void {
  switch (d.kind) {
    case "linear": {
      writeLine(w, DIMENSIONS_LAYER, d.p1, d.dimLineP1);
      writeLine(w, DIMENSIONS_LAYER, d.p2, d.dimLineP2);
      writeLine(w, DIMENSIONS_LAYER, d.dimLineP1, d.dimLineP2);
      writeText(w, DIMENSIONS_LAYER, d.textPos, textHeight, d.text);
      break;
    }
    case "radius":
    case "diameter": {
      writeLine(w, DIMENSIONS_LAYER, d.onCircle, d.leaderEnd);
      writeText(w, DIMENSIONS_LAYER, d.textPos, textHeight, d.text);
      break;
    }
    case "angular": {
      writeArc(w, DIMENSIONS_LAYER, d.center, d.radius, d.startAngleDeg, d.endAngleDeg);
      writeText(w, DIMENSIONS_LAYER, d.textPos, textHeight, d.text);
      break;
    }
  }
}

export interface DxfExportOptions {
  /** Text height for dimension annotations, in drawing units. Default 2.5. */
  dimensionTextHeight?: number;
  layers?: Layer[];
}

export function exportDxf(drawing: ResolvedDrawing, options: DxfExportOptions = {}): string {
  const w = new DxfWriter();
  const textHeight = options.dimensionTextHeight ?? 2.5;

  writeHeader(w, drawing.bounds);
  writeTables(w, [GEOMETRY_LAYER, DIMENSIONS_LAYER]);

  section(w, "ENTITIES", () => {
    for (const e of drawing.entities) writeGeometryEntity(w, e);
    for (const d of drawing.dimensions) writeDimensionEntity(w, d, textHeight);
  });

  w.code(0, "EOF");
  return w.toString();
}
