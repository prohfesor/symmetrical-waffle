import { createEmptyDocument, makeRef } from "../dist/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sample = (name) => fileURLToPath(new URL(`../../../samples/${name}`, import.meta.url));

const doc = createEmptyDocument();
doc.title = "L-Bracket Plate";
doc.entities = [
  { id: "rect1", kind: "rectangle", corner: { kind: "free", x: 0, y: 0 }, width: "=width", height: "=height" },
  { id: "hole1", kind: "circle", center: { kind: "free", x: "=hole_margin", y: "=hole_margin" }, radius: "=hole_d / 2" },
  { id: "hole2", kind: "circle", center: { kind: "free", x: "=width - hole_margin", y: "=hole_margin" }, radius: "=hole_d / 2" },
  // The mirror image of the whole plate, across a vertical axis mirror_gap/2 to the right of it.
  // Its copies are computed, so they follow width, height and the holes automatically.
  {
    id: "mirror1",
    kind: "mirror",
    axis: { p1: { kind: "free", x: "=width + mirror_gap / 2", y: 0 }, p2: { kind: "free", x: "=width + mirror_gap / 2", y: 1 } },
    sources: ["rect1", "hole1", "hole2"],
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
  // Mirrored copies are named <mirror>.<source>, so they can be dimensioned like any entity.
  { id: "dim_hole_mirrored", target: { kind: "circleDiameter", entityId: "mirror1.hole2" }, displayOffset: 10 },
];

const paramsText = `# L-bracket plate parameters -- edit these and re-open the drawing; every
# dimension in the drawing, including the mirror image, is computed from
# these, not hard-coded.
width = 120
height = 80
hole_d = 8
hole_margin = 15
mirror_gap = 10
`;

writeFileSync(sample("l-bracket-plate.params.txt"), paramsText);
writeFileSync(sample("l-bracket-plate.wafflecad.json"), JSON.stringify({ formatVersion: 1, document: doc, paramsText }, null, 2) + "\n");
console.log("wrote samples/l-bracket-plate.params.txt and l-bracket-plate.wafflecad.json");
