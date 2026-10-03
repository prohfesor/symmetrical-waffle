import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, panViewport, screenToWorld, worldToScreen, zoomViewportAt } from "./transform.js";

const size = { width: 800, height: 600 };
const vp = { centerX: 60, centerY: 40, zoom: 4 };

describe("viewport transforms", () => {
  it("maps the viewport center to the middle of the canvas, with Y pointing up", () => {
    expect(worldToScreen({ x: 60, y: 40 }, vp, size)).toEqual({ x: 400, y: 300 });
    expect(worldToScreen({ x: 60, y: 41 }, vp, size).y).toBeLessThan(300);
  });

  it("screenToWorld inverts worldToScreen", () => {
    const p = { x: 12.5, y: -7 };
    const back = screenToWorld(worldToScreen(p, vp, size), vp, size);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it("panning follows the pointer: dragging right moves the drawing right (the view center left)", () => {
    const panned = panViewport(vp, 40, 0);
    expect(panned.centerX).toBeCloseTo(60 - 10);
    expect(panViewport(vp, 0, 40).centerY).toBeCloseTo(40 + 10); // dragging down shows what's above
  });

  it("zooming keeps the world point under the cursor fixed", () => {
    const cursor = { x: 123, y: 456 };
    const before = screenToWorld(cursor, vp, size);
    for (const factor of [1.15, 1 / 1.15, 3]) {
      const zoomed = zoomViewportAt(vp, size, cursor, factor);
      const after = screenToWorld(cursor, zoomed, size);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    }
  });

  it("clamps the zoom, and the fixed point stays fixed even when clamped", () => {
    const cursor = { x: 50, y: 50 };
    const near = { ...vp, zoom: MAX_ZOOM - 1 };
    const zoomed = zoomViewportAt(near, size, cursor, 10);
    expect(zoomed.zoom).toBe(MAX_ZOOM);
    expect(zoomViewportAt({ ...vp, zoom: MIN_ZOOM * 1.01 }, size, cursor, 0.01).zoom).toBe(MIN_ZOOM);
    expect(screenToWorld(cursor, zoomed, size).x).toBeCloseTo(screenToWorld(cursor, near, size).x);
  });
});
