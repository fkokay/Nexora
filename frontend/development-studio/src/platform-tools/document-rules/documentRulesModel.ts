// Kurallar ekranının saf modeli (belge kuralları PR 3, taslak 10): kural cümlesi, ekle/düzenle/sil/aç-kapat/sırala ve doğrulama.

export type RuleAction = "approval" | "warn" | "block";
export type DocumentRule = {
  code: string; order: number; enabled: boolean; always: boolean; field?: string | null; op?: string | null; value?: string | null;
  action: RuleAction; approverUserIds: string[]; message?: string | null;
};
export type RuleField = { code: string; label: string; kind: "number" | "text" | "date" };
export type RulePerson = { id: string; displayName: string; email: string; role: string };

export const OP_LABELS: Record<string, string> = {
  Equals: "=", NotEquals: "≠", GreaterThan: ">", GreaterThanOrEqual: "≥", LessThan: "<", LessThanOrEqual: "≤", Contains: "içerir",
  Before: "öncesi", OnOrBefore: "veya öncesi", After: "sonrası", OnOrAfter: "veya sonrası", IsEmpty: "boş", IsNotEmpty: "dolu",
};
export const ACTION_LABELS: Record<RuleAction, string> = { approval: "Onay iste", warn: "Uyar ama devam et", block: "Engelle" };
export const MAX_RULES = 20;
export const MAX_APPROVERS = 5;
export const MAX_MESSAGE = 200;

export const emptyRule = (fields: RuleField[]): DocumentRule => ({
  code: "", order: 0, enabled: true, always: false, field: fields[0]?.code ?? "grandTotal", op: "GreaterThan", value: "", action: "approval",
  approverUserIds: [], message: "",
});

const valueless = (op?: string | null) => op === "IsEmpty" || op === "IsNotEmpty";

/** Kaydetmeden önceki denetim; sunucu aynılarını yeniden denetler. Sorun yoksa null. */
export function ruleProblem(rule: DocumentRule, fields: RuleField[], operators: Record<string, string[]>): string | null {
  if (!rule.always) {
    const field = fields.find((f) => f.code === rule.field);
    if (!field) return "Bir alan seçin.";
    if (!rule.op || !(operators[field.kind] ?? []).includes(rule.op)) return `Bu işleç '${field.label}' alanında kullanılamaz.`;
    if (!valueless(rule.op)) {
      const value = (rule.value ?? "").trim();
      if (!value) return `'${field.label}' için bir değer yazın.`;
      if (field.kind === "number" && !/^-?\d+(\.\d+)?$/.test(value)) return `'${field.label}' için sayı yazın.`;
      if (field.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `'${field.label}' için tarih seçin.`;
    }
  }
  if (rule.action === "approval" && (rule.approverUserIds.length < 1 || rule.approverUserIds.length > MAX_APPROVERS))
    return `Onaylayacak 1–${MAX_APPROVERS} kişi seçin.`;
  if (rule.action !== "approval" && !((rule.message ?? "").trim().length > 0 && (rule.message ?? "").length <= MAX_MESSAGE))
    return `Kullanıcıya gösterilecek mesajı yazın (en çok ${MAX_MESSAGE} karakter).`;
  return null;
}

/** Sunucuya giden biçim: koşulsuz kuralda alan yok; onay kuralında mesaj, öteki kurallarda kişi yok. */
function clean(rule: DocumentRule): DocumentRule {
  return {
    code: rule.code, order: rule.order, enabled: rule.enabled, always: rule.always,
    field: rule.always ? null : rule.field, op: rule.always ? null : rule.op, value: rule.always || valueless(rule.op) ? null : (rule.value ?? "").trim(),
    action: rule.action, approverUserIds: rule.action === "approval" ? rule.approverUserIds : [],
    message: rule.action === "approval" ? null : (rule.message ?? "").trim(),
  };
}

const renumber = (rules: DocumentRule[]) => rules.map((rule, index) => (rule.order === index + 1 ? rule : { ...rule, order: index + 1 }));

export function addRule(rules: DocumentRule[], draft: DocumentRule): DocumentRule[] {
  if (rules.length >= MAX_RULES) return rules;
  const taken = new Set(rules.map((r) => r.code));
  let n = rules.length + 1;
  while (taken.has(`kural${n}`)) n++;
  return renumber([...rules, clean({ ...draft, code: `kural${n}` })]);
}

export const updateRule = (rules: DocumentRule[], code: string, draft: DocumentRule) =>
  rules.map((rule) => (rule.code === code ? clean({ ...draft, code, order: rule.order }) : rule));
export const removeRule = (rules: DocumentRule[], code: string) => renumber(rules.filter((rule) => rule.code !== code));
export const toggleRule = (rules: DocumentRule[], code: string) => rules.map((rule) => (rule.code === code ? { ...rule, enabled: !rule.enabled } : rule));

export function moveRule(rules: DocumentRule[], code: string, by: -1 | 1): DocumentRule[] {
  const sorted = [...rules].sort((a, b) => a.order - b.order);
  const at = sorted.findIndex((rule) => rule.code === code), to = at + by;
  if (at < 0 || to < 0 || to >= sorted.length) return rules;
  [sorted[at], sorted[to]] = [sorted[to], sorted[at]];
  return renumber(sorted);
}

const formatValue = (rule: DocumentRule, field?: RuleField) => {
  const value = rule.value ?? "";
  if (field?.kind === "number" && rule.field !== "lineCount" && rule.field !== "maxLineDiscount" && /^-?\d+(\.\d+)?$/.test(value))
    return `${Number(value).toLocaleString("tr-TR")} ₺`;
  if (rule.field === "maxLineDiscount") return `%${value}`;
  if (field?.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join(".");
  return value;
};

/** Kural cümlesinin parçaları: koşul ve eylem. */
export function sentence(rule: DocumentRule, fields: RuleField[], people: RulePerson[]): { condition: string; action: string } {
  const field = fields.find((f) => f.code === rule.field);
  const condition = rule.always ? "Her zaman"
    : `Eğer ${field?.label ?? rule.field} ${OP_LABELS[rule.op ?? ""] ?? rule.op}${valueless(rule.op) ? "" : ` ${formatValue(rule, field)}`} ise`;
  const action = rule.action === "approval"
    ? `Onay iste: ${rule.approverUserIds.map((id) => people.find((p) => p.id === id)?.displayName ?? "bilinmeyen kişi").join(" veya ")}`
    : `${ACTION_LABELS[rule.action]}: “${rule.message ?? ""}”`;
  return { condition, action };
}
