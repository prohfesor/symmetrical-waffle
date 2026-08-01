import { exportDxf } from "@pcad/core";
import React from "react";
import { Canvas } from "./canvas/Canvas.js";
import { PrintDialog } from "./dialogs/PrintDialog.js";
import { downloadTextFile, parseProject, pickTextFile, serializeProject } from "./io/fileFormats.js";
import { ParamsPanel } from "./panels/ParamsPanel.js";
import { PropertyPanel } from "./panels/PropertyPanel.js";
import { Toolbar } from "./panels/Toolbar.js";
import { useAppState, useDispatch } from "./state/store.js";
import { useResolvedDrawing } from "./state/useResolvedDrawing.js";

export function App() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { drawing, paramIssues } = useResolvedDrawing();

  function handleNew() {
    if (!confirm("Discard the current drawing and start a new one?")) return;
    dispatch({ type: "NEW_DOCUMENT" });
    dispatch({ type: "SET_PARAMS_TEXT", text: "# params.txt -- one \"name = expression\" per line\n" });
  }

  function handleSave() {
    const content = serializeProject(state.document, state.paramsText);
    downloadTextFile(`${state.document.title ?? "drawing"}.pcad.json`, content, "application/json");
  }

  async function handleOpen() {
    const file = await pickTextFile(".pcad.json,.json,application/json");
    if (!file) return;
    try {
      const project = parseProject(file.text);
      dispatch({ type: "SET_DOCUMENT", document: project.document });
      dispatch({ type: "SET_PARAMS_TEXT", text: project.paramsText });
    } catch (err) {
      alert(`Could not open project file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleExportDxf() {
    if (drawing.issues.length > 0 || paramIssues.length > 0) {
      const proceed = confirm("The drawing has unresolved parameter or geometry issues; exported geometry may be incomplete. Export anyway?");
      if (!proceed) return;
    }
    const dxf = exportDxf(drawing);
    downloadTextFile(`${state.document.title ?? "drawing"}.dxf`, dxf, "application/dxf");
  }

  return (
    <div className="app">
      <Toolbar
        onNew={handleNew}
        onSave={handleSave}
        onOpen={handleOpen}
        onExportDxf={handleExportDxf}
        onOpenPrint={() => dispatch({ type: "SET_PRINT_DIALOG", open: true })}
      />
      <div className="app-body">
        <div className="sidebar left">
          <ParamsPanel />
        </div>
        <Canvas />
        <div className="sidebar right">
          <PropertyPanel />
          {(drawing.issues.length > 0 || paramIssues.length > 0) && (
            <div className="panel issues-panel">
              <h3>Issues</h3>
              <ul className="issue-list">
                {drawing.issues.map((issue, i) => (
                  <li key={`e${i}`}>{issue.entityId ? `${issue.entityId}: ` : issue.dimensionId ? `${issue.dimensionId}: ` : ""}{issue.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {state.printDialogOpen && <PrintDialog />}
    </div>
  );
}
