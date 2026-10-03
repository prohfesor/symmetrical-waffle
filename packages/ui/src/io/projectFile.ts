import { createEmptyDocument, DOCUMENT_FORMAT_VERSION, DrawingDocument } from "@pcad/core";
import type { Project } from "../state/reducer.js";

export const PROJECT_FORMAT_VERSION = 1;

export interface ProjectFile extends Project {
  formatVersion: number;
}

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

/**
 * Checks that untrusted JSON (a file, a draft, a server response) has the shape of a drawing,
 * filling in anything optional that's missing, so the rest of the app can rely on it.
 */
export function normalizeDocument(raw: unknown): DrawingDocument {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new ProjectFormatError("Not a parametric CAD project: the drawing is missing");
  const doc = raw as Partial<DrawingDocument>;
  if (!Array.isArray(doc.entities) || !Array.isArray(doc.dimensions)) {
    throw new ProjectFormatError("Not a parametric CAD project: the drawing has no entities/dimensions lists");
  }
  if (typeof doc.formatVersion === "number" && doc.formatVersion > DOCUMENT_FORMAT_VERSION) {
    throw new ProjectFormatError(`This drawing was made by a newer version of the app (format ${doc.formatVersion}); update to open it`);
  }
  return { ...createEmptyDocument(), ...doc, entities: doc.entities, dimensions: doc.dimensions };
}

/** Project files bundle the drawing and its params text; the params text inside is the plain "name = expression" format. */
export function serializeProject(document: DrawingDocument, paramsText: string): string {
  const project: ProjectFile = { formatVersion: PROJECT_FORMAT_VERSION, document, paramsText };
  return JSON.stringify(project, null, 2);
}

export function parseProject(text: string): ProjectFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFormatError("Not a parametric CAD project: the file is not valid JSON");
  }
  if (typeof data !== "object" || data === null) throw new ProjectFormatError("Not a parametric CAD project");
  const file = data as { formatVersion?: unknown; document?: unknown; paramsText?: unknown };
  if (typeof file.formatVersion === "number" && file.formatVersion > PROJECT_FORMAT_VERSION) {
    throw new ProjectFormatError(`This project file is from a newer version of the app (format ${file.formatVersion}); update to open it`);
  }
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    document: normalizeDocument(file.document),
    paramsText: typeof file.paramsText === "string" ? file.paramsText : "",
  };
}
