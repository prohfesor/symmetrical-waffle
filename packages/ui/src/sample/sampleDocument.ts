import { createEmptyDocument, DrawingDocument, makeRef } from "@pcad/core";

export function createSampleDocument(): DrawingDocument {
  const doc = createEmptyDocument();
  doc.title = "L-Bracket Plate";
  doc.entities = [
    {
      id: "rect1",
      kind: "rectangle",
      corner: { kind: "free", x: 0, y: 0 },
      width: "=width",
      height: "=height",
    },
    {
      id: "hole1",
      kind: "circle",
      center: { kind: "free", x: "=hole_margin", y: "=hole_margin" },
      radius: "=hole_d / 2",
    },
    {
      id: "hole2",
      kind: "circle",
      center: { kind: "free", x: "=width - hole_margin", y: "=hole_margin" },
      radius: "=hole_d / 2",
    },
  ];
  doc.dimensions = [
    {
      id: "dim_w",
      target: { kind: "pointDistance", from: makeRef("rect1", "corner0"), to: makeRef("rect1", "corner1") },
      displayOffset: -15,
    },
    {
      id: "dim_h",
      target: { kind: "pointDistance", from: makeRef("rect1", "corner0"), to: makeRef("rect1", "corner3") },
      displayOffset: 15,
    },
    { id: "dim_hole", target: { kind: "circleDiameter", entityId: "hole1" }, displayOffset: 10 },
  ];
  return doc;
}
