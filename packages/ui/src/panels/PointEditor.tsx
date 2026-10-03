import { PointDef, Vec2 } from "@wafflecad/core";
import React from "react";
import { FormulaInput } from "./FormulaInput.js";

export interface PointEditorProps {
  label: string;
  point: PointDef;
  resolved: Vec2;
  onChange: (point: PointDef) => void;
}

export function PointEditor({ label, point, resolved, onChange }: PointEditorProps) {
  if (point.kind === "anchor") {
    return (
      <div className="point-editor anchored">
        <span>
          {label}: anchored to <code>{point.ref}</code>
        </span>
        <button onClick={() => onChange({ kind: "free", x: resolved.x, y: resolved.y })}>Detach</button>
      </div>
    );
  }
  return (
    <div className="point-editor">
      <FormulaInput label={`${label}.x`} value={point.x} onChange={(x) => onChange({ kind: "free", x, y: point.y })} />
      <FormulaInput label={`${label}.y`} value={point.y} onChange={(y) => onChange({ kind: "free", x: point.x, y })} />
    </div>
  );
}
