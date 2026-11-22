import { confirmDialog } from "../confirmDialog";
import type { PageQueryDefinition, WriteResult } from "./usePageQueries";
import { BEFORE_SAVE_TIMEOUT_MESSAGE } from "./pageEvents";

export const PREVIEW_WRITE_WARNING = "Bu taslak önizlemesinde veriler gerçekten değişecek. Devam edilsin mi?";
/** ERP işlem (`operation`) yazmaları önizlemede hiç gönderilmez: onay sorulmadan bu ileti gösterilir. */
export const PREVIEW_ERP_WRITE_BLOCKED = "Önizlemede kayıt yapılmaz; yayımladıktan sonra çalışır.";
/** Önizlemede engellenen yazma: ERP işlem sorgusu (SQL sorgusu önizlemede gerçekten yazar, onayla sorulur). */
export const blockedInPreview = (isPreview: boolean, queries: readonly PageQueryDefinition[]) =>
  isPreview && queries.some((query) => query.operation !== undefined);

export type WriteConfirm = { enabled: boolean; text?: string; title?: string; confirmLabel?: string; tone?: "danger" | "default" };
export type WriteOutcome =
  | { ok: true; affectedRows: number; sonuc?: unknown }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }
  | { ok: false; busy: true };

/**
 * Sorgu eylemi ortak yazma yolu (sorgu düğmesi ve İşlem Çubuğu): tek uçuş, isteğe bağlı onay (önizlemede her zaman,
 * uyarı metniyle ve `danger` tonuyla), sonra yazma. `errorText` hatayı kullanıcı metnine çevirir.
 * `beforeWrite` (kod bileşenlerinin beforeSave olayı) kilit alındıktan sonra, onaydan önce sorulur; iptal yazmayı
 * göndermeden `{ ok: false, error: <mesaj> }` döner. `validate` (istemci giriş doğrulaması) kilitten sonra ve
 * `beforeWrite`'tan önce çalışır; null dışı sonuç da aynı biçimde döner. `afterWrite` başarılı yazmadan sonra çağrılır (hatası yutulur).
 */
export async function runWriteAction(opts: {
  query: PageQueryDefinition; confirm: WriteConfirm; isPreview: boolean;
  write: (query: PageQueryDefinition, confirmWrite: boolean) => Promise<WriteResult>;
  inFlight: { current: boolean };
  errorText?: (cause: unknown) => string;
  /** İstemci giriş doğrulaması: null dışı sonuç yazmayı (beforeWrite, onay ve yazma dahil) göndermeden durdurur. */
  validate?: () => string | null;
  beforeWrite?: (query: PageQueryDefinition) => Promise<{ cancel: true; message: string } | null>;
  afterWrite?: (query: PageQueryDefinition, result: WriteResult) => void;
}): Promise<WriteOutcome> {
  const { query, confirm, isPreview, write, inFlight } = opts;
  if (inFlight.current) return { ok: false, busy: true };
  // ERP yazması önizlemede çalışmaz: yanıltıcı onay sorulmadan ileti hemen döner.
  if (blockedInPreview(isPreview, [query])) return { ok: false, error: PREVIEW_ERP_WRITE_BLOCKED };
  inFlight.current = true;
  try {
    // Doğrulama yalnız kullanıcıya yardımdır (sunucu yine doğrular); beforeWrite'tan ve onaydan önce çalışır.
    const invalid = opts.validate ? opts.validate() : null;
    if (invalid !== null) return { ok: false, error: invalid };
    if (opts.beforeWrite) {
      let verdict: { cancel: true; message: string } | null;
      try { verdict = await opts.beforeWrite(query); } catch { verdict = { cancel: true, message: BEFORE_SAVE_TIMEOUT_MESSAGE }; }
      if (verdict) return { ok: false, error: verdict.message };
    }
    // Önizlemede onay her zaman sorulur (onay kapalı olsa da), çünkü taslak gerçek veriyi değiştirir.
    if (confirm.enabled || isPreview) {
      const configured = confirm.enabled ? confirm.text ?? "" : "";
      const message = isPreview ? [configured, PREVIEW_WRITE_WARNING].filter(Boolean).join(" ") : configured;
      const confirmed = await confirmDialog({
        title: confirm.title ?? "Emin misiniz?", message: message || undefined, confirmLabel: confirm.confirmLabel ?? "Onayla", cancelLabel: "Vazgeç",
        tone: isPreview ? "danger" : confirm.tone ?? "default",
      });
      if (!confirmed) return { ok: false, cancelled: true };
    }
    try {
      const result = await write(query, isPreview);
      if (opts.afterWrite) { try { opts.afterWrite(query, result); } catch { /* olay işleyicisi yazma sonucunu bozmaz */ } }
      return result.sonuc === undefined ? { ok: true, affectedRows: result.affectedRows } : { ok: true, affectedRows: result.affectedRows, sonuc: result.sonuc };
    } catch (cause) {
      const failure = cause as Error & { serverError?: string };
      return { ok: false, error: opts.errorText ? opts.errorText(cause) : failure.serverError || failure.message || "İşlem tamamlanamadı." };
    }
  } finally {
    inFlight.current = false;
  }
}
