export type Expr =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "call"; name: string; args: Expr[] }
  | { kind: "unary"; op: "-" | "+"; arg: Expr }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "%" | "^"; left: Expr; right: Expr };

/** Collects every distinct variable identifier referenced anywhere in the expression tree. */
export function collectVariables(expr: Expr, out: Set<string> = new Set()): Set<string> {
  switch (expr.kind) {
    case "num":
      break;
    case "var":
      out.add(expr.name);
      break;
    case "call":
      for (const a of expr.args) collectVariables(a, out);
      break;
    case "unary":
      collectVariables(expr.arg, out);
      break;
    case "binary":
      collectVariables(expr.left, out);
      collectVariables(expr.right, out);
      break;
  }
  return out;
}
