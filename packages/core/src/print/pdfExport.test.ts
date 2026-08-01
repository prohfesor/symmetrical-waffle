import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { resolveFullDocument } from "../geom/document.js";
import { createEmptyDocument, DrawingDocument } from "../geom/types.js";
import { PAPER_SIZES } from "./tiling.js";
import { exportTiledPdf } from "./pdfExport.js";

const A4 = PAPER_SIZES.find((p) => p.name === "A4")!;

describe("tiled PDF export", () => {
  it("produces one PDF page per tile plus an index sheet when requested", async () => {
    const doc: DrawingDocument = {
      ...createEmptyDocument(),
      entities: [
        {
          id: "rect1",
          kind: "rectangle",
          corner: { kind: "free", x: 0, y: 0 },
          width: "=panel_w",
          height: "=panel_h",
        },
      ],
    };
    const { drawing } = resolveFullDocument(doc, "panel_w = 900\npanel_h = 600");

    const bytes = await exportTiledPdf(drawing, {
      paper: A4,
      orientation: "landscape",
      scale: 1,
      marginMm: 10,
      overlapMm: 15,
      title: "Test Panel",
      showCropMarks: true,
      showOverlapShading: true,
      showLabels: true,
      includeIndexSheet: true,
    });

    const pdf = await PDFDocument.load(bytes);
    // Multiple tiles for a 900x600mm panel on landscape A4 at 1:1, plus one index sheet.
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });

  it("rejects an empty drawing", async () => {
    const { drawing } = resolveFullDocument(createEmptyDocument(), "");
    await expect(
      exportTiledPdf(drawing, {
        paper: A4,
        orientation: "portrait",
        scale: 1,
        marginMm: 10,
        overlapMm: 5,
        showCropMarks: false,
        showOverlapShading: false,
        showLabels: false,
        includeIndexSheet: false,
      }),
    ).rejects.toThrow();
  });
});
