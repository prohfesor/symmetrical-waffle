export * from "./ast.js";
export * from "./tokenize.js";
export * from "./parse.js";
export * from "./evaluate.js";

import { collectVariables, Expr } from "./ast.js";
import { evaluateExpr, isReservedName } from "./evaluate.js";
import { parseExpression } from "./parse.js";

/**
 * A drafting value: either a bare literal number, or a formula string beginning
 * with '=' that references params-file variables, e.g. "=width/2 + 3".
 * This mirrors the familiar spreadsheet convention so users can tell at a glance
 * whether a field is driven or a fixed literal.
 */
export type Formula = number | string;

export function isFormulaString(v: Formula): v is string {
  return typeof v === "string";
}

export function formulaSource(v: Formula): string {
  if (typeof v === "number") return String(v);
  return v.startsWith("=") ? v.slice(1) : v;
}

const PARSE_CACHE_LIMIT = 2000;
const parseCache = new Map<string, Expr>();

/** Parses a formula, memoizing by source text: documents re-evaluate the same few formulas on every parameter edit. */
export function parseFormula(v: Formula): Expr {
  if (typeof v === "number") return { kind: "num", value: v };
  const source = formulaSource(v);
  const cached = parseCache.get(source);
  if (cached) return cached;
  const expr = parseExpression(source);
  if (parseCache.size >= PARSE_CACHE_LIMIT) parseCache.clear();
  parseCache.set(source, expr);
  return expr;
}

/** Variables a formula depends on (built-in constants and functions excluded). */
export function formulaVariables(v: Formula): Set<string> {
  const vars = collectVariables(parseFormula(v));
  for (const name of [...vars]) {
    if (isReservedName(name)) vars.delete(name);
  }
  return vars;
}

export function evaluateFormula(v: Formula, scope: (name: string) => number | undefined): number {
  return evaluateExpr(parseFormula(v), scope);
}
