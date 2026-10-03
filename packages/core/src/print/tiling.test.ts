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
    const minY = Math.min(...result.tiles.map((t) => t.realMin.y));
    const maxY = Math.max(...result.tiles.map((t) => t.realMax.y));
    expect(minX).toBeLessThanOrEqual(bounds.min.x + 1e-6);
    expect(maxX).toBeGreaterThanOrEqual(bounds.max.x - 1e-6);
    expect(minY).toBeLessThanOrEqual(bounds.min.y + 1e-6);
    expect(maxY).toBeGreaterThanOrEqual(bounds.max.y - 1e-6);
  });

  it("makes every sheet the same size, with the proportions of the printable area", () => {
    const settings: PrintSettings = { paper: A4, orientation: "landscape", scale: 1, marginMm: 10, overlapMm: 15 };
    for (const max of [
      { x: 900, y: 600 },
      { x: 650, y: 100 },
      { x: 100, y: 100 },
      { x: 277.5, y: 190.5 },
    ]) {
      const { tiles, usableWidthMm, usableHeightMm } = computeTiling(
        { min: { x: 5, y: -3 }, max: { x: 5 + max.x, y: -3 + max.y } },
        settings,
      );
      for (const t of tiles) {
        expect(t.realMax.x - t.realMin.x).toBeCloseTo(usableWidthMm, 6);
        expect(t.realMax.y - t.realMin.y).toBeCloseTo(usableHeightMm, 6);
      }
    }
  });

  it("scales sheet size with the print scale (a 1:2 print covers twice the drawing area per sheet)", () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };
    const [tile] = computeTiling(bounds, { paper: A4, orientation: "landscape", scale: 0.5, marginMm: 10, overlapMm: 15 }).tiles;
    expect(tile.realMax.x - tile.realMin.x).toBeCloseTo(277 / 0.5, 6);
  });

  it("centres the grid over the drawing, splitting the slack evenly", () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 100, y: 40 } };
    const { extent } = computeTiling(bounds, { paper: A4, orientation: "landscape", scale: 1, marginMm: 10, overlapMm: 15 });
    expect(bounds.min.x - extent.min.x).toBeCloseTo(extent.max.x - bounds.max.x, 6);
    expect(bounds.min.y - extent.min.y).toBeCloseTo(extent.max.y - bounds.max.y, 6);
  });

  it("reports the extent of the whole grid", () => {
    const result = computeTiling(
      { min: { x: 0, y: 0 }, max: { x: 900, y: 600 } },
      { paper: A4, orientation: "landscape", scale: 1, marginMm: 10, overlapMm: 15 },
    );
    expect(result.extent.min.x).toBeCloseTo(Math.min(...result.tiles.map((t) => t.realMin.x)), 6);
    expect(result.extent.max.y).toBeCloseTo(Math.max(...result.tiles.map((t) => t.realMax.y)), 6);
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
