# Kayıt formu yapısı (RecordForm)

Bir iş kaydını **oluşturan veya güncelleyen** her ekran bu yapıyı kullanır. Referans uygulama:
`src/customers/components/CustomerCreatePage.tsx` (kapsayıcı tarafı: `src/CustomersPage.tsx`). Görsel referans: onaylı
taslak `docs/design-proposals/erp-design-language/01-liste-ve-kayit-stok.html` (alt bölüm, "Kayıt ekranı").

## Parçalar (`RecordForm.tsx`)

- `RecordFormPage`: sayfanın tamamı.
  - **Başlık**: isteğe bağlı görsel kutusu (`media`, 46px), başlık (18px/650), altında künye satırı: YENİ KAYIT /
    DÜZENLEME etiketi ve `subtitle` (kod için `rf-code`, durum etiketleri için `StatusTag`, kısa özet). Sağda
    `dirty` ("N alan değişti"; `true` ise "Kaydedilmemiş değişiklik var"), `recordNav` ("‹ PgUp · 2 / 23 · PgDn ›")
    ve Vazgeç.
  - Başlığın hemen altında İşlem Çubuğu, varsa hata şeridi.
  - **Gövde**: solda bölüm gezgini (`RecordFormTabs` varsa), ortada kartlar, sağda bağlam paneli (`aside`).
  - **Alt bilgi**: solda kısayollar (Tab sonraki alan · Ctrl+S kaydet · Ctrl+Z geri al yalnızca sayfa Geri Al
    komutunu kaydettiyse · PgUp/PgDn yalnızca `recordNav` varsa · Ctrl+. yalnızca `aside` varsa), sağda `status`.
  - `<form>` etiketini kendisi üretir; içine ayrıca `<form>` koymayın. Modal içindeki formlar için `variant="dialog"`
    (gezgin yerine yatay sekmeler, kısayol satırı yok). Form açıkken İşlem Çubuğu'nun Kaydet komutunu (`Ctrl+S`,
    birincil) kaydeder; "Kaydet ve Yeni" (`Ctrl+F2`) ve "Temizle" İşlemler menüsündedir. `F2` çubuğun Yeni komutudur;
    sayfa kaydeder (kaydedilmemiş değişiklik varsa onay sorarak).
  - **Kaydetme hatası**: tarayıcı doğrulaması geçmezse ya da kapsayıcı kayıttan sonra `error` verirse ekrandaki ilk
    geçersiz alana (`:invalid` / `aria-invalid="true"`) odaklanılır; ekranda yoksa `!` işaretli ilk bölüme geçilir ve
    oradaki ilk geçersiz alana odaklanılır.
  - **Bağlam paneli** (`aside`): 300px, kartlar alt alta. 1280px ve üstünde açık, altında kapalı; `Ctrl+.` açar /
    kapatır.
  - **Kayıtlar arası gezinme** (`recordNav={{ index, total, onPrev, onNext }}`): PgUp / PgDn önceki / sonraki kayıt
    (yazarken ve bir pencere açıkken değil).
- `RecordFormGroup`: tek katman kart (beyaz, 1px çizgi, 8px yarıçap, 12px 14px iç boşluk). Başlık 13px/650, gri bant
  yok; sağında isteğe bağlı `hint` (ör. "* zorunlu alan"). Alanlar doğrudan içine `<label>Etiket<input/></label>`
  olarak yazılır ve üç sütunlu ızgaraya dizilir.
- `RecordFormTabs`: bölümler. Sayfada solda **bölüm gezgini** olarak çizilir: her bölümde `state` (`"done"` ✓,
  `"error"` !, `"empty"` ○; `warning: true` = `"error"`), sağda `count`, altta `completion` verilirse "Kart doluluğu
  %N" çubuğu. `Ctrl+↑/↓` bölümler arasında geçer (yazarken de; bir pencere açıkken değil), yeni bölümün ilk alanına
  odaklanır. Diyalogda yatay sekme şerididir. Yalnızca alanlar tek ekrana rahat sığmıyorsa kullanın.
- `RecordFieldChange({ previous })`: değişen bir alanı sarar; kontrolde 3px sarı sol çizgi, altında
  "Önceki: …". Yalnızca görünümdür.
- `RequiredMark`: zorunlu alan yıldızı; etiket metnini `<span>` içine alın: `<span>Kod <RequiredMark /></span>`.

## Yerleşim sınıfları (`record-form.css`)

- Kart gövdesi üç sütunlu ızgaradır (10px / 14px aralık); etiket 11,5px/500, kontrol 31px, 6px yarıçap. Etiket
  dışındaki her öğe (tablo, araç satırı, açıklama) tam genişliktir; `textarea` içeren alan da tam genişliktir.
- `rf-identity`: kaydı tanımlayan ana alanların kartı ("Kimlik"; `RecordFormGroup bodyClassName="rf-identity"`).
- `rf-columns`: kartları alt alta dizer (eski üç sütunlu kutu düzeni yerine); `rf-columns-wide` geriye dönük kalır.
- `rf-pair`: kart gövdesinde iki alanı ızgaranın iki hücresine koyar. `rf-short`: tek kısa alan.
  `rf-custom-grid`: üçlü alan ızgarası. `rf-field`: etiket olmayan bir öğeyi tek hücre yapar.
- Alan sınıfları: `rf-must` (zorunlu alan; görünüm yıldızla verilir), `rf-num` (sağa hizalı sayı), `rf-mono`
  (kod / IBAN / vergi no), `rf-check` (onay kutulu satır etiketi). Künye satırında kod için `rf-code`.
- Alt bilgi durumu: `rf-status-warning`, `rf-status-notice`, `rf-status-end`.
- Renkler yalnızca `--nx-*` token'larıdır (açık / koyu tema aynı kuralla). `global-components.css`'in `!important`
  alan kuralları temizlenene kadar dosyanın sonunda kayıt formunun değerleri yeterli ağırlıkla yeniden verilir.

## Kurallar

- Alanları, doğrulamaları, API çağrılarını ve kayıt davranışını değiştirmeyin; yalnızca düzeni taşıyın.
- Ekranın başında kaydı tanımlayan alanlar "Kimlik" kartı olur; diğer alanlar anlamlı kartlara ayrılır.
- Kart içine kart koymayın; tuvalde tek katman kart vardır.
- "Kaydet ve Yeni" yalnızca oluşturma modunda ve kapsayıcı `onSaveIntent` verdiğinde görünür; kapsayıcı
  başarılı kayıttan sonra formu temizleyip açık bırakır. "Temizle" için `onReset` verin.
- Yeni Türkçe metinlerin İngilizce karşılığını modülün `src/locales/en/*.ts` sözlüğüne ekleyin.
- `RecordForm.tsx` ve `record-form.css` ortaktır; ekrana özel ihtiyaçları modülün kendi CSS dosyasına yazın.
