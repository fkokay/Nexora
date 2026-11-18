// Koşul ifadesi (visibleWhen, disabledWhen) ayrıştırıcısı: erp-web/src/custom-page/conditions.ts parseCondition ve
// sunucudaki PageConditionExpression ile aynı dilbilgisi. Studio yalnız ayrıştırır (satır içi hata için); tasarımcıda
// koşul değerlendirilmez, koşullu bileşen hiç gizlenmez.
//
//   expr    := and ( "||" and )*
//   and     := unary ( "&&" unary )*
//   unary   := "!" unary | cmp
//   cmp     := operand [ ( "==" | "!=" ) operand | "in" "[" literal ( "," literal )* "]" ]
//   operand := path | literal | "(" expr ")"
//   literal := 'metin' | "metin" | sayı | true | false | null

export type ConditionNode =
  | { kind: "or" | "and"; items: ConditionNode[] } | { kind: "not"; item: ConditionNode }
  | { kind: "cmp"; op: "==" | "!="; left: ConditionNode; right: ConditionNode } | { kind: "in"; item: ConditionNode; list: ConditionNode[] }
  | { kind: "path"; path: string } | { kind: "literal"; value: string | number | boolean | null };

export const CONDITION_MAX_LENGTH = 300;
const MAX_STRING = 100;
const MAX_DEPTH = 8;
const KEYWORDS = ["true", "false", "null", "in"];
const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,4}\])*/;
const NUMBER = /^-?\d+(?:\.\d+)?/;

type Token =
  | { type: "op"; value: "||" | "&&" | "!" | "==" | "!=" | "(" | ")" | "[" | "]" | "," }
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
    if (two === "||" || two === "&&" || two === "==" || two === "!=") { tokens.push({ type: "op", value: two }); index += 2; continue; }
    if (char === "!" || char === "(" || char === ")" || char === "[" || char === "]" || char === ",") { tokens.push({ type: "op", value: char }); index++; continue; }
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
    const cmp = (): ConditionNode => {
      const left = operand();
      if (isOp("==") || isOp("!=")) {
        const op = (peek() as { value: "==" | "!=" }).value;
        position++;
        return { kind: "cmp", op, left, right: operand() };
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

export const CONDITION_RESERVED_ROOTS = ["kullanici", "bugun", "sayilar"];

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
