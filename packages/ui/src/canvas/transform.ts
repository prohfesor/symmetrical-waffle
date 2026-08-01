import { Vec2 } from "@pcad/core";
import { Viewport } from "../state/store.js";

export interface CanvasSize {
  width: number;
  height: number;
}

export function worldToScreen(p: Vec2, vp: Viewport, size: CanvasSize): Vec2 {
  return {
    x: size.width / 2 + (p.x - vp.centerX) * vp.zoom,
    y: size.height / 2 - (p.y - vp.centerY) * vp.zoom,
  };
}

export function screenToWorld(p: Vec2, vp: Viewport, size: CanvasSize): Vec2 {
  return {
    x: vp.centerX + (p.x - size.width / 2) / vp.zoom,
    y: vp.centerY - (p.y - size.height / 2) / vp.zoom,
  };
}
