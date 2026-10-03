import { createEmptyDocument, makeRef } from "../dist/index.js";
import { writeFileSync } from "node:fs";

const doc = createEmptyDocument();
doc.title = "L-Bracket Plate";
doc.entities = [
  { id: "rect1", kind: "rectangle", corner: { kind: "free", x: 0, y: 0 }, width: "=width", height: "=height" },
  { id: "hole1", kind: "circle", center: { kind: "free", x: "=hole_margin", y: "=hole_margin" }, radius: "=hole_d / 2" },
  { id: "hole2", kind: "circle", center: { kind: "free", x: "=width - hole_margin", y: "=hole_margin" }, radius: "=hole_d / 2" },
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
    displayOffset: -15,
  },
  { id: "dim_hole", target: { kind: "circleDiameter", entityId: "hole1" }, displayOffset: 10 },
];

const paramsText = `# L-bracket plate parameters -- edit these and re-open the drawing; every
# dimension in the drawing is computed from these, not hard-coded.
width = 120
height = 80
hole_d = 8
hole_margin = 15
`;

writeFileSync("../../samples/l-bracket-plate.params.txt", paramsText);
writeFileSync("../../samples/l-bracket-plate.pcad.json", JSON.stringify({ formatVersion: 1, document: doc, paramsText }, null, 2) + "\n");
console.log("wrote samples/l-bracket-plate.params.txt and l-bracket-plate.pcad.json");
