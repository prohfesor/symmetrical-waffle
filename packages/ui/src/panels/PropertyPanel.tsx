import { Dimension, Entity, MirrorEntity, PolySegment } from "@pcad/core";
import React from "react";
import { useAppState, useDispatch, useResolvedDrawing } from "../state/store.js";
import { FormulaInput } from "./FormulaInput.js";
import { PointEditor } from "./PointEditor.js";
import { withAxisDirection } from "../tools/mirror.js";

function MirrorFields({ entity, update }: { entity: MirrorEntity; update: (next: Entity) => void }) {
  const { drawing } = useResolvedDrawing();
  const axis = drawing.axes.find((a) => a.id === entity.id);
  const origin = { x: 0, y: 0 };
  return (
    <>
      <p className="panel-help">
        Mirrors the entities below across the axis through the two points. Use formulas to tie the axis to parameters, e.g.{" "}
        <code>=width / 2</code>.
      </p>
      <PointEditor
        label="axis p1"
        point={entity.axis.p1}
        resolved={axis?.p1 ?? origin}
        onChange={(p1) => update({ ...entity, axis: { ...entity.axis, p1 } })}
      />
      <PointEditor
        label="axis p2"
        point={entity.axis.p2}
        resolved={axis?.p2 ?? origin}
        onChange={(p2) => update({ ...entity, axis: { ...entity.axis, p2 } })}
      />
      <div className="inline-fields">
        <button
          title="Make the axis vertical, through axis p1"
          onClick={() => update(withAxisDirection(entity, "vertical", axis?.p1 ?? origin))}
        >
          Vertical
        </button>
        <button
          title="Make the axis horizontal, through axis p1"
          onClick={() => update(withAxisDirection(entity, "horizontal", axis?.p1 ?? origin))}
        >
          Horizontal
        </button>
      </div>
      <fieldset className="segment-editor">
        <legend>Mirrored entities</legend>
        {entity.sources.length === 0 && <p className="panel-help">Nothing to mirror.</p>}
        <ul className="issue-list neutral">
          {entity.sources.map((id) => (
            <li key={id}>
              <code>{id}</code>{" "}
              <button title="Stop mirroring this" onClick={() => update({ ...entity, sources: entity.sources.filter((s) => s !== id) })}>
                &times;
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
    </>
  );
}

function EntityFields({ entity }: { entity: Entity }) {
  const dispatch = useDispatch();
  const { drawing } = useResolvedDrawing();
  const resolved = drawing.entities.find((e) => e.id === entity.id);

  function update(next: Entity) {
    dispatch({ type: "UPDATE_ENTITY", id: entity.id, entity: next });
  }

  switch (entity.kind) {
    case "mirror":
      return <MirrorFields entity={entity} update={update} />;
    case "line": {
      const r = resolved?.kind === "line" ? resolved : undefined;
      return (
        <>
          <PointEditor label="p1" point={entity.p1} resolved={r?.p1 ?? { x: 0, y: 0 }} onChange={(p1) => update({ ...entity, p1 })} />
          <label className="mode-select">
            <span>Mode</span>
            <select
              value={entity.mode}
              onChange={(e) => {
                const mode = e.target.value as "twoPoint" | "polar";
                if (mode === "polar") {
                  update({ ...entity, mode, length: r?.length ?? 10, angle: r?.angleDeg ?? 0 });
                } else {
                  update({ ...entity, mode, p2: entity.p2 ?? { kind: "free", x: r?.p2.x ?? 10, y: r?.p2.y ?? 0 } });
                }
              }}
            >
              <option value="twoPoint">Two points</option>
              <option value="polar">Length + angle</option>
            </select>
          </label>
          {entity.mode === "twoPoint" ? (
            <PointEditor
              label="p2"
              point={entity.p2 ?? { kind: "free", x: 0, y: 0 }}
              resolved={r?.p2 ?? { x: 0, y: 0 }}
              onChange={(p2) => update({ ...entity, p2 })}
            />
          ) : (
            <>
              <FormulaInput
                label="length"
                value={entity.length ?? 0}
                resolvedValue={r?.length}
                onChange={(length) => update({ ...entity, length })}
              />
              <FormulaInput
                label="angle (deg)"
                value={entity.angle ?? 0}
                resolvedValue={r?.angleDeg}
                onChange={(angle) => update({ ...entity, angle })}
              />
            </>
          )}
        </>
      );
    }
    case "circle": {
      const r = resolved?.kind === "circle" ? resolved : undefined;
      return (
        <>
          <PointEditor
            label="center"
            point={entity.center}
            resolved={r?.center ?? { x: 0, y: 0 }}
            onChange={(center) => update({ ...entity, center })}
          />
          <FormulaInput
            label="radius"
            value={entity.radius}
            resolvedValue={r?.radius}
            onChange={(radius) => update({ ...entity, radius })}
          />
        </>
      );
    }
    case "arc": {
      const r = resolved?.kind === "arc" ? resolved : undefined;
      return (
        <>
          <PointEditor
            label="center"
            point={entity.center}
            resolved={r?.center ?? { x: 0, y: 0 }}
            onChange={(center) => update({ ...entity, center })}
          />
          <FormulaInput
            label="radius"
            value={entity.radius}
            resolvedValue={r?.radius}
            onChange={(radius) => update({ ...entity, radius })}
          />
          <FormulaInput
            label="start angle (deg)"
            value={entity.startAngle}
            resolvedValue={r?.startAngleDeg}
            onChange={(startAngle) => update({ ...entity, startAngle })}
          />
          <FormulaInput
            label="end angle (deg)"
            value={entity.endAngle}
            resolvedValue={r?.endAngleDeg}
            onChange={(endAngle) => update({ ...entity, endAngle })}
          />
        </>
      );
    }
    case "rectangle": {
      const r = resolved?.kind === "rectangle" ? resolved : undefined;
      return (
        <>
          <PointEditor
            label="corner"
            point={entity.corner}
            resolved={r?.corners[0] ?? { x: 0, y: 0 }}
            onChange={(corner) => update({ ...entity, corner })}
          />
          <FormulaInput label="width" value={entity.width} resolvedValue={r?.width} onChange={(width) => update({ ...entity, width })} />
          <FormulaInput
            label="height"
            value={entity.height}
            resolvedValue={r?.height}
            onChange={(height) => update({ ...entity, height })}
          />
          <FormulaInput
            label="rotation (deg)"
            value={entity.rotation ?? 0}
            resolvedValue={r?.rotationDeg}
            onChange={(rotation) => update({ ...entity, rotation })}
          />
        </>
      );
    }
    case "polyline": {
      const r = resolved?.kind === "polyline" ? resolved : undefined;
      return (
        <>
          <PointEditor
            label="start"
            point={entity.start}
            resolved={r?.points[0] ?? { x: 0, y: 0 }}
            onChange={(start) => update({ ...entity, start })}
          />
          <label className="checkbox-field">
            <input type="checkbox" checked={entity.closed} onChange={(e) => update({ ...entity, closed: e.target.checked })} />
            <span>Closed</span>
          </label>
          {entity.segments.map((seg, i) => (
            <SegmentEditor
              key={i}
              index={i}
              segment={seg}
              onChange={(next) => {
                const segments = [...entity.segments];
                segments[i] = next;
                update({ ...entity, segments });
              }}
            />
          ))}
        </>
      );
    }
  }
}

function SegmentEditor({ index, segment, onChange }: { index: number; segment: PolySegment; onChange: (s: PolySegment) => void }) {
  return (
    <fieldset className="segment-editor">
      <legend>Segment {index + 1}</legend>
      <label className="mode-select">
        <span>Mode</span>
        <select
          value={segment.kind}
          onChange={(e) => {
            if (e.target.value === "polar") onChange({ kind: "polar", length: 10, angle: 0 });
            else onChange({ kind: "relative", dx: 10, dy: 0 });
          }}
        >
          <option value="relative">dx, dy</option>
          <option value="polar">length, angle</option>
        </select>
      </label>
      {segment.kind === "polar" ? (
        <>
          <FormulaInput
            label="length"
            value={segment.length}
            onChange={(length) => onChange({ kind: "polar", length, angle: segment.angle })}
          />
          <FormulaInput
            label="angle (deg)"
            value={segment.angle}
            onChange={(angle) => onChange({ kind: "polar", length: segment.length, angle })}
          />
        </>
      ) : (
        <>
          <FormulaInput label="dx" value={segment.dx} onChange={(dx) => onChange({ kind: "relative", dx, dy: segment.dy })} />
          <FormulaInput label="dy" value={segment.dy} onChange={(dy) => onChange({ kind: "relative", dx: segment.dx, dy })} />
        </>
      )}
    </fieldset>
  );
}

function DimensionFields({ dimension }: { dimension: Dimension }) {
  const dispatch = useDispatch();
  function update(next: Dimension) {
    dispatch({ type: "UPDATE_DIMENSION", id: dimension.id, dimension: next });
  }
  return (
    <>
      <p className="panel-help">Target: {describeTarget(dimension)}</p>
      <label className="formula-field">
        <span>display offset</span>
        <input
          type="number"
          value={dimension.displayOffset}
          onChange={(e) => update({ ...dimension, displayOffset: Number(e.target.value) })}
        />
      </label>
      <label className="formula-field">
        <span>precision</span>
        <input
          type="number"
          min={0}
          max={6}
          value={dimension.precision ?? 2}
          onChange={(e) => update({ ...dimension, precision: Number(e.target.value) })}
        />
      </label>
    </>
  );
}

function describeTarget(d: Dimension): string {
  const t = d.target;
  switch (t.kind) {
    case "lineLength":
      return `length of ${t.entityId}`;
    case "circleRadius":
      return `radius of ${t.entityId}`;
    case "circleDiameter":
      return `diameter of ${t.entityId}`;
    case "arcRadius":
      return `radius of ${t.entityId}`;
    case "arcAngle":
      return `included angle of ${t.entityId}`;
    case "pointDistance":
      return `distance ${t.from} to ${t.to}`;
  }
}

export function PropertyPanel() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { drawing } = useResolvedDrawing();

  if (!state.selection) {
    return (
      <div className="panel property-panel">
        <h3>Properties</h3>
        <p className="panel-help">Select an entity or dimension to edit its parametric fields.</p>
      </div>
    );
  }

  if (state.selection.kind === "entity") {
    const entity = state.document.entities.find((e) => e.id === state.selection!.id);
    if (!entity) return null;
    return (
      <div className="panel property-panel">
        <h3>
          {entity.kind} -- {entity.id}
        </h3>
        <EntityFields entity={entity} />
        <button className="danger" onClick={() => dispatch({ type: "REMOVE_ENTITY", id: entity.id })}>
          Delete
        </button>
      </div>
    );
  }

  const dimension = state.document.dimensions.find((d) => d.id === state.selection!.id);
  if (!dimension) return null;
  const resolvedDim = drawing.dimensions.find((d) => d.id === dimension.id);
  return (
    <div className="panel property-panel">
      <h3>dimension -- {dimension.id}</h3>
      {resolvedDim && <p className="resolved-hint">value = {resolvedDim.text}</p>}
      <DimensionFields dimension={dimension} />
      <button className="danger" onClick={() => dispatch({ type: "REMOVE_DIMENSION", id: dimension.id })}>
        Delete
      </button>
    </div>
  );
}
