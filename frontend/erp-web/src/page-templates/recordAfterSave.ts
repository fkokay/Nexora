// Kayıt kartında Kaydet ve Sil başarılı olunca ne olacağı (yalnız kayıt kartı kalıbı; kalıpsız sayfaların sıra sonu değişmez).

export type AfterSave =
  | { kind: "reload" }
  | { kind: "reopen"; param: string; value: string }
  | { kind: "backToOpener"; opener: string }
  | { kind: "clear" };

/**
 * Var olan kayıt yeniden yüklenir. Yeni kayıtta kullanıcı anahtarı yazdıysa kart o anahtarla yeniden açılır (ikinci Kaydet
 * günceller). Anahtar sistemin verdiği bir değerse kartı açan sekmeye dönülür; açan yoksa (doğrudan açıldı) form temizlenir.
 */
export function afterRecordSave(input: { isNew: boolean; keyParam: string | null; typedKey: string | null; opener: string | undefined }): AfterSave {
  if (!input.isNew) return { kind: "reload" };
  const typed = input.typedKey?.trim() ?? "";
  if (typed !== "" && input.keyParam) return { kind: "reopen", param: input.keyParam, value: typed };
  if (input.opener) return { kind: "backToOpener", opener: input.opener };
  return { kind: "clear" };
}

/** Silinen kaydın kartı açan sekmeye döner; açan yoksa kart sekmesi kapanır. */
export function afterRecordDelete(opener: string | undefined): { kind: "backToOpener"; opener: string } | { kind: "close" } {
  return opener ? { kind: "backToOpener", opener } : { kind: "close" };
}

export const RECORD_SAVED_NOTICE = "Kaydedildi.";
export const RECORD_DELETED_NOTICE = "Silindi.";
