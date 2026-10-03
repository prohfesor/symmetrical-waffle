import { useEffect, useState } from "react";
import { getMe } from "../io/cloudApi.js";
import { readAutosave } from "../io/autosave.js";
import { BUILT_FOR_LOCAL_STORAGE } from "../io/projectStore.js";
import { decodeSnapshot, isSnapshotHash } from "../io/snapshotLink.js";
import { errorMessage } from "../util/errors.js";
import { useDispatch } from "./store.js";
import { useCloudActions } from "./useCloudActions.js";

const SHARED_PROJECT = /^#\/d\/([0-9a-f-]+)$/i;

/**
 * One-time startup: find out whether there's a server to sign in to (else fall back to saving in
 * the browser), then open whatever the URL points at -- a share link -- or restore the autosaved work.
 * Returns an error to show if the link couldn't be opened.
 */
export function useStartup(): string | null {
  const dispatch = useDispatch();
  const cloud = useCloudActions();
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!BUILT_FOR_LOCAL_STORAGE) {
      getMe()
        .then((r) => dispatch({ type: "SET_CLOUD_USER", user: r.user, loginMode: r.loginMode }))
        // No server reachable (e.g. a static host): everything still works, projects are kept in the browser.
        .catch(() => dispatch({ type: "SET_STORAGE", storage: "local" }));
    }

    const hash = window.location.hash;
    const shared = hash.match(SHARED_PROJECT);
    if (isSnapshotHash(hash)) {
      decodeSnapshot(hash)
        .then((project) => dispatch({ type: "LOAD_PROJECT", project, binding: null }))
        .catch((err) => setLinkError(errorMessage(err)));
    } else if (shared) {
      void cloud.open(shared[1]); // a failure surfaces through cloud.error
    } else {
      const saved = readAutosave();
      if (saved) dispatch({ type: "LOAD_PROJECT", project: saved, binding: saved.binding, restored: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return linkError ?? cloud.error;
}
