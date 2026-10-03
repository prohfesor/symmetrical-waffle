import type { PrintPlan } from "@wafflecad/core";

/**
 * Which sheets are switched on. Sheets with nothing on them start off (if asked), everything
 * else starts on, and the user's clicks override that. A click only means something for the
 * layout it was made on, so the overrides carry the layout's key and are dropped when it changes.
 */
export interface SheetOverrides {
  key: string;
  enabled: Record<string, boolean>;
}

export const NO_OVERRIDES: SheetOverrides = { key: "", enabled: {} };

/** Identifies a sheet layout: change the paper, scale, margins or the drawing and the sheets are no longer "the same sheets". */
export function layoutKey(plan: PrintPlan): string {
  const { tiling } = plan;
  const area = tiling.extent;
  return [tiling.cols, tiling.rows, tiling.pageWidthMm, tiling.pageHeightMm, area.min.x, area.min.y, area.max.x, area.max.y].join("|");
}

export function isSheetEnabled(label: string, plan: PrintPlan, overrides: SheetOverrides, skipEmpty: boolean): boolean {
  const own = overrides.key === layoutKey(plan) ? overrides.enabled[label] : undefined;
  if (own !== undefined) return own;
  return !(skipEmpty && plan.emptyTiles.includes(label));
}

export function toggleSheet(label: string, plan: PrintPlan, overrides: SheetOverrides, skipEmpty: boolean): SheetOverrides {
  const key = layoutKey(plan);
  const current = overrides.key === key ? overrides.enabled : {};
  return { key, enabled: { ...current, [label]: !isSheetEnabled(label, plan, overrides, skipEmpty) } };
}

/** Switches every sheet on or off at once. */
export function setAllSheets(on: boolean, plan: PrintPlan): SheetOverrides {
  return { key: layoutKey(plan), enabled: Object.fromEntries(plan.tiling.tiles.map((t) => [t.label, on])) };
}

/** Labels of the sheets that will be left out of the PDF. */
export function skippedLabels(plan: PrintPlan, overrides: SheetOverrides, skipEmpty: boolean): string[] {
  return plan.tiling.tiles.filter((t) => !isSheetEnabled(t.label, plan, overrides, skipEmpty)).map((t) => t.label);
}
