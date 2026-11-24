// Düzenlenebilir tablonun formül sütunları (`formulas`): "<sayıSütunu>": "<ifade>".
// Sunucu ikizi src/Hosts/AIERP.Api/GridFormula.cs (yalnız doğrulama); ikisi gridFormula.vectors.json ile denetlenir.
//
// Dilbilgisi: sayılar ([0-9]+ ya da [0-9]+.[0-9]+), aynı tablonun diğer sayı sütunlarının kodları (formüller döngüsüz olmalı), + - * /, parantez ve
// tekli eksi. Başka bir şey yok (işlev, metin, üs, "1.", ".5", "1e3" geçersiz). Boşluk (boşluk ve sekme) yok sayılır.
// Değerlendirme: boş hücre 0, sıfıra bölme 0, sonuç 2 ondalığa yuvarlanır (yarım sıfırdan uzağa).

export type FormulaNode =
  | { kind: "number"; value: number }
  | { kind: "column"; code: string }
  | { kind: "negate"; operand: FormulaNode }
  | { kind: "binary"; operator: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode };

export const MAX_FORMULA_LENGTH = 200;
const MAX_DEPTH = 20;

type Token = { kind: "number"; value: number } | { kind: "column"; code: string } | { kind: "symbol"; symbol: string };

function tokenize(text: string): Token[] | string {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === " " || char === "\t") { index += 1; continue; }
    if ("+-*/()".includes(char)) { tokens.push({ kind: "symbol", symbol: char }); index += 1; continue; }
    const number = /^[0-9]+(\.[0-9]+)?/.exec(text.slice(index));
    if (number) {
      const after = text[index + number[0].length];
      if (after !== undefined && /[A-Za-z0-9_.]/.test(after)) return `geçersiz sayı (${index + 1}. karakter)`;
      tokens.push({ kind: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const code = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(index));
    if (code) {
      if (text[index + code[0].length] === ".") return `noktalı sütun kodu kullanılamaz (${index + 1}. karakter)`;
      tokens.push({ kind: "column", code: code[0] });
      index += code[0].length;
      continue;
    }
    return `beklenmeyen karakter '${char}' (${index + 1}. karakter)`;
  }
  return tokens;
}

/**
 * Formülü okur. `columns`: kullanılabilecek sütun kodları (tablonun formül olmayan sayı sütunları). Başarıda ağaç ve başvurulan
 * sütunlar (tekrarsız, sırayla) döner; aksi halde Türkçe gerekçe.
 */
export function parseFormula(text: unknown, columns: ReadonlySet<string>): { ok: true; node: FormulaNode; refs: string[] } | { ok: false; error: string } {
  const fail = (reason: string) => ({ ok: false as const, error: `Formül geçersiz (${reason})` });
  if (typeof text !== "string") return fail("metin değil");
  if (text.length > MAX_FORMULA_LENGTH) return fail(`en fazla ${MAX_FORMULA_LENGTH} karakter`);
  const tokens = tokenize(text);
  if (typeof tokens === "string") return fail(tokens);
  if (tokens.length === 0) return fail("boş");
  const refs: string[] = [];
  let position = 0;
  let error: string | null = null;
  const peek = () => tokens[position];
  const isSymbol = (token: Token | undefined, symbol: string) => token?.kind === "symbol" && token.symbol === symbol;

  const expression = (depth: number): FormulaNode | null => {
    let left = term(depth);
    while (left && (isSymbol(peek(), "+") || isSymbol(peek(), "-"))) {
      const operator = (tokens[position++] as { symbol: "+" | "-" }).symbol;
      const right = term(depth);
      if (!right) return null;
      left = { kind: "binary", operator, left, right };
    }
    return left;
  };
  const term = (depth: number): FormulaNode | null => {
    let left = unary(depth);
    while (left && (isSymbol(peek(), "*") || isSymbol(peek(), "/"))) {
      const operator = (tokens[position++] as { symbol: "*" | "/" }).symbol;
      const right = unary(depth);
      if (!right) return null;
      left = { kind: "binary", operator, left, right };
    }
    return left;
  };
  const unary = (depth: number): FormulaNode | null => {
    if (depth > MAX_DEPTH) { error ??= "çok derin iç içe ifade"; return null; }
    if (isSymbol(peek(), "-")) {
      position += 1;
      const operand = unary(depth + 1);
      return operand ? { kind: "negate", operand } : null;
    }
    return primary(depth);
  };
  const primary = (depth: number): FormulaNode | null => {
    const token = peek();
    if (!token) { error ??= "ifade eksik"; return null; }
    position += 1;
    if (token.kind === "number") return { kind: "number", value: token.value };
    if (token.kind === "column") {
      if (!columns.has(token.code)) { error ??= `'${token.code}' kullanılabilecek bir sayı sütunu değil`; return null; }
      if (!refs.includes(token.code)) refs.push(token.code);
      return { kind: "column", code: token.code };
    }
    if (token.symbol === "(") {
      const inner = expression(depth + 1);
      if (!inner) return null;
      if (!isSymbol(peek(), ")")) { error ??= "kapanmayan parantez"; return null; }
      position += 1;
      return inner;
    }
    error ??= `beklenmeyen '${token.symbol}'`;
    return null;
  };

  const node = expression(0);
  if (!node) return fail(error ?? "ifade eksik");
  if (position < tokens.length) {
    const rest = tokens[position];
    return fail(rest.kind === "symbol" ? `beklenmeyen '${rest.symbol}'` : "işleç eksik");
  }
  return { ok: true, node, refs };
}

/** 2 ondalığa yuvarlar (yarım sıfırdan uzağa; 1.005 → 1.01, -2.345 → -2.35). Kayan nokta gürültüsü önce atılır. */
export function roundFormula(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const cents = Math.round(Number((Math.abs(value) * 100).toFixed(6)));
  const result = Math.sign(value) * cents / 100;
  return Object.is(result, -0) ? 0 : result;
}

function evaluate(node: FormulaNode, value: (code: string) => number): number {
  switch (node.kind) {
    case "number": return node.value;
    case "column": return value(node.code);
    case "negate": return -evaluate(node.operand, value);
    case "binary": {
      const left = evaluate(node.left, value);
      const right = evaluate(node.right, value);
      if (node.operator === "+") return left + right;
      if (node.operator === "-") return left - right;
      if (node.operator === "*") return left * right;
      return right === 0 ? 0 : left / right;
    }
  }
}

/** Formülü hücre değerleriyle hesaplar: `cell` boş ya da sayı olmayan hücre için 0 dönmelidir; sonuç 2 ondalığa yuvarlanır. */
export function evaluateFormula(node: FormulaNode, cell: (code: string) => number): number {
  return roundFormula(evaluate(node, cell));
}

/** Hücre metninin sayısı: boş, sayı olmayan ya da sonsuz değer 0. */
export function formulaCellNumber(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw !== "string" || raw.trim() === "") return 0;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : 0;
}

/**
 * Formül sütunlarının hesap sırası (Kahn): her formül başvurduğu formüllerden sonra gelir; aynı düzeyde yazım sırası korunur.
 * `refs`: formül sütunu → başvurduğu sütunlar (formül olmayanlar yok sayılır). Döngüdeki ya da döngüye bağlı sütunlar `cyclic`.
 */
export function formulaOrder(refs: Record<string, string[]>): { order: string[]; cyclic: string[] } {
  const codes = Object.keys(refs);
  const done = new Set<string>();
  const order: string[] = [];
  for (let progress = true; progress;) {
    progress = false;
    for (const code of codes) {
      if (done.has(code) || !refs[code].every((ref) => !(ref in refs) || done.has(ref))) continue;
      done.add(code);
      order.push(code);
      progress = true;
    }
  }
  return { order, cyclic: codes.filter((code) => !done.has(code)) };
}
