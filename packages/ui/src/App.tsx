import React, { useEffect } from "react";
import { Canvas } from "./canvas/Canvas.js";
import { HelpDialog } from "./dialogs/HelpDialog.js";
import { LoginDialog } from "./dialogs/LoginDialog.js";
import { PrintDialog } from "./dialogs/PrintDialog.js";
import { getMe } from "./io/cloudApi.js";
import { takeDraft } from "./io/localDraft.js";
import { isDesktop } from "./io/nativeBridge.js";
import { ParamsPanel } from "./panels/ParamsPanel.js";
import { ProjectBar } from "./panels/ProjectBar.js";
import { ProjectsPanel } from "./panels/ProjectsPanel.js";
import { PropertyPanel } from "./panels/PropertyPanel.js";
import { Toolbar } from "./panels/Toolbar.js";
import { isDirty } from "./state/reducer.js";
import { useAppState, useDispatch, useResolvedDrawing } from "./state/store.js";
import { useCloudActions } from "./state/useCloudActions.js";
import { useProjectActions } from "./state/useProjectActions.js";
import { useShortcuts } from "./state/useShortcuts.js";

const SHARE_HASH = /^#\/d\/([0-9a-f-]+)$/i;

/** One-time startup: learn who's signed in, then open a shared link or restore the draft saved before a sign-in redirect. */
function useStartup(): string | null {
  const dispatch = useDispatch();
  const cloud = useCloudActions();

  useEffect(() => {
    getMe()
      .then((r) => dispatch({ type: "SET_CLOUD_USER", user: r.user, loginMode: r.loginMode }))
      .catch(() => {
        /* no server reachable -- the app works fully offline with local files */
      });

    const shared = window.location.hash.match(SHARE_HASH);
    if (shared) {
      void cloud.open(shared[1]); // a failure surfaces through cloud.error
      return;
    }
    // Landing back from a sign-in redirect (which reloads the page) would otherwise lose the work in progress.
    const draft = takeDraft();
    if (draft) dispatch({ type: "LOAD_PROJECT", project: draft, binding: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return cloud.error;
}

/** Wires the desktop shell's native menu to the same actions as the toolbar. */
function useNativeMenu(actions: ReturnType<typeof useProjectActions>): void {
  const dispatch = useDispatch();
  useEffect(() => {
    if (!window.pcadNative) return;
    return window.pcadNative.onMenuAction((action) => {
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
  useShortcuts();
  useNativeMenu(actions);

  // Closing with unsaved work asks first: the browser does it from beforeunload, the desktop shell from its own dialog.
  const dirty = isDirty(state);
  useEffect(() => {
    if (isDesktop()) {
      window.pcadNative!.setDirty(dirty);
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
                {sharedLoadError && <li>Could not open shared drawing: {sharedLoadError}</li>}
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
