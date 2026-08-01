import React from "react";
import { useAppState, useDispatch } from "../state/store.js";
import { TOOLS } from "../tools/types.js";

export interface ToolbarProps {
  onNew: () => void;
  onSave: () => void;
  onOpen: () => void;
  onExportDxf: () => void;
  onOpenPrint: () => void;
}

export function Toolbar({ onNew, onSave, onOpen, onExportDxf, onOpenPrint }: ToolbarProps) {
  const state = useAppState();
  const dispatch = useDispatch();
  const activeTool = TOOLS.find((t) => t.id === state.tool)!;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button onClick={onNew}>New</button>
        <button onClick={onOpen}>Open...</button>
        <button onClick={onSave}>Save</button>
        <button onClick={onExportDxf}>Export DXF</button>
        <button onClick={onOpenPrint}>Print / Export PDF...</button>
      </div>
      <div className="toolbar-group">
        {TOOLS.map((t) => (
          <button key={t.id} className={t.id === state.tool ? "active" : ""} onClick={() => dispatch({ type: "SET_TOOL", tool: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="toolbar-hint">{activeTool.hint}</div>
    </div>
  );
}
