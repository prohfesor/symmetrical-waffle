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

  it("refuses to redefine built-in constants and functions", () => {
    const result = loadParams("e = 5\nsin = 2\nwidth = 10");
    expect(result.values.get("width")).toBe(10);
    expect(result.values.has("e")).toBe(false);
    expect(result.issues.filter((i) => i.message.includes("built-in"))).toHaveLength(2);
  });

  it("reports an undefined reference exactly once, not again as an evaluation error", () => {
    const result = loadParams("height = width + missing\nwidth = 1");
    expect(result.issues.filter((i) => i.param === "height")).toHaveLength(1);
    expect(result.issues[0].message).toContain("undefined parameter 'missing'");
  });

  it("explains cascading failures instead of repeating a misleading 'undefined variable'", () => {
    const result = loadParams("bad = sqrt(-1)\nuses_bad = bad + 1");
    const cascade = result.issues.find((i) => i.param === "uses_bad");
    expect(cascade?.message).toBe("'uses_bad' depends on 'bad', which has an error");
  });

  it("flags non-finite results as issues", () => {
    expect(loadParams("x = 1 / 0").issues[0].message).toContain("Division by zero");
    expect(loadParams("x = ln(0)").values.has("x")).toBe(false);
  });

  it("reports the evaluation order that was used", () => {
    expect(loadParams("b = a + 1\na = 1").order).toEqual(["a", "b"]);
  });
});
