import { useEffect, useRef } from "react";
import { clearAutosave, writeAutosave } from "../io/autosave.js";
import { isDirty } from "./reducer.js";
import { useAppState } from "./store.js";

const DELAY_MS = 600;

/** Keeps the unsaved working copy in localStorage while it differs from the saved one (see io/autosave.ts). */
export function useAutosave(): void {
  const state = useAppState();
  const dirty = isDirty(state);
  const wasDirty = useRef(false);

  useEffect(() => {
    if (!dirty) {
      // Only discard on the way from unsaved to saved: at startup the stored copy is still waiting to be restored.
      if (wasDirty.current) clearAutosave();
      wasDirty.current = false;
      return;
    }
    wasDirty.current = true;
    const timer = setTimeout(() => writeAutosave({ document: state.document, paramsText: state.paramsText }, state.cloudBinding), DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, state.document, state.paramsText, state.cloudBinding]);
}
