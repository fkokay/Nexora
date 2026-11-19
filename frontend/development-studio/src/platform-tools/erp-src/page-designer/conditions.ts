// Koşul ifadesi (visibleWhen, disabledWhen) ayrıştırıcısı: erp-web/src/custom-page/conditions.ts parseCondition ve
// sunucudaki PageConditionExpression ile aynı dilbilgisi. Studio ayrıştırır (satır içi hata için) ve tuvalde örnek veriyle
// değerlendirir (evaluateCondition, erp-web ile aynı); koşulu tutmayan bileşen gizlenmez, soluk ve "Koşullu" işaretli çizilir.
//
//   expr    := and ( "||" and )*
//   and     := unary ( "&&" unary )*
//   unary   := "!" unary | cmp
//   cmp     := add [ ( "==" | "!=" | "<" | "<=" | ">" | ">=" ) add | "in" "[" literal ( "," literal )* "]" ]
//   add     := operand [ "+" sayı ]
//   operand := path | literal | "(" expr ")"
//   literal := 'metin' | "metin" | sayı | true | false | null

import { resolvePath, type PageScope } from "./pageBindings";

export type CompareOp = "==" | "!=" | "<" | "<=" | ">" | ">=";
const COMPARE_OPS: readonly string[] = ["==", "!=", "<", "<=", ">", ">="];

export type ConditionNode =
  | { kind: "or" | "and"; items: ConditionNode[] } | { kind: "not"; item: ConditionNode }
  | { kind: "cmp"; op: CompareOp; left: ConditionNode; right: ConditionNode }
  | { kind: "add"; item: ConditionNode; amount: number } | { kind: "in"; item: ConditionNode; list: ConditionNode[] }
  | { kind: "path"; path: string } | { kind: "literal"; value: string | number | boolean | null };

export const CONDITION_MAX_LENGTH = 300;
const MAX_STRING = 100;
const MAX_DEPTH = 8;
const KEYWORDS = ["true", "false", "null", "in"];
const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,4}\])*/;
const NUMBER = /^-?\d+(?:\.\d+)?/;

type Token =
  | { type: "op"; value: "||" | "&&" | "!" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "(" | ")" | "[" | "]" | "," }
  | { type: "keyword"; value: "true" | "false" | "null" | "in" }
  | { type: "path"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number };

class ConditionError extends Error {}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") { index++; continue; }
    const two = text.slice(index, index + 2);
    if (two === "||" || two === "&&" || two === "==" || two === "!=" || two === "<=" || two === ">=") { tokens.push({ type: "op", value: two }); index += 2; continue; }
    if (char === "!" || char === "<" || char === ">" || char === "+" || char === "(" || char === ")" || char === "[" || char === "]" || char === ",") { tokens.push({ type: "op", value: char }); index++; continue; }
    if (char === "'" || char === "\"") {
      const end = text.indexOf(char, index + 1);
      if (end < 0) throw new ConditionError("kapanmamış metin");
      const value = text.slice(index + 1, end);
      if (value.length > MAX_STRING) throw new ConditionError(`metin en fazla ${MAX_STRING} karakter olabilir`);
      tokens.push({ type: "string", value });
      index = end + 1;
      continue;
    }
    const number = NUMBER.exec(text.slice(index));
    if (number && (char !== "-" || /\d/.test(text[index + 1] ?? ""))) {
      tokens.push({ type: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const path = PATH.exec(text.slice(index));
    if (path) {
      const value = path[0];
      const root = value.match(/^[A-Za-z_][A-Za-z0-9_]*/)![0];
      if (KEYWORDS.includes(root)) {
        // Anahtar sözcük yol kökü olamaz ("true.x"); "in[1]" gibi bitişik yazımda yalnız sözcük alınır.
        if (text[index + root.length] === ".") throw new ConditionError(`'${root}' ayrılmış bir sözcüktür`);
        tokens.push({ type: "keyword", value: root as "true" | "false" | "null" | "in" });
        index += root.length;
        continue;
      }
      tokens.push({ type: "path", value });
      index += value.length;
      continue;
    }
    throw new ConditionError(`beklenmeyen karakter: ${char}`);
  }
  return tokens;
}

function describe(token: Token | undefined): string {
  if (!token) return "ifade erken bitti";
  if (token.type === "string") return `beklenmeyen metin: '${token.value}'`;
  return `beklenmeyen öğe: ${String(token.value)}`;
}

/** Ayrıştırır; kökler her yolun ilk adıdır (ilk geçiş sırası, tekil). */
export function parseCondition(text: string): { ok: true; node: ConditionNode; roots: string[] } | { ok: false; error: string } {
  if (typeof text !== "string" || text.trim() === "") return { ok: false, error: "ifade boş" };
  if (text.length > CONDITION_MAX_LENGTH) return { ok: false, error: `ifade en fazla ${CONDITION_MAX_LENGTH} karakter olabilir` };
  try {
    const tokens = tokenize(text);
    let position = 0;
    let depth = 0;
    const roots: string[] = [];
    const peek = () => tokens[position];
    const isOp = (value: string) => { const token = peek(); return !!token && token.type === "op" && token.value === value; };
    const expectOp = (value: string) => { if (!isOp(value)) throw new ConditionError(describe(peek())); position++; };
    const literal = (): ConditionNode | null => {
      const token = peek();
      if (!token) return null;
      if (token.type === "string" || token.type === "number") { position++; return { kind: "literal", value: token.value }; }
      if (token.type === "keyword" && token.value !== "in") { position++; return { kind: "literal", value: token.value === "null" ? null : token.value === "true" }; }
      return null;
    };
    const operand = (): ConditionNode => {
      const token = peek();
      if (token?.type === "path") {
        position++;
        const root = token.value.match(/^[A-Za-z_][A-Za-z0-9_]*/)![0];
        if (!roots.includes(root)) roots.push(root);
        return { kind: "path", path: token.value };
      }
      if (isOp("(")) {
        position++;
        depth++;
        if (depth > MAX_DEPTH) throw new ConditionError(`en fazla ${MAX_DEPTH} düzey parantez kullanılabilir`);
        const inner = expr();
        expectOp(")");
        depth--;
        return inner;
      }
      const value = literal();
      if (value) return value;
      throw new ConditionError(describe(token));
    };
    // add := operand [ "+" sayı ]  (tarihe gün, sayıya değer ekler; çıkarma için eksi sayı: bugun + -7)
    const add = (): ConditionNode => {
      const item = operand();
      if (!isOp("+")) return item;
      position++;
      const token = peek();
      if (token?.type !== "number") throw new ConditionError("'+' sonrasında sayı bekleniyordu");
      position++;
      return { kind: "add", item, amount: token.value };
    };
    const cmp = (): ConditionNode => {
      const left = add();
      const next = peek();
      if (next?.type === "op" && COMPARE_OPS.includes(next.value)) {
        const op = next.value as CompareOp;
        position++;
        return { kind: "cmp", op, left, right: add() };
      }
      const token = peek();
      if (token?.type === "keyword" && token.value === "in") {
        position++;
        expectOp("[");
        const list: ConditionNode[] = [];
        for (;;) {
          const item = literal();
          if (!item) throw new ConditionError(list.length === 0 && isOp("]") ? "'in' listesi en az bir değer içermelidir" : "'in' listesinde yalnız sabit değer kullanılabilir");
          list.push(item);
          if (isOp(",")) { position++; continue; }
          expectOp("]");
          break;
        }
        return { kind: "in", item: left, list };
      }
      return left;
    };
    const unary = (): ConditionNode => {
      if (isOp("!")) { position++; return { kind: "not", item: unary() }; }
      return cmp();
    };
    const and = (): ConditionNode => {
      const items = [unary()];
      while (isOp("&&")) { position++; items.push(unary()); }
      return items.length === 1 ? items[0] : { kind: "and", items };
    };
    const expr = (): ConditionNode => {
      const items = [and()];
      while (isOp("||")) { position++; items.push(and()); }
      return items.length === 1 ? items[0] : { kind: "or", items };
    };
    const node = expr();
    if (position < tokens.length) throw new ConditionError(describe(peek()));
    return { ok: true, node, roots };
  } catch (error) {
    if (error instanceof ConditionError) return { ok: false, error: error.message };
    throw error;
  }
}

export const CONDITION_RESERVED_ROOTS = ["kullanici", "bugun", "sayilar", "sayfa"];

/**
 * Müfettiş için koşul hatası: sözdizimi ya da sayfada olmayan kök. Metinler sunucunun hata metinleriyle aynı biçimdedir.
 * Boş metin "koşul yok" demektir (null).
 */
export function conditionProblem(prop: string, text: unknown, pageNames: string[]): string | null {
  if (typeof text !== "string" || text === "") return null;
  const parsed = parseCondition(text);
  if (!parsed.ok) return `'${prop}' koşulu geçersiz: ${parsed.error}`;
  const known = new Set([...pageNames, ...CONDITION_RESERVED_ROOTS]);
  const unknown = parsed.roots.find((root) => !known.has(root));
  return unknown ? `'${prop}' koşulu sayfada olmayan bir ada başvuruyor: ${unknown}` : null;
}

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** `yol + n`: sayıya n eklenir; YYYY-MM-DD ile başlayan tarihe n gün eklenir (takvim günü); başka değer null olur. */
function shifted(base: Normalized, amount: number): Normalized {
  if (typeof base === "number") return base + amount;
  if (typeof base !== "string" || !ISO_DATE.test(base) || !Number.isInteger(amount)) return null;
  const [year, month, day] = base.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Sıralama: yalnız sayı–sayı ve tarih–tarih (YYYY-MM-DD, ilk 10 karakter) karşılaştırılır; diğer her durum (null dahil) false. */
function ordered(op: "<" | "<=" | ">" | ">=", left: Normalized, right: Normalized): boolean {
  let a: number | string, b: number | string;
  if (typeof left === "number" && typeof right === "number") { a = left; b = right; }
  else if (typeof left === "string" && typeof right === "string" && ISO_DATE.test(left) && ISO_DATE.test(right)) { a = left.slice(0, 10); b = right.slice(0, 10); }
  else return false;
  return op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : a >= b;
}

function operandValue(node: ConditionNode, scope: PageScope): Normalized {
  if (node.kind === "path") return normalize(resolvePath(scope, node.path));
  if (node.kind === "literal") return normalize(node.value);
  if (node.kind === "add") return shifted(operandValue(node.item, scope), node.amount);
  return evaluateCondition(node, scope);
}

/** Ayrıştırılmış koşulu kapsamda değerlendirir (erp-web evaluateCondition ile aynı); çözülemeyen yol null sayılır, fırlatmaz. */
export function evaluateCondition(node: ConditionNode, scope: PageScope): boolean {
  switch (node.kind) {
    case "or": return node.items.some((item) => evaluateCondition(item, scope));
    case "and": return node.items.every((item) => evaluateCondition(item, scope));
    case "not": return !evaluateCondition(node.item, scope);
    case "cmp": {
      const left = operandValue(node.left, scope), right = operandValue(node.right, scope);
      if (node.op === "==") return left === right;
      if (node.op === "!=") return left !== right;
      return ordered(node.op, left, right);
    }
    case "in": {
      const value = operandValue(node.item, scope);
      return node.list.some((item) => operandValue(item, scope) === value);
    }
    default: return truthy(operandValue(node, scope));
  }
}

/** Metin koşulu kapsamda değerlendirir; boş, metin olmayan ya da ayrıştırılamayan koşul `fallback` döner. */
export function conditionHolds(text: unknown, scope: PageScope, fallback: boolean): boolean {
  if (typeof text !== "string" || text.trim() === "") return fallback;
  const parsed = parseCondition(text);
  return parsed.ok ? evaluateCondition(parsed.node, scope) : fallback;
}
