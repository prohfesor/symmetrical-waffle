import { DrawingDocument } from "@pcad/core";

/**
 * Signing in (both the dev-login stub and real Google OAuth) is a full-page
 * redirect, which reloads the whole SPA and would otherwise silently lose
 * whatever the user was editing. Stash it in localStorage right before
 * navigating away, and restore it once on the next load.
 */
const DRAFT_KEY = "pcad:draft";

interface Draft {
  document: DrawingDocument;
  paramsText: string;
}

export function saveDraftBeforeRedirect(document: DrawingDocument, paramsText: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ document, paramsText } satisfies Draft));
  } catch {
    // localStorage unavailable (private browsing, quota, ...) -- not worth blocking sign-in over.
  }
}

/** Reads and clears the stashed draft, if any. Call once on app mount. */
export function takeDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    localStorage.removeItem(DRAFT_KEY);
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}
