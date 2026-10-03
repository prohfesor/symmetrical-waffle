import {
  clip,
  endPath,
  lineTo,
  moveTo,
  PDFDocument,
  PDFFont,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setLineWidth,
  setStrokingColor,
  stroke,
  StandardFonts,
  closePath,
} from "pdf-lib";
import { BoundsBuilder } from "../geom/bounds.js";
import { dimensionPaths, entityPaths, Path } from "../geom/flatten.js";
import { Bounds, ResolvedDimension, ResolvedDrawing, ResolvedEntity, Vec2 } from "../geom/resolved-types.js";
import { toPdfSafeText } from "./pdfText.js";
import { formatScale } from "./scale.js";
import { computeTiling, PrintSettings, Tile, TilingResult } from "./tiling.js";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number): number => v * PT_PER_MM;

/** How far (on paper) a flattened curve may stray from the true curve. Well below what a printer resolves. */
const CURVE_TOLERANCE_MM = 0.02;
const INDEX_SHEET_PAGE = { widthMm: 210, heightMm: 297, marginMm: 10, headerMm: 15 };

const GEOMETRY_STYLE = { color: rgb(0, 0, 0), thickness: 0.7 };
const DIMENSION_STYLE = { color: rgb(0.2, 0.35, 0.75), thickness: 0.4, textSize: 8 };
const TRIM_COLOR = rgb(0.55, 0.55, 0.55);
const OVERLAP_FILL = rgb(0.9, 0.9, 0.9);
const INDEX_GRID_COLOR = rgb(0.85, 0.3, 0.2);

export interface PdfExportOptions extends PrintSettings {
  title?: string;
  /** Dashed trim lines and corner marks at each sheet's non-overlapping core. Default true. */
  showCropMarks?: boolean;
  /** Light shading on the strips that are repeated on the neighbouring sheet. Default true. */
  showOverlapShading?: boolean;
  /** Title block (project, sheet label, paper, scale) at the foot of each sheet. Default true. */
  showLabels?: boolean;
  /** Add a final overview page showing how the sheets fit together. Default true. */
  includeIndexSheet?: boolean;
}

type Transform = (p: Vec2) => Vec2;

/** Draws resolved geometry onto one PDF page through a document-to-page transform. */
class Artist {
  constructor(
    private readonly page: PDFPage,
    private readonly toPage: Transform,
    private readonly font: PDFFont,
    private readonly safeText: (text: string) => string,
    /** Document-space curve tolerance. */
    private readonly tolerance: number,
    /** Document-space window; paths entirely outside it are skipped. */
    private readonly visible: Bounds | null,
  ) {}

  entity(e: ResolvedEntity): void {
    this.strokePaths(entityPaths(e, this.tolerance), GEOMETRY_STYLE);
  }

  dimension(d: ResolvedDimension): void {
    const { paths, label } = dimensionPaths(d, this.tolerance);
    this.strokePaths(paths, DIMENSION_STYLE);
    const text = this.safeText(label.text);
    const at = this.toPage(label.position);
    const width = this.font.widthOfTextAtSize(text, DIMENSION_STYLE.textSize);
    this.page.drawText(text, {
      x: at.x - width / 2,
      y: at.y - DIMENSION_STYLE.textSize / 2,
      size: DIMENSION_STYLE.textSize,
      font: this.font,
      color: DIMENSION_STYLE.color,
    });
  }

  private strokePaths(paths: Path[], style: { color: ReturnType<typeof rgb>; thickness: number }): void {
    for (const path of paths) {
      if (path.points.length < 2 || !this.isVisible(path.points)) continue;
      const [first, ...rest] = path.points.map(this.toPage);
      this.page.pushOperators(
        pushGraphicsState(),
        setLineWidth(style.thickness),
        setStrokingColor(style.color),
        moveTo(first.x, first.y),
        ...rest.map((p) => lineTo(p.x, p.y)),
        ...(path.closed ? [closePath()] : []),
        stroke(),
        popGraphicsState(),
      );
    }
  }

  private isVisible(points: readonly Vec2[]): boolean {
    if (!this.visible) return true;
    const { min, max } = this.visible;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return maxX >= min.x && minX <= max.x && maxY >= min.y && minY <= max.y;
  }
}

/** Safety margin (on paper) so stroke widths and label glyphs at the very edge aren't shaved by the clip. */
const EDGE_PAD_MM = 1;

/**
 * The area that must be printed: the drawing's bounds grown to cover each
 * dimension label's actual text box. Labels are centred on their anchor point,
 * so a label at the extreme edge would otherwise be cut in half by the clip.
 */
function printBounds(drawing: ResolvedDrawing, bounds: Bounds, scale: number, font: PDFFont, safeText: (text: string) => string): Bounds {
  const pdfPtToDoc = 1 / PT_PER_MM / scale;
  const builder = new BoundsBuilder().add(bounds.min).add(bounds.max);
  for (const d of drawing.dimensions) {
    const halfW = (font.widthOfTextAtSize(safeText(d.text), DIMENSION_STYLE.textSize) / 2) * pdfPtToDoc;
    const halfH = (DIMENSION_STYLE.textSize / 2) * pdfPtToDoc;
    builder.add({ x: d.textPos.x - halfW, y: d.textPos.y - halfH }).add({ x: d.textPos.x + halfW, y: d.textPos.y + halfH });
  }
  return padBounds(builder.build()!, EDGE_PAD_MM / scale);
}

function padBounds(b: Bounds, pad: number): Bounds {
  return { min: { x: b.min.x - pad, y: b.min.y - pad }, max: { x: b.max.x + pad, y: b.max.y + pad } };
}

function drawOverlapAndTrimMarks(page: PDFPage, tile: Tile, toPage: Transform, opts: Required<PdfExportOptions>): void {
  const full0 = toPage(tile.realMin);
  const full1 = toPage(tile.realMax);
  const coreTopLeft = toPage({ x: tile.coreRealMin.x, y: tile.coreRealMax.y });
  const coreBottomRight = toPage({ x: tile.coreRealMax.x, y: tile.coreRealMin.y });

  if (opts.showOverlapShading) {
    // Strips beyond this sheet's core are repeated on the next sheet to the right / below.
    if (coreBottomRight.x < full1.x) {
      page.drawRectangle({ x: coreBottomRight.x, y: full0.y, width: full1.x - coreBottomRight.x, height: full1.y - full0.y, color: OVERLAP_FILL, opacity: 0.6 });
    }
    if (full0.y < coreBottomRight.y) {
      page.drawRectangle({ x: full0.x, y: full0.y, width: full1.x - full0.x, height: coreBottomRight.y - full0.y, color: OVERLAP_FILL, opacity: 0.6 });
    }
  }

  if (opts.showCropMarks) {
    page.drawRectangle({
      x: coreTopLeft.x,
      y: coreBottomRight.y,
      width: coreBottomRight.x - coreTopLeft.x,
      height: coreTopLeft.y - coreBottomRight.y,
      borderColor: TRIM_COLOR,
      borderWidth: 0.5,
      borderDashArray: [4, 3],
    });
    const half = mm(4) / 2;
    const corners: Vec2[] = [coreTopLeft, { x: coreBottomRight.x, y: coreTopLeft.y }, { x: coreTopLeft.x, y: coreBottomRight.y }, coreBottomRight];
    for (const c of corners) {
      page.drawLine({ start: { x: c.x - half, y: c.y }, end: { x: c.x + half, y: c.y }, thickness: 0.5, color: TRIM_COLOR });
      page.drawLine({ start: { x: c.x, y: c.y - half }, end: { x: c.x, y: c.y + half }, thickness: 0.5, color: TRIM_COLOR });
    }
  }
}

function drawTile(
  pdf: PDFDocument,
  drawing: ResolvedDrawing,
  tiling: TilingResult,
  tile: Tile,
  opts: Required<PdfExportOptions>,
  font: PDFFont,
  safeText: (text: string) => string,
): void {
  const marginPt = mm(opts.marginMm);
  const pageWidthPt = mm(tiling.pageWidthMm);
  const pageHeightPt = mm(tiling.pageHeightMm);
  const page = pdf.addPage([pageWidthPt, pageHeightPt]);
  const printable = { x: marginPt, y: marginPt, width: pageWidthPt - 2 * marginPt, height: pageHeightPt - 2 * marginPt };

  const toPage: Transform = (p) => ({
    x: marginPt + (p.x - tile.realMin.x) * opts.scale * PT_PER_MM,
    y: marginPt + (p.y - tile.realMin.y) * opts.scale * PT_PER_MM,
  });

  page.drawRectangle({ ...printable, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
  drawOverlapAndTrimMarks(page, tile, toPage, opts);

  // Geometry is clipped to the printable area so it can't spill into the unprintable margin or the title block.
  page.pushOperators(pushGraphicsState(), rectangle(printable.x, printable.y, printable.width, printable.height), clip(), endPath());
  const tolerance = CURVE_TOLERANCE_MM / opts.scale;
  const artist = new Artist(page, toPage, font, safeText, tolerance, padBounds({ min: tile.realMin, max: tile.realMax }, tolerance * 4));
  drawing.entities.forEach((e) => artist.entity(e));
  drawing.dimensions.forEach((d) => artist.dimension(d));
  page.pushOperators(popGraphicsState());

  if (opts.showLabels) {
    const text = `${opts.title}  |  Sheet ${tile.label}  |  ${opts.paper.name} ${opts.orientation}  |  Scale ${formatScale(opts.scale)}`;
    page.drawText(safeText(text), { x: marginPt, y: Math.max(marginPt / 2, 4), size: 9, font, color: rgb(0, 0, 0) });
  }
}

function drawIndexSheet(
  pdf: PDFDocument,
  drawing: ResolvedDrawing,
  bounds: Bounds,
  tiling: TilingResult,
  opts: Required<PdfExportOptions>,
  font: PDFFont,
  safeText: (text: string) => string,
): void {
  const { widthMm, heightMm, marginMm, headerMm } = INDEX_SHEET_PAGE;
  const page = pdf.addPage([mm(widthMm), mm(heightMm)]); // A4 overview, independent of the print paper choice
  const margin = mm(marginMm);
  const docW = bounds.max.x - bounds.min.x || 1;
  const docH = bounds.max.y - bounds.min.y || 1;
  const availW = page.getWidth() - 2 * margin;
  const availH = page.getHeight() - 2 * margin - mm(headerMm);
  const ptPerDocUnit = Math.min(availW / docW, availH / docH);
  // Centre the overview in the space below the heading.
  const originX = margin + (availW - docW * ptPerDocUnit) / 2;
  const originY = margin + (availH - docH * ptPerDocUnit) / 2;

  const toPage: Transform = (p) => ({
    x: originX + (p.x - bounds.min.x) * ptPerDocUnit,
    y: originY + (p.y - bounds.min.y) * ptPerDocUnit,
  });

  const artist = new Artist(page, toPage, font, safeText, CURVE_TOLERANCE_MM * PT_PER_MM / ptPerDocUnit, null);
  drawing.entities.forEach((e) => artist.entity(e));

  for (const tile of tiling.tiles) {
    const a = toPage(tile.coreRealMin);
    const b = toPage(tile.coreRealMax);
    page.drawRectangle({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), borderColor: INDEX_GRID_COLOR, borderWidth: 0.7 });
    const labelWidth = font.widthOfTextAtSize(tile.label, 10);
    page.drawText(tile.label, { x: (a.x + b.x) / 2 - labelWidth / 2, y: (a.y + b.y) / 2 - 5, size: 10, font, color: INDEX_GRID_COLOR });
  }

  const heading = `${opts.title} -- assembly index: ${tiling.cols} x ${tiling.rows} sheet(s), ${opts.paper.name} ${opts.orientation}, scale ${formatScale(opts.scale)}`;
  page.drawText(safeText(heading), { x: margin, y: page.getHeight() - margin, size: 10, font, color: rgb(0, 0, 0) });
}

/**
 * Renders a resolved drawing to a multi-page PDF, tiled across printer paper
 * (KOMPAS-style print-split composer): one page per tile at the requested
 * scale, with an optional overlap/crop-mark border for aligning and trimming
 * printed sheets, plus an assembly index sheet showing how tiles fit together.
 */
export async function exportTiledPdf(drawing: ResolvedDrawing, options: PdfExportOptions): Promise<Uint8Array> {
  if (!drawing.bounds) throw new Error("Drawing has no geometry to print");

  const opts: Required<PdfExportOptions> = {
    showCropMarks: true,
    showOverlapShading: true,
    showLabels: true,
    includeIndexSheet: true,
    ...options,
    title: options.title?.trim() || "Drawing",
  };

  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.title);
  pdf.setCreator("Parametric CAD");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const supported = new Set(font.getCharacterSet());
  const safeText = (text: string) => toPdfSafeText(text, supported);

  const area = printBounds(drawing, drawing.bounds, opts.scale, font, safeText);
  const tiling = computeTiling(area, opts);

  tiling.tiles.forEach((tile) => drawTile(pdf, drawing, tiling, tile, opts, font, safeText));
  if (opts.includeIndexSheet && tiling.tiles.length > 1) {
    drawIndexSheet(pdf, drawing, area, tiling, opts, font, safeText);
  }
  return pdf.save();
}
