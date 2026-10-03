import { useCallback, useMemo, useState } from "react";
import { logout } from "../io/cloudApi.js";
import { ProjectStore, storeFor } from "../io/projectStore.js";
import { normalizeDocument } from "../io/projectFile.js";
import { errorMessage } from "../util/errors.js";
import { useAppState, useDispatch } from "./store.js";

/** The store saved projects currently go to (the account's, or this browser's). */
export function useProjectStore(): ProjectStore {
  const { storage } = useAppState();
  return useMemo(() => storeFor(storage), [storage]);
}

/** Operations on saved projects, with shared busy/error state for the UI. */
export function useCloudActions() {
  const state = useAppState();
  const dispatch = useDispatch();
  const store = useProjectStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Runs `op`, tracking busy/error state; resolves to its result, or undefined if it failed. */
  const run = useCallback(async <T>(op: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await op();
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Loads a saved (or shared public) project into the editor. */
  const open = useCallback(
    (id: string) =>
      run(async () => {
        const full = await store.get(id);
        dispatch({
          type: "LOAD_PROJECT",
          project: { document: normalizeDocument(full.document), paramsText: full.paramsText },
          binding: { id: full.id, visibility: full.visibility, isOwner: full.isOwner === true },
        });
      }),
    [dispatch, run, store],
  );

  /** Saves the current drawing: updates its saved copy if it's ours, otherwise creates a new (private) one. */
  const save = useCallback(
    (asCopy = false) => {
      if (state.storage === "account" && !state.cloudUser) {
        dispatch({ type: "SET_LOGIN_DIALOG", open: true });
        return Promise.resolve();
      }
      const { document, paramsText, cloudBinding } = state;
      const title = document.title?.trim() || "Untitled";
      return run(async () => {
        if (!asCopy && cloudBinding?.isOwner) {
          await store.update(cloudBinding.id, { title, document, paramsText });
          dispatch({ type: "MARK_SAVED" });
        } else {
          const created = await store.create(title, document, paramsText);
          dispatch({ type: "MARK_SAVED", binding: { id: created.id, visibility: created.visibility, isOwner: true } });
        }
      });
    },
    [dispatch, run, state, store],
  );

  const setVisibility = useCallback(
    (visibility: "private" | "public") => {
      const binding = state.cloudBinding;
      if (!binding) return Promise.resolve();
      return run(async () => {
        const updated = await store.update(binding.id, { visibility });
        dispatch({ type: "SET_CLOUD_BINDING", binding: { id: updated.id, visibility: updated.visibility, isOwner: true } });
      });
    },
    [dispatch, run, state.cloudBinding, store],
  );

  const remove = useCallback(
    (id: string) =>
      run(async () => {
        await store.remove(id);
        if (state.cloudBinding?.id === id) dispatch({ type: "SET_CLOUD_BINDING", binding: null });
      }),
    [dispatch, run, state.cloudBinding?.id, store],
  );

  const signOut = useCallback(
    () =>
      run(async () => {
        await logout();
        dispatch({ type: "SET_CLOUD_USER", user: null, loginMode: state.cloudLoginMode });
      }),
    [dispatch, run, state.cloudLoginMode],
  );

  return { busy, error, clearError: () => setError(null), open, save, setVisibility, remove, signOut };
}
