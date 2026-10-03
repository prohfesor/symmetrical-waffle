import { Entity } from "@pcad/core";
import { describe, expect, it } from "vitest";
import { shortcutLetter } from "../state/useShortcuts.js";
import { isDraggableFreePoint, withMovedPoint } from "./pointAccess.js";
import { TOOL_SHORTCUTS, TOOLS } from "./types.js";

describe("tool shortcuts", () => {
  it("gives every tool a distinct single-letter shortcut", () => {
    const letters = TOOLS.map((t) => t.shortcut);
    expect(new Set(letters).size).toBe(letters.length);
    letters.forEach((l) => expect(l).toMatch(/^[A-Z]$/));
    expect(TOOL_SHORTCUTS.S).toBe("select");
  });

  it("reads the physical key, so shortcuts work on non-Latin keyboard layouts", () => {
    // On a Ukrainian layout the 'L' key produces "д" -- event.key would be useless, event.code is not.
    expect(shortcutLetter({ code: "KeyL" })).toBe("L");
    expect(shortcutLetter({ code: "Digit1" })).toBeNull();
    expect(shortcutLetter({ code: "Space" })).toBeNull();
  });
});

describe("point dragging", () => {
  const line: Entity = { id: "l", kind: "line", mode: "twoPoint", p1: { kind: "free", x: 0, y: 0 }, p2: { kind: "anchor", ref: "x.p1" } };

  it("only free (non-anchored, non-formula) points can be dragged", () => {
    expect(isDraggableFreePoint(line, "p1")).toBe(true);
    expect(isDraggableFreePoint(line, "p2")).toBe(false); // anchored
    expect(isDraggableFreePoint(line, "mid")).toBe(false);
    const formula: Entity = { ...line, p1: { kind: "free", x: "=w", y: 0 } };
    expect(isDraggableFreePoint(formula, "p1")).toBe(false);
  });

  it("moving a point rewrites it as a rounded free point and leaves the rest alone", () => {
    const moved = withMovedPoint(line, "p1", 1.23456, 2) as typeof line;
    expect(moved.p1).toEqual({ kind: "free", x: 1.235, y: 2 });
    expect(moved.p2).toBe(line.p2);
    expect(withMovedPoint(line, "nope", 5, 5)).toBe(line);
  });
});
