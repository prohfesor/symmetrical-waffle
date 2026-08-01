import React, { useState } from "react";
import { createCloudDrawing, logout, shareUrlFor, updateCloudDrawing } from "../io/cloudApi.js";
import { useAppState, useDispatch } from "../state/store.js";

export function CloudBar() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSignOut() {
    await logout();
    dispatch({ type: "SET_CLOUD_USER", user: null, devMode: state.cloudDevMode });
    dispatch({ type: "SET_CLOUD_BINDING", binding: null });
  }

  async function handleSaveToCloud(asCopy: boolean) {
    if (!state.cloudUser) {
      dispatch({ type: "SET_LOGIN_DIALOG", open: true });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!asCopy && state.cloudBinding?.isOwner) {
        await updateCloudDrawing(state.cloudBinding.id, { document: state.document, paramsText: state.paramsText });
      } else {
        const title = state.document.title?.trim() || prompt("Title for this drawing:", "Untitled") || "Untitled";
        const created = await createCloudDrawing(title, state.document, state.paramsText, "private");
        dispatch({ type: "SET_CLOUD_BINDING", binding: { id: created.id, visibility: created.visibility, isOwner: true } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVisibilityChange(visibility: "private" | "public") {
    if (!state.cloudBinding) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCloudDrawing(state.cloudBinding.id, { visibility });
      dispatch({ type: "SET_CLOUD_BINDING", binding: { id: updated.id, visibility: updated.visibility, isOwner: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!state.cloudBinding) return;
    await navigator.clipboard.writeText(shareUrlFor(state.cloudBinding.id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="cloud-bar">
      {!state.cloudUser ? (
        <button onClick={() => dispatch({ type: "SET_LOGIN_DIALOG", open: true })}>Sign in</button>
      ) : (
        <>
          <span className="cloud-user">{state.cloudUser.name ?? state.cloudUser.email}</span>
          <button onClick={() => dispatch({ type: "SET_MY_DRAWINGS_DIALOG", open: true })}>My Drawings</button>
          <button onClick={handleSignOut}>Sign out</button>
        </>
      )}
      <span className="cloud-sep" />

      {state.cloudBinding?.isOwner ? (
        <>
          <button disabled={busy} onClick={() => handleSaveToCloud(false)}>
            {busy ? "Saving..." : "Save to Cloud"}
          </button>
          <label className="visibility-toggle">
            <span>Visibility</span>
            <select
              value={state.cloudBinding.visibility}
              onChange={(e) => handleVisibilityChange(e.target.value as "private" | "public")}
              disabled={busy}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>
          {state.cloudBinding.visibility === "public" && (
            <button onClick={handleCopyLink}>{copied ? "Link copied!" : "Copy share link"}</button>
          )}
        </>
      ) : state.cloudBinding && !state.cloudBinding.isOwner ? (
        <>
          <span className="panel-help">Viewing a shared drawing (not yours) --</span>
          <button disabled={busy} onClick={() => handleSaveToCloud(true)}>
            {busy ? "Saving..." : state.cloudUser ? "Save as my copy" : "Sign in to save a copy"}
          </button>
        </>
      ) : (
        <button disabled={busy} onClick={() => handleSaveToCloud(false)}>
          {busy ? "Saving..." : "Save to Cloud"}
        </button>
      )}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
