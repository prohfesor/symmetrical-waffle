import { collectVariables, Expr } from "../expr/ast.js";
import { evaluateExpr, ExpressionEvalError, isConstant, isKnownFunction } from "../expr/evaluate.js";
import { ExpressionSyntaxError, parseExpression } from "../expr/parse.js";

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

/** Strips a trailing, unquoted '#' comment from a line. */
function stripComment(line: string): string {
  const idx = line.indexOf("#");
  return idx === -1 ? line : line.slice(0, idx);
}

/**
 * Parses a "simple text" params file: one `name = expression` per line.
 * Blank lines and full-line/trailing `#` comments are ignored. Definitions may
 * reference each other in any order; evaluation order is resolved later via
 * {@link resolveParams}.
 */
export function parseParamsFile(text: string): ParamsFile {
  const definitions: ParamDefinition[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  lines.forEach((raw, i) => {
    const line = stripComment(raw).trim();
    if (line.length === 0) return;

    const eq = line.indexOf("=");
    if (eq === -1) {
      definitions.push({
        name: `<line ${i + 1}>`,
        source: line,
        expr: null,
        line: i + 1,
        parseError: `Expected 'name = expression', found: ${line}`,
      });
      return;
    }

    const name = line.slice(0, eq).trim();
    const exprSource = line.slice(eq + 1).trim();

    if (!NAME_RE.test(name)) {
      definitions.push({
        name: name || `<line ${i + 1}>`,
        source: exprSource,
        expr: null,
        line: i + 1,
        parseError: `Invalid parameter name '${name}' (must start with a letter or underscore)`,
      });
      return;
    }

    try {
      const expr = parseExpression(exprSource);
      definitions.push({ name, source: exprSource, expr, line: i + 1 });
    } catch (err) {
      const msg = err instanceof ExpressionSyntaxError ? err.message : String(err);
      definitions.push({ name, source: exprSource, expr: null, line: i + 1, parseError: msg });
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
  const byName = new Map<string, ParamDefinition>();

  for (const def of file.definitions) {
    if (def.parseError) {
      issues.push({ param: def.name, line: def.line, message: def.parseError });
      continue;
    }
    if (byName.has(def.name)) {
      issues.push({ param: def.name, line: def.line, message: `Duplicate definition of '${def.name}'` });
      continue;
    }
    byName.set(def.name, def);
  }

  // Build dependency graph (edges: dependency -> dependent).
  const deps = new Map<string, Set<string>>();
  for (const [name, def] of byName) {
    const vars = collectVariables(def.expr as Expr);
    const referenced = new Set<string>();
    for (const v of vars) {
      if (isConstant(v) || isKnownFunction(v)) continue;
      referenced.add(v);
    }
    deps.set(name, referenced);
  }

  for (const [name, refs] of deps) {
    for (const r of refs) {
      if (!byName.has(r)) {
        issues.push({
          param: name,
          line: byName.get(name)!.line,
          message: `'${name}' references undefined parameter '${r}'`,
        });
      }
    }
  }

  // Kahn's algorithm topological sort over params that have all deps resolvable.
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const name of byName.keys()) {
    inDegree.set(name, 0);
    dependents.set(name, []);
  }
  for (const [name, refs] of deps) {
    for (const r of refs) {
      if (!byName.has(r)) continue; // already reported as undefined-reference issue
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      dependents.get(r)!.push(name);
    }
  }

  const queue: string[] = [];
  for (const [name, deg] of inDegree) if (deg === 0) queue.push(name);
  queue.sort();

  const order: string[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    order.push(name);
    for (const dep of dependents.get(name) ?? []) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1);
      if (inDegree.get(dep) === 0) queue.push(dep);
    }
    queue.sort();
  }

  const resolvedNames = new Set(order);
  for (const name of byName.keys()) {
    if (!resolvedNames.has(name)) {
      issues.push({
        param: name,
        line: byName.get(name)!.line,
        message: `'${name}' is part of a circular reference`,
      });
    }
  }

  const values = new Map<string, number>();
  for (const name of order) {
    const def = byName.get(name)!;
    try {
      const v = evaluateExpr(def.expr as Expr, (n) => values.get(n));
      values.set(name, v);
    } catch (err) {
      const msg = err instanceof ExpressionEvalError ? err.message : String(err);
      issues.push({ param: name, line: def.line, message: msg });
    }
  }

  return { values, issues, order };
}

/** Convenience: parse + resolve in one call. */
export function loadParams(text: string): ResolvedParams {
  return resolveParams(parseParamsFile(text));
}
