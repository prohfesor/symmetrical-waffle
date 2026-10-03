import { describe, expect, it } from "vitest";
import { arcPoints, arcSegmentCount, circlePoints, dimensionGraphics, dimensionPaths, entityPaths } from "./flatten.js";
import { ResolvedDimension, ResolvedEntity } from "./resolved-types.js";

const O = { x: 0, y: 0 };

describe("curve flattening", () => {
  it("uses more segments for bigger radii at the same tolerance, and fewer for looser tolerance", () => {
    expect(arcSegmentCount(500, 360, 0.05)).toBeGreaterThan(arcSegmentCount(5, 360, 0.05));
    expect(arcSegmentCount(50, 360, 1)).toBeLessThan(arcSegmentCount(50, 360, 0.01));
  });

  it("keeps every point within the tolerance of the true circle (chord sagitta)", () => {
    const radius = 500;
    const tolerance = 0.05;
    const pts = circlePoints(O, radius, tolerance);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(radius - Math.hypot(mid.x, mid.y)).toBeLessThanOrEqual(tolerance + 1e-9);
    }
  });

  it("stays bounded for absurd inputs", () => {
    expect(arcSegmentCount(1e9, 360, 1e-9)).toBeLessThanOrEqual(4096);
    expect(arcSegmentCount(0, 360, 1)).toBeGreaterThanOrEqual(4);
    expect(arcSegmentCount(10, 360, 0)).toBeGreaterThanOrEqual(4);
  });

  it("sweeps counter-clockwise from start to end -- including when end < start", () => {
    const pts = arcPoints(O, 10, 350, 10, 0.1);
    expect(pts[0].x).toBeCloseTo(Math.cos((350 * Math.PI) / 180) * 10, 9);
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(Math.cos((10 * Math.PI) / 180) * 10, 9);
    // Every point lies on the short 20 degree side (x > 0), never the long way round through x < 0.
    expect(pts.every((p) => p.x > 9)).toBe(true);
  });
});

describe("entity and dimension primitives", () => {
  const rect: ResolvedEntity = {
    id: "r",
    kind: "rectangle",
    corners: [O, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    width: 1,
    height: 1,
    rotationDeg: 0,
  };

  it("maps each entity kind to the right path shape", () => {
    expect(entityPaths(rect, 0.1)).toEqual([{ points: rect.kind === "rectangle" ? rect.corners : [], closed: true }]);
    expect(entityPaths({ id: "l", kind: "line", p1: O, p2: { x: 1, y: 1 }, length: 1.41, angleDeg: 45 }, 0.1)[0].closed).toBe(false);
    expect(entityPaths({ id: "c", kind: "circle", center: O, radius: 5 }, 0.1)[0].closed).toBe(true);
  });

  it("describes a linear dimension as two extension lines plus the dimension line", () => {
    const d: ResolvedDimension = {
      id: "d",
      kind: "linear",
      value: 10,
      p1: O,
      p2: { x: 10, y: 0 },
      dimLineP1: { x: 0, y: 5 },
      dimLineP2: { x: 10, y: 5 },
      textPos: { x: 5, y: 5 },
      text: "10",
    };
    const g = dimensionGraphics(d);
    expect(g.lines).toHaveLength(3);
    expect(g.arcs).toHaveLength(0);
    expect(g.label).toEqual({ position: { x: 5, y: 5 }, text: "10" });
  });

  it("describes an angular dimension as an arc and flattens it on request", () => {
    const d: ResolvedDimension = {
      id: "d",
      kind: "angular",
      value: 90,
      center: O,
      radius: 10,
      arcStart: { x: 10, y: 0 },
      arcEnd: { x: 0, y: 10 },
      startAngleDeg: 0,
      endAngleDeg: 90,
      textPos: { x: 7, y: 7 },
      text: "90°",
    };
    expect(dimensionGraphics(d).arcs).toEqual([{ center: O, radius: 10, startDeg: 0, endDeg: 90 }]);
    const { paths } = dimensionPaths(d, 0.05);
    expect(paths).toHaveLength(1);
    expect(paths[0].points.length).toBeGreaterThan(4);
  });
});
