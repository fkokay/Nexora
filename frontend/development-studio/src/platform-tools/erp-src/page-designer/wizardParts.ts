import { conditionProblem } from "./conditions";

/**
 * Seçim → ayrıntı (sihirbaz) ekranlarının tasarımcı yardımcıları: Adımlar (`steps`), Kayıt özeti (`recordHeader`), düğmenin
 * "Alana değer ata" eylemi (`setInput` / `assignments`) ve listenin "Satır açılınca" düğmesi (`rowOpenAction`). Saf işlevler;
 * kayıt biçimi sunucudaki şemayla aynıdır.
 */

export const MIN_STEPS = 2;
export const MAX_STEPS = 6;
export const MAX_STEP_LABEL = 40;
export const MAX_ASSIGNMENTS = 8;
export const MAX_ASSIGNMENT_TEMPLATE = 500;
export const MAX_HEADER_FIELDS = 6;
export const MAX_HEADER_BUTTONS = 3;
export const HEADER_FIELD_FORMATS = ["number", "money", "date", "text"] as const;
export type HeaderFieldFormat = typeof HEADER_FIELD_FORMATS[number];
/** "Satır açılınca" düğmesinin olabileceği eylem türleri (kayıt dizisi ve iş akışı olamaz). */
export const ROW_OPEN_ACTION_TYPES = ["setInput", "query", "openDialog", "link", "erpPage", "page"];

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
/** "anahtar=değer" öğesini ilk "=" işaretinden böler (değer boş olabilir ve "=" içerebilir). */
const splitFirst = (entry: string): [string, string] | null => {
  const at = entry.indexOf("=");
  return at < 0 ? null : [entry.slice(0, at), entry.slice(at + 1)];
};

// ---------------------------------------------------------------------------------------------------------------------
// Adımlar
// ---------------------------------------------------------------------------------------------------------------------

export type StepRow = { label: string; when: string };

/** Adım satırları: etiket ve aynı sıradaki etkinlik koşulu (koşul yoksa boş). */
export function parseSteps(props: Record<string, unknown>): StepRow[] {
  const labels = strings(props.steps);
  const when = Array.isArray(props.activeWhen) ? props.activeWhen : [];
  return labels.map((label, index) => ({ label, when: typeof when[index] === "string" ? when[index] as string : "" }));
}

/** Satırların kayıt biçimi: `steps` ve aynı uzunlukta `activeWhen`. */
export function stepsPatch(rows: StepRow[]): { steps: string[]; activeWhen: string[] } {
  return { steps: rows.map((row) => row.label), activeWhen: rows.map((row) => row.when) };
}

/** Etkin adım: koşulu tutan SON adım; hiçbiri tutmuyorsa 0. */
export function activeStepIndex(activeWhen: unknown, holds: (condition: string) => boolean): number {
  const list = Array.isArray(activeWhen) ? activeWhen : [];
  for (let index = list.length - 1; index >= 0; index--) {
    const condition = list[index];
    if (typeof condition === "string" && condition.trim() !== "" && holds(condition)) return index;
  }
  return 0;
}

/** Adımlar bileşeninin kayıt sorunu (sunucu da reddeder); sorun yoksa null. */
export function stepsProblem(props: Record<string, unknown>, label: string, pageNames: string[]): string | null {
  const steps = Array.isArray(props.steps) ? props.steps : [];
  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) return `${label} için ${MIN_STEPS}–${MAX_STEPS} adım olmalıdır.`;
  if (steps.some((step) => typeof step !== "string" || step.trim() === "" || step.length > MAX_STEP_LABEL))
    return `${label}: adım etiketleri 1–${MAX_STEP_LABEL} karakter olmalıdır.`;
  const when = Array.isArray(props.activeWhen) ? props.activeWhen : [];
  if (when.length !== steps.length) return `${label}: her adımın bir etkinlik koşulu olmalıdır ('activeWhen' adım sayısı kadar).`;
  for (const condition of when) {
    if (typeof condition !== "string" || condition.trim() === "") return `${label}: her adımın bir etkinlik koşulu olmalıdır.`;
    const problem = conditionProblem("activeWhen", condition, pageNames);
    if (problem) return problem;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Alana değer ata (setInput)
// ---------------------------------------------------------------------------------------------------------------------

export type Assignment = { inputId: string; template: string };

/** `assignments` öğeleri: "<girişKimliği>=<şablon>" (şablon boşsa giriş temizlenir). */
export function parseAssignments(value: unknown): Assignment[] {
  return strings(value).flatMap((entry) => {
    const parts = splitFirst(entry);
    return parts ? [{ inputId: parts[0].trim(), template: parts[1] }] : [];
  });
}

export const formatAssignment = (assignment: Assignment) => `${assignment.inputId}=${assignment.template}`;

/** Silinen girişlere yazan öğeler kalkar; değişmezse null döner (dokunulmaz). */
export function prunedAssignments(value: unknown, inputIds: ReadonlySet<string>): string[] | null {
  const raw = strings(value);
  const kept = raw.filter((entry) => {
    const parts = splitFirst(entry);
    return !parts || inputIds.has(parts[0].trim());
  });
  return kept.length === raw.length ? null : kept;
}

/** "Alana değer ata" düğmesinin kayıt sorunu; sorun yoksa null. */
export function assignmentsProblem(value: unknown, inputIds: ReadonlySet<string>): string | null {
  const raw = Array.isArray(value) ? value : [];
  if (raw.length < 1 || raw.length > MAX_ASSIGNMENTS) return `Alana değer atayan düğme için 1–${MAX_ASSIGNMENTS} atama gerekli.`;
  for (const entry of raw) {
    const parts = typeof entry === "string" ? splitFirst(entry) : null;
    if (!parts || parts[0].trim() === "") return "Atamalar “giriş=değer” biçiminde olmalıdır.";
    if (!inputIds.has(parts[0].trim())) return `Atamadaki giriş sayfada yok: ${parts[0].trim()}`;
    if (parts[1].length > MAX_ASSIGNMENT_TEMPLATE) return `Atama değeri en çok ${MAX_ASSIGNMENT_TEMPLATE} karakter olabilir.`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Kayıt özeti (recordHeader)
// ---------------------------------------------------------------------------------------------------------------------

export type HeaderField = { label: string; template: string; format: HeaderFieldFormat | ""; unit: string };

const labeled = (value: unknown) => strings(value).flatMap((entry) => { const parts = splitFirst(entry); return parts ? [parts] : []; });

/** Alanlar, biçimleri ve birimleri etikete göre birleştirilir ("Etiket=<şablon>", "Etiket=biçim", "Etiket=<şablon>"). */
export function parseHeaderFields(props: Record<string, unknown>): HeaderField[] {
  const formats = new Map(labeled(props.fieldFormats).map(([label, format]) => [label, format]));
  const units = new Map(labeled(props.fieldUnits).map(([label, unit]) => [label, unit]));
  return labeled(props.fields).map(([label, template]) => {
    const format = formats.get(label) ?? "";
    return { label, template, format: (HEADER_FIELD_FORMATS as readonly string[]).includes(format) ? format as HeaderFieldFormat : "", unit: units.get(label) ?? "" };
  });
}

/** Alan satırlarının kayıt biçimi; boş dizi yazılmaz (özellik silinir). */
export function headerFieldsPatch(rows: HeaderField[]): { fields?: string[]; fieldFormats?: string[]; fieldUnits?: string[] } {
  const fields = rows.map((row) => `${row.label}=${row.template}`);
  const fieldFormats = rows.filter((row) => row.format).map((row) => `${row.label}=${row.format}`);
  const fieldUnits = rows.filter((row) => row.unit).map((row) => `${row.label}=${row.unit}`);
  return { fields: fields.length ? fields : undefined, fieldFormats: fieldFormats.length ? fieldFormats : undefined, fieldUnits: fieldUnits.length ? fieldUnits : undefined };
}

/**
 * Alanın etiketini değiştirir (biçim ve birim satırla taşınır). Etiket kırpılır; boş, "=" içeren, 60 karakterden uzun ya da
 * başka bir satırınkiyle aynı etiket reddedilir (null): biçim ve birim etiketle eşlendiğinden çakışma diğer satırı bozardı.
 */
export function renameHeaderField(rows: HeaderField[], index: number, label: string): HeaderField[] | null {
  const next = label.trim();
  if (next === "" || next.includes("=") || next.length > 60 || rows.some((row, at) => at !== index && row.label === next)) return null;
  return rows.map((row, at) => at === index ? { ...row, label: next } : row);
}

/** Yeni alan için ilk boş etiket: "Alan 1", "Alan 2"… */
export function freeHeaderLabel(rows: HeaderField[]): string {
  for (let number = rows.length + 1; ; number++) { const label = `Alan ${number}`; if (!rows.some((row) => row.label === label)) return label; }
}

/** Kayıt özetinin kayıt sorunu; sorun yoksa null. */
export function recordHeaderProblem(props: Record<string, unknown>, label: string): string | null {
  const fields = Array.isArray(props.fields) ? props.fields : [];
  if (fields.length > MAX_HEADER_FIELDS) return `${label} en çok ${MAX_HEADER_FIELDS} alan gösterebilir.`;
  const seen = new Set<string>();
  for (const entry of fields) {
    const parts = typeof entry === "string" ? splitFirst(entry) : null;
    if (!parts || parts[0].trim() === "") return `${label}: alanlar “Etiket=değer” biçiminde olmalıdır.`;
    if (seen.has(parts[0])) return `${label}: alan etiketleri tekil olmalıdır (${parts[0]}).`;
    seen.add(parts[0]);
  }
  if (Array.isArray(props.buttons) && props.buttons.length > MAX_HEADER_BUTTONS) return `${label} en çok ${MAX_HEADER_BUTTONS} düğme gösterebilir.`;
  return null;
}
