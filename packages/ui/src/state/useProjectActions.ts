import { exportDxf } from "@pcad/core";
import { useCallback } from "react";
import { exportDxfFile, openProjectFile, saveProjectFile } from "../io/fileIo.js";
import { errorMessage } from "../util/errors.js";
import { isDirty } from "./reducer.js";
import { useAppState, useDispatch, useResolvedDrawing } from "./store.js";

/** The File-menu style operations, shared by the toolbar and the desktop app's native menu. */
export function useProjectActions() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { drawing, paramIssues } = useResolvedDrawing();
  const title = state.document.title?.trim() || "drawing";

  /** Asks before throwing away unsaved work; true if it's fine to proceed. */
  const confirmDiscard = useCallback(
    (what: string) => !isDirty(state) || confirm(`You have unsaved changes that will be lost if you ${what}. Continue?`),
    [state],
  );

  const newProject = useCallback(() => {
    if (confirmDiscard("start a new drawing")) dispatch({ type: "NEW_PROJECT" });
  }, [confirmDiscard, dispatch]);

  const openFile = useCallback(async () => {
    if (!confirmDiscard("open another file")) return;
    try {
      const project = await openProjectFile();
      if (project) dispatch({ type: "LOAD_PROJECT", project, binding: null });
    } catch (err) {
      alert(`Could not open project file: ${errorMessage(err)}`);
    }
  }, [confirmDiscard, dispatch]);

  const saveFile = useCallback(async () => {
    try {
      if (await saveProjectFile(`${title}.pcad.json`, state.document, state.paramsText)) dispatch({ type: "MARK_SAVED" });
    } catch (err) {
      alert(`Could not save the file: ${errorMessage(err)}`);
    }
  }, [dispatch, state.document, state.paramsText, title]);

  const exportDxfToFile = useCallback(async () => {
    if ((drawing.issues.length > 0 || paramIssues.length > 0) && !confirm("The drawing has unresolved parameter or geometry issues; exported geometry may be incomplete. Export anyway?")) return;
    try {
      await exportDxfFile(`${title}.dxf`, exportDxf(drawing));
    } catch (err) {
      alert(`Could not export DXF: ${errorMessage(err)}`);
    }
  }, [drawing, paramIssues, title]);

  return { confirmDiscard, newProject, openFile, saveFile, exportDxf: exportDxfToFile };
}
