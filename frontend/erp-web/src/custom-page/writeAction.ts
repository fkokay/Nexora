import { confirmDialog } from "../confirmDialog";
import type { PageQueryDefinition } from "./usePageQueries";

export const PREVIEW_WRITE_WARNING = "Bu taslak önizlemesinde veriler gerçekten değişecek. Devam edilsin mi?";

export type WriteConfirm = { enabled: boolean; text?: string; title?: string; confirmLabel?: string; tone?: "danger" | "default" };
export type WriteOutcome =
  | { ok: true; affectedRows: number }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }
  | { ok: false; busy: true };

/**
 * Sorgu eylemi ortak yazma yolu (sorgu düğmesi ve İşlem Çubuğu): tek uçuş, isteğe bağlı onay (önizlemede her zaman,
 * uyarı metniyle ve `danger` tonuyla), sonra yazma. `errorText` hatayı kullanıcı metnine çevirir.
 */
export async function runWriteAction(opts: {
  query: PageQueryDefinition; confirm: WriteConfirm; isPreview: boolean;
  write: (query: PageQueryDefinition, confirmWrite: boolean) => Promise<{ affectedRows: number }>;
  inFlight: { current: boolean };
  errorText?: (cause: unknown) => string;
}): Promise<WriteOutcome> {
  const { query, confirm, isPreview, write, inFlight } = opts;
  if (inFlight.current) return { ok: false, busy: true };
  inFlight.current = true;
  try {
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
      return { ok: true, affectedRows: result.affectedRows };
    } catch (cause) {
      const failure = cause as Error & { serverError?: string };
      return { ok: false, error: opts.errorText ? opts.errorText(cause) : failure.serverError || failure.message || "İşlem tamamlanamadı." };
    }
  } finally {
    inFlight.current = false;
  }
}
