import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { ResolvedDimension, ResolvedDrawing, ResolvedEntity, Vec2 } from "../geom/resolved-types.js";
import { computeTiling, PrintSettings, Tile, TilingResult } from "./tiling.js";

const PT_PER_MM = 72 / 25.4;
function mm(v: number): number {
  return v * PT_PER_MM;
}

export interface PdfExportOptions extends PrintSettings {
  title?: string;
  showCropMarks: boolean;
  showOverlapShading: boolean;
  showLabels: boolean;
  includeIndexSheet: boolean;
}

function sampleArc(center: Vec2, radius: number, startDeg: number, endDeg: number): Vec2[] {
  const span = endDeg - startDeg;
  const segments = Math.max(8, Math.round((96 * Math.abs(span)) / 360));
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = ((startDeg + (span * i) / segments) * Math.PI) / 180;
    pts.push({ x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) });
  }
  return pts;
}

type Transform = (p: Vec2) => Vec2;

function drawPolyline(page: PDFPage, points: Vec2[], closed: boolean, tx: Transform, color = rgb(0, 0, 0), thickness = 0.6): void {
  for (let i = 0; i < points.length - 1; i++) {
    const a = tx(points[i]);
    const b = tx(points[i + 1]);
    page.drawLine({ start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y }, thickness, color });
  }
  if (closed && points.length > 2) {
    const a = tx(points[points.length - 1]);
    const b = tx(points[0]);
    page.drawLine({ start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y }, thickness, color });
  }
}

function drawEntity(page: PDFPage, e: ResolvedEntity, tx: Transform): void {
  const color = rgb(0, 0, 0);
  switch (e.kind) {
    case "line":
      drawPolyline(page, [e.p1, e.p2], false, tx, color, 0.7);
      break;
    case "circle":
      drawPolyline(page, sampleArc(e.center, e.radius, 0, 360), true, tx, color, 0.7);
      break;
    case "arc":
      drawPolyline(page, sampleArc(e.center, e.radius, e.startAngleDeg, e.endAngleDeg), false, tx, color, 0.7);
      break;
    case "polyline":
      drawPolyline(page, e.points, e.closed, tx, color, 0.7);
      break;
    case "rectangle":
      drawPolyline(page, e.corners, true, tx, color, 0.7);
      break;
  }
}

function drawDimension(page: PDFPage, d: ResolvedDimension, tx: Transform, font: PDFFont): void {
  const dimColor = rgb(0.2, 0.35, 0.75);
  const size = 8;
  const drawLabel = (pos: Vec2) => {
    const p = tx(pos);
    const w = font.widthOfTextAtSize(d.text, size);
    page.drawText(d.text, { x: p.x - w / 2, y: p.y - size / 2, size, font, color: dimColor });
  };
  switch (d.kind) {
    case "linear":
      drawPolyline(page, [d.p1, d.dimLineP1], false, tx, dimColor, 0.3);
      drawPolyline(page, [d.p2, d.dimLineP2], false, tx, dimColor, 0.3);
      drawPolyline(page, [d.dimLineP1, d.dimLineP2], false, tx, dimColor, 0.4);
      drawLabel(d.textPos);
      break;
    case "radius":
    case "diameter":
      drawPolyline(page, [d.onCircle, d.leaderEnd], false, tx, dimColor, 0.4);
      drawLabel(d.textPos);
      break;
    case "angular":
      drawPolyline(page, sampleArc(d.center, d.radius, d.startAngleDeg, d.endAngleDeg), false, tx, dimColor, 0.4);
      drawLabel(d.textPos);
      break;
  }
}

function makeTileTransform(tile: Tile, marginPt: number, scale: number): Transform {
  return (p: Vec2) => ({
    x: marginPt + (p.x - tile.realMin.x) * scale * PT_PER_MM,
    y: marginPt + (p.y - tile.realMin.y) * scale * PT_PER_MM,
  });
}

function drawCropMarksAndOverlap(page: PDFPage, tiling: TilingResult, tile: Tile, tx: Transform, opts: PdfExportOptions): void {
  const trimColor = rgb(0.55, 0.55, 0.55);
  const overlapFill = rgb(0.9, 0.9, 0.9);

  if (opts.showOverlapShading) {
    const full0 = tx(tile.realMin);
    const full1 = tx(tile.realMax);
    const core0 = tx({ x: tile.coreRealMin.x, y: tile.coreRealMax.y });
    const core1 = tx({ x: tile.coreRealMax.x, y: tile.coreRealMin.y });
    // Right overlap band.
    if (core1.x < full1.x) {
      page.drawRectangle({ x: core1.x, y: full0.y, width: full1.x - core1.x, height: full1.y - full0.y, color: overlapFill, opacity: 0.6 });
    }
    // Bottom overlap band (paper-space "bottom" = lower Y = later rows).
    if (full0.y < core0.y) {
      page.drawRectangle({ x: full0.x, y: full0.y, width: full1.x - full0.x, height: core0.y - full0.y, color: overlapFill, opacity: 0.6 });
    }
  }

  if (opts.showCropMarks) {
    const core0 = tx({ x: tile.coreRealMin.x, y: tile.coreRealMax.y });
    const core1 = tx({ x: tile.coreRealMax.x, y: tile.coreRealMin.y });
    page.drawRectangle({
      x: core0.x,
      y: core1.y,
      width: core1.x - core0.x,
      height: core0.y - core1.y,
      borderColor: trimColor,
      borderWidth: 0.5,
      borderDashArray: [4, 3],
    });
    const markLen = mm(4);
    const corners = [
      { x: core0.x, y: core0.y },
      { x: core1.x, y: core0.y },
      { x: core0.x, y: core1.y },
      { x: core1.x, y: core1.y },
    ];
    for (const c of corners) {
      page.drawLine({ start: { x: c.x - markLen / 2, y: c.y }, end: { x: c.x + markLen / 2, y: c.y }, thickness: 0.5, color: trimColor });
      page.drawLine({ start: { x: c.x, y: c.y - markLen / 2 }, end: { x: c.x, y: c.y + markLen / 2 }, thickness: 0.5, color: trimColor });
    }
  }
}

function drawTitleBlock(page: PDFPage, pageWidthPt: number, marginPt: number, font: PDFFont, text: string): void {
  const size = 9;
  page.drawText(text, { x: marginPt, y: marginPt / 2, size, font, color: rgb(0, 0, 0) });
}

async function renderIndexSheet(pdf: PDFDocument, drawing: ResolvedDrawing, tiling: TilingResult, opts: PdfExportOptions, font: PDFFont): Promise<void> {
  if (!drawing.bounds) return;
  const marginPt = mm(10);
  const page = pdf.addPage([mm(210), mm(297)]); // A4 overview sheet, independent of the print paper choice.
  const availW = page.getWidth() - 2 * marginPt;
  const availH = page.getHeight() - 2 * marginPt - mm(15);
  const realW = drawing.bounds.max.x - drawing.bounds.min.x || 1;
  const realH = drawing.bounds.max.y - drawing.bounds.min.y || 1;
  const fitScale = Math.min(availW / realW, availH / realH);

  const tx: Transform = (p: Vec2) => ({
    x: marginPt + (p.x - drawing.bounds!.min.x) * fitScale,
    y: marginPt + mm(15) + (p.y - drawing.bounds!.min.y) * fitScale,
  });

  for (const e of drawing.entities) drawEntity(page, e, tx);

  const gridColor = rgb(0.85, 0.3, 0.2);
  for (const tile of tiling.tiles) {
    const a = tx(tile.coreRealMin);
    const b = tx(tile.coreRealMax);
    page.drawRectangle({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), borderColor: gridColor, borderWidth: 0.7 });
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const label = tile.label;
    const w = font.widthOfTextAtSize(label, 10);
    page.drawText(label, { x: cx - w / 2, y: cy - 5, size: 10, font, color: gridColor });
  }

  page.drawText(
    `${opts.title ?? "Drawing"} -- assembly index: ${tiling.cols} x ${tiling.rows} sheet(s), ${opts.paper.name} ${opts.orientation}, scale ${formatScale(opts.scale)}`,
    { x: marginPt, y: page.getHeight() - marginPt, size: 10, font, color: rgb(0, 0, 0) },
  );
}

function formatScale(scale: number): string {
  if (scale === 1) return "1:1";
  if (scale > 1) return `${scale}:1`;
  const n = Math.round(1 / scale);
  return `1:${n}`;
}

/**
 * Renders a resolved drawing to a multi-page PDF, tiled across printer paper
 * (KOMPAS-style print-split composer): one page per tile at the requested
 * scale, with an optional overlap/crop-mark border for aligning and trimming
 * printed sheets, plus an assembly index sheet showing how tiles fit together.
 */
export async function exportTiledPdf(drawing: ResolvedDrawing, opts: PdfExportOptions): Promise<Uint8Array> {
  if (!drawing.bounds) {
    throw new Error("Drawing has no geometry to print");
  }
  const tiling = computeTiling(drawing.bounds, opts);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const marginPt = mm(opts.marginMm);
  const pageWidthPt = mm(tiling.pageWidthMm);
  const pageHeightPt = mm(tiling.pageHeightMm);

  for (const tile of tiling.tiles) {
    const page = pdf.addPage([pageWidthPt, pageHeightPt]);
    const tx = makeTileTransform(tile, marginPt, opts.scale);

    page.drawRectangle({
      x: marginPt,
      y: marginPt,
      width: pageWidthPt - 2 * marginPt,
      height: pageHeightPt - 2 * marginPt,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
    });

    drawCropMarksAndOverlap(page, tiling, tile, tx, opts);

    for (const e of drawing.entities) drawEntity(page, e, tx);
    for (const d of drawing.dimensions) drawDimension(page, d, tx, font);

    if (opts.showLabels) {
      drawTitleBlock(
        page,
        pageWidthPt,
        marginPt,
        font,
        `${opts.title ?? "Drawing"}  |  Sheet ${tile.label}  |  ${opts.paper.name} ${opts.orientation}  |  Scale ${formatScale(opts.scale)}`,
      );
    }
  }

  if (opts.includeIndexSheet && tiling.tiles.length > 1) {
    await renderIndexSheet(pdf, drawing, tiling, opts, font);
  }

  return pdf.save();
}
