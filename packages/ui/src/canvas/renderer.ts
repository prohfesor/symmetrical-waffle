import { ResolvedDimension, ResolvedEntity, ResolvedDrawing, Vec2 } from "@pcad/core";
import { Selection, Viewport } from "../state/store.js";
import { CanvasSize, worldToScreen } from "./transform.js";

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

  ctx.strokeStyle = "#e6e8ec";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const startX = Math.floor(worldLeft / step) * step;
  for (let x = startX; x <= worldRight; x += step) {
    const s = worldToScreen({ x, y: 0 }, vp, size);
    ctx.moveTo(Math.round(s.x) + 0.5, 0);
    ctx.lineTo(Math.round(s.x) + 0.5, size.height);
  }
  const startY = Math.floor(worldBottom / step) * step;
  for (let y = startY; y <= worldTop; y += step) {
    const s = worldToScreen({ x: 0, y }, vp, size);
    ctx.moveTo(0, Math.round(s.y) + 0.5);
    ctx.lineTo(size.width, Math.round(s.y) + 0.5);
  }
  ctx.stroke();

  // Axes.
  ctx.strokeStyle = "#c3c9d3";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const origin = worldToScreen({ x: 0, y: 0 }, vp, size);
  ctx.moveTo(0, origin.y);
  ctx.lineTo(size.width, origin.y);
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, size.height);
  ctx.stroke();
}

function pathPoints(ctx: CanvasRenderingContext2D, pts: Vec2[], vp: Viewport, size: CanvasSize, closed: boolean): void {
  if (pts.length === 0) return;
  ctx.beginPath();
  const first = worldToScreen(pts[0], vp, size);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i], vp, size);
    ctx.lineTo(s.x, s.y);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
}

function arcPoints(center: Vec2, radius: number, startDeg: number, endDeg: number): Vec2[] {
  const span = endDeg - startDeg;
  const segments = Math.max(8, Math.round((96 * Math.abs(span)) / 360));
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = ((startDeg + (span * i) / segments) * Math.PI) / 180;
    pts.push({ x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) });
  }
  return pts;
}

function drawEntity(ctx: CanvasRenderingContext2D, e: ResolvedEntity, vp: Viewport, size: CanvasSize, selected: boolean): void {
  ctx.strokeStyle = selected ? "#1a73e8" : "#1f2430";
  ctx.lineWidth = selected ? 2.4 : 1.6;
  switch (e.kind) {
    case "line":
      pathPoints(ctx, [e.p1, e.p2], vp, size, false);
      break;
    case "circle":
      pathPoints(ctx, arcPoints(e.center, e.radius, 0, 360), vp, size, true);
      break;
    case "arc":
      pathPoints(ctx, arcPoints(e.center, e.radius, e.startAngleDeg, e.endAngleDeg), vp, size, false);
      break;
    case "polyline":
      pathPoints(ctx, e.points, vp, size, e.closed);
      break;
    case "rectangle":
      pathPoints(ctx, e.corners, vp, size, true);
      break;
  }
}

function drawDimension(ctx: CanvasRenderingContext2D, d: ResolvedDimension, vp: Viewport, size: CanvasSize, selected: boolean): void {
  ctx.strokeStyle = selected ? "#1a73e8" : "#5b6b9c";
  ctx.lineWidth = selected ? 1.6 : 1;
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = selected ? "#1a73e8" : "#3a4a7a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  switch (d.kind) {
    case "linear": {
      pathPoints(ctx, [d.p1, d.dimLineP1], vp, size, false);
      pathPoints(ctx, [d.p2, d.dimLineP2], vp, size, false);
      pathPoints(ctx, [d.dimLineP1, d.dimLineP2], vp, size, false);
      const t = worldToScreen(d.textPos, vp, size);
      ctx.fillText(d.text, t.x, t.y - 6);
      break;
    }
    case "radius":
    case "diameter": {
      pathPoints(ctx, [d.onCircle, d.leaderEnd], vp, size, false);
      const t = worldToScreen(d.textPos, vp, size);
      ctx.fillText(d.text, t.x, t.y - 6);
      break;
    }
    case "angular": {
      pathPoints(ctx, arcPoints(d.center, d.radius, d.startAngleDeg, d.endAngleDeg), vp, size, false);
      const t = worldToScreen(d.textPos, vp, size);
      ctx.fillText(d.text, t.x, t.y - 6);
      break;
    }
  }
}

export interface RenderOptions {
  drawing: ResolvedDrawing;
  selection: Selection;
  pendingPoints: Vec2[];
  hoverWorld: Vec2 | null;
  snapWorld: Vec2 | null;
}

export function renderScene(ctx: CanvasRenderingContext2D, size: CanvasSize, vp: Viewport, opts: RenderOptions): void {
  ctx.save();
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);

  drawGrid(ctx, size, vp);

  for (const e of opts.drawing.entities) {
    const selected = opts.selection?.kind === "entity" && opts.selection.id === e.id;
    drawEntity(ctx, e, vp, size, selected);
  }
  for (const d of opts.drawing.dimensions) {
    const selected = opts.selection?.kind === "dimension" && opts.selection.id === d.id;
    drawDimension(ctx, d, vp, size, selected);
  }

  // In-progress tool preview: rubber-band lines from last click to the cursor.
  if (opts.pendingPoints.length > 0 && opts.hoverWorld) {
    ctx.strokeStyle = "#1a73e8";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    pathPoints(ctx, [opts.pendingPoints[opts.pendingPoints.length - 1], opts.hoverWorld], vp, size, false);
    ctx.setLineDash([]);
  }
  for (const p of opts.pendingPoints) {
    const s = worldToScreen(p, vp, size);
    ctx.fillStyle = "#1a73e8";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (opts.snapWorld) {
    const s = worldToScreen(opts.snapWorld, vp, size);
    ctx.strokeStyle = "#ff7a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
