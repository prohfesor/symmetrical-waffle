import type { Project } from "../state/reducer.js";
import { normalizeDocument } from "./projectFile.js";

/**
 * Signing in (both the dev-login stub and real Google OAuth) is a full-page
 * redirect, which reloads the whole SPA and would otherwise silently lose
 * whatever the user was editing. Stash it in localStorage right before
 * navigating away, and restore it once on the next load.
 */
const DRAFT_KEY = "pcad:draft";

export function saveDraftBeforeRedirect({ document, paramsText }: Project): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ document, paramsText }));
  } catch {
    // localStorage unavailable (private browsing, quota, ...) -- not worth blocking sign-in over.
  }
}

/** Reads and clears the stashed draft, if any. Call once on app mount. */
export function takeDraft(): Project | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return null;
    localStorage.removeItem(DRAFT_KEY);
    const draft = JSON.parse(raw) as { document?: unknown; paramsText?: unknown };
    return { document: normalizeDocument(draft.document), paramsText: typeof draft.paramsText === "string" ? draft.paramsText : "" };
  } catch {
    return null; // missing storage or a corrupt draft: start fresh
  }
}
