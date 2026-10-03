import { collectVariables, Expr } from "../expr/ast.js";
import { evaluateExpr, ExpressionEvalError, isReservedName } from "../expr/evaluate.js";
import { ExpressionSyntaxError, parseExpression } from "../expr/parse.js";
import { topoSort } from "../util/topoSort.js";

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ParamDefinition {
  name: string;
  source: string;
  expr: Expr | null;
  /** 1-based line number in the source text file, for error reporting. */
  line: number;
  parseError?: string;
}

export interface ParamsFile {
  definitions: ParamDefinition[];
}

export interface ParamIssue {
  param: string;
  line: number;
  message: string;
}

export interface ResolvedParams {
  /** Final numeric value of every successfully-evaluated parameter. */
  values: Map<string, number>;
  issues: ParamIssue[];
  /** Evaluation order actually used (topological). */
  order: string[];
}

/** Strips a trailing '#' comment from a line. */
function stripComment(line: string): string {
  const idx = line.indexOf("#");
  return idx === -1 ? line : line.slice(0, idx);
}

function brokenDefinition(name: string, source: string, line: number, parseError: string): ParamDefinition {
  return { name, source, expr: null, line, parseError };
}

/**
 * Parses a "simple text" params file: one `name = expression` per line.
 * Blank lines and full-line/trailing `#` comments are ignored. Definitions may
 * reference each other in any order; evaluation order is resolved later via
 * {@link resolveParams}.
 */
export function parseParamsFile(text: string): ParamsFile {
  const definitions: ParamDefinition[] = [];

  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const lineNo = i + 1;
    const line = stripComment(raw).trim();
    if (line.length === 0) return;

    const eq = line.indexOf("=");
    if (eq === -1) {
      definitions.push(brokenDefinition(`<line ${lineNo}>`, line, lineNo, `Expected 'name = expression', found: ${line}`));
      return;
    }

    const name = line.slice(0, eq).trim();
    const exprSource = line.slice(eq + 1).trim();

    if (!NAME_RE.test(name)) {
      definitions.push(
        brokenDefinition(
          name || `<line ${lineNo}>`,
          exprSource,
          lineNo,
          `Invalid parameter name '${name}' (must start with a letter or underscore)`,
        ),
      );
      return;
    }
    if (isReservedName(name)) {
      definitions.push(brokenDefinition(name, exprSource, lineNo, `'${name}' is a built-in constant/function and can't be redefined`));
      return;
    }

    try {
      definitions.push({ name, source: exprSource, expr: parseExpression(exprSource), line: lineNo });
    } catch (err) {
      const message = err instanceof ExpressionSyntaxError ? err.message : String(err);
      definitions.push(brokenDefinition(name, exprSource, lineNo, message));
    }
  });

  return { definitions };
}

/**
 * Resolves every parameter to a final number, evaluating in dependency order
 * and reporting cycles, duplicate definitions, undefined references, and
 * evaluation errors as issues rather than throwing, so a UI can surface them
 * inline next to the offending line.
 */
export function resolveParams(file: ParamsFile): ResolvedParams {
  const issues: ParamIssue[] = [];
  const valid = new Map<string, ParamDefinition>();

  for (const def of file.definitions) {
    if (def.parseError) {
      issues.push({ param: def.name, line: def.line, message: def.parseError });
    } else if (valid.has(def.name)) {
      issues.push({ param: def.name, line: def.line, message: `Duplicate definition of '${def.name}'` });
    } else {
      valid.set(def.name, def);
    }
  }

  const dependenciesOf = (def: ParamDefinition): string[] =>
    [...collectVariables(def.expr as Expr)].filter((v) => !isReservedName(v));

  for (const def of valid.values()) {
    for (const ref of dependenciesOf(def)) {
      if (!valid.has(ref)) {
        issues.push({ param: def.name, line: def.line, message: `'${def.name}' references undefined parameter '${ref}'` });
      }
    }
  }

  const { order, cyclic } = topoSort([...valid.values()], (d) => d.name, dependenciesOf);
  for (const def of cyclic) {
    issues.push({ param: def.name, line: def.line, message: `'${def.name}' is part of a circular reference` });
  }

  const values = new Map<string, number>();
  for (const def of order) {
    const deps = dependenciesOf(def);
    if (deps.some((d) => !valid.has(d))) continue; // already reported as an undefined reference
    const brokenDep = deps.find((d) => !values.has(d));
    if (brokenDep) {
      issues.push({ param: def.name, line: def.line, message: `'${def.name}' depends on '${brokenDep}', which has an error` });
      continue;
    }
    try {
      values.set(def.name, evaluateExpr(def.expr as Expr, (n) => values.get(n)));
    } catch (err) {
      const message = err instanceof ExpressionEvalError ? err.message : String(err);
      issues.push({ param: def.name, line: def.line, message });
    }
  }

  return { values, issues, order: order.map((d) => d.name) };
}

/** Convenience: parse + resolve in one call. */
export function loadParams(text: string): ResolvedParams {
  return resolveParams(parseParamsFile(text));
}
