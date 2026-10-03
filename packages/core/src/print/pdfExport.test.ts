import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { resolveFullDocument } from "../geom/document.js";
import { createEmptyDocument, DrawingDocument, makeRef } from "../geom/types.js";
import { exportTiledPdf, PdfExportOptions, planPrint } from "./pdfExport.js";
import { PAPER_SIZES } from "./tiling.js";

const A4 = PAPER_SIZES.find((p) => p.name === "A4")!;
const at = (x: number, y: number) => ({ kind: "free" as const, x, y });
const drawingFor = (doc: Partial<DrawingDocument>, params = "") =>
  resolveFullDocument({ ...createEmptyDocument(), ...doc }, params).drawing;
const baseOptions: PdfExportOptions = { paper: A4, orientation: "landscape", scale: 1, marginMm: 10, overlapMm: 10 };
const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** The decoded drawing operators of every page (pdf-lib deflates content streams, so they must be decoded to be inspected). */
async function pageOperators(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map((page) => {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    return refs
      .map((ref) => pdf.context.lookup(ref) as PDFRawStream)
      .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"))
      .join("\n");
  });
}
const allOperators = async (bytes: Uint8Array) => (await pageOperators(bytes)).join("\n");

describe("tiled PDF export", () => {
  it("produces one PDF page per tile plus an index sheet", async () => {
    const drawing = drawingFor(
      { entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: "=w", height: "=h" }] },
      "w = 900\nh = 600",
    );
    const bytes = await exportTiledPdf(drawing, { ...baseOptions, title: "Test Panel", overlapMm: 15 });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getTitle()).toBe("Test Panel");
  });

  it("omits the index sheet when asked, and when there is only one sheet", async () => {
    const big = drawingFor({ entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 900, height: 100 }] });
    const withIndex = (await PDFDocument.load(await exportTiledPdf(big, baseOptions))).getPageCount();
    const without = (await PDFDocument.load(await exportTiledPdf(big, { ...baseOptions, includeIndexSheet: false }))).getPageCount();
    expect(withIndex).toBe(without + 1);

    const small = drawingFor({ entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 50, height: 50 }] });
    expect((await PDFDocument.load(await exportTiledPdf(small, baseOptions))).getPageCount()).toBe(1);
  });

  it("rejects an empty drawing", async () => {
    await expect(exportTiledPdf(drawingFor({}), baseOptions)).rejects.toThrow(/no geometry/);
  });

  it("does not throw on a diameter dimension (the font has no diameter sign)", async () => {
    const drawing = drawingFor(
      {
        entities: [{ id: "hole1", kind: "circle", center: at(50, 50), radius: "=hole_d / 2" }],
        dimensions: [{ id: "dim1", target: { kind: "circleDiameter", entityId: "hole1" }, displayOffset: 10 }],
      },
      "hole_d = 8",
    );
    expect(drawing.dimensions[0].text).toContain("⌀");
    const pdf = await PDFDocument.load(await exportTiledPdf(drawing, { ...baseOptions, orientation: "portrait", title: "Diameter Test" }));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("does not throw on a title the PDF font cannot encode (Cyrillic, CJK, line breaks)", async () => {
    const drawing = drawingFor({ entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 900, height: 100 }] });
    for (const title of ["Кронштейн 120×80", "日本語", "two\nlines"]) {
      const bytes = await exportTiledPdf(drawing, { ...baseOptions, title });
      expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    }
  });

  it("clips geometry to the printable area on every sheet", async () => {
    const drawing = drawingFor({ entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 600, height: 100 }] });
    const pages = await pageOperators(await exportTiledPdf(drawing, { ...baseOptions, includeIndexSheet: false }));
    expect(pages.length).toBeGreaterThan(1);
    for (const ops of pages) expect(ops).toMatch(/ re\nW\nn\n/); // every sheet clips to its printable rectangle
  });

  it("only draws geometry that falls on a sheet, instead of repeating everything on every sheet", async () => {
    // Two small shapes ~500mm apart: the two sheets each contain exactly one of them.
    const drawing = drawingFor({
      entities: [
        { id: "a", kind: "rectangle", corner: at(0, 0), width: 10, height: 10 },
        { id: "b", kind: "rectangle", corner: at(500, 0), width: 10, height: 10 },
      ],
    });
    const bytes = await exportTiledPdf(drawing, { ...baseOptions, includeIndexSheet: false, showCropMarks: false });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    // Geometry strokes use a 0.7pt line width. One shape per sheet = 2; without culling each sheet would draw both = 4.
    expect(countOf(await allOperators(bytes), "0.7 w")).toBe(2);
  });

  it("prints dimension annotations that sit outside the part", async () => {
    const withDimension = drawingFor({
      entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 100, height: 100 }],
      dimensions: [
        { id: "d", target: { kind: "pointDistance", from: makeRef("r", "corner0"), to: makeRef("r", "corner1") }, displayOffset: -250 },
      ],
    });
    const without = drawingFor({ entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 100, height: 100 }] });
    const pages = async (d: typeof withDimension) =>
      (await PDFDocument.load(await exportTiledPdf(d, { ...baseOptions, includeIndexSheet: false }))).getPageCount();
    expect(await pages(without)).toBe(1);
    expect(await pages(withDimension)).toBeGreaterThan(1); // the dimension line 250mm below the part needs its own sheet
  });

  it("uses a single path per shape rather than one drawing command per segment", async () => {
    const drawing = drawingFor({ entities: [{ id: "c", kind: "circle", center: at(50, 50), radius: 40 }] });
    const text = await allOperators(
      await exportTiledPdf(drawing, { ...baseOptions, includeIndexSheet: false, showCropMarks: false, showOverlapShading: false }),
    );
    expect(countOf(text, "0.7 w")).toBe(1);
    expect(countOf(text, " l\n")).toBeGreaterThan(30); // ...but with many line segments inside it
  });

  describe("placement on the sheet", () => {
    const bare = { ...baseOptions, showCropMarks: false, showOverlapShading: false, showLabels: false, includeIndexSheet: false };

    /** The extent, in PDF points, of everything drawn with move/line operators on page `index`. */
    async function drawnExtent(bytes: Uint8Array, index: number) {
      // Everything after the clip operator is the drawing itself (the border and marks come before it).
      const ops = (await pageOperators(bytes))[index].split(/\bW\s+n\b/)[1];
      const xs: number[] = [];
      const ys: number[] = [];
      for (const m of ops.matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]\b/g)) {
        xs.push(Number(m[1]));
        ys.push(Number(m[2]));
      }
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }
    const pt = (mmValue: number) => (mmValue / 25.4) * 72;

    it("centres a drawing that fits on a single sheet", async () => {
      const drawing = drawingFor({ entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 100, height: 40 }] });
      const e = await drawnExtent(await exportTiledPdf(drawing, bare), 0);
      expect((e.minX + e.maxX) / 2).toBeCloseTo(pt(297 / 2), 0);
      expect((e.minY + e.maxY) / 2).toBeCloseTo(pt(210 / 2), 0);
    });

    it("keeps multi-sheet jobs aligned to the margin so the sheets line up", async () => {
      const drawing = drawingFor({ entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 600, height: 100 }] });
      const bytes = await exportTiledPdf(drawing, bare);
      const first = await drawnExtent(bytes, 0);
      expect(first.minX).toBeCloseTo(pt(10 + 1), 0); // margin plus the 1 mm edge padding, not centred
      expect(first.maxX).toBeGreaterThan(pt(297 - 10 - 2)); // and runs on to the right margin
      expect((first.minY + first.maxY) / 2).toBeCloseTo(pt(210 / 2), 0); // one row: centred vertically
    });
  });

  describe("print plan and skipped sheets", () => {
    const wide = () => drawingFor({ entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 700, height: 100 }] });

    it("plans exactly the sheets the PDF then contains", async () => {
      const drawing = wide();
      const plan = await planPrint(drawing, baseOptions);
      const pages = (await PDFDocument.load(await exportTiledPdf(drawing, baseOptions))).getPageCount();
      expect(pages).toBe(plan.tiling.tiles.length + 1); // + index sheet
      expect(plan.tiling.cols).toBeGreaterThan(2);
    });

    it("reports sheets with nothing on them", async () => {
      // A thin diagonal across a big area leaves the opposite corners empty.
      const drawing = drawingFor({ entities: [{ id: "d", kind: "line", mode: "twoPoint", p1: at(0, 600), p2: at(900, 0) }] });
      const plan = await planPrint(drawing, { ...baseOptions, overlapMm: 15 });
      expect(plan.emptyTiles.length).toBeGreaterThan(0);
      expect(plan.emptyTiles.length).toBeLessThan(plan.tiling.tiles.length);
      expect(plan.emptyTiles).not.toContain(plan.tiling.tiles[0].label); // the line starts in the first sheet
    });

    it("leaves skipped sheets out of the PDF", async () => {
      const drawing = wide();
      const plan = await planPrint(drawing, baseOptions);
      const [, second] = plan.tiling.tiles;
      const bytes = await exportTiledPdf(drawing, { ...baseOptions, skipTiles: [second.label] });
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(plan.tiling.tiles.length - 1 + 1);
    });

    it("marks skipped sheets on the index and says how many", async () => {
      const drawing = wide();
      const plan = await planPrint(drawing, baseOptions);
      const label = plan.tiling.tiles[1].label;
      const withSkip = await pageOperators(await exportTiledPdf(drawing, { ...baseOptions, skipTiles: [label] }));
      const without = await pageOperators(await exportTiledPdf(drawing, baseOptions));
      const indexWith = withSkip[withSkip.length - 1];
      const indexWithout = without[without.length - 1];
      expect(countOf(indexWith, " l\n")).toBeGreaterThan(countOf(indexWithout, " l\n")); // the skipped sheet's cross
    });

    it("refuses a job where every sheet is switched off", async () => {
      const drawing = wide();
      const plan = await planPrint(drawing, baseOptions);
      await expect(exportTiledPdf(drawing, { ...baseOptions, skipTiles: plan.tiling.tiles.map((t) => t.label) })).rejects.toThrow(
        /nothing to print/,
      );
    });

    it("ignores labels that don't exist", async () => {
      const drawing = wide();
      const plan = await planPrint(drawing, baseOptions);
      const pages = (await PDFDocument.load(await exportTiledPdf(drawing, { ...baseOptions, skipTiles: ["Z99"] }))).getPageCount();
      expect(pages).toBe(plan.tiling.tiles.length + 1);
    });

    it("planPrint rejects what the export rejects", async () => {
      await expect(planPrint(drawingFor({}), baseOptions)).rejects.toThrow(/no geometry/);
      await expect(planPrint(wide(), { ...baseOptions, overlapMm: 1000 })).rejects.toThrow(/Overlap is too large/);
    });
  });
});
