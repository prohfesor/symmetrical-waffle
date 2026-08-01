import { Expr } from "./ast.js";

export class ExpressionEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionEvalError";
  }
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Built-in functions. Trig functions operate in degrees by default (natural for
 * drafting/dimensioning); `_rad` suffixed variants operate in radians for anyone
 * who wants them.
 */
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: (x) => Math.sin(x * DEG2RAD),
  cos: (x) => Math.cos(x * DEG2RAD),
  tan: (x) => Math.tan(x * DEG2RAD),
  asin: (x) => Math.asin(x) * RAD2DEG,
  acos: (x) => Math.acos(x) * RAD2DEG,
  atan: (x) => Math.atan(x) * RAD2DEG,
  atan2: (y, x) => Math.atan2(y, x) * RAD2DEG,
  sin_rad: (x) => Math.sin(x),
  cos_rad: (x) => Math.cos(x),
  tan_rad: (x) => Math.tan(x),
  asin_rad: (x) => Math.asin(x),
  acos_rad: (x) => Math.acos(x),
  atan_rad: (x) => Math.atan(x),
  atan2_rad: (y, x) => Math.atan2(y, x),
  deg: (x) => x * RAD2DEG,
  rad: (x) => x * DEG2RAD,
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x, digits) => {
    const d = digits === undefined ? 0 : digits;
    const f = Math.pow(10, d);
    return Math.round(x * f) / f;
  },
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
  pow: (x, y) => Math.pow(x, y),
  hypot: (...xs) => Math.hypot(...xs),
  ln: (x) => Math.log(x),
  log10: (x) => Math.log10(x),
  exp: (x) => Math.exp(x),
  sign: (x) => Math.sign(x),
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

export interface EvalScope {
  (name: string): number | undefined;
}

export function evaluateExpr(expr: Expr, scope: EvalScope): number {
  switch (expr.kind) {
    case "num":
      return expr.value;
    case "var": {
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, expr.name)) {
        return CONSTANTS[expr.name];
      }
      const v = scope(expr.name);
      if (v === undefined) {
        throw new ExpressionEvalError(`Undefined variable '${expr.name}'`);
      }
      return v;
    }
    case "call": {
      const fn = FUNCTIONS[expr.name];
      if (!fn) {
        throw new ExpressionEvalError(`Unknown function '${expr.name}'`);
      }
      const args = expr.args.map((a) => evaluateExpr(a, scope));
      return fn(...args);
    }
    case "unary": {
      const v = evaluateExpr(expr.arg, scope);
      return expr.op === "-" ? -v : v;
    }
    case "binary": {
      const l = evaluateExpr(expr.left, scope);
      const r = evaluateExpr(expr.right, scope);
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
          return l % r;
        case "^":
          return Math.pow(l, r);
      }
    }
  }
}

export function isKnownFunction(name: string): boolean {
  return name in FUNCTIONS;
}

export function isConstant(name: string): boolean {
  return name in CONSTANTS;
}
