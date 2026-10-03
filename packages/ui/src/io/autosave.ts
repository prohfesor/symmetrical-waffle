import type { CloudBinding, Project } from "../state/reducer.js";
import { normalizeDocument } from "./projectFile.js";

/**
 * The working copy is kept in localStorage while it has unsaved changes, so a reload,
 * a crash or the sign-in redirect doesn't lose the work. It is cleared once the project is saved.
 */
const KEY = "pcad:autosave";

export interface Autosaved extends Project {
  binding: CloudBinding | null;
}

export function writeAutosave(project: Project, binding: CloudBinding | null): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ document: project.document, paramsText: project.paramsText, binding }));
  } catch {
    // Storage unavailable or full (private browsing, quota): autosave is best-effort.
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The autosaved working copy, if there is a usable one. A corrupt entry is discarded. */
export function readAutosave(): Autosaved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const data = JSON.parse(raw) as { document?: unknown; paramsText?: unknown; binding?: CloudBinding | null };
    return {
      document: normalizeDocument(data.document),
      paramsText: typeof data.paramsText === "string" ? data.paramsText : "",
      binding: data.binding ?? null,
    };
  } catch {
    clearAutosave();
    return null;
  }
}
