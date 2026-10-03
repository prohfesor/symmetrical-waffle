import { describe, expect, it } from "vitest";
import { computeTiling, PAPER_SIZES, PrintSettings, TilingError } from "./tiling.js";

const A4 = PAPER_SIZES.find((p) => p.name === "A4")!;

describe("print tiling", () => {
  it("fits on a single page when the scaled drawing is smaller than the usable area", () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } }; // mm
    const settings: PrintSettings = { paper: A4, orientation: "portrait", scale: 1, marginMm: 5, overlapMm: 10 };
    const result = computeTiling(bounds, settings);
    expect(result.cols).toBe(1);
    expect(result.rows).toBe(1);
  });

  it("REGRESSION: a drawing that fits one sheet has no shared overlap, even if it is wider than sheet minus overlap", () => {
    // 265 mm wide on a 277 mm printable width with 15 mm overlap: close to full, but still a single sheet.
    const bounds = { min: { x: 0, y: 0 }, max: { x: 265, y: 100 } };
    const [tile] = computeTiling(bounds, { paper: A4, orientation: "landscape", scale: 1, marginMm: 10, overlapMm: 15 }).tiles;
    expect(tile.coreRealMax.x).toBeCloseTo(tile.realMax.x, 6);
    expect(tile.coreRealMin.y).toBeCloseTo(tile.realMin.y, 6);
  });

  it("only the inner edges of a multi-sheet job carry overlap: the last column and row are all core", () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 900, y: 600 } };
    const result = computeTiling(bounds, { paper: A4, orientation: "landscape", scale: 1, marginMm: 10, overlapMm: 15 });
    for (const t of result.tiles) {
      if (t.col === result.cols - 1) expect(t.coreRealMax.x).toBeCloseTo(t.realMax.x, 6);
      else expect(t.coreRealMax.x).toBeLessThan(t.realMax.x);
      if (t.row === result.rows - 1) expect(t.coreRealMin.y).toBeCloseTo(t.realMin.y, 6);
      else expect(t.coreRealMin.y).toBeGreaterThan(t.realMin.y);
    }
  });

  it("splits a large drawing into multiple overlapping tiles and covers the full extent", () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 900, y: 600 } }; // mm, e.g. a big panel
    const settings: PrintSettings = { paper: A4, orientation: "landscape", scale: 1, marginMm: 10, overlapMm: 15 };
    const result = computeTiling(bounds, settings);
    expect(result.cols).toBeGreaterThan(1);
    expect(result.rows).toBeGreaterThan(1);

    // Every tile's core region should tile edge-to-edge with no gaps.
    const first = result.tiles.find((t) => t.row === 0 && t.col === 0)!;
    const second = result.tiles.find((t) => t.row === 0 && t.col === 1)!;
    expect(second.coreRealMin.x).toBeCloseTo(first.coreRealMax.x, 6);

    // Overall coverage reaches the drawing's full bounds.
    const maxX = Math.max(...result.tiles.map((t) => t.realMax.x));
    const minX = Math.min(...result.tiles.map((t) => t.realMin.x));
    expect(minX).toBeCloseTo(bounds.min.x, 6);
    expect(maxX).toBeGreaterThanOrEqual(bounds.max.x - 1e-6);
  });

  it("labels tiles with row letters and column numbers", () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 900, y: 600 } };
    const settings: PrintSettings = { paper: A4, orientation: "landscape", scale: 1, marginMm: 10, overlapMm: 15 };
    const result = computeTiling(bounds, settings);
    expect(result.tiles[0].label).toBe("A1");
  });

  it("rejects an overlap that is too large for the page/margin", () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 1000, y: 1000 } };
    const settings: PrintSettings = { paper: A4, orientation: "portrait", scale: 1, marginMm: 10, overlapMm: 1000 };
    expect(() => computeTiling(bounds, settings)).toThrow(TilingError);
  });
});
