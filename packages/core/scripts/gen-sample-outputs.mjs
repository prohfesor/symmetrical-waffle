import { exportDxf, exportTiledPdf, PAPER_SIZES, resolveFullDocument } from "../dist/index.js";
import { readFileSync, writeFileSync } from "node:fs";

const project = JSON.parse(readFileSync("../../samples/l-bracket-plate.pcad.json", "utf-8"));
const { drawing } = resolveFullDocument(project.document, project.paramsText);

writeFileSync("../../samples/l-bracket-plate.dxf", exportDxf(drawing));

const A4 = PAPER_SIZES.find((p) => p.name === "A4");
const pdfBytes = await exportTiledPdf(drawing, {
  paper: A4,
  orientation: "landscape",
  scale: 1,
  marginMm: 10,
  overlapMm: 15,
  title: project.document.title,
  showCropMarks: true,
  showOverlapShading: true,
  showLabels: true,
  includeIndexSheet: true,
});
writeFileSync("../../samples/l-bracket-plate.pdf", pdfBytes);

console.log("wrote samples/l-bracket-plate.dxf and .pdf");
