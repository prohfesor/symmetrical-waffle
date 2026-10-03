import { dimensionGraphics } from "../geom/flatten.js";
import { Bounds, ResolvedDimension, ResolvedDrawing, ResolvedEntity, Vec2 } from "../geom/resolved-types.js";
import { ccwSpanDeg, normalizeDeg } from "../math.js";

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
const LAYERS = [GEOMETRY_LAYER, DIMENSIONS_LAYER];
const DEFAULT_TEXT_HEIGHT = 2.5;
/** Sweeps this close to a full turn are written as CIRCLE (an ARC whose start equals its end is ambiguous). */
const FULL_CIRCLE_EPSILON_DEG = 1e-6;

/**
 * Encodes text for a DXF TEXT value. Group-code values are one line each, so
 * line breaks must never appear; AutoCAD's `%%c`, `%%d`, `%%p` codes carry the
 * diameter, degree and plus-minus signs, and anything else outside ASCII is
 * written as a `\U+XXXX` escape.
 */
export function encodeDxfText(text: string): string {
  const ascii = text
    .replace(/[\r\n]+/g, " ")
    .replace(/⌀/g, "%%c")
    .replace(/°/g, "%%d")
    .replace(/±/g, "%%p");
  return Array.from(ascii, (ch) => {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code < 0x7f) return ch;
    return code <= 0xffff ? `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}` : "?";
  }).join("");
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toFixed(1);
  return String(Math.round(n * 1e6) / 1e6);
}

class DxfWriter {
  private readonly lines: string[] = [];

  code(code: number, value: string | number): void {
    this.lines.push(String(code), typeof value === "number" ? formatNumber(value) : value);
  }

  point(codeX: number, p: Vec2): void {
    this.code(codeX, p.x);
    this.code(codeX + 10, p.y);
    this.code(codeX + 20, 0);
  }

  section(name: string, body: () => void): void {
    this.code(0, "SECTION");
    this.code(2, name);
    body();
    this.code(0, "ENDSEC");
  }

  toString(): string {
    return this.lines.join("\r\n") + "\r\n";
  }
}

function writeHeader(w: DxfWriter, bounds: Bounds | null): void {
  w.section("HEADER", () => {
    w.code(9, "$ACADVER");
    w.code(1, "AC1009");
    if (bounds) {
      w.code(9, "$EXTMIN");
      w.point(10, bounds.min);
      w.code(9, "$EXTMAX");
      w.point(10, bounds.max);
    }
  });
}

function writeTables(w: DxfWriter): void {
  w.section("TABLES", () => {
    w.code(0, "TABLE");
    w.code(2, "LAYER");
    w.code(70, LAYERS.length);
    for (const name of LAYERS) {
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
  w.point(10, p1);
  w.point(11, p2);
}

function writeCircle(w: DxfWriter, layer: string, center: Vec2, radius: number): void {
  w.code(0, "CIRCLE");
  w.code(8, layer);
  w.point(10, center);
  w.code(40, radius);
}

function writeArc(w: DxfWriter, layer: string, center: Vec2, radius: number, startDeg: number, endDeg: number): void {
  if (ccwSpanDeg(startDeg, endDeg) >= 360 - FULL_CIRCLE_EPSILON_DEG) {
    writeCircle(w, layer, center, radius);
    return;
  }
  w.code(0, "ARC");
  w.code(8, layer);
  w.point(10, center);
  w.code(40, radius);
  w.code(50, normalizeDeg(startDeg));
  w.code(51, normalizeDeg(endDeg));
}

function writePolyline(w: DxfWriter, layer: string, points: readonly Vec2[], closed: boolean): void {
  w.code(0, "POLYLINE");
  w.code(8, layer);
  w.code(66, 1);
  w.code(70, closed ? 1 : 0);
  for (const p of points) {
    w.code(0, "VERTEX");
    w.code(8, layer);
    w.point(10, p);
  }
  w.code(0, "SEQEND");
}

function writeText(w: DxfWriter, layer: string, pos: Vec2, height: number, value: string): void {
  w.code(0, "TEXT");
  w.code(8, layer);
  w.point(10, pos);
  w.code(40, height);
  w.code(1, encodeDxfText(value));
}

function writeEntity(w: DxfWriter, e: ResolvedEntity): void {
  switch (e.kind) {
    case "line":
      return writeLine(w, GEOMETRY_LAYER, e.p1, e.p2);
    case "circle":
      return writeCircle(w, GEOMETRY_LAYER, e.center, e.radius);
    case "arc":
      return writeArc(w, GEOMETRY_LAYER, e.center, e.radius, e.startAngleDeg, e.endAngleDeg);
    case "polyline":
      return writePolyline(w, GEOMETRY_LAYER, e.points, e.closed);
    case "rectangle":
      return writePolyline(w, GEOMETRY_LAYER, e.corners, true);
  }
}

/**
 * Dimensions are exported as plain "dumb" geometry (extension lines, dimension
 * line, and text) rather than native DXF DIMENSION entities. Native DIMENSION
 * entities require an associated dimension-style block to render correctly in
 * every reader; this exploded form displays identically everywhere DXF is opened.
 */
function writeDimension(w: DxfWriter, d: ResolvedDimension, textHeight: number): void {
  const { lines, arcs, label } = dimensionGraphics(d);
  lines.forEach(([a, b]) => writeLine(w, DIMENSIONS_LAYER, a, b));
  arcs.forEach((a) => writeArc(w, DIMENSIONS_LAYER, a.center, a.radius, a.startDeg, a.endDeg));
  writeText(w, DIMENSIONS_LAYER, label.position, textHeight, label.text);
}

export interface DxfExportOptions {
  /** Text height for dimension annotations, in drawing units. Default 2.5. */
  dimensionTextHeight?: number;
}

export function exportDxf(drawing: ResolvedDrawing, options: DxfExportOptions = {}): string {
  const w = new DxfWriter();
  const textHeight = options.dimensionTextHeight ?? DEFAULT_TEXT_HEIGHT;

  writeHeader(w, drawing.bounds);
  writeTables(w);
  w.section("ENTITIES", () => {
    drawing.entities.forEach((e) => writeEntity(w, e));
    drawing.dimensions.forEach((d) => writeDimension(w, d, textHeight));
  });
  w.code(0, "EOF");
  return w.toString();
}
