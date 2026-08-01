import { loadParams, ParamIssue } from "../params/paramsFile.js";
import { resolveDocument } from "./resolve.js";
import { ResolvedDrawing } from "./resolved-types.js";
import { DrawingDocument } from "./types.js";

export interface FullResolveResult {
  drawing: ResolvedDrawing;
  paramIssues: ParamIssue[];
  paramValues: Map<string, number>;
}

/**
 * Full pipeline: parse+resolve the params text file, then resolve the drawing
 * document's geometry and dimensions against those parameter values.
 * Geometry resolution still proceeds even if some params have issues, using
 * whatever values did resolve successfully -- entities referencing a broken
 * param surface their own issue instead of the whole document failing.
 */
export function resolveFullDocument(doc: DrawingDocument, paramsText: string): FullResolveResult {
  const resolvedParams = loadParams(paramsText);
  const drawing = resolveDocument(doc, (name) => resolvedParams.values.get(name));
  return { drawing, paramIssues: resolvedParams.issues, paramValues: resolvedParams.values };
}
