import React, { useState } from "react";
import { shareUrlFor } from "../io/cloudApi.js";
import { snapshotUrlFor } from "../io/snapshotLink.js";
import { errorMessage } from "../util/errors.js";
import { isDirty } from "../state/reducer.js";
import { useAppState, useDispatch } from "../state/store.js";
import { useCloudActions } from "../state/useCloudActions.js";

function Avatar({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl: string | null }) {
  if (avatarUrl) return <img className="avatar" src={avatarUrl} alt="" referrerPolicy="no-referrer" />;
  const initial = (name || email || "?").trim().charAt(0).toUpperCase();
  return <span className="avatar avatar-fallback">{initial}</span>;
}

/** Copies `text`, or shows it for manual copying where the clipboard is blocked. */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("Copy this link:", text);
  }
}

function useCopyFeedback() {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    flash() {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
  };
}

/** Saving to this browser, and sharing a link that carries the drawing itself (no server involved). */
function LocalControls() {
  const state = useAppState();
  const cloud = useCloudActions();
  const feedback = useCopyFeedback();
  const [shareError, setShareError] = useState<string | null>(null);

  async function share() {
    try {
      setShareError(null);
      await copyText(await snapshotUrlFor(state));
      feedback.flash();
    } catch (err) {
      setShareError(errorMessage(err));
    }
  }

  return (
    <>
      <button disabled={cloud.busy} onClick={() => cloud.save(false)} title="Save in this browser's storage. Use Save File for a copy you can keep elsewhere.">
        {cloud.busy ? "Saving..." : state.cloudBinding ? "\u{1F4BE} Update Saved Copy" : "\u{1F4BE} Save in Browser"}
      </button>
      <button onClick={share} title="Copy a link that contains this drawing; anyone who opens it gets their own copy">
        {feedback.copied ? "Link copied!" : "Share link"}
      </button>
      {(cloud.error || shareError) && <span className="error-text">{cloud.error ?? shareError}</span>}
    </>
  );
}

function AccountSaveControls() {
  const { cloudBinding: binding, cloudUser: user } = useAppState();
  const cloud = useCloudActions();
  const feedback = useCopyFeedback();

  async function copyLink() {
    if (!binding) return;
    await copyText(shareUrlFor(binding.id));
    feedback.flash();
  }

  return (
    <>
      {binding && !binding.isOwner ? (
        <>
          <span className="panel-help">Viewing a shared project (not yours) --</span>
          <button disabled={cloud.busy} onClick={() => cloud.save(true)}>
            {cloud.busy ? "Saving..." : user ? "Save as my copy" : "Sign in to save a copy"}
          </button>
        </>
      ) : (
        <button disabled={cloud.busy} onClick={() => cloud.save(false)}>
          {cloud.busy ? "Saving..." : binding ? "☁ Update Cloud Copy" : "☁ Save to Cloud"}
        </button>
      )}
      {binding?.isOwner && (
        <>
          <label className="visibility-toggle">
            <span>Visibility</span>
            <select value={binding.visibility} onChange={(e) => cloud.setVisibility(e.target.value as "private" | "public")} disabled={cloud.busy}>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>
          {binding.visibility === "public" && <button onClick={copyLink}>{feedback.copied ? "Link copied!" : "Copy share link"}</button>}
        </>
      )}
      {cloud.error && <span className="error-text">{cloud.error}</span>}
    </>
  );
}

function CloudControls() {
  return useAppState().storage === "local" ? <LocalControls /> : <AccountSaveControls />;
}

function AccountControls() {
  const { cloudUser: user, storage } = useAppState();
  const dispatch = useDispatch();
  const cloud = useCloudActions();

  if (storage === "local") return null; // no accounts in the static, in-browser flavour
  if (!user) return <button onClick={() => dispatch({ type: "SET_LOGIN_DIALOG", open: true })}>Sign in</button>;
  return (
    <>
      <Avatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
      <span className="cloud-user">{user.name ?? user.email}</span>
      <button disabled={cloud.busy} onClick={cloud.signOut}>
        Sign out
      </button>
    </>
  );
}

export function ProjectBar() {
  const state = useAppState();
  const dispatch = useDispatch();

  return (
    <div className="project-bar">
      <div className="project-bar-group">
        <button
          className={`projects-toggle ${state.projectsPanelOpen ? "active" : ""}`}
          title="Show/hide saved projects"
          onClick={() => dispatch({ type: "SET_PROJECTS_PANEL", open: !state.projectsPanelOpen })}
        >
          &#128193; Projects
        </button>
        <input
          className="project-title-input"
          value={state.document.title ?? ""}
          placeholder="Untitled project"
          onChange={(e) => dispatch({ type: "SET_DOCUMENT_TITLE", title: e.target.value })}
          title="Project name -- click to rename"
        />
        {isDirty(state) && (
          <span className="unsaved-dot" title="Unsaved changes">
            &#9679;
          </span>
        )}
      </div>

      <div className="project-bar-group project-bar-cloud">
        <CloudControls />
      </div>

      <div className="project-bar-group project-bar-account">
        <AccountControls />
      </div>
    </div>
  );
}
