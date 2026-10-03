import { describe, expect, it } from "vitest";
import { formatNumber } from "./format.js";

describe("formatNumber (dimension text)", () => {
  it("drops insignificant trailing zeros without eating real digits", () => {
    expect(formatNumber(120, 2)).toBe("120"); // was "120." -- trailing point
    expect(formatNumber(100, 0)).toBe("100"); // was "1"    -- stripped real zeros
    expect(formatNumber(80, 2)).toBe("80");
    expect(formatNumber(12.5, 2)).toBe("12.5");
    expect(formatNumber(12.345, 2)).toBe("12.35");
    expect(formatNumber(0.1 + 0.2, 4)).toBe("0.3");
  });

  it("never shows negative zero", () => {
    expect(formatNumber(-0.001, 2)).toBe("0");
    expect(formatNumber(-0, 2)).toBe("0");
  });

  it("keeps the sign and tolerates odd precision values", () => {
    expect(formatNumber(-7.5, 2)).toBe("-7.5");
    expect(formatNumber(1.234, -3)).toBe("1");
    expect(formatNumber(1.5, 99)).toBe("1.5");
  });
});
