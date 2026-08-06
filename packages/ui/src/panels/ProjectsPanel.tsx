import React, { useEffect, useState } from "react";
import { CloudDrawingSummary, deleteCloudDrawing, getCloudDrawing, listMyDrawings } from "../io/cloudApi.js";
import { useAppState, useDispatch } from "../state/store.js";

export function ProjectsPanel() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [drawings, setDrawings] = useState<CloudDrawingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!state.cloudUser) return;
    listMyDrawings()
      .then((r) => setDrawings(r.drawings))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  // Refresh whenever the panel is opened, the signed-in user changes, or a save/open
  // elsewhere changes which cloud drawing is current (so a brand-new save shows up).
  useEffect(() => {
    if (state.projectsPanelOpen) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.projectsPanelOpen, state.cloudUser, state.cloudBinding?.id]);

  async function handleOpen(id: string) {
    try {
      const full = await getCloudDrawing(id);
      dispatch({ type: "SET_DOCUMENT", document: full.document });
      dispatch({ type: "SET_PARAMS_TEXT", text: full.paramsText });
      dispatch({ type: "SET_CLOUD_BINDING", binding: { id: full.id, visibility: full.visibility, isOwner: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    try {
      await deleteCloudDrawing(id);
      if (state.cloudBinding?.id === id) dispatch({ type: "SET_CLOUD_BINDING", binding: null });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className={`sidebar projects ${state.projectsPanelOpen ? "open" : "closed"}`}>
      <div className="projects-inner">
        <div className="projects-header">
          <h3>Projects</h3>
          <button className="panel-close" title="Hide projects panel" onClick={() => dispatch({ type: "SET_PROJECTS_PANEL", open: false })}>
            &laquo;
          </button>
        </div>

        {!state.cloudUser ? (
          <div className="panel">
            <p className="panel-help">Sign in to see and manage projects saved to your account.</p>
            <button onClick={() => dispatch({ type: "SET_LOGIN_DIALOG", open: true })}>Sign in</button>
          </div>
        ) : (
          <>
            {error && <p className="error-text">{error}</p>}
            {drawings === null && <p className="panel-help">Loading...</p>}
            {drawings?.length === 0 && <p className="panel-help">No saved projects yet. Use "Save to Cloud" to save the current drawing.</p>}
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
