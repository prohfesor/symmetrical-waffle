import { describe, expect, it } from "vitest";
import { resolveFullDocument } from "./document.js";
import { createEmptyDocument, DrawingDocument, makeRef } from "./types.js";

describe("geometry resolution", () => {
  it("resolves a polar line and anchors a circle to its endpoint", () => {
    const doc: DrawingDocument = {
      ...createEmptyDocument(),
      entities: [
        { id: "line1", kind: "line", mode: "polar", p1: { kind: "free", x: 0, y: 0 }, length: "=width", angle: 0 },
        { id: "circle1", kind: "circle", center: { kind: "anchor", ref: makeRef("line1", "p2") }, radius: "=hole_d / 2" },
      ],
      dimensions: [],
    };
    const { drawing, paramIssues } = resolveFullDocument(doc, "width = 100\nhole_d = 10\n");
    expect(paramIssues).toEqual([]);
    expect(drawing.issues).toEqual([]);

    const line = drawing.entities.find((e) => e.id === "line1");
    expect(line?.kind).toBe("line");
    if (line?.kind === "line") {
      expect(line.p2.x).toBeCloseTo(100, 6);
      expect(line.p2.y).toBeCloseTo(0, 6);
    }

    const circle = drawing.entities.find((e) => e.id === "circle1");
    expect(circle?.kind).toBe("circle");
    if (circle?.kind === "circle") {
      expect(circle.center.x).toBeCloseTo(100, 6);
      expect(circle.radius).toBeCloseTo(5, 6);
    }
  });

  it("recomputes geometry when a parameter changes, without touching the document", () => {
    const doc: DrawingDocument = {
      ...createEmptyDocument(),
      entities: [{ id: "line1", kind: "line", mode: "polar", p1: { kind: "free", x: 0, y: 0 }, length: "=width", angle: 0 }],
    };
    const before = resolveFullDocument(doc, "width = 100");
    const after = resolveFullDocument(doc, "width = 250");
    const beforeLine = before.drawing.entities[0];
    const afterLine = after.drawing.entities[0];
    expect(beforeLine.kind).toBe("line");
    expect(afterLine.kind).toBe("line");
    if (beforeLine.kind === "line" && afterLine.kind === "line") {
      expect(beforeLine.p2.x).toBeCloseTo(100, 6);
      expect(afterLine.p2.x).toBeCloseTo(250, 6);
    }
  });

  it("reports a circular anchor reference as an issue instead of crashing", () => {
    const doc: DrawingDocument = {
      ...createEmptyDocument(),
      entities: [
        { id: "c1", kind: "circle", center: { kind: "anchor", ref: makeRef("c2", "center") }, radius: 5 },
        { id: "c2", kind: "circle", center: { kind: "anchor", ref: makeRef("c1", "center") }, radius: 5 },
      ],
    };
    const { drawing } = resolveFullDocument(doc, "");
    expect(drawing.entities).toHaveLength(0);
    expect(drawing.issues.some((i) => i.message.includes("circular"))).toBe(true);
  });

  it("computes a linear dimension's value from a line's resolved length", () => {
    const doc: DrawingDocument = {
      ...createEmptyDocument(),
      entities: [{ id: "line1", kind: "line", mode: "polar", p1: { kind: "free", x: 0, y: 0 }, length: "=width", angle: 30 }],
      dimensions: [{ id: "dim1", target: { kind: "lineLength", entityId: "line1" }, displayOffset: 10 }],
    };
    const { drawing } = resolveFullDocument(doc, "width = 80");
    expect(drawing.dimensions).toHaveLength(1);
    expect(drawing.dimensions[0].value).toBeCloseTo(80, 6);
  });

  it("builds a closed parametric polyline and a rotated rectangle", () => {
    const doc: DrawingDocument = {
      ...createEmptyDocument(),
      entities: [
        {
          id: "poly1",
          kind: "polyline",
          start: { kind: "free", x: 0, y: 0 },
          segments: [
            { kind: "polar", length: "=w", angle: 0 },
            { kind: "polar", length: "=h", angle: 90 },
            { kind: "polar", length: "=w", angle: 180 },
          ],
          closed: true,
        },
        { id: "rect1", kind: "rectangle", corner: { kind: "free", x: 0, y: 0 }, width: "=w", height: "=h" },
      ],
    };
    const { drawing } = resolveFullDocument(doc, "w = 40\nh = 20");
    const poly = drawing.entities.find((e) => e.id === "poly1");
    expect(poly?.kind).toBe("polyline");
    if (poly?.kind === "polyline") {
      expect(poly.points).toHaveLength(4);
      expect(poly.points[3].x).toBeCloseTo(0, 6);
      expect(poly.points[3].y).toBeCloseTo(20, 6);
    }
    const rect = drawing.entities.find((e) => e.id === "rect1");
    expect(rect?.kind).toBe("rectangle");
    if (rect?.kind === "rectangle") {
      expect(rect.corners[2].x).toBeCloseTo(40, 6);
      expect(rect.corners[2].y).toBeCloseTo(20, 6);
    }
  });
});
