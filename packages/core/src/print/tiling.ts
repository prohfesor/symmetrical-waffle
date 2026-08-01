import { Vec2 } from "../geom/resolved-types.js";

export interface PaperSize {
  name: string;
  /** Portrait-orientation dimensions, width < height, in millimeters. */
  widthMm: number;
  heightMm: number;
}

export const PAPER_SIZES: PaperSize[] = [
  { name: "A0", widthMm: 841, heightMm: 1189 },
  { name: "A1", widthMm: 594, heightMm: 841 },
  { name: "A2", widthMm: 420, heightMm: 594 },
  { name: "A3", widthMm: 297, heightMm: 420 },
  { name: "A4", widthMm: 210, heightMm: 297 },
  { name: "A5", widthMm: 148, heightMm: 210 },
  { name: "Letter", widthMm: 215.9, heightMm: 279.4 },
  { name: "Legal", widthMm: 215.9, heightMm: 355.6 },
  { name: "Tabloid", widthMm: 279.4, heightMm: 431.8 },
];

export type Orientation = "portrait" | "landscape";

export interface PrintSettings {
  paper: PaperSize;
  orientation: Orientation;
  /** Paper millimeters per one document millimeter, e.g. 0.1 for a "1:10" scale, 1 for "1:1". */
  scale: number;
  marginMm: number;
  overlapMm: number;
}

export interface Tile {
  row: number;
  col: number;
  /** e.g. "A1", "B3" -- row letter, column number, matching typical print-composer tile references. */
  label: string;
  /** Full printed region for this page, in document coordinates (includes shared overlap with neighbors). */
  realMin: Vec2;
  realMax: Vec2;
  /** The non-overlapping "core" region unique to this tile, for trim/crop guidance. */
  coreRealMin: Vec2;
  coreRealMax: Vec2;
}

export interface TilingResult {
  tiles: Tile[];
  cols: number;
  rows: number;
  pageWidthMm: number;
  pageHeightMm: number;
  usableWidthMm: number;
  usableHeightMm: number;
}

export class TilingError extends Error {}

function rowLabel(index: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB ...
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Computes the grid of printer-paper tiles needed to cover a drawing's bounds
 * at a given scale, mirroring a KOMPAS-style print-split dialog: pick a paper
 * size/orientation, a print scale, a page margin (unprintable border), and an
 * overlap strip so adjacent sheets can be aligned and taped/glued together.
 */
export function computeTiling(bounds: { min: Vec2; max: Vec2 }, settings: PrintSettings): TilingResult {
  const { paper, orientation, scale, marginMm, overlapMm } = settings;
  if (scale <= 0) throw new TilingError("Scale must be greater than zero");
  if (marginMm < 0) throw new TilingError("Margin cannot be negative");
  if (overlapMm < 0) throw new TilingError("Overlap cannot be negative");

  const pageWidthMm = orientation === "portrait" ? paper.widthMm : paper.heightMm;
  const pageHeightMm = orientation === "portrait" ? paper.heightMm : paper.widthMm;

  const usableWidthMm = pageWidthMm - 2 * marginMm;
  const usableHeightMm = pageHeightMm - 2 * marginMm;
  if (usableWidthMm <= overlapMm || usableHeightMm <= overlapMm) {
    throw new TilingError(
      "Overlap is too large for the chosen paper size and margin -- reduce overlap or margin, or pick a larger paper size",
    );
  }

  const realWidth = bounds.max.x - bounds.min.x;
  const realHeight = bounds.max.y - bounds.min.y;
  const paperTotalWidth = Math.max(realWidth * scale, 1e-9);
  const paperTotalHeight = Math.max(realHeight * scale, 1e-9);

  const stepX = usableWidthMm - overlapMm;
  const stepY = usableHeightMm - overlapMm;

  const cols = paperTotalWidth <= usableWidthMm ? 1 : 1 + Math.ceil((paperTotalWidth - usableWidthMm) / stepX);
  const rows = paperTotalHeight <= usableHeightMm ? 1 : 1 + Math.ceil((paperTotalHeight - usableHeightMm) / stepY);

  const tiles: Tile[] = [];
  for (let r = 0; r < rows; r++) {
    // Rows are laid out top-to-bottom in the drawing (row 0 = highest Y).
    const startPaperY = r * stepY;
    const fullEndPaperY = Math.min(startPaperY + usableHeightMm, paperTotalHeight);
    const coreEndPaperY = Math.min(startPaperY + stepY, paperTotalHeight);

    for (let c = 0; c < cols; c++) {
      const startPaperX = c * stepX;
      const fullEndPaperX = Math.min(startPaperX + usableWidthMm, paperTotalWidth);
      const coreEndPaperX = Math.min(startPaperX + stepX, paperTotalWidth);

      const realMin: Vec2 = {
        x: bounds.min.x + startPaperX / scale,
        y: bounds.max.y - fullEndPaperY / scale,
      };
      const realMax: Vec2 = {
        x: bounds.min.x + fullEndPaperX / scale,
        y: bounds.max.y - startPaperY / scale,
      };
      const coreRealMin: Vec2 = {
        x: bounds.min.x + startPaperX / scale,
        y: bounds.max.y - coreEndPaperY / scale,
      };
      const coreRealMax: Vec2 = {
        x: bounds.min.x + coreEndPaperX / scale,
        y: bounds.max.y - startPaperY / scale,
      };

      tiles.push({
        row: r,
        col: c,
        label: `${rowLabel(r)}${c + 1}`,
        realMin,
        realMax,
        coreRealMin,
        coreRealMax,
      });
    }
  }

  return { tiles, cols, rows, pageWidthMm, pageHeightMm, usableWidthMm, usableHeightMm };
}
