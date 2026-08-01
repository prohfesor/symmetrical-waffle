import { describe, expect, it } from "vitest";
import { loadParams, parseParamsFile, resolveParams } from "./paramsFile.js";

describe("params file", () => {
  it("resolves parameters defined in any order via dependency graph", () => {
    const text = `
      # bracket dimensions
      height = width * 0.5 + 20
      width = 100
      hole_d = 6.35
    `;
    const result = loadParams(text);
    expect(result.issues).toEqual([]);
    expect(result.values.get("width")).toBe(100);
    expect(result.values.get("height")).toBe(70);
    expect(result.values.get("hole_d")).toBe(6.35);
  });

  it("reports a circular reference instead of throwing", () => {
    const text = `
      a = b + 1
      b = a - 1
    `;
    const result = loadParams(text);
    expect(result.values.has("a")).toBe(false);
    expect(result.values.has("b")).toBe(false);
    expect(result.issues.some((i) => i.message.includes("circular"))).toBe(true);
  });

  it("reports an undefined reference without crashing other params", () => {
    const text = `
      width = 100
      height = width + missing
    `;
    const result = loadParams(text);
    expect(result.values.get("width")).toBe(100);
    expect(result.values.has("height")).toBe(false);
    expect(result.issues.some((i) => i.message.includes("missing"))).toBe(true);
  });

  it("reports duplicate definitions", () => {
    const text = `
      width = 100
      width = 200
    `;
    const result = loadParams(text);
    expect(result.issues.some((i) => i.message.includes("Duplicate"))).toBe(true);
  });

  it("ignores blank lines and trailing comments", () => {
    const file = parseParamsFile("width = 100 # the outer width\n\nheight = 50\n");
    expect(file.definitions).toHaveLength(2);
    const resolved = resolveParams(file);
    expect(resolved.values.get("width")).toBe(100);
  });
});
