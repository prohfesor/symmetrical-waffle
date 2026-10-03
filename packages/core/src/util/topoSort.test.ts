import { describe, expect, it } from "vitest";
import { topoSort } from "./topoSort.js";

interface Node {
  id: string;
  deps: string[];
}
const sort = (nodes: Node[]) =>
  topoSort(
    nodes,
    (n) => n.id,
    (n) => n.deps,
  );

describe("topoSort", () => {
  it("puts dependencies before dependents", () => {
    const { order, cyclic } = sort([
      { id: "c", deps: ["b"] },
      { id: "b", deps: ["a"] },
      { id: "a", deps: [] },
    ]);
    expect(order.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(cyclic).toEqual([]);
  });

  it("keeps independent items in input order (deterministic)", () => {
    const { order } = sort([
      { id: "z", deps: [] },
      { id: "m", deps: [] },
      { id: "a", deps: [] },
    ]);
    expect(order.map((n) => n.id)).toEqual(["z", "m", "a"]);
  });

  it("reports everything on or downstream of a cycle, and still orders the rest", () => {
    const { order, cyclic } = sort([
      { id: "ok", deps: [] },
      { id: "x", deps: ["y"] },
      { id: "y", deps: ["x"] },
      { id: "downstream", deps: ["x"] },
    ]);
    expect(order.map((n) => n.id)).toEqual(["ok"]);
    expect(cyclic.map((n) => n.id).sort()).toEqual(["downstream", "x", "y"]);
  });

  it("ignores dependencies on unknown keys and duplicate dependency entries", () => {
    const { order, cyclic } = sort([
      { id: "a", deps: ["missing", "b", "b"] },
      { id: "b", deps: [] },
    ]);
    expect(order.map((n) => n.id)).toEqual(["b", "a"]);
    expect(cyclic).toEqual([]);
  });

  it("flags a self-dependency as a cycle", () => {
    expect(sort([{ id: "a", deps: ["a"] }]).cyclic).toHaveLength(1);
  });

  it("is linear enough for large inputs", () => {
    const nodes: Node[] = Array.from({ length: 20000 }, (_, i) => ({ id: `n${i}`, deps: i === 0 ? [] : [`n${i - 1}`] }));
    const started = Date.now();
    expect(sort(nodes).order).toHaveLength(20000);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
