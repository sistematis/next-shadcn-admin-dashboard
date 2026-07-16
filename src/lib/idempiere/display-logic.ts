/**
 * DisplayLogic + MandatoryLogic parser for iDempiere AD_Field expressions.
 *
 * Supports:
 *   @FieldName@=Y            → field is truthy
 *   @FieldName@=N            → field is falsy
 *   @FieldName@=Value        → field equals string value
 *   @FieldName@!Value        → field not equals
 *   @FieldName@>123          → field greater than number
 *   @FieldName@<123          → field less than
 *   A & B                    → AND
 *   A | B                    → OR
 *   (...)                    → grouping
 *   @SQL=...                 → always true (server-side, can't eval client-side)
 *
 * Returns true when logic is empty or unparseable — safer to show than hide.
 */

type LogicContext = Record<string, unknown>;

/** Extract raw scalar value from context, handling FK objects {id, identifier} */
function fieldValue(ctx: LogicContext, name: string): unknown {
  const v = ctx[name];
  if (v == null) return null;
  if (typeof v === "object" && v !== null) {
    // FK or List reference — use identifier for string comparison, id for numeric
    const obj = v as { identifier?: string; id?: number };
    return obj.identifier ?? obj.id ?? null;
  }
  return v;
}

function isTruthy(v: unknown): boolean {
  if (v === true || v === "Y" || v === "true" || v === 1 || v === "1") return true;
  return false;
}

function compareValues(actual: unknown, operator: string, expected: string): boolean {
  switch (operator) {
    case "=":
      if (expected === "Y") return isTruthy(actual);
      if (expected === "N") return !isTruthy(actual);
      // ponytail: for FK/list, compare identifier or stringified value
      return String(actual ?? "").toLowerCase() === expected.toLowerCase();
    case "!":
      if (expected === "Y") return !isTruthy(actual);
      if (expected === "N") return isTruthy(actual);
      return String(actual ?? "").toLowerCase() !== expected.toLowerCase();
    case ">": {
      const n = Number(actual);
      return !Number.isNaN(n) && n > Number(expected);
    }
    case "<": {
      const n = Number(actual);
      return !Number.isNaN(n) && n < Number(expected);
    }
    default:
      return true;
  }
}

/**
 * Evaluate an iDempiere display logic expression against form data.
 * Returns true if the field should be displayed.
 */
export function evaluateDisplayLogic(logic: string | undefined, ctx: LogicContext): boolean {
  if (!logic?.trim()) return true;

  // ponytail: @SQL= can't be evaluated client-side — default to showing the field
  if (logic.startsWith("@SQL=")) return true;

  try {
    // ponytail: tokenize → evaluate with operator precedence: ! > & > |
    // Convert to JS-safe expression
    // Replace @Field@ with evaluated condition
    const tokens = tokenize(logic);
    const result = evalTokens(tokens, ctx);
    return result;
  } catch {
    // ponytail: safer to show than hide on parse error
    return true;
  }
}

type Token =
  | { type: "condition"; field: string; operator: string; value: string }
  | { type: "and" }
  | { type: "or" }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(logic: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < logic.length) {
    const ch = logic[pos];

    // Skip whitespace
    if (ch === " " || ch === "\t") {
      pos++;
      continue;
    }

    // AND / OR
    if (ch === "&") {
      // ponytail: handle & and && (iDempiere uses &)
      if (logic[pos + 1] === "&") pos++;
      tokens.push({ type: "and" });
      pos++;
      continue;
    }
    if (ch === "|") {
      if (logic[pos + 1] === "|") pos++;
      tokens.push({ type: "or" });
      pos++;
      continue;
    }

    // Parens
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      pos++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      pos++;
      continue;
    }

    // @Field@op=value
    if (ch === "@") {
      const endField = logic.indexOf("@", pos + 1);
      if (endField < 0) break;
      const field = logic.slice(pos + 1, endField);
      pos = endField + 1;

      // Read operator: =, !, >, <
      const op = logic[pos] ?? "";
      if (op === "=" || op === "!" || op === ">" || op === "<") {
        pos++;
        // Read value until & | ) or end
        let val = "";
        while (pos < logic.length && logic[pos] !== "&" && logic[pos] !== "|" && logic[pos] !== ")") {
          val += logic[pos];
          pos++;
        }
        val = val.trim();
        tokens.push({ type: "condition", field, operator: op, value: val });
      } else {
        // ponytail: bare @Field@ — truthy check
        tokens.push({ type: "condition", field, operator: "=", value: "Y" });
      }
      continue;
    }

    // Unknown char — skip
    pos++;
  }

  return tokens;
}

// Recursive descent evaluator: orExpr → andExpr → factor
function evalTokens(tokens: Token[], ctx: LogicContext): boolean {
  let idx = 0;
  return parseOr();

  function parseOr(): boolean {
    let result = parseAnd();
    while (idx < tokens.length && tokens[idx].type === "or") {
      idx++;
      result = parseAnd() || result;
    }
    return result;
  }

  function parseAnd(): boolean {
    let result = parseFactor();
    while (idx < tokens.length && tokens[idx].type === "and") {
      idx++;
      result = parseFactor() && result;
    }
    return result;
  }

  function parseFactor(): boolean {
    const token = tokens[idx];
    if (!token) return true;

    if (token.type === "lparen") {
      idx++; // skip (
      const result = parseOr();
      // skip )
      if (idx < tokens.length && tokens[idx].type === "rparen") idx++;
      return result;
    }

    if (token.type === "condition") {
      idx++;
      const actual = fieldValue(ctx, token.field);
      return compareValues(actual, token.operator, token.value);
    }

    idx++;
    return true;
  }
}
