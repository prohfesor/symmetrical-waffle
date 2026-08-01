import { describe, expect, it } from "vitest";
import { evaluateFormula, formulaVariables } from "./index.js";
import { parseExpression } from "./parse.js";
import { evaluateExpr, ExpressionEvalError } from "./evaluate.js";
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
});
