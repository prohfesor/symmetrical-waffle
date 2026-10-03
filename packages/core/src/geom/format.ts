/**
 * Formats a number for dimension text: fixed `precision` decimals with
 * insignificant trailing zeros (and a dangling point) removed -- 120 -> "120",
 * 12.50 -> "12.5", 100 -> "100". Negative zero is shown as "0".
 */
export function formatNumber(value: number, precision: number): string {
  const fixed = value.toFixed(Math.min(20, Math.max(0, Math.trunc(precision))));
  const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}
