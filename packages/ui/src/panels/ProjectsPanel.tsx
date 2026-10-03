import React, { useCallback, useEffect, useState } from "react";
import type { StoredProjectSummary } from "../io/projectStore.js";
import { useAppState, useDispatch } from "../state/store.js";
import { useCloudActions, useProjectStore } from "../state/useCloudActions.js";
import { useProjectActions } from "../state/useProjectActions.js";
import { errorMessage } from "../util/errors.js";

export function ProjectsPanel() {
  const state = useAppState();
  const dispatch = useDispatch();
  const cloud = useCloudActions();
  const { confirmDiscard } = useProjectActions();
  const store = useProjectStore();
  const signedIn = state.storage === "local" || !!state.cloudUser;
  const [drawings, setDrawings] = useState<StoredProjectSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!signedIn) return;
    store
      .list()
      .then((list) => {
        setDrawings(list);
        setListError(null);
      })
      .catch((err) => setListError(errorMessage(err)));
  }, [signedIn, store]);

  // Refresh when the panel opens, the account changes, or anything is saved/loaded (so new saves and renames appear).
  useEffect(() => {
    if (state.projectsPanelOpen) refresh();
    else if (!signedIn) setDrawings(null);
  }, [state.projectsPanelOpen, state.cloudBinding, state.baseline, signedIn, refresh]);

  async function handleOpen(id: string) {
    if (state.cloudBinding?.id !== id && confirmDiscard("open another project")) await cloud.open(id);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await cloud.remove(id);
    refresh();
  }

  const error = listError ?? cloud.error;

  return (
    <div className={`sidebar projects ${state.projectsPanelOpen ? "open" : "closed"}`}>
      <div className="projects-inner">
        <div className="projects-header">
          <h3>Projects</h3>
          <button className="panel-close" title="Hide projects panel" onClick={() => dispatch({ type: "SET_PROJECTS_PANEL", open: false })}>
            &laquo;
          </button>
        </div>

        {!signedIn ? (
          <div className="panel">
            <p className="panel-help">Sign in to see and manage projects saved to your account.</p>
            <button onClick={() => dispatch({ type: "SET_LOGIN_DIALOG", open: true })}>Sign in</button>
          </div>
        ) : (
          <>
            {state.storage === "local" && <p className="panel-help">Saved in this browser only. Use Save File to keep a copy elsewhere, or Share to send a link.</p>}
            {error && <p className="error-text">{error}</p>}
            {drawings === null && !error && <p className="panel-help">Loading...</p>}
            {drawings?.length === 0 && <p className="panel-help">No saved projects yet. Use the Save button above to save the current drawing.</p>}
            <ul className="project-list">
              {drawings?.map((d) => (
                <li key={d.id} className={state.cloudBinding?.id === d.id ? "current" : ""}>
                  <div className="project-list-main" onClick={() => handleOpen(d.id)}>
                    <span className="project-list-title">{d.title}</span>
                    <span className="project-list-meta">
                      {d.visibility} &middot; {new Date(d.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button className="danger" title="Delete" onClick={() => handleDelete(d.id)}>
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
