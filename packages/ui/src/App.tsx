import { exportDxf } from "@pcad/core";
import React, { useEffect } from "react";
import { Canvas } from "./canvas/Canvas.js";
import { HelpDialog } from "./dialogs/HelpDialog.js";
import { LoginDialog } from "./dialogs/LoginDialog.js";
import { PrintDialog } from "./dialogs/PrintDialog.js";
import { getCloudDrawing, getMe } from "./io/cloudApi.js";
import { exportDxfFile, openProjectFile, saveProjectFile } from "./io/fileFormats.js";
import { takeDraft } from "./io/localDraft.js";
import { ParamsPanel } from "./panels/ParamsPanel.js";
import { ProjectBar } from "./panels/ProjectBar.js";
import { ProjectsPanel } from "./panels/ProjectsPanel.js";
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

  async function handleSave() {
    await saveProjectFile(`${state.document.title ?? "drawing"}.pcad.json`, state.document, state.paramsText);
  }

  async function handleOpen() {
    try {
      const project = await openProjectFile();
      if (!project) return;
      dispatch({ type: "SET_DOCUMENT", document: project.document });
      dispatch({ type: "SET_PARAMS_TEXT", text: project.paramsText });
    } catch (err) {
      alert(`Could not open project file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleExportDxf() {
    if (drawing.issues.length > 0 || paramIssues.length > 0) {
      const proceed = confirm("The drawing has unresolved parameter or geometry issues; exported geometry may be incomplete. Export anyway?");
      if (!proceed) return;
    }
    const dxf = exportDxf(drawing);
    await exportDxfFile(`${state.document.title ?? "drawing"}.dxf`, dxf);
  }

  useEffect(() => {
    getMe()
      .then((r) => dispatch({ type: "SET_CLOUD_USER", user: r.user, loginMode: r.loginMode }))
      .catch(() => {
        /* no cloud server reachable -- app still works fully offline/local */
      });

    const match = window.location.hash.match(/^#\/d\/(.+)$/);
    if (match) {
      const id = match[1];
      getCloudDrawing(id)
        .then((full) => {
          dispatch({ type: "SET_DOCUMENT", document: full.document });
          dispatch({ type: "SET_PARAMS_TEXT", text: full.paramsText });
          dispatch({ type: "SET_CLOUD_BINDING", binding: { id: full.id, visibility: full.visibility, isOwner: !!full.isOwner } });
        })
        .catch((err) => alert(`Could not open shared drawing: ${err instanceof Error ? err.message : String(err)}`));
    } else {
      // Restore whatever was being edited if we just landed back here from a sign-in
      // redirect (which reloads the page and would otherwise silently lose it).
      const draft = takeDraft();
      if (draft) {
        dispatch({ type: "SET_DOCUMENT", document: draft.document });
        dispatch({ type: "SET_PARAMS_TEXT", text: draft.paramsText });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!window.pcadNative) return;
    return window.pcadNative.onMenuAction((action) => {
      if (action === "new") handleNew();
      else if (action === "open") void handleOpen();
      else if (action === "save") void handleSave();
      else if (action === "exportDxf") void handleExportDxf();
      else if (action === "print") dispatch({ type: "SET_PRINT_DIALOG", open: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.document, state.paramsText, drawing.issues, paramIssues]);

  return (
    <div className="app">
      <Toolbar
        onNew={handleNew}
        onSave={handleSave}
        onOpen={handleOpen}
        onExportDxf={handleExportDxf}
        onOpenPrint={() => dispatch({ type: "SET_PRINT_DIALOG", open: true })}
      />
      <ProjectBar />
      <div className="app-body">
        <ProjectsPanel />
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
      {state.loginDialogOpen && <LoginDialog />}
      {state.helpDialogOpen && <HelpDialog />}
    </div>
  );
}
