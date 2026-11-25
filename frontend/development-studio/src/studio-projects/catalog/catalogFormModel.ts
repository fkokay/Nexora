import type { ErpOperation } from "../../platform-tools/erp-src/page-designer/erpOperations";
import { confirmDialog } from "../../ui/confirmDialog";
import { entryFiles, type CatalogEntry, type CatalogFile } from "./catalogFiles";

export const VALUE_TYPES = ["text", "int", "decimal", "date", "bool", "guid"] as const;
export const TYPE_LABELS: Record<string, string> = {
  text: "Metin", int: "Tam sayı", decimal: "Ondalık", date: "Tarih", bool: "Evet/Hayır", guid: "Kimlik (guid)",
};

/** Sunucunun ad kuralı (TenantCustomPageQueries.NamePattern); kod dosya yoluna da girdiği için yazmadan önce denetlenir. */
export const CODE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Dosyaları yazar; yazılanları yeni sha'larıyla döndürebilir. `sha256` beklenen (formun açıldığı andaki) sha'dır. */
export type WriteCatalogFiles = (files: CatalogFile[]) => Promise<CatalogFile[] | void>;

export type ParameterRow = { name: string; type: string; trial: string };
export type ColumnRow = { code: string; label: string; type: string; key: boolean; isNew: boolean };
export type SourceKind = "sql" | "erp";

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value : "");

export function readParameters(json: Record<string, unknown>): ParameterRow[] {
  return Array.isArray(json.parameters)
    ? json.parameters.filter(isRecord).map(p => ({ name: text(p.name), type: text(p.type) || "text", trial: "" }))
    : [];
}

export function readColumns(json: Record<string, unknown>): ColumnRow[] {
  return Array.isArray(json.columns)
    ? json.columns.filter(isRecord).map(c => ({ code: text(c.code), label: text(c.label), type: text(c.type) || "text", key: c.key === true, isNew: false }))
    : [];
}

export function readSource(holder: unknown): { kind: SourceKind; operation: string } {
  if (isRecord(holder) && typeof holder.erpOperation === "string") return { kind: "erp", operation: holder.erpOperation };
  return { kind: "sql", operation: "" };
}

/** Yalnız `{ name, type }` dosyaya gider; deneme değeri formda kalır. */
export const parametersJson = (rows: ParameterRow[]) => rows.map(({ name, type }) => ({ name, type }));
/** Yalnız `{ code, label, type, key? }` dosyaya gider; "yeni" işareti formda kalır. */
export const columnsJson = (rows: ColumnRow[]) =>
  rows.map(({ code, label, type, key }) => (key ? { code, label, type, key: true } : { code, label, type }));

/** Deneme değerleri sunucunun beklediği JSON türlerine çevrilir; boş değer null olur. */
export function trialValues(rows: ParameterRow[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const row of rows) {
    const raw = row.trial.trim();
    values[row.name] = raw === "" ? null : row.type === "bool" ? raw === "true" : raw;
  }
  return values;
}

/** Kaynak sorgu ya da gövde eşlemesi isteyen, artık kullanılmayan ve türü uymayan işlemler katalogda seçilemez. */
export const usableOperations = (operations: ErpOperation[] | null, pageKind: string) =>
  (operations ?? []).filter(op => op.pageKind === pageKind && !op.deprecated && !op.sourceOperation && !op.bodyMap);

export function validateEntry(code: string, label: string, isNew: boolean, existingCodes: string[], sourceKind: SourceKind, sql: string, operation: string): string | null {
  if (!label.trim()) return "Görünen ad boş olamaz.";
  if (!CODE_PATTERN.test(code)) return "Kod harf ya da alt çizgiyle başlamalı; yalnız harf, rakam ve alt çizgi içermeli (en fazla 64).";
  if (isNew && existingCodes.some(c => c.toLowerCase() === code.toLowerCase())) return "Bu kod katalogda zaten kullanılıyor.";
  if (sourceKind === "sql" && !sql.trim()) return "SQL boş olamaz.";
  if (sourceKind === "erp" && !operation) return "Bir ERP işlemi seçin.";
  return null;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "İşlem tamamlanamadı.");

/**
 * Önce SQL, sonra JSON yazılır; her dosya ayrı bir yazmadır ve ilk hatada durulur.
 * SQL yazılamazsa JSON hiç yazılmaz, katalog yarım kalmaz. Dönen değer hata metnidir (başarıda null).
 */
export async function saveEntry(
  root: string, entry: CatalogEntry, writeFiles: WriteCatalogFiles, seededShas: Record<string, string>,
): Promise<string | null | "cancelled"> {
  const files = entryFiles(root, entry);
  const ok = await confirmDialog({
    title: "Yapı taşı dosyalara kaydedilsin mi?",
    message: `Şu dosyalar izole çalışma alanına yazılacak. Güncel dosya değişmişse işlem durdurulur. Kod çalıştırılmayacak.\n\n${files.map(f => f.path).join("\n")}`,
    tone: "default",
    confirmLabel: "Kaydet",
  });
  if (!ok) return "cancelled";
  for (const file of files) {
    try {
      // Formun açıldığı andaki sha gönderilir; dosya sonradan değiştiyse sunucu kaydı reddeder.
      const written = await writeFiles([{ ...file, sha256: seededShas[file.path] }]);
      for (const saved of written ?? []) if (saved.sha256) seededShas[saved.path] = saved.sha256;
    } catch (error) {
      return `Kaydedilemedi: ${errorText(error)}`;
    }
  }
  return null;
}
