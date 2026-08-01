import { Entity, generateId, ResolvedEntity, Vec2 } from "@pcad/core";
import React, { useEffect, useRef, useState } from "react";
import { useAppState, useDispatch } from "../state/store.js";
import { useResolvedDrawing } from "../state/useResolvedDrawing.js";
import { buildArc, buildCircle, buildLine, buildPolyline, buildRectangle, ClickPoint } from "../tools/build.js";
import { isDraggableFreePoint, withMovedPoint } from "../tools/pointAccess.js";
import { hitTestDimensions, hitTestEntities } from "./hitTest.js";
import { findSnapPoint, SnapResult } from "./snapping.js";
import { renderScene } from "./renderer.js";
import { CanvasSize, screenToWorld } from "./transform.js";

const SNAP_PX = 10;
const HIT_PX = 7;

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function signedOffset(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return (p.x - a.x) * nx + (p.y - a.y) * ny;
}

interface DragState {
  entityId: string;
  pointName: string;
}

interface DimTarget {
  entityId: string;
  kind: ResolvedEntity["kind"];
}

export function Canvas() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { drawing } = useResolvedDrawing();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 800, height: 600 });
  const [pendingClicks, setPendingClicks] = useState<ClickPoint[]>([]);
  const [hoverWorld, setHoverWorld] = useState<Vec2 | null>(null);
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const [panStart, setPanStart] = useState<{ screen: Vec2; center: Vec2 } | null>(null);
  const [dragPoint, setDragPoint] = useState<DragState | null>(null);
  const [dimTarget, setDimTarget] = useState<DimTarget | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setPendingClicks([]);
    setDimTarget(null);
  }, [state.tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, size, state.viewport, {
      drawing,
      selection: state.selection,
      pendingPoints: pendingClicks.map((c) => c.world),
      hoverWorld,
      snapWorld: snap?.point ?? null,
    });
  }, [size, state.viewport, drawing, state.selection, pendingClicks, hoverWorld, snap]);

  function eventWorld(e: React.PointerEvent | React.WheelEvent): Vec2 {
    const rect = canvasRef.current!.getBoundingClientRect();
    return screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, state.viewport, size);
  }

  function snapRadius(): number {
    return SNAP_PX / state.viewport.zoom;
  }
  function hitRadius(): number {
    return HIT_PX / state.viewport.zoom;
  }

  function finishEntity(entity: Entity) {
    dispatch({ type: "ADD_ENTITY", entity });
    setPendingClicks([]);
  }

  function handleSelectClick(w: Vec2, snapResult: SnapResult | null) {
    if (snapResult) {
      const entity = state.document.entities.find((en) => en.id === snapResult.entityId);
      if (entity && isDraggableFreePoint(entity, snapResult.pointName)) {
        setDragPoint({ entityId: entity.id, pointName: snapResult.pointName });
        return;
      }
    }
    const hitEntity = hitTestEntities(drawing, w, hitRadius());
    if (hitEntity) {
      dispatch({ type: "SET_SELECTION", selection: { kind: "entity", id: hitEntity.id } });
      return;
    }
    const hitDim = hitTestDimensions(drawing, w, hitRadius());
    if (hitDim) {
      dispatch({ type: "SET_SELECTION", selection: { kind: "dimension", id: hitDim.id } });
      return;
    }
    dispatch({ type: "SET_SELECTION", selection: null });
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const w = eventWorld(e);

    if (e.button === 1 || e.button === 2 || state.tool === "pan") {
      setPanStart({ screen: { x: e.clientX, y: e.clientY }, center: { x: state.viewport.centerX, y: state.viewport.centerY } });
      return;
    }
    if (e.button !== 0) return;

    const snapResult = findSnapPoint(drawing, w, snapRadius());
    const effective = snapResult ? snapResult.point : w;
    const cp: ClickPoint = { world: effective, snapRef: snapResult?.ref ?? null };

    switch (state.tool) {
      case "select":
        handleSelectClick(w, snapResult);
        return;
      case "line": {
        const next = [...pendingClicks, cp];
        if (next.length >= 2) finishEntity(buildLine(next[0], next[1]));
        else setPendingClicks(next);
        return;
      }
      case "circle": {
        if (pendingClicks.length === 0) setPendingClicks([cp]);
        else finishEntity(buildCircle(pendingClicks[0], w));
        return;
      }
      case "rectangle": {
        if (pendingClicks.length === 0) setPendingClicks([cp]);
        else finishEntity(buildRectangle(pendingClicks[0], w));
        return;
      }
      case "arc": {
        if (pendingClicks.length === 0) setPendingClicks([cp]);
        else if (pendingClicks.length === 1) setPendingClicks([...pendingClicks, { world: w, snapRef: null }]);
        else finishEntity(buildArc(pendingClicks[0], pendingClicks[1].world, w));
        return;
      }
      case "polyline": {
        setPendingClicks([...pendingClicks, cp]);
        return;
      }
      case "dim-linear": {
        if (!dimTarget) {
          const hit = hitTestEntities(drawing, w, hitRadius());
          if (hit && hit.kind === "line") setDimTarget({ entityId: hit.id, kind: "line" });
          return;
        }
        const line = drawing.entities.find((en) => en.id === dimTarget.entityId);
        if (line && line.kind === "line") {
          const offset = signedOffset(line.p1, line.p2, w);
          dispatch({
            type: "ADD_DIMENSION",
            dimension: { id: generateId("dim"), target: { kind: "lineLength", entityId: line.id }, displayOffset: round(offset) },
          });
        }
        setDimTarget(null);
        return;
      }
      case "dim-radius": {
        if (!dimTarget) {
          const hit = hitTestEntities(drawing, w, hitRadius());
          if (hit && (hit.kind === "circle" || hit.kind === "arc")) setDimTarget({ entityId: hit.id, kind: hit.kind });
          return;
        }
        const ent = drawing.entities.find((en) => en.id === dimTarget.entityId);
        if (ent && (ent.kind === "circle" || ent.kind === "arc")) {
          const offset = dist(ent.center, w) - ent.radius;
          dispatch({
            type: "ADD_DIMENSION",
            dimension: {
              id: generateId("dim"),
              target: { kind: ent.kind === "circle" ? "circleRadius" : "arcRadius", entityId: ent.id },
              displayOffset: round(offset),
            },
          });
        }
        setDimTarget(null);
        return;
      }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const w = eventWorld(e);
    setHoverWorld(w);
    setSnap(findSnapPoint(drawing, w, snapRadius()));

    if (panStart) {
      const dxScreen = e.clientX - panStart.screen.x;
      const dyScreen = e.clientY - panStart.screen.y;
      dispatch({
        type: "SET_VIEWPORT",
        viewport: { centerX: panStart.center.x - dxScreen / state.viewport.zoom, centerY: panStart.center.y + dyScreen / state.viewport.zoom },
      });
      return;
    }
    if (dragPoint) {
      const entity = state.document.entities.find((en) => en.id === dragPoint.entityId);
      if (entity) {
        const snapResult = findSnapPoint(drawing, w, snapRadius());
        const target = snapResult && snapResult.entityId !== dragPoint.entityId ? snapResult.point : w;
        dispatch({ type: "UPDATE_ENTITY", id: entity.id, entity: withMovedPoint(entity, dragPoint.pointName, target.x, target.y) });
      }
    }
  }

  function onPointerUp() {
    setPanStart(null);
    setDragPoint(null);
  }

  function finishPolyline(closed: boolean) {
    if (pendingClicks.length >= 2) finishEntity(buildPolyline(pendingClicks, closed));
  }

  function onDoubleClick() {
    if (state.tool === "polyline") finishPolyline(false);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const w = eventWorld(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(400, Math.max(0.05, state.viewport.zoom * factor));
    // Keep the world point under the cursor fixed on screen while zooming.
    const rect = canvasRef.current!.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const newCenter = {
      x: w.x - (screen.x - size.width / 2) / newZoom,
      y: w.y + (screen.y - size.height / 2) / newZoom,
    };
    dispatch({ type: "SET_VIEWPORT", viewport: { zoom: newZoom, centerX: newCenter.x, centerY: newCenter.y } });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        setPendingClicks([]);
        setDimTarget(null);
      } else if (e.key === "Enter") {
        finishPolyline(false);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selection?.kind === "entity") dispatch({ type: "REMOVE_ENTITY", id: state.selection.id });
        else if (state.selection?.kind === "dimension") dispatch({ type: "REMOVE_DIMENSION", id: state.selection.id });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tool, pendingClicks, state.selection]);

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
