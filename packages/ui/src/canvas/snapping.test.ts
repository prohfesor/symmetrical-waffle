import { ResolvedDrawing } from "@pcad/core";
import { describe, expect, it } from "vitest";
import { findSnapPoint, resolveClickPoint, snapAngleAround, snapToGrid } from "./snapping.js";

const drawing = {
  namedPoints: { line1: { p1: { x: 10, y: 10 }, p2: { x: 50, y: 10 } }, c1: { center: { x: 30, y: 30 } } },
} as unknown as ResolvedDrawing;

describe("object snap", () => {
  it("finds the nearest named point within the radius, with a ref that anchors to it", () => {
    expect(findSnapPoint(drawing, { x: 11, y: 10.5 }, 3)).toMatchObject({
      point: { x: 10, y: 10 },
      ref: "line1.p1",
      entityId: "line1",
      pointName: "p1",
    });
  });
  it("finds nothing outside the radius", () => {
    expect(findSnapPoint(drawing, { x: 20, y: 20 }, 3)).toBeNull();
  });
});

describe("resolveClickPoint", () => {
  const near = { x: 10.4, y: 10.2 };
  it("prefers existing geometry (and reports its ref) over the grid", () => {
    expect(resolveClickPoint(near, drawing, { objectSnap: true, gridSnap: true, objectSnapRadius: 2 })).toEqual({
      point: { x: 10, y: 10 },
      ref: "line1.p1",
    });
  });
  it("falls back to the 1mm grid when no object is in range, or object snap is off", () => {
    expect(resolveClickPoint({ x: 20.4, y: 20.6 }, drawing, { objectSnap: true, gridSnap: true, objectSnapRadius: 2 })).toEqual({
      point: { x: 20, y: 21 },
      ref: null,
    });
    expect(resolveClickPoint(near, drawing, { objectSnap: false, gridSnap: true, objectSnapRadius: 2 })).toEqual({
      point: { x: 10, y: 10 },
      ref: null,
    });
  });
  it("leaves the point alone when both snaps are off", () => {
    expect(resolveClickPoint(near, drawing, { objectSnap: false, gridSnap: false, objectSnapRadius: 2 })).toEqual({
      point: near,
      ref: null,
    });
  });
});

describe("snapToGrid", () => {
  it("rounds to the step", () => {
    expect(snapToGrid({ x: 1.4, y: -1.6 })).toEqual({ x: 1, y: -2 });
    expect(snapToGrid({ x: 12, y: 7 }, 5)).toEqual({ x: 10, y: 5 });
  });
});

describe("snapAngleAround (Shift)", () => {
  const origin = { x: 5, y: 5 };
  it("snaps the direction to 15 degree steps and keeps the length", () => {
    const p = snapAngleAround(origin, { x: 5 + 10 * Math.cos(0.3), y: 5 + 10 * Math.sin(0.3) }); // ~17.2 degrees
    expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(10);
    expect((Math.atan2(p.y - 5, p.x - 5) * 180) / Math.PI).toBeCloseTo(15);
  });
  it("snaps near-horizontal and near-vertical drags exactly", () => {
    expect(snapAngleAround(origin, { x: 25, y: 5.4 }).y).toBeCloseTo(5);
    expect(snapAngleAround(origin, { x: 5.3, y: 25 }, 90).x).toBeCloseTo(5);
  });
  it("returns the point unchanged when it coincides with the reference", () => {
    expect(snapAngleAround(origin, origin)).toEqual(origin);
  });
});
