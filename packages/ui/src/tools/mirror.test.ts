import { MirrorEntity } from "@pcad/core";
import { describe, expect, it } from "vitest";
import { withAxisDirection } from "./mirror.js";

const mirror = (p1: MirrorEntity["axis"]["p1"]): MirrorEntity => ({ id: "m", kind: "mirror", axis: { p1, p2: { kind: "free", x: 5, y: 5 } }, sources: ["a"] });

describe("withAxisDirection", () => {
  it("makes a numeric axis vertical or horizontal through p1", () => {
    const m = mirror({ kind: "free", x: 10, y: 4 });
    expect(withAxisDirection(m, "vertical", { x: 10, y: 4 }).axis.p2).toEqual({ kind: "free", x: 10, y: 5 });
    expect(withAxisDirection(m, "horizontal", { x: 10, y: 4 }).axis.p2).toEqual({ kind: "free", x: 11, y: 4 });
  });

  it("keeps formulas, so the axis stays parametric", () => {
    const m = mirror({ kind: "free", x: "=width / 2", y: 0 });
    expect(withAxisDirection(m, "vertical", { x: 50, y: 0 }).axis.p2).toEqual({ kind: "free", x: "=width / 2", y: 1 });
    expect(withAxisDirection(m, "horizontal", { x: 50, y: 0 }).axis.p2).toEqual({ kind: "free", x: "=(width / 2)+1", y: 0 });
  });

  it("uses the resolved position when p1 is anchored, and leaves p1 and the sources alone", () => {
    const m = mirror({ kind: "anchor", ref: "line1.p1" });
    const out = withAxisDirection(m, "vertical", { x: 7, y: 2 });
    expect(out.axis.p2).toEqual({ kind: "free", x: 7, y: 3 });
    expect(out.axis.p1).toBe(m.axis.p1);
    expect(out.sources).toBe(m.sources);
  });
});
