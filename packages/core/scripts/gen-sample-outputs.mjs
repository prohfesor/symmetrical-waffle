import { exportDxf, exportTiledPdf, PAPER_SIZES, resolveFullDocument } from "../dist/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sample = (name) => fileURLToPath(new URL(`../../../samples/${name}`, import.meta.url));

const project = JSON.parse(readFileSync(sample("l-bracket-plate.pcad.json"), "utf-8"));
const { drawing } = resolveFullDocument(project.document, project.paramsText);

writeFileSync(sample("l-bracket-plate.dxf"), exportDxf(drawing));

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
writeFileSync(sample("l-bracket-plate.pdf"), pdfBytes);

console.log("wrote samples/l-bracket-plate.dxf and .pdf");
