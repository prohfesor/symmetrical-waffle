import { useCallback, useState } from "react";
import { createCloudDrawing, deleteCloudDrawing, getCloudDrawing, logout, updateCloudDrawing } from "../io/cloudApi.js";
import { normalizeDocument } from "../io/projectFile.js";
import { errorMessage } from "../util/errors.js";
import { useAppState, useDispatch } from "./store.js";

/** Operations against the signed-in account's saved drawings, with shared busy/error state for the UI. */
export function useCloudActions() {
  const state = useAppState();
  const dispatch = useDispatch();
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

  /** Loads a saved (or shared public) drawing into the editor. */
  const open = useCallback(
    (id: string) =>
      run(async () => {
        const full = await getCloudDrawing(id);
        dispatch({
          type: "LOAD_PROJECT",
          project: { document: normalizeDocument(full.document), paramsText: full.paramsText },
          binding: { id: full.id, visibility: full.visibility, isOwner: full.isOwner === true },
        });
      }),
    [dispatch, run],
  );

  /** Saves the current drawing: updates its cloud copy if it's ours, otherwise creates a new (private) one. */
  const save = useCallback(
    (asCopy = false) => {
      if (!state.cloudUser) {
        dispatch({ type: "SET_LOGIN_DIALOG", open: true });
        return Promise.resolve();
      }
      const { document, paramsText, cloudBinding } = state;
      return run(async () => {
        if (!asCopy && cloudBinding?.isOwner) {
          await updateCloudDrawing(cloudBinding.id, { title: document.title?.trim() || "Untitled", document, paramsText });
          dispatch({ type: "MARK_SAVED" });
        } else {
          const created = await createCloudDrawing(document.title?.trim() || "Untitled", document, paramsText, "private");
          dispatch({ type: "MARK_SAVED", binding: { id: created.id, visibility: created.visibility, isOwner: true } });
        }
      });
    },
    [dispatch, run, state],
  );

  const setVisibility = useCallback(
    (visibility: "private" | "public") => {
      const binding = state.cloudBinding;
      if (!binding) return Promise.resolve();
      return run(async () => {
        const updated = await updateCloudDrawing(binding.id, { visibility });
        dispatch({ type: "SET_CLOUD_BINDING", binding: { id: updated.id, visibility: updated.visibility, isOwner: true } });
      });
    },
    [dispatch, run, state.cloudBinding],
  );

  const remove = useCallback(
    (id: string) =>
      run(async () => {
        await deleteCloudDrawing(id);
        if (state.cloudBinding?.id === id) dispatch({ type: "SET_CLOUD_BINDING", binding: null });
      }),
    [dispatch, run, state.cloudBinding?.id],
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
