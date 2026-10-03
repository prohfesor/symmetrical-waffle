import { describe, expect, it } from "vitest";
import { formatScale, parseScale, ScaleParseError } from "./scale.js";
import { toPdfSafeText, transliterateCyrillic } from "./pdfText.js";

describe("scale", () => {
  it("parses ratios and plain factors", () => {
    expect(parseScale("1:10")).toBeCloseTo(0.1, 12);
    expect(parseScale(" 2 : 1 ")).toBe(2);
    expect(parseScale("1:2.5")).toBeCloseTo(0.4, 12);
    expect(parseScale("0.5")).toBe(0.5);
  });

  it("rejects nonsense with a helpful error", () => {
    for (const bad of ["", "abc", "1:0", "0:1", "-1:2", "1:2:3", "0", "-5"]) {
      expect(() => parseScale(bad), bad).toThrow(ScaleParseError);
    }
    expect(() => parseScale("x")).toThrow(/1:10/);
  });

  it("formats scales back, including non-integer ratios the old code rounded wrongly", () => {
    expect(formatScale(1)).toBe("1:1");
    expect(formatScale(0.1)).toBe("1:10");
    expect(formatScale(2)).toBe("2:1");
    expect(formatScale(0.4)).toBe("1:2.5"); // old code printed "1:3"
    expect(formatScale(parseScale("1:50"))).toBe("1:50");
  });
});

describe("PDF-safe text", () => {
  const latin = new Set(Array.from({ length: 0x7f - 0x20 }, (_, i) => 0x20 + i).concat([0xd8, 0xb0]));

  it("transliterates Ukrainian and Russian Cyrillic, keeping capitalization", () => {
    expect(transliterateCyrillic("Кронштейн")).toBe("Kronshteyn");
    expect(transliterateCyrillic("Щоденник Їжак")).toBe("Shchodennyk Izhak");
    expect(transliterateCyrillic("Ёлка Объём")).toBe("Elka Obem");
  });

  it("substitutes the diameter sign and replaces anything unencodable", () => {
    expect(toPdfSafeText("⌀8", latin)).toBe("Ø8");
    expect(toPdfSafeText("日本", latin)).toBe("??");
    expect(toPdfSafeText("a\nb\tc", latin)).toBe("a b c");
  });

  it("leaves plain text alone", () => {
    expect(toPdfSafeText("L-Bracket 120 x 80, 45°", latin)).toBe("L-Bracket 120 x 80, 45°");
  });
});
