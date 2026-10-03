import { describe, expect, it } from "vitest";
import { resolveFullDocument } from "../geom/document.js";
import { createEmptyDocument, Entity } from "../geom/types.js";
import { tilesWithGeometry } from "./coverage.js";
import { computeTiling, PAPER_SIZES } from "./tiling.js";

const A4 = PAPER_SIZES.find((p) => p.name === "A4")!;
const at = (x: number, y: number) => ({ kind: "free" as const, x, y });
const resolve = (entities: Entity[]) => resolveFullDocument({ ...createEmptyDocument(), entities }, "").drawing;
const line = (id: string, x1: number, y1: number, x2: number, y2: number): Entity => ({
  id,
  kind: "line",
  mode: "twoPoint",
  p1: at(x1, y1),
  p2: at(x2, y2),
});

/** 3x3 sheets of A4 landscape at 1:1, no overlap or margin to keep the arithmetic obvious: each sheet is 297 x 210 mm. */
const grid = () =>
  computeTiling(
    { min: { x: 0, y: 0 }, max: { x: 891, y: 630 } },
    { paper: A4, orientation: "landscape", scale: 1, marginMm: 0, overlapMm: 0 },
  );

describe("tilesWithGeometry", () => {
  it("finds the sheets a diagonal line passes through and none of the empty corners", () => {
    const { tiles, cols, rows } = grid();
    expect([cols, rows]).toEqual([3, 3]);
    const used = tilesWithGeometry(resolve([line("d", 0, 630, 891, 0)]), tiles, 0.01); // top-left to bottom-right
    expect(used.has("A3")).toBe(false); // top-right corner: nothing there
    expect(used.has("C1")).toBe(false); // bottom-left corner: nothing there
    expect(used.has("A1") && used.has("B2") && used.has("C3")).toBe(true);
  });

  it("counts a curve that only bulges into a sheet", () => {
    const { tiles } = grid();
    // A circle centred in sheet B2 (x 297..594, y 210..420) that reaches into the sheets above and below, but not the corners.
    const circle: Entity = { id: "c", kind: "circle", center: at(445, 315), radius: 120 };
    const used = tilesWithGeometry(resolve([circle]), tiles, 0.01);
    expect(used.has("B2")).toBe(true);
    expect(used.has("A2") && used.has("C2")).toBe(true);
    expect(used.has("A1")).toBe(false);
  });

  it("includes the sheets a dimension's extension lines and text reach", () => {
    const { tiles } = grid();
    const doc = {
      ...createEmptyDocument(),
      entities: [line("l", 10, 10, 20, 10)],
      dimensions: [{ id: "d", target: { kind: "lineLength" as const, entityId: "l" }, displayOffset: 400 }],
    };
    const used = tilesWithGeometry(resolveFullDocument(doc, "").drawing, tiles, 0.01);
    // The line is on the bottom-left sheet; its dimension line and text sit 400 mm above, one sheet up.
    expect([...used].sort()).toEqual(["B1", "C1"]);
  });

  it("treats a line lying exactly along a sheet edge as touching it", () => {
    const { tiles } = grid();
    const used = tilesWithGeometry(resolve([line("e", 297, 0, 297, 100)]), tiles, 0.01);
    expect(used.has("C1") && used.has("C2")).toBe(true);
  });
});
