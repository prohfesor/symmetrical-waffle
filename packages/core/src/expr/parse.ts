import { Expr } from "./ast.js";
import { ExpressionSyntaxError, Token, tokenize } from "./tokenize.js";

/**
 * Recursive-descent parser for arithmetic expressions.
 *
 * Grammar (lowest to highest precedence):
 *   expr   := term (('+'|'-') term)*
 *   term   := unary (('*'|'/'|'%') unary)*
 *   unary  := ('-'|'+') unary | power
 *   power  := primary ('^' unary)?        // right-associative; exponent may itself be unary (e.g. 2^-2)
 *   primary:= NUMBER | IDENT | IDENT '(' (expr (',' expr)*)? ')' | '(' expr ')'
 *
 * Note unary wraps *around* power (not the reverse), so "-2^2" parses as
 * -(2^2) = -4, matching conventional math notation and every mainstream
 * language's operator precedence (Python, JS `**`, etc).
 */
export function parseExpression(source: string): Expr {
  const tokens = tokenize(source);
  let pos = 0;

  function peek(): Token {
    return tokens[pos];
  }
  function next(): Token {
    return tokens[pos++];
  }
  function expect(type: Token["type"]): Token {
    const t = peek();
    if (t.type !== type) {
      throw new ExpressionSyntaxError(`Expected '${type}' but found '${t.value || t.type}'`, t.pos);
    }
    return next();
  }

  function parseExpr(): Expr {
    let left = parseTerm();
    for (;;) {
      const t = peek();
      if (t.type === "+" || t.type === "-") {
        next();
        const right = parseTerm();
        left = { kind: "binary", op: t.type, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm(): Expr {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t.type === "*" || t.type === "/" || t.type === "%") {
        next();
        const right = parseUnary();
        left = { kind: "binary", op: t.type, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  function parseUnary(): Expr {
    const t = peek();
    if (t.type === "-" || t.type === "+") {
      next();
      const arg = parseUnary();
      return { kind: "unary", op: t.type, arg };
    }
    return parsePower();
  }

  function parsePower(): Expr {
    const base = parsePrimary();
    const t = peek();
    if (t.type === "^") {
      next();
      const exponent = parseUnary(); // right-associative, and allows e.g. 2^-2
      return { kind: "binary", op: "^", left: base, right: exponent };
    }
    return base;
  }

  function parsePrimary(): Expr {
    const t = peek();
    if (t.type === "number") {
      next();
      return { kind: "num", value: parseFloat(t.value) };
    }
    if (t.type === "(") {
      next();
      const inner = parseExpr();
      expect(")");
      return inner;
    }
    if (t.type === "ident") {
      next();
      if (peek().type === "(") {
        next();
        const args: Expr[] = [];
        if (peek().type !== (")" as Token["type"])) {
          args.push(parseExpr());
          while (peek().type === ",") {
            next();
            args.push(parseExpr());
          }
        }
        expect(")");
        return { kind: "call", name: t.value, args };
      }
      return { kind: "var", name: t.value };
    }
    throw new ExpressionSyntaxError(`Unexpected token '${t.value || t.type}'`, t.pos);
  }

  const result = parseExpr();
  if (peek().type !== "eof") {
    throw new ExpressionSyntaxError(`Unexpected trailing input '${peek().value}'`, peek().pos);
  }
  return result;
}

export { ExpressionSyntaxError };
