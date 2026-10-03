import { formatNumber } from "../geom/format.js";

export class ScaleParseError extends Error {
  constructor(input: string) {
    super(`Invalid scale '${input}' -- use a ratio like 1:10 or 2:1, or a plain factor like 0.5`);
    this.name = "ScaleParseError";
  }
}

/** Common drafting scales, as accepted by {@link parseScale}. */
export const SCALE_PRESETS = ["1:1", "1:2", "1:5", "1:10", "1:20", "1:25", "1:50", "1:100", "2:1", "5:1", "10:1"] as const;

/**
 * Parses a drawing scale into paper-millimeters per drawing-millimeter:
 * "1:10" -> 0.1 (reduction), "2:1" -> 2 (enlargement), "0.5" -> 0.5.
 */
export function parseScale(input: string): number {
  const text = input.trim();
  const ratio = text.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  const value = ratio ? Number(ratio[1]) / Number(ratio[2]) : Number(text);
  if (text === "" || !Number.isFinite(value) || value <= 0) throw new ScaleParseError(input);
  return value;
}

/** Inverse of {@link parseScale}: 0.1 -> "1:10", 2 -> "2:1", 0.4 -> "1:2.5". */
export function formatScale(scale: number): string {
  if (scale >= 1) return `${formatNumber(scale, 2)}:1`;
  return `1:${formatNumber(1 / scale, 2)}`;
}
