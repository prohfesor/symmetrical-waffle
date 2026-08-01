import React, { useEffect, useState } from "react";
import { CloudDrawingSummary, deleteCloudDrawing, getCloudDrawing, listMyDrawings } from "../io/cloudApi.js";
import { useDispatch } from "../state/store.js";

export function MyDrawingsDialog() {
  const dispatch = useDispatch();
  const [drawings, setDrawings] = useState<CloudDrawingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listMyDrawings()
      .then((r) => setDrawings(r.drawings))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(refresh, []);

  async function handleOpen(id: string) {
    try {
      const full = await getCloudDrawing(id);
      dispatch({ type: "SET_DOCUMENT", document: full.document });
      dispatch({ type: "SET_PARAMS_TEXT", text: full.paramsText });
      dispatch({ type: "SET_CLOUD_BINDING", binding: { id: full.id, visibility: full.visibility, isOwner: true } });
      dispatch({ type: "SET_MY_DRAWINGS_DIALOG", open: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this drawing? This cannot be undone.")) return;
    try {
      await deleteCloudDrawing(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: "SET_MY_DRAWINGS_DIALOG", open: false })}>
      <div className="modal my-drawings-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>My Drawings</h2>
        {error && <p className="error-text">{error}</p>}
        {drawings === null && <p className="panel-help">Loading...</p>}
        {drawings?.length === 0 && <p className="panel-help">No saved drawings yet. Use "Save to Cloud" to save your current drawing.</p>}
        {drawings && drawings.length > 0 && (
          <table className="drawings-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Visibility</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {drawings.map((d) => (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>{d.visibility}</td>
                  <td>{new Date(d.updatedAt).toLocaleString()}</td>
                  <td className="row-actions">
                    <button onClick={() => handleOpen(d.id)}>Open</button>
                    <button className="danger" onClick={() => handleDelete(d.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="modal-actions">
          <button onClick={() => dispatch({ type: "SET_MY_DRAWINGS_DIALOG", open: false })}>Close</button>
        </div>
      </div>
    </div>
  );
}
