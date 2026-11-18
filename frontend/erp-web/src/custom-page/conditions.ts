// Saf (React'siz) koşul ifadesi ayrıştırıcı ve değerlendirici: `visibleWhen` / `disabledWhen`.
// Dilbilgisi sunucudaki PageConditionExpression ile aynıdır (ortak vektörler: conditions.vectors.json).
import { resolvePath, type PageScope } from "./pageBindings";

export type ConditionNode =
  | { kind: "or" | "and"; items: ConditionNode[] } | { kind: "not"; item: ConditionNode }
  | { kind: "cmp"; op: "==" | "!="; left: ConditionNode; right: ConditionNode } | { kind: "in"; item: ConditionNode; list: ConditionNode[] }
  | { kind: "path"; path: string } | { kind: "literal"; value: string | number | boolean | null };

type Token =
  | { type: "op"; value: "||" | "&&" | "!" | "==" | "!=" | "(" | ")" | "[" | "]" | "," }
  | { type: "keyword"; value: "true" | "false" | "null" | "in" }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "path"; value: string };

const MAX_LENGTH = 300;
const MAX_STRING = 100;
const MAX_DEPTH = 8;
const KEYWORDS = new Set(["true", "false", "null", "in"]);
const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
const PATH_TAIL = /(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,4}\])*/y;
const NUMBER = /-?\d+(?:\.\d+)?/y;
const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

class ConditionError extends Error {}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const at = (pattern: RegExp) => { pattern.lastIndex = index; const match = pattern.exec(text); return match ? match[0] : null; };
  while (index < text.length) {
    const char = text[index];
    if (char === " " || char === "\t" || char === "\r" || char === "\n") { index += 1; continue; }
    const two = text.slice(index, index + 2);
    if (two === "||" || two === "&&" || two === "==" || two === "!=") { tokens.push({ type: "op", value: two }); index += 2; continue; }
    if (char === "!" || char === "(" || char === ")" || char === "[" || char === "]" || char === ",") {
      tokens.push({ type: "op", value: char }); index += 1; continue;
    }
    if (char === "'" || char === '"') {
      const end = text.indexOf(char, index + 1);
      if (end < 0) throw new ConditionError("kapanmamış metin");
      const value = text.slice(index + 1, end);
      if (value.length > MAX_STRING) throw new ConditionError(`metin en fazla ${MAX_STRING} karakter olabilir`);
      tokens.push({ type: "string", value }); index = end + 1; continue;
    }
    const number = at(NUMBER);
    if (number !== null) {
      // "1abc" gibi sayıya yapışık ad geçersizdir.
      IDENT.lastIndex = index + number.length;
      if (IDENT.exec(text)?.index === index + number.length) throw new ConditionError(`beklenmeyen karakter: ${text[index + number.length]}`);
      tokens.push({ type: "number", value: Number(number) }); index += number.length; continue;
    }
    const ident = at(IDENT);
    if (ident !== null) {
      if (KEYWORDS.has(ident)) {
        tokens.push({ type: "keyword", value: ident as "true" | "false" | "null" | "in" }); index += ident.length; continue;
      }
      index += ident.length;
      const tail = at(PATH_TAIL) ?? "";
      index += tail.length;
      tokens.push({ type: "path", value: ident + tail }); continue;
    }
    throw new ConditionError(`beklenmeyen karakter: ${char}`);
  }
  return tokens;
}

/** Koşul metnini ayrıştırır; yolların kök adlarını (ilk görülme sırasıyla, tekrarsız) döner. */
export function parseCondition(text: string): { ok: true; node: ConditionNode; roots: string[] } | { ok: false; error: string } {
  try {
    if (typeof text !== "string" || text.trim() === "") throw new ConditionError("ifade boş");
    if (text.length > MAX_LENGTH) throw new ConditionError(`ifade en fazla ${MAX_LENGTH} karakter olabilir`);
    const tokens = tokenize(text);
    const roots: string[] = [];
    let position = 0;
    let depth = 0;
    const peek = () => tokens[position];
    const isOp = (value: string) => { const token = peek(); return token?.type === "op" && token.value === value; };
    const expectOp = (value: string) => { if (!isOp(value)) throw new ConditionError(`'${value}' bekleniyordu`); position += 1; };

    const literal = (): ConditionNode | null => {
      const token = peek();
      if (!token) return null;
      if (token.type === "string" || token.type === "number") { position += 1; return { kind: "literal", value: token.value }; }
      if (token.type === "keyword" && token.value !== "in") {
        position += 1;
        return { kind: "literal", value: token.value === "null" ? null : token.value === "true" };
      }
      return null;
    };
    const operand = (): ConditionNode => {
      const token = peek();
      if (!token) throw new ConditionError("ifade eksik");
      if (isOp("(")) {
        depth += 1;
        if (depth > MAX_DEPTH) throw new ConditionError(`en fazla ${MAX_DEPTH} düzey parantez kullanılabilir`);
        position += 1;
        const inner = expr();
        expectOp(")");
        depth -= 1;
        return inner;
      }
      if (token.type === "path") {
        position += 1;
        const root = token.value.match(/^[A-Za-z_][A-Za-z0-9_]*/)![0];
        if (!roots.includes(root)) roots.push(root);
        return { kind: "path", path: token.value };
      }
      const value = literal();
      if (value) return value;
      throw new ConditionError("işlenen bekleniyordu");
    };
    const cmp = (): ConditionNode => {
      const left = operand();
      if (isOp("==") || isOp("!=")) {
        const op = (peek() as { value: "==" | "!=" }).value;
        position += 1;
        return { kind: "cmp", op, left, right: operand() };
      }
      const token = peek();
      if (token?.type === "keyword" && token.value === "in") {
        position += 1;
        expectOp("[");
        const list: ConditionNode[] = [];
        for (;;) {
          const item = literal();
          if (!item) throw new ConditionError("liste öğesi sabit değer olmalı");
          list.push(item);
          if (isOp(",")) { position += 1; continue; }
          break;
        }
        expectOp("]");
        return { kind: "in", item: left, list };
      }
      return left;
    };
    const unary = (): ConditionNode => {
      if (isOp("!")) { position += 1; return { kind: "not", item: unary() }; }
      return cmp();
    };
    const and = (): ConditionNode => {
      const items = [unary()];
      while (isOp("&&")) { position += 1; items.push(unary()); }
      return items.length === 1 ? items[0] : { kind: "and", items };
    };
    function expr(): ConditionNode {
      const items = [and()];
      while (isOp("||")) { position += 1; items.push(and()); }
      return items.length === 1 ? items[0] : { kind: "or", items };
    }

    const node = expr();
    if (position < tokens.length) throw new ConditionError("ifadenin sonunda fazladan simge var");
    return { ok: true, node, roots };
  } catch (cause) {
    if (cause instanceof ConditionError) return { ok: false, error: cause.message };
    throw cause;
  }
}

type Normalized = string | number | boolean | null;

function normalize(value: unknown): Normalized {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (NUMERIC_TEXT.test(value)) return Number(value);
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }
  return null;
}

const truthy = (value: Normalized) => value !== null && value !== false && value !== 0;

function operandValue(node: ConditionNode, scope: PageScope): Normalized {
  if (node.kind === "path") return normalize(resolvePath(scope, node.path));
  if (node.kind === "literal") return normalize(node.value);
  return evaluateCondition(node, scope);
}

/** Ayrıştırılmış koşulu kapsamda değerlendirir; çözülemeyen yol null sayılır, hiçbir zaman fırlatmaz. */
export function evaluateCondition(node: ConditionNode, scope: PageScope): boolean {
  switch (node.kind) {
    case "or": return node.items.some((item) => evaluateCondition(item, scope));
    case "and": return node.items.every((item) => evaluateCondition(item, scope));
    case "not": return !evaluateCondition(node.item, scope);
    case "cmp": {
      const equal = operandValue(node.left, scope) === operandValue(node.right, scope);
      return node.op === "==" ? equal : !equal;
    }
    case "in": {
      const value = operandValue(node.item, scope);
      return node.list.some((item) => operandValue(item, scope) === value);
    }
    default: return truthy(operandValue(node, scope));
  }
}

/** Unparsable or non-string text returns `fallback`. */
export function conditionHolds(text: unknown, scope: PageScope, fallback: boolean): boolean {
  if (typeof text !== "string") return fallback;
  const parsed = parseCondition(text);
  return parsed.ok ? evaluateCondition(parsed.node, scope) : fallback;
}
