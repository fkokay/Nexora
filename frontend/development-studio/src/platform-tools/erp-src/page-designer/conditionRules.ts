// Saf (React'siz) kurallar: koşul metni (visibleWhen / disabledWhen / commandWhen) ile kural kurucunun satırları arasında çeviri.
// Kurucu yalnız düz bir "&&" ya da "||" zinciri gösterir: her halka `yol işleç sabit` (==, !=, in [..]). Başka her şey kod kipinde
// kalır. Kurucu kendi kurmadığı bir koşulu asla yeniden yazmaz: metin, satırlardan geri üretildiğinde birebir aynı çıkmıyorsa
// (boşluk, tırnak, sayı yazımı farkı dahil) rulesFromCondition null döner ve metin olduğu gibi kod kipinde düzenlenir.

import { parseCondition, type ConditionNode } from "./conditions";

/** eşittir / eşit değil / içinde / boş (== null) / boş değil (!= null). */
export type RuleOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "empty" | "notEmpty";
/** `value`: değer kutusundaki metin; "içinde" için virgülle ayrılmış değerler. */
export type ConditionRule = { path: string; op: RuleOp; value: string };
export type RuleJoiner = "and" | "or";
export type RuleSet = { joiner: RuleJoiner; rules: ConditionRule[] };

export const RULE_OPS: readonly (readonly [RuleOp, string])[] = [
  ["==", "eşittir"], ["!=", "eşit değil"], [">", "büyüktür"], [">=", "büyük ya da eşit"], ["<", "küçüktür"], ["<=", "küçük ya da eşit"],
  ["in", "içinde"], ["empty", "boş"], ["notEmpty", "boş değil"],
];

export const ruleNeedsValue = (op: RuleOp) => op !== "empty" && op !== "notEmpty";

// Sayı yalnız yazımı Number ile birebir geri dönüyorsa sayı sabiti olur ("05", "1.0" metin kalır; aksi halde gidiş-dönüş bozulur).
const NUMBER_TEXT = /^-?\d+(?:\.\d+)?$/;

/**
 * Değer kutusundaki metni koşul sabitine çevirir. true/false mantıksal, birebir sayı yazımı sayı, gerisi metin olur.
 * conditions.ts metinde kaçış desteklemez: tek tırnak içeren metin çift tırnakla yazılır; ikisini birden içeren metin yazılamaz (null).
 */
export function formatLiteral(value: string): string | null {
  if (value === "true" || value === "false") return value;
  if (NUMBER_TEXT.test(value) && String(Number(value)) === value) return value;
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes("\"")) return `"${value}"`;
  return null;
}

const literalText = (value: string | number | boolean | null) => value === null ? "null" : String(value);

/** "içinde" değerleri: virgülle ayrılır, kenar boşlukları atılır, boş öğeler alınmaz. */
export const splitInValues = (value: string) => value.split(",").map((item) => item.trim()).filter((item) => item !== "");

/** Tek satırı metne çevirir; yolu boş satır için "" (yazılmaz), yazılamayan değer için null. */
export function formatRule(rule: ConditionRule): string | null {
  if (rule.path === "") return "";
  if (rule.op === "empty") return `${rule.path} == null`;
  if (rule.op === "notEmpty") return `${rule.path} != null`;
  if (rule.op === "in") {
    const items = splitInValues(rule.value).map(formatLiteral);
    if (items.length === 0 || items.some((item) => item === null)) return null;
    return `${rule.path} in [${items.join(", ")}]`;
  }
  const literal = formatLiteral(rule.value);
  return literal === null ? null : `${rule.path} ${rule.op} ${literal}`;
}

/** Satır kümesini koşul metnine çevirir: yolu boş satırlar atlanır; hiç satır yoksa koşul yoktur (undefined). */
export function formatRules(set: RuleSet): { ok: true; text: string | undefined } | { ok: false; error: string; index: number } {
  const parts: string[] = [];
  for (const [index, rule] of set.rules.entries()) {
    const part = formatRule(rule);
    if (part === null)
      return { ok: false, index, error: rule.op === "in" && splitInValues(rule.value).length === 0 ? "En az bir değer yazın." : "Değer aynı anda hem ' hem \" içeremez." };
    if (part !== "") parts.push(part);
  }
  return { ok: true, text: parts.length === 0 ? undefined : parts.join(set.joiner === "and" ? " && " : " || ") };
}

function ruleFromNode(node: ConditionNode): ConditionRule | null {
  if (node.kind === "cmp" && node.left.kind === "path" && node.right.kind === "literal") {
    const { path } = node.left;
    if (node.right.value === null) return node.op === "==" || node.op === "!=" ? { path, op: node.op === "==" ? "empty" : "notEmpty", value: "" } : null;
    return { path, op: node.op, value: literalText(node.right.value) };
  }
  if (node.kind === "in" && node.item.kind === "path" && node.list.every((item) => item.kind === "literal")) {
    const values = node.list.map((item) => item.kind === "literal" ? literalText(item.value) : "");
    return { path: node.item.path, op: "in", value: values.join(", ") };
  }
  return null;
}

/**
 * Koşul metnini satırlara çevirir. Boş ya da yok → satırsız küme. Kurucunun gösteremediği (parantez, !, karışık &&/||,
 * yol-yol karşılaştırması …) ya da satırlardan birebir geri üretilemeyen metin için null: kod kipinde kalır.
 */
export function rulesFromCondition(text: string | undefined): RuleSet | null {
  if (text === undefined || text === "") return { joiner: "and", rules: [] };
  const parsed = parseCondition(text);
  if (!parsed.ok) return null;
  const { node } = parsed;
  const joiner: RuleJoiner = node.kind === "or" ? "or" : "and";
  const nodes = node.kind === "and" || node.kind === "or" ? node.items : [node];
  const rules: ConditionRule[] = [];
  for (const item of nodes) {
    const rule = ruleFromNode(item);
    if (!rule) return null;
    rules.push(rule);
  }
  const set = { joiner, rules };
  const again = formatRules(set);
  return again.ok && again.text === text ? set : null;
}

const quoted = (value: string) => `“${value}”`;

/** Satırın düz Türkçe karşılığı: "Rol “TenantAdmin” ise", "Durum boşsa" … */
export function describeRule(rule: ConditionRule, labelFor: (path: string) => string): string {
  const label = labelFor(rule.path);
  switch (rule.op) {
    case "==": return `${label} ${quoted(rule.value)} ise`;
    case "!=": return `${label} ${quoted(rule.value)} değilse`;
    case ">": return `${label} ${quoted(rule.value)} değerinden büyükse`;
    case ">=": return `${label} ${quoted(rule.value)} ya da büyükse`;
    case "<": return `${label} ${quoted(rule.value)} değerinden küçükse`;
    case "<=": return `${label} ${quoted(rule.value)} ya da küçükse`;
    case "in": return `${label} ${splitInValues(rule.value).map(quoted).join(", ")} değerlerinden biriyse`;
    case "empty": return `${label} boşsa`;
    default: return `${label} doluysa`;
  }
}

/** Kurucunun altındaki tek cümlelik özet; `outcome` cümlenin sonu ("görünür", "pasif olur" …). */
export function describeRules(set: RuleSet, labelFor: (path: string) => string, outcome: string, always: string): string {
  const rules = set.rules.filter((rule) => rule.path !== "");
  if (rules.length === 0) return always;
  const sentence = `${rules.map((rule) => describeRule(rule, labelFor)).join(set.joiner === "and" ? " ve " : " veya ")} ${outcome}.`;
  return sentence.charAt(0).toLocaleUpperCase("tr-TR") + sentence.slice(1);
}
