import { useEffect, useRef } from "react";
import { isTypingTarget } from "../canvas/useModifierKeys.js";
import { TOOL_SHORTCUTS } from "../tools/types.js";
import { useAppState, useDispatch } from "./store.js";

/** The letter on a key press, independent of keyboard layout ("KeyL" -> "L", so it works on a Ukrainian layout too). */
export function shortcutLetter(e: Pick<KeyboardEvent, "code">): string | null {
  return e.code.startsWith("Key") ? e.code.slice(3) : null;
}

/** Global single-key shortcuts: tool letters, F3/F9 snap toggles and Delete. */
export function useShortcuts(): void {
  const state = useAppState();
  const dispatch = useDispatch();
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const { selection } = latest.current;

      if (e.key === "F3") {
        e.preventDefault();
        dispatch({ type: "TOGGLE_OBJECT_SNAP" });
      } else if (e.key === "F9") {
        e.preventDefault();
        dispatch({ type: "TOGGLE_GRID_SNAP" });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selection?.kind === "entity") dispatch({ type: "REMOVE_ENTITY", id: selection.id });
        else if (selection?.kind === "dimension") dispatch({ type: "REMOVE_DIMENSION", id: selection.id });
      } else {
        const letter = shortcutLetter(e);
        const tool = letter && TOOL_SHORTCUTS[letter];
        if (tool) dispatch({ type: "SET_TOOL", tool });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);
}
