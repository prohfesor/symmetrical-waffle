import { describe, expect, it } from "vitest";
import { resolveFullDocument } from "../geom/document.js";
import { createEmptyDocument, DrawingDocument } from "../geom/types.js";
import { exportDxf } from "./writer.js";

describe("DXF export", () => {
  it("produces a well-formed R12 file with LINE and CIRCLE entities", () => {
    const doc: DrawingDocument = {
      ...createEmptyDocument(),
      entities: [
        { id: "line1", kind: "line", mode: "polar", p1: { kind: "free", x: 0, y: 0 }, length: "=width", angle: 0 },
        { id: "circle1", kind: "circle", center: { kind: "free", x: 10, y: 10 }, radius: "=hole_d / 2" },
      ],
    };
    const { drawing } = resolveFullDocument(doc, "width = 50\nhole_d = 8");
    const dxf = exportDxf(drawing);

    expect(dxf.startsWith("0\r\nSECTION\r\n")).toBe(true);
    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("LINE");
    expect(dxf).toContain("CIRCLE");
    expect(dxf.trim().endsWith("0\r\nEOF")).toBe(true);
    // Balanced SECTION/ENDSEC pairs.
    const sectionCount = (dxf.match(/\nSECTION\r/g) ?? []).length;
    const endsecCount = (dxf.match(/\nENDSEC\r/g) ?? []).length;
    expect(sectionCount).toBe(endsecCount);
  });
});
