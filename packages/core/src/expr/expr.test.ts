import { describe, expect, it } from "vitest";
import { evaluateFormula, formulaVariables } from "./index.js";
import { parseExpression } from "./parse.js";
import { evaluateExpr, ExpressionEvalError, isConstant, isKnownFunction } from "./evaluate.js";
import { ExpressionSyntaxError } from "./tokenize.js";

describe("expression parser/evaluator", () => {
  it("evaluates arithmetic with correct precedence", () => {
    expect(evaluateExpr(parseExpression("2 + 3 * 4"), () => undefined)).toBe(14);
    expect(evaluateExpr(parseExpression("(2 + 3) * 4"), () => undefined)).toBe(20);
    expect(evaluateExpr(parseExpression("2 ^ 3 ^ 2"), () => undefined)).toBe(512); // right-associative
    expect(evaluateExpr(parseExpression("-2 ^ 2"), () => undefined)).toBe(-4); // power binds tighter than unary minus
    expect(evaluateExpr(parseExpression("2 ^ -2"), () => undefined)).toBeCloseTo(0.25, 10); // negative exponent
  });

  it("supports variables via scope", () => {
    const scope = (name: string) => ({ width: 100, height: 50 } as Record<string, number>)[name];
    expect(evaluateFormula("=width / 2 + height", scope)).toBe(100);
  });

  it("supports built-in functions and constants", () => {
    expect(evaluateExpr(parseExpression("sqrt(16)"), () => undefined)).toBe(4);
    expect(evaluateExpr(parseExpression("round(pi, 2)"), () => undefined)).toBeCloseTo(3.14, 5);
    expect(evaluateExpr(parseExpression("sin(90)"), () => undefined)).toBeCloseTo(1, 10);
    expect(evaluateExpr(parseExpression("max(1,5,3)"), () => undefined)).toBe(5);
  });

  it("collects referenced variables, excluding constants and functions", () => {
    const vars = formulaVariables("=width/2 + sqrt(height) - pi");
    expect([...vars].sort()).toEqual(["height", "width"]);
  });

  it("throws a syntax error for malformed expressions", () => {
    expect(() => parseExpression("1 + ")).toThrow(ExpressionSyntaxError);
    expect(() => parseExpression("(1 + 2")).toThrow(ExpressionSyntaxError);
  });

  it("throws an eval error for undefined variables", () => {
    expect(() => evaluateFormula("=undefinedVar", () => undefined)).toThrow(ExpressionEvalError);
  });

  it("throws on division by zero", () => {
    expect(() => evaluateExpr(parseExpression("1/0"), () => undefined)).toThrow(ExpressionEvalError);
  });

  it("treats a bare number formula as a literal", () => {
    expect(evaluateFormula(42, () => undefined)).toBe(42);
  });

  it("accepts numbers written with a leading dot and exponents", () => {
    expect(evaluateExpr(parseExpression(".5 + 1e2 + 2.5E-1"), () => undefined)).toBeCloseTo(100.75, 10);
  });

  it("does not let identifiers swallow dots (so 'a.b' is a syntax error, not a variable)", () => {
    expect(() => parseExpression("width.5")).toThrow(ExpressionSyntaxError);
  });

  it("rejects wrong argument counts with a clear message", () => {
    expect(() => evaluateExpr(parseExpression("sqrt()"), () => undefined)).toThrow(/sqrt\(\) takes 1 argument/);
    expect(() => evaluateExpr(parseExpression("atan2(1)"), () => undefined)).toThrow(/atan2\(\) takes 2/);
    expect(() => evaluateExpr(parseExpression("max()"), () => undefined)).toThrow(/at least 1/);
    expect(evaluateExpr(parseExpression("round(3.14159, 2)"), () => undefined)).toBe(3.14);
  });

  it("never lets NaN or Infinity escape as a result", () => {
    expect(() => evaluateExpr(parseExpression("sqrt(-1)"), () => undefined)).toThrow(/not a finite number/);
    expect(() => evaluateExpr(parseExpression("10 % 0"), () => undefined)).toThrow(/Modulo by zero/);
    expect(() => evaluateExpr(parseExpression("exp(1000)"), () => undefined)).toThrow(/not a finite number/);
  });

  it("does not mistake Object.prototype members for built-ins", () => {
    expect(() => evaluateExpr(parseExpression("constructor(1)"), () => undefined)).toThrow(/Unknown function/);
    expect(isKnownFunction("toString")).toBe(false);
    expect(isConstant("hasOwnProperty")).toBe(false);
  });
});
