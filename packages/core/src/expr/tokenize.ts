export type TokenType =
  | "number"
  | "ident"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "^"
  | "("
  | ")"
  | ","
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const SINGLE_CHAR_TOKENS: Record<string, TokenType> = {
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "%": "%",
  "^": "^",
  "(": "(",
  ")": ")",
  ",": ",",
};

export class ExpressionSyntaxError extends Error {
  constructor(message: string, public readonly pos: number) {
    super(message);
    this.name = "ExpressionSyntaxError";
  }
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= "0" && c <= "9";

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    // Numbers: 12, 12.5, .5, 1e3, 2.5E-4
    if (isDigit(c) || (c === "." && isDigit(source[i + 1]))) {
      const start = i;
      while (isDigit(source[i])) i++;
      if (source[i] === ".") {
        i++;
        while (isDigit(source[i])) i++;
      }
      if (source[i] === "e" || source[i] === "E") {
        const save = i;
        i++;
        if (source[i] === "+" || source[i] === "-") i++;
        if (isDigit(source[i])) {
          while (isDigit(source[i])) i++;
        } else {
          i = save; // not an exponent after all, e.g. "2e" -- leave the 'e' for the identifier rule
        }
      }
      tokens.push({ type: "number", value: source.slice(start, i), pos: start });
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_]/.test(source[i])) i++;
      tokens.push({ type: "ident", value: source.slice(start, i), pos: start });
      continue;
    }

    if (c in SINGLE_CHAR_TOKENS) {
      tokens.push({ type: SINGLE_CHAR_TOKENS[c], value: c, pos: i });
      i++;
      continue;
    }

    throw new ExpressionSyntaxError(`Unexpected character '${c}'`, i);
  }

  tokens.push({ type: "eof", value: "", pos: n });
  return tokens;
}
