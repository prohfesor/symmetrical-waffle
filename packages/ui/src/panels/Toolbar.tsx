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
        <button title="Open a local .pcad.json project file" onClick={onOpen}>
          Open File...
        </button>
        <button title="Save to a local .pcad.json project file (not your account -- see Save to Cloud)" onClick={onSave}>
          Save File
        </button>
        <button onClick={onExportDxf}>Export DXF</button>
        <button onClick={onOpenPrint}>Print / Export PDF...</button>
      </div>
      <div className="toolbar-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={t.id === state.tool ? "active" : ""}
            title={`${t.hint} (shortcut: ${t.shortcut})`}
            onClick={() => dispatch({ type: "SET_TOOL", tool: t.id })}
          >
            {t.label} <span className="shortcut-hint">({t.shortcut})</span>
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <button
          className={state.objectSnap ? "active" : ""}
          title="Snap new points onto existing geometry (endpoints, centers, ...)"
          onClick={() => dispatch({ type: "TOGGLE_OBJECT_SNAP" })}
        >
          Object Snap <span className="shortcut-hint">(F3)</span>
        </button>
        <button
          className={state.gridSnap ? "active" : ""}
          title="Snap new points to the nearest 1mm grid intersection"
          onClick={() => dispatch({ type: "TOGGLE_GRID_SNAP" })}
        >
          Grid Snap <span className="shortcut-hint">(F9)</span>
        </button>
      </div>
      {/* A fixed-height row of its own, so switching tools never changes the toolbar's height (which would shift the canvas). */}
      <div className="toolbar-footer">
        <div className="toolbar-hint">
          {activeTool.hint} Space+drag or middle/right-click-drag to pan; scroll to zoom; press S to return to Select; hold Shift to
          constrain angles to 15&deg; steps.
        </div>
        <button className="help-btn" title="About / Help" onClick={() => dispatch({ type: "SET_HELP_DIALOG", open: true })}>
          ?
        </button>
      </div>
    </div>
  );
}
