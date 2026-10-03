import { describe, expect, it } from "vitest";
import { angleInSweep, ccwSpanDeg, normalizeDeg, polar, roundTo } from "./math.js";

describe("angle math", () => {
  it("normalizes into [0, 360)", () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(725)).toBe(5);
  });

  it("computes the counter-clockwise sweep, including across the 0/360 seam", () => {
    expect(ccwSpanDeg(10, 100)).toBe(90);
    expect(ccwSpanDeg(350, 10)).toBe(20);
    expect(ccwSpanDeg(100, 10)).toBe(270);
  });

  it("treats equal angles as degenerate and whole-turn differences as a full circle", () => {
    expect(ccwSpanDeg(45, 45)).toBe(0);
    expect(ccwSpanDeg(0, 360)).toBe(360);
    expect(ccwSpanDeg(-90, 270)).toBe(360);
  });

  it("tests whether a direction lies within a sweep", () => {
    expect(angleInSweep(0, 350, 10)).toBe(true);
    expect(angleInSweep(180, 350, 10)).toBe(false);
    expect(angleInSweep(90, 0, 90)).toBe(true); // inclusive
    expect(angleInSweep(270, 0, 90)).toBe(false);
  });

  it("projects polar offsets and rounds", () => {
    const p = polar({ x: 1, y: 1 }, 2, 90);
    expect(p.x).toBeCloseTo(1, 10);
    expect(p.y).toBeCloseTo(3, 10);
    expect(roundTo(1.23456)).toBe(1.235);
    expect(roundTo(1.23456, 1)).toBe(1.2);
  });
});
