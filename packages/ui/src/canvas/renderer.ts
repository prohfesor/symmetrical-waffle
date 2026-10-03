import { arcPoints, dimensionGraphics, entityPaths, Label, Path, ResolvedDrawing, Vec2 } from "@wafflecad/core";
import type { Selection, Viewport } from "../state/reducer.js";
import { CanvasSize, worldToScreen } from "./transform.js";

const COLORS = {
  background: "#ffffff",
  grid: "#e6e8ec",
  axis: "#c3c9d3",
  entity: "#1f2430",
  dimension: "#5b6b9c",
  dimensionText: "#3a4a7a",
  accent: "#1a73e8",
  snap: "#ff7a1a",
  mirrorAxis: "#8a5cf5",
};

/** How far (on screen) a flattened curve may stray from the true one. */
const CURVE_TOLERANCE_PX = 0.25;

function niceGridStep(zoom: number): number {
  const targetPx = 60;
  const raw = targetPx / zoom;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  const step = residual < 1.5 ? 1 : residual < 3.5 ? 2 : residual < 7.5 ? 5 : 10;
  return step * magnitude;
}

function drawGrid(ctx: CanvasRenderingContext2D, size: CanvasSize, vp: Viewport): void {
  const step = niceGridStep(vp.zoom);
  const worldLeft = vp.centerX - size.width / 2 / vp.zoom;
  const worldRight = vp.centerX + size.width / 2 / vp.zoom;
  const worldTop = vp.centerY + size.height / 2 / vp.zoom;
  const worldBottom = vp.centerY - size.height / 2 / vp.zoom;

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(worldLeft / step) * step; x <= worldRight; x += step) {
    const sx = Math.round(worldToScreen({ x, y: 0 }, vp, size).x) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, size.height);
  }
  for (let y = Math.floor(worldBottom / step) * step; y <= worldTop; y += step) {
    const sy = Math.round(worldToScreen({ x: 0, y }, vp, size).y) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(size.width, sy);
  }
  ctx.stroke();

  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const origin = worldToScreen({ x: 0, y: 0 }, vp, size);
  ctx.moveTo(0, origin.y);
  ctx.lineTo(size.width, origin.y);
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, size.height);
  ctx.stroke();
}

function strokePath(ctx: CanvasRenderingContext2D, path: Path, vp: Viewport, size: CanvasSize): void {
  if (path.points.length === 0) return;
  ctx.beginPath();
  path.points.forEach((p, i) => {
    const s = worldToScreen(p, vp, size);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  if (path.closed) ctx.closePath();
  ctx.stroke();
}

function strokeLine(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, vp: Viewport, size: CanvasSize): void {
  strokePath(ctx, { points: [a, b], closed: false }, vp, size);
}

function drawLabel(ctx: CanvasRenderingContext2D, label: Label, vp: Viewport, size: CanvasSize): void {
  const s = worldToScreen(label.position, vp, size);
  ctx.fillText(label.text, s.x, s.y - 6);
}

/** Mirror axes: long dash-dot construction lines (never exported or printed), with a handle at each defining point. */
function drawAxes(ctx: CanvasRenderingContext2D, drawing: ResolvedDrawing, selection: Selection, vp: Viewport, size: CanvasSize): void {
  const reach = (size.width + size.height) / vp.zoom; // far enough to leave the screen in both directions
  for (const axis of drawing.axes) {
    const length = Math.hypot(axis.p2.x - axis.p1.x, axis.p2.y - axis.p1.y);
    const ux = (axis.p2.x - axis.p1.x) / length;
    const uy = (axis.p2.y - axis.p1.y) / length;
    const selected = selection?.kind === "entity" && selection.id === axis.id;
    ctx.strokeStyle = selected ? COLORS.accent : COLORS.mirrorAxis;
    ctx.lineWidth = selected ? 1.8 : 1;
    ctx.setLineDash([10, 3, 2, 3]);
    strokeLine(
      ctx,
      { x: axis.p1.x - ux * reach, y: axis.p1.y - uy * reach },
      { x: axis.p1.x + ux * reach, y: axis.p1.y + uy * reach },
      vp,
      size,
    );
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    for (const p of [axis.p1, axis.p2]) {
      const s = worldToScreen(p, vp, size);
      ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
    }
  }
}

function drawDrawing(
  ctx: CanvasRenderingContext2D,
  drawing: ResolvedDrawing,
  selection: Selection,
  picked: string[],
  vp: Viewport,
  size: CanvasSize,
): void {
  const tolerance = CURVE_TOLERANCE_PX / vp.zoom;

  drawAxes(ctx, drawing, selection, vp, size);
  for (const e of drawing.entities) {
    // Selecting a mirror highlights all of its copies.
    const selected = selection?.kind === "entity" && (selection.id === e.id || selection.id === e.derivedFrom);
    const isPicked = picked.includes(e.id) || (e.derivedFrom !== undefined && picked.includes(e.derivedFrom));
    ctx.strokeStyle = selected ? COLORS.accent : isPicked ? COLORS.mirrorAxis : COLORS.entity;
    ctx.lineWidth = selected || isPicked ? 2.4 : 1.6;
    for (const path of entityPaths(e, tolerance)) strokePath(ctx, path, vp, size);
  }

  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const d of drawing.dimensions) {
    const selected = selection?.kind === "dimension" && selection.id === d.id;
    ctx.strokeStyle = selected ? COLORS.accent : COLORS.dimension;
    ctx.fillStyle = selected ? COLORS.accent : COLORS.dimensionText;
    ctx.lineWidth = selected ? 1.6 : 1;
    const { lines, arcs, label } = dimensionGraphics(d);
    for (const [a, b] of lines) strokeLine(ctx, a, b, vp, size);
    for (const arc of arcs) {
      strokePath(ctx, { points: arcPoints(arc.center, arc.radius, arc.startDeg, arc.endDeg, tolerance), closed: false }, vp, size);
    }
    drawLabel(ctx, label, vp, size);
  }
}

export interface RenderOptions {
  drawing: ResolvedDrawing;
  selection: Selection;
  /** Entities chosen by the mirror tool so far (highlighted). */
  pickedIds: string[];
  pendingPoints: Vec2[];
  hoverWorld: Vec2 | null;
  snapWorld: Vec2 | null;
}

export function renderScene(ctx: CanvasRenderingContext2D, size: CanvasSize, vp: Viewport, opts: RenderOptions): void {
  ctx.save();
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, size.width, size.height);

  drawGrid(ctx, size, vp);
  drawDrawing(ctx, opts.drawing, opts.selection, opts.pickedIds, vp, size);

  // In-progress tool preview: a rubber-band line from the last click to the cursor.
  const last = opts.pendingPoints[opts.pendingPoints.length - 1];
  if (last && opts.hoverWorld) {
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    strokeLine(ctx, last, opts.hoverWorld, vp, size);
    ctx.setLineDash([]);
  }
  ctx.fillStyle = COLORS.accent;
  for (const p of opts.pendingPoints) {
    const s = worldToScreen(p, vp, size);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (opts.snapWorld) {
    const s = worldToScreen(opts.snapWorld, vp, size);
    ctx.strokeStyle = COLORS.snap;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
