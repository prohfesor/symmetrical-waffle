import { useEffect, useState } from "react";

/** True while the user is typing into a form control, where single-key shortcuts must not fire. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

export interface Modifiers {
  /** Space held: drag pans, whatever the tool (the Figma/Illustrator/Photoshop convention). */
  space: boolean;
  /** Shift held: constrain directions to 15-degree steps. */
  shift: boolean;
}

/**
 * Tracks the held state of Space and Shift. Both reset when the window loses
 * focus, since the key-up would otherwise be missed and leave the mode stuck on.
 */
export function useModifierKeys(): Modifiers {
  const [mods, setMods] = useState<Modifiers>({ space: false, shift: false });

  useEffect(() => {
    function set(patch: Partial<Modifiers>) {
      setMods((m) => (Object.entries(patch).every(([k, v]) => m[k as keyof Modifiers] === v) ? m : { ...m, ...patch }));
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") set({ shift: true });
      // Space on a focused button should still press it, and in a text field it types a space.
      else if (e.code === "Space" && !isTypingTarget(e.target) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        set({ space: true });
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") set({ shift: false });
      else if (e.code === "Space") set({ space: false });
    }
    function onBlur() {
      set({ space: false, shift: false });
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return mods;
}
