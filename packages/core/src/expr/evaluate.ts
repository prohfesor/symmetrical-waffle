import { Expr } from "./ast.js";
import { DEG2RAD, RAD2DEG } from "../math.js";

export class ExpressionEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionEvalError";
  }
}

interface BuiltinFunction {
  fn: (...args: number[]) => number;
  /** Minimum and maximum argument counts (max = Infinity for variadic). */
  min: number;
  max: number;
}

const fixed = (arity: number, fn: (...args: number[]) => number): BuiltinFunction => ({ fn, min: arity, max: arity });
const variadic = (min: number, fn: (...args: number[]) => number): BuiltinFunction => ({ fn, min, max: Infinity });

/**
 * Built-in functions. Trig functions operate in degrees by default (natural for
 * drafting/dimensioning); `_rad` suffixed variants operate in radians for anyone
 * who wants them.
 */
const FUNCTIONS: Record<string, BuiltinFunction> = {
  sin: fixed(1, (x) => Math.sin(x * DEG2RAD)),
  cos: fixed(1, (x) => Math.cos(x * DEG2RAD)),
  tan: fixed(1, (x) => Math.tan(x * DEG2RAD)),
  asin: fixed(1, (x) => Math.asin(x) * RAD2DEG),
  acos: fixed(1, (x) => Math.acos(x) * RAD2DEG),
  atan: fixed(1, (x) => Math.atan(x) * RAD2DEG),
  atan2: fixed(2, (y, x) => Math.atan2(y, x) * RAD2DEG),
  sin_rad: fixed(1, Math.sin),
  cos_rad: fixed(1, Math.cos),
  tan_rad: fixed(1, Math.tan),
  asin_rad: fixed(1, Math.asin),
  acos_rad: fixed(1, Math.acos),
  atan_rad: fixed(1, Math.atan),
  atan2_rad: fixed(2, Math.atan2),
  deg: fixed(1, (x) => x * RAD2DEG),
  rad: fixed(1, (x) => x * DEG2RAD),
  sqrt: fixed(1, Math.sqrt),
  abs: fixed(1, Math.abs),
  floor: fixed(1, Math.floor),
  ceil: fixed(1, Math.ceil),
  round: { min: 1, max: 2, fn: (x, digits = 0) => Math.round(x * Math.pow(10, digits)) / Math.pow(10, digits) },
  min: variadic(1, Math.min),
  max: variadic(1, Math.max),
  pow: fixed(2, Math.pow),
  hypot: variadic(1, Math.hypot),
  ln: fixed(1, Math.log),
  log10: fixed(1, Math.log10),
  exp: fixed(1, Math.exp),
  sign: fixed(1, Math.sign),
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

export interface EvalScope {
  (name: string): number | undefined;
}

function describeArity(min: number, max: number): string {
  if (max === Infinity) return `at least ${min}`;
  return min === max ? String(min) : `${min} to ${max}`;
}

function evalNode(expr: Expr, scope: EvalScope): number {
  switch (expr.kind) {
    case "num":
      return expr.value;
    case "var": {
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, expr.name)) return CONSTANTS[expr.name];
      const v = scope(expr.name);
      if (v === undefined) throw new ExpressionEvalError(`Undefined variable '${expr.name}'`);
      return v;
    }
    case "call": {
      const builtin = Object.prototype.hasOwnProperty.call(FUNCTIONS, expr.name) ? FUNCTIONS[expr.name] : undefined;
      if (!builtin) throw new ExpressionEvalError(`Unknown function '${expr.name}'`);
      if (expr.args.length < builtin.min || expr.args.length > builtin.max) {
        throw new ExpressionEvalError(
          `${expr.name}() takes ${describeArity(builtin.min, builtin.max)} argument(s), got ${expr.args.length}`,
        );
      }
      return builtin.fn(...expr.args.map((a) => evalNode(a, scope)));
    }
    case "unary": {
      const v = evalNode(expr.arg, scope);
      return expr.op === "-" ? -v : v;
    }
    case "binary": {
      const l = evalNode(expr.left, scope);
      const r = evalNode(expr.right, scope);
      switch (expr.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          if (r === 0) throw new ExpressionEvalError("Division by zero");
          return l / r;
        case "%":
          if (r === 0) throw new ExpressionEvalError("Modulo by zero");
          return l % r;
        case "^":
          return Math.pow(l, r);
      }
    }
  }
}

/**
 * Evaluates an expression. Throws {@link ExpressionEvalError} for undefined
 * variables, unknown functions, wrong argument counts, and results that aren't
 * finite numbers (e.g. `sqrt(-1)`), so NaN/Infinity can never leak into geometry.
 */
export function evaluateExpr(expr: Expr, scope: EvalScope): number {
  const value = evalNode(expr, scope);
  if (!Number.isFinite(value)) throw new ExpressionEvalError("Result is not a finite number");
  return value;
}

export function isKnownFunction(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(FUNCTIONS, name);
}

export function isConstant(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONSTANTS, name);
}

/** Names a user-defined parameter may not take, because the evaluator would resolve them to a built-in first. */
export function isReservedName(name: string): boolean {
  return isConstant(name) || isKnownFunction(name);
}
