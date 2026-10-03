import type { Visibility } from "./db";

export const LIMITS = {
  titleMaxLength: 200,
  paramsTextMaxLength: 200_000,
} as const;

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export interface DrawingInput {
  title: string;
  document: Record<string, unknown>;
  paramsText: string;
  visibility: Visibility;
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function checkTitle(value: unknown): Validation<string> {
  if (typeof value !== "string") return fail("title must be a string");
  const title = value.trim();
  if (title.length === 0) return fail("title must not be empty");
  if (title.length > LIMITS.titleMaxLength) return fail(`title must be at most ${LIMITS.titleMaxLength} characters`);
  return { ok: true, value: title };
}

/** The server stores documents opaquely, but insists on the shape every client depends on. */
function checkDocument(value: unknown): Validation<Record<string, unknown>> {
  if (!isRecord(value)) return fail("document must be an object");
  if (!Array.isArray(value.entities)) return fail("document.entities must be an array");
  if (!Array.isArray(value.dimensions)) return fail("document.dimensions must be an array");
  return { ok: true, value };
}

function checkParamsText(value: unknown): Validation<string> {
  if (typeof value !== "string") return fail("paramsText must be a string");
  if (value.length > LIMITS.paramsTextMaxLength) return fail(`paramsText must be at most ${LIMITS.paramsTextMaxLength} characters`);
  return { ok: true, value };
}

function checkVisibility(value: unknown): Validation<Visibility> {
  return value === "private" || value === "public" ? { ok: true, value } : fail("visibility must be 'private' or 'public'");
}

export function validateNewDrawing(body: unknown): Validation<DrawingInput> {
  if (!isRecord(body)) return fail("request body must be a JSON object");
  const title = checkTitle(body.title);
  if (!title.ok) return title;
  const document = checkDocument(body.document);
  if (!document.ok) return document;
  const paramsText = checkParamsText(body.paramsText);
  if (!paramsText.ok) return paramsText;
  const visibility = body.visibility === undefined ? ({ ok: true, value: "private" } as const) : checkVisibility(body.visibility);
  if (!visibility.ok) return visibility;
  return { ok: true, value: { title: title.value, document: document.value, paramsText: paramsText.value, visibility: visibility.value } };
}

const CHECKS: { [K in keyof DrawingInput]: (value: unknown) => Validation<DrawingInput[K]> } = {
  title: checkTitle,
  document: checkDocument,
  paramsText: checkParamsText,
  visibility: checkVisibility,
};

/** A partial update: every field is optional, but at least one must be present and each present one must be valid. */
export function validateDrawingPatch(body: unknown): Validation<Partial<DrawingInput>> {
  if (!isRecord(body)) return fail("request body must be a JSON object");
  const patch: Partial<DrawingInput> = {};
  for (const key of Object.keys(CHECKS) as (keyof DrawingInput)[]) {
    if (body[key] === undefined) continue;
    const result = CHECKS[key](body[key]);
    if (!result.ok) return result;
    Object.assign(patch, { [key]: result.value });
  }
  return Object.keys(patch).length === 0 ? fail("nothing to update") : { ok: true, value: patch };
}
