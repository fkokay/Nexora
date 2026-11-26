import type { ErpOperation } from "../../platform-tools/erp-src/page-designer/erpOperations";
import { useEffect, useRef, useState } from "react";
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
export type ColumnRow = {
  code: string; label: string; type: string; key: boolean; isNew: boolean;
  longText: boolean; required: boolean;
  /** Form alanı metni; boş: sınır yok. Yalnız Metin türünde anlamlıdır. */
  maxLength: string;
};
export const MAX_LENGTH_LIMIT = 4000;
const newColumn = (code: string, label: string, type: string): ColumnRow =>
  ({ code, label, type, key: false, isNew: false, longText: false, required: false, maxLength: "" });
export const emptyColumn = (): ColumnRow => newColumn("", "", "text");
export const previewColumn = (code: string, label: string, type: string): ColumnRow => ({ ...newColumn(code, label, type), isNew: true });
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
    ? json.columns.filter(isRecord).map(c => {
      const type = text(c.type) || "text";
      return {
        ...newColumn(text(c.code), text(c.label), type), key: c.key === true,
        longText: c.longText === true, required: c.required === true,
        maxLength: typeof c.maxLength === "number" ? String(c.maxLength) : "",
      };
    })
    : [];
}

export function readSource(holder: unknown): { kind: SourceKind; operation: string } {
  if (isRecord(holder) && typeof holder.erpOperation === "string") return { kind: "erp", operation: holder.erpOperation };
  return { kind: "sql", operation: "" };
}

/** Yalnız `{ name, type }` dosyaya gider; deneme değeri formda kalır. */
export const parametersJson = (rows: ParameterRow[]) => rows.map(({ name, type }) => ({ name, type }));
const parsedMaxLength = (raw: string) => (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null);

/** `{ code, label, type }` + yalnız dolu bayraklar dosyaya gider (key, longText, required: true ise; maxLength: doluysa). Uzun metin ve en çok yalnız Metin türünde yazılır; "yeni" işareti formda kalır. */
export const columnsJson = (rows: ColumnRow[]) =>
  rows.map(({ code, label, type, key, longText, required, maxLength }) => {
    const isText = type === "text";
    const limit = isText ? parsedMaxLength(maxLength) : null;
    return {
      code, label, type,
      ...(key ? { key: true } : {}),
      ...(isText && longText ? { longText: true } : {}),
      ...(required ? { required: true } : {}),
      ...(limit !== null ? { maxLength: limit } : {}),
    };
  });

/** "En çok" doluysa 1–4000 arası tam sayı olmalı (yalnız Metin kolonlarında). */
export function validateColumns(rows: ColumnRow[]): string | null {
  for (const row of rows) {
    if (row.type !== "text" || row.maxLength.trim() === "") continue;
    const limit = parsedMaxLength(row.maxLength);
    if (limit === null || limit < 1 || limit > MAX_LENGTH_LIMIT) return `"${row.code || "Kolon"}" için en çok değeri 1 ile ${MAX_LENGTH_LIMIT} arasında bir tam sayı olmalı.`;
  }
  return null;
}

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

export const UNSAVED_CATALOG_EDITS = "Kaydedilmemiş değişiklikler var; devam ederseniz kaybolur.";

/** Açık formda kaydedilmemiş değişiklik varsa formu yeniden kuracak bir işlemden önce sorulur; temiz formda sorulmaz. */
export async function confirmDiscardCatalogEdits(dirty: boolean): Promise<boolean> {
  if (!dirty) return true;
  return confirmDialog({ title: "Kaydedilmemiş değişiklikler", message: UNSAVED_CATALOG_EDITS, tone: "warning", confirmLabel: "Devam et" });
}

/** Formun kaydedilmemiş değişiklik durumu: içerik açılıştaki (ya da son kayıttaki) halinden farklıysa kirlidir. */
export function useDirtyTracking(snapshot: string, onDirtyChange?: (dirty: boolean) => void) {
  const [baseline, setBaseline] = useState(snapshot);
  const dirty = snapshot !== baseline;
  const report = useRef(onDirtyChange);
  report.current = onDirtyChange;
  useEffect(() => { report.current?.(dirty); }, [dirty]);
  useEffect(() => () => report.current?.(false), []);
  return setBaseline;
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
