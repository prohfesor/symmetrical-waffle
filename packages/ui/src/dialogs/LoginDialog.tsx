import React, { useState } from "react";
import { devLoginUrl, googleLoginUrl } from "../io/cloudApi.js";
import { saveDraftBeforeRedirect } from "../io/localDraft.js";
import { useAppState, useDispatch } from "../state/store.js";

export function LoginDialog() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [email, setEmail] = useState("dev@example.com");
  const [name, setName] = useState("Dev User");

  // Signing in is a full-page redirect (both the dev stub and real Google OAuth), which
  // reloads the whole app -- stash whatever's being edited so it survives the round trip.
  function goToLogin(url: string) {
    saveDraftBeforeRedirect(state.document, state.paramsText);
    window.location.href = url;
  }

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: "SET_LOGIN_DIALOG", open: false })}>
      <div className="modal login-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Sign in</h2>
        <p className="panel-help">Sign in to save drawings to your account and share them.</p>
        {state.cloudDevMode ? (
          <>
            <p className="panel-help">
              <strong>Google sign-in isn't configured on this server yet</strong> -- using a development-only stub login
              instead. See the README for how to add real Google OAuth credentials.
            </p>
            <label className="formula-field">
              <span>Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="formula-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="modal-actions">
              <button onClick={() => dispatch({ type: "SET_LOGIN_DIALOG", open: false })}>Cancel</button>
              <button className="primary" onClick={() => goToLogin(devLoginUrl(email, name))}>
                Dev Sign In
              </button>
            </div>
          </>
        ) : (
          <div className="modal-actions">
            <button onClick={() => dispatch({ type: "SET_LOGIN_DIALOG", open: false })}>Cancel</button>
            <button className="primary" onClick={() => goToLogin(googleLoginUrl())}>
              Sign in with Google
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
