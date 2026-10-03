import { Vec2 } from "@pcad/core";
import React, { useEffect, useRef, useState } from "react";
import type { Viewport } from "../state/reducer.js";
import { useAppState, useDispatch, useResolvedDrawing } from "../state/store.js";
import { isDraggableFreePoint, withMovedPoint } from "../tools/pointAccess.js";
import { hitTestDimensions, hitTestEntities } from "./hitTest.js";
import { renderScene } from "./renderer.js";
import { findSnapPoint, ResolvedClickPoint, resolveClickPoint, snapAngleAround, snapToGrid, SnapResult } from "./snapping.js";
import { advanceTool, angleSnapReference, EMPTY_SESSION, finishPolyline, Step, ToolSession } from "./toolSession.js";
import { CanvasSize, panViewport, screenToWorld, zoomViewportAt } from "./transform.js";
import { isTypingTarget, useModifierKeys } from "./useModifierKeys.js";

const SNAP_PX = 10;
const HIT_PX = 7;
const WHEEL_ZOOM_STEP = 1.15;

interface PanState {
  /** Where the drag started on screen, and the viewport at that moment. */
  screen: Vec2;
  viewport: Viewport;
}

interface DragState {
  entityId: string;
  pointName: string;
}

/** Tracks an element's content-box size. */
function useElementSize(ref: React.RefObject<HTMLElement>): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ width: 800, height: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function Canvas() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { drawing } = useResolvedDrawing();
  const { space, shift } = useModifierKeys();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(containerRef);

  const [session, setSession] = useState<ToolSession>(EMPTY_SESSION);
  const [hover, setHover] = useState<Vec2 | null>(null);
  const [snap, setSnap] = useState<ResolvedClickPoint | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const snapRadius = SNAP_PX / state.viewport.zoom;
  const hitRadius = HIT_PX / state.viewport.zoom;

  // Switching tools abandons whatever was half-drawn.
  useEffect(() => setSession(EMPTY_SESSION), [state.tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, size, state.viewport, {
      drawing,
      selection: state.selection,
      pendingPoints: session.clicks.map((c) => c.world),
      hoverWorld: hover,
      snapWorld: snap?.point ?? null,
    });
  }, [size, state.viewport, drawing, state.selection, session, hover, snap]);

  // Escape cancels the shape in progress (or a point drag); Enter finishes a polyline.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        setSession(EMPTY_SESSION);
        setDrag(null);
      } else if (e.key === "Enter" && state.tool === "polyline") {
        applyStep(finishPolyline(session));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // React attaches wheel listeners as passive, which forbids preventDefault; zoom needs a native one.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
    dispatch({ type: "SET_VIEWPORT", viewport: zoomViewportAt(state.viewport, size, screen, factor) });
  };
  useEffect(() => {
    const canvas = canvasRef.current!;
    const listener = (e: WheelEvent) => wheelRef.current(e);
    canvas.addEventListener("wheel", listener, { passive: false });
    return () => canvas.removeEventListener("wheel", listener);
  }, []);

  function eventWorld(e: React.PointerEvent): Vec2 {
    const rect = canvasRef.current!.getBoundingClientRect();
    return screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, state.viewport, size);
  }

  function applyStep(step: Step) {
    setSession(step.session);
    if (step.commit?.kind === "entity") dispatch({ type: "ADD_ENTITY", entity: step.commit.entity });
    else if (step.commit?.kind === "dimension") dispatch({ type: "ADD_DIMENSION", dimension: step.commit.dimension });
  }

  /** Where a click at `raw` lands once Shift-angle, object and grid snapping are applied. `preview` is the marker to show. */
  function locate(raw: Vec2): { world: Vec2; snapRef: string | null; preview: ResolvedClickPoint | null } {
    const angleRef = shift ? angleSnapReference(state.tool, session) : null;
    if (angleRef) return { world: snapAngleAround(angleRef, raw), snapRef: null, preview: null };
    const resolved = resolveClickPoint(raw, drawing, { objectSnap: state.objectSnap, gridSnap: state.gridSnap, objectSnapRadius: snapRadius });
    return { world: resolved.point, snapRef: resolved.ref, preview: state.tool === "select" ? null : resolved };
  }

  /** Where a dragged point lands: onto another entity's point if object snap is on, else the grid. */
  function dragTarget(raw: Vec2, dragging: DragState): Vec2 {
    if (state.objectSnap) {
      const hit = findSnapPoint(drawing, raw, snapRadius);
      if (hit && hit.entityId !== dragging.entityId) return hit.point;
    }
    return state.gridSnap ? snapToGrid(raw) : raw;
  }

  function selectAt(raw: Vec2, pointHit: SnapResult | null) {
    const entity = pointHit && state.document.entities.find((en) => en.id === pointHit.entityId);
    if (pointHit && entity && isDraggableFreePoint(entity, pointHit.pointName)) {
      setDrag({ entityId: entity.id, pointName: pointHit.pointName });
      return;
    }
    const hitEntity = hitTestEntities(drawing, raw, hitRadius);
    const hitDimension = hitEntity ? null : hitTestDimensions(drawing, raw, hitRadius);
    dispatch({
      type: "SET_SELECTION",
      selection: hitEntity ? { kind: "entity", id: hitEntity.id } : hitDimension ? { kind: "dimension", id: hitDimension.id } : null,
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const raw = eventWorld(e);

    // Middle-drag, right-drag and Space+left-drag pan whatever the tool.
    if (e.button === 1 || e.button === 2 || (e.button === 0 && space)) {
      setPan({ screen: { x: e.clientX, y: e.clientY }, viewport: state.viewport });
      return;
    }
    if (e.button !== 0) return;

    if (state.tool === "select") {
      selectAt(raw, findSnapPoint(drawing, raw, snapRadius));
      return;
    }
    const { world, snapRef } = locate(raw);
    applyStep(advanceTool(state.tool, session, { world, snapRef }, raw, drawing, hitRadius));
  }

  function onPointerMove(e: React.PointerEvent) {
    const raw = eventWorld(e);
    const { world, preview } = locate(raw);
    setHover(world);
    setSnap(preview);

    if (pan) {
      dispatch({ type: "SET_VIEWPORT", viewport: panViewport(pan.viewport, e.clientX - pan.screen.x, e.clientY - pan.screen.y) });
    } else if (drag) {
      const entity = state.document.entities.find((en) => en.id === drag.entityId);
      if (entity) {
        const target = dragTarget(raw, drag);
        dispatch({ type: "UPDATE_ENTITY", id: entity.id, entity: withMovedPoint(entity, drag.pointName, target.x, target.y) });
      }
    }
  }

  function endGesture() {
    setPan(null);
    setDrag(null);
  }

  function onPointerLeave() {
    setHover(null);
    setSnap(null);
  }

  const cursor = pan ? "grabbing" : space ? "grab" : state.tool === "select" ? "default" : "crosshair";

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onPointerLeave={onPointerLeave}
        onDoubleClick={() => state.tool === "polyline" && applyStep(finishPolyline(session))}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
