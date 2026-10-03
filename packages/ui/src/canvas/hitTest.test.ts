import { ResolvedDrawing, ResolvedEntity } from "@pcad/core";
import { describe, expect, it } from "vitest";
import { distanceToEntity, hitTestAxes, hitTestEntities } from "./hitTest.js";

const drawing = (entities: ResolvedEntity[]): ResolvedDrawing =>
  ({ entities, dimensions: [], namedPoints: {}, issues: [], bounds: null }) as unknown as ResolvedDrawing;
const arc = (startAngleDeg: number, endAngleDeg: number): ResolvedEntity =>
  ({ id: "a", kind: "arc", center: { x: 0, y: 0 }, radius: 10, startAngleDeg, endAngleDeg }) as ResolvedEntity;

describe("distanceToEntity", () => {
  it("measures to the circle outline, not the center", () => {
    const circle = { id: "c", kind: "circle", center: { x: 0, y: 0 }, radius: 10 } as ResolvedEntity;
    expect(distanceToEntity(circle, { x: 0, y: 0 })).toBe(10);
    expect(distanceToEntity(circle, { x: 13, y: 0 })).toBe(3);
  });

  it("measures to the nearest point of a segment, clamping at the ends", () => {
    const l = { id: "l", kind: "line", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } } as ResolvedEntity;
    expect(distanceToEntity(l, { x: 5, y: 3 })).toBe(3);
    expect(distanceToEntity(l, { x: 13, y: 4 })).toBe(5);
  });

  it("uses the radial distance inside an arc's sweep and the end points outside it", () => {
    const quarter = arc(0, 90);
    expect(distanceToEntity(quarter, { x: 12, y: 12 })).toBeCloseTo(Math.hypot(12, 12) - 10);
    expect(distanceToEntity(quarter, { x: -10, y: 0 })).toBeCloseTo(Math.hypot(10, 10)); // outside the sweep: nearest end is (0,10), not the circle
  });

  it("handles arcs that cross 0 degrees", () => {
    const wrap = arc(350, 10);
    expect(distanceToEntity(wrap, { x: 11, y: 0 })).toBeCloseTo(1);
    expect(distanceToEntity(wrap, { x: -11, y: 0 })).toBeGreaterThan(10);
  });

  it("treats a closed rectangle as its four sides", () => {
    const r = {
      id: "r",
      kind: "rectangle",
      corners: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 5 },
      ],
    } as ResolvedEntity;
    expect(distanceToEntity(r, { x: 5, y: 2.5 })).toBe(2.5); // the middle is *not* a hit
    expect(distanceToEntity(r, { x: 5, y: 0 })).toBe(0);
  });
});

describe("hitTestEntities", () => {
  const near = { id: "near", kind: "line", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } } as ResolvedEntity;
  const far = { id: "far", kind: "line", p1: { x: 0, y: 3 }, p2: { x: 10, y: 3 } } as ResolvedEntity;

  it("picks the closest entity within the threshold", () => {
    expect(hitTestEntities(drawing([far, near]), { x: 5, y: 0.5 }, 5)?.id).toBe("near");
  });

  it("returns null when nothing is close enough", () => {
    expect(hitTestEntities(drawing([near]), { x: 5, y: 2 }, 1)).toBeNull();
    expect(hitTestEntities(drawing([]), { x: 0, y: 0 }, 100)).toBeNull();
  });
});

describe("hitTestAxes", () => {
  const withAxis = { ...drawing([]), axes: [{ id: "m", p1: { x: 5, y: 0 }, p2: { x: 5, y: 1 } }] } as ResolvedDrawing;
  it("treats an axis as an infinite line, not a segment between its two points", () => {
    expect(hitTestAxes(withAxis, { x: 5.2, y: 500 }, 1)?.id).toBe("m");
    expect(hitTestAxes(withAxis, { x: 7, y: 0 }, 1)).toBeNull();
  });
});
