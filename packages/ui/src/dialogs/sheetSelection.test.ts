import type { PrintPlan } from "@pcad/core";
import { describe, expect, it } from "vitest";
import { isSheetEnabled, layoutKey, NO_OVERRIDES, setAllSheets, skippedLabels, toggleSheet } from "./sheetSelection.js";

const tile = (label: string) => ({ label }) as PrintPlan["tiling"]["tiles"][number];
const plan = (emptyTiles: string[] = [], cols = 2): PrintPlan =>
  ({
    tiling: {
      cols,
      rows: 1,
      pageWidthMm: 297,
      pageHeightMm: 210,
      extent: { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } },
      tiles: [tile("A1"), tile("A2")],
    },
    emptyTiles,
  }) as PrintPlan;

describe("sheet selection", () => {
  it("starts with every sheet on", () => {
    expect(skippedLabels(plan(), NO_OVERRIDES, true)).toEqual([]);
  });

  it("starts with empty sheets off when asked, and on otherwise", () => {
    expect(skippedLabels(plan(["A2"]), NO_OVERRIDES, true)).toEqual(["A2"]);
    expect(skippedLabels(plan(["A2"]), NO_OVERRIDES, false)).toEqual([]);
  });

  it("a click flips a sheet, whatever its starting state", () => {
    const p = plan(["A2"]);
    const off = toggleSheet("A1", p, NO_OVERRIDES, true);
    expect(isSheetEnabled("A1", p, off, true)).toBe(false);
    expect(isSheetEnabled("A1", p, toggleSheet("A1", p, off, true), true)).toBe(true);
    // An empty sheet that started off can be switched on.
    expect(isSheetEnabled("A2", p, toggleSheet("A2", p, NO_OVERRIDES, true), true)).toBe(true);
  });

  it("an explicit choice survives toggling the 'skip empty' option", () => {
    const p = plan(["A2"]);
    const forcedOn = toggleSheet("A2", p, NO_OVERRIDES, true);
    expect(isSheetEnabled("A2", p, forcedOn, false)).toBe(true);
    expect(isSheetEnabled("A2", p, forcedOn, true)).toBe(true);
  });

  it("All on / All off set every sheet", () => {
    const p = plan(["A2"]);
    expect(skippedLabels(p, setAllSheets(false, p), true)).toEqual(["A1", "A2"]);
    expect(skippedLabels(p, setAllSheets(true, p), true)).toEqual([]);
  });

  it("clicks made on one layout don't carry over to a different one", () => {
    const before = plan([], 2);
    const off = toggleSheet("A1", before, NO_OVERRIDES, true);
    const after = plan([], 3); // e.g. the scale changed and the sheets are different now
    expect(layoutKey(after)).not.toBe(layoutKey(before));
    expect(isSheetEnabled("A1", after, off, true)).toBe(true);
    expect(isSheetEnabled("A1", before, off, true)).toBe(false);
  });
});
