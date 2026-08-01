export * from "./ast.js";
export * from "./tokenize.js";
export * from "./parse.js";
export * from "./evaluate.js";

import { collectVariables, Expr } from "./ast.js";
import { evaluateExpr, isConstant, isKnownFunction } from "./evaluate.js";
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

export function parseFormula(v: Formula): Expr {
  if (typeof v === "number") return { kind: "num", value: v };
  return parseExpression(formulaSource(v));
}

export function formulaVariables(v: Formula): Set<string> {
  const expr = parseFormula(v);
  const vars = collectVariables(expr);
  for (const name of [...vars]) {
    if (isConstant(name) || isKnownFunction(name)) vars.delete(name);
  }
  return vars;
}

export function evaluateFormula(v: Formula, scope: (name: string) => number | undefined): number {
  const expr = parseFormula(v);
  return evaluateExpr(expr, scope);
}
