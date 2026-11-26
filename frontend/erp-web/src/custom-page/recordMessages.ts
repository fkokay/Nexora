// Kayıt yolunun (Aç, kayıt dizisi, ERP yazması) kaynak kayıt iletileri: tek yerde tutulur.

/** Aç: kayıt anahtarının okuması (ör. `kart`) yükleniyor. */
export const RECORD_LOADING = "Kayıt yükleniyor…";
/** Aç: kayıt anahtarının okuması hata verdi ya da boş döndü; pencere seçili kaydı yeni kayıt sanmasın. */
export const RECORD_UNREADABLE = "Kayıt okunamadı";
/** Kayıt dizisi ve ERP yazması: bir kaynak okuması yükleniyor; hiçbir adım başlamaz. */
export const SOURCE_LOADING = "Kaynak kayıt yükleniyor; biraz sonra yeniden deneyin.";
/** Kayıt dizisi: kayıt ya da kaynak okuması hata verdi (veya seçili kayıt okunamadı); hiçbir adım başlamaz. */
export const SOURCE_FAILED = "Kayıt okunamadı; hiçbir değişiklik kaydedilmedi. Kaydı yeniden açıp deneyin.";
/** Kısmi oluşturmadan sonraki yeniden deneme: alanları yazan adımlar (oluştur/güncelle) koşullarıyla atlandı. */
export const CREATED_REOPEN = "Kart oluşturuldu; alan değişiklikleri için kartı yeniden açın.";
/** Kayıt kartı özeti, yeni kayıt kipi: başlığın altındaki satır (taslak 08). */
export const RECORD_UNSAVED_SUBTITLE = "Kaydedilmedi";
