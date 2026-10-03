import React, { useEffect } from "react";
import { Canvas } from "./canvas/Canvas.js";
import { HelpDialog } from "./dialogs/HelpDialog.js";
import { LoginDialog } from "./dialogs/LoginDialog.js";
import { PrintDialog } from "./dialogs/PrintDialog.js";
import { isDesktop } from "./io/nativeBridge.js";
import { ParamsPanel } from "./panels/ParamsPanel.js";
import { ProjectBar } from "./panels/ProjectBar.js";
import { ProjectsPanel } from "./panels/ProjectsPanel.js";
import { PropertyPanel } from "./panels/PropertyPanel.js";
import { Toolbar } from "./panels/Toolbar.js";
import { isDirty } from "./state/reducer.js";
import { useAppState, useDispatch, useResolvedDrawing } from "./state/store.js";
import { useProjectActions } from "./state/useProjectActions.js";
import { useAutosave } from "./state/useAutosave.js";
import { useShortcuts } from "./state/useShortcuts.js";
import { useStartup } from "./state/useStartup.js";

/** Wires the desktop shell's native menu to the same actions as the toolbar. */
function useNativeMenu(actions: ReturnType<typeof useProjectActions>): void {
  const dispatch = useDispatch();
  useEffect(() => {
    if (!window.wafflecadNative) return;
    return window.wafflecadNative.onMenuAction((action) => {
      if (action === "new") actions.newProject();
      else if (action === "open") void actions.openFile();
      else if (action === "save") void actions.saveFile();
      else if (action === "exportDxf") void actions.exportDxf();
      else if (action === "print") dispatch({ type: "SET_PRINT_DIALOG", open: true });
    });
  }, [actions, dispatch]);
}

export function App() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { drawing } = useResolvedDrawing();
  const actions = useProjectActions();

  const sharedLoadError = useStartup();
  useAutosave();
  useShortcuts();
  useNativeMenu(actions);

  // Closing with unsaved work asks first: the browser does it from beforeunload, the desktop shell from its own dialog.
  const dirty = isDirty(state);
  useEffect(() => {
    if (isDesktop()) {
      window.wafflecadNative!.setDirty(dirty);
      return;
    }
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const hasIssues = drawing.issues.length > 0 || !!sharedLoadError;

  return (
    <div className="app">
      <Toolbar
        onNew={actions.newProject}
        onSave={actions.saveFile}
        onOpen={actions.openFile}
        onExportDxf={actions.exportDxf}
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
          {hasIssues && (
            <div className="panel issues-panel">
              <h3>Issues</h3>
              <ul className="issue-list">
                {sharedLoadError && <li>Could not open the link: {sharedLoadError}</li>}
                {drawing.issues.map((issue, i) => (
                  <li key={`e${i}`}>
                    {issue.entityId ? `${issue.entityId}: ` : issue.dimensionId ? `${issue.dimensionId}: ` : ""}
                    {issue.message}
                  </li>
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
