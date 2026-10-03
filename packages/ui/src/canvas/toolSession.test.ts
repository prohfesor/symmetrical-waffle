import { ResolvedDrawing, ResolvedEntity } from "@wafflecad/core";
import { describe, expect, it } from "vitest";
import { ClickPoint } from "../tools/build.js";
import { advanceTool, angleSnapReference, EMPTY_SESSION, finishActiveTool, finishPolyline, ToolSession } from "./toolSession.js";

const at = (x: number, y: number, snapRef: string | null = null): ClickPoint => ({ world: { x, y }, snapRef });
const emptyDrawing = { entities: [], dimensions: [], namedPoints: {}, issues: [], bounds: null } as unknown as ResolvedDrawing;
const drawingOf = (...entities: ResolvedEntity[]) => ({ ...emptyDrawing, entities }) as ResolvedDrawing;

/** Plays a series of clicks into a tool and returns the final step. */
function play(tool: Parameters<typeof advanceTool>[0], clicks: ClickPoint[], drawing = emptyDrawing, start: ToolSession = EMPTY_SESSION) {
  let step = { session: start } as ReturnType<typeof advanceTool>;
  for (const c of clicks) step = advanceTool(tool, step.session, c, c.world, drawing, 1);
  return step;
}

describe("two-point shapes", () => {
  it("a line needs two clicks and anchors to snapped points", () => {
    const first = play("line", [at(0, 0, "rect1.corner0")]);
    expect(first.commit).toBeUndefined();
    expect(first.session.clicks).toHaveLength(1);

    const { commit, session } = play("line", [at(0, 0, "rect1.corner0"), at(10, 5)]);
    expect(session).toEqual(EMPTY_SESSION);
    expect(commit).toMatchObject({
      kind: "entity",
      entity: { kind: "line", p1: { kind: "anchor", ref: "rect1.corner0" }, p2: { kind: "free", x: 10, y: 5 } },
    });
  });

  it("a circle is centre + radius point", () => {
    const { commit } = play("circle", [at(5, 5), at(8, 9)]);
    expect(commit).toMatchObject({ entity: { kind: "circle", radius: 5 } });
  });

  it("a rectangle works whichever corner is clicked first", () => {
    const { commit } = play("rectangle", [at(10, 8), at(2, 3)]);
    expect(commit).toMatchObject({ entity: { kind: "rectangle", corner: { kind: "free", x: 2, y: 3 }, width: 8, height: 5 } });
  });
});

describe("arc", () => {
  it("takes centre, start, end, and only the centre may anchor", () => {
    const afterStart = play("arc", [at(0, 0, "c1.center"), at(10, 0, "line1.p1")]);
    expect(afterStart.session.clicks[1].snapRef).toBeNull();
    const { commit } = play("arc", [at(0, 0, "c1.center"), at(10, 0), at(0, 10)]);
    expect(commit).toMatchObject({
      entity: { kind: "arc", center: { kind: "anchor", ref: "c1.center" }, radius: 10, startAngle: 0, endAngle: 90 },
    });
  });

  it("an end angle 'before' the start wraps counter-clockwise", () => {
    const { commit } = play("arc", [at(0, 0), at(0, 10), at(10, 0)]); // 90 -> 0
    expect(commit).toMatchObject({ entity: { startAngle: 90, endAngle: 360 } });
  });
});

describe("polyline", () => {
  it("collects vertices until finished, then stores relative segments", () => {
    const building = play("polyline", [at(0, 0), at(10, 0), at(10, 10)]);
    expect(building.commit).toBeUndefined();
    const { commit, session } = finishPolyline(building.session);
    expect(session).toEqual(EMPTY_SESSION);
    expect(commit).toMatchObject({
      entity: {
        kind: "polyline",
        closed: false,
        start: { kind: "free", x: 0, y: 0 },
        segments: [
          { kind: "relative", dx: 10, dy: 0 },
          { kind: "relative", dx: 0, dy: 10 },
        ],
      },
    });
  });

  it("can be closed", () => {
    const { commit } = finishPolyline(play("polyline", [at(0, 0), at(5, 0), at(5, 5)]).session, true);
    expect(commit).toMatchObject({ entity: { closed: true } });
  });

  it("REGRESSION: a double-click (two pointer-downs at one spot) doesn't add a zero-length segment", () => {
    const { session } = play("polyline", [at(0, 0), at(10, 0), at(10, 10), at(10, 10)]);
    expect(session.clicks).toHaveLength(3);
    const { commit } = finishPolyline({ clicks: [...session.clicks, at(10, 10)], dimTarget: null, picked: [], axisStage: false });
    expect(commit).toMatchObject({ entity: { segments: [{}, {}] } });
  });

  it("doesn't finish with fewer than two distinct points", () => {
    expect(finishPolyline(play("polyline", [at(1, 1)]).session).commit).toBeUndefined();
    expect(finishPolyline({ clicks: [at(1, 1), at(1, 1)], dimTarget: null, picked: [], axisStage: false }).commit).toBeUndefined();
  });

  it("accumulates no rounding drift in the segments", () => {
    // Each raw step (0.0004) rounds to 0, but the chain must still end where the last vertex (0.0012 -> 0.001) is.
    const pts = [at(0, 0), at(0.0004, 0), at(0.0008, 0), at(0.0012, 0)];
    const { commit } = finishPolyline(play("polyline", pts).session);
    const dx = (commit as { entity: { segments: { dx: number }[] } }).entity.segments.reduce((sum, s) => sum + s.dx, 0);
    expect(dx).toBeCloseTo(0.001, 10);
  });
});

describe("dimension tools", () => {
  const line = { id: "l1", kind: "line", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, length: 10, angleDeg: 0 } as ResolvedEntity;
  const circle = { id: "c1", kind: "circle", center: { x: 0, y: 0 }, radius: 5 } as ResolvedEntity;

  it("a linear dimension: pick a line, then place it (signed offset)", () => {
    const picked = advanceTool("dim-linear", EMPTY_SESSION, at(5, 0), { x: 5, y: 0.2 }, drawingOf(line), 1);
    expect(picked.session.dimTarget).toBe("l1");
    expect(picked.commit).toBeUndefined();

    const placed = advanceTool("dim-linear", picked.session, at(5, -9), { x: 5, y: -8 }, drawingOf(line), 1);
    expect(placed.session).toEqual(EMPTY_SESSION);
    expect(placed.commit).toMatchObject({
      kind: "dimension",
      dimension: { target: { kind: "lineLength", entityId: "l1" }, displayOffset: -8 },
    });
  });

  it("uses the unsnapped cursor to pick, so grid snapping can't make you miss", () => {
    const step = advanceTool("dim-linear", EMPTY_SESSION, at(5, 3) /* snapped far away */, { x: 5, y: 0.1 }, drawingOf(line), 1);
    expect(step.session.dimTarget).toBe("l1");
  });

  it("ignores clicks on empty space and on the wrong kind of entity", () => {
    expect(advanceTool("dim-linear", EMPTY_SESSION, at(50, 50), { x: 50, y: 50 }, drawingOf(line), 1).session).toEqual(EMPTY_SESSION);
    expect(advanceTool("dim-linear", EMPTY_SESSION, at(5, 0), { x: 5, y: 0 }, drawingOf(circle), 1).session.dimTarget).toBeNull();
  });

  it("a radius dimension targets circles and arcs", () => {
    const picked = advanceTool("dim-radius", EMPTY_SESSION, at(5, 0), { x: 5, y: 0 }, drawingOf(circle), 1);
    const placed = advanceTool("dim-radius", picked.session, at(9, 0), { x: 9, y: 0 }, drawingOf(circle), 1);
    expect(placed.commit).toMatchObject({ dimension: { target: { kind: "circleRadius", entityId: "c1" }, displayOffset: 4 } });
  });

  it("gives up cleanly if the picked entity vanished", () => {
    const step = advanceTool("dim-linear", { ...EMPTY_SESSION, dimTarget: "gone" }, at(0, 0), { x: 0, y: 0 }, drawingOf(line), 1);
    expect(step.session).toEqual(EMPTY_SESSION);
    expect(step.commit).toBeUndefined();
  });
});

describe("angleSnapReference", () => {
  const session = (...clicks: ClickPoint[]): ToolSession => ({ clicks, dimTarget: null, picked: [], axisStage: false });
  it("is null before the first click, and for tools without a direction", () => {
    expect(angleSnapReference("line", EMPTY_SESSION)).toBeNull();
    expect(angleSnapReference("circle", session(at(1, 1)))).toBeNull();
  });
  it("is a line's first point, an arc's centre, and a polyline's latest vertex", () => {
    expect(angleSnapReference("line", session(at(1, 1)))).toEqual({ x: 1, y: 1 });
    expect(angleSnapReference("arc", session(at(1, 1), at(5, 5)))).toEqual({ x: 1, y: 1 });
    expect(angleSnapReference("polyline", session(at(1, 1), at(5, 5)))).toEqual({ x: 5, y: 5 });
  });
});

it("select does nothing", () => {
  expect(advanceTool("select", EMPTY_SESSION, at(0, 0), { x: 0, y: 0 }, emptyDrawing, 1).session).toBe(EMPTY_SESSION);
});

describe("mirror tool", () => {
  const wire = (id: string, derivedFrom?: string) =>
    ({ id, kind: "line", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, length: 10, angleDeg: 0, derivedFrom }) as ResolvedEntity;
  const drawing = drawingOf(wire("l1"), { ...wire("m0.l2", "m0"), p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } } as ResolvedEntity);
  const click = (session: ToolSession, x: number, y: number, snapRef: string | null = null) =>
    advanceTool("mirror", session, at(x, y, snapRef), { x, y }, drawing, 1);

  it("picks entities by clicking, un-picks on a second click, and ignores empty space", () => {
    const step = click(EMPTY_SESSION, 5, 0);
    expect(step.session.picked).toEqual(["l1"]);
    expect(click(step.session, 50, 50).session.picked).toEqual(["l1"]);
    expect(click(step.session, 5, 0).session.picked).toEqual([]);
  });

  it("picking a mirrored copy picks its mirror, so symmetry can be stacked", () => {
    expect(click(EMPTY_SESSION, 5, 5).session.picked).toEqual(["m0"]);
  });

  it("Enter confirms the pick, but only when something is picked", () => {
    expect(finishActiveTool("mirror", EMPTY_SESSION).session.axisStage).toBe(false);
    const picked = click(EMPTY_SESSION, 5, 0).session;
    expect(finishActiveTool("mirror", picked).session.axisStage).toBe(true);
  });

  it("after confirming, clicks define the axis (anchoring to snapped points) and commit a mirror", () => {
    const staged = finishActiveTool("mirror", click(EMPTY_SESSION, 5, 0).session).session;
    const first = click(staged, 20, 0, "line9.p1");
    expect(first.commit).toBeUndefined();
    expect(first.session.clicks).toHaveLength(1);
    expect(angleSnapReference("mirror", first.session)).toEqual({ x: 20, y: 0 });

    const done = click(first.session, 20, 8);
    expect(done.session).toEqual(EMPTY_SESSION);
    expect(done.commit).toMatchObject({
      kind: "entity",
      entity: { kind: "mirror", sources: ["l1"], axis: { p1: { kind: "anchor", ref: "line9.p1" }, p2: { kind: "free", x: 20, y: 8 } } },
    });
  });

  it("clicking entities during the axis stage doesn't change the pick", () => {
    const staged = finishActiveTool("mirror", click(EMPTY_SESSION, 5, 0).session).session;
    expect(click(staged, 5, 0).session.picked).toEqual(["l1"]);
  });
});
