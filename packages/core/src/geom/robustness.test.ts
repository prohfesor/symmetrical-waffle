import { describe, expect, it } from "vitest";
import { computeBounds } from "./bounds.js";
import { resolveFullDocument } from "./document.js";
import { createEmptyDocument, DrawingDocument, makeRef } from "./types.js";

const resolve = (doc: Partial<DrawingDocument>, params = "") => resolveFullDocument({ ...createEmptyDocument(), ...doc }, params).drawing;
const at = (x: number, y: number) => ({ kind: "free" as const, x, y });

describe("bounds", () => {
  it("uses the exact extent of an arc, not its full circle", () => {
    // Quarter arc in the first quadrant: only the end points and nothing past 90 degrees.
    const d = resolve({ entities: [{ id: "a", kind: "arc", center: at(0, 0), radius: 10, startAngle: 0, endAngle: 90 }] });
    expect(d.bounds!.min.x).toBeCloseTo(0, 9);
    expect(d.bounds!.min.y).toBeCloseTo(0, 9);
    expect(d.bounds!.max.x).toBeCloseTo(10, 9);
    expect(d.bounds!.max.y).toBeCloseTo(10, 9);
  });

  it("includes an axis extreme the arc sweeps through, even across the 0/360 seam", () => {
    const d = resolve({ entities: [{ id: "a", kind: "arc", center: at(0, 0), radius: 10, startAngle: 350, endAngle: 10 }] });
    expect(d.bounds!.max.x).toBeCloseTo(10, 9); // passes through 0 degrees
    expect(d.bounds!.min.x).toBeGreaterThan(9); // but never reaches the left side
  });

  it("includes dimension annotations, which usually sit outside the part", () => {
    const d = resolve({
      entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 100, height: 50 }],
      dimensions: [
        { id: "d", target: { kind: "pointDistance", from: makeRef("r", "corner0"), to: makeRef("r", "corner1") }, displayOffset: -20 },
      ],
    });
    expect(d.bounds!.min.y).toBeCloseTo(-20, 9); // the dimension line, below the rectangle
  });

  it("is null for an empty drawing", () => {
    expect(computeBounds([], [])).toBeNull();
    expect(resolve({}).bounds).toBeNull();
  });
});

describe("resolution order and robustness", () => {
  it("returns entities in document order even when anchors force a different resolution order", () => {
    const d = resolve({
      entities: [
        { id: "z_circle", kind: "circle", center: { kind: "anchor", ref: makeRef("a_line", "p2") }, radius: 1 },
        { id: "a_line", kind: "line", mode: "twoPoint", p1: at(0, 0), p2: at(5, 5) },
      ],
    });
    expect(d.entities.map((e) => e.id)).toEqual(["z_circle", "a_line"]);
    expect(d.issues).toEqual([]);
  });

  it("reports duplicate entity ids and draws only the first", () => {
    const d = resolve({
      entities: [
        { id: "dup", kind: "circle", center: at(0, 0), radius: 1 },
        { id: "dup", kind: "circle", center: at(9, 9), radius: 2 },
      ],
    });
    expect(d.entities).toHaveLength(1);
    expect(d.entities[0]).toMatchObject({ kind: "circle", radius: 1 });
    expect(d.issues.some((i) => i.message.includes("used more than once"))).toBe(true);
  });

  it("omits an entity whose anchor can't be resolved instead of silently drawing it at the origin", () => {
    const d = resolve({ entities: [{ id: "c", kind: "circle", center: { kind: "anchor", ref: "ghost.center" }, radius: 3 }] });
    expect(d.entities).toHaveLength(0);
    expect(d.issues[0].message).toContain("ghost.center");
  });

  it("turns a formula that evaluates to NaN into an issue rather than NaN geometry", () => {
    const d = resolve({ entities: [{ id: "c", kind: "circle", center: at(0, 0), radius: "=sqrt(0 - 4)" }] });
    expect(d.entities).toHaveLength(0);
    expect(d.issues[0].message).toContain("not a finite number");
  });

  it("keeps resolving the rest when one entity is broken", () => {
    const d = resolve({
      entities: [
        { id: "bad", kind: "circle", center: at(0, 0), radius: "=nope" },
        { id: "good", kind: "circle", center: at(0, 0), radius: 5 },
      ],
    });
    expect(d.entities.map((e) => e.id)).toEqual(["good"]);
    expect(d.issues).toHaveLength(1);
  });
});

describe("dimensions", () => {
  it("formats values without a dangling decimal point", () => {
    const d = resolve({
      entities: [{ id: "r", kind: "rectangle", corner: at(0, 0), width: 120, height: 80 }],
      dimensions: [
        { id: "w", target: { kind: "pointDistance", from: makeRef("r", "corner0"), to: makeRef("r", "corner1") }, displayOffset: 5 },
      ],
    });
    expect(d.dimensions[0].text).toBe("120");
  });

  it("places an arc radius leader at the middle of the sweep, including across the 0/360 seam", () => {
    const d = resolve({
      entities: [{ id: "a", kind: "arc", center: at(0, 0), radius: 10, startAngle: 350, endAngle: 10 }],
      dimensions: [{ id: "d", target: { kind: "arcRadius", entityId: "a" }, displayOffset: 5 }],
    });
    const dim = d.dimensions[0];
    if (dim.kind !== "radius") throw new Error("expected a radius dimension");
    expect(dim.leaderEnd.x).toBeCloseTo(15, 6); // mid-sweep is 0 degrees (old code averaged to 180)
    expect(dim.leaderEnd.y).toBeCloseTo(0, 6);
  });

  it("reports a dimension whose target is missing", () => {
    const d = resolve({ dimensions: [{ id: "d", target: { kind: "lineLength", entityId: "gone" }, displayOffset: 1 }] });
    expect(d.dimensions).toHaveLength(0);
    expect(d.issues[0]).toMatchObject({ dimensionId: "d" });
  });

  it("measures the included angle of an arc that wraps", () => {
    const d = resolve({
      entities: [{ id: "a", kind: "arc", center: at(0, 0), radius: 10, startAngle: 350, endAngle: 10 }],
      dimensions: [{ id: "d", target: { kind: "arcAngle", entityId: "a" }, displayOffset: 2 }],
    });
    expect(d.dimensions[0]).toMatchObject({ kind: "angular", value: 20, text: "20°" });
  });
});
