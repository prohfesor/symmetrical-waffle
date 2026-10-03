import { describe, expect, it } from "vitest";
import { resolveFullDocument } from "../geom/document.js";
import { createEmptyDocument, DrawingDocument, makeRef } from "../geom/types.js";
import { encodeDxfText, exportDxf } from "./writer.js";

const at = (x: number, y: number) => ({ kind: "free" as const, x, y });
const dxfFor = (doc: Partial<DrawingDocument>, params = "") => exportDxf(resolveFullDocument({ ...createEmptyDocument(), ...doc }, params).drawing);

/** Splits a DXF file into [groupCode, value] pairs, asserting the strict two-lines-per-pair structure. */
function pairs(dxf: string): [number, string][] {
  const lines = dxf.split("\r\n");
  expect(lines.pop()).toBe(""); // file ends with a line break
  expect(lines.length % 2).toBe(0);
  const out: [number, string][] = [];
  for (let i = 0; i < lines.length; i += 2) {
    expect(lines[i]).toMatch(/^\s*\d+$/);
    out.push([Number(lines[i]), lines[i + 1]]);
  }
  return out;
}
const entityTypes = (p: [number, string][]) => p.filter(([c]) => c === 0).map(([, v]) => v);

describe("DXF export", () => {
  it("produces a well-formed R12 file with LINE and CIRCLE entities", () => {
    const dxf = dxfFor(
      {
        entities: [
          { id: "line1", kind: "line", mode: "polar", p1: at(0, 0), length: "=width", angle: 0 },
          { id: "circle1", kind: "circle", center: at(10, 10), radius: "=hole_d / 2" },
        ],
      },
      "width = 50\nhole_d = 8",
    );
    const p = pairs(dxf);
    expect(p[0]).toEqual([0, "SECTION"]);
    expect(p[p.length - 1]).toEqual([0, "EOF"]);
    expect(entityTypes(p)).toEqual(expect.arrayContaining(["LINE", "CIRCLE", "ENDSEC"]));
    expect(dxf).toContain("AC1009");
    expect(entityTypes(p).filter((t) => t === "SECTION")).toHaveLength(entityTypes(p).filter((t) => t === "ENDSEC").length);
  });

  it("writes entities in document order", () => {
    const dxf = dxfFor({
      entities: [
        { id: "z", kind: "circle", center: { kind: "anchor", ref: makeRef("a", "p2") }, radius: 1 },
        { id: "a", kind: "line", mode: "twoPoint", p1: at(0, 0), p2: at(5, 5) },
      ],
    });
    const types = entityTypes(pairs(dxf)).filter((t) => t === "LINE" || t === "CIRCLE");
    expect(types).toEqual(["CIRCLE", "LINE"]);
  });

  it("normalizes arc angles into [0, 360) and keeps counter-clockwise direction", () => {
    const p = pairs(dxfFor({ entities: [{ id: "a", kind: "arc", center: at(0, 0), radius: 5, startAngle: -90, endAngle: 90 }] }));
    expect(p.find(([c]) => c === 50)![1]).toBe("270.0");
    expect(p.find(([c]) => c === 51)![1]).toBe("90.0");
  });

  it("writes a full-turn arc as a CIRCLE, since an ARC with equal start and end is ambiguous", () => {
    const types = entityTypes(pairs(dxfFor({ entities: [{ id: "a", kind: "arc", center: at(0, 0), radius: 5, startAngle: 0, endAngle: 360 }] })));
    expect(types).toContain("CIRCLE");
    expect(types).not.toContain("ARC");
  });

  it("extends the header extents to cover dimension annotations", () => {
    const dxf = dxfFor({
      entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 100, height: 50 }],
      dimensions: [{ id: "d", target: { kind: "pointDistance", from: makeRef("r", "corner0"), to: makeRef("r", "corner1") }, displayOffset: -20 }],
    });
    const p = pairs(dxf);
    const extMin = p.findIndex(([c, v]) => c === 9 && v === "$EXTMIN");
    expect(p[extMin + 2]).toEqual([20, "-20.0"]);
  });

  it("writes dimension text with DXF escapes, so the diameter sign survives", () => {
    const dxf = dxfFor({
      entities: [{ id: "h", kind: "circle", center: at(0, 0), radius: 4 }],
      dimensions: [{ id: "d", target: { kind: "circleDiameter", entityId: "h" }, displayOffset: 5 }],
    });
    const textValues = pairs(dxf).filter(([c]) => c === 1).map(([, v]) => v);
    expect(textValues).toContain("%%c8"); // (the header's AC1009 version is the other group-code-1 pair)
  });
});

describe("encodeDxfText", () => {
  it("maps the symbols CAD packages understand", () => {
    expect(encodeDxfText("⌀12.5")).toBe("%%c12.5");
    expect(encodeDxfText("45°")).toBe("45%%d");
    expect(encodeDxfText("±0.1")).toBe("%%p0.1");
  });

  it("escapes other non-ASCII as \\U+XXXX and never emits raw non-ASCII", () => {
    expect(encodeDxfText("Ж")).toBe("\\U+0416");
    expect(encodeDxfText("é")).toBe("\\U+00E9");
    expect(encodeDxfText("😀")).toBe("?");
  });

  it("cannot be used to inject extra group-code lines", () => {
    expect(encodeDxfText("a\r\n0\r\nSECTION")).toBe("a 0 SECTION");
    expect(encodeDxfText("tab\there")).toBe("tab\\U+0009here");
  });
});
