import { Vec2 } from "@pcad/core";
import type { Viewport } from "../state/reducer.js";

export interface CanvasSize {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 400;

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

/** The viewport after dragging the canvas by (dxScreen, dyScreen) pixels from `start`. */
export function panViewport(start: Viewport, dxScreen: number, dyScreen: number): Viewport {
  return { ...start, centerX: start.centerX - dxScreen / start.zoom, centerY: start.centerY + dyScreen / start.zoom };
}

/** The viewport after zooming by `factor`, keeping the world point under `screen` fixed on screen. */
export function zoomViewportAt(vp: Viewport, size: CanvasSize, screen: Vec2, factor: number): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * factor));
  const anchor = screenToWorld(screen, vp, size);
  return {
    zoom,
    centerX: anchor.x - (screen.x - size.width / 2) / zoom,
    centerY: anchor.y + (screen.y - size.height / 2) / zoom,
  };
}
