import { describe, expect, it } from "vitest";
import { exportDxf } from "../dxf/writer.js";
import { reflectPoint } from "../math.js";
import { resolveFullDocument } from "./document.js";
import { createEmptyDocument, Entity, makeRef } from "./types.js";

const free = (x: number | string, y: number | string) => ({ kind: "free" as const, x, y });
const line = (id: string, x1: number, y1: number, x2: number, y2: number): Entity => ({ id, kind: "line", mode: "twoPoint", p1: free(x1, y1), p2: free(x2, y2) });
const verticalAxis = (x: number | string) => ({ p1: free(x, 0), p2: free(x, 1) });

function resolve(entities: Entity[], params = "") {
  return resolveFullDocument({ ...createEmptyDocument(), entities }, params).drawing;
}
const find = (d: ReturnType<typeof resolve>, id: string) => d.entities.find((e) => e.id === id);

describe("reflectPoint", () => {
  it("reflects across the axes and across an oblique line", () => {
    expect(reflectPoint({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toEqual({ x: -3, y: 4 });
    const p = reflectPoint({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(-4);
    const q = reflectPoint({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }); // across y = x
    expect(q.x).toBeCloseTo(0);
    expect(q.y).toBeCloseTo(1);
  });
});

describe("mirror entity", () => {
  it("adds mirrored copies named <mirror>.<source>, keeping the originals", () => {
    const d = resolve([line("l1", 10, 0, 30, 5), { id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["l1"] }]);
    expect(d.issues).toEqual([]);
    expect(d.entities.map((e) => e.id)).toEqual(["l1", "m1.l1"]);
    const copy = find(d, "m1.l1");
    expect(copy).toMatchObject({ kind: "line", derivedFrom: "m1", p1: { x: -10, y: 0 }, p2: { x: -30, y: 5 }, length: expect.closeTo(Math.hypot(20, 5)) });
    expect(find(d, "l1")).not.toHaveProperty("derivedFrom");
  });

  it("is driven by parameters: the axis moves and the copy follows", () => {
    const entities: Entity[] = [line("l1", 10, 0, 30, 0), { id: "m1", kind: "mirror", axis: verticalAxis("=w / 2"), sources: ["l1"] }];
    const at = (w: number) => (find(resolve(entities, `w = ${w}`), "m1.l1") as { p1: { x: number } }).p1.x;
    expect(at(0)).toBeCloseTo(-10);
    expect(at(100)).toBeCloseTo(90); // axis at x=50: 10 -> 90
  });

  it("follows changes to the source parameters too", () => {
    const entities: Entity[] = [
      { id: "c1", kind: "circle", center: free("=d", 0), radius: 2 },
      { id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["c1"] },
    ];
    expect(find(resolve(entities, "d = 7"), "m1.c1")).toMatchObject({ kind: "circle", center: { x: -7, y: 0 }, radius: 2 });
  });

  it("mirrors an arc counter-clockwise, swapping its start and end", () => {
    // Quarter arc 0 -> 90 deg around the origin, mirrored across the Y axis, is the arc 90 -> 180.
    const d = resolve([
      { id: "a1", kind: "arc", center: free(0, 0), radius: 10, startAngle: 0, endAngle: 90 },
      { id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["a1"] },
    ]);
    const arc = find(d, "m1.a1") as { startAngleDeg: number; endAngleDeg: number; startPoint: { x: number; y: number }; endPoint: { x: number; y: number } };
    expect(arc.startAngleDeg).toBeCloseTo(90);
    expect(arc.endAngleDeg).toBeCloseTo(180);
    expect(arc.startPoint.y).toBeCloseTo(10);
    expect(arc.endPoint.x).toBeCloseTo(-10);
  });

  it("keeps a wrapping arc's sweep (350 -> 10 deg) across a horizontal axis", () => {
    const d = resolve([
      { id: "a1", kind: "arc", center: free(0, 0), radius: 10, startAngle: 350, endAngle: 10 },
      { id: "m1", kind: "mirror", axis: { p1: free(0, 0), p2: free(1, 0) }, sources: ["a1"] },
    ]);
    const arc = find(d, "m1.a1") as { startAngleDeg: number; endAngleDeg: number };
    expect(arc.endAngleDeg - arc.startAngleDeg).toBeCloseTo(20);
    expect(((arc.startAngleDeg % 360) + 360) % 360).toBeCloseTo(350); // symmetric about the X axis
  });

  it("mirrors polylines and rectangles", () => {
    const d = resolve([
      { id: "p1", kind: "polyline", start: free(1, 1), segments: [{ kind: "relative", dx: 4, dy: 0 }, { kind: "relative", dx: 0, dy: 3 }], closed: false },
      { id: "r1", kind: "rectangle", corner: free(2, 0), width: 4, height: 2 },
      { id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["p1", "r1"] },
    ]);
    expect(find(d, "m1.p1")).toMatchObject({ kind: "polyline", points: [{ x: -1, y: 1 }, { x: -5, y: 1 }, { x: -5, y: 4 }] });
    const rect = find(d, "m1.r1") as { corners: { x: number }[]; width: number; height: number };
    expect(rect.corners.map((c) => c.x)).toEqual([-2, -6, -6, -2]);
    expect([rect.width, rect.height]).toEqual([4, 2]);
  });

  it("can mirror across an existing line by anchoring the axis to its points", () => {
    const d = resolve([
      line("axis", 0, 0, 0, 10),
      line("l1", 5, 2, 8, 2),
      { id: "m1", kind: "mirror", axis: { p1: { kind: "anchor", ref: makeRef("axis", "p1") }, p2: { kind: "anchor", ref: makeRef("axis", "p2") } }, sources: ["l1"] },
    ]);
    expect(find(d, "m1.l1")).toMatchObject({ p1: { x: -5, y: 2 }, p2: { x: -8, y: 2 } });
  });

  it("can be declared before its sources and still resolves", () => {
    const d = resolve([{ id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["l1"] }, line("l1", 1, 1, 2, 2)]);
    expect(d.issues).toEqual([]);
    expect(d.entities.map((e) => e.id).sort()).toEqual(["l1", "m1.l1"]);
  });

  it("exposes mirrored points for anchoring, matching the source's point names", () => {
    const d = resolve([
      line("l1", 10, 0, 30, 5),
      { id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["l1"] },
      { id: "c1", kind: "circle", center: { kind: "anchor", ref: makeRef("m1.l1", "p2") }, radius: 1 },
    ]);
    expect(d.issues).toEqual([]);
    expect(find(d, "c1")).toMatchObject({ center: { x: -30, y: 5 } });
    expect(d.namedPoints["m1"]).toEqual({ a1: { x: 0, y: 0 }, a2: { x: 0, y: 1 } });
  });

  it("supports mirrors of mirrors (symmetry across two axes)", () => {
    const d = resolve([
      line("l1", 10, 5, 20, 5),
      { id: "mx", kind: "mirror", axis: verticalAxis(0), sources: ["l1"] },
      { id: "my", kind: "mirror", axis: { p1: free(0, 0), p2: free(1, 0) }, sources: ["l1", "mx"] },
    ]);
    expect(d.issues).toEqual([]);
    expect(d.entities.map((e) => e.id)).toEqual(["l1", "mx.l1", "my.l1", "my.mx.l1"]);
    expect(find(d, "my.mx.l1")).toMatchObject({ p1: { x: -10, y: -5 }, p2: { x: -20, y: -5 } });
  });

  it("emits the copies at the mirror's place in the drawing order", () => {
    const d = resolve([line("a", 0, 0, 1, 0), { id: "m", kind: "mirror", axis: verticalAxis(5), sources: ["a"] }, line("b", 0, 1, 1, 1)]);
    expect(d.entities.map((e) => e.id)).toEqual(["a", "m.a", "b"]);
  });

  it("reports the axis, for display only", () => {
    const d = resolve([{ id: "m", kind: "mirror", axis: verticalAxis(5), sources: [] }]);
    expect(d.axes).toEqual([{ id: "m", p1: { x: 5, y: 0 }, p2: { x: 5, y: 1 } }]);
    expect(d.entities).toEqual([]);
    expect(d.bounds).toBeNull(); // the axis is a construction line, not geometry
  });

  it("extends the bounds to cover the copies", () => {
    const d = resolve([line("l1", 10, 0, 30, 5), { id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["l1"] }]);
    expect(d.bounds).toEqual({ min: { x: -30, y: 0 }, max: { x: 30, y: 5 } });
  });

  it("can be dimensioned like any entity", () => {
    const doc = {
      ...createEmptyDocument(),
      entities: [line("l1", 10, 0, 30, 0), { id: "m1", kind: "mirror" as const, axis: verticalAxis(0), sources: ["l1"] }],
      dimensions: [{ id: "d1", target: { kind: "lineLength" as const, entityId: "m1.l1" }, displayOffset: 3 }],
    };
    const { drawing } = resolveFullDocument(doc, "");
    expect(drawing.issues).toEqual([]);
    expect(drawing.dimensions[0]).toMatchObject({ value: 20 });
  });

  describe("problems are reported, not thrown", () => {
    it("a degenerate axis produces an issue and no copies", () => {
      const d = resolve([line("l1", 1, 1, 2, 2), { id: "m1", kind: "mirror", axis: { p1: free(3, 3), p2: free(3, 3) }, sources: ["l1"] }]);
      expect(d.issues[0]).toMatchObject({ entityId: "m1", message: expect.stringMatching(/axis/) });
      expect(d.entities.map((e) => e.id)).toEqual(["l1"]);
    });

    it("a missing source is reported but the others are still mirrored", () => {
      const d = resolve([line("l1", 1, 1, 2, 2), { id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["ghost", "l1"] }]);
      expect(d.issues).toEqual([{ entityId: "m1", message: expect.stringMatching(/'ghost'/) }]);
      expect(d.entities.map((e) => e.id)).toEqual(["l1", "m1.l1"]);
    });

    it("a mirror that lists itself is a cycle, not an infinite loop", () => {
      const d = resolve([{ id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["m1"] }]);
      expect(d.issues.some((i) => /circular/.test(i.message))).toBe(true);
    });

    it("a bad axis formula is reported against the mirror", () => {
      const d = resolve([line("l1", 1, 1, 2, 2), { id: "m1", kind: "mirror", axis: verticalAxis("=nope"), sources: ["l1"] }]);
      expect(d.issues[0].entityId).toBe("m1");
    });
  });

  it("is exported to DXF as ordinary geometry", () => {
    const { drawing } = resolveFullDocument({ ...createEmptyDocument(), entities: [line("l1", 10, 0, 30, 5), { id: "m1", kind: "mirror", axis: verticalAxis(0), sources: ["l1"] }] }, "");
    const dxf = exportDxf(drawing);
    expect(dxf.match(/\r\nLINE\r\n/g)).toHaveLength(2);
    expect(dxf).toContain("-30");
  });
});
